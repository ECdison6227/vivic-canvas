package app.vivic.remote

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.vivic.remote.core.ApiFailure
import app.vivic.remote.core.UpdateInfo
import app.vivic.remote.core.UpdateManager
import app.vivic.remote.model.JsonCodec
import app.vivic.remote.model.obj
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.net.URL

@RunWith(AndroidJUnit4::class)
class UpdateSmokeTest {
    @Test fun publicDownloadChecksHashAndTheOriginalCertificate() = runBlocking(Dispatchers.IO) {
        assumeTrue(InstrumentationRegistry.getArguments().getString("live") == "true")
        val value = JsonCodec.parseToJsonElement(URL("https://vivic.edsionc.top/downloads/android/latest.json").readText()).obj()
        val update = UpdateInfo.parse(value, BuildConfig.VERSION_CODE - 1L)!!
        val manager = UpdateManager(InstrumentationRegistry.getInstrumentation().targetContext, OkHttpClient())
        val file = manager.download(update) {}
        assertTrue(file.isFile); assertEquals(update.size, file.length())
        try { manager.download(update.copy(sha256 = "0".repeat(64))) {}; fail("A mismatched public hash must never reach the installer") }
        catch (error: ApiFailure) { assertEquals("update-hash", error.code) }
    }
}
