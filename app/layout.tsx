import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ChatWidget } from "@/components/ChatWidget";
import { FluidBackground } from "@/components/FluidBackground";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Ikosagon | Software & AI, built around your business",
    template: "%s | Ikosagon",
  },
  description:
    "Ikosagon learns your business, connects your tools and data, improves how work gets done, and adds AI carefully, so you save time without risking what already works.",
  openGraph: {
    title: "Ikosagon | Software & AI, built around your business",
    description:
      "Ikosagon learns your business, connects your tools and data, improves how work gets done, and adds AI carefully, so you save time without risking what already works.",
    url: "/",
    siteName: "Ikosagon",
    images: [{ url: "/opengraph-image" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ikosagon | Software & AI, built around your business",
    description:
      "Ikosagon learns your business, connects your tools and data, improves how work gets done, and adds AI carefully, so you save time without risking what already works.",
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <body className="relative min-h-full flex flex-col bg-background text-foreground">
        <FluidBackground />
        <div className="relative z-10 flex min-h-full flex-1 flex-col">
          <Nav />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
        <ChatWidget />
      </body>
    </html>
  );
}
