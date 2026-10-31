package app.vivic.remote.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.core.content.ContextCompat
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.text.input.*
import androidx.compose.ui.unit.dp
import app.vivic.remote.*
import app.vivic.remote.ui.components.*
import app.vivic.remote.ui.theme.*

@Composable fun SettingsContent(vm: AppViewModel, state: AppState) {
    val colors = LocalVivicColors.current
    val context = LocalContext.current
    var microphone by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { microphone = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED }
    var models by remember { mutableStateOf(false) }; var devices by remember { mutableStateOf(false) }; var voiceMenu by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(bottom = 28.dp).imePadding(), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Text("设置", style = MaterialTheme.typography.titleLarge)
        if (state.demo) Text("演示模式", color = colors.accent) else Column {
            Text(state.session?.username.orEmpty(), style = MaterialTheme.typography.titleMedium)
            Text(state.session?.deviceName.orEmpty(), color = colors.secondary, style = MaterialTheme.typography.bodySmall)
        }
        HorizontalDivider(color = colors.stroke)
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Text("外观"); Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("light" to "浅色", "dark" to "深色", "system" to "系统").forEach { (id, label) ->
                    FilterChip(state.theme == id, { vm.theme(id) }, label = { Text(label) })
                }
            }
        }
        Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable { voiceMenu = true }, verticalAlignment = Alignment.CenterVertically) {
            Text("语音回复", Modifier.weight(1f)); Box {
                Text(when (state.voiceMode) { "all" -> "始终播放"; "voice" -> "仅语音指令"; else -> "关闭" }, color = colors.secondary)
                DropdownMenu(voiceMenu, { voiceMenu = false }) {
                    listOf("off" to "关闭", "voice" to "仅语音指令", "all" to "始终播放").forEach { (id, label) -> DropdownMenuItem(text = { Text(label) }, onClick = { voiceMenu = false; vm.voiceMode(id) }) }
                }
            }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) { Text("大屏：熄眠"); if (!state.display.online) Text("大屏未连接", color = colors.secondary, style = MaterialTheme.typography.bodySmall) }
            Switch(state.display.sleeping, onCheckedChange = { vm.display(if (it) "sleep" else "wake") }, enabled = !state.displayBusy && !state.demo)
        }
        if (!microphone && !state.demo) TextButton({ context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))) }) { Text("开启麦克风权限") }
        HorizontalDivider(color = colors.stroke)
        if (!state.demo) {
            Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable { models = !models }, verticalAlignment = Alignment.CenterVertically) {
                Text("模型连接", Modifier.weight(1f)); Text(if (models) "收起" else if (state.providers.stepfun || state.providers.deepseek) "已连接" else "未连接", color = colors.secondary)
            }
            if (models) {
                Text("优先使用 StepFun，不可用时自动使用 DeepSeek。", style = MaterialTheme.typography.bodySmall, color = colors.secondary)
                ModelKeyRow("StepFun", "stepfun", state.providers.stepfun, vm, state)
                ModelKeyRow("DeepSeek", "deepseek", state.providers.deepseek, vm, state)
                Text(if (state.providers.voice) "服务器语音已连接" else "服务器语音暂未连接", color = colors.secondary, style = MaterialTheme.typography.bodySmall)
            }
            Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable { devices = !devices }, verticalAlignment = Alignment.CenterVertically) {
                Text("已连接设备", Modifier.weight(1f)); Text(if (devices) "收起" else "${state.devices.size}", color = colors.secondary)
            }
            if (devices) state.devices.forEach { device -> Row(Modifier.fillMaxWidth().heightIn(min = 52.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(device.name + if (device.current) " · 本机" else "", Modifier.weight(1f))
                if (!device.current) TextButton({ vm.revokeDevice(device) }) { Text("断开") }
            } }
        }
        Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(enabled = !state.updating) { vm.checkUpdate() }, verticalAlignment = Alignment.CenterVertically) {
            Text("检查更新", Modifier.weight(1f)); Text(if (state.updating) "检查中…" else "", color = colors.secondary)
        }
        Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable { vm.sheet("about") }, verticalAlignment = Alignment.CenterVertically) { Text("关于 Vivic") }
        TextButton({ if (state.demo) vm.demo(false) else vm.logout() }, Modifier.fillMaxWidth()) { Text(if (state.demo) "退出演示模式" else "退出登录", color = colors.secondary) }
    }
}
@Composable private fun ModelKeyRow(title: String, provider: String, connected: Boolean, vm: AppViewModel, state: AppState) {
    var key by remember(provider) { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(title, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
            Text(if (connected) "已连接" else "未连接", color = LocalVivicColors.current.secondary, style = MaterialTheme.typography.bodySmall)
            if (connected) TextButton({ vm.disconnectModel(provider) }, enabled = state.activeTask == null) { Text("断开") }
        }
        OutlinedTextField(key, { key = it.take(512) }, modifier = Modifier.fillMaxWidth(), label = { Text("$title API Key") }, singleLine = true,
            shape = ContinuousCornerShape(18.dp), visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
        TextButton({ vm.connectModel(provider, key); key = "" }, Modifier.align(Alignment.End), enabled = key.isNotBlank() && state.modelBusy == null && !state.busy) {
            Text(if (state.modelBusy == provider) "正在验证…" else if (connected) "更新连接" else "连接")
        }
    }
}
@Composable fun AboutContent(vm: AppViewModel, state: AppState) {
    var taps by remember { mutableIntStateOf(0) }
    Column(Modifier.fillMaxWidth().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(18.dp)) {
        VivicOrb(Modifier.size(100.dp)); Text("Vivic", style = MaterialTheme.typography.titleLarge)
        Text("版本 ${BuildConfig.VERSION_NAME}", Modifier.heightIn(min = 48.dp).clickable {
            taps++; if (taps >= 7) { vm.demo(!state.demo); taps = 0 }
        }.padding(12.dp), color = LocalVivicColors.current.secondary)
        if (state.demo) Text("离线演示，不会更改账号内容", style = MaterialTheme.typography.bodySmall, color = LocalVivicColors.current.secondary)
    }
}
