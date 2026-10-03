import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { PwaProvider } from "@/features/pwa/PwaProvider";
import { AuthGate } from "@/features/auth/AuthGate";
import { BRAND_NAME, BRAND_TAGLINE } from "@/config/brand";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  variable: "--font-dm-mono",
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: BRAND_NAME,
  manifest: "/pwa/manifest.webmanifest",
  title: { default: `${BRAND_NAME} — ${BRAND_TAGLINE}`, template: `%s — ${BRAND_NAME}` },
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
    title: BRAND_NAME,
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1F1A15",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${manrope.variable} ${bricolage.variable} ${dmMono.variable}`}>
      <body>
        <PwaProvider>
          <AuthGate>{children}</AuthGate>
        </PwaProvider>
      </body>
    </html>
  );
}