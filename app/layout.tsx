import type { Metadata } from "next";
import { Inter, Inter_Tight, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";
import "./concept-b.css";

// Concept B type: Inter for text, Inter Tight for headings, Noto Sans
// Devanagari for Hindi and Marathi.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
});

const notoDeva = Noto_Sans_Devanagari({
  variable: "--font-noto-deva",
  subsets: ["devanagari"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Contractor Desk",
  description: "Find available contractors for residential projects in Pune.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable} ${notoDeva.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
