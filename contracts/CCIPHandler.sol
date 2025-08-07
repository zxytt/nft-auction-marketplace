// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Client} from "@chainlink/contracts-ccip/src/v0.8/ccip/libraries/Client.sol";
import {CCIPReceiver} from "@chainlink/contracts-ccip/src/v0.8/ccip/applications/CCIPReceiver.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/src/v0.8/ccip/interfaces/IRouterClient.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Withdraw} from "@chainlink/contracts-ccip/src/v0.8/ccip/applications/Withdraw.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./interfaces/ICCIPHandler.sol";
import "./AuctionFactory.sol";

contract CCIPHandler is ICCIPHandler, CCIPReceiver, Withdraw, Ownable {
    IRouterClient public router;
    address public linkToken;
    address public auctionFactory;
    
    // 记录跨链拍卖
    mapping(bytes32 => bool) public crossChainAuctionRequests;
    mapping(uint64 => address) public chainIdToHandler; // 目标链ID到对应处理器地址的映射

    event NFTSent(
        bytes32 indexed messageId,
        uint64 indexed destinationChainSelector,
        address receiver,
        address nftContract,
        uint256 tokenId
    );
    
    event CrossChainAuctionCreated(
        bytes32 indexed messageId,
        uint64 indexed destinationChainSelector,
        address indexed sender,
        address nftContract,
        uint256 tokenId
    );
    
    event ChainHandlerSet(uint64 indexed chainId, address handler);
    event RouterSet(address router);
    event LinkTokenSet(address linkToken);
    event AuctionFactorySet(address factory);

    constructor(
        address _router,
        address _linkToken,
        address _auctionFactory,
        address initialOwner
    ) 
        CCIPReceiver(_router) 
        Ownable(initialOwner) 
    {
        require(_router != address(0), "Invalid router");
        require(_linkToken != address(0), "Invalid LINK token");
        require(_auctionFactory != address(0), "Invalid auction factory");
        
        router = IRouterClient(_router);
        linkToken = _linkToken;
        auctionFactory = _auctionFactory;
        
        emit RouterSet(_router);
        emit LinkTokenSet(_linkToken);
        emit AuctionFactorySet(_auctionFactory);
    }

    // 设置目标链的处理器地址
    function setChainHandler(uint64 chainId, address handler) external onlyOwner {
        require(handler != address(0), "Invalid handler");
        chainIdToHandler[chainId] = handler;
        emit ChainHandlerSet(chainId, handler);
    }

    // 更新路由器地址
    function setRouter(address _router) external onlyOwner {
        require(_router != address(0), "Invalid router");
        router = IRouterClient(_router);
        emit RouterSet(_router);
    }

    // 更新LINK代币地址
    function setLinkToken(address _linkToken) external onlyOwner {
        require(_linkToken != address(0), "Invalid LINK token");
        linkToken = _linkToken;
        emit LinkTokenSet(_linkToken);
    }

    // 更新拍卖工厂地址
    function setAuctionFactory(address _auctionFactory) external onlyOwner {
        require(_auctionFactory != address(0), "Invalid auction factory");
        auctionFactory = _auctionFactory;
        emit AuctionFactorySet(_auctionFactory);
    }

    // 将NFT发送到其他链
    function sendNFTToChain(
        uint64 destinationChainSelector,
        address receiver,
        address nftContract,
        uint256 tokenId
    ) external returns (bytes32 messageId) {
        require(receiver != address(0), "Invalid receiver");
        require(nftContract != address(0), "Invalid NFT contract");
        require(chainIdToHandler[destinationChainSelector] != address(0), "No handler for chain");
        
        // 检查NFT所有权和授权
        require(IERC721(nftContract).ownerOf(tokenId) == msg.sender, "Not the NFT owner");
        require(
            IERC721(nftContract).isApprovedForAll(msg.sender, address(this)) ||
            IERC721(nftContract).getApproved(tokenId) == address(this),
            "Not approved for NFT"
        );
        
        // 构建CCIP消息
        Client.EVMTokenAmount[] memory tokenAmounts = new Client.EVMTokenAmount[](0);
        
        // 编码消息内容
        bytes memory data = abi.encode(
            msg.sender, // 原始发送者
            receiver,
            nftContract,
            tokenId,
            false // 不是创建拍卖
        );
        
        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver: abi.encode(chainIdToHandler[destinationChainSelector]),
            data: data,
            tokenAmounts: tokenAmounts,
            extraArgs: Client._argsToBytes(
                Client.EVMExtraArgsV1({gasLimit: 200_000})
            ),
            feeToken: linkToken
        });
        
        // 估算费用
        uint256 fee = router.getFee(destinationChainSelector, message);
        
        // 批准费用
        IERC20(linkToken).approve(address(router), fee);
        
        // 发送消息
        messageId = router.ccipSend(destinationChainSelector, message);
        
        // 转移NFT到本合约保管
        IERC721(nftContract).transferFrom(msg.sender, address(this), tokenId);
        
        emit NFTSent(messageId, destinationChainSelector, receiver, nftContract, tokenId);
        
        return messageId;
    }

    // 创建跨链拍卖
    function createCrossChainAuction(
        uint64 destinationChainSelector,
        address nftContract,
        uint256 tokenId,
        address paymentToken,
        uint256 duration,
        uint256 reservePriceUsd
    ) external returns (bytes32 messageId) {
        require(nftContract != address(0), "Invalid NFT contract");
        require(duration > 0, "Invalid duration");
        require(reservePriceUsd > 0, "Invalid reserve price");
        require(chainIdToHandler[destinationChainSelector] != address(0), "No handler for chain");
        
        // 检查NFT所有权和授权
        require(IERC721(nftContract).ownerOf(tokenId) == msg.sender, "Not the NFT owner");
        require(
            IERC721(nftContract).isApprovedForAll(msg.sender, address(this)) ||
            IERC721(nftContract).getApproved(tokenId) == address(this),
            "Not approved for NFT"
        );
        
        // 构建CCIP消息
        Client.EVMTokenAmount[] memory tokenAmounts = new Client.EVMTokenAmount[](0);
        
        // 编码消息内容
        bytes memory data = abi.encode(
            msg.sender, // 卖家
            nftContract,
            tokenId,
            paymentToken,
            duration,
            reservePriceUsd,
            true // 是创建拍卖
        );
        
        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver: abi.encode(chainIdToHandler[destinationChainSelector]),
            data: data,
            tokenAmounts: tokenAmounts,
            extraArgs: Client._argsToBytes(
                Client.EVMExtraArgsV1({gasLimit: 500_000})
            ),
            feeToken: linkToken
        });
        
        // 估算费用
        uint256 fee = router.getFee(destinationChainSelector, message);
        
        // 批准费用
        IERC20(linkToken).approve(address(router), fee);
        
        // 发送消息
        messageId = router.ccipSend(destinationChainSelector, message);
        
        // 转移NFT到本合约保管
        IERC721(nftContract).transferFrom(msg.sender, address(this), tokenId);
        
        crossChainAuctionRequests[messageId] = true;
        
        emit CrossChainAuctionCreated(messageId, destinationChainSelector, msg.sender, nftContract, tokenId);
        
        return messageId;
    }

    // 处理接收的CCIP消息
    function _ccipReceive(Client.Any2EVMMessage memory message) internal override {
        (bool success, bytes memory result) = address(this).call(abi.encodeWithSignature("handleReceivedMessage(bytes)", message.data));
        require(success, "Failed to handle message");
    }

    // 处理接收到的消息
    function handleReceivedMessage(bytes memory data) external {
        require(msg.sender == address(this), "Only this contract can call");
        
        // 检查消息类型（是NFT转移还是创建拍卖）
        (address originalSender, address nftContract, uint256 tokenId, bool isCreateAuction) = abi.decode(
            data, (address, address, uint256, bool)
        );
        
        if (isCreateAuction) {
            // 解析创建拍卖的参数
            (
                address seller,
                address _nftContract,
                uint256 _tokenId,
                address paymentToken,
                uint256 duration,
                uint256 reservePriceUsd,
                bool _isCreateAuction
            ) = abi.decode(data, (address, address, uint256, address, uint256, uint256, bool));
            
            // 创建拍卖
            AuctionFactory(auctionFactory).createAuction(
                _nftContract,
                _tokenId,
                paymentToken,
                duration,
                reservePriceUsd
            );
        } else {
            // 解析NFT转移的参数
            (
                address _originalSender,
                address receiver,
                address _nftContract,
                uint256 _tokenId,
                bool _isCreateAuction
            ) = abi.decode(data, (address, address, address, uint256, bool));
            
            // 将NFT转移给接收者
            IERC721(_nftContract).transferFrom(address(this), receiver, _tokenId);
        }
    }

    // 允许合约接收NFT
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
