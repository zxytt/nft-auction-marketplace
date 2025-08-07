import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export function Navbar() {
  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <Link href="/" className="text-2xl font-bold text-primary-700">
          NFT Auction
        </Link>
        <div className="flex gap-4 items-center">
          <Link 
            href="/create" 
            className="px-4 py-2 bg-secondary-600 text-white rounded-md hover:bg-secondary-700 transition-colors"
          >
            Create Auction
          </Link>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
