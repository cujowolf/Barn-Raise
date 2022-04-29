const { expect } = require("chai");
const { ethers } = require("hardhat");
const { takeSnapshot, revertToSnapshot } = require("./utils/snapshot.js");
const fs = require('fs');

const BEAN = '0xDC59ac4FeFa32293A95889Dc396682858d52e5Db';
const BF = '0x21DE18B6A8f78eDe6D16C50A167f6B222DC08DF7';
let user,owner;
let start;
let length;
let end;
let bidStart;
let timePerDay = 60*60*24

function to18(amount) {
  return ethers.utils.parseEther(amount);
}

function to6(amount) {
  return ethers.utils.parseUnits(amount, 6);
}

async function timestamp() {
  return (await hre.ethers.provider.getBlock("latest")).timestamp
}

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

describe("Barn Raise", function () {

  before(async function () {
    [owner, user] = await ethers.getSigners()

    this.usdc = await ethers.getContractAt('IERC20', USDC)

    const BarnRaise = await ethers.getContractFactory('BarnRaise')
    this.barnRaise = await BarnRaise.connect(owner).deploy([this.usdc.address])
    await this.barnRaise.deployed()

    await owner.sendTransaction({ to: BF, value: to18("10") })
    await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [BF] });
    const bf = await ethers.getSigner(BF)

    await this.usdc.connect(bf).transfer(user.address, this.usdc.balanceOf(BF));
    await this.usdc.connect(user).approve(this.barnRaise.address, to18('1000000'));

    start = parseInt(await this.barnRaise.start());
    bidStart = parseInt(await this.barnRaise.bidStart());
    length = parseInt(await this.barnRaise.length())
    end = start + length;
    await network.provider.send("evm_setNextBlockTimestamp", [start])
    this.amountOut = await this.barnRaise.callStatic.getUsdcOut(to18('1'))
  })

  beforeEach(async function () {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  describe("Buy and Create Bid", async function () {
    it("Just Buy", async function () {
      result = await this.barnRaise.connect(user).buyAndCreateBid('0', '0', '30', { value: to18('1') })
      expect(await this.usdc.balanceOf(BF)).to.equal(this.amountOut);
      await expect(result).to.emit(this.barnRaise, 'CreateBid').withArgs(user.address, this.amountOut, '30', await timestamp(), '0');
    })

    it("Buy and Add", async function () {
      result = await this.barnRaise.connect(user).buyAndCreateBid('0', to6('1'), '30', { value: to18('1') })
      const amount = this.amountOut.add(to6('1'))
      expect(await this.usdc.balanceOf(BF)).to.equal(amount);
      await expect(result).to.emit(this.barnRaise, 'CreateBid').withArgs(user.address, amount, '30', await timestamp(), '0');
    })
  })

  describe("Buy and Sow", async function () {
    it("Just Buy", async function () {
      result = await this.barnRaise.connect(user).buyAndSow('0', '0', { value: to18('1') })
      expect(await this.usdc.balanceOf(BF)).to.equal(this.amountOut);
      await expect(result).to.emit(this.barnRaise, 'Sow').withArgs(user.address, this.amountOut, '20');
    })

    it("Buy and Add", async function () {
      result = await this.barnRaise.connect(user).buyAndSow('0', to6('1'), { value: to18('1') })
      const amount = this.amountOut.add(to6('1'))
      expect(await this.usdc.balanceOf(BF)).to.equal(amount);
      await expect(result).to.emit(this.barnRaise, 'Sow').withArgs(user.address, amount, '20');
    })
  })

  describe("Buy and Update Bid", async function () {
    it("Just Buy", async function () {
      await this.barnRaise.connect(user).createBid(this.usdc.address, to6('1'), '30');
      const ts1 = await timestamp()
      const result = await this.barnRaise.connect(user).buyAndUpdateBid('0', to6('1'), '30', ts1, '25', { value: to18('1') });
      const amount = this.amountOut.add(to6('1'))
      expect(await this.usdc.balanceOf(BF)).to.equal(amount);
      await expect(result).to.emit(this.barnRaise, 'UpdateBid').withArgs(
        user.address, 
        to6('1'),
        this.amountOut,
        '30', 
        ts1,
        '25', 
        await timestamp(), 
        '0'
      );
    })

    it("Buy and Add", async function () {
      await this.barnRaise.connect(user).createBid(this.usdc.address, to6('1'), '30');
      const ts1 = await timestamp()
      const result = await this.barnRaise.connect(user).buyAndUpdateBid('0', to6('2'), '30', ts1, '25', { value: to18('1') });
      const amount = this.amountOut.add(to6('2'))
      expect(await this.usdc.balanceOf(BF)).to.equal(amount);
      await expect(result).to.emit(this.barnRaise, 'UpdateBid').withArgs(
        user.address, 
        to6('1'),
        this.amountOut.add(to6('1')),
        '30', 
        ts1,
        '25', 
        await timestamp(), 
        '0'
      );
    });
  })
});
