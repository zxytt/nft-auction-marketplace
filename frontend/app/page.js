'use client'

import { useState, useEffect } from 'react';
import { useAccount, useContractRead } from 'wagmi';
import { ethers } from 'ethers';
import Link from 'next/link';
import { AuctionCard } from '@/components/AuctionCard';
import { getContractAddress } from '@/lib/config';
import auctionFactoryABI from '@/lib/abi/AuctionFactory.json';
import auctionABI from '@/lib/abi/Auction.json';

export default function Home() {
  const { chain } = useAccount();
  const chainId = chain?.id || 11155111; // 默认Sepolia
  const factoryAddress = getContractAddress('auctionFactory', chainId);
  
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // 读取拍卖总数
  const { data: auctionCount } = useContractRead({
    address: factoryAddress,
    abi: auctionFactoryABI,
    functionName: 'getAuctionCount',
    enabled: !!factoryAddress,
  });
  
  // 读取拍卖详情
  useEffect(() => {
    if (!factoryAddress || !auctionCount || auctions.length > 0) return;
    
    const fetchAuctions = async () => {
      setLoading(true);
      try {
        const newAuctions = [];
        const count = Number(auctionCount);
        
        // 只获取前10个拍卖以提高性能
        const limit = Math.min(count, 10);
        
        for (let i = 0; i < limit; i++) {
          // 读取拍卖地址
          const { data: auctionAddress } = await useContractRead({
            address: factoryAddress,
            abi: auctionFactoryABI,
            functionName: 'auctions',
            args: [i],
          }) ;
          
          if (!auctionAddress) continue;
          
          // 读取拍卖详情
          const { data: details } = await useContractRead({
            address: auctionAddress,
            abi: auctionABI,
            functionName: 'auctionDetails',
          });
          
          if (details && !details.ended) {
            newAuctions.push({
              id: i,
              address: auctionAddress,
              nftContract: details.nftContract,
              tokenId: details.tokenId,
              seller: details.seller,
              paymentToken: details.paymentToken,
              startTime: details.startTime,
              endTime: details.endTime,
              reservePriceUsd: details.reservePriceUsd,
              highestBid: details.highestBid,
              highestBidder: details.highestBidder,
              ended: details.ended,
            });
          }
        }
        
        setAuctions(newAuctions);
      } catch (error) {
        console.error('Error fetching auctions:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchAuctions();
  }, [factoryAddress, auctionCount, auctions.length]);
  
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Active Auctions</h1>
        <p className="text-gray-600">Discover and bid on unique NFTs</p>
      </div>
      
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
        </div>
      ) : auctions.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <h3 className="text-xl font-medium mb-2">No active auctions</h3>
          <p className="text-gray-600 mb-4">Be the first to create an auction!</p>
          <Link 
            href="/create" 
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
          >
            Create Your Auction
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {auctions.map((auction) => (
            <AuctionCard key={auction.id} auction={auction} />
          ))}
        </div>
      )}
    </div>
  );
}
