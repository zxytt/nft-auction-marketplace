// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "./interfaces/IPriceOracle.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PriceOracle is IPriceOracle, Ownable {
    // Chainlink价格feed地址
    address public ethUsdPriceFeed;
    mapping(address => address) public tokenPriceFeeds;

    event PriceFeedSet(address indexed token, address indexed priceFeed);

    constructor(address _ethUsdPriceFeed, address initialOwner) Ownable(initialOwner) {
        ethUsdPriceFeed = _ethUsdPriceFeed;
    }

    function setTokenPriceFeed(address token, address priceFeed) external onlyOwner {
        require(priceFeed != address(0), "Invalid price feed address");
        tokenPriceFeeds[token] = priceFeed;
        emit PriceFeedSet(token, priceFeed);
    }

    function setEthUsdPriceFeed(address priceFeed) external onlyOwner {
        require(priceFeed != address(0), "Invalid price feed address");
        ethUsdPriceFeed = priceFeed;
        emit PriceFeedSet(address(0), priceFeed);
    }

    function getEthUsdPrice() public view returns (uint256) {
        (, int256 price, , uint256 updatedAt, ) = AggregatorV3Interface(ethUsdPriceFeed).latestRoundData();
        require(price > 0, "Invalid ETH price");
        require(updatedAt > 0, "Round not complete");
        
        // 价格通常有8位小数，转换为18位小数
        return uint256(price) * 10 **10;
    }

    function getTokenUsdPrice(address token) public view returns (uint256) {
        address priceFeed = tokenPriceFeeds[token];
        require(priceFeed != address(0), "No price feed for token");
        
        (, int256 price, , uint256 updatedAt, ) = AggregatorV3Interface(priceFeed).latestRoundData();
        require(price > 0, "Invalid token price");
        require(updatedAt > 0, "Round not complete");
        
        // 假设价格feed返回8位小数，转换为18位
        return uint256(price) * 10** 10;
    }
}
