import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { RefreshProvider } from '@/contexts/RefreshContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Mariposa Scalping Bot',
  description: 'AI-powered cryptocurrency scalping bot with real-time analytics',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <RefreshProvider>
          {children}
        </RefreshProvider>
      </body>
    </html>
  );
}