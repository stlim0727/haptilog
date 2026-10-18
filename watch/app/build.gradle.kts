import java.util.Properties
import java.util.Base64

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

val releaseStore = file("release.keystore")
val releaseCredentials = listOf("KEYSTORE_PASSWORD", "KEY_ALIAS", "KEY_PASSWORD")
val hasReleaseSigning = releaseStore.exists() && releaseCredentials.all { !System.getenv(it).isNullOrBlank() }

val cloudDefaults = Properties().apply {
    rootProject.file("cloud.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}
fun publicSetting(name: String): String = providers.environmentVariable(name)
    .filter { it.isNotBlank() }.orElse(cloudDefaults.getProperty(name, "")).get()
val publicKey = publicSetting("HAPTILOG_SUPABASE_PUBLISHABLE_KEY")
check(!publicKey.startsWith("sb_secret_")) { "Only public Supabase keys may be included in the watch" }
if (publicKey.count { it == '.' } == 2) {
    val claims = runCatching { String(Base64.getUrlDecoder().decode(publicKey.split('.')[1])) }.getOrDefault("")
    check(!claims.contains("service_role")) { "Service role keys must never be included in the watch" }
}
fun quoted(value: String) = "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

android {
    namespace = "com.haptilog.watch"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.haptilog.watch"
        minSdk = 30 // Wear OS 3+ (Galaxy Watch 4 and later)
        targetSdk = 35
        versionCode = providers.environmentVariable("VERSION_CODE").orElse("1").get().toInt()
        versionName = "1.1.2"
        buildConfigField("String", "WEB_PORTAL_URL", quoted(providers.environmentVariable("HAPTILOG_WEB_PORTAL_URL").orElse("https://haptilog.keepory.app").get()))
        buildConfigField("String", "SUPABASE_URL", quoted(publicSetting("HAPTILOG_SUPABASE_URL")))
        buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", quoted(publicSetting("HAPTILOG_SUPABASE_PUBLISHABLE_KEY")))
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

    testOptions { unitTests.isIncludeAndroidResources = true }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.work)
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.fragment.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.guava)
    implementation(libs.play.services.wearable)
    implementation(libs.play.services.location)

    // Compose for Wear OS
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.wear.compose.material)
    implementation(libs.androidx.wear.compose.foundation)
    debugImplementation(libs.androidx.compose.ui.tooling)

    // Wear Tiles & Complications
    implementation(libs.androidx.wear.tiles)
    implementation(libs.androidx.wear.protolayout)
    implementation(libs.androidx.wear.protolayout.material)
    implementation(libs.androidx.wear.watchface.complications.data.source)

    // Lifecycle & Coroutines
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.kotlinx.coroutines.play.services)
}

// Never generate a publishable bundle with a debug or missing signing key.
tasks.matching { it.name == "bundleRelease" }.configureEach {
    doFirst { check(hasReleaseSigning) { "Release keystore and signing credentials are required" } }
}
