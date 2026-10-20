import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppToaster } from '@/components/ui/AppToaster';
import { AuthProvider } from '@/contexts/AuthContext';
import { AutosaveProvider } from '@/contexts/AutosaveContext';

const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "900"], variable: "--font-inter", display: "swap" });

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
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">
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
