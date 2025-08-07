const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Auction Contract", function () {
  let NFT;
  let nft;
  let PriceOracle;
  let priceOracle;
  let Auction;
  let auction;
  let AuctionFactory;
  let factory;
  let owner;
  let seller;
  let bidder1;
  let bidder2;
  
  const ETH_USD_PRICE = ethers.parseEther("3000"); // 1 ETH = $3000
  const PLATFORM_FEE_PERCENT = 2; // 2%手续费

  beforeEach(async function () {
    [owner, seller, bidder1, bidder2] = await ethers.getSigners();
    
    // 部署NFT合约
    NFT = await ethers.getContractFactory("NFT");
    nft = await NFT.deploy("TestNFT", "TNFT", owner.address);
    await nft.waitForDeployment();
    
    // 铸造一个NFT给卖家
    await nft.mint(seller.address, "https://example.com/nft/1");
    
    // 部署价格预言机模拟合约
    PriceOracle = await ethers.getContractFactory("PriceOracle");
    priceOracle = await PriceOracle.deploy(owner.address, owner.address);
    await priceOracle.waitForDeployment();
    
    // 部署拍卖实现合约
    Auction = await ethers.getContractFactory("Auction");
    const auctionImpl = await Auction.deploy();
    await auctionImpl.waitForDeployment();
    const auctionImplAddress = await auctionImpl.getAddress();
    
    // 部署拍卖工厂
    AuctionFactory = await ethers.getContractFactory("AuctionFactory");
    factory = await ethers.deployContract("AuctionFactory");
    await factory.waitForDeployment();
    await factory.initialize(
      auctionImplAddress,
      await priceOracle.getAddress(),
      owner.address,
      PLATFORM_FEE_PERCENT,
      owner.address
    );
    
    // 授权NFT给工厂
    await nft.connect(seller).approveForAuction(await factory.getAddress(), 1);
    
    // 创建拍卖
    const tx = await factory.connect(seller).createAuction(
      await nft.getAddress(),
      1,
      ethers.ZeroAddress, // ETH
      86400, // 24小时
      ethers.parseEther("100") // 100美元底价
    );
    
    // 获取新创建的拍卖地址
    const receipt = await tx.wait();
    const auctionCreatedEvent = receipt.logs.find(
      log => log.fragment && log.fragment.name === "AuctionCreated"
    );
    const auctionAddress = auctionCreatedEvent.args.auction;
    
    // 连接到拍卖合约
    auction = await ethers.getContractAt("Auction", auctionAddress);
    
    // 模拟价格预言机返回ETH价格
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [await priceOracle.ethUsdPriceFeed()]
    });
    const priceFeedSigner = await ethers.getSigner(await priceOracle.ethUsdPriceFeed());
    
    // 模拟Chainlink价格feed的latestRoundData调用
    await network.provider.mockCall(
      await priceOracle.ethUsdPriceFeed(),
      "latestRoundData()",
      [0, ETH_USD_PRICE, 0, 0, 0]
    );
  });

  describe("Initialization", function () {
    it("Should initialize with correct parameters", async function () {
      const details = await auction.auctionDetails();
      
      expect(details.nftContract).to.equal(await nft.getAddress());
      expect(details.tokenId).to.equal(1);
      expect(details.seller).to.equal(seller.address);
      expect(details.paymentToken).to.equal(ethers.ZeroAddress);
      expect(details.reservePriceUsd).to.equal(ethers.parseEther("100"));
      expect(details.highestBid).to.equal(0);
      expect(details.highestBidder).to.equal(ethers.ZeroAddress);
      expect(details.ended).to.be.false;
    });

    it("Should have received the NFT", async function () {
      expect(await nft.ownerOf(1)).to.equal(await auction.getAddress());
    });
  });

  describe("Bidding", function () {
    it("Should allow placing a valid bid", async function () {
      // 出价0.04 ETH (~$120)
      const bidAmount = ethers.parseEther("0.04");
      
      await expect(auction.connect(bidder1).placeBid({ value: bidAmount }))
        .to.emit(auction, "BidPlaced")
        .withArgs(bidder1.address, bidAmount);
      
      const details = await auction.auctionDetails();
      expect(details.highestBidder).to.equal(bidder1.address);
      expect(details.highestBid).to.equal(bidAmount);
    });

    it("Should reject bids below reserve price", async function () {
      // 出价0.03 ETH (~$90)，低于100美元底价
      const bidAmount = ethers.parseEther("0.03");
      
      await expect(
        auction.connect(bidder1).placeBid({ value: bidAmount })
      ).to.be.revertedWith("Below reserve price");
    });

    it("Should reject bids lower than current highest", async function () {
      // 第一次出价
      const firstBid = ethers.parseEther("0.04");
      await auction.connect(bidder1).placeBid({ value: firstBid });
      
      // 第二次出价更低
      const lowerBid = ethers.parseEther("0.035");
      await expect(
        auction.connect(bidder2).placeBid({ value: lowerBid })
      ).to.be.revertedWith("Bid too low");
    });

    it("Should refund previous highest bidder", async function () {
      // 第一次出价
      const firstBid = ethers.parseEther("0.04");
      const bidder1BalanceBefore = await ethers.provider.getBalance(bidder1.address);
      await auction.connect(bidder1).placeBid({ value: firstBid });
      const bidder1BalanceAfterFirstBid = await ethers.provider.getBalance(bidder1.address);
      
      // 确认余额减少
      expect(bidder1BalanceAfterFirstBid).to.be.lt(bidder1BalanceBefore - firstBid);
      
      // 第二次出价更高
      const secondBid = ethers.parseEther("0.05");
      const bidder2BalanceBefore = await ethers.provider.getBalance(bidder2.address);
      await auction.connect(bidder2).placeBid({ value: secondBid });
      const bidder2BalanceAfterBid = await ethers.provider.getBalance(bidder2.address);
      
      // 确认第二次出价者余额减少
      expect(bidder2BalanceAfterBid).to.be.lt(bidder2BalanceBefore - secondBid);
      
      // 确认第一次出价者收到退款
      const bidder1BalanceAfterRefund = await ethers.provider.getBalance(bidder1.address);
      expect(bidder1BalanceAfterRefund).to.be.gt(bidder1BalanceAfterFirstBid);
      
      // 检查拍卖状态
      const details = await auction.auctionDetails();
      expect(details.highestBidder).to.equal(bidder2.address);
      expect(details.highestBid).to.equal(secondBid);
    });

    it("Should reject bids after auction ends", async function () {
      // 快进时间到拍卖结束后
      await time.increase(86401); // 超过24小时
      
      const bidAmount = ethers.parseEther("0.04");
      await expect(
        auction.connect(bidder1).placeBid({ value: bidAmount })
      ).to.be.revertedWith("Auction expired");
    });

    it("Should reject bids from seller", async function () {
      const bidAmount = ethers.parseEther("0.04");
      await expect(
        auction.connect(seller).placeBid({ value: bidAmount })
      ).to.be.revertedWith("Seller cannot bid");
    });
  });

  describe("Ending Auction", function () {
    it("Should end auction and transfer NFT and funds", async function () {
      // 出价
      const bidAmount = ethers.parseEther("0.04");
      await auction.connect(bidder1).placeBid({ value: bidAmount });
      
      // 记录余额
      const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
      const ownerBalanceBefore = await ethers.provider.getBalance(owner.address); // 手续费收集者
      
      // 快进时间
      await time.increase(86401);
      
      // 结束拍卖
      await expect(auction.endAuction())
        .to.emit(auction, "AuctionEnded")
        .withArgs(bidder1.address, bidAmount);
      
      // 检查NFT所有权
      expect(await nft.ownerOf(1)).to.equal(bidder1.address);
      
      // 检查资金转移
      const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
      const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);
      
      // 计算预期金额（扣除2%手续费）
      const fee = bidAmount * PLATFORM_FEE_PERCENT / 100;
      const sellerAmount = bidAmount - fee;
      
      expect(sellerBalanceAfter).to.be.gt(sellerBalanceBefore + sellerAmount - ethers.parseEther("0.001"));
      expect(ownerBalanceAfter).to.be.gt(ownerBalanceBefore + fee - ethers.parseEther("0.001"));
      
      // 检查拍卖状态
      const details = await auction.auctionDetails();
      expect(details.ended).to.be.true;
    });

    it("Should return NFT to seller if no bids", async function () {
      // 快进时间
      await time.increase(86401);
      
      // 结束拍卖
      await auction.endAuction();
      
      // 检查NFT所有权回到卖家
      expect(await nft.ownerOf(1)).to.equal(seller.address);
      
      // 检查拍卖状态
      const details = await auction.auctionDetails();
      expect(details.ended).to.be.true;
    });

    it("Should reject ending auction before it expires", async function () {
      await expect(auction.endAuction()).to.be.revertedWith("Auction not ended");
    });

    it("Should reject ending auction twice", async function () {
      // 快进时间
      await time.increase(86401);
      
      // 第一次结束拍卖
      await auction.endAuction();
      
      // 尝试再次结束
      await expect(auction.endAuction()).to.be.revertedWith("Auction already ended");
    });
  });
});
