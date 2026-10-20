import type { Metadata } from "next";
import { Inter, Open_Sans } from "next/font/google";
import "./globals.css";
import { AppToaster } from '@/components/ui/AppToaster';
import { ThemeSync } from '@/components/ui/ThemeSync';
import { AuthProvider } from '@/contexts/AuthContext';
import { AutosaveProvider } from '@/contexts/AutosaveContext';
import { THEME_INIT_SCRIPT } from '@/lib/theme';

// UI face
const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "900"], variable: "--font-inter", display: "swap" });
// Reading face for note content (CNOTE-15)
const openSans = Open_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-open-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ComNotes",
  description: "A secure note-taking application",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // data-theme is set by the head script before hydration, so React must not flag it
    <html lang="en" className={`${inter.variable} ${openSans.variable}`} suppressHydrationWarning>
      <head>
        {/* Applies the stored or system theme before first paint (no flash). A constant from
            lib/theme.ts passed as a plain string child, which React supports for <script> */}
        <script>{THEME_INIT_SCRIPT}</script>
      </head>
      <body className="font-sans antialiased">
        <ThemeSync />
        <AutosaveProvider>
          <AuthProvider>
            {children}
            <AppToaster />
          </AuthProvider>
        </AutosaveProvider>
      </body>
    </html>
  );
}
