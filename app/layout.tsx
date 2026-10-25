import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk, Newsreader, Noto_Sans_Kannada, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";

const ui = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const display = Newsreader({ subsets: ["latin"], variable: "--font-display", display: "swap", style: ["normal", "italic"] });
const kannada = Noto_Sans_Kannada({ subsets: ["kannada"], variable: "--font-kannada", display: "swap", weight: ["400", "600"] });
const devanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--font-devanagari", display: "swap", weight: ["400", "600"] });

export const metadata: Metadata = {
  title: "Franchise Desk",
  description: "Decides every franchise application, explains why, and plans onboarding for partners who move forward.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f1ea" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1b24" },
  ],
};

// Applies a saved theme before paint. Storage is optional; failures fall back to the system theme.
const themeInit = `try{var t=localStorage.getItem("fd-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${ui.variable} ${display.variable} ${kannada.variable} ${devanagari.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
