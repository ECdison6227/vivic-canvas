package app.vivic.remote.ui.components

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.view.HapticFeedbackConstants
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.*
import app.vivic.remote.AppViewModel
import app.vivic.remote.model.*
import app.vivic.remote.ui.theme.*
import coil3.compose.AsyncImage
import kotlinx.coroutines.delay
import kotlinx.serialization.json.*
import java.time.Instant
import kotlin.math.max

private fun cardGlyph(type: String) = when (type) { "WeatherCard" -> "sun"; "TodoCard" -> "check"; "CountdownCard" -> "clock"; "NoteCard" -> "note"; "NewsCard" -> "news"; else -> "apps" }
@OptIn(ExperimentalFoundationApi::class)
@Composable fun CardTile(card: CardRecord, vm: AppViewModel, definitions: List<JsonObject>, modifier: Modifier = Modifier,
    compact: Boolean = false, focused: Boolean = false, fresh: Boolean = false, focusNonce: Long = 0) {
    val colors = LocalVivicColors.current; val view = LocalView.current
    val focus = LocalFocusManager.current
    val title = if (card.type == "ExtensionCard") definitions.firstOrNull { it.objectAt("definition").text("hash") == card.props.objectAt("def").text("hash") }
        ?.objectAt("definition")?.objectAt("manifest")?.text("name")?.ifBlank { card.title } ?: card.title else card.title
    var menu by remember(card.id) { mutableStateOf(false) }; var expanded by remember(card.id) { mutableStateOf(false) }
    var highlight by remember(card.id) { mutableStateOf(fresh || focused) }
    LaunchedEffect(fresh, focused, focusNonce) { highlight = fresh || focused; if (highlight) { delay(1200); highlight = false } }
    val stroke by animateColorAsState(if (highlight) colors.focus else Color.Transparent, tween(if (LocalMotionEnabled.current) 1200 else 80), label = "card-focus")
    Box(modifier) {
        GlassSurface(Modifier.fillMaxWidth().border(if (highlight) 1.5.dp else 0.dp, stroke, ContinuousCornerShape(24.dp))
            .combinedClickable(onClick = { focus.clearFocus(); if (compact) vm.focus(card.id) else if (card.type == "NoteCard") expanded = !expanded },
                onLongClick = if (compact || !card.readable) null else { { menu = true; view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS) } }), blur = false) {
            Column(Modifier.fillMaxWidth().padding(horizontal = if (compact) 18.dp else 22.dp, vertical = if (compact) 14.dp else 20.dp), verticalArrangement = Arrangement.spacedBy(if (compact) 8.dp else 14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    HarkIcon(cardGlyph(card.type), null, Modifier.size(16.dp), colors.secondary)
                    Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    if (card.pinned) HarkIcon("pin", "已置顶", Modifier.size(14.dp), colors.secondary)
                }
                if (!card.readable) FallbackCard(card, compact) else when (card.type) {
                    "WeatherCard" -> WeatherContent(card, compact)
                    "TodoCard" -> TodoContent(card, compact) { vm.toggleTodo(card, it) }
                    "CountdownCard" -> CountdownContent(card, compact)
                    "NoteCard" -> Text(card.props.text("text").ifBlank { card.props.arrayAt("bullets").joinToString("\n") { "• ${valueText(it)}" } },
                        maxLines = if (compact) 2 else if (expanded) Int.MAX_VALUE else 8, overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.bodyLarge.copy(lineHeight = 24.sp))
                    "NewsCard" -> NewsContent(card, compact)
                    "ExtensionCard" -> ExtensionContent(card, definitions, compact)
                    "TableCard" -> NativeTable(card.props.arrayAt("columns").map { valueText(it) }, card.props.arrayAt("rows"), compact)
                    "SearchResultCard", "QuoteCard", "BookCard", "NotificationCard", "LinkPreviewCard" -> {
                        Text(card.props.text("summary").ifBlank { card.props.text("text") }.ifBlank { card.props.text("quote") }.ifBlank { card.props.text("description") },
                            maxLines = if (compact) 2 else 8, overflow = TextOverflow.Ellipsis)
                    }
                    "ProgressRingCard" -> ProgressContent(card.props.number("value").toFloat(), card.props.text("label"), compact)
                    else -> FallbackCard(card, compact)
                }
            }
        }
        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }, shape = ContinuousCornerShape(24.dp),
            containerColor = colors.solid, tonalElevation = 0.dp, shadowElevation = 12.dp,
            modifier = Modifier.widthIn(min = 180.dp)) {
            DropdownMenuItem(text = { Text(if (card.pinned) "取消置顶" else "置顶") }, onClick = {
                menu = false; vm.cardCommand(jsonObject("type" to "card.pin", "cardId" to card.id, "pinned" to !card.pinned))
            }, leadingIcon = { HarkIcon("pin", null) })
            DropdownMenuItem(text = { Text("在大屏聚焦") }, onClick = { menu = false; vm.display("focus", card.id) }, leadingIcon = { HarkIcon("screen", null) })
            DropdownMenuItem(text = { Text("删除", color = Color(0xFFD64545)) }, onClick = {
                menu = false; vm.cardCommand(jsonObject("type" to "card.delete", "cardId" to card.id))
            }, leadingIcon = { HarkIcon("trash", null, tint = Color(0xFFD64545)) })
        }
    }
}

