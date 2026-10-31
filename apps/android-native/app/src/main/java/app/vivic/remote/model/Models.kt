package app.vivic.remote.model

import kotlinx.serialization.json.*

val JsonCodec = Json { ignoreUnknownKeys = true; isLenient = false }
fun JsonElement?.obj(): JsonObject = this as? JsonObject ?: JsonObject(emptyMap())
fun JsonElement?.arr(): JsonArray = this as? JsonArray ?: JsonArray(emptyList())
fun JsonObject.text(key: String, default: String = ""): String = (this[key] as? JsonPrimitive)?.contentOrNull ?: default
fun JsonObject.number(key: String, default: Double = 0.0): Double = (this[key] as? JsonPrimitive)?.doubleOrNull ?: default
fun JsonObject.flag(key: String, default: Boolean = false): Boolean = (this[key] as? JsonPrimitive)?.booleanOrNull ?: default
fun JsonObject.objectAt(key: String) = this[key].obj()
fun JsonObject.arrayAt(key: String) = this[key].arr()

data class Session(val authenticated: Boolean, val userId: String = "", val username: String = "", val deviceId: String = "", val deviceName: String = "") {
    companion object {
        fun from(value: JsonObject) = Session(value.flag("authenticated"), value.objectAt("user").text("id"),
            value.objectAt("user").text("username"), value.objectAt("device").text("id"), value.objectAt("device").text("name"))
    }
}
data class SpaceSummary(val id: String, val title: String, val version: Long) {
    companion object { fun from(value: JsonObject) = SpaceSummary(value.text("id"), value.text("title", "工作空间"), value.number("version").toLong()) }
}
data class CardRecord(val id: String, val type: String, val raw: JsonObject, val readable: Boolean = true) {
    val props get() = raw.objectAt("displayProps")
    val source get() = raw.objectAt("sourceData")
    val layout get() = raw.objectAt("layout")
    val metadata get() = raw.objectAt("metadata")
    val pinned get() = layout.flag("pinned")
    val updatedAt get() = metadata.text("updatedAt")
    val title: String get() = props.text("title").ifBlank { source.text("title") }.ifBlank {
        source.objectAt("event").text("title").ifBlank { source.text("reminderText") }
    }.ifBlank { when (type) {
        "WeatherCard" -> source.text("city").ifBlank { source.text("location", "天气") }
        "TodoCard" -> "待办"; "CountdownCard" -> "倒计时"; "NoteCard" -> "便笺"; "NewsCard" -> "新闻"
        "ExtensionCard" -> "卡片"
        "SearchResultCard" -> "查询结果"; "TableCard" -> "表格"; "ChartCard" -> "图表"
        else -> "卡片"
    } }
    companion object {
        fun from(value: JsonElement, index: Int): CardRecord {
            val raw = value.obj(); val id = raw.text("id")
            return CardRecord(id.ifBlank { "unsupported_$index" }, raw.text("type", "Unknown"), raw,
                id.isNotBlank() && raw["displayProps"] is JsonObject && raw["layout"] is JsonObject)
        }
    }
}
data class Snapshot(val space: SpaceSummary, val cards: List<CardRecord>, val spaces: List<SpaceSummary>, val version: Long = space.version) {
    val displayCards get() = cards.filter { it.layout.text("surface") != "user" }
        .sortedWith(compareByDescending<CardRecord> { it.pinned }.thenByDescending { it.updatedAt })
    companion object {
        fun from(value: JsonObject): Snapshot {
            val space = value.objectAt("space")
            return Snapshot(SpaceSummary.from(space), space.arrayAt("cards").mapIndexed { index, card -> CardRecord.from(card, index) },
                value.arrayAt("spaces").map { SpaceSummary.from(it.obj()) })
        }
    }
}
data class TaskRecord(val id: String, val status: String, val message: String, val createdCardIds: List<String> = emptyList(), val focusCardId: String? = null) {
    val terminal get() = status !in listOf("accepted", "running")
    companion object {
        fun from(value: JsonObject) = TaskRecord(value.text("id"), value.text("status", "unknown"), value.text("message"),
            value.arrayAt("createdCardIds").mapNotNull { (it as? JsonPrimitive)?.contentOrNull }, value.text("focusCardId").takeIf { it.isNotBlank() })
    }
}
data class TaskResult(val task: TaskRecord, val snapshot: Snapshot) {
    companion object { fun from(value: JsonObject) = TaskResult(TaskRecord.from(value.objectAt("task")), Snapshot.from(value.objectAt("snapshot"))) }
}
data class ChatMessage(val id: String, val user: Boolean, val text: String, val state: String = "done", val cardIds: List<String> = emptyList(), val originalText: String? = null)
data class ConnectedDevice(val id: String, val name: String, val current: Boolean)
data class Notice(val id: Long, val text: String, val undo: Boolean = false)
data class ProviderState(val stepfun: Boolean = false, val deepseek: Boolean = false, val voice: Boolean = false)
data class DisplayState(val online: Boolean = false, val sleeping: Boolean = false)

fun jsonObject(vararg values: Pair<String, Any?>): JsonObject = buildJsonObject {
    values.forEach { (key, value) -> when (value) {
        null -> Unit
        is JsonElement -> put(key, value)
        is Boolean -> put(key, value)
        is Number -> put(key, JsonPrimitive(value))
        else -> put(key, value.toString())
    } }
}
