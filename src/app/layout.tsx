import type { Metadata } from "next";
import { Barlow_Condensed, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
  variable: "--font-training-display",
});

const body = IBM_Plex_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-training-body",
});

const siteName = "Charlie Waghmare";
const description = "Personal site of Charlie Waghmare.";
const socialImageAlt =
  "Charlie Waghmare — CW monogram with topographic contours and racetrack curves.";

export const metadata: Metadata = {
  metadataBase: new URL("https://charliewaghmare.com"),
  title: {
    default: siteName,
    template: `%s · ${siteName}`,
  },
  applicationName: siteName,
  description,
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" },
    ],
  },
  openGraph: {
    title: siteName,
    description,
    url: "https://charliewaghmare.com",
    siteName,
    type: "website",
    images: [
      {
        url: "/social-preview.png",
        width: 1200,
        height: 630,
        alt: socialImageAlt,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteName,
    description,
    images: [
      {
        url: "/social-preview.png",
        width: 1200,
        height: 630,
        alt: socialImageAlt,
      },
    ],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} h-full bg-[#f5f6f8] antialiased`}
    >
      <body className="training-type training-theme training-meet min-h-full">
        {children}
      </body>
    </html>
  );
}
