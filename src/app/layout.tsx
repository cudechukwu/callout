import type { Metadata } from "next";
import { Big_Shoulders, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { AmbientBackdrop } from "@/components/AmbientBackdrop";
import { TopBar } from "@/components/TopBar";

const bigShoulders = Big_Shoulders({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-display",
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Five-Star MMA",
  description: "Draft eight fighters into one. See what you built. Then take on twenty in a row.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${bigShoulders.variable} ${plexSans.variable}`}>
      <body>
        <AmbientBackdrop />
        <TopBar />
        {children}
      </body>
    </html>
  );
}
