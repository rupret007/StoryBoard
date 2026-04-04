import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-app",
  display: "swap"
});

export const metadata: Metadata = {
  title: "StoryBoard",
  description: "AI-assisted operating system for bands and artists."
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className={sans.variable}>
      <body className={`${sans.className} min-h-screen antialiased`}>
        {children}
      </body>
    </html>
  );
}
