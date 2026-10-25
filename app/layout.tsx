import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Franchise Desk",
  description: "Franchise partner selection, geo-allocation and onboarding engine",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