@Composable private fun WeatherContent(card: CardRecord, compact: Boolean) {
    val colors = LocalVivicColors.current
    val label = when (card.props.text("conditionIcon")) { "sun" -> "晴"; "cloud" -> "多云"; "rain" -> "雨"; "snow" -> "雪"; "wind" -> "大风"; "fog" -> "雾"; "storm" -> "雷雨"; "night" -> "晴夜"; else -> "" }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text("${card.props.number("tempC").toInt()}°", style = if (compact) MaterialTheme.typography.titleLarge else MaterialTheme.typography.displayLarge)
        Text(card.source.text("condition").ifBlank { label }, color = colors.secondary)
    }
    if (!compact) {
        val extras = listOfNotNull((card.source["humidity"] as? JsonPrimitive)?.contentOrNull?.let { "湿度 $it%" },
            card.source.text("wind").takeIf { it.isNotBlank() })
        if (extras.isNotEmpty()) Text(extras.take(2).joinToString("   ·   "), style = MaterialTheme.typography.bodySmall, color = colors.secondary)
    }
}
@Composable private fun TodoContent(card: CardRecord, compact: Boolean, toggle: (String) -> Unit) {
    val colors = LocalVivicColors.current; val items = card.props.arrayAt("items")
    if (!compact) Text("${items.count { it.obj().flag("done") }} / ${items.size} 已完成", style = MaterialTheme.typography.bodySmall, color = colors.secondary)
    Column {
        items.take(if (compact) 1 else 5).forEach { value -> val item = value.obj()
            Row(Modifier.fillMaxWidth().heightIn(min = if (compact) 28.dp else 44.dp), verticalAlignment = Alignment.CenterVertically) {
                if (!compact) Checkbox(item.flag("done"), onCheckedChange = { toggle(item.text("id")) }, modifier = Modifier.size(48.dp).offset(x = (-10).dp).semantics { contentDescription = item.text("text") })
                Text(item.text("text"), color = if (item.flag("done")) colors.tertiary else colors.ink,
                    style = MaterialTheme.typography.bodyLarge.copy(textDecoration = if (item.flag("done")) androidx.compose.ui.text.style.TextDecoration.LineThrough else null),
                    maxLines = if (compact) 1 else 3, overflow = TextOverflow.Ellipsis)
            }
        }
        if (!compact && items.size > 5) Text("另有 ${items.size - 5} 项", color = colors.secondary, style = MaterialTheme.typography.bodySmall)
    }
}
@Composable private fun CountdownContent(card: CardRecord, compact: Boolean) {
    val colors = LocalVivicColors.current; val view = LocalView.current
    val target = runCatching { Instant.parse(card.source.text("targetAt")).toEpochMilli() }.getOrNull()
    val start = runCatching { Instant.parse(card.source.text("startedAt")).toEpochMilli() }.getOrNull()
    val paused = runCatching { Instant.parse(card.source.text("pausedAt")).toEpochMilli() }.getOrNull()
    var now by remember(card.id) { mutableLongStateOf(System.currentTimeMillis()) }; var wasRunning by remember(card.id) { mutableStateOf(target != null && target > now) }
    LaunchedEffect(target, paused) { while (true) { now = System.currentTimeMillis(); if (wasRunning && paused == null && target != null && now >= target) {
        view.performHapticFeedback(if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY); wasRunning = false
    }; delay(1000) } }
    val remaining = target?.let { max(0L, it - (paused ?: now)) / 1000 }
    val text = when { remaining == null -> "时间待确认"; remaining >= 86400 -> "${remaining / 86400}天"; remaining >= 3600 -> "%02d:%02d:%02d".format(remaining / 3600, remaining / 60 % 60, remaining % 60); else -> "%02d:%02d".format(remaining / 60, remaining % 60) }
    if (compact) Text(text, style = MaterialTheme.typography.titleLarge) else Box(Modifier.fillMaxWidth(), Alignment.Center) {
        Box(Modifier.size(168.dp), Alignment.Center) {
            if (target != null && start != null && target > start) Canvas(Modifier.fillMaxSize().padding(4.dp)) {
                drawArc(colors.ink.copy(alpha = .07f), -90f, 360f, false, style = Stroke(3.dp.toPx()))
                val progress = ((target - (paused ?: now)).toFloat() / (target - start)).coerceIn(0f, 1f)
                drawArc(if (remaining == 0L) Color(0xFFD64545) else colors.accent, -90f, progress * 360f, false,
                    style = Stroke(3.dp.toPx(), cap = StrokeCap.Round))
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(text, style = MaterialTheme.typography.displayLarge.copy(fontSize = if (text.length > 5) 34.sp else 44.sp),
                    color = if (remaining == 0L) Color(0xFFD64545) else colors.ink)
                if (paused != null) Text("已暂停", style = MaterialTheme.typography.bodySmall, color = colors.secondary)
            }
        }
    }
}
@Composable private fun NewsContent(card: CardRecord, compact: Boolean) {
    val colors = LocalVivicColors.current
    val items = card.props.arrayAt("items").ifEmpty { card.source.arrayAt("items") }
    if (items.isEmpty()) Text(card.props.text("summary").ifBlank { card.props.text("headline") }, maxLines = if (compact) 2 else 8, overflow = TextOverflow.Ellipsis)
    else Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        items.take(if (compact) 1 else 5).forEach { value -> val item = value.obj()
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(item.text("title"), maxLines = 3, overflow = TextOverflow.Ellipsis)
                Text(listOf(item.text("source"), item.text("time")).filter { it.isNotBlank() }.joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = colors.secondary)
            }
        }
    }
}
@Composable private fun FallbackCard(card: CardRecord, compact: Boolean) {
    val values = card.props.values.filterIsInstance<JsonPrimitive>().mapNotNull { it.contentOrNull }.filter { it.isNotBlank() }.take(if (compact) 1 else 3)
    values.forEach { Text(it, maxLines = if (compact) 2 else 4, overflow = TextOverflow.Ellipsis) }
    if (!compact) Text("在电脑上查看完整内容", style = MaterialTheme.typography.bodySmall, color = LocalVivicColors.current.secondary)
}
private fun pointer(root: JsonElement, path: String): JsonElement? {
    if (!Regex("^/(config|data|state)(/[^/]{1,100}){0,12}$").matches(path)) return null
    var value: JsonElement? = root
    for (part in path.drop(1).split('/')) {
        val key = part.replace("~1", "/").replace("~0", "~")
        if (key in listOf("__proto__", "constructor", "prototype")) return null
        value = when (val current = value) { is JsonObject -> current[key]; is JsonArray -> key.toIntOrNull()?.let { current.getOrNull(it) }; else -> null }
    }
    return value
}
private fun valueText(value: JsonElement?): String = when (value) {
    is JsonPrimitive -> value.contentOrNull ?: "—"
    is JsonObject -> value.text("text").ifBlank { value.text("title") }.ifBlank { value.text("label") }.ifBlank { value.text("name", "—") }
    else -> "—"
}
@Composable private fun ExtensionContent(card: CardRecord, definitions: List<JsonObject>, compact: Boolean) {
    val colors = LocalVivicColors.current; val context = LocalContext.current; val ref = card.props.objectAt("def")
    val row = definitions.firstOrNull { row -> val definition = row.objectAt("definition"); val manifest = definition.objectAt("manifest")
        row.flag("enabled") && definition.text("hash") == ref.text("hash") && manifest.text("id") == ref.text("id") && manifest.text("version") == ref.text("version") }
    val definition = row?.objectAt("definition")
    if (definition == null) { Text("卡片定义暂不可用，请在电脑上检查", color = colors.secondary); return }
    val blocks = definition.objectAt("ui").arrayAt("components")
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        blocks.take(if (compact) 2 else 32).forEach { item -> val block = item.obj()
            val value = if (block["text"] != null) block["text"] else pointer(card.props, block.text("bind"))
            val label = block.text("label"); val text = valueText(value)
            when (block.text("component")) {
                "Header" -> Text(text, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                "KeyValue" -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(label, color = colors.secondary, modifier = Modifier.weight(1f)); Text(text, modifier = Modifier.weight(1f)) }
                "Metric" -> Column { Text(text, style = if (compact) MaterialTheme.typography.titleLarge else MaterialTheme.typography.displayLarge); if (label.isNotBlank()) Text(label, style = MaterialTheme.typography.bodySmall, color = colors.secondary) }
                "List" -> value.arr().take(if (compact) 1 else 12).forEach { Text("• ${valueText(it)}", maxLines = 4) }
                "Badge" -> Text(text, Modifier.clip(CircleShape).background(colors.ink.copy(alpha = .06f)).padding(horizontal = 10.dp, vertical = 6.dp), style = MaterialTheme.typography.bodySmall)
                "Image" -> {
                    val url = if (text.startsWith("/api/")) "https://vivic.edsionc.top$text" else text
                    val loader = LocalVivicImageLoader.current
                    if (!compact && url.startsWith("https://") && loader != null) AsyncImage(url, label.ifBlank { "卡片图片" }, loader,
                        Modifier.fillMaxWidth().heightIn(max = 220.dp).clip(ContinuousCornerShape(18.dp)))
                }
                "Link" -> if (text.startsWith("https://")) Text(label.ifBlank { text }, color = colors.accent, modifier = Modifier.heightIn(min = 48.dp).clickable {
                    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(text))) }
                }.padding(vertical = 12.dp), maxLines = 2)
                "Table" -> { val columns = block.arrayAt("columns"); val rows = value.arr().map { rowValue -> JsonArray(columns.map { rowValue.obj()[it.obj().text("field")] ?: JsonNull }) }
                    NativeTable(columns.map { it.obj().text("label") }, JsonArray(rows), compact) }
                "Progress" -> ProgressContent((value as? JsonPrimitive)?.floatOrNull ?: 0f, label, compact)
            }
        }
    }
}
@Composable private fun NativeTable(columns: List<String>, rows: JsonArray, compact: Boolean) {
    val colors = LocalVivicColors.current
    Column(Modifier.horizontalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row { columns.take(8).forEach { Text(it, Modifier.width(112.dp), color = colors.secondary, style = MaterialTheme.typography.bodySmall) } }
        rows.take(if (compact) 1 else 20).forEach { row -> Row { row.arr().take(8).forEach { Text(valueText(it), Modifier.width(112.dp), maxLines = 3, overflow = TextOverflow.Ellipsis) } } }
    }
}
@Composable private fun ProgressContent(value: Float, label: String, compact: Boolean) {
    val normalized = if (value > 1) value / 100f else value
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (label.isNotBlank()) Text(label, style = MaterialTheme.typography.bodySmall, color = LocalVivicColors.current.secondary)
        Text("${(normalized.coerceIn(0f, 1f) * 100).toInt()}%", style = if (compact) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge)
        LinearProgressIndicator(progress = { normalized.coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth(), color = LocalVivicColors.current.accent)
    }
}
