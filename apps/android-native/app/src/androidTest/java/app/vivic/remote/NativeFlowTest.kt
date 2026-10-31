package app.vivic.remote

import android.graphics.Bitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class NativeFlowTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private fun screen(name: String) {
        compose.waitForIdle()
        val directory = File(InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir(null), "native-qa").apply { mkdirs() }
        check(compose.onAllNodes(isRoot()).fetchSemanticsNodes().isNotEmpty()) { "Expected the app or its modal to remain visible" }
        val bitmap = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
        File(directory, "$name.png").outputStream().use { output -> bitmap.compress(Bitmap.CompressFormat.PNG, 100, output) }
        bitmap.recycle()
    }
    @Test fun demoChatCardsUndoAndTheme() {
        compose.waitUntil(30000) { compose.onAllNodesWithText("扫码连接").fetchSemanticsNodes().isNotEmpty() }
        screen("connect-light")
        compose.onNodeWithTag("connect_orb").performTouchInput { longClick() }
        repeat(7) { compose.onNodeWithText("版本 ${BuildConfig.VERSION_NAME}").performClick() }
        compose.waitUntil(20000) { compose.onAllNodesWithTag("composer_input").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag("composer_input").performClick().performTextInput("帮我建一个待办")
        compose.onNodeWithTag("voice_button").performTouchInput { click() }
        compose.waitUntil(30000) { compose.onAllNodesWithText("演示：已放进工作空间。").fetchSemanticsNodes().isNotEmpty() }
        if (!compose.onNodeWithTag("tab_space").isDisplayed()) compose.runOnIdle { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitUntil(10000) { compose.onNodeWithTag("tab_space").isDisplayed() }
        screen("chat-todo")
        compose.onNodeWithTag("tab_space").performClick()
        val title = hasText("演示待办") and hasAnyAncestor(hasTestTag("space_page"))
        compose.onNode(title).assertIsDisplayed()
        compose.onNodeWithContentDescription("准备演示材料").performClick()
        compose.onNodeWithText("1 / 2 已完成").assertExists()
        compose.onNode(title).performTouchInput { longClick() }
        compose.onNodeWithText("删除").performClick()
        compose.onNodeWithText("撤销").performClick()
        compose.onNode(title).assertExists()
        screen("space-undo")
        compose.onNodeWithTag("settings_button").performClick()
        compose.onNodeWithText("深色").performClick()
        screen("settings-dark")
        compose.runOnIdle { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.onNodeWithTag("tab_space").assertIsDisplayed()
        screen("space-dark")
    }
}
