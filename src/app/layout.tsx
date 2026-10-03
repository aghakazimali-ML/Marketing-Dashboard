import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import { DASHBOARD_NAME } from "@/lib/brand";
import { Providers } from "@/components/providers/providers";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

// Per-request CSP nonces require dynamic rendering (static HTML cannot carry a fresh nonce).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: DASHBOARD_NAME,
  description: `${DASHBOARD_NAME} dashboard for social media and website performance insights.`,
  icons: {
    icon: "/favicon.svg",
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
      className={`${dmSans.variable} ${fraunces.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full" suppressHydrationWarning>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
