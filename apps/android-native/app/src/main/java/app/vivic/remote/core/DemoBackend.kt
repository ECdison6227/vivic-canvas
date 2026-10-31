package app.vivic.remote.core

import app.vivic.remote.model.*
import kotlinx.coroutines.delay
import kotlinx.serialization.json.*
import java.time.Instant
import java.util.UUID

/** Explicit offline presentation data. It never calls the network or writes the user's Space. */
class DemoBackend : WorkspaceBackend {
    private var version = 0L
    private var cards = emptyList<CardRecord>()
    private val history = ArrayDeque<List<CardRecord>>()
    private data class Job(val text: String, val created: Long, var cancelled: Boolean = false, var done: TaskResult? = null)
    private val jobs = mutableMapOf<String, Job>()
    private fun current() = Snapshot(SpaceSummary("demo_space", "演示空间", version), cards, listOf(SpaceSummary("demo_space", "演示空间", version)))
    override suspend fun spaces() = listOf(current().space)
    override suspend fun snapshot(id: String) = current()
    private fun record(type: String, props: JsonObject, source: JsonObject = jsonObject()): CardRecord {
        val id = "demo_${UUID.randomUUID()}"; val now = Instant.now().toString()
        return CardRecord.from(jsonObject("id" to id, "type" to type, "variant" to "expanded", "displayProps" to props, "sourceData" to source,
            "layout" to jsonObject("x" to 0, "y" to 0, "width" to 320, "height" to 160, "surface" to "display", "pinned" to false),
            "metadata" to jsonObject("createdAt" to now, "updatedAt" to now), "sources" to JsonArray(emptyList())), cards.size)
    }
    override suspend fun command(id: String, version: Long, command: JsonObject): Snapshot {
        if (version != this.version) throw ApiFailure(409, "version-conflict", "演示空间已有新变化，请重试")
        if (command.text("type") == "history.undo") {
            if (history.isEmpty()) throw ApiFailure(409, "history-empty", "没有可撤销的操作")
            cards = history.removeLast(); this.version++; return current()
        }
        val target = command.text("cardId"); val card = cards.find { it.id == target }
            ?: throw ApiFailure(409, "card-not-found", "这张卡片已不存在")
        history.addLast(cards)
        when (command.text("type")) {
            "card.delete" -> cards = cards.filter { it.id != target }
            "card.pin" -> cards = cards.map { if (it.id != target) it else CardRecord.from(JsonObject(it.raw +
                ("layout" to JsonObject(it.layout + ("pinned" to JsonPrimitive(command.flag("pinned")))))), 0) }
            "card.update" -> cards = cards.map { if (it.id != card.id) it else CardRecord.from(JsonObject(it.raw +
                ("displayProps" to JsonObject(it.props + command.objectAt("displayProps"))) +
                ("sourceData" to JsonObject(it.source + command.objectAt("sourceData")))), 0) }
            else -> { history.removeLast(); throw ApiFailure(400, "unsupported-command", "演示中暂不支持这项操作") }
        }
        this.version++; return current()
    }
    override suspend fun send(id: String, version: Long, text: String, requestId: String, continuation: String?): TaskResult {
        jobs.putIfAbsent(requestId, Job(text, System.currentTimeMillis()))
        return TaskResult(TaskRecord(requestId, "accepted", "正在准备演示…"), current())
    }
    override suspend fun task(id: String, taskId: String): TaskResult {
        val job = jobs[taskId] ?: return TaskResult(TaskRecord(taskId, "unknown", "演示任务已结束"), current())
        job.done?.let { return it }
        if (job.cancelled) return TaskResult(TaskRecord(taskId, "cancelled", "已停止演示任务"), current())
        if (System.currentTimeMillis() - job.created < 1300) return TaskResult(TaskRecord(taskId, "running", "正在整理…"), current())
        val text = job.text; val created = mutableListOf<CardRecord>()
        if (text.contains("天气")) created += record("WeatherCard", jsonObject("tempC" to 23, "conditionIcon" to "sun"), jsonObject("city" to "演示 · 上海", "condition" to "晴", "humidity" to 56, "wind" to "东南风 2级"))
        if (text.contains("待办") || text.contains("清单")) created += record("TodoCard", jsonObject("title" to "演示待办", "items" to JsonArray(listOf(
            jsonObject("id" to "demo_item_1", "text" to "准备演示材料", "done" to false),
            jsonObject("id" to "demo_item_2", "text" to "和团队确认进展", "done" to false)))))
        if (text.contains("倒计时") || text.contains("提醒")) {
            val minutes = Regex("(\\d{1,3})\\s*分钟").find(text)?.groupValues?.get(1)?.toLongOrNull() ?: 5L
            created += record("CountdownCard", jsonObject(), jsonObject("targetAt" to Instant.now().plusSeconds(minutes * 60).toString(), "startedAt" to Instant.now().toString()))
        }
        if (text.contains("新闻")) created += record("NewsCard", jsonObject("title" to "演示新闻", "items" to JsonArray(listOf(
            jsonObject("title" to "一张卡片，让想法更清晰", "source" to "演示内容", "time" to "刚刚"),
            jsonObject("title" to "在手机与大屏之间自由继续", "source" to "演示内容", "time" to "刚刚")))))
        if (text.contains("训练") || text.contains("健身")) created += record("ExtensionCard", jsonObject("def" to jsonObject("id" to "demo.fitness", "version" to "1.0.0", "hash" to "0".repeat(64)),
            "config" to jsonObject(), "state" to jsonObject(), "data" to jsonObject("minutes" to 40, "bodyPart" to "背部", "date" to "今天")))
        if (created.isEmpty()) created += record("NoteCard", jsonObject("text" to text.replace(Regex("^(新建|创建)?[便笺签笔记]+[：:，,\\s]*"), "").ifBlank { "记录一个新的想法。" }), jsonObject("title" to "演示便笺"))
        cards = cards + created; version++
        return TaskResult(TaskRecord(taskId, "succeeded", "演示：已放进工作空间。", created.map { it.id }, created.firstOrNull()?.id), current()).also { job.done = it }
    }
    override suspend fun cancel(id: String, taskId: String): TaskResult {
        jobs[taskId]?.cancelled = true
        return TaskResult(TaskRecord(taskId, "cancelled", "已停止演示任务"), current())
    }
    override suspend fun definitions(): List<JsonObject> = listOf(jsonObject("enabled" to true, "definition" to jsonObject(
        "hash" to "0".repeat(64), "manifest" to jsonObject("id" to "demo.fitness", "version" to "1.0.0", "name" to "训练记录"),
        "ui" to jsonObject("components" to JsonArray(listOf(jsonObject("component" to "Header", "text" to "演示 · 训练记录"),
            jsonObject("component" to "Metric", "label" to "分钟", "bind" to "/data/minutes"),
            jsonObject("component" to "KeyValue", "label" to "部位", "bind" to "/data/bodyPart")))))))
}
