---
version: alpha
name: "ApexLedger Precision"
description: "High-contrast institutional FinTech & Flash-Commerce Bento design system for Web, Android Compose, and iOS SwiftUI"
colors:
  primary: "#0F172A"
  on-primary: "#FFFFFF"
  secondary: "#1D4ED8"
  on-secondary: "#FFFFFF"
  tertiary: "#6D28D9"
  on-tertiary: "#FFFFFF"
  accent: "#0369A1"
  surface: "#FFFFFF"
  surface-subtle: "#F1F5F9"
  surface-elevated: "#FFFFFF"
  neutral: "#334155"
  neutral-light: "#F1F5F9"
  border: "#64748B"
  background: "#F8FAFC"
  focus-ring: "#1D4ED8"
  error: "#B91C1C"
  success: "#15803D"
typography:
  h1:
    fontFamily: "Plus Jakarta Sans, Inter, system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  h2:
    fontFamily: "Plus Jakarta Sans, Inter, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  h3:
    fontFamily: "Plus Jakarta Sans, Inter, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  body-lg:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.45
  caption:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.02em"
rounded:
  xs: "4px"
  sm: "6px"
  md: "10px"
  lg: "16px"
  xl: "24px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    rounded: "{rounded.md}"
    padding: "12px 24px"
    minHeight: "44px"
  button-primary-hover:
    backgroundColor: "#1E40AF"
  card:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
---

## Overview

**ApexLedger Precision** is a cross-platform institutional FinTech and high-concurrency Flash-Commerce design system built for the `ApexLedger` reference platform (Next.js 16.4 Web Storefront & SRE Command Center, Android Jetpack Compose, and iOS SwiftUI).

- **Brand Identity & Aesthetic Vibe**: Architectural precision, financial auditability, and tactile clarity. Inspired by modern financial terminals (Stripe, Linear, Ramp, and Bloomberg Bento interfaces).
- **Target Demographic**: Principal Engineers, FinTech operators, SRE teams, and high-intent flash-drop buyers who require instant visual confirmation of inventory locks, idempotency keys, and double-entry ledger balance proofs.
- **Trend Synthesis**: Incorporates structured Bento grid hierarchy, dual-coded status telemetry badges (vector icon + semantic text label), monospace cryptographic proof pills, tactile 1px high-contrast structural borders, and zero-shift statechart feedback.

## Colors

All color combinations strictly pass **WCAG 2.2 AA** (and mostly AAA) contrast requirements:

- **Primary (`#0F172A` on `#FFFFFF`)**: `17.85:1` contrast ratio (AAA). Used for primary headings, financial ledger figures, and dark command headers.
- **Secondary (`#1D4ED8` on `#FFFFFF`)**: `6.70:1` contrast ratio (AA). Used for primary interactive CTA buttons (`Reserve Inventory`, `Authorize & Settle`), active environment badges, and focus rings.
- **Tertiary (`#6D28D9` on `#FFFFFF`)**: `7.05:1` contrast ratio (AAA). Used for Spring Modulith event stream indicators and Kafka outbox telemetry badges.
- **Accent (`#0369A1` on `#FFFFFF`)**: `5.93:1` contrast ratio (AA). Used for Redis TTL countdown badges and idempotency replay indicators.
- **Neutral (`#334155` on `#FFFFFF`)**: `10.32:1` contrast ratio (AAA). Used for body copy, secondary labels, and table cells.
- **Border (`#64748B` on `#FFFFFF` / `#F8FAFC`)**: `4.76:1` / `4.50:1` contrast ratio (exceeds WCAG 2.2 SC 1.4.11 non-text 3.0:1 minimum). Used for card borders, input outlines, and ledger dividers.
- **Semantic Status Tokens**:
  - **Success (`#15803D` on `#FFFFFF`)**: `5.02:1` contrast ratio (AA). Used for `SETTLED` orders and balanced `DEBIT = CREDIT` ledger proofs.
  - **Error (`#B91C1C` on `#FFFFFF`)**: `6.47:1` contrast ratio (AA). Used for `409 Conflict` (`REJECTED_OUT_OF_STOCK`) and `410 Gone` (`EXPIRED`) alerts.

## Typography

