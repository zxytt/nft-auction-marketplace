import '../styles/globals.css';
import { Inter } from 'next/font/google';
import { Providers } from '@/contexts/WagmiContext';
import { Navbar } from '@/components/Navbar';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'NFT Auction Marketplace',
  description: 'Decentralized NFT Auction Marketplace',
};

export default function RootLayout({
  children,
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <Navbar />
          <main className="container mx-auto px-4 py-8">
            {children}
          </main>
          <footer className="bg-gray-100 py-8 mt-12">
            <div className="container mx-auto px-4 text-center text-gray-600">
              <p>© 2023 NFT Auction Marketplace. All rights reserved.</p>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
