# `ApexLedger` — Multi-Platform Enterprise Reference Suite

`ApexLedger` is a production-grade, high-concurrency Flash-Commerce, Inventory Reservation, and Double-Entry Financial Settlement platform built end-to-end using **`apex-skills`**.

---

## 1. Polyglot Architecture & 2026 Latest / LTS Stack

| Directory | Platform Layer | Runtime & Framework | Verification Suite |
| :--- | :--- | :--- | :--- |
| [`contracts/`](./contracts/) | **Canonical Seam Contract** | OpenAPI `3.1.0` + 6 Golden JSON Wire Fixtures (including `forward-compatible-v2-order.json`) | Shared Producer & Consumer Contract Verification |
| [`backend/`](./backend/) | **Enterprise Backend** | **Java 25 LTS** + **Spring Boot `4.1.2`** + **Spring Modulith `2.1.2`** + **Gradle `9.7.1`** + PostgreSQL + Kafka + Redis + Lombok + MapStruct + SpringDoc OpenAPI | **ArchUnit** + **Spring Modulith Verify** + **Producer Contract Tests** + **50-Thread Virtual-Thread Burst Race Test** + **JaCoCo** |
| [`shared-kmp/`](./shared-kmp/) | **Shared Mobile Core** | **Kotlin `2.4.0` Multiplatform** + `kotlinx-serialization` (`ignoreUnknownKeys = true`) + Deterministic `CheckoutStatechart` | `commonTest` **Mobile Consumer Contract Tests** (v1 + v2 Forward Compatibility) + Statechart Matrix |
| [`android-app/`](./android-app/) | **Android Native App** | **Kotlin `2.4.0`** + **Jetpack Compose** (Material 3) + **Jetpack Navigation 3** + Adaptive Edge-to-Edge + `:shared-kmp` | ViewModel + Navigation 3 Backstack + Shared KMP Contract Tests + Mobile WCAG 2.2 AA |
| [`ios-app/`](./ios-app/) | **iOS Native App** | **Swift `6.4`** (`StrictConcurrency`) + **SwiftUI** + **SF Symbols** + Dynamic Type (`@ScaledMetric`) | Native `swift test` Contract & Statechart Suite + Mobile WCAG 2.2 AA |
| [`web-app/`](./web-app/) | **Web Storefront & SRE Ops** | **Next.js `16.4.3`** (Turbopack) + **React `19.3.1`** + **TypeScript `5.9` Strict** + `lucide-react` | `tsc --noEmit` + `next build` + Web Consumer Contract Tests + Web WCAG 2.2 AA |

---

## 2. Three Mandatory Enterprise Environments (`LOCAL`, `DEV`, `PROD`)

Every layer supports explicit `LOCAL`, `DEV`, and `PROD` runtime profiles:

- **Backend (`examples/apex-ledger/backend/src/main/resources/`):**
  - `application-local.yml`: Zero-daemon 1-command startup on port `8080` using H2 in `MODE=PostgreSQL` and deterministic in-memory atomic locks.
  - `application-dev.yml`: Connects to managed Dev PostgreSQL (`:5432`), Redis (`:6379`), and Apache Kafka (`:9092`) with debug telemetry and Swagger UI enabled.
  - `application-prod.yml`: Production HikariCP connection pool (`max-pool-size: 50`), Redis TLS, Kafka `acks=all` + `enable.idempotence=true`, and Swagger UI disabled.
- **Web App (`examples/apex-ledger/web-app/`):**
  - `.env.local`, `.env.development`, `.env.production` + typed `src/config/env.ts` (`LOCAL | DEV | PROD` runtime selector in top command bar).
- **Mobile (`shared-kmp`, `android-app`, `ios-app`):**
  - `AppEnvironment.LOCAL`, `AppEnvironment.DEV`, and `AppEnvironment.PROD` controlling base URLs, request timeouts (`15s` / `10s` / `5s`), TLS certificate pinning, and burst simulator permissions.

---

## 3. Quickstart & Verification Commands

### 3.1. Verify & Run Backend (`Java 25 LTS` + `Spring Boot 4.1.2`)
```bash
cd examples/apex-ledger/backend
JAVA_HOME="/Users/thehenrylabs/.sdkman/candidates/java/25.0.4-amzn" gradle check --no-daemon
JAVA_HOME="/Users/thehenrylabs/.sdkman/candidates/java/25.0.4-amzn" gradle bootRun --args='--spring.profiles.active=local'
```

### 3.2. Verify Shared KMP Core (`Kotlin 2.4.0 Multiplatform`)
```bash
cd examples/apex-ledger/shared-kmp
JAVA_HOME="/Users/thehenrylabs/.sdkman/candidates/java/25.0.4-amzn" gradle check --no-daemon
```

### 3.3. Verify Android App (`Kotlin 2.4.0` + `Navigation 3` + `:shared-kmp`)
```bash
cd examples/apex-ledger/android-app
JAVA_HOME="/Users/thehenrylabs/.sdkman/candidates/java/25.0.4-amzn" gradle check --no-daemon
```

### 3.4. Verify iOS App (`Swift 6.4` + `SwiftUI`)
```bash
cd examples/apex-ledger/ios-app
swift test
```

### 3.5. Verify & Run Web App (`Next.js 16.4.3` + `React 19.3.1`)
```bash
cd examples/apex-ledger/web-app
npm install
npm run quality
npm run build
npm run dev
```

For the complete step-by-step engineering walkthrough of how `apex-skills` designed, scheduled, tested, and verified `ApexLedger`, read [`docs/CASE-STUDY-APEX-LEDGER.md`](../../docs/CASE-STUDY-APEX-LEDGER.md).
