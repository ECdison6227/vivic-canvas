package app.vivic.remote

import android.net.*
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalView
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import androidx.lifecycle.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.vivic.remote.core.UpdateManager
import app.vivic.remote.ui.VivicScreen
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

class MainActivity : ComponentActivity() {
    private lateinit var vm: AppViewModel
    private var pendingInstall: String? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private val processObserver = object : DefaultLifecycleObserver {
        override fun onStart(owner: LifecycleOwner) { vm.foreground(true) }
        override fun onStop(owner: LifecycleOwner) { vm.foreground(false) }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        vm = ViewModelProvider(this)[AppViewModel::class.java]
        ProcessLifecycleOwner.get().lifecycle.addObserver(processObserver)
        val connectivity = getSystemService(ConnectivityManager::class.java)
        networkCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { runOnUiThread { if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) { vm.foreground(true); vm.refresh() } } }
        }.also { connectivity.registerDefaultNetworkCallback(it) }
        setContent {
            val theme by remember { vm.state.map { it.theme }.distinctUntilChanged() }.collectAsStateWithLifecycle("system")
            val dark = theme == "dark" || theme == "system" && isSystemInDarkTheme()
            val view = LocalView.current
            SideEffect {
                WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !dark
                WindowCompat.getInsetsController(window, view).isAppearanceLightNavigationBars = !dark
            }
            VivicScreen(vm) { path -> if (!UpdateManager.install(this, path)) pendingInstall = path }
        }
    }
    override fun onResume() {
        super.onResume()
        val path = pendingInstall
        if (path != null && packageManager.canRequestPackageInstalls()) { pendingInstall = null; UpdateManager.install(this, path) }
    }
    override fun onDestroy() {
        networkCallback?.let { runCatching { getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(it) } }
        ProcessLifecycleOwner.get().lifecycle.removeObserver(processObserver)
        super.onDestroy()
    }
}
