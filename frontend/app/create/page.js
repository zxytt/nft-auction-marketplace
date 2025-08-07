'use client'

import { useState } from 'react';
import { useAccount, useContractRead, useContractWrite, useWaitForTransaction } from 'wagmi';
import { ethers } from 'ethers';
import { getContractAddress } from '@/lib/config';
import nftABI from '@/lib/abi/NFT.json';
import auctionFactoryABI from '@/lib/abi/AuctionFactory.json';

export default function CreateAuctionPage() {
  const { chain, isConnected, address } = useAccount();
  const chainId = chain?.id || 11155111;
  const nftAddress = getContractAddress('nft', chainId);
  const factoryAddress = getContractAddress('auctionFactory', chainId);
  
  // 表单状态
  const [formData, setFormData] = useState({
    tokenId: '1',
    duration: '86400', // 24小时
    reservePrice: '100', // 100美元
    paymentToken: ethers.ZeroAddress,
  });
  
  const [step, setStep] = useState(1); // 1: 填写信息, 2: 授权NFT, 3: 创建拍卖
  const [isApproved, setIsApproved] = useState(false);
  
  // 检查NFT授权状态
  const { data: approvalStatus, refetch: checkApproval } = useContractRead({
    address: nftAddress,
    abi: nftABI,
    functionName: 'getApproved',
    args: [BigInt(formData.tokenId)],
    enabled: isConnected && step >= 2 && !!nftAddress,
  });
  
  // 授权NFT
  const { write: approveNft, data: approveTx } = useContractWrite({
    address: nftAddress,
    abi: nftABI,
    functionName: 'approveForAuction',
    args: [factoryAddress, BigInt(formData.tokenId)],
    enabled: isConnected && step === 2 && !isApproved && !!nftAddress && !!factoryAddress,
  });
  
  // 创建拍卖
  const { write: createAuction, data: createTx } = useContractWrite({
    address: factoryAddress,
    abi: auctionFactoryABI,
    functionName: 'createAuction',
    args: [
      nftAddress,
      BigInt(formData.tokenId),
      formData.paymentToken,
      BigInt(formData.duration),
      ethers.parseEther(formData.reservePrice), // 转换为18位小数
    ],
    enabled: isConnected && step === 3 && isApproved && !!factoryAddress && !!nftAddress,
  });
  
  // 等待授权交易完成
  const { isLoading: isApproveLoading, isSuccess: isApproveSuccess } = useWaitForTransaction({
    hash: approveTx?.hash,
  });
  
  // 等待创建拍卖交易完成
  const { isLoading: isCreateLoading, isSuccess: isCreateSuccess } = useWaitForTransaction({
    hash: createTx?.hash,
  });
  
  // 处理表单变化
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  // 处理下一步
  const handleNext = () => {
    if (step === 1) {
      // 验证表单
      if (!formData.tokenId || !formData.duration || !formData.reservePrice) {
        alert('Please fill in all fields');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };
  
  // 处理上一步
  const handleBack = () => {
    if (step > 1) {
      setStep(prev => prev - 1);
    }
  };
  
  // 检查授权状态
  const handleCheckApproval = () => {
    checkApproval();
  };
  
  // 监听授权状态变化
  useState(() => {
    if (approvalStatus && address) {
      setIsApproved(approvalStatus === factoryAddress);
    }
  }, [approvalStatus, factoryAddress, address]);
  
  // 授权成功后更新状态
  useState(() => {
    if (isApproveSuccess) {
      setIsApproved(true);
    }
  }, [isApproveSuccess]);
  
  // 创建拍卖成功后重置
  useState(() => {
    if (isCreateSuccess) {
      alert('Auction created successfully!');
      setStep(1);
      setFormData({
        tokenId: '1',
        duration: '86400',
        reservePrice: '100',
        paymentToken: ethers.ZeroAddress,
      });
    }
  }, [isCreateSuccess]);
  
  if (!isConnected) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4">Create New Auction</h1>
        <p className="mb-6">Please connect your wallet to create an auction</p>
      </div>
    );
  }
  
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Create New Auction</h1>
      
      {/* 步骤指示器 */}
      <div className="flex items-center mb-8">
        <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step >= 1 ? 'bg-primary-600 text-white' : 'bg-gray-200'}`}>1</div>
        <div className={`flex-1 h-1 mx-2 ${step >= 2 ? 'bg-primary-600' : 'bg-gray-200'}`}></div>
        <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step >= 2 ? 'bg-primary-600 text-white' : 'bg-gray-200'}`}>2</div>
        <div className={`flex-1 h-1 mx-2 ${step >= 3 ? 'bg-primary-600' : 'bg-gray-200'}`}></div>
        <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step >= 3 ? 'bg-primary-600 text-white' : 'bg-gray-200'}`}>3</div>
      </div>
      
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block mb-1 font-medium">NFT Token ID</label>
            <input
              type="number"
              name="tokenId"
              value={formData.tokenId}
              onChange={handleInputChange}
              min="1"
              className="w-full px-4 py-2 border border-gray-300 rounded-md"
            />
          </div>
          
          <div>
            <label className="block mb-1 font-medium">Auction Duration (seconds)</label>
            <input
              type="number"
              name="duration"
              value={formData.duration}
              onChange={handleInputChange}
              min="3600"
              className="w-full px-4 py-2 border border-gray-300 rounded-md"
              placeholder="86400 for 24 hours"
            />
          </div>
          
          <div>
            <label className="block mb-1 font-medium">Reserve Price (USD)</label>
            <input
              type="number"
              name="reservePrice"
              value={formData.reservePrice}
              onChange={handleInputChange}
              min="1"
              step="0.01"
              className="w-full px-4 py-2 border border-gray-300 rounded-md"
            />
          </div>
          
          <div>
            <label className="block mb-1 font-medium">Payment Token</label>
            <select
              name="paymentToken"
              value={formData.paymentToken}
              onChange={(e) => setFormData(prev => ({ ...prev, paymentToken: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-md"
            >
              <option value={ethers.ZeroAddress}>Ethereum (ETH)</option>
              {/* 可以添加更多ERC20代币选项 */}
            </select>
          </div>
        </div>
      )}
      
      {step === 2 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Authorize NFT</h2>
          <p className="mb-4">
            Please authorize the auction factory to manage your NFT (Token ID: {formData.tokenId})
          </p>
          
          <div className="mb-4 p-4 bg-gray-100 rounded-md">
            <p className="mb-2"><span className="font-medium">NFT Contract:</span> {nftAddress}</p>
            <p className="mb-2"><span className="font-medium">Auction Factory:</span> {factoryAddress}</p>
            <p><span className="font-medium">Authorization Status:</span> {isApproved ? 'Approved' : 'Not Approved'}</p>
          </div>
          
          {!isApproved ? (
            <button
              onClick={() => approveNft?.()}
              disabled={isApproveLoading}
              className="px-6 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors disabled:opacity-70"
            >
              {isApproveLoading ? 'Approving...' : 'Approve NFT'}
            </button>
          ) : (
            <button
              onClick={handleCheckApproval}
              className="px-6 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
            >
              Check Approval Status
            </button>
          )}
        </div>
      )}
      
      {step === 3 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Create Auction</h2>
          <p className="mb-4">Review your auction details and click `Create Auction` to proceed.</p>
          
          <div className="mb-6 p-4 bg-gray-100 rounded-md space-y-2">
            <p><span className="font-medium">NFT Token ID:</span> {formData.tokenId}</p>
            <p><span className="font-medium">Duration:</span> {formData.duration} seconds ({Math.round(Number(formData.duration) / 3600)} hours)</p>
            <p><span className="font-medium">Reserve Price:</span> ${formData.reservePrice} USD</p>
            <p><span className="font-medium">Payment Method:</span> {formData.paymentToken === ethers.ZeroAddress ? 'ETH' : 'ERC20 Token'}</p>
          </div>
          
          <button
            onClick={() => createAuction?.()}
            disabled={isCreateLoading}
            className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-70"
          >
            {isCreateLoading ? 'Creating...' : 'Create Auction'}
          </button>
        </div>
      )}
      
      <div className="mt-8 flex justify-between">
        <button
          onClick={handleBack}
          disabled={step === 1 || isApproveLoading || isCreateLoading}
          className="px-6 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors disabled:opacity-50"
        >
          Back
        </button>
        
        {step < 3 && (
          <button
            onClick={handleNext}
            disabled={step === 2 && !isApproved || isApproveLoading || isCreateLoading}
            className="px-6 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}
