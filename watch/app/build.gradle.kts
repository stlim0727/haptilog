plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

val releaseStore = file("release.keystore")
val releaseCredentials = listOf("KEYSTORE_PASSWORD", "KEY_ALIAS", "KEY_PASSWORD")
val hasReleaseSigning = releaseStore.exists() && releaseCredentials.all { !System.getenv(it).isNullOrBlank() }

android {
    namespace = "com.haptilog.watch"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.haptilog.watch"
        minSdk = 30 // Wear OS 3+ (Galaxy Watch 4 and later)
        targetSdk = 35
        versionCode = providers.environmentVariable("VERSION_CODE").orElse("1").get().toInt()
        versionName = "1.0.0"
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = releaseStore
                storePassword = System.getenv("KEYSTORE_PASSWORD")
                keyAlias = System.getenv("KEY_ALIAS")
                keyPassword = System.getenv("KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = if (hasReleaseSigning) signingConfigs.getByName("release") else null
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(libs.androidx.activity.compose)
    implementation(libs.guava)
    implementation(libs.androidx.core.ktx)
    implementation(libs.play.services.wearable)
    implementation(libs.play.services.location)

    // Compose for Wear OS
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.wear.compose.material)
    implementation(libs.androidx.wear.compose.foundation)
    debugImplementation(libs.androidx.compose.ui.tooling)

    // Wear Tiles
    implementation(libs.androidx.wear.tiles)
    implementation(libs.androidx.wear.protolayout)
    implementation(libs.androidx.wear.protolayout.material)

    // Lifecycle & Coroutines
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.kotlinx.coroutines.play.services)
}

// Never generate a publishable bundle with a debug or missing signing key.
tasks.matching { it.name == "bundleRelease" }.configureEach {
    doFirst { check(hasReleaseSigning) { "Release keystore and signing credentials are required" } }
}
