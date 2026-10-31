package app.vivic.remote.ui.components

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.*
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.vivic.remote.ui.icons.harkGlyph
import app.vivic.remote.ui.theme.*
import dev.chrisbanes.haze.*

@Composable fun HarkIcon(name: String, description: String?, modifier: Modifier = Modifier.size(18.dp), tint: Color = LocalVivicColors.current.ink) {
    Icon(painterResource(harkGlyph(name)), description, modifier, tint)
}
@Composable fun PressIconButton(icon: String, description: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val colors = LocalVivicColors.current; val source = remember { MutableInteractionSource() }; val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed && LocalMotionEnabled.current) .97f else 1f, spring(.6f, 500f), label = "press")
    Box(modifier.size(48.dp).scale(scale).clip(CircleShape).clickable(source, indication = null, enabled = enabled, onClick = onClick), Alignment.Center) {
        Box(Modifier.size(44.dp).background(colors.glass.copy(alpha = if (enabled) colors.glass.alpha else .2f), CircleShape), Alignment.Center) {
            HarkIcon(icon, description, Modifier.size(18.dp).alpha(if (enabled) 1f else .3f))
        }
    }
}
@Composable fun GlassSurface(modifier: Modifier = Modifier, radius: androidx.compose.ui.unit.Dp = 24.dp,
    blur: Boolean = true, content: @Composable BoxScope.() -> Unit) {
    val colors = LocalVivicColors.current; val context = LocalContext.current
    val lowRam = remember { (context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).isLowRamDevice }
    val state = LocalHaze.current
    val shape = remember(radius) { ContinuousCornerShape(radius) }
    val material = if (blur && state != null && Build.VERSION.SDK_INT >= 31 && !lowRam)
        Modifier.hazeEffect(state, HazeStyle(backgroundColor = colors.canvas, tints = listOf(HazeTint(colors.glass)), blurRadius = 50.dp, noiseFactor = 0f))
    else Modifier.background(if (blur) colors.solid else colors.panel)
    Box(modifier.clip(shape).then(material).border(.5.dp, colors.stroke, shape), content = content)
}
@Composable fun ActionButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val colors = LocalVivicColors.current
    Button(onClick = onClick, enabled = enabled, modifier = modifier.heightIn(min = 52.dp),
        shape = ContinuousCornerShape(26.dp), colors = ButtonDefaults.buttonColors(containerColor = colors.ink, contentColor = colors.onInk),
        contentPadding = PaddingValues(horizontal = 28.dp, vertical = 14.dp)) { Text(text, fontWeight = FontWeight.Medium, color = if (enabled) colors.onInk else colors.secondary) }
}

/** Native sweep layers follow the existing Vivic orb palette, with no remote images or shaders. */
@Composable fun VivicOrb(modifier: Modifier = Modifier.size(200.dp), state: String = "idle", amplitude: Float = 0f) {
    val motion = LocalMotionEnabled.current
    val transition = rememberInfiniteTransition(label = "orb")
    val angle by transition.animateFloat(0f, 360f, infiniteRepeatable(tween(if (state == "thinking") 3000 else 12000, easing = LinearEasing)), label = "orb-angle")
    val breath by transition.animateFloat(1f, 1.06f, infiniteRepeatable(tween(1200, easing = Motion.EaseInOut), RepeatMode.Reverse), label = "orb-breath")
    val scale = if (!motion) 1f else if (state == "listening") 1f + amplitude.coerceIn(0f, 1f) * .12f else if (state == "thinking") breath else 1f
    val pink = if (state == "error") Color(0xFFE05862) else Color(0xFFED599C)
    val palette = listOf(pink, Color(0xFF55BED7), Color(0xFF8A65E8), Color(0xFFE58EDA), pink)
    Box(modifier.scale(scale).clip(CircleShape).background(Color(0xFFECE4F7))) {
        Canvas(Modifier.fillMaxSize().graphicsLayer { rotationZ = if (motion) angle else 25f }) {
            drawCircle(Brush.sweepGradient(palette))
            drawCircle(Brush.radialGradient(listOf(Color(0xFFC6EEFF).copy(alpha = .95f), Color.Transparent),
                center = Offset(size.width * .2f, size.height * .3f), radius = size.width * .8f))
            drawCircle(Brush.radialGradient(listOf(Color(0xFF7150E4).copy(alpha = .8f), Color.Transparent),
                center = Offset(size.width * .7f, size.height * .85f), radius = size.width * .75f))
        }
        Canvas(Modifier.fillMaxSize()) {
            drawCircle(Brush.radialGradient(listOf(Color.White.copy(alpha = .8f), Color.Transparent),
                center = Offset(size.width * .28f, size.height * .18f), radius = size.width * .6f))
            drawCircle(Brush.radialGradient(listOf(Color.Transparent, Color.Black.copy(alpha = .12f)), radius = size.width * .64f))
        }
    }
}
