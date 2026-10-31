package app.vivic.remote.core

import app.vivic.remote.BuildConfig
import app.vivic.remote.model.*
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.serialization.json.*
import okhttp3.*
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class ApiFailure(val status: Int, val code: String, override val message: String, val authGeneration: Long = -1) : IOException(message)
data class AuthBinding(val generation: Long, val header: String) { override fun toString() = "AuthBinding(generation=$generation, header=[private])" }

object PairingParser {
    private val codePattern = Regex("^[A-Za-z0-9_-]{12}$")
    fun parse(input: String): String? {
        val text = input.trim()
        if (codePattern.matches(text)) return text
        val url = runCatching { text.toHttpUrl() }.getOrNull() ?: return null
        if (url.scheme != "https" || url.host != "vivic.edsionc.top" || url.port != 443 || url.username.isNotBlank() || url.password.isNotBlank() || url.encodedPath != "/" || url.fragment != null) return null
        if (url.queryParameterNames != setOf("pair") || url.queryParameterValues("pair").size != 1) return null
        return url.queryParameter("pair")?.takeIf { codePattern.matches(it) }
    }
}

class DeviceCookieJar(private val vault: PrivateStore) : CookieJar {
    @Volatile private var cookies = emptyList<Cookie>()
    @Volatile var generation: Long = 0; private set
    private var host = "vivic.edsionc.top"
    fun restore(origin: HttpUrl) {
        host = origin.host
        cookies = runCatching { JsonCodec.parseToJsonElement(vault.peek("cookies") ?: "[]").arr().mapNotNull {
            Cookie.parse(origin, it.jsonPrimitive.content)
        }.filter { allowed(it, origin) } }.getOrDefault(emptyList())
    }
    private fun allowed(cookie: Cookie, url: HttpUrl) = url.host == host && cookie.name == "__Host-vivic_space" && cookie.secure && cookie.httpOnly && cookie.hostOnly
        && cookie.path == "/" && cookie.domain == url.host && cookie.expiresAt > System.currentTimeMillis()
    override fun loadForRequest(url: HttpUrl) = cookies.filter { allowed(it, url) && it.matches(url) }
    fun binding(url: HttpUrl): AuthBinding = synchronized(this) {
        AuthBinding(generation, loadForRequest(url).joinToString("; ") { "${it.name}=${it.value}" })
    }
    override fun saveFromResponse(url: HttpUrl, received: List<Cookie>) {
        if (url.host != host) return
        val relevant = received.filter { it.name == "__Host-vivic_space" }
        if (relevant.isEmpty()) return
        val snapshot = synchronized(this) { cookies = relevant.filter { allowed(it, url) }; generation++; cookies }
        runBlocking(Dispatchers.IO) { vault.put("cookies", JsonArray(snapshot.map { JsonPrimitive(it.toString()) }).toString()) }
    }
    suspend fun clear() { synchronized(this) { cookies = emptyList(); generation++ }; vault.clearSession() }
    fun importCookie(origin: HttpUrl, value: String) {
        val token = value.split(';').map { it.trim() }.firstOrNull { it.startsWith("__Host-vivic_space=") } ?: return
        Cookie.parse(origin, "$token; Path=/; Secure; HttpOnly; Max-Age=2592000")?.let { saveFromResponse(origin, listOf(it)) }
    }
}

