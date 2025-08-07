import contractAddresses from './contractAddresses.json';

// 合约地址配置
export const getContractAddress = (contractName, chainId = 11155111) => {
  // 默认使用Sepolia测试网
  const chainName = chainId === 11155111 ? 'sepolia' : 
                    chainId === 80001 ? 'polygonMumbai' : 'sepolia';
  
  return contractAddresses[chainName]?.[contractName] || '';
};

// 网络配置
export const networks = {
  sepolia: {
    id: 11155111,
    name: 'Sepolia',
    rpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/demo',
  },
  polygonMumbai: {
    id: 80001,
    name: 'Polygon Mumbai',
    rpcUrl: 'https://polygon-mumbai.g.alchemy.com/v2/demo',
  }
};

// 格式化地址显示
export const formatAddress = (address, chars = 6) => {
  if (!address) return '';
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
};

// 格式化时间显示
export const formatTimeRemaining = (endTime) => {
  const now = Math.floor(Date.now() / 1000);
  const remaining = endTime - now;
  
  if (remaining <= 0) return 'Ended';
  
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};
