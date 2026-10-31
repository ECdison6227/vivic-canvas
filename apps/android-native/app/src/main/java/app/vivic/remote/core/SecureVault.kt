package app.vivic.remote.core

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import android.util.Base64
import app.vivic.remote.model.JsonCodec
import app.vivic.remote.model.obj
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.*
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private val Context.vivicPreferences by preferencesDataStore("vivic_private")

/** The only persistent auth storage. Ciphertext and IV are separate from the non-exportable Keystore key. */
interface PrivateStore {
    fun peek(name: String): String?
    suspend fun put(name: String, value: String?)
    suspend fun clearSession()
}
class SecureVault(private val context: Context) : PrivateStore {
    private val lock = Mutex()
    private val field = stringPreferencesKey("encrypted_v1")
    @Volatile private var values: Map<String, String> = emptyMap()
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey("vivic_private_v1", null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("vivic_private_v1", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    suspend fun load() = lock.withLock {
        values = try {
            val saved = context.vivicPreferences.data.first()[field] ?: return@withLock
            val bytes = Base64.decode(saved, Base64.NO_WRAP)
            require(bytes.size > 12)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
            JsonCodec.parseToJsonElement(String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8)).obj()
                .mapValues { (_, value) -> value.jsonPrimitive.content }
        } catch (_: Exception) { emptyMap() }
    }
    override fun peek(name: String): String? = values[name]
    override suspend fun put(name: String, value: String?) = update { if (value == null) remove(name) else put(name, value) }
    override suspend fun clearSession() = update { keys.filter { it == "cookies" || it.startsWith("model:") || it == "account_id" || it == "account_name" }.forEach { remove(it) } }
    private suspend fun update(change: MutableMap<String, String>.() -> Unit) = lock.withLock {
        val next = values.toMutableMap().apply(change)
        if (next == values) return@withLock
        val text = buildJsonObject { next.forEach { (key, value) -> put(key, value) } }.toString()
        val encoded = withContext(Dispatchers.IO) {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
            Base64.encodeToString(cipher.iv + cipher.doFinal(text.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
        }
        context.vivicPreferences.edit { it[field] = encoded }
        values = next
    }
}
