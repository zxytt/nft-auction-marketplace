// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IAuction {
    struct AuctionDetails {
        address nftContract;
        uint256 tokenId;
        address seller;
        address paymentToken; // 0地址表示ETH
        uint256 startTime;
        uint256 endTime;
        uint256 reservePriceUsd; // 以美元计价的保留价（18位小数）
        uint256 highestBid; // 以支付代币计价的最高出价
        address highestBidder;
        bool ended;
    }

    event BidPlaced(address indexed bidder, uint256 amount);
    event AuctionEnded(address indexed winner, uint256 amount);

    function initialize(
        address _nftContract,
        uint256 _tokenId,
        address _seller,
        address _paymentToken,
        uint256 _duration,
        uint256 _reservePriceUsd,
        address _priceOracle,
        address _factory
    ) external;

    function placeBid() external payable;
    function endAuction() external;
    function auctionDetails() external view returns (AuctionDetails memory);
}
