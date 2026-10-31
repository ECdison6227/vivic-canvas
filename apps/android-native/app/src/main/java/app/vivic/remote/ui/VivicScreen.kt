package app.vivic.remote.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.view.HapticFeedbackConstants
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.pager.*
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.*
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.*
import androidx.compose.ui.input.pointer.*
import androidx.compose.ui.layout.*
import androidx.compose.ui.platform.*
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.*
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.vivic.remote.*
import app.vivic.remote.R
import app.vivic.remote.ui.components.*
import app.vivic.remote.ui.theme.*
import dev.chrisbanes.haze.*
import coil3.ImageLoader
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.abs

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun VivicScreen(vm: AppViewModel, install: (String) -> Unit) {
    val state by vm.state.collectAsStateWithLifecycle()
    VivicTheme(state.theme) {
        val colors = LocalVivicColors.current; val haze = rememberHazeState()
        val focus = LocalFocusManager.current; val keyboard = LocalSoftwareKeyboardController.current
        val density = LocalDensity.current
        val keyboardVisible = WindowInsets.ime.getBottom(density) > 0
        val pager = rememberPagerState(pageCount = { 2 })
        var controlsHeight by remember { mutableIntStateOf(0) }
        val bottomPadding = if (controlsHeight == 0) 112.dp else with(density) { controlsHeight.toDp() } + 16.dp
        val context = LocalContext.current
        val imageLoader = remember(state.session?.userId) {
            if (state.session == null) null else ImageLoader.Builder(context.applicationContext)
                .components { add(OkHttpNetworkFetcherFactory(callFactory = { vm.api.imageClient })) }.build()
        }
        DisposableEffect(imageLoader) { onDispose { imageLoader?.shutdown() } }
        BackHandler(keyboardVisible || state.sheet != null || state.page == 1) {
            when { keyboardVisible -> { focus.clearFocus(); keyboard?.hide() }; state.sheet != null -> vm.sheet(null); state.page == 1 -> vm.setPage(0) }
        }
        CompositionLocalProvider(LocalHaze provides haze, LocalVivicImageLoader provides imageLoader) {
            Box(Modifier.fillMaxSize()) {
                Box(Modifier.fillMaxSize().then(if (state.session != null) Modifier.hazeSource(haze) else Modifier)) {
                    Crossfade(colors.dark, animationSpec = tween(if (LocalMotionEnabled.current) 800 else 80), label = "sky") { dark ->
                        Image(painterResource(if (dark) R.drawable.sky_dark else R.drawable.sky_light), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    }
                    if (state.connectionSuccess) Box(Modifier.fillMaxSize(), Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(24.dp)) {
                            VivicOrb(Modifier.size(128.dp)); Text("已连接", style = MaterialTheme.typography.titleLarge)
                        }
                    }
                    else if (state.sheet == "scanner") ScannerScreen(vm, state)
                    else if (state.session == null) ConnectScreen(vm, state)
                    else MainPages(vm, state, pager, bottomPadding)
                }
                if (state.session != null && state.sheet != "scanner" && !state.connectionSuccess) MainControls(vm, state, keyboardVisible, pager) { controlsHeight = it }
                state.notice?.let { notice ->
                    Box(Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = if (state.session == null) 12.dp else 64.dp).padding(horizontal = 16.dp)) {
                        GlassSurface(Modifier.fillMaxWidth().pointerInput(notice.id) { detectVerticalDragGestures { change, drag -> if (drag < -12) { change.consume(); vm.dismissNotice() } } }) {
                            Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp).heightIn(min = 40.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(notice.text, Modifier.weight(1f), maxLines = 3, style = MaterialTheme.typography.bodyMedium)
                                if (notice.undo) TextButton({ vm.undo() }) { Text("撤销") }
                            }
                        }
                    }
                }
            }
            if (state.sheet != null && state.sheet != "scanner") ModalBottomSheet(onDismissRequest = { vm.sheet(null) },
                sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), shape = ContinuousCornerShape(28.dp),
                containerColor = colors.solid, scrimColor = Color(0xFF18181B).copy(alpha = .32f), tonalElevation = 0.dp) {
                when (state.sheet) {
                    "settings" -> SettingsContent(vm, state)
                    "about" -> AboutContent(vm, state)
                    "code" -> CredentialsForm(vm, state, true)
                    "login" -> CredentialsForm(vm, state, false)
                    "spaces" -> Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("工作空间", style = MaterialTheme.typography.titleLarge)
                        state.spaces.forEach { space -> Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable { vm.chooseSpace(space.id) }, verticalAlignment = Alignment.CenterVertically) {
                            Text(space.title, Modifier.weight(1f)); if (space.id == state.snapshot?.space?.id) HarkIcon("check", "当前空间")
                        } }
                    }
                }
            }
            state.update?.let { update -> AlertDialog(onDismissRequest = { vm.dismissUpdate() }, shape = ContinuousCornerShape(24.dp),
                containerColor = colors.solid, title = { Text("Vivic ${update.version}") },
                text = { Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text(update.notes.ifBlank { "有新的版本可用" })
                    state.downloadProgress?.let { LinearProgressIndicator(progress = { it }, modifier = Modifier.fillMaxWidth()); Text("正在下载 ${(it * 100).toInt()}%") }
                } },
                confirmButton = { TextButton({ if (state.installPath != null) install(state.installPath!!) else vm.downloadUpdate() }, enabled = state.downloadProgress == null) {
                    Text(if (state.installPath != null) "安装" else "更新")
                } }, dismissButton = { if (!update.mandatory && state.downloadProgress == null) TextButton({ vm.dismissUpdate() }) { Text("稍后") } }) }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable private fun MainPages(vm: AppViewModel, state: AppState, pager: PagerState, bottomPadding: Dp) {
    val focus = LocalFocusManager.current; val keyboard = LocalSoftwareKeyboardController.current
    LaunchedEffect(state.page) { if (pager.currentPage != state.page) pager.animateScrollToPage(state.page, animationSpec = spring(.85f, 400f)) }
    LaunchedEffect(pager) { snapshotFlow { pager.settledPage }.collect { vm.setPage(it) } }
    HorizontalPager(pager, Modifier.fillMaxSize().pointerInput(Unit) { detectTapGestures(onTap = { focus.clearFocus(); keyboard?.hide() }) }) { page ->
        val offset = abs((pager.currentPage - page) + pager.currentPageOffsetFraction).coerceIn(0f, 1f)
        Box(Modifier.fillMaxSize().graphicsLayer { alpha = 1f - offset * .4f; scaleX = 1f - offset * .02f; scaleY = scaleX }) {
            if (page == 0) ChatPage(vm, state, bottomPadding) else SpacePage(vm, state, bottomPadding)
        }
    }
}

