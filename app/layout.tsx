import type { Metadata } from "next";
import { Georama } from "next/font/google";
import "./globals.css";
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/contexts/AuthContext';

const inter = Georama({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Secure Notes",
  description: "A secure note-taking application",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="light">
      <body className={`${inter.className} bg-white text-gray-900`}>
        <AuthProvider>
          {children}
          <Toaster position="top-right" />
        </AuthProvider>
      </body>
    </html>
  );
}
