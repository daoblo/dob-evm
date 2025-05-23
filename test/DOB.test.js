const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DOB", function () {
  let DOB;
  let dob;
  let owner;
  let addr1;
  let addr2;
  let addrs;

  let addrDob;

  const BACKED_ASSET_AMOUNT = ethers.parseEther("0.0007");
  const MAX_SUPPLY = 100;

  beforeEach(async function () {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
    DOB = await ethers.getContractFactory("DOB");
    // 部署合约时设置最大供应量为100
    dob = await DOB.deploy(MAX_SUPPLY);
    addrDob = await dob.getAddress();
  });

  describe("部署", function () {
    it("应该正确设置最大供应量", async function () {
      expect(await dob.maxSupply()).to.equal(MAX_SUPPLY);
    });

    it("应该正确设置名称和符号", async function () {
      expect(await dob.name()).to.equal("DOBName");
      expect(await dob.symbol()).to.equal("DOBSymbol");
    });

    it("应该允许所有者设置baseURI", async function () {
      const newURI = "https://new.api.dob.com/token/";
      await dob.connect(owner).setBaseURI(newURI);
      const tokenId = 1;
      await dob.connect(addr1).mint({ value: BACKED_ASSET_AMOUNT });
      expect(await dob.tokenURI(tokenId)).to.equal(newURI + tokenId);
    });

    it("应该禁止非所有者设置baseURI", async function () {
      const newURI = "https://new.api.dob.com/token/";
      await expect(dob.connect(addr1).setBaseURI(newURI))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("铸造", function () {
    it("应该正确铸造单个DOB代币", async function () {
      await expect(
        dob.connect(addr1).mint({ value: BACKED_ASSET_AMOUNT })
      ).to.emit(dob, "TokenMinted");

      expect(await dob.balanceOf(addr1.address)).to.equal(1);
      expect(await dob.ownerOf(1)).to.equal(addr1.address);
      expect(await dob.backedAssets(1)).to.equal(BACKED_ASSET_AMOUNT);
    });

    it("应该拒绝错误的ETH数量", async function () {
      await expect(
        dob.connect(addr1).mint({ value: 0 })
      ).to.be.revertedWith("Incorrect ETH amount");
    });

    it("应该在达到最大供应量时拒绝铸造", async function () {
      // 部署一个最大供应量为2的新合约
      const smallDob = await DOB.deploy(2);

      // 铸造两个代币
      await smallDob.connect(addr1).mint({ value: BACKED_ASSET_AMOUNT });
      await smallDob.connect(addr1).mint({ value: BACKED_ASSET_AMOUNT });

      // 第三次铸造应该失败
      await expect(
        smallDob.connect(addr1).mint({ value: BACKED_ASSET_AMOUNT })
      ).to.be.revertedWith("Max supply reached");
    });

    it("应该在maxSupply为0时允许无限铸造", async function () {
      const unlimitedDob = await DOB.deploy(0);

      // 连续铸造多个代币
      for (let i = 0; i < 5; i++) {
        await unlimitedDob.connect(addr1).mint({ value: BACKED_ASSET_AMOUNT });
      }

      expect(await unlimitedDob.ownerOf(5)).to.equal(addr1.address);
    });
  });

  describe("销毁和提取ETH", function () {
    let tokenId;

    beforeEach(async function () {
      await dob.connect(addr1).mint({ value: BACKED_ASSET_AMOUNT });
      tokenId = 1;
    });

    it("应该允许持有人销毁代币并提取ETH", async function () {
      const balanceBefore = await ethers.provider.getBalance(addr1.address);
      const tx = await dob.connect(addr1).melt(tokenId);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      //console.log("gasCost",gasCost);

      const balanceAfter = await ethers.provider.getBalance(addr1.address);
      const backed = balanceAfter + gasCost - balanceBefore;
      //console.log("backed",backed);
      expect(backed).to.equal(BACKED_ASSET_AMOUNT);

      await expect(
        dob.ownerOf(tokenId)
      ).to.be.revertedWith("ERC721: invalid token ID");
    });

    it("应该拒绝非持有人销毁代币", async function () {
      await expect(
        dob.connect(addr2).melt(tokenId)
      ).to.be.revertedWith("Not token owner");
    });
  });

  describe("ETH转账限制", function () {
    it("应该拒绝直接ETH转账", async function () {
      await expect(
        addr1.sendTransaction({
          to: addrDob,
          value: ethers.parseEther("0.001")
        })
      ).to.be.revertedWith("Direct ETH transfer not allowed");
    });
  });
});