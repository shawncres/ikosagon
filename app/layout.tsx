import type { Metadata } from "next";
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
  metadataBase: new URL("https://www.ikosagon.com"),
  title: {
    default: "Ikosagon | AI systems, edge & process upgrades",
    template: "%s | Ikosagon",
  },
  description:
    "Ikosagon designs and ships RAG, agentic systems, edge/IoT software, and CRM-grade integrations for lean production workflows.",
  openGraph: {
    title: "Ikosagon | AI systems, edge & process upgrades",
    description:
      "Ikosagon designs and ships RAG, agentic systems, edge/IoT software, and CRM-grade integrations for lean production workflows.",
    url: "https://www.ikosagon.com",
    siteName: "Ikosagon",
    images: [{ url: "/opengraph-image" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ikosagon | AI systems, edge & process upgrades",
    description:
      "Ikosagon designs and ships RAG, agentic systems, edge/IoT software, and CRM-grade integrations for lean production workflows.",
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
