package app.vivic.remote

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.Assert.assertEquals
import java.net.URL
import javax.net.ssl.HttpsURLConnection
import androidx.test.platform.app.InstrumentationRegistry
import app.vivic.remote.core.SecureVault
import app.vivic.remote.core.VivicApi
import app.vivic.remote.core.ApiFailure
import kotlinx.coroutines.runBlocking
import org.junit.Before
import org.junit.Assume.assumeTrue

@RunWith(AndroidJUnit4::class)
class NetworkSmokeTest {
    @Before fun explicitLiveEnvironment() { assumeTrue(InstrumentationRegistry.getArguments().getString("live") == "true") }
    @Test fun migratedSessionUsesTheNativeTransport() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val vault = SecureVault(context); vault.load()
        check(!vault.peek("cookies").isNullOrBlank()) { "The migrated Cookie was not persisted" }
        try { check(VivicApi(vault).session().authenticated) { "The migrated session is not authenticated" } }
        catch (error: ApiFailure) { throw AssertionError("Native transport failed: status=${error.status}, code=${error.code}") }
    }
    @Test fun publicTlsAndSessionEndpoint() {
        val connection = URL("https://vivic.edsionc.top/api/space/session").openConnection() as HttpsURLConnection
        connection.connectTimeout = 15000; connection.readTimeout = 15000
        connection.setRequestProperty("Origin", "https://vivic.edsionc.top")
        connection.setRequestProperty("User-Agent", "VivicAndroid/0.3.0")
        try { assertEquals(200, connection.responseCode) }
        catch (error: Exception) { throw AssertionError("Public TLS failure: ${error.javaClass.simpleName}; cause=${error.cause?.javaClass?.simpleName}") }
        finally { connection.disconnect() }
    }
}
