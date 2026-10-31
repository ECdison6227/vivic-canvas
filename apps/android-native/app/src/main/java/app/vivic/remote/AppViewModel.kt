package app.vivic.remote

import android.app.Application
import android.os.Build
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.vivic.remote.core.*
import app.vivic.remote.model.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.serialization.json.*
import okhttp3.HttpUrl.Companion.toHttpUrl
import java.util.UUID

data class AppState(
    val initializing: Boolean = true, val session: Session? = null, val snapshot: Snapshot? = null,
    val spaces: List<SpaceSummary> = emptyList(), val messages: List<ChatMessage> = emptyList(), val input: String = "",
    val page: Int = 0, val theme: String = "system", val voiceMode: String = "voice", val demo: Boolean = false,
    val authBusy: Boolean = false, val commandBusy: Boolean = false, val activeTask: String? = null,
    val refreshing: Boolean = false, val connectionSuccess: Boolean = false,
    val transcribing: Boolean = false, val recording: Boolean = false, val dictating: Boolean = false, val amplitude: Float = 0f,
    val notice: Notice? = null, val sheet: String? = null, val devices: List<ConnectedDevice> = emptyList(),
    val providers: ProviderState = ProviderState(), val modelBusy: String? = null,
    val definitions: List<JsonObject> = emptyList(), val focusedCard: String? = null, val focusNonce: Long = 0,
    val newCardIds: Set<String> = emptySet(), val replyPreview: String? = null,
    val display: DisplayState = DisplayState(), val displayBusy: Boolean = false,
    val updating: Boolean = false, val update: UpdateInfo? = null, val downloadProgress: Float? = null, val installPath: String? = null,
) { val busy get() = activeTask != null || transcribing }

