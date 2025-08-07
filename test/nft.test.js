const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFT Contract", function () {
  let NFT;
  let nft;
  let owner;
  let user1;
  let user2;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();
    
    // 部署NFT合约
    NFT = await ethers.getContractFactory("NFT");
    nft = await NFT.deploy("TestNFT", "TNFT", owner.address);
    await nft.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct name and symbol", async function () {
      expect(await nft.name()).to.equal("TestNFT");
      expect(await nft.symbol()).to.equal("TNFT");
    });

    it("Should set the correct owner", async function () {
      expect(await nft.owner()).to.equal(owner.address);
    });
  });

  describe("Minting", function () {
    it("Should allow owner to mint NFTs", async function () {
      await expect(nft.mint(user1.address, "https://example.com/nft/1"))
        .to.emit(nft, "NFTMinted")
        .withArgs(user1.address, 1, "https://example.com/nft/1");
      
      expect(await nft.ownerOf(1)).to.equal(user1.address);
      expect(await nft.tokenURI(1)).to.equal("https://example.com/nft/1");
    });

    it("Should not allow non-owners to mint NFTs", async function () {
      await expect(
        nft.connect(user1).mint(user1.address, "https://example.com/nft/2")
      ).to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount");
    });
  });

  describe("Approval", function () {
    beforeEach(async function () {
      // 铸造一个NFT给user1
      await nft.mint(user1.address, "https://example.com/nft/1");
    });

    it("Should allow owner to approve auction contract", async function () {
      const auctionContract = user2.address;
      await nft.connect(user1).approveForAuction(auctionContract, 1);
      
      expect(await nft.getApproved(1)).to.equal(auctionContract);
    });

    it("Should allow batch approval", async function () {
      // 再铸造一个NFT
      await nft.mint(user1.address, "https://example.com/nft/2");
      
      const auctionContract = user2.address;
      await nft.connect(user1).approveForAuctionBatch(auctionContract, [1, 2]);
      
      expect(await nft.getApproved(1)).to.equal(auctionContract);
      expect(await nft.getApproved(2)).to.equal(auctionContract);
    });

    it("Should not allow non-owners to approve", async function () {
      const auctionContract = user2.address;
      await expect(
        nft.connect(user2).approveForAuction(auctionContract, 1)
      ).to.be.revertedWith("Not the owner");
    });
  });
});