@Composable private fun MainControls(vm: AppViewModel, state: AppState, keyboardVisible: Boolean, pager: PagerState, height: (Int) -> Unit) {
    val colors = LocalVivicColors.current; val scope = rememberCoroutineScope()
    Box(Modifier.fillMaxSize()) {
        AnimatedVisibility(!keyboardVisible, enter = fadeIn(tween(160)) + slideInVertically(tween(160)) { -8 }, exit = fadeOut(tween(160)) + slideOutVertically(tween(160)) { -8 }) {
            Row(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                PressIconButton(if (state.page == 0) "add" else "apps", if (state.page == 0) "新对话" else "切换工作空间",
                    { if (state.page == 0) vm.newConversation() else vm.sheet("spaces") }, enabled = !state.busy)
                GlassSurface(Modifier.width(192.dp).height(44.dp), radius = 32.dp) {
                    Box(Modifier.padding(4.dp).fillMaxSize()) {
                        Box(Modifier.fillMaxHeight().fillMaxWidth(.5f).offset(x = (92f * (pager.currentPage + pager.currentPageOffsetFraction).coerceIn(0f, 1f)).dp)
                            .clip(ContinuousCornerShape(24.dp)).background(colors.ink))
                        Row(Modifier.fillMaxSize()) {
                            listOf("聊天", "工作空间").forEachIndexed { index, title ->
                                Box(Modifier.weight(1f).fillMaxHeight().testTag(if (index == 0) "tab_chat" else "tab_space").clickable { vm.setPage(index) }, Alignment.Center) {
                                    Text(title, color = lerp(colors.onInk, colors.secondary, abs(pager.currentPage + pager.currentPageOffsetFraction - index).coerceIn(0f, 1f)), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Medium)
                                }
                            }
                        }
                    }
                }
                PressIconButton("account", if (state.demo) "演示模式，打开设置" else "打开设置", { vm.sheet("settings") }, Modifier.testTag("settings_button"))
            }
        }
        Column(Modifier.align(Alignment.BottomCenter).onSizeChanged { height(it.height) }.imePadding().navigationBarsPadding().padding(horizontal = 16.dp).padding(bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            state.replyPreview?.let { preview ->
                LaunchedEffect(preview) { delay(8000); vm.dismissPreview() }
                GlassSurface(Modifier.fillMaxWidth().clickable { vm.setPage(0); vm.dismissPreview() }
                    .pointerInput(preview) { detectVerticalDragGestures { change, drag -> if (drag < -12) { change.consume(); vm.dismissPreview() } } }) {
                    Text(preview, Modifier.padding(16.dp), maxLines = 4, overflow = TextOverflow.Ellipsis)
                }
            }
            if (state.demo) Text("演示模式", style = MaterialTheme.typography.labelSmall, color = colors.secondary, modifier = Modifier.align(Alignment.CenterHorizontally))
            Composer(vm, state)
        }
    }
}

@Composable private fun ChatPage(vm: AppViewModel, state: AppState, bottomGap: Dp) {
    val list = rememberLazyListState(); val colors = LocalVivicColors.current; val scope = rememberCoroutineScope()
    val topPadding = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + 72.dp
    LaunchedEffect(state.messages.size, state.messages.lastOrNull()?.state, bottomGap) {
        if (state.messages.isNotEmpty() && (list.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0) >= state.messages.size - 3)
            list.animateScrollToItem(state.messages.lastIndex)
    }
    Box(Modifier.fillMaxSize()) {
        if (state.messages.isEmpty()) Column(Modifier.align(Alignment.Center).offset(y = (-24).dp).padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(18.dp)) {
            VivicOrb(Modifier.size(92.dp)); Text("想做点什么？", style = MaterialTheme.typography.titleLarge)
        }
        LazyColumn(state = list, modifier = Modifier.fillMaxSize().testTag("chat_page"), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = topPadding, bottom = bottomGap), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            items(state.messages, key = { it.id }) { message ->
                Column(Modifier.fillMaxWidth(), horizontalAlignment = if (message.user) Alignment.End else Alignment.Start, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.widthIn(max = 360.dp).fillMaxWidth(.85f).clip(ContinuousCornerShape(20.dp))
                        .background(if (message.user) colors.userBubble else colors.agentBubble).padding(horizontal = 18.dp, vertical = 14.dp)) {
                        if (message.state == "thinking") ThinkingDots() else StreamingReply(message.text, animate = !message.user)
                    }
                    message.cardIds.take(6).forEach { id -> state.snapshot?.cards?.find { it.id == id }?.let { card ->
                        CardTile(card, vm, state.definitions, Modifier.fillMaxWidth(.85f).heightIn(max = 120.dp), compact = true)
                    } }
                    message.originalText?.let { original -> TextButton({ vm.send(original) }, enabled = !state.busy) { Text("重试") } }
                }
            }
        }
        val farFromBottom by remember(state.messages.size) { derivedStateOf {
            val last = list.layoutInfo.visibleItemsInfo.lastOrNull() ?: return@derivedStateOf false
            last.index < state.messages.lastIndex && list.layoutInfo.totalItemsCount > 4
        } }
        if (farFromBottom) Box(Modifier.align(Alignment.BottomCenter).padding(bottom = bottomGap)) {
            PressIconButton("down", "回到底部", { scope.launch { if (state.messages.isNotEmpty()) list.animateScrollToItem(state.messages.lastIndex) } })
        }
    }
}
@Composable private fun ThinkingDots() {
    val colors = LocalVivicColors.current; val transition = rememberInfiniteTransition(label = "thinking")
    val progress by transition.animateFloat(0f, 1f, infiniteRepeatable(tween(1400, easing = LinearEasing)), label = "dots")
    Row(Modifier.height(20.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        VivicOrb(Modifier.size(20.dp), "thinking")
        repeat(3) { index ->
            val phase = if (LocalMotionEnabled.current) (progress - index * .115f + 1) % 1 else .4f
            val weight = (1 - abs(phase - .4f) / .4f).coerceIn(0f, 1f)
            Box(Modifier.size(5.dp).scale(.8f + weight * .2f).background(colors.ink.copy(alpha = .2f + weight * .8f), androidx.compose.foundation.shape.CircleShape))
        }
    }
}
@Composable private fun StreamingReply(text: String, animate: Boolean) {
    val colors = LocalVivicColors.current; val motion = LocalMotionEnabled.current
    var entered by remember(text) { mutableStateOf(false) }
    LaunchedEffect(text) { entered = true }
    val duration = ((text.length * 25).coerceAtMost(980) + 520)
    val progress by animateFloatAsState(if (entered) 1f else 0f, tween(if (motion && animate) duration else 80, easing = LinearEasing), label = "reply")
    Text(buildAnnotatedString {
        text.forEachIndexed { index, char -> val start = if (text.isEmpty()) 0f else index.toFloat() / text.length * (duration - 520)
            val alpha = if (!motion || !animate) 1f else ((progress * duration - start) / 520).coerceIn(0f, 1f)
            withStyle(SpanStyle(color = colors.ink.copy(alpha = alpha))) { append(char) }
        }
    })
}
@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun SpacePage(vm: AppViewModel, state: AppState, bottomPadding: Dp) {
    val list = rememberLazyListState(); val cards = remember(state.snapshot) { state.snapshot?.displayCards.orEmpty() }; val pull = rememberPullToRefreshState()
    LaunchedEffect(state.focusNonce, state.focusedCard, cards.size) {
        val index = cards.indexOfFirst { it.id == state.focusedCard }; if (index >= 0) list.animateScrollToItem(index)
    }
    PullToRefreshBox(state.refreshing, { vm.refresh(true) }, Modifier.fillMaxSize().testTag("space_page"), state = pull, indicator = {
        if (state.refreshing || pull.distanceFraction > 0) Box(Modifier.align(Alignment.TopCenter).padding(top = 72.dp).size(28.dp)) {
            VivicOrb(Modifier.fillMaxSize(), if (state.refreshing) "thinking" else "idle")
        }
    }) {
        if (cards.isEmpty()) Column(Modifier.align(Alignment.Center).padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(24.dp)) {
            VivicOrb(Modifier.size(224.dp)); Text("对 Vivic 说“帮我建一个待办”", color = LocalVivicColors.current.secondary)
        }
        LazyColumn(state = list, modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + 72.dp, bottom = bottomPadding), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            items(cards, key = { it.id }) { card -> CardTile(card, vm, state.definitions,
                Modifier.animateItem(fadeInSpec = tween(240), fadeOutSpec = tween(168), placementSpec = tween(240, easing = Motion.EaseInOut)),
                focused = card.id == state.focusedCard, fresh = card.id in state.newCardIds, focusNonce = state.focusNonce) }
        }
    }
}

