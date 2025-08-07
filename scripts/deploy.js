const { ethers, upgrades, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// 链特定的Chainlink Feed地址
const CHAINLINK_FEEDS = {
  sepolia: {
    ethUsd: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
    linkUsd: "0xc59E3633BAAC79493d908e63626716e204A4555",
    usdcUsd: "0xA2F78ab2355fe2f984D808B5CeE7FD0e9A7c599"
  },
  polygonMumbai: {
    ethUsd: "0x0715A7794a1dc8e42615F059dD6e406A6594651A",
    linkUsd: "0x326C977E6efc84E512bB9C30f76E30c160eD06B",
    usdcUsd: "0x572dDec9087154dC5dfBB1546Bb62713147e00c"
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
  console.log(`Deploying contracts to ${network.name} network...`);
  
  // 获取部署者账户
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);
  console.log(`Account balance: ${(await deployer.getBalance()).toString()}`);
  
  // 部署NFT合约
  const NFT = await ethers.getContractFactory("NFT");
  const nft = await NFT.deploy(
    "AuctionMarketNFT", 
    "AMNFT", 
    deployer.address
  );
  await nft.waitForDeployment();
  const nftAddress = await nft.getAddress();
  console.log(`NFT contract deployed to: ${nftAddress}`);
  
  // 部署价格预言机
  const PriceOracle = await ethers.getContractFactory("PriceOracle");
  const ethUsdFeed = CHAINLINK_FEEDS[network.name]?.ethUsd;
  if (!ethUsdFeed) {
    throw new Error(`No Chainlink ETH/USD feed for network ${network.name}`);
  }
  
  const priceOracle = await PriceOracle.deploy(
    ethUsdFeed,
    deployer.address
  );
  await priceOracle.waitForDeployment();
  const priceOracleAddress = await priceOracle.getAddress();
  console.log(`PriceOracle deployed to: ${priceOracleAddress}`);
  
  // 设置代币价格feed（USDC示例）
  const usdcUsdFeed = CHAINLINK_FEEDS[network.name]?.usdcUsd;
  if (usdcUsdFeed) {
    // 这里使用一个示例USDC地址，实际部署时应替换为真实地址
    const usdcAddress = "0x8125F522a712F4aD849E6c7316a59e921d988b6e";
    await priceOracle.setTokenPriceFeed(usdcAddress, usdcUsdFeed);
    console.log(`Set USDC price feed: ${usdcUsdFeed}`);
  }
  
  // 部署拍卖实现合约
  const Auction = await ethers.getContractFactory("Auction");
  const auctionImpl = await Auction.deploy();
  await auctionImpl.waitForDeployment();
  const auctionImplAddress = await auctionImpl.getAddress();
  console.log(`Auction implementation deployed to: ${auctionImplAddress}`);
  
  // 部署拍卖工厂
  const AuctionFactory = await ethers.getContractFactory("AuctionFactory");
  const platformFeePercent = 2; // 2%的平台手续费
  const factory = await upgrades.deployProxy(
    AuctionFactory,
    [
      auctionImplAddress,
      priceOracleAddress,
      deployer.address, // 手续费收集者
      platformFeePercent,
      deployer.address
    ],
    { kind: "uups" }
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log(`AuctionFactory deployed to: ${factoryAddress}`);
  
  // 部署CCIP处理器
  const ccipConfig = CCIP_CONFIG[network.name];
  if (ccipConfig) {
    const CCIPHandler = await ethers.getContractFactory("CCIPHandler");
    const ccipHandler = await CCIPHandler.deploy(
      ccipConfig.router,
      ccipConfig.linkToken,
      factoryAddress,
      deployer.address
    );
    await ccipHandler.waitForDeployment();
    const ccipHandlerAddress = await ccipHandler.getAddress();
    console.log(`CCIPHandler deployed to: ${ccipHandlerAddress}`);
    
    // 保存合约地址到文件
    saveContractAddresses({
      nft: nftAddress,
      priceOracle: priceOracleAddress,
      auctionImplementation: auctionImplAddress,
      auctionFactory: factoryAddress,
      ccipHandler: ccipHandlerAddress
    });
  } else {
    console.log(`No CCIP config for network ${network.name}, skipping CCIPHandler deployment`);
    
    // 保存合约地址到文件
    saveContractAddresses({
      nft: nftAddress,
      priceOracle: priceOracleAddress,
      auctionImplementation: auctionImplAddress,
      auctionFactory: factoryAddress
    });
  }
  
  console.log("Deployment completed successfully!");
}

// 保存合约地址到文件
function saveContractAddresses(addresses) {
  const dir = path.join(__dirname, "..", "frontend", "src", "config");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const filePath = path.join(dir, "contractAddresses.json");
  fs.writeFileSync(filePath, JSON.stringify({
    [network.name]: addresses
  }, null, 2));
  
  console.log(`Contract addresses saved to ${filePath}`);
  
  // 同时更新.env.example文件
  const envExamplePath = path.join(__dirname, "..", ".env.example");
  if (fs.existsSync(envExamplePath)) {
    let envContent = fs.readFileSync(envExamplePath, "utf8");
    
    for (const [key, value] of Object.entries(addresses)) {
      const envKey = key.toUpperCase() + "_ADDRESS";
      const regex = new RegExp(`${envKey}=.*`);
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${envKey}=${value}`);
      } else {
        envContent += `\n${envKey}=${value}`;
      }
    }
    
    fs.writeFileSync(envExamplePath, envContent);
    console.log(`Updated .env.example with contract addresses`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
