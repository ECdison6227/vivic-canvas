package app.vivic.remote

import app.vivic.remote.core.*
import app.vivic.remote.model.*
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import okhttp3.Cookie
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.*
import org.junit.Test

class ContractsTest {
    @Test fun pairingAcceptsOnlyTheExpectedOriginAndSingleCode() {
        val code = "Abc_1234-xyz"
        assertEquals(12, code.length)
        assertEquals(code, PairingParser.parse(code))
        assertEquals(code, PairingParser.parse("https://vivic.edsionc.top/?pair=$code"))
        listOf("http://vivic.edsionc.top/?pair=$code", "https://evil.test/?pair=$code", "https://vivic.edsionc.top.evil.test/?pair=$code",
            "https://user@vivic.edsionc.top/?pair=$code", "https://vivic.edsionc.top:444/?pair=$code",
            "https://vivic.edsionc.top/x?pair=$code", "https://vivic.edsionc.top/?pair=$code&pair=$code",
            "https://vivic.edsionc.top/?pair=$code#extra", "too-short").forEach { assertNull(it, PairingParser.parse(it)) }
    }
    @Test fun oneMalformedCardDoesNotDiscardOtherSnapshotCards() {
        val raw = javaClass.getResource("/fixtures/mixed.json")!!.readText()
        val value = JsonCodec.parseToJsonElement(raw).obj(); val space = value.objectAt("space")
        val damaged = JsonObject(value + ("space" to JsonObject(space + ("cards" to JsonArray(space.arrayAt("cards") + JsonPrimitive("broken"))))))
        val snapshot = Snapshot.from(damaged)
        assertTrue(snapshot.cards.any { it.type == "TodoCard" }); assertFalse(snapshot.cards.last().readable)
        assertEquals(space.arrayAt("cards").size + 1, snapshot.cards.size)
    }
    @Test fun externalImagesCannotReplaceTheAuthCookie() = runBlocking {
        val values = mutableMapOf<String, String>()
        val store = object : PrivateStore {
            override fun peek(name: String) = values[name]
            override suspend fun put(name: String, value: String?) { if (value == null) values.remove(name) else values[name] = value }
            override suspend fun clearSession() { values.clear() }
        }
        val own = "https://vivic.edsionc.top/".toHttpUrl(); val other = "https://images.example.test/".toHttpUrl()
        val jar = DeviceCookieJar(store).apply { restore(own) }
        val original = Cookie.parse(own, "__Host-vivic_space=TEST-original; Secure; HttpOnly; Path=/; Max-Age=120")!!
        jar.saveFromResponse(own, listOf(original))
        val queued = jar.binding(own)
        jar.saveFromResponse(other, listOf(Cookie.parse(other, "__Host-vivic_space=TEST-external; Secure; HttpOnly; Path=/; Max-Age=120")!!))
        assertEquals("TEST-original", jar.loadForRequest(own).single().value)
        assertTrue(jar.loadForRequest(other).isEmpty())
        assertTrue(jar.loadForRequest("http://vivic.edsionc.top/".toHttpUrl()).isEmpty())
        jar.clear(); assertTrue(jar.loadForRequest(own).isEmpty())
        jar.saveFromResponse(own, listOf(Cookie.parse(own, "__Host-vivic_space=TEST-new-account; Secure; HttpOnly; Path=/; Max-Age=120")!!))
        assertNotEquals(queued.generation, jar.generation)
        assertTrue(queued.header.contains("TEST-original")); assertFalse(queued.header.contains("TEST-new-account"))
    }
    @Test fun updateRejectsOtherOriginsBadHashesAndFutureManifestSchemas() {
        fun manifest(url: String = "https://vivic.edsionc.top/downloads/android/Vivic.apk", hash: String = "a".repeat(64), schema: Int = 1) = jsonObject(
            "schemaVersion" to schema, "stable" to jsonObject("android" to jsonObject("version" to "0.3.1", "versionCode" to 21,
                "url" to url, "sha256" to hash, "size" to 1000, "notes" to "TEST", "minSupportedVersionCode" to 20)))
        assertNotNull(UpdateInfo.parse(manifest(), 20))
        assertNull(UpdateInfo.parse(manifest("https://evil.test/downloads/Vivic.apk"), 20))
        assertNull(UpdateInfo.parse(manifest("http://vivic.edsionc.top/downloads/Vivic.apk"), 20))
        assertNull(UpdateInfo.parse(manifest(hash = "bad"), 20)); assertNull(UpdateInfo.parse(manifest(schema = 2), 20))
        assertNull(UpdateInfo.parse(manifest(), 21))
    }
    @Test fun cancelledDemoTaskDoesNotCreateCardsAndUndoRestoresTheSameCard() = runBlocking {
        val backend = DemoBackend(); val initial = backend.snapshot("demo_space")
        backend.send("demo_space", initial.version, "倒计时5分钟", "cancelled-task")
        backend.cancel("demo_space", "cancelled-task")
        assertEquals("cancelled", backend.task("demo_space", "cancelled-task").task.status)
        assertTrue(backend.snapshot("demo_space").cards.isEmpty())
        backend.send("demo_space", initial.version, "新建便笺：TEST", "complete-task")
        kotlinx.coroutines.delay(1350)
        val created = backend.task("demo_space", "complete-task").snapshot
        val id = created.cards.single().id
        val removed = backend.command("demo_space", created.version, jsonObject("type" to "card.delete", "cardId" to id))
        assertTrue(removed.cards.isEmpty())
        assertEquals(id, backend.command("demo_space", removed.version, jsonObject("type" to "history.undo")).cards.single().id)
    }
}
