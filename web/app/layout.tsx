import type { Metadata } from "next";
import { JetBrains_Mono, Playfair_Display, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// Display / headline serif — high-contrast, editorial.
const display = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

// Body serif — highly readable long-form.
const serif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-serif",
  display: "swap",
});

// Labels, metadata, technical details.
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mend — sports rehab evidence",
  description: "Agent-assisted summarizer of PubMed evidence for sports injuries.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${serif.variable} ${mono.variable}`}>
      <body className="font-serif antialiased">{children}</body>
    </html>
  );
}
