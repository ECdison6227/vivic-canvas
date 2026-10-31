# Vivic Android native

Kotlin + Jetpack Compose application, developed on `feat/android-native`.
The current P0 screen only checks that the native toolchain builds and starts;
the approved Hark visual system and connection flow belong to P1.

## Build

Use JDK 21 and Android SDK platform 35, with Build Tools 36.0.0. Set
`ANDROID_HOME` to the local SDK directory, or create an ignored `local.properties`
containing `sdk.dir=C\:/path/to/android/sdk` (escape the Windows drive colon).

```powershell
cd apps/android-native
.\gradlew.bat :app:assembleDebug :app:lintDebug --write-locks
```

The package is `app.vivic.remote`, version `0.3.0` (20), minimum API 26.
P0 debug APKs use the local debug certificate. Do not uninstall an existing
Vivic installation to work around a signature mismatch; P4 verifies the approved
0.2.0 signing key and the upgrade path. Never modify other emulator applications.

Dependency versions are pinned in `gradle/libs.versions.toml` and resolved
dependencies in `app/gradle.lockfile`. SDK 35 compatibility limits AndroidX
Activity to 1.10.1; newer versions require SDK 36. AGP 9.5 uses built-in Kotlin,
with the Kotlin JVM plugin on the root classpath to select Kotlin 2.4.21.

The P0 API runner accepts only a private, explicitly marked evaluation session.
No credentials, cookies, signing keys, or live unredacted snapshots belong in Git.

For a real voice check, first connect the evaluation account through the normal
model APIs and prepare a synthetic AAC/MPEG_4 sample (16kHz mono, 64kbps).
Run from the repository root, passing only a private session-file path:

```powershell
node apps/android-native/scripts/verify-p0.mjs --credentials .cache/android-p0/credentials-private.json --output docs/android/evidence/P0/api-model-supplement.json --audio .cache/android-p0/speech-sample.m4a --expected-phrase "五分钟"
```

The expected phrase is checked after punctuation and single-digit Chinese-number
normalization. HTTP success alone does not establish transcription correctness.
Reference checks follow a clarification when required and verify that the existing
card changed without an extra card appearing. Failed targeting stays a failed check.
When sending UTF-8 scripts through Windows PowerShell stdin, set `$OutputEncoding`
to UTF-8 or run a UTF-8 source file directly; the default ASCII pipe corrupts Chinese.
