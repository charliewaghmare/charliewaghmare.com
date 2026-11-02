import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://charliewaghmare.com"),
  title: "Charlie Waghmare",
  description: "Personal site of Charlie Waghmare.",
  openGraph: {
    title: "Charlie Waghmare",
    description: "Personal site of Charlie Waghmare.",
    url: "https://charliewaghmare.com",
    siteName: "Charlie Waghmare",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} h-full bg-stone-50 antialiased dark:bg-stone-950`}
    >
      <body className="min-h-full bg-stone-50 font-sans text-stone-900 dark:bg-stone-950 dark:text-stone-100">
        {children}
      </body>
    </html>
  );
}
