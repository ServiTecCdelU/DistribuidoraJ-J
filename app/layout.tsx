import React from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { RouteLoader } from "@/components/layout/route-loader";
import "@/app/globals.css";

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://distribuidora-patricia.vercel.app";
const SITE_NAME = "ServiTec";
const SITE_DESCRIPTION =
  "ServiTec — desarrollo de software de gestión para comercios, distribuidoras y kioscos en Concepción del Uruguay, Entre Ríos. Sistema de ventas, control de stock, cuenta corriente, comisiones, pedidos y facturación electrónica AFIP. Soluciones a medida para tu negocio.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "ServiTec — Sistemas de gestión para comercios y distribuidoras",
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  generator: "Next.js",
  keywords: [
    "ServiTec",
    "ServiTec Concepción del Uruguay",
    "software de gestión",
    "sistema de gestión",
    "sistema de ventas",
    "software para comercios",
    "software para distribuidoras",
    "software para kioscos",
    "sistema de stock",
    "control de stock",
    "cuenta corriente",
    "gestión de pedidos",
    "facturación electrónica AFIP",
    "software a medida",
    "desarrollo de software",
    "sistema de punto de venta",
    "Concepción del Uruguay",
    "Entre Ríos",
    "Argentina",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "technology",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "es_AR",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "ServiTec — Sistemas de gestión para comercios y distribuidoras",
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "ServiTec — Software de gestión para comercios y distribuidoras",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ServiTec — Sistemas de gestión para comercios y distribuidoras",
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
