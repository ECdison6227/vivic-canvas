plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.compose.compiler)
}

android {
    namespace = "app.vivic.remote"
    compileSdk = 35
    buildToolsVersion = "36.0.0"

    defaultConfig {
        applicationId = "app.vivic.remote"
        minSdk = 26
        targetSdk = 35
        versionCode = providers.gradleProperty("vivicVersionCode").orNull?.toInt() ?: 20
        versionName = providers.gradleProperty("vivicVersionName").orNull ?: "0.3.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        providers.gradleProperty("vivicAbis").orNull?.split(',')?.filter { it.isNotBlank() }?.let { ndk.abiFilters.addAll(it) }
    }

    buildFeatures { compose = true; buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    val storePath = providers.environmentVariable("VIVIC_ANDROID_KEYSTORE").orNull
    if (!storePath.isNullOrBlank()) {
        signingConfigs.create("vivic") {
            storeFile = file(storePath)
            storePassword = providers.environmentVariable("VIVIC_ANDROID_STORE_PASSWORD").orNull
            keyAlias = providers.environmentVariable("VIVIC_ANDROID_KEY_ALIAS").orNull ?: "vivic-development"
            keyPassword = providers.environmentVariable("VIVIC_ANDROID_KEY_PASSWORD").orNull ?: storePassword
            storeType = "PKCS12"
        }
        buildTypes.getByName("release").signingConfig = signingConfigs.getByName("vivic")
    }
    dependencyLocking { lockAllConfigurations() }
}

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.activity.compose)
    implementation(libs.lifecycle.runtime.compose)
    implementation(libs.lifecycle.process)
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.core.ktx)
    implementation(libs.okhttp)
    implementation(libs.serialization.json)
    implementation(libs.coroutines.android)
    implementation(libs.datastore)
    implementation(libs.haze)
    implementation(libs.coil)
    implementation(libs.coil.network)
    implementation(libs.camera.core)
    implementation(libs.camera.camera2)
    implementation(libs.camera.lifecycle)
    implementation(libs.camera.view)
    implementation(libs.barcode)
    implementation(libs.splash)
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.ui.tooling.preview)
    debugImplementation(libs.compose.ui.tooling)
    debugImplementation(libs.compose.ui.test.manifest)
    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)
    testImplementation(libs.mockwebserver)
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.ui.test)
    androidTestImplementation(libs.android.test.runner)
}
