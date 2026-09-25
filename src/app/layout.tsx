import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";
import { PwaProvider } from "@/features/pwa/PwaProvider";
import { AuthGate } from "@/features/auth/AuthGate";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const display = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: "Atelier",
  manifest: "/pwa/manifest.webmanifest",
  title: "Atelier — Gestion d'atelier de couture",
  description:
    "Logiciel de gestion premium pour ateliers de couture : clients, commandes, paiements, rendez-vous, stock.",
  icons: {
    icon: [{ url: "/pwa/icon.svg", type: "image/svg+xml", sizes: "any" }],
    apple: [
      { url: "/pwa/icon.svg", type: "image/svg+xml", sizes: "any" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Atelier",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#3E2723",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${inter.variable} ${display.variable}`}>
      <body>
        <PwaProvider>
          <AuthGate>{children}</AuthGate>
        </PwaProvider>
      </body>
    </html>
  );
}