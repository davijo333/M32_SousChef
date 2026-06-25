import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/Providers";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sous Chef",
  description: "Your AI sous chef for menu & inventory",
  icons: {
    icon: "/brand/app-logo/icon.png",
    apple: "/brand/app-logo/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} min-h-screen bg-chef-cream font-sans text-chef-text antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
