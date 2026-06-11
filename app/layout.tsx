import React from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { RouteLoader } from "@/components/layout/route-loader";
import "@/app/globals.css";

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://distribuidorajj.vercel.app";
const SITE_NAME = "Distribuidora J&J";
const SITE_DESCRIPTION =
  "Distribuidora J&J — venta mayorista y minorista de productos de almacén, bebidas, limpieza, kiosco y golosinas en San José y la región. Precios mayoristas, amplio stock, reparto y atención personalizada.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Venta mayorista y minorista de almacén, bebidas y kiosco`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  generator: "Next.js",
  keywords: [
    "Distribuidora J&J",
    "distribuidora",
    "distribuidora mayorista",
    "venta mayorista",
    "venta minorista",
    "almacén",
    "bebidas",
    "gaseosas",
    "limpieza",
    "kiosco",
    "golosinas",
    "fiambres",
    "reparto a domicilio",
    "precios mayoristas",
    "San José",
    "Entre Ríos",
    "Argentina",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "shopping",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "es_AR",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Venta mayorista y minorista`,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} — Distribuidora mayorista y minorista`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Venta mayorista y minorista`,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-64.png", sizes: "64x64", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`font-sans antialiased`} suppressHydrationWarning>
        <RouteLoader />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
