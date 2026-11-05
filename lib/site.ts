/**
 * The one canonical origin. Vercel already 308-redirects www.ikosagon.com to this bare host,
 * so canonical tags, og:url, the sitemap and robots.txt all point here (never at www).
 */
export const SITE_URL = "https://ikosagon.com";

/**
 * Open Graph block for a page. Next replaces (does not merge) the layout's openGraph, so each
 * page sets its own full block with url matching its canonical, never the homepage.
 */
export function pageOpenGraph(path: string, title: string, description: string) {
  return {
    title: `${title} | Ikosagon`,
    description,
    url: path,
    siteName: "Ikosagon",
    images: [{ url: "/opengraph-image" }],
    type: "website" as const,
  };
}
