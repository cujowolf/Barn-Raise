// const { expect } = require("chai");
// const { ethers } = require("hardhat");
// const fs = require('fs');

// const BEAN = '0xDC59ac4FeFa32293A95889Dc396682858d52e5Db';
// const BF = '0x21DE18B6A8f78eDe6D16C50A167f6B222DC08DF7';
// let user,owner;
// let start;
// let bidStart;
// let length;
// let end;
// function to18(amount) {
//   return ethers.utils.parseEther(amount);
// }

// describe("Barn Raise Time", function () {
//   beforeEach(async function () {
//     await network.provider.request({ method: "hardhat_reset", params: [] });

//     [owner,user] = await ethers.getSigners();

//     const BarnRaise = await ethers.getContractFactory('BarnRaise')
//     this.barnRaise = await BarnRaise.connect(user).deploy();
//     await this.barnRaise.deployed()

//     let MockToken = fs.readFileSync(`./artifacts/contracts/MockToken.sol/MockToken.json`);
//     await network.provider.send("hardhat_setCode", [BEAN, JSON.parse(MockToken).deployedBytecode]);

//     this.token = await ethers.getContractAt('MockToken', BEAN);

//     await this.token.mint(user.address, ethers.utils.parseEther('1000000'))
//     await this.token.connect(user).approve(this.barnRaise.address, ethers.utils.parseEther('100000000000'));

//     start = parseInt(await this.barnRaise.start());
//     bidStart = parseInt(await this.barnRaise.bidStart());
//     length = parseInt(await this.barnRaise.length())
//     end = start + length;

//   });

//   describe("Sow", async function () {
//     it("Reverts if early", async function () {
//       await network.provider.send("evm_setNextBlockTimestamp", [parseInt(start) - 1])
//       await expect(this.barnRaise.sow(to18('1'))).to.be.revertedWith('Barn Raise: Not active.')
//     })

//     it("Reverts if late", async function () {
//       await network.provider.send("evm_setNextBlockTimestamp", [parseInt(end) + 1])
//       await expect(this.barnRaise.sow(to18('1'))).to.be.revertedWith('Barn Raise: Not active.')
//     })
//   });

//   describe("Bid", async function () {
//     it("Reverts if early", async function () {
//       await network.provider.send("evm_setNextBlockTimestamp", [parseInt(bidStart) - 1])
//       await expect(this.barnRaise.createBid(to18('1'), 100)).to.be.revertedWith('Barn Raise: Bidding not active.')
//     })
//     it("Reverts if early", async function () {
//       await network.provider.send("evm_setNextBlockTimestamp", [parseInt(bidStart) - 1])
//       await expect(this.barnRaise.updateBid(to18('1'), 100, '123', 110)).to.be.revertedWith('Barn Raise: Bidding not active.')
//     })
//     it("Reverts if late", async function () {
//       await network.provider.send("evm_setNextBlockTimestamp", [parseInt(end) + 1])
//       await expect(this.barnRaise.createBid(to18('1'), 100)).to.be.revertedWith('Barn Raise: Bidding not active.')
//     })
//     it("Reverts if late", async function () {
//       await network.provider.send("evm_setNextBlockTimestamp", [parseInt(end) + 1])
//       await expect(this.barnRaise.updateBid(to18('1'), 100, '123', 110)).to.be.revertedWith('Barn Raise: Bidding not active.')
//     })
//   });
// });

