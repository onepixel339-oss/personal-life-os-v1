import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Newsreader, Noto_Kufi_Arabic, Noto_Naskh_Arabic } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
});

const notoNaskhArabic = Noto_Naskh_Arabic({
  variable: "--font-arabic-serif",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
});

const notoKufiArabic = Noto_Kufi_Arabic({
  variable: "--font-arabic-sans",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
});

/* Pre-hydration: apply the saved language direction before React mounts,
   so the first paint is already RTL for Arabic users (no layout flash). */
const langBootstrapScript = `(function(){try{var l=localStorage.getItem("lifeos.lang");if(l==="ar"){document.documentElement.lang="ar";document.documentElement.dir="rtl";}}catch(e){}})();`;

export const metadata: Metadata = {
  title: "Personal Life OS · نظام الحياة الشخصي",
  description:
    "Your life, your structure — حياتك، بهيكلٍ من عندك. A calm, flexible personal environment for daily planning, weekly focus, spaces, notes and memory.",
  applicationName: "Personal Life OS",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e9dfd2" },
    { media: "(prefers-color-scheme: dark)", color: "#261e18" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: langBootstrapScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} ${notoNaskhArabic.variable} ${notoKufiArabic.variable} antialiased bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  );
}
