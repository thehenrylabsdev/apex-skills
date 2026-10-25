plugins {
    kotlin("multiplatform") version "2.4.0"
    kotlin("plugin.serialization") version "2.4.0"
}

group = "com.thehenrylabs.apexledger"
version = "1.0.0"

repositories {
    mavenCentral()
}

kotlin {
    jvmToolchain(25)

    jvm()

    sourceSets {
        commonMain.dependencies {
            implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.0")
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.1")
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
        }
    }
}
