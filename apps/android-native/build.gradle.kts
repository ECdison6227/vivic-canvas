plugins {
    alias(libs.plugins.android.application) apply false
    // Raise AGP's built-in Kotlin to the same stable version as the Compose compiler.
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.compose.compiler) apply false
}
