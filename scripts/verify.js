const { ethers, network, run } = require("hardhat");
const fs = require("fs");
const path = require("path");

// 链特定的Chainlink Feed地址
const CHAINLINK_FEEDS = {
  sepolia: {
    ethUsd: "0x694AA1769357215DE4FAC081bf1f309aDC325306"
  },
  polygonMumbai: {
    ethUsd: "0x0715A7794a1dc8e42615F059dD6e406A6594651A"
  }
};

// 链特定的CCIP配置
const CCIP_CONFIG = {
  sepolia: {
    router: "0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59",
    linkToken: "0x779877A7B0D9E8603169DdbD7836e478b4624789"
  },
  polygonMumbai: {
    router: "0x70499c328e1E2a3c41108bd3730F6670a6Bf46C5",
    linkToken: "0x326C977E6efc84E512bB9C30f76E30c160eD06B"
  }
};

async function main() {
  console.log(`Verifying contracts on ${network.name} network...`);
  
  // 获取部署的合约地址
  const contractAddressesPath = path.join(__dirname, "..", "frontend", "src", "config", "contractAddresses.json");
  if (!fs.existsSync(contractAddressesPath)) {
    throw new Error("Contract addresses file not found. Deploy first.");
  }
  
  const contractAddresses = JSON.parse(fs.readFileSync(contractAddressesPath, "utf8"));
  const addresses = contractAddresses[network.name];
  
  if (!addresses) {
    throw new Error(`No contract addresses found for network ${network.name}`);
  }
  
  const [deployer] = await ethers.getSigners();
  console.log(`Verifying with account: ${deployer.address}`);
  
  // 验证NFT合约
  if (addresses.nft) {
    console.log(`Verifying NFT contract at ${addresses.nft}...`);
    await run("verify:verify", {
      address: addresses.nft,
      constructorArguments: [
        "AuctionMarketNFT",
        "AMNFT",
        deployer.address
      ]
    });
    console.log("NFT contract verified!");
  }
  
  // 验证价格预言机
  if (addresses.priceOracle) {
    const ethUsdFeed = CHAINLINK_FEEDS[network.name]?.ethUsd;
    if (!ethUsdFeed) {
      console.log(`No Chainlink ETH/USD feed for network ${network.name}, skipping PriceOracle verification`);
    } else {
      console.log(`Verifying PriceOracle at ${addresses.priceOracle}...`);
      await run("verify:verify", {
        address: addresses.priceOracle,
        constructorArguments: [
          ethUsdFeed,
          deployer.address
        ]
      });
      console.log("PriceOracle verified!");
    }
  }
  
  // 验证拍卖实现合约
  if (addresses.auctionImplementation) {
    console.log(`Verifying Auction implementation at ${addresses.auctionImplementation}...`);
    await run("verify:verify", {
      address: addresses.auctionImplementation,
      constructorArguments: []
    });
    console.log("Auction implementation verified!");
  }
  
  // 验证拍卖工厂
  if (addresses.auctionFactory) {
    console.log(`Verifying AuctionFactory at ${addresses.auctionFactory}...`);
    const platformFeePercent = 2; // 与部署时一致
    await run("verify:verify", {
      address: addresses.auctionFactory,
      constructorArguments: [],
      proxy: {
        proxyContract: "UUPS",
        implementationAddress: addresses.auctionImplementation
      }
    });
    console.log("AuctionFactory verified!");
  }
  
  // 验证CCIP处理器
  if (addresses.ccipHandler) {
    const ccipConfig = CCIP_CONFIG[network.name];
    if (!ccipConfig) {
      console.log(`No CCIP config for network ${network.name}, skipping CCIPHandler verification`);
    } else {
      console.log(`Verifying CCIPHandler at ${addresses.ccipHandler}...`);
      await run("verify:verify", {
        address: addresses.ccipHandler,
        constructorArguments: [
          ccipConfig.router,
          ccipConfig.linkToken,
          addresses.auctionFactory,
          deployer.address
        ]
      });
      console.log("CCIPHandler verified!");
    }
  }
  
  console.log("All contracts verified successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Verification failed:", error);
    process.exit(1);
  });
