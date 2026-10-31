package app.vivic.remote.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.*
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.*
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.Lifecycle
import app.vivic.remote.*
import app.vivic.remote.ui.components.*
import app.vivic.remote.ui.theme.*
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors

@OptIn(ExperimentalFoundationApi::class)
@Composable fun ConnectScreen(vm: AppViewModel, state: AppState) {
    val colors = LocalVivicColors.current
    Box(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = 24.dp)) {
        Column(Modifier.align(Alignment.Center).offset(y = (-26).dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.testTag("connect_orb").semantics { contentDescription = "Vivic，长按查看关于" }.combinedClickable(onClick = {}, onLongClick = { vm.sheet("about") })) {
                VivicOrb(Modifier.size(200.dp), if (state.initializing || state.authBusy) "thinking" else "idle")
            }
            Spacer(Modifier.height(28.dp)); Text("Vivic", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(44.dp))
            ActionButton(if (state.initializing || state.authBusy) "正在连接…" else "扫码连接", { vm.sheet("scanner") },
                Modifier.widthIn(min = 180.dp), enabled = !state.initializing && !state.authBusy)
        }
        Row(Modifier.align(Alignment.BottomCenter).padding(bottom = 20.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton({ vm.sheet("code") }, enabled = !state.initializing && !state.authBusy) { Text("输入设备码", color = colors.ink.copy(alpha = .75f)) }
            Text("·", color = colors.tertiary)
            TextButton({ vm.sheet("login") }, enabled = !state.initializing && !state.authBusy) { Text("账号登录", color = colors.ink.copy(alpha = .75f)) }
        }
    }
}

@Composable fun CredentialsForm(vm: AppViewModel, state: AppState, deviceCode: Boolean) {
    var username by remember { mutableStateOf("") }; var password by remember { mutableStateOf("") }; var code by remember { mutableStateOf("") }
    Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(bottom = 32.dp).imePadding(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(if (deviceCode) "输入设备码" else "连接 Vivic", style = MaterialTheme.typography.titleLarge)
        if (deviceCode) {
            Text("在电脑上的“连接手机”中查看", color = LocalVivicColors.current.secondary)
            OutlinedTextField(code, { code = it.take(256) }, label = { Text("设备码") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                shape = ContinuousCornerShape(18.dp), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii, capitalization = KeyboardCapitalization.None))
        } else {
            OutlinedTextField(username, { username = it.take(80) }, label = { Text("用户名") }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = ContinuousCornerShape(18.dp))
            OutlinedTextField(password, { password = it.take(256) }, label = { Text("密码") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), shape = ContinuousCornerShape(18.dp))
        }
        ActionButton(if (state.authBusy) "正在连接…" else "连接", {
            if (deviceCode) vm.claim(code) else { vm.login(username, password); password = "" }
        }, Modifier.fillMaxWidth(), enabled = !state.authBusy && if (deviceCode) code.isNotBlank() else username.isNotBlank() && password.isNotBlank())
    }
}

@androidx.annotation.OptIn(ExperimentalGetImage::class)
@Composable fun ScannerScreen(vm: AppViewModel, state: AppState) {
    val context = LocalContext.current; val owner = LocalLifecycleOwner.current
    var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { granted = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it }
    val enabled by rememberUpdatedState(!state.authBusy)
    var torch by remember { mutableStateOf(false) }; var camera by remember { mutableStateOf<Camera?>(null) }
    var cameraError by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { if (!granted) permission.launch(Manifest.permission.CAMERA) }
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        if (granted && !cameraError) {
            val preview = remember { PreviewView(context).apply { implementationMode = PreviewView.ImplementationMode.COMPATIBLE } }
            AndroidView({ preview }, Modifier.fillMaxSize())
            DisposableEffect(owner, preview) {
                val executor = Executors.newSingleThreadExecutor()
                val scanner = BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build())
                val future = ProcessCameraProvider.getInstance(context)
                var provider: ProcessCameraProvider? = null; var analysis: ImageAnalysis? = null; var usePreview: Preview? = null; var disposed = false
                var last = ""; var lastAt = 0L
                future.addListener({
                    if (!disposed) try {
                        provider = future.get(); usePreview = Preview.Builder().build().also { it.surfaceProvider = preview.surfaceProvider }
                        analysis = ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build().also { imageAnalysis ->
                            imageAnalysis.setAnalyzer(executor) { frame ->
                                val image = frame.image
                                if (image == null || !enabled) frame.close() else {
                                    scanner.process(InputImage.fromMediaImage(image, frame.imageInfo.rotationDegrees)).addOnSuccessListener { codes ->
                                        val raw = codes.firstOrNull { it.rawValue != null }?.rawValue
                                        if (raw != null && enabled && (raw != last || System.currentTimeMillis() - lastAt > 4000)) {
                                            last = raw; lastAt = System.currentTimeMillis(); vm.claim(raw)
                                        }
                                    }.addOnCompleteListener { frame.close() }
                                }
                            }
                        }
                        camera = provider?.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, usePreview!!, analysis!!)
                    } catch (_: Exception) { cameraError = true }
                }, ContextCompat.getMainExecutor(context))
                onDispose { disposed = true; analysis?.clearAnalyzer(); usePreview?.let { p -> analysis?.let { a -> provider?.unbind(p, a) } }; scanner.close(); executor.shutdown() }
            }
            Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(24.dp)) {
                Box(Modifier.size(248.dp).border(1.5.dp, Color.White.copy(alpha = .8f), ContinuousCornerShape(24.dp)))
                Text(if (state.authBusy) "正在连接…" else "扫描电脑上的 Vivic 二维码", color = Color.White)
            }
            if (camera?.cameraInfo?.hasFlashUnit() == true) TextButton({ torch = !torch; camera?.cameraControl?.enableTorch(torch) }, Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 40.dp)) {
                Text(if (torch) "关闭手电筒" else "打开手电筒", color = Color.White)
            }
        } else Column(Modifier.align(Alignment.Center).padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(20.dp)) {
            Text(if (cameraError) "相机暂不可用，可以输入设备码连接" else "允许使用相机，扫描电脑上的连接码", color = Color.White)
            if (!granted) Button({ context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))) }) { Text("去设置", color = MaterialTheme.colorScheme.onPrimary) }
            TextButton({ vm.sheet("code") }) { Text("输入设备码", color = Color.White) }
        }
        Box(Modifier.align(Alignment.TopStart).statusBarsPadding().padding(12.dp)) { PressIconButton("back", "返回", { vm.sheet(null) }) }
    }
}
