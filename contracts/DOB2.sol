// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract DOB2 is ERC721, Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    // 支撑资产的ERC20代币合约地址
    IERC20 public immutable backedToken;
    // 铸造DOB所需的ERC20代币数量
    uint256 public immutable backedAmount;
    // 最大铸造数量，0表示不限制
    uint256 public immutable maxSupply;
    
    // 每个代币ID对应的ERC20资产数量
    mapping(uint256 => uint256) public backedAssets;

    event TokenMinted(address indexed to, uint256 indexed tokenId);
    event TokensMinted(address indexed to, uint256 indexed lastTokenId, uint256 amount);
    event TokenMelted(address indexed from, uint256 indexed tokenId);

    string private _baseTokenURI;
    
    constructor(
        address _backedToken,
        uint256 _backedAmount,
        uint256 _maxSupply
    ) ERC721("DOB2Name", "DOB2Symbol") {
        require(_backedToken != address(0), "Invalid token address");
        require(_backedAmount > 0, "Invalid backed amount");
        backedToken = IERC20(_backedToken);
        backedAmount = _backedAmount;
        maxSupply = _maxSupply;
        _baseTokenURI = "https://api.dob.com/token/";
    }
    
    function setBaseURI(string memory newURI) external onlyOwner {
        _baseTokenURI = newURI;
    }
    
    function _baseURI() internal view virtual override returns (string memory) {
        return _baseTokenURI;
    }

    // 铸造新的DOB2代币
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
        backedAssets[newTokenId] = backedAmount;

        return newTokenId;
    }

    function mint() external returns (uint256) {
        // 先转移ERC20代币到合约
        require(
            backedToken.transferFrom(msg.sender, address(this), backedAmount),
            "Token transfer failed"
        );
        
        uint256 newTokenId = mintOne(msg.sender);
        
        emit TokenMinted(msg.sender, newTokenId);
        return newTokenId;
    }

    // 用于逻辑展示，可能有性能问题，实际使用时应优化
    function mintMany(uint256 amount) external payable returns (uint256) {
        require(amount > 1, "Incorrect amount");
        // 先转移ERC20代币到合约
        require(
            backedToken.transferFrom(msg.sender, address(this), backedAmount * amount),
            "Token transfer failed"
        );
        
        uint256 newTokenId;
        for (uint256 i = 0; i < amount; i++) {
            newTokenId = mintOne(msg.sender);
        }
        
        emit TokensMinted(msg.sender, newTokenId, amount);
        return newTokenId;
    }

    // 销毁DOB2代币并提取ERC20代币
    function melt(uint256 tokenId) external nonReentrant {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        
        uint256 tokenToReturn = backedAssets[tokenId];
        backedAssets[tokenId] = 0;
        
        _burn(tokenId);
        
        require(
            backedToken.transfer(msg.sender, tokenToReturn),
            "Token return failed"
        );
        
        emit TokenMelted(msg.sender, tokenId);
    }
}