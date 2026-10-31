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
