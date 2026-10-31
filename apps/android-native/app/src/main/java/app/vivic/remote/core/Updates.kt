package app.vivic.remote.core

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import app.vivic.remote.BuildConfig
import app.vivic.remote.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

data class UpdateInfo(val version: String, val code: Long, val url: String, val sha256: String, val size: Long,
    val notes: String, val mandatory: Boolean) {
    companion object {
        fun parse(value: kotlinx.serialization.json.JsonObject, installedCode: Long): UpdateInfo? {
            if (value.number("schemaVersion").toInt() != 1) return null
            val item = value.objectAt("stable").objectAt("android"); val code = item.number("versionCode").toLong()
            val url = item.text("url").toHttpUrlOrNull() ?: return null
            val hash = item.text("sha256"); val version = item.text("version"); val bytes = item.number("size").toLong()
            if (code <= installedCode || !Regex("[A-Za-z0-9.-]{1,50}").matches(version) || !Regex("[a-fA-F0-9]{64}").matches(hash)
                || bytes !in 1..200L * 1024 * 1024 || url.scheme != "https" || url.host != "vivic.edsionc.top" || url.port != 443
                || url.username.isNotBlank() || url.password.isNotBlank() || !url.encodedPath.startsWith("/downloads/")) return null
            return UpdateInfo(version, code, url.toString(), hash.lowercase(), bytes, item.text("notes"), installedCode < item.number("minSupportedVersionCode").toLong())
        }
    }
}

class UpdateManager(private val context: Context, client: OkHttpClient) {
    private val http = client.newBuilder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(15, TimeUnit.SECONDS).build()
    suspend fun check(): UpdateInfo? = withContext(Dispatchers.IO) {
        http.newCall(Request.Builder().url("https://vivic.edsionc.top/downloads/android/latest.json").header("Cache-Control", "no-store").build()).execute().use { response ->
            if (!response.isSuccessful) throw ApiFailure(response.code, "update-unavailable", "暂时无法检查更新")
            val text = response.body.string(); if (text.length > 65536) return@withContext null
            UpdateInfo.parse(JsonCodec.parseToJsonElement(text).obj(), BuildConfig.VERSION_CODE.toLong())
        }
    }
    suspend fun download(update: UpdateInfo, progress: (Float) -> Unit): File = withContext(Dispatchers.IO) {
        val directory = File(context.cacheDir, "updates").apply { mkdirs() }
        directory.listFiles()?.filter { it.isFile && it.name.startsWith("Vivic-") }?.forEach { it.delete() }
        val file = File(directory, "Vivic-${update.version}.apk")
        require(file.canonicalFile.parentFile == directory.canonicalFile)
        try {
            http.newCall(Request.Builder().url(update.url).build()).execute().use { response ->
                if (!response.isSuccessful) throw ApiFailure(response.code, "download-failed", "更新下载未完成，请稍后重试")
                val digest = MessageDigest.getInstance("SHA-256"); var total = 0L
                response.body.byteStream().use { input -> file.outputStream().use { output ->
                    val buffer = ByteArray(16384)
                    while (true) { val size = input.read(buffer); if (size < 0) break
                        total += size; if (total > 200L * 1024 * 1024 || total > update.size) throw ApiFailure(413, "update-size", "下载文件大小不正确")
                        digest.update(buffer, 0, size); output.write(buffer, 0, size); progress((total.toFloat() / update.size).coerceIn(0f, 1f))
                    }
                } }
                if (total != update.size || digest.digest().joinToString("") { "%02x".format(it) } != update.sha256)
                    throw ApiFailure(400, "update-hash", "下载文件校验失败，请重新下载")
            }
            verifyPackage(file, update.code)
            file
        } catch (error: Exception) { file.delete(); throw error }
    }
    @Suppress("DEPRECATION")
    private fun verifyPackage(file: File, expectedCode: Long) {
        val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
        val downloaded = context.packageManager.getPackageArchiveInfo(file.absolutePath, flags)
            ?: throw ApiFailure(400, "invalid-apk", "更新文件不是有效的安装包")
        val current = context.packageManager.getPackageInfo(context.packageName, flags)
        val code = if (Build.VERSION.SDK_INT >= 28) downloaded.longVersionCode else downloaded.versionCode.toLong()
        val incoming = if (Build.VERSION.SDK_INT >= 28) downloaded.signingInfo?.apkContentsSigners?.toList() else downloaded.signatures?.toList()
        val existing = if (Build.VERSION.SDK_INT >= 28) current.signingInfo?.apkContentsSigners?.toList() else current.signatures?.toList()
        if (downloaded.packageName != context.packageName || code != expectedCode || incoming.isNullOrEmpty() || incoming != existing)
            throw ApiFailure(400, "update-signature", "更新文件签名不一致，已停止安装")
    }
    companion object {
        fun install(context: Context, path: String): Boolean {
            if (!context.packageManager.canRequestPackageInstalls()) {
                context.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, android.net.Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return false
            }
            val file = File(path)
            val expected = File(context.cacheDir, "updates").canonicalFile
            require(file.canonicalFile.parentFile == expected && file.extension == "apk")
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            context.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION))
            return true
        }
    }
}