class VivicApi(private val vault: SecureVault, val origin: String = "https://vivic.edsionc.top") {
    private val base = origin.toHttpUrl().also { require(it.scheme == "https" && it.host == "vivic.edsionc.top" && it.port == 443 && it.encodedPath == "/") }
    val cookieJar = DeviceCookieJar(vault).apply { restore(base) }
    val publicClient = OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).readTimeout(20, TimeUnit.SECONDS)
        .followRedirects(false).followSslRedirects(false).build()
    private val client = publicClient.newBuilder().cookieJar(CookieJar.NO_COOKIES)
        .dispatcher(Dispatcher().apply { maxRequests = 3; maxRequestsPerHost = 3 }).build()
    val imageClient = publicClient.newBuilder().cookieJar(cookieJar).addInterceptor { chain ->
        val request = chain.request(); chain.proceed(if (request.url.host == base.host) request.newBuilder().header("Origin", origin).build() else request)
    }.build()
    private val slots = Semaphore(3)
    private fun request(path: String): Request.Builder {
        require(path.startsWith("/api/") && !path.contains("..") && !path.contains('#'))
        return Request.Builder().url(origin + path).header("Origin", origin).header("User-Agent", "VivicAndroid/${BuildConfig.VERSION_NAME}")
            .header("Accept", "application/json")
            .apply { vault.peek("account_id")?.let { header("X-Vivic-Account", it) } }
    }
    suspend fun json(path: String, method: String = "GET", body: JsonObject? = null, multipart: RequestBody? = null): JsonObject {
        // Freeze auth before waiting for a transport slot. A queued model-key
        // request must never adopt another account's newly issued Cookie.
        val auth = cookieJar.binding(base)
        return slots.withPermit {
        if (auth.generation != cookieJar.generation) throw ApiFailure(401, "session-changed", "设备连接已改变", auth.generation)
        val content = multipart ?: body?.toString()?.toRequestBody("application/json; charset=utf-8".toMediaType())
        val builder = request(path).method(method, if (method == "GET") null else content ?: "{}".toRequestBody("application/json".toMediaType()))
        if (auth.header.isNotBlank()) builder.header("Cookie", auth.header)
        val req = builder.build()
        val call = client.newBuilder().readTimeout(if (path.contains("/models/")) 185 else 25, TimeUnit.SECONDS).build().newCall(req)
        suspendCancellableCoroutine { continuation ->
            continuation.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    if (continuation.isActive) continuation.resumeWithException(ApiFailure(0, "network", "网络连接暂不可用，请稍后重试", auth.generation))
                }
                override fun onResponse(call: Call, response: Response) {
                    response.use {
                        try {
                            if (auth.generation == cookieJar.generation) cookieJar.saveFromResponse(req.url, Cookie.parseAll(req.url, response.headers))
                            val stream = response.body.byteStream(); val output = ByteArrayOutputStream(); val buffer = ByteArray(8192)
                            val limit = if (path.contains("/models/speech")) 96 * 1024 * 1024 else 16 * 1024 * 1024
                            while (true) {
                                val size = stream.read(buffer); if (size < 0) break
                                if (!continuation.isActive) return
                                if (output.size() + size > limit) throw ApiFailure(413, "response-limit", "返回内容过大，请在电脑上查看")
                                output.write(buffer, 0, size)
                            }
                            val data = runCatching { JsonCodec.parseToJsonElement(output.toString("UTF-8")).obj() }.getOrElse { throw ApiFailure(response.code, "invalid-response", "服务暂时不可用，请稍后重试") }
                            if (!response.isSuccessful) throw ApiFailure(response.code, data.text("code"), data.text("message").ifBlank { data.text("error", "本次操作未完成，请稍后重试") })
                            if (continuation.isActive) continuation.resume(data)
                        } catch (e: Exception) {
                            if (continuation.isActive) continuation.resumeWithException(if (e is ApiFailure) ApiFailure(e.status, e.code, e.message, auth.generation)
                                else ApiFailure(0, "network", "网络连接暂不可用，请稍后重试", auth.generation))
                        }
                    }
                }
            })
        }
    }
    }
    fun events(): Flow<JsonObject> = callbackFlow {
        slots.acquire()
        val auth = cookieJar.binding(base)
        val builder = request("/api/space/events").header("Accept", "text/event-stream")
        if (auth.header.isNotBlank()) builder.header("Cookie", auth.header)
        val call = client.newBuilder().readTimeout(40, TimeUnit.SECONDS).build().newCall(builder.build())
        call.enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) { close(ApiFailure(0, "events-disconnected", "同步连接已中断")) }
            override fun onResponse(call: Call, response: Response) {
                response.use {
                    if (!response.isSuccessful) { close(ApiFailure(response.code, "events-unavailable", "同步连接暂不可用")); return }
                    try {
                        val source = response.body.source(); val data = StringBuilder()
                        while (!call.isCanceled()) {
                            val line = source.readUtf8Line() ?: break
                            if (line.isBlank()) {
                                if (data.isNotEmpty()) runCatching { JsonCodec.parseToJsonElement(data.toString()).obj() }.getOrNull()?.let { trySend(it) }
                                data.clear()
                            } else if (line.startsWith("data:")) {
                                if (data.length > 64 * 1024) break
                                data.append(line.removePrefix("data:").trim()).append('\n')
                            }
                        }
                        close()
                    } catch (_: IOException) { close() }
                }
            }
        })
        awaitClose { call.cancel(); slots.release() }
    }
    suspend fun session() = Session.from(json("/api/space/session"))
    suspend fun claim(code: String, name: String) = Session.from(json("/api/space/pair/claim", "POST", jsonObject("code" to code, "deviceName" to name)))
    suspend fun login(username: String, password: String, name: String) = Session.from(json("/api/space/login", "POST", jsonObject("username" to username, "password" to password, "deviceName" to name)))
    suspend fun logout() { try { json("/api/space/logout", "POST") } finally { cookieJar.clear() } }
    suspend fun devices() = json("/api/space/devices").arrayAt("devices").map { it.obj().let { d -> ConnectedDevice(d.text("id"), d.text("name", "设备"), d.flag("current")) } }
    suspend fun revokeDevice(id: String) { json("/api/space/devices/$id", "DELETE") }
    suspend fun providers(): ProviderState {
        val model = json("/api/providers/status"); val voice = json("/api/space/models/status")
        fun connected(name: String) = model.arrayAt("providers").any { it.obj().text("name") == name && it.obj().flag("connected") }
        return ProviderState(connected("stepfun"), model.objectAt("deepseek").flag("connected") || connected("deepseek"), voice.flag("configured"))
    }
    suspend fun connectModel(provider: String, key: String) {
        require(provider in setOf("stepfun", "deepseek"))
        val response = json("/api/credentials/$provider/validate", "POST", jsonObject("apiKey" to key))
        if (!response.flag("connected")) throw ApiFailure(400, "provider-rejected", response.text("error", "模型连接未完成"))
    }
    suspend fun disconnectModel(provider: String) { require(provider in setOf("stepfun", "deepseek")); json("/api/credentials/$provider/disconnect", "POST") }
    suspend fun transcribe(file: File): String {
        val body = MultipartBody.Builder().setType(MultipartBody.FORM).addFormDataPart("file", "voice.m4a", file.asRequestBody("audio/mp4".toMediaType())).build()
        return json("/api/space/models/transcribe", "POST", multipart = body).text("text")
    }
    suspend fun speech(text: String) = json("/api/space/models/speech", "POST", jsonObject("text" to text.take(2400))).arrayAt("segments")
    suspend fun display(command: String, cardId: String? = null, spaceId: String? = null): DisplayState {
        val data = json("/api/space/display/commands", "POST", jsonObject("type" to command, "cardId" to cardId, "spaceId" to spaceId))
        val state = data.objectAt("display"); return DisplayState(state.flag("online"), state.flag("sleeping"))
    }
}

interface WorkspaceBackend {
    suspend fun spaces(): List<SpaceSummary>
    suspend fun snapshot(id: String): Snapshot
    suspend fun command(id: String, version: Long, command: JsonObject): Snapshot
    suspend fun send(id: String, version: Long, text: String, requestId: String, continuation: String? = null): TaskResult
    suspend fun task(id: String, taskId: String): TaskResult
    suspend fun cancel(id: String, taskId: String): TaskResult
    suspend fun definitions(): List<JsonObject>
}
class NetworkBackend(private val api: VivicApi) : WorkspaceBackend {
    override suspend fun spaces() = api.json("/api/space/spaces").arrayAt("spaces").map { SpaceSummary.from(it.obj()) }
    override suspend fun snapshot(id: String) = Snapshot.from(api.json("/api/space/native/spaces/$id"))
    private suspend fun projected(id: String, result: JsonObject): TaskResult {
        val task = TaskResult.from(result)
        return task.copy(snapshot = snapshot(id))
    }
    override suspend fun command(id: String, version: Long, command: JsonObject): Snapshot {
        val requestId = UUID.randomUUID().toString()
        return try { api.json("/api/space/spaces/$id/commands", "POST",
            jsonObject("requestId" to requestId, "expectedVersion" to version, "command" to command)); snapshot(id) }
        catch (error: ApiFailure) {
            if (error.status != 0) throw error
            // A missing response is not a rejected write. Query the original receipt, never replay the command.
            try { api.json("/api/space/spaces/$id/commands/$requestId"); snapshot(id) }
            catch (lookup: ApiFailure) { if (lookup.status == 401) throw lookup; throw ApiFailure(0, "outcome-unknown", "操作结果还未确认，请联网后刷新工作空间") }
        }
    }
    override suspend fun send(id: String, version: Long, text: String, requestId: String, continuation: String?) = projected(id, api.json("/api/space/spaces/$id/tasks", "POST",
        jsonObject("requestId" to requestId, "expectedVersion" to version, "text" to text, "continuationTaskId" to continuation)))
    override suspend fun task(id: String, taskId: String) = projected(id, api.json("/api/space/spaces/$id/tasks/$taskId"))
    override suspend fun cancel(id: String, taskId: String) = projected(id, api.json("/api/space/spaces/$id/tasks/$taskId/cancel", "POST"))
    override suspend fun definitions() = api.json("/api/space/cards").arrayAt("definitions").map { it.obj() }
}
