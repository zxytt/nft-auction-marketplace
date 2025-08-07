// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IPriceOracle.sol";
import "./interfaces/IAuction.sol";

contract Auction is Initializable, UUPSUpgradeable, OwnableUpgradeable, IAuction {
    AuctionDetails public auctionDetails;
    IPriceOracle public priceOracle;
    address public factory;
    uint256 public platformFeePercent; // 平台手续费百分比，例如2表示2%

    event PlatformFeeUpdated(uint256 newFeePercent);

    modifier onlyFactory() {
        require(msg.sender == factory, "Only factory can call");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _nftContract,
        uint256 _tokenId,
        address _seller,
        address _paymentToken,
        uint256 _duration,
        uint256 _reservePriceUsd,
        address _priceOracle,
        address _factory,
        uint256 _platformFeePercent
    ) external initializer {
        __Ownable_init(_seller);
        __UUPSUpgradeable_init();

        factory = _factory;
        priceOracle = IPriceOracle(_priceOracle);
        platformFeePercent = _platformFeePercent;
        
        auctionDetails = AuctionDetails({
            nftContract: _nftContract,
            tokenId: _tokenId,
            seller: _seller,
            paymentToken: _paymentToken,
            startTime: block.timestamp,
            endTime: block.timestamp + _duration,
            reservePriceUsd: _reservePriceUsd,
            highestBid: 0,
            highestBidder: address(0),
            ended: false
        });

        // 转移NFT到拍卖合约
        bool success = IERC721(_nftContract).transferFrom(_seller, address(this), _tokenId);
        require(success, "NFT transfer failed");
    }

    function placeBid() external payable {
        AuctionDetails storage details = auctionDetails;
        require(!details.ended, "Auction ended");
        require(block.timestamp < details.endTime, "Auction expired");
        require(msg.sender != details.seller, "Seller cannot bid");

        uint256 bidAmount;
        if (details.paymentToken == address(0)) {
            // ETH出价
            bidAmount = msg.value;
            require(bidAmount > 0, "Bid amount must be greater than 0");
        } else {
            // ERC20出价
            bidAmount = IERC20(details.paymentToken).allowance(msg.sender, address(this));
            require(bidAmount > 0, "No allowance or zero bid");
            
            bool success = IERC20(details.paymentToken).transferFrom(msg.sender, address(this), bidAmount);
            require(success, "Token transfer failed");
        }

        // 转换为美元价值进行比较
        uint256 bidUsdValue = _convertToUsd(bidAmount, details.paymentToken);
        uint256 currentHighestUsdValue = details.highestBid > 0 
            ? _convertToUsd(details.highestBid, details.paymentToken) 
            : 0;

        require(bidUsdValue > currentHighestUsdValue, "Bid too low");
        require(bidUsdValue >= details.reservePriceUsd, "Below reserve price");

        // 如果有之前的最高出价者，退还其出价
        if (details.highestBidder != address(0)) {
            _refund(details.highestBidder, details.highestBid, details.paymentToken);
        }

        details.highestBid = bidAmount;
        details.highestBidder = msg.sender;

        emit BidPlaced(msg.sender, bidAmount);
    }

    function endAuction() external {
        AuctionDetails storage details = auctionDetails;
        require(!details.ended, "Auction already ended");
        require(block.timestamp > details.endTime, "Auction not ended");

        details.ended = true;

        if (details.highestBidder != address(0)) {
            // 转移NFT给最高出价者
            bool success = IERC721(details.nftContract).transferFrom(
                address(this), 
                details.highestBidder, 
                details.tokenId
            );
            require(success, "NFT transfer to winner failed");
            
            // 转移资金给卖家
            _transferToSeller(details.highestBid, details.paymentToken);
            
            emit AuctionEnded(details.highestBidder, details.highestBid);
        } else {
            // 没有出价，将NFT归还给卖家
            bool success = IERC721(details.nftContract).transferFrom(
                address(this), 
                details.seller, 
                details.tokenId
            );
            require(success, "NFT return to seller failed");
        }
    }

    function _convertToUsd(uint256 amount, address token) internal view returns (uint256) {
        if (token == address(0)) {
            // ETH转换为USD
            uint256 ethPrice = priceOracle.getEthUsdPrice();
            return (amount * ethPrice) / 10 **18;
        } else {
            // ERC20转换为USD
            uint256 tokenPrice = priceOracle.getTokenUsdPrice(token);
            return (amount * tokenPrice) / 10** 18;
        }
    }

    function _refund(address bidder, uint256 amount, address token) internal {
        if (token == address(0)) {
            // 退还ETH
            (bool success, ) = bidder.call{value: amount}("");
            require(success, "ETH refund failed");
        } else {
            // 退还ERC20
            bool success = IERC20(token).transfer(bidder, amount);
            require(success, "Token refund failed");
        }
    }

    function _transferToSeller(uint256 amount, address token) internal {
        address seller = auctionDetails.seller;
        
        // 计算平台手续费
        uint256 fee = (amount * platformFeePercent) / 100;
        uint256 sellerAmount = amount - fee;

        // 转账给卖家
        if (token == address(0)) {
            (bool success, ) = seller.call{value: sellerAmount}("");
            require(success, "ETH payment to seller failed");
            
            // 转账手续费给工厂合约
            (success, ) = factory.call{value: fee}("");
            require(success, "ETH fee transfer failed");
        } else {
            bool success = IERC20(token).transfer(seller, sellerAmount);
            require(success, "Token payment to seller failed");
            
            success = IERC20(token).transfer(factory, fee);
            require(success, "Token fee transfer failed");
        }
    }

    // 更新平台手续费（只能由工厂合约调用）
    function updatePlatformFee(uint256 newFeePercent) external onlyFactory {
        require(newFeePercent <= 10, "Fee too high (max 10%)");
        platformFeePercent = newFeePercent;
        emit PlatformFeeUpdated(newFeePercent);
    }

    // UUPS升级函数
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // 接收ETH
    receive() external payable {}
}
