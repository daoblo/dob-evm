// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DOB is ERC721, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    // 每个代币ID对应的ETH资产数量，适用于高阶场景，比如累积支撑资产，从而实现不同等级的DOB支撑的资产数量是不同的
    mapping(uint256 => uint256) public backedAssets;
    // 铸造DOB所需的ETH数量
    uint256 public constant BACKED_ASSET_AMOUNT = 0.0007 ether;
    // 最大铸造数量，0表示不限制
    uint256 public immutable maxSupply;

    event TokenMinted(address indexed to, uint256 indexed tokenId);
    event TokensMinted(address indexed to, uint256 indexed lastTokenId, uint256 amount);
    event TokenMelted(address indexed from, uint256 indexed tokenId);

    string private _baseTokenURI;
    
    constructor(uint256 _maxSupply) ERC721("DOBName", "DOBSymbol") {
        maxSupply = _maxSupply;
        _baseTokenURI = "https://api.dob.com/token/";
    }
    
    function setBaseURI(string memory newURI) external onlyOwner {
        _baseTokenURI = newURI;
    }
    
    function _baseURI() internal view virtual override returns (string memory) {
        return _baseTokenURI;
    }

    // 铸造新的DOB代币
    function mintOne(address receiver) private returns (uint256) {
        uint256 currentSupply = _tokenIds.current();
        // 检查是否超过最大铸造数量限制
        require(
            maxSupply == 0 || currentSupply < maxSupply,
            "Max supply reached"
        );
        
        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();
        
        _safeMint(receiver, newTokenId);
        backedAssets[newTokenId] = BACKED_ASSET_AMOUNT;

        return newTokenId;
    }

    function mint() external payable returns (uint256) {
        require(msg.value == BACKED_ASSET_AMOUNT, "Incorrect ETH amount");
        
        uint256 newTokenId = mintOne(msg.sender);
        
        emit TokenMinted(msg.sender, newTokenId);
        return newTokenId;
    }

    // 用于逻辑展示，可能有性能问题，实际使用时应优化
    function mintMany(uint256 amount) external payable returns (uint256) {
        require(amount > 1, "Incorrect amount");
        require(msg.value == BACKED_ASSET_AMOUNT * amount, "Incorrect ETH amount");
        
        uint256 newTokenId;
        for (uint256 i = 0; i < amount; i++) {
            newTokenId = mintOne(msg.sender);
        }
        
        emit TokensMinted(msg.sender, newTokenId, amount);
        return newTokenId;
    }

    // 销毁DOB代币并提取ETH
    function melt(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        
        uint256 ethToReturn = backedAssets[tokenId];
        backedAssets[tokenId] = 0;
        
        _burn(tokenId);
        
        (bool success, ) = msg.sender.call{value: ethToReturn}("");
        require(success, "ETH transfer failed");
        
        emit TokenMelted(msg.sender, tokenId);
    }

    // 防止合约意外接收ETH
    receive() external payable {
        revert("Direct ETH transfer not allowed");
    }

    fallback() external payable {
        revert("Direct ETH transfer not allowed");
    }
}