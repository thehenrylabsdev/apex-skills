import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ApexLedger | High-Concurrency Flash-Commerce & Double-Entry Settlement",
  description:
    "Multi-platform reference architecture built with apex-skills: Java 25, Spring Boot 4.1.2, Next.js 16.4.3, Kotlin 2.4.0 Multiplatform, and Swift 6.4.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>): ReactElement {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