@Composable private fun Composer(vm: AppViewModel, state: AppState) {
    val colors = LocalVivicColors.current; val context = LocalContext.current; val view = LocalView.current
    val focus = remember { FocusRequester() }; val keyboard = LocalSoftwareKeyboardController.current
    var menu by remember { mutableStateOf(false) }; var micAsked by remember { mutableStateOf(false) }; var cancelling by remember { mutableStateOf(false) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> if (!granted) vm.notify("请在系统设置中允许麦克风权限") }
    val current by rememberUpdatedState(state)
    val distance = with(LocalDensity.current) { 72.dp.toPx() }
    fun requestMic(): Boolean {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) return true
        if (!micAsked) { micAsked = true; permission.launch(Manifest.permission.RECORD_AUDIO) } else vm.notify("请在设置中开启麦克风权限")
        return false
    }
    GlassSurface(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(start = 16.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            if (state.recording) Row(Modifier.weight(1f).height(48.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Text(if (state.dictating) "听写中，轻点结束" else if (cancelling) "松开取消" else "上滑取消", color = if (cancelling) Color(0xFFD64545) else colors.secondary)
                VivicOrb(Modifier.size(26.dp), "listening", state.amplitude)
                Canvas(Modifier.weight(1f).height(24.dp)) { repeat(9) { index ->
                    val height = (4f + state.amplitude * 20f * (if (index % 2 == 0) 1f else .6f)).dp.toPx()
                    drawLine(if (cancelling) Color(0xFFD64545) else colors.ink, androidx.compose.ui.geometry.Offset(index * 6.dp.toPx(), (size.height - height) / 2),
                        androidx.compose.ui.geometry.Offset(index * 6.dp.toPx(), (size.height + height) / 2), 2.dp.toPx(), StrokeCap.Round)
                } }
            } else BasicTextField(state.input, { vm.setInput(it) }, Modifier.weight(1f).padding(vertical = 14.dp).focusRequester(focus).testTag("composer_input"),
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = colors.ink), cursorBrush = SolidColor(colors.ink), maxLines = 6,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send), keyboardActions = KeyboardActions(onSend = { vm.send(); view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP) }),
                decorationBox = { field -> if (state.input.isEmpty()) Text(if (state.transcribing) "正在识别…" else "给 Vivic 发消息", color = colors.tertiary); field() })
            if (!state.recording) Box {
                Box(Modifier.size(width = 32.dp, height = 48.dp).clickable { menu = true }, Alignment.Center) { HarkIcon("add", "快捷指令", Modifier.size(16.dp)) }
                DropdownMenu(menu, { menu = false }, shape = ContinuousCornerShape(24.dp), containerColor = colors.solid) {
                    listOf("五分钟倒计时" to "倒计时5分钟", "新建待办" to "帮我创建待办：", "新建便笺" to "新建便笺：").forEach { (title, value) ->
                        DropdownMenuItem(text = { Text(title) }, onClick = { menu = false; vm.setInput(value); focus.requestFocus(); keyboard?.show() })
                    }
                }
            }
            Box(Modifier.size(width = 52.dp, height = 48.dp).testTag("voice_button").semantics(mergeDescendants = true) {
                role = Role.Button
                onClick { when { state.activeTask != null -> vm.stopTask(); state.recording -> vm.stopRecording(false)
                    state.input.isNotBlank() -> vm.send(); !state.transcribing && requestMic() -> vm.startRecording(true) }; true }
            }.pointerInput(Unit) {
                awaitEachGesture {
                    val down = awaitFirstDown(); down.consume()
                    when {
                        current.activeTask != null -> { vm.stopTask(); waitForUpOrCancellation() }
                        current.recording -> { vm.stopRecording(false); waitForUpOrCancellation() }
                        current.input.isNotBlank() && !current.recording -> { vm.send(); view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP); waitForUpOrCancellation() }
                        current.transcribing -> waitForUpOrCancellation()
                        else -> {
                            if (!requestMic()) { waitForUpOrCancellation(); return@awaitEachGesture }
                            val up = withTimeoutOrNull(250) { waitForUpOrCancellation() }
                            if (up != null) vm.startRecording(dictation = true)
                            else if (currentEvent.changes.any { it.pressed }) {
                                vm.startRecording(dictation = false); cancelling = false
                                try { while (true) {
                                    val event = awaitPointerEvent(); val pointer = event.changes.firstOrNull { it.id == down.id } ?: break
                                    val cancel = pointer.position.y < down.position.y - distance
                                    if (cancel != cancelling) { cancelling = cancel; if (cancel) view.performHapticFeedback(if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.VIRTUAL_KEY) }
                                    if (!pointer.pressed) { vm.stopRecording(cancelling); break }; pointer.consume()
                                } } finally { if (current.recording && !current.dictating) vm.stopRecording(true); cancelling = false }
                            }
                        }
                    }
                }
            }, Alignment.Center) {
                if (state.transcribing) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = colors.ink)
                else if (state.input.isNotBlank() && !state.recording && state.activeTask == null)
                    Box(Modifier.size(width = 48.dp, height = 32.dp).clip(ContinuousCornerShape(16.dp)).background(colors.ink), Alignment.Center) { HarkIcon("up", "发送", Modifier.size(16.dp), colors.onInk) }
                else HarkIcon(if (state.activeTask != null || state.recording) "stop" else "mic", if (state.activeTask != null) "停止任务" else if (state.recording) "停止录音" else "按住说话，轻点听写", Modifier.size(18.dp))
            }
        }
    }
}
