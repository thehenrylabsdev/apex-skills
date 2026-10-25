# Master Engineering Specification: `ApexLedger` (Multi-Platform Enterprise Demo)

> **Purpose:** Demonstrate the full lifecycle of **`apex-skills`** (`/apex-router` -> `apex-grill` -> `/apex-statechart` -> `/apex-spec` -> `/apex-waves` -> `apex-tdd` -> `apex-verify` -> `apex-guard` -> `/apex-ship`) on a production-grade polyglot enterprise platform inside `examples/apex-ledger/`.

---

## 1. Product Concept & Technology Stack Matrix (2026 Latest / LTS)

**Product Name:** **`ApexLedger` — High-Concurrency Flash-Commerce, Inventory Reservation & Double-Entry Settlement Platform**

### 1.1. Business Problem
During high-concurrency flash drops (e.g., limited-edition hardware drops or institutional asset allocations), traditional architectures fail due to:
1. **Overselling & Race Conditions** on inventory counts under burst traffic.
2. **Duplicate Charges** when mobile clients retry mutations over flaky cellular networks.
3. **Dual-Write Inconsistencies** between relational order tables and settlement event streams.
4. **API Contract Drift & Un-Updated Mobile Crashes** when Backend adds fields or evolves payloads while older Android/iOS builds remain in the wild.
5. **State Drift** between Web, Android, and iOS clients when reservations expire mid-checkout.

### 1.2. Target Stack Matrix (Latest Versions & LTS)

| Platform Layer | Runtime / Language | Framework & Core Libraries | Verification & Quality Ratchets |
| :--- | :--- | :--- | :--- |
| **4. Backend (`backend`)** | **Java 25 LTS** (`25.0.4-amzn`) + **Gradle `9.7.1`** | **Spring Boot `4.1.2`**, **Spring Modulith `2.1.2`**, PostgreSQL, Apache Kafka, Redis, Lombok, MapStruct, SpringDoc OpenAPI 3.1 | JUnit 5, Mockito, **ArchUnit**, **Testcontainers**, **Producer Contract Tests**, **JaCoCo** |
| **1. Web App (`web-app`)** | **Node.js `24.x`** + **TypeScript `5.9` (`strict: true`)** | **Next.js `16.4.3`** (`create-next-app@latest`), **React `19.3.1`**, Tailwind CSS, `lucide-react`, Zod | ESLint Strict, `tsc --noEmit`, Vitest **Consumer Contract & Seam Tests**, WCAG 2.2 AA |
| **Shared Mobile Core (`shared-kmp`)** | **Kotlin `2.4.0` Multiplatform** + **Gradle `9.7.1`** | `kotlinx-coroutines`, `kotlinx-serialization` (`ignoreUnknownKeys = true`), Ktor Client (`3.x`), Deterministic `CheckoutStatechart` | `commonTest` **Mobile Consumer Contract Tests** (v1 + forward-compatible v2 payloads) + Statechart Transition Matrix |
| **2. Android App (`android-app`)** | **Kotlin `2.4.0`** | **Jetpack Compose** (Material 3 Expressive), **Jetpack Navigation 3**, **Adaptive Edge-to-Edge**, `:shared-kmp` | Compose Seam & Accessibility Audit (`>= 48x48dp` targets, vector icons, zero emojis) |
| **3. iOS App (`ios-app`)** | **Swift `6.4`** (`StrictConcurrency`) | **SwiftUI**, Native Observation, **SF Symbols**, Dynamic Type (`@ScaledMetric`), `SharedKmp` bridge | `swift test` ViewModel & Contract Seam Tests + Mobile WCAG (`>= 44x44pt` targets) |

---

## 2. Multi-Environment Architecture (`LOCAL`, `DEV`, `PROD`)

Every application in `examples/apex-ledger/` strictly implements the 3 enterprise deployment environments:

| Environment | Backend (`spring.profiles.active`) | Web (`NEXT_PUBLIC_APP_ENV`) | Mobile KMP / Android / iOS (`AppEnvironment`) | Infrastructure & Observability Profile |
| :--- | :--- | :--- | :--- | :--- |
| **`LOCAL`** | `application-local.yml` (Port `8080`, Virtual Threads, H2 PostgreSQL-compat / local Docker + embedded deterministic Redis/Kafka adapter for zero-daemon 1-command startup) | `.env.local` (`http://localhost:8080/api/v1` + live simulator controls enabled) | `AppEnvironment.LOCAL` (`http://10.0.2.2:8080/api/v1` Android / `http://localhost:8080/api/v1` iOS, verbose wire logging) | Verbose SQL/event tracing, Swagger UI enabled, burst simulator unlocked |
| **`DEV`** | `application-dev.yml` (Managed Dev PostgreSQL + Redis + Kafka cluster `dev-api.apexledger.internal`, Actuator health probes) | `.env.development` (`https://dev-api.apexledger.internal/api/v1`, telemetry debug banner) | `AppEnvironment.DEV` (`https://dev-api.apexledger.internal/api/v1`, 10s timeout, contract-version warning telemetry) | OpenTelemetry 100% sampling, staging burst simulator enabled |
| **`PROD`** | `application-prod.yml` (Production HikariCP pool, Redis TLS, Kafka `acks=all` + idempotent producer, Swagger disabled) | `.env.production` (`https://api.apexledger.io/api/v1`, strict CSP headers) | `AppEnvironment.PROD` (`https://api.apexledger.io/api/v1`, 5s timeout, TLS pinning metadata, strict retry backoff) | Structured JSON logs, zero debug endpoints, strict rate limiting |

---

## 3. Cross-Layer Contract Testing & Forward Compatibility Strategy

All 4 platforms share a single canonical contract directory (`examples/apex-ledger/contracts/`):
- `openapi-v1.json`: Canonical OpenAPI 3.1 contract.
- `campaigns-response.json`: Active flash-drop campaigns wire payload.
- `reservation-created.json`: `201 Created` reservation hold wire payload.
- `order-confirmed-settled.json`: `200 OK` settled order with double-entry receipt wire payload.
- `ledger-summary.json`: Double-entry audit summary wire payload.
- `problem-out-of-stock.json`: RFC 9457 `409 Conflict` ProblemDetails payload.
- `forward-compatible-v2-order.json`: Simulated Backend v2 payload containing newly added fields (`loyaltyPointsEarned`, `warehouseRoutingNode`, `unknownFutureMetadata`) and unrecognized optional fields to verify that **Mobile (`shared-kmp` & `ios-app`) and Web (`web-app`) never crash when Backend deploys additive API changes before mobile users update their apps**.

---

## 4. Formal Safety Invariants

1. **Conservation of Inventory (`Invariant 1`):** `RemainingStock + ReservedStock + SettledStock == InitialAllocation` and `RemainingStock >= 0` under arbitrary concurrency.
2. **Idempotent Mutation (`Invariant 2`):** Repeating `POST /api/v1/orders/reservations` or `POST /api/v1/orders/{id}/confirm` with the same `Idempotency-Key` returns the exact prior snapshot (`idempotentReplay: true`) without double-decrementing stock or double-posting ledger entries.
3. **Balanced Double-Entry Ledger (`Invariant 3`):** Every `SETTLED` order creates an immutable pair of ledger postings (`DEBIT 1100-BUYER-CLEARING`, `CREDIT 4000-MERCHANT-REVENUE`) where `SUM(DEBIT_CENTS) - SUM(CREDIT_CENTS) == 0`.
