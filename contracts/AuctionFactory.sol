// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./Auction.sol";
import "./interfaces/IPriceOracle.sol";
import "./interfaces/IAuction.sol";

contract AuctionFactory is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    address public auctionImplementation;
    address public priceOracle;
    address public feeCollector;
    uint256 public platformFeePercent; // 平台手续费百分比
    
    // 记录所有拍卖
    IAuction[] public auctions;
    mapping(address => IAuction[]) public userAuctions; // 卖家的拍卖
    mapping(address => bool) public isAuctionContract; // 验证是否为有效的拍卖合约

    event AuctionCreated(
        address indexed auction, 
        address indexed seller, 
        address indexed nftContract, 
        uint256 tokenId
    );
    event PlatformFeeUpdated(uint256 newFeePercent);
    event AuctionImplementationUpdated(address newImplementation);
    event PriceOracleUpdated(address newOracle);
    event FeeCollectorUpdated(address newCollector);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _auctionImplementation,
        address _priceOracle,
        address _feeCollector,
        uint256 _platformFeePercent,
        address initialOwner
    ) external initializer {
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();
        
        require(_auctionImplementation != address(0), "Invalid auction implementation");
        require(_priceOracle != address(0), "Invalid price oracle");
        require(_feeCollector != address(0), "Invalid fee collector");
        require(_platformFeePercent <= 10, "Fee too high (max 10%)");
        
        auctionImplementation = _auctionImplementation;
        priceOracle = _priceOracle;
        feeCollector = _feeCollector;
        platformFeePercent = _platformFeePercent;
    }

    function createAuction(
        address nftContract,
        uint256 tokenId,
        address paymentToken,
        uint256 duration,
        uint256 reservePriceUsd
    ) external returns (IAuction) {
        require(nftContract != address(0), "Invalid NFT contract");
        require(duration > 0, "Duration must be greater than 0");
        require(reservePriceUsd > 0, "Reserve price must be greater than 0");
        
        // 检查NFT所有权和授权
        require(IERC721(nftContract).ownerOf(tokenId) == msg.sender, "Not the NFT owner");
        require(
            IERC721(nftContract).isApprovedForAll(msg.sender, address(this)) ||
            IERC721(nftContract).getApproved(tokenId) == address(this),
            "Factory not approved for NFT"
        );
        
        // 使用最小代理模式创建新的拍卖合约
        address auctionAddress = Clones.clone(auctionImplementation);
        
        // 初始化拍卖
        Auction(auctionAddress).initialize(
            nftContract,
            tokenId,
            msg.sender,
            paymentToken,
            duration,
            reservePriceUsd,
            priceOracle,
            address(this),
            platformFeePercent
        );
        
        // 记录拍卖
        IAuction auction = IAuction(auctionAddress);
        auctions.push(auction);
        userAuctions[msg.sender].push(auction);
        isAuctionContract[auctionAddress] = true;
        
        emit AuctionCreated(address(auction), msg.sender, nftContract, tokenId);
        
        return auction;
    }

    function getAllAuctions() external view returns (IAuction[] memory) {
        return auctions;
    }

    function getUserAuctions(address user) external view returns (IAuction[] memory) {
        return userAuctions[user];
    }

    function getAuctionCount() external view returns (uint256) {
        return auctions.length;
    }

    function getUserAuctionCount(address user) external view returns (uint256) {
        return userAuctions[user].length;
    }

    // 管理员功能
    function setAuctionImplementation(address newImplementation) external onlyOwner {
        require(newImplementation != address(0), "Invalid implementation");
        auctionImplementation = newImplementation;
        emit AuctionImplementationUpdated(newImplementation);
    }

    function setPriceOracle(address newOracle) external onlyOwner {
        require(newOracle != address(0), "Invalid oracle");
        priceOracle = newOracle;
        emit PriceOracleUpdated(newOracle);
    }

    function setFeeCollector(address newCollector) external onlyOwner {
        require(newCollector != address(0), "Invalid collector");
        feeCollector = newCollector;
        emit FeeCollectorUpdated(newCollector);
    }

    function setPlatformFeePercent(uint256 newFeePercent) external onlyOwner {
        require(newFeePercent <= 10, "Fee too high (max 10%)");
        platformFeePercent = newFeePercent;
        emit PlatformFeeUpdated(newFeePercent);
    }

    // 提取手续费
    function withdrawFees(address token, uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        
        if (token == address(0)) {
            // 提取ETH
            uint256 balance = address(this).balance;
            require(balance >= amount, "Insufficient ETH balance");
            
            (bool success, ) = feeCollector.call{value: amount}("");
            require(success, "ETH withdrawal failed");
        } else {
            // 提取ERC20
            uint256 balance = IERC20(token).balanceOf(address(this));
            require(balance >= amount, "Insufficient token balance");
            
            bool success = IERC20(token).transfer(feeCollector, amount);
            require(success, "Token withdrawal failed");
        }
    }

    // UUPS升级函数
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // 接收ETH
    receive() external payable {}
}
