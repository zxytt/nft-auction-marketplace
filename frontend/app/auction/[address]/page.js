'use client'

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useAccount, useContractRead, useContractWrite, useWaitForTransaction } from 'wagmi';
import { ethers } from 'ethers';
import { formatTimeRemaining, formatAddress } from '@/lib/config';
import auctionABI from '@/lib/abi/Auction.json';

export default function AuctionDetailPage() {
  const { address } = useParams();
  const auctionAddress = Array.isArray(address) ? address[0] : address;
  const { isConnected, address: userAddress } = useAccount();
  const [bidAmount, setBidAmount] = useState('0.1');
  
  // 读取拍卖详情
  const { data: auctionDetails, refetch } = useContractRead({
    address: auctionAddress,
    abi: auctionABI,
    functionName: 'auctionDetails',
    enabled: !!auctionAddress,
  });
  
  // 出价
  const { write: placeBid, data: bidTx } = useContractWrite({
    address: auctionAddress,
    abi: auctionABI,
    functionName: 'placeBid',
    value: auctionDetails?.paymentToken === ethers.ZeroAddress 
      ? ethers.parseEther(bidAmount) 
      : undefined,
    enabled: isConnected && !!auctionDetails && !auctionDetails.ended && 
             Number(auctionDetails.endTime) > Math.floor(Date.now() / 1000),
  });
  
  // 等待交易完成
  const { isLoading: isBidLoading, isSuccess: isBidSuccess } = useWaitForTransaction({
    hash: bidTx?.hash,
  });
  
  // 结束拍卖
  const { write: endAuction, data: endTx } = useContractWrite({
    address: auctionAddress,
    abi: auctionABI,
    functionName: 'endAuction',
    enabled: isConnected && !!auctionDetails && !auctionDetails.ended && 
             Number(auctionDetails.endTime) < Math.floor(Date.now() / 1000),
  });
  
  // 交易成功后刷新数据
  if (isBidSuccess) {
    refetch();
  }
  
  if (!auctionDetails || !auctionAddress) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }
  
  const details = auctionDetails;
  const isOwner = userAddress === details.seller;
  const isHighestBidder = userAddress === details.highestBidder;
  const isAuctionEnded = details.ended || Number(details.endTime) < Math.floor(Date.now() / 1000);
  const formatEther = (amount) => ethers.formatEther(amount);
  
  const handleBid = () => {
    if (!isConnected) return;
    placeBid?.();
  };
  
  const handleEndAuction = () => {
    if (!isConnected) return;
    endAuction?.();
  };
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* NFT图片 */}
      <div className="bg-gray-100 rounded-lg overflow-hidden">
        <img 
          src={`https://picsum.photos/seed/${details.tokenId}/600/600`} 
          alt={`NFT #${details.tokenId}`}
          className="w-full h-auto object-cover"
        />
      </div>
      
      {/* 拍卖详情 */}
      <div>
        <h1 className="text-2xl font-bold mb-4">NFT #{details.tokenId.toString()}</h1>
        
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Auction Details</h2>
          <div className="space-y-2 text-gray-700">
            <p><span className="font-medium">Seller:</span> {formatAddress(details.seller)}</p>
            <p><span className="font-medium">Status:</span> {isAuctionEnded ? 'Ended' : 'Active'}</p>
            <p><span className="font-medium">Ends in:</span> {formatTimeRemaining(Number(details.endTime))}</p>
            <p><span className="font-medium">Payment Method:</span> {details.paymentToken === ethers.ZeroAddress ? 'ETH' : 'ERC20 Token'}</p>
            <p><span className="font-medium">Reserve Price:</span> ${ethers.formatEther(details.reservePriceUsd)}</p>
          </div>
        </div>
        
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Current Bid</h2>
          <p className="text-3xl font-bold mb-1">
            {details.highestBid > 0 ? formatEther(details.highestBid) : 'No bids yet'}
            {details.paymentToken === ethers.ZeroAddress ? ' ETH' : ' Token'}
          </p>
          {details.highestBid > 0 && (
            <p className="text-gray-600">
              By {formatAddress(details.highestBidder)}
            </p>
          )}
        </div>
        
        {!isAuctionEnded ? (
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2">Place a Bid</h2>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                min={details.highestBid > 0 ? parseFloat(formatEther(details.highestBid)) + 0.01 : 0.01}
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md"
              />
              <button
                onClick={handleBid}
                disabled={!isConnected || isBidLoading || parseFloat(bidAmount) <= 0}
                className="px-6 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors disabled:opacity-70"
              >
                {isBidLoading ? 'Bidding...' : 'Place Bid'}
              </button>
            </div>
            {!isConnected && (
              <p className="mt-2 text-red-500 text-sm">Please connect your wallet to place a bid</p>
            )}
          </div>
        ) : (
          <div className="mb-6 p-4 bg-gray-100 rounded-md">
            {details.highestBid > 0 ? (
              <div>
                <p className="font-medium">Auction Ended</p>
                <p>The winning bid was {formatEther(details.highestBid)} {details.paymentToken === ethers.ZeroAddress ? 'ETH' : 'Token'}</p>
                <p>Winner: {formatAddress(details.highestBidder)}</p>
              </div>
            ) : (
              <p>No bids were placed on this auction</p>
            )}
          </div>
        )}
        
        {!details.ended && Number(details.endTime) < Math.floor(Date.now() / 1000) && (
          <button
            onClick={handleEndAuction}
            disabled={!isConnected}
            className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-70"
          >
            End Auction
          </button>
        )}
      </div>
    </div>
  );
}
