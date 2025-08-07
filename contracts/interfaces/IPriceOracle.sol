// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPriceOracle {
    function getEthUsdPrice() external view returns (uint256);
    function getTokenUsdPrice(address token) external view returns (uint256);
    function setTokenPriceFeed(address token, address priceFeed) external;
}
