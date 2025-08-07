import Link from 'next/link';
import { ethers } from 'ethers';
import { formatTimeRemaining } from '@/lib/config';

export function AuctionCard({ auction }) {
  const formatEther = (amount) => {
    return ethers.formatEther(amount).slice(0, 6);
  };

  return (
    <div 
      className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
    >
      <div className="h-48 bg-gray-100 flex items-center justify-center">
        {/* NFT图片占位 */}
        <img 
          src={`https://picsum.photos/seed/${auction.tokenId}/300/300`} 
          alt={`NFT #${auction.tokenId}`}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-semibold text-lg">NFT #{auction.tokenId.toString()}</h3>
          <span className="bg-primary-100 text-primary-800 text-xs px-2 py-1 rounded-full">
            {formatTimeRemaining(Number(auction.endTime))}
          </span>
        </div>
        
        <div className="mb-4">
          <p className="text-sm text-gray-500">Current Bid</p>
          <p className="text-xl font-bold">
            {formatEther(auction.highestBid)} 
            {auction.paymentToken === ethers.ZeroAddress ? ' ETH' : ' Token'}
          </p>
        </div>
        
        <Link 
          href={`/auction/${auction.address}`}
          className="block w-full text-center py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
        >
          View Auction
        </Link>
      </div>
    </div>
  );
}
