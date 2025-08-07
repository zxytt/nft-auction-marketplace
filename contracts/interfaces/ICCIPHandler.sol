// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ICCIPHandler {
    function sendNFTToChain(
        uint64 destinationChainSelector,
        address receiver,
        address nftContract,
        uint256 tokenId
    ) external returns (bytes32 messageId);

    function createCrossChainAuction(
        uint64 destinationChainSelector,
        address nftContract,
        uint256 tokenId,
        address paymentToken,
        uint256 duration,
        uint256 reservePriceUsd
    ) external returns (bytes32 messageId);
}
