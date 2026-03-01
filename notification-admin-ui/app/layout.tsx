import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { Providers } from "./providers";
import { LayoutShell } from "./layout-shell";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    template: "%s | Notification Admin UI",
    default: "Notification Admin UI",
  },
  description:
    "Admin interface for the Notification API platform — manage rules, templates, channels, and monitor notifications.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <LayoutShell>{children}</LayoutShell>
        </Providers>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
