import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from 'react-hot-toast';
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
            {/* Quiet toasts: small white cards, bottom centre, only for things that need attention */}
            <Toaster
              position="bottom-center"
              gutter={8}
              toastOptions={{
                duration: 4000,
                style: {
                  background: 'var(--canvas)',
                  color: 'var(--ink)',
                  borderRadius: 'var(--radius-xl)',
                  boxShadow: 'var(--elevation-raised)',
                  padding: '12px 16px',
                  fontSize: '14px',
                  lineHeight: '20px',
                  maxWidth: 'min(28rem, calc(100vw - 32px))',
                },
                success: { iconTheme: { primary: 'var(--positive)', secondary: 'var(--canvas)' } },
                error: { duration: 6000, iconTheme: { primary: 'var(--negative)', secondary: 'var(--canvas)' } },
              }}
            />
          </AuthProvider>
        </AutosaveProvider>
      </body>
    </html>
  );
}
