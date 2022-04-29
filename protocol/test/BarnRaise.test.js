const { expect } = require("chai");
const fs = require('fs');
const { takeSnapshot, revertToSnapshot } = require("./utils/snapshot.js");

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

describe("Barn Raise", function () {

  before(async function () {

    [owner,user] = await ethers.getSigners();

    let MockToken = fs.readFileSync(`./artifacts/contracts/MockToken.sol/MockToken.json`);
    await network.provider.send("hardhat_setCode", [BEAN, JSON.parse(MockToken).deployedBytecode]);
    this.token = await ethers.getContractAt('MockToken', BEAN);

    await this.token.setDecimals(18)

    const BarnRaise = await ethers.getContractFactory('BarnRaise')
    this.barnRaise = await BarnRaise.connect(owner).deploy([this.token.address]);
    await this.barnRaise.deployed()

    await owner.sendTransaction({ to: BF, value: ethers.utils.parseEther("10") });
    await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [BF] });
    const bf = await ethers.getSigner(BF)

    await this.token.connect(bf).burn(await this.token.balanceOf(BF))
    await this.token.mint(user.address, ethers.utils.parseEther('1000000'))
    await this.token.connect(user).approve(this.barnRaise.address, ethers.utils.parseEther('100000000000'));

    start = parseInt(await this.barnRaise.start());
    bidStart = parseInt(await this.barnRaise.bidStart());
    length = parseInt(await this.barnRaise.length())
    end = start + length;
  });

  beforeEach(async function () {
    snapshotId = await takeSnapshot();
    this.amountOut = await this.barnRaise.callStatic.getUsdcOut(to18('1'))
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  it ('reverts if weather too high', async function () {
    await network.provider.send("evm_setNextBlockTimestamp", [start+1])
    await expect(this.barnRaise.connect(user).createBid(this.token.address, to18('1'), '453')).to.be.revertedWith('Barn Raise: Weather too high.')
  })

  it ('sow reverts if token not whitelisted', async function () {
    await network.provider.send("evm_setNextBlockTimestamp", [start+1])
    await expect(this.barnRaise.connect(user).createBid(BF, to18('1'), '453')).to.be.reverted
  })

  it ('sow reverts if token not whitelisted', async function () {
    await network.provider.send("evm_setNextBlockTimestamp", [start+1])
    await expect(this.barnRaise.connect(user).sow(BF, to18('1'))).to.be.reverted
  })

  it ('update reverts if token not whitelisted', async function () {
    await network.provider.send("evm_setNextBlockTimestamp", [start - 2])
    await this.barnRaise.connect(user).createBid(this.token.address, to18('1'), '2');
    await expect(this.barnRaise.connect(user).updateBid(BF, to6('2'), '2', start - 2, '1')).to.be.reverted
  })

  it('Sow', async function () {
    await network.provider.send("evm_setNextBlockTimestamp", [start+1])
    const result = await this.barnRaise.connect(user).sow(this.token.address, to18('1'));
    expect(await this.token.balanceOf(BF)).to.equal(to18('1'));
    await expect(result).to.emit(this.barnRaise, 'Sow').withArgs(user.address, to6('1'), '20');
  })

  it('Create Bid with bonus', async function () {
    await network.provider.send("evm_setNextBlockTimestamp", [bidStart+1])
    const result = await this.barnRaise.connect(user).createBid(this.token.address, to18('1'), '21');
    expect(await this.token.balanceOf(BF)).to.equal(to18('1'));
    await expect(result).to.emit(this.barnRaise, 'CreateBid').withArgs(user.address, to6('1'), '21', bidStart+1, '21');
  })

  it('Create Bid below min weather', async function () {
    await network.provider.send("evm_setNextBlockTimestamp", [bidStart+timePerDay])
    const result = await this.barnRaise.connect(user).createBid(this.token.address, to18('1'), '1');
    expect(await this.token.balanceOf(BF)).to.equal(to18('1'));
    await expect(result).to.emit(this.barnRaise, 'CreateBid').withArgs(user.address, to6('1'), '1', bidStart+timePerDay, '18');
  })

  it('Update Bid', async function () {
    await network.provider.send("evm_setNextBlockTimestamp", [start - 2])
    await this.barnRaise.connect(user).createBid(this.token.address, to18('1'), '2');
    const result = await this.barnRaise.connect(user).updateBid(this.token.address, to6('1'), '2', start - 2, '1');
    expect(await this.token.balanceOf(BF)).to.equal(to18('1'));
    await expect(result).to.emit(this.barnRaise, 'UpdateBid').withArgs(
      user.address, 
      to6('1'),
      to6('0'),
      '2', 
      start - 2,
      '1', 
      start - 1, 
      '3'
    );
  })

  it('Create and Update Bid', async function () {
    await network.provider.send("evm_setNextBlockTimestamp", [start + 601])
    await this.barnRaise.connect(user).createBid(this.token.address, to18('1'), '25');
    const result = await this.barnRaise.connect(user).updateBid(this.token.address, to6('2'), '25', start + 601, '3');
    expect(await this.token.balanceOf(BF)).to.equal(to18('2'));
    await expect(result).to.emit(this.barnRaise, 'UpdateBid').withArgs(
      user.address, 
      to6('1'),
      to6('1'),
      '25', 
      start + 601,
      '21', 
      start + 602,
      '0'
    );
  })

  it('Create and Update Bid', async function () {
    await network.provider.send("evm_setNextBlockTimestamp", [start + 601])
    await this.barnRaise.connect(user).createBid(this.token.address, to18('1'), '25');
    const result = await this.barnRaise.connect(user).updateBid(this.token.address, to6('0.5'), '25', start + 601, '3');
    expect(await this.token.balanceOf(BF)).to.equal(to18('1'));
    await expect(result).to.emit(this.barnRaise, 'UpdateBid').withArgs(
      user.address, 
      to6('0.5'), 
      to6('0'),
      '25', 
      start + 601,
      '21', 
      start + 602,
      '0'
    );
  })

  it('reverts if update Bid with lower weather', async function () {
    await network.provider.send("evm_setNextBlockTimestamp", [bidStart+timePerDay])
    await this.barnRaise.connect(user).createBid(this.token.address, to18('1'), '20')
    await expect(this.barnRaise.connect(user).updateBid(this.token.address, to18('1'), '20', bidStart+timePerDay, '25')).to.be.revertedWith('Barn Raise: Weather not valid.');
  })

  it('reverts if update Bid for non-existent Bid', async function () {
    await network.provider.send("evm_setNextBlockTimestamp", [bidStart+timePerDay])
    await expect(this.barnRaise.connect(user).updateBid(this.token.address, to18('1'), '30', bidStart+timePerDay, '25')).to.be.revertedWith('Barn Raise: Bid not valid.');
  })

  describe("End Barn Raise", async function () {
    it('reverts if not owner', async function () {
      await expect(this.barnRaise.connect(user).setFunded('1')).to.be.revertedWith('Ownable: caller is not the owner');
    })

    it('ends Barn Raise', async function () {
      await network.provider.send("evm_setNextBlockTimestamp", [start + 601])
      await this.barnRaise.connect(owner).setFunded('1')
      await expect(this.barnRaise.sow(this.token.address, to18('1'))).to.be.revertedWith('Barn Raise: Not active.')
      await expect(this.barnRaise.createBid(this.token.address, to18('1'), '1')).to.be.revertedWith('Barn Raise: Bidding not active.')
      await expect(this.barnRaise.updateBid(this.token.address, to18('1'), '1', '123', '1')).to.be.revertedWith('Barn Raise: Bidding not active.')
    })
  })

  describe("Sow", async function () {
    it("Reverts if early", async function () {
      await network.provider.send("evm_setNextBlockTimestamp", [parseInt(start) - 1])
      await expect(this.barnRaise.sow(this.token.address, to18('1'))).to.be.revertedWith('Barn Raise: Not active.')
    })

    it("Reverts if late", async function () {
      await network.provider.send("evm_setNextBlockTimestamp", [parseInt(end) + 1])
      await expect(this.barnRaise.sow(this.token.address, to18('1'))).to.be.revertedWith('Barn Raise: Not active.')
    })
  });

  describe("Bid", async function () {
    it("Reverts if early", async function () {
      await network.provider.send("evm_setNextBlockTimestamp", [parseInt(bidStart) - 1])
      await expect(this.barnRaise.createBid(this.token.address, to18('1'), 100)).to.be.revertedWith('Barn Raise: Bidding not active.')
    })
    it("Reverts if early", async function () {
      await network.provider.send("evm_setNextBlockTimestamp", [parseInt(bidStart) - 1])
      await expect(this.barnRaise.updateBid(this.token.address, to18('1'), 100, '123', 110)).to.be.revertedWith('Barn Raise: Bidding not active.')
    })
    it("Reverts if late", async function () {
      await network.provider.send("evm_setNextBlockTimestamp", [parseInt(end) + 1])
      await expect(this.barnRaise.createBid(this.token.address, to18('1'), 100)).to.be.revertedWith('Barn Raise: Bidding not active.')
    })
    it("Reverts if late", async function () {
      await network.provider.send("evm_setNextBlockTimestamp", [parseInt(end) + 1])
      await expect(this.barnRaise.updateBid(this.token.address, to18('1'), 100, '123', 110)).to.be.revertedWith('Barn Raise: Bidding not active.')
    })
  });

  describe("Whitelist", async function () {
    it('Owner whitelists', async function () {
      await this.barnRaise.connect(owner).dewhitelist(this.token.address)
      expect(await this.barnRaise.isWhitelisted(this.token.address)).to.be.equal(false);
    })

    it('Reverts if not owner', async function () {
      await expect(this.barnRaise.connect(user).dewhitelist(this.token.address)).to.be.reverted
      await expect(this.barnRaise.connect(user).whitelist(this.token.address)).to.be.reverted
    })

    it('Reverts if not owner', async function () {
      await this.barnRaise.connect(owner).dewhitelist(this.token.address)
      await this.barnRaise.connect(owner).whitelist(this.token.address)
      expect(await this.barnRaise.isWhitelisted(this.token.address)).to.be.equal(true);
    })
  })
});