class AppViewModel(application: Application) : AndroidViewModel(application) {
    private val mutable = MutableStateFlow(AppState())
    val state: StateFlow<AppState> = mutable.asStateFlow()
    private val vault = SecureVault(application)
    lateinit var api: VivicApi; private set
    private lateinit var network: NetworkBackend
    private val demoBackend = DemoBackend()
    private val backend: WorkspaceBackend get() = if (state.value.demo) demoBackend else network
    private val recorder = VoiceRecorder(application)
    private val tts = TtsPlayer(application)
    private var syncJob: Job? = null; private var eventsJob: Job? = null; private var taskJob: Job? = null
    private var recordJob: Job? = null; private var noticeJob: Job? = null
    private var foreground = true; private var eventConnected = false; private var continuation: String? = null
    private var taskSpace = ""; private var speakReply = false
    private var selectedId: String? = null
    private var lastUpdateCheck = 0L
    private var sessionEpoch = 0L
    init {
        viewModelScope.launch {
            withContext(Dispatchers.IO) { vault.load(); api = VivicApi(vault); network = NetworkBackend(api) }
            if (vault.peek("cookies").isNullOrBlank()) {
                val legacy = withContext(Dispatchers.Main) { android.webkit.CookieManager.getInstance().getCookie(api.origin) }
                if (!legacy.isNullOrBlank()) withContext(Dispatchers.IO) { api.cookieJar.importCookie(api.origin.toHttpUrl(), legacy) }
            }
            mutable.update { it.copy(theme = vault.peek("theme") ?: "system", voiceMode = vault.peek("voice_mode") ?: "voice") }
            try {
                val session = api.session()
                if (session.authenticated) authenticated(session) else api.cookieJar.clear()
            } catch (error: Exception) {
                val cached = vault.peek("account_id")
                if (!cached.isNullOrBlank() && !vault.peek("cookies").isNullOrBlank())
                    authenticated(Session(true, cached, vault.peek("account_name") ?: "", "", ""))
                notify("暂时无法连接 Vivic，请检查网络")
            } finally { mutable.update { it.copy(initializing = false) } }
            delay(8000); checkUpdate(silent = true)
        }
    }
    fun notify(text: String, undo: Boolean = false) {
        val notice = Notice(System.nanoTime(), text, undo); mutable.update { it.copy(notice = notice) }
        noticeJob?.cancel(); noticeJob = viewModelScope.launch { delay(5000); if (state.value.notice?.id == notice.id) dismissNotice() }
    }
    fun dismissNotice() { mutable.update { it.copy(notice = null) } }
    private fun handle(error: Exception) {
        if (error is CancellationException) return
        if (error is ApiFailure && error.status == 401 && error.authGeneration >= 0 && error.authGeneration != api.cookieJar.generation) return
        if (error is ApiFailure && error.status == 401 && state.value.session != null) {
            sessionEpoch++
            viewModelScope.launch { api.cookieJar.clear(); stopSync(); mutable.update { AppState(initializing = false, theme = it.theme, voiceMode = it.voiceMode) }; notify("登录已过期，请重新连接") }
        } else notify(error.message?.take(160) ?: "操作未完成，请稍后重试")
    }
    fun setInput(value: String) { if (value.length <= 500) mutable.update { it.copy(input = value) } else notify("每条指令最多500字") }
    fun setPage(page: Int) { mutable.update { it.copy(page = page) } }
    fun sheet(value: String?) {
        mutable.update { it.copy(sheet = value) }
        if (value == "settings" && !state.value.demo) viewModelScope.launch {
            val epoch = sessionEpoch
            runCatching { api.devices() }.onSuccess { devices -> if (epoch == sessionEpoch) mutable.update { it.copy(devices = devices) } }
            refreshProviders()
        }
    }
    fun claim(input: String) {
        val code = PairingParser.parse(input) ?: run { notify("这不是 Vivic 的连接码"); return }
        if (state.value.authBusy) return
        viewModelScope.launch {
            mutable.update { it.copy(authBusy = true) }
            try { api.claim(code, deviceName()); connected(api.session()) }
            catch (error: Exception) {
                if (error is ApiFailure && error.code == "pair-invalid") notify("二维码已过期，请在电脑上刷新") else handle(error)
            } finally { mutable.update { it.copy(authBusy = false) } }
        }
    }
    fun login(username: String, password: String) {
        if (username.isBlank() || password.isBlank() || state.value.authBusy) return
        viewModelScope.launch {
            mutable.update { it.copy(authBusy = true) }
            try { api.login(username.trim(), password, deviceName()); connected(api.session()) }
            catch (error: Exception) { handle(error) } finally { mutable.update { it.copy(authBusy = false) } }
        }
    }
    private fun deviceName() = "${Build.MANUFACTURER} ${Build.MODEL}".trim()
    private suspend fun connected(session: Session) {
        if (!session.authenticated || session.userId.isBlank()) throw ApiFailure(401, "session-required", "连接未完成，请重试")
        mutable.update { it.copy(connectionSuccess = true, sheet = null) }; delay(1100)
        try { authenticated(session) } finally { mutable.update { it.copy(connectionSuccess = false) } }
    }
    private suspend fun authenticated(session: Session) {
        if (!session.authenticated || session.userId.isBlank()) throw ApiFailure(401, "session-required", "连接未完成，请重试")
        if (session.userId != state.value.session?.userId) sessionEpoch++
        vault.put("account_id", session.userId); vault.put("account_name", session.username)
        mutable.update { it.copy(session = session, sheet = null) }
        try { loadSpaces() } catch (error: Exception) { handle(error) }
        startSync(); viewModelScope.launch { ensureModels() }
    }
    private suspend fun loadSpaces() {
        val epoch = sessionEpoch; val source = backend
        val spaces = source.spaces(); if (epoch != sessionEpoch) return; mutable.update { it.copy(spaces = spaces) }
        val current = selectedId?.takeIf { id -> spaces.any { it.id == id } }
            ?: vault.peek("last_space")?.takeIf { id -> spaces.any { it.id == id } } ?: spaces.firstOrNull()?.id
        if (current != null) {
            selectedId = current; accept(source.snapshot(current))
            val definitions = source.definitions(); if (epoch == sessionEpoch) mutable.update { it.copy(definitions = definitions) }
        }
    }
    fun chooseSpace(id: String) {
        if (state.value.busy) { notify("请先等待当前指令完成"); return }
        viewModelScope.launch {
            try { selectedId = id; mutable.update { it.copy(snapshot = null, sheet = null, messages = emptyList()) }; continuation = null
                accept(backend.snapshot(id)); vault.put("last_space", id); startSync() }
            catch (error: Exception) { handle(error) }
        }
    }
    private fun accept(snapshot: Snapshot) {
        if (selectedId != snapshot.space.id) return
        val previous = state.value.snapshot
        if (previous != null && previous.version > snapshot.version) return
        val added = if (previous == null) emptySet() else snapshot.cards.map { it.id }.toSet() - previous.cards.map { it.id }.toSet()
        mutable.update { it.copy(snapshot = snapshot, spaces = snapshot.spaces, newCardIds = it.newCardIds + added) }
        if (added.isNotEmpty()) viewModelScope.launch { delay(1500); mutable.update { it.copy(newCardIds = it.newCardIds - added) } }
    }
    fun refresh(showProgress: Boolean = false) { if (!::network.isInitialized || state.value.session == null) return; viewModelScope.launch {
        if (showProgress) mutable.update { it.copy(refreshing = true) }
        try { selectedId?.let { accept(backend.snapshot(it)) } ?: loadSpaces() } catch (error: Exception) { handle(error) }
        finally { if (showProgress) mutable.update { it.copy(refreshing = false) } }
    } }
    private fun stopSync() { syncJob?.cancel(); eventsJob?.cancel(); eventConnected = false }
    private fun startSync() {
        stopSync()
        if (!foreground || state.value.session == null) return
        syncJob = viewModelScope.launch {
            while (isActive) {
                try { selectedId?.let { accept(backend.snapshot(it)) } ?: loadSpaces() } catch (error: Exception) { if (error is ApiFailure && error.status == 401) handle(error) }
                delay(if (eventConnected) 60_000 else if (state.value.page == 1) 12_000 else 30_000)
            }
        }
        if (!state.value.demo) eventsJob = viewModelScope.launch {
            while (isActive) {
                try { api.events().collect { event ->
                    eventConnected = true
                    if (event.text("type") == "ready" || event.text("type") == "space.changed" && event.text("spaceId") == selectedId) refresh()
                    if (event.text("type") == "display.status") mutable.update { it.copy(display = DisplayState(event.flag("online"), event.flag("sleeping"))) }
                } } catch (_: Exception) { eventConnected = false }
                delay(15_000)
            }
        }
    }
    fun foreground(value: Boolean) {
        foreground = value
        if (!::api.isInitialized) return
        if (value) { startSync(); viewModelScope.launch { ensureModels() }; if (System.currentTimeMillis() - lastUpdateCheck > 30 * 60_000) checkUpdate(silent = true) }
        else { stopSync(); tts.stop(); if (state.value.recording) stopRecording(cancel = true) }
    }
    private suspend fun refreshProviders() { val epoch = sessionEpoch; try { val providers = api.providers(); if (epoch == sessionEpoch) mutable.update { it.copy(providers = providers) } } catch (_: Exception) {} }
    private suspend fun ensureModels() {
        if (state.value.demo) return
        val account = state.value.session?.userId ?: return
        val epoch = sessionEpoch
        try {
            var providers = api.providers()
            if (epoch != sessionEpoch) return
            for (provider in listOf("stepfun", "deepseek")) {
                if (epoch != sessionEpoch || state.value.session?.userId != account) return
                val connected = if (provider == "stepfun") providers.stepfun else providers.deepseek
                val saved = vault.peek("model:$account:$provider")
                if (!connected && !saved.isNullOrBlank()) runCatching { api.connectModel(provider, saved) }
            }
            providers = api.providers(); if (epoch == sessionEpoch) mutable.update { it.copy(providers = providers) }
        } catch (_: Exception) { /* The task route still supports local commands. */ }
    }
    fun connectModel(provider: String, key: String) {
        val account = state.value.session?.userId ?: return
        val epoch = sessionEpoch
        if (key.isBlank() || state.value.modelBusy != null || state.value.busy) return
        viewModelScope.launch {
            mutable.update { it.copy(modelBusy = provider) }
            try { api.connectModel(provider, key.trim()); if (epoch == sessionEpoch) { vault.put("model:$account:$provider", key.trim()); notify("模型已连接") } }
            catch (error: Exception) { if (epoch == sessionEpoch) { vault.put("model:$account:$provider", null); handle(error) } }
            finally { if (epoch == sessionEpoch) { refreshProviders(); mutable.update { it.copy(modelBusy = null) } } }
        }
    }
    fun disconnectModel(provider: String) { val epoch = sessionEpoch; val account = state.value.session?.userId ?: return; viewModelScope.launch {
        try { api.disconnectModel(provider); if (epoch == sessionEpoch) { vault.put("model:$account:$provider", null); refreshProviders() } }
        catch (error: Exception) { if (epoch == sessionEpoch) handle(error) }
    } }
    fun send(text: String = state.value.input, fromVoice: Boolean = false) {
        val value = text.trim(); val snapshot = state.value.snapshot ?: run { notify("正在连接工作空间，请稍后重试"); return }
        if (value.isBlank() || value.length > 500 || state.value.busy) return
        tts.stop(); val requestId = UUID.randomUUID().toString(); taskSpace = snapshot.space.id
        speakReply = !state.value.demo && (state.value.voiceMode == "all" || fromVoice && state.value.voiceMode == "voice")
        if (speakReply) tts.stall(viewModelScope)
        val user = ChatMessage(UUID.randomUUID().toString(), true, value)
        mutable.update { it.copy(input = "", activeTask = requestId, messages = it.messages + user + ChatMessage(requestId, false, "", "thinking")) }
        taskJob = viewModelScope.launch {
            try {
                if (!state.value.demo) ensureModels()
                val result = try { backend.send(taskSpace, snapshot.version, value, requestId, continuation) }
                catch (error: ApiFailure) {
                    if (error.status == 0 || error.code == "request-id-conflict") {
                        notify("正在确认指令状态…"); null
                    } else throw error
                }
                pollTask(requestId, value, snapshot, result)
            } catch (error: Exception) {
                if (error is CancellationException) return@launch
                finishMessage(requestId, error.message ?: "本次指令未完成", "failed", emptyList(), null)
                mutable.update { it.copy(activeTask = null) }; handle(error)
            }
        }
    }
    private suspend fun pollTask(id: String, text: String, before: Snapshot, initial: TaskResult?) {
        val started = System.currentTimeMillis(); var result = initial
        while (currentCoroutineContext().isActive && System.currentTimeMillis() - started <= 185_000) {
            if (!foreground) { delay(500); continue }
            if (result != null) {
                accept(result.snapshot)
                val task = result.task
                if (task.terminal) {
                    continuation = task.id.takeIf { task.status == "awaiting_clarification" }
                    val retry = text.takeIf { task.status == "failed" && task.createdCardIds.isEmpty() && result!!.snapshot.version == before.version }
                    finishMessage(id, task.message, task.status, (task.createdCardIds + listOfNotNull(task.focusCardId)).distinct(), retry)
                    mutable.update { it.copy(activeTask = null, replyPreview = if (it.page == 1) task.message else null) }
                    if (speakReply && task.status in listOf("succeeded", "awaiting_clarification")) tts.speak(viewModelScope, api, task.message) else tts.stop()
                    if (state.value.page == 1 && task.focusCardId != null) focus(task.focusCardId, switchPage = false)
                    refresh(); return
                }
            }
            delay(if (System.currentTimeMillis() - started < 10_000) 1000 else 2000)
            try { result = backend.task(taskSpace, id) }
            catch (error: ApiFailure) { if (error.status == 401) throw error; result = null }
        }
        finishMessage(id, "还在处理，可以稍后在工作空间查看", "unknown", emptyList(), null)
        mutable.update { it.copy(activeTask = null) }; tts.stop()
    }
    private fun finishMessage(id: String, text: String, status: String, cards: List<String>, retry: String?) {
        mutable.update { it.copy(messages = it.messages.map { message -> if (message.id == id) message.copy(text = text, state = status, cardIds = cards, originalText = retry) else message }) }
    }
    fun stopTask() {
        val id = state.value.activeTask ?: return
        viewModelScope.launch {
            try { val result = backend.cancel(taskSpace, id); taskJob?.cancel(); accept(result.snapshot)
                finishMessage(id, result.task.message, result.task.status, result.task.createdCardIds, null); mutable.update { it.copy(activeTask = null) }; tts.stop() }
            catch (error: Exception) { handle(error) }
        }
    }
    fun newConversation() {
        if (state.value.busy) { notify("请先停止当前指令"); return }
        tts.stop(); continuation = null; mutable.update { it.copy(messages = emptyList(), replyPreview = null, input = "") }
    }
    fun focus(id: String, switchPage: Boolean = true) { mutable.update { it.copy(page = if (switchPage) 1 else it.page, focusedCard = id, focusNonce = System.nanoTime(), replyPreview = null) } }
    fun dismissPreview() { mutable.update { it.copy(replyPreview = null) } }
    fun cardCommand(command: JsonObject) {
        val before = state.value.snapshot ?: return
        if (state.value.commandBusy) return
        val target = command.text("cardId")
        val optimistic = when (command.text("type")) {
            "card.delete" -> before.copy(cards = before.cards.filter { it.id != target })
            "card.pin" -> before.copy(cards = before.cards.map { if (it.id != target) it else CardRecord.from(JsonObject(it.raw + ("layout" to JsonObject(it.layout + ("pinned" to JsonPrimitive(command.flag("pinned")))))), 0) })
            "card.update" -> before.copy(cards = before.cards.map { if (it.id != target) it else CardRecord.from(JsonObject(it.raw + ("displayProps" to JsonObject(it.props + command.objectAt("displayProps")))), 0) })
            else -> before
        }
        mutable.update { it.copy(snapshot = optimistic, commandBusy = true) }
        viewModelScope.launch {
            try { accept(backend.command(before.space.id, before.version, command)); if (command.text("type") == "card.delete") notify("已删除", undo = true) }
            catch (error: Exception) {
                if (error is ApiFailure && error.status in 400..499) mutable.update { it.copy(snapshot = before) }
                handle(error); refresh()
            } finally { mutable.update { it.copy(commandBusy = false) } }
        }
    }
    fun undo() { dismissNotice(); cardCommand(jsonObject("type" to "history.undo")) }
    fun toggleTodo(card: CardRecord, itemId: String) {
        val items = card.props.arrayAt("items").map { item -> val value = item.obj(); if (value.text("id") != itemId) item else JsonObject(value + ("done" to JsonPrimitive(!value.flag("done")))) }
        cardCommand(jsonObject("type" to "card.update", "cardId" to card.id, "displayProps" to jsonObject("items" to JsonArray(items))))
    }
    fun startRecording(dictation: Boolean = false) {
        if (state.value.demo) { notify("演示模式请用文字输入"); return }
        if (state.value.busy || state.value.recording) return
        tts.stop()
        try {
            recorder.start(); mutable.update { it.copy(recording = true, dictating = dictation) }
            recordJob = viewModelScope.launch { val started = System.currentTimeMillis(); while (isActive && System.currentTimeMillis() - started < 58_500) {
                mutable.update { it.copy(amplitude = recorder.amplitude()) }; delay(60)
            }; stopRecording(cancel = false) }
        } catch (_: Exception) { notify("录音未能启动，请检查麦克风权限") }
    }
    fun stopRecording(cancel: Boolean) {
        if (!state.value.recording) return
        val dictation = state.value.dictating; recordJob?.cancel(); recordJob = null
        val file = recorder.stop(cancel); mutable.update { it.copy(recording = false, dictating = false, amplitude = 0f) }
        if (file == null) { if (!cancel) notify("没有听清，请稍后重试"); return }
        viewModelScope.launch {
            mutable.update { it.copy(transcribing = true) }
            try { val text = api.transcribe(file).trim(); mutable.update { it.copy(transcribing = false) }
                if (text.isBlank()) notify("没有识别到文字") else if (dictation) setInput((state.value.input + text).take(500)) else send(text, fromVoice = true)
            } catch (error: Exception) { handle(error) } finally { file.delete(); mutable.update { it.copy(transcribing = false) } }
        }
    }
    fun theme(value: String) { mutable.update { it.copy(theme = value) }; viewModelScope.launch { vault.put("theme", value) } }
    fun voiceMode(value: String) { tts.stop(); mutable.update { it.copy(voiceMode = value) }; viewModelScope.launch { vault.put("voice_mode", value) } }
    fun revokeDevice(device: ConnectedDevice) { if (device.current) logout() else viewModelScope.launch {
        try { api.revokeDevice(device.id); mutable.update { it.copy(devices = api.devices()) }; notify("设备已断开") } catch (error: Exception) { handle(error) }
    } }
    fun logout() { sessionEpoch++; viewModelScope.launch { try { if (!state.value.demo) api.logout() } catch (_: Exception) {} finally {
        taskJob?.cancel(); stopSync(); tts.stop(); stopRecording(true); continuation = null; selectedId = null; api.cookieJar.clear()
        mutable.update { AppState(initializing = false, theme = it.theme, voiceMode = it.voiceMode) }
    } } }
    fun demo(enabled: Boolean) { viewModelScope.launch {
        if (state.value.busy) { notify("请先等待当前任务完成"); return@launch }
        sessionEpoch++
        stopSync(); tts.stop(); stopRecording(true); continuation = null; selectedId = null
        if (enabled) { mutable.update { it.copy(demo = true, session = Session(true, "demo", "演示模式"), messages = emptyList(), snapshot = null, sheet = null) }; loadSpaces(); startSync(); notify("已进入离线演示模式") }
        else { mutable.update { it.copy(demo = false, snapshot = null, messages = emptyList()) }; try { val session = api.session(); mutable.update { it.copy(session = session.takeIf { s -> s.authenticated }, sheet = null) }; if (session.authenticated) { loadSpaces(); startSync() } } catch (error: Exception) { handle(error) } }
    } }
    fun display(type: String, cardId: String? = null) {
        if (state.value.demo) { notify("演示模式没有连接大屏"); return }
        if (state.value.displayBusy) return
        viewModelScope.launch {
            mutable.update { it.copy(displayBusy = true) }
            try { val display = api.display(type, cardId, selectedId); mutable.update { it.copy(display = display) }; if (type == "focus") notify("已在大屏聚焦") }
            catch (error: Exception) { handle(error) } finally { mutable.update { it.copy(displayBusy = false) } }
        }
    }
    fun checkUpdate(silent: Boolean = false) {
        if (!::api.isInitialized || state.value.updating) return
        lastUpdateCheck = System.currentTimeMillis()
        viewModelScope.launch {
            mutable.update { it.copy(updating = true) }; val started = System.currentTimeMillis()
            try { val update = UpdateManager(getApplication(), api.publicClient).check(); mutable.update { it.copy(update = update) }; if (update == null && !silent) notify("已是最新版本") }
            catch (_: Exception) { if (!silent) notify("暂时无法检查更新，请稍后重试") }
            finally { delay((600 - (System.currentTimeMillis() - started)).coerceAtLeast(0)); mutable.update { it.copy(updating = false) } }
        }
    }
    fun dismissUpdate() { if (state.value.update?.mandatory != true) mutable.update { it.copy(update = null) } }
    fun downloadUpdate() {
        val update = state.value.update ?: return
        if (state.value.downloadProgress != null) return
        viewModelScope.launch {
            mutable.update { it.copy(downloadProgress = 0f) }
            try { val file = UpdateManager(getApplication(), api.publicClient).download(update) { progress -> mutable.update { it.copy(downloadProgress = progress) } }
                mutable.update { it.copy(installPath = file.absolutePath) }
            } catch (error: Exception) { handle(error) } finally { mutable.update { it.copy(downloadProgress = null) } }
        }
    }
    override fun onCleared() { stopSync(); recorder.stop(true); tts.stop(); super.onCleared() }
}
