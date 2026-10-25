plugins {
    kotlin("jvm") version "2.4.0"
    kotlin("plugin.serialization") version "2.4.0"
}

group = "com.thehenrylabs.apexledger.android"
version = "1.0.0"

repositories {
    mavenCentral()
}

kotlin {
    jvmToolchain(25)
}

dependencies {
    implementation("com.thehenrylabs.apexledger:apex-ledger-shared-kmp:1.0.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.1")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.0")
    testImplementation(kotlin("test"))
}

tasks.test {
    useJUnitPlatform()
}
