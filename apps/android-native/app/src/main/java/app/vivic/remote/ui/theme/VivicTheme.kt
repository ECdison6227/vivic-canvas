package app.vivic.remote.ui.theme

import android.database.ContentObserver
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.*
import androidx.compose.ui.unit.*
import app.vivic.remote.R
import dev.chrisbanes.haze.HazeState
import coil3.ImageLoader
import kotlin.math.min

data class VivicColors(val dark: Boolean) {
    val ink = if (dark) Color(0xFFF5F5F7) else Color(0xFF1D1D1F)
    val secondary = ink.copy(alpha = .5f)
    val tertiary = ink.copy(alpha = .3f)
    val onInk = if (dark) Color(0xFF1D1D1F) else Color(0xFFF9F9FA)
    val canvas = if (dark) Color(0xFF293149) else Color(0xFFC0D2E0)
    val panel = if (dark) Color(0xFF1D1D1F).copy(alpha = .618f) else Color.White.copy(alpha = .668f)
    val solid = if (dark) Color(0xFF24252B) else Color.White.copy(alpha = .96f)
    val glass = if (dark) Color(0xFF1D1D1F).copy(alpha = .618f) else Color.White.copy(alpha = .55f)
    val userBubble = if (dark) Color(0xFF1D1D1F).copy(alpha = .30f) else Color.White.copy(alpha = .30f)
    val agentBubble = if (dark) Color(0xFF1D1D1F).copy(alpha = .70f) else Color.White.copy(alpha = .98f)
    val stroke = ink.copy(alpha = .07f)
    val accent = if (dark) Color(0xFFA1D0FF) else Color(0xFF2B729E)
    val focus = Color(0xFF84BAFF)
}
val LocalVivicColors = staticCompositionLocalOf { VivicColors(false) }
val LocalMotionEnabled = staticCompositionLocalOf { true }
val LocalHaze = staticCompositionLocalOf<HazeState?> { null }
val LocalVivicImageLoader = staticCompositionLocalOf<ImageLoader?> { null }

object Motion {
    val EaseOut = CubicBezierEasing(.21f, .47f, .32f, .98f)
    val EaseInOut = CubicBezierEasing(.65f, 0f, .35f, 1f)
    val Emphasized = CubicBezierEasing(.2f, 0f, 0f, 1f)
}

/** Port of the retained Hark continuous corner helper (curve factor 1.528665). */
class ContinuousCornerShape(private val radius: Dp) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val width = size.width; val height = size.height
        val r = min(with(density) { radius.toPx() }, min(width, height) / 2)
        if (r <= 0) return Outline.Rectangle(androidx.compose.ui.geometry.Rect(0f, 0f, width, height))
        val factor = 1.528665f; val sx = min(factor * r, width / 2); val sy = min(factor * r, height / 2)
        fun coefficients(length: Float): Pair<Float, Float> {
            val n = ((length / r - 1) / (factor - 1)).coerceIn(0f, 1f)
            return Pair(r * (.96f + (1.08849f - .96f) * n), r * (.82f + (.868407f - .82f) * n))
        }
        val c = Pair(.631494f * r, .074911f * r); val l = Pair(.372824f * r, .16906f * r)
        val path = Path()
        fun corner(x: Float, y: Float, ex: Float, ey: Float, nx: Float, ny: Float) {
            val first = coefficients(if (ex != 0f) sx else sy); val last = coefficients(if (nx != 0f) sx else sy)
            fun xx(a: Float, b: Float) = x + ex * a + nx * b
            fun yy(a: Float, b: Float) = y + ey * a + ny * b
            path.cubicTo(xx(first.first, 0f), yy(first.first, 0f), xx(first.second, 0f), yy(first.second, 0f), xx(c.first, c.second), yy(c.first, c.second))
            path.cubicTo(xx(l.first, l.second), yy(l.first, l.second), xx(l.second, l.first), yy(l.second, l.first), xx(c.second, c.first), yy(c.second, c.first))
            path.cubicTo(xx(0f, last.second), yy(0f, last.second), xx(0f, last.first), yy(0f, last.first), xx(0f, if (nx != 0f) sx else sy), yy(0f, if (nx != 0f) sx else sy))
        }
        path.moveTo(sx, 0f); path.lineTo(width - sx, 0f); corner(width, 0f, -1f, 0f, 0f, 1f)
        path.lineTo(width, height - sy); corner(width, height, 0f, -1f, -1f, 0f)
        path.lineTo(sx, height); corner(0f, height, 1f, 0f, 0f, -1f)
        path.lineTo(0f, sy); corner(0f, 0f, 0f, 1f, 1f, 0f); path.close()
        return Outline.Generic(path)
    }
}

private val VivicFont = FontFamily(Font(R.font.gt_regular, FontWeight.Normal), Font(R.font.gt_medium, FontWeight.Medium),
    Font(R.font.gt_semibold, FontWeight.SemiBold), Font(R.font.gt_bold, FontWeight.Bold))
@Composable fun VivicTheme(mode: String = "system", content: @Composable () -> Unit) {
    val dark = mode == "dark" || mode == "system" && isSystemInDarkTheme()
    val colors = remember(dark) { VivicColors(dark) }
    val context = LocalContext.current
    fun motionAllowed() = Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) != 0f
    var motion by remember { mutableStateOf(motionAllowed()) }
    DisposableEffect(context) {
        val observer = object : ContentObserver(Handler(Looper.getMainLooper())) { override fun onChange(selfChange: Boolean) { motion = motionAllowed() } }
        context.contentResolver.registerContentObserver(Settings.Global.getUriFor(Settings.Global.ANIMATOR_DURATION_SCALE), false, observer)
        onDispose { context.contentResolver.unregisterContentObserver(observer) }
    }
    val scheme = if (dark) darkColorScheme(primary = colors.ink, onPrimary = colors.onInk, surface = colors.solid, onSurface = colors.ink,
        background = colors.canvas, onBackground = colors.ink, secondary = colors.accent)
    else lightColorScheme(primary = colors.ink, onPrimary = colors.onInk, surface = colors.solid, onSurface = colors.ink,
        background = colors.canvas, onBackground = colors.ink, secondary = colors.accent)
    val base = TextStyle(fontFamily = VivicFont, fontSize = 15.sp, lineHeight = 19.sp, color = colors.ink)
    CompositionLocalProvider(LocalVivicColors provides colors, LocalMotionEnabled provides motion) {
        MaterialTheme(colorScheme = scheme, typography = Typography(bodyLarge = base, bodyMedium = base.copy(fontSize = 14.sp, lineHeight = 18.sp),
            bodySmall = base.copy(fontSize = 13.sp, lineHeight = 16.sp), titleLarge = base.copy(fontSize = 20.sp, lineHeight = 24.sp, fontWeight = FontWeight.Medium),
            titleMedium = base.copy(fontWeight = FontWeight.Medium), labelLarge = base.copy(fontWeight = FontWeight.Medium),
            labelMedium = base.copy(fontSize = 13.sp, lineHeight = 16.sp), labelSmall = base.copy(fontSize = 12.sp, lineHeight = 12.sp),
            displayLarge = base.copy(fontSize = 48.sp, lineHeight = 58.sp)), content = content)
    }
}
