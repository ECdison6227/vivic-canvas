package app.vivic.remote.core

import android.content.Context
import android.media.*
import android.os.Build
import android.util.Base64
import app.vivic.remote.model.obj
import app.vivic.remote.model.text
import app.vivic.remote.R
import kotlinx.coroutines.*
import kotlinx.serialization.json.JsonArray
import java.io.File
import java.util.UUID
import kotlin.coroutines.resume

class VoiceRecorder(private val context: Context) {
    private var recorder: MediaRecorder? = null
    private var file: File? = null
    @Suppress("DEPRECATION")
    fun start() {
        stop(cancel = true)
        val output = File(context.cacheDir, "voice_${UUID.randomUUID()}.m4a")
        val next = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else MediaRecorder()
        try {
            next.setAudioSource(MediaRecorder.AudioSource.MIC); next.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            next.setAudioEncoder(MediaRecorder.AudioEncoder.AAC); next.setAudioSamplingRate(16000); next.setAudioChannels(1)
            next.setAudioEncodingBitRate(64000); next.setMaxDuration(59000); next.setOutputFile(output.absolutePath)
            next.prepare(); next.start(); recorder = next; file = output
        } catch (error: Exception) { next.release(); output.delete(); throw error }
    }
    fun amplitude(): Float = runCatching { ((recorder?.maxAmplitude ?: 0) / 16000f).coerceIn(0f, 1f) }.getOrDefault(0f)
    fun stop(cancel: Boolean): File? {
        val value = recorder; val output = file; recorder = null; file = null
        var valid = false
        if (value != null) { valid = runCatching { value.stop(); true }.getOrDefault(false); value.release() }
        if (cancel || !valid || output == null || output.length() < 256) { output?.delete(); return null }
        return output
    }
}

/** Playback is only invoked by an explicit voice-reply preference and is stopped by new user input. */
class TtsPlayer(private val context: Context) {
    private var player: MediaPlayer? = null
    private var job: Job? = null
    fun stop() { job?.cancel(); job = null; player?.release(); player = null }
    fun speak(scope: CoroutineScope, api: VivicApi, text: String) {
        stop()
        job = scope.launch {
            try {
                val segments = api.speech(text)
                for (segment in segments) {
                    ensureActive()
                    val file = withContext(Dispatchers.IO) { File(context.cacheDir, "tts_${UUID.randomUUID()}.wav").apply {
                        writeBytes(Base64.decode(segment.obj().text("audio"), Base64.DEFAULT))
                    } }
                    try { play(file.absolutePath) } finally { withContext(NonCancellable + Dispatchers.IO) { file.delete() } }
                }
            } catch (_: CancellationException) { throw CancellationException() } catch (_: Exception) { /* Text remains available. */ }
        }
    }
    fun stall(scope: CoroutineScope) {
        stop()
        job = scope.launch {
            val id = listOf(R.raw.wait_one, R.raw.wait_two, R.raw.wait_three).random()
            val value = MediaPlayer.create(context, id) ?: return@launch
            player = value
            try { suspendCancellableCoroutine<Unit> { continuation ->
                value.setOnCompletionListener { if (continuation.isActive) continuation.resume(Unit) }
                value.setOnErrorListener { _, _, _ -> if (continuation.isActive) continuation.resume(Unit); true }
                continuation.invokeOnCancellation { value.release() }
                value.start()
            } } finally { if (player === value) { player = null; value.release() } }
        }
    }
    private suspend fun play(path: String) = suspendCancellableCoroutine<Unit> { continuation ->
        val value = MediaPlayer(); player = value
        value.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
        value.setDataSource(path)
        value.setOnPreparedListener { if (continuation.isActive) it.start() }
        value.setOnCompletionListener { if (continuation.isActive) continuation.resume(Unit); if (player === value) player = null; value.release() }
        value.setOnErrorListener { _, _, _ -> if (continuation.isActive) continuation.resume(Unit); if (player === value) player = null; value.release(); true }
        continuation.invokeOnCancellation { if (player === value) player = null; value.release() }
        value.prepareAsync()
    }
}