- **Display & Headings (`Plus Jakarta Sans` / System Display)**: Tight negative tracking (`-0.03em` to `-0.02em`) with semi-bold and bold weights (`600`–`700`) for rapid scannability across Bento cards.
- **Body Copy (`Inter` / SF Pro / Roboto)**: Clean optical legibility at `1rem` (`16px`) and `0.875rem` (`14px`) with generous `1.5` line height.
- **Financial & Cryptographic Telemetry (`JetBrains Mono` / SF Mono)**: Used with `font-variant-numeric: tabular-nums` for SKU codes, `Idempotency-Key` UUIDs, millisecond latencies, stock counters, and USD cent-accurate ledger postings so numbers never jitter during real-time updates.

## Layout

- **Responsive Bento Grid**: 12-column CSS Grid on desktop (`max-width: 1280px`, `gap: 24px`), collapsing cleanly to a 2-column tablet layout (`768px`) and a single-column vertical stack down to `320px` viewport width without horizontal overflow (WCAG 2.2 SC 1.4.10).
- **Multi-Environment Command Bar**: Pinned top navigation bar displaying the active runtime environment (`LOCAL`, `DEV`, `PROD`), contract version (`2026-10-25`), and real-time ledger invariant status.
- **Mobile Safe Areas**: Android Jetpack Compose views enforce `WindowInsets.safeDrawing` edge-to-edge padding; iOS SwiftUI views respect safe area insets and `@ScaledMetric` Dynamic Type scaling.

## Elevation & Depth

- **Structural Borders over Muddy Shadows**: Cards use crisp `1px solid #64748B` (or `#CBD5E1` with high-contrast inner framing) paired with subtle ambient elevation (`0 1px 3px rgba(15, 23, 42, 0.08)`).
- **Interactive Focus Rings**: All interactive controls enforce a `2px solid #1D4ED8` focus ring with `2px` offset (`outline-offset: 2px`), achieving `6.70:1` contrast against light surfaces (WCAG 2.2 SC 2.4.11 & 2.4.13).

## Shapes

- **Cards & Bento Containers**: `16px` (`rounded.lg`) outer radius for primary Bento panels.
- **Buttons & Inputs**: `10px` (`rounded.md`) corner radius for tactile action controls.
- **Telemetry & Statechart Pills**: `9999px` (`rounded.full`) pill badges for `CheckoutPhase` states (`IDLE`, `RESERVING`, `RESERVED`, `PAYMENT_PROCESSING`, `CONFIRMED`, `SETTLED`, `REJECTED_OUT_OF_STOCK`).

## Components

- **Primary Action Button (`button-primary`)**: Minimum height `44px` on Web (`48dp` on Android, `44pt` on iOS), `#1D4ED8` background, `#FFFFFF` label, paired with a dedicated vector icon (`lucide-react` on Web, Material Vector on Android, SF Symbols on iOS).
- **Environment Switcher Pill**: Segmented control allowing operators to inspect and switch between `LOCAL`, `DEV`, and `PROD` profiles with explicit endpoint and contract-version telemetry.
- **Statechart Stepper Card**: Visualizes the 7 deterministic states of `CheckoutStatechart`, highlighting active holds, remaining TTL seconds, and cryptographic `Idempotency-Key` headers.
- **Double-Entry Settlement Ledger Table**: Displays paired `DEBIT` (`1100-BUYER-CLEARING`) and `CREDIT` (`4000-MERCHANT-REVENUE`) entries with a live zero-sum balance proof badge.

## Do's and Don'ts

- **DO**: Use dedicated vector icons exclusively (`lucide-react` on Web, Material Symbols/Vectors on Android, SF Symbols on iOS).
- **DO**: Dual-code every status indicator with both a distinct vector icon and an explicit text label (`RESERVED`, `SETTLED`, `OUT OF STOCK`) so status never relies on color alone (WCAG 1.4.1).
- **DO**: Maintain `>= 44x44px` (`48x48dp` Android / `44x44pt` iOS) touch targets on all interactive buttons and environment toggles.
- **DON'T**: **NEVER** use raw unicode emojis (such as rocket, lightning, chart, or checkmark emojis) anywhere in UI templates, buttons, badges, or navigation bars.
- **DON'T**: **NEVER** use low-contrast gray text (`#94A3B8` or lighter) on white backgrounds; all normal text must maintain `>= 4.5:1` contrast.
- **DON'T**: **NEVER** bypass `DESIGNS.md` tokens with arbitrary unvetted colors or unaligned spacing.
