const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DOB2", function () {
    let DOB2;
    let dob2;
    let MockERC20;
    let mockToken;
    let owner;
    let addr1;
    let addr2;
    let addrs;

    let addrMockToken;
    let addrDob2;

    const BACKED_AMOUNT = ethers.parseUnits("100", 18); // 100 tokens
    const MAX_SUPPLY = 100;

    beforeEach(async function () {
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

        // 部署模拟ERC20代币
        MockERC20 = await ethers.getContractFactory("MockERC20");
        mockToken = await MockERC20.deploy("Mock Token", "MTK");
        // console.log("mockToken:", mockToken.address);  undefined
        addrMockToken = await mockToken.getAddress();
        //console.log("mockToken:", addrMockToken);

        // 部署DOB2合约
        DOB2 = await ethers.getContractFactory("DOB2");
        dob2 = await DOB2.deploy(
            addrMockToken,//mockToken.address,
            BACKED_AMOUNT,
            MAX_SUPPLY
        );
        addrDob2 = await dob2.getAddress();
        //console.log("dob2:", addrDob2);

        // 给测试账户铸造一些ERC20代币
        const baTmp = BACKED_AMOUNT * 10n;
        await mockToken.mint(addr1.address, baTmp);//BACKED_AMOUNT.mul(10)
        await mockToken.mint(addr2.address, baTmp);//BACKED_AMOUNT.mul(10)
        
        // 授权DOB2合约使用ERC20代币
        await mockToken.connect(addr1).approve(addrDob2, baTmp);//BACKED_AMOUNT.mul(10)
        await mockToken.connect(addr2).approve(addrDob2, baTmp);//BACKED_AMOUNT.mul(10)
    });

    describe("部署", function () {
        it("应该正确设置初始参数", async function () {
            expect(await dob2.backedToken()).to.equal(addrMockToken);//mockToken.address
            expect(await dob2.backedAmount()).to.equal(BACKED_AMOUNT);
            expect(await dob2.maxSupply()).to.equal(MAX_SUPPLY);
            expect(await dob2.name()).to.equal("DOB2Name");
            expect(await dob2.symbol()).to.equal("DOB2Symbol");
        });

        it("应该拒绝无效的代币地址", async function () {
            await expect(
                DOB2.deploy(
                    ethers.ZeroAddress,
                    BACKED_AMOUNT,
                    MAX_SUPPLY
                )
            ).to.be.revertedWith("Invalid token address");
        });

        it("应该拒绝无效的支撑资产数量", async function () {
            await expect(
                DOB2.deploy(
                    addrMockToken,//mockToken.address,
                    0,
                    MAX_SUPPLY
                )
            ).to.be.revertedWith("Invalid backed amount");
        });
    });

    describe("铸造", function () {
        it("应该正确铸造单个DOB2代币", async function () {
            await expect(dob2.connect(addr1).mint())
                .to.emit(dob2, "TokenMinted")
                .withArgs(addr1.address, 1);

            expect(await dob2.balanceOf(addr1.address)).to.equal(1);
            expect(await dob2.ownerOf(1)).to.equal(addr1.address);
            expect(await dob2.backedAssets(1)).to.equal(BACKED_AMOUNT);
            expect(await mockToken.balanceOf(addrDob2)).to.equal(BACKED_AMOUNT);
        });

        it("应该在ERC20余额不足时拒绝铸造", async function () {
            const bal = await mockToken.balanceOf(addr1.address);
            //console.log("bal:", bal);
            // 清空账户余额
            await mockToken.connect(addr1).transfer(owner.address, bal);
            
            await expect(
                dob2.connect(addr1).mint()
            ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
        });

        it("应该在达到最大供应量时拒绝铸造", async function () {
            const smallDob2 = await DOB2.deploy(
                addrMockToken,//mockToken.address,
                BACKED_AMOUNT,
                2
            );
            const addr = await smallDob2.getAddress();
            await mockToken.connect(addr1).approve(addr, BACKED_AMOUNT * 3n);

            await smallDob2.connect(addr1).mint();
            await smallDob2.connect(addr1).mint();

            await expect(
                smallDob2.connect(addr1).mint()
            ).to.be.revertedWith("Max supply reached");
        });

        it("应该在maxSupply为0时允许无限铸造", async function () {
            const unlimitedDob2 = await DOB2.deploy(
                addrMockToken,//mockToken.address,
                BACKED_AMOUNT,
                0
            );
            const addr = await unlimitedDob2.getAddress();
            await mockToken.connect(addr1).approve(addr, BACKED_AMOUNT * 5n);

            for(let i = 0; i < 5; i++) {
                await unlimitedDob2.connect(addr1).mint();
            }

            expect(await unlimitedDob2.ownerOf(5)).to.equal(addr1.address);
        });

        it("应该正确批量铸造DOB2代币", async function () {
            const amount = 3;
            await expect(dob2.connect(addr1).mintMany(amount))
                .to.emit(dob2, "TokensMinted")
                .withArgs(addr1.address, amount, amount);

            expect(await dob2.balanceOf(addr1.address)).to.equal(amount);
            expect(await dob2.ownerOf(amount)).to.equal(addr1.address);
            expect(await mockToken.balanceOf(addrDob2)).to.equal(BACKED_AMOUNT * BigInt(amount));
        });

        it("应该拒绝批量铸造1个代币", async function () {
            await expect(
                dob2.connect(addr1).mintMany(1)
            ).to.be.revertedWith("Incorrect amount");
        });
    });

    describe("销毁", function () {
        beforeEach(async function () {
            await dob2.connect(addr1).mint();
        });

        it("应该允许持有者销毁代币并收回ERC20代币", async function () {
            const tokenId = 1;
            const balanceBefore = await mockToken.balanceOf(addr1.address);

            await dob2.connect(addr1).melt(tokenId);

            const balanceAfter = await mockToken.balanceOf(addr1.address);
            expect(balanceAfter - balanceBefore).to.equal(BACKED_AMOUNT);
            await expect(dob2.ownerOf(tokenId))
                .to.be.revertedWith("ERC721: invalid token ID");
        });

        it("应该拒绝非持有者销毁代币", async function () {
            await expect(
                dob2.connect(addr2).melt(1)
            ).to.be.revertedWith("Not token owner");
        });
    });

    describe("基础URI", function () {
        it("应该允许所有者设置baseURI", async function () {
            const newURI = "https://new.api.dob.com/token/";
            await dob2.connect(owner).setBaseURI(newURI);
            
            await dob2.connect(addr1).mint();
            expect(await dob2.tokenURI(1)).to.equal(newURI + "1");
        });

        it("应该禁止非所有者设置baseURI", async function () {
            const newURI = "https://new.api.dob.com/token/";
            await expect(
                dob2.connect(addr1).setBaseURI(newURI)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });
});