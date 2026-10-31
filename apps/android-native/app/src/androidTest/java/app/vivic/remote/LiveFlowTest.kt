package app.vivic.remote

import android.graphics.Bitmap
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.ViewModelProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import kotlinx.coroutines.*
import java.util.concurrent.CopyOnWriteArrayList

@RunWith(AndroidJUnit4::class)
class LiveFlowTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private fun screen(name: String) {
        compose.waitForIdle()
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val directory = File(instrumentation.targetContext.getExternalFilesDir(null), "native-qa").apply { mkdirs() }
        val bitmap = instrumentation.uiAutomation.takeScreenshot()
        File(directory, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
    }
    @Test fun liveNoteTodoAndAcknowledgedDisplay() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("live") == "true")
        val vm = ViewModelProvider(compose.activity)[AppViewModel::class.java]
        compose.waitUntil(40000) { vm.state.value.session != null && vm.state.value.snapshot != null }
        assertTrue("Use only the dedicated evaluation account", vm.state.value.session!!.username.startsWith("decision-eval-"))
        compose.onNodeWithTag("composer_input").performClick().performTextInput("帮我记个便笺：原生客户端已接通")
        compose.onNodeWithTag("voice_button").performTouchInput { click() }
        compose.waitUntil(90000) { !vm.state.value.busy && vm.state.value.messages.any { !it.user && it.state == "succeeded" } }
        assertTrue(vm.state.value.snapshot!!.cards.any { it.type == "NoteCard" })
        if (!compose.onNodeWithTag("tab_space").isDisplayed()) compose.runOnIdle { compose.activity.onBackPressedDispatcher.onBackPressed() }
        screen("live-chat")
        compose.onNodeWithTag("tab_space").performClick()
        repeat(4) {
            if (compose.onAllNodesWithContentDescription("Verify cross-device sync").fetchSemanticsNodes().isEmpty()
                || !compose.onNodeWithContentDescription("Verify cross-device sync").isDisplayed())
                compose.onNodeWithTag("space_page").performTouchInput { swipeUp() }
        }
        compose.onNodeWithContentDescription("Verify cross-device sync").performClick()
        compose.waitUntil(20000) { !vm.state.value.commandBusy }
        screen("live-space")
        compose.onNodeWithTag("settings_button").performClick()
        compose.waitUntil(30000) { vm.state.value.display.online && vm.state.value.providers.stepfun && vm.state.value.providers.deepseek && vm.state.value.providers.voice }
        val sleepSwitch = compose.onNode(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Switch))
        if (!vm.state.value.display.sleeping) sleepSwitch.performClick()
        compose.waitUntil(10000) { vm.state.value.display.sleeping && !vm.state.value.displayBusy }
        screen("live-display-sleep")
        sleepSwitch.performClick()
        compose.waitUntil(10000) { !vm.state.value.display.sleeping && !vm.state.value.displayBusy }
        compose.waitUntil(20000) { !vm.state.value.updating }
        val notices = CopyOnWriteArrayList<String>()
        val observer = CoroutineScope(Dispatchers.Unconfined).launch { vm.state.collect { it.notice?.text?.let(notices::add) } }
        try {
            compose.onNodeWithText("检查更新").performScrollTo().assertIsEnabled().performTouchInput { click() }
            compose.waitUntil(20000) { notices.any { it.contains("最新") } }
        } catch (error: Throwable) { throw AssertionError("Update UI did not confirm current version; observed=$notices", error) }
        finally { observer.cancel() }
        screen("live-settings")
    }
}
