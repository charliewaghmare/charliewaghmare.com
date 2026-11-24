import { Barlow_Condensed, IBM_Plex_Sans } from "next/font/google";

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

export default function TrainingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${display.variable} ${body.variable} training-type training-theme training-meet`}>
      {children}
    </div>
  );
}
