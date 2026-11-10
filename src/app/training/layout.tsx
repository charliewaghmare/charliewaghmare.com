import { Geist_Mono, Playfair_Display } from "next/font/google";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: "500",
  display: "swap",
  adjustFontFallback: true,
  variable: "--font-playfair",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: true,
  variable: "--font-geist-mono",
});

export default function TrainingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${playfair.variable} ${geistMono.variable} training-type training-theme`}>
      {children}
    </div>
  );
}
