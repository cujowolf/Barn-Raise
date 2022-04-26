// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @author publius
 * @title Barn Raiser 
 */

contract BarnRaise is Ownable {

    event CreateBarnRaise(
        uint256 bidStart, 
        uint256 bonusPerDay, 
        uint256 start, 
        uint256 length, 
        uint256 weatherStep, 
        uint256 target
    );
    event Sow(address indexed account, uint256 amount, uint256 weather);
    event CreateBid(
        address indexed account,
        uint256 amount,
        uint256 weather,
        uint256 idx,
        uint256 bonus
    );
    event UpdateBid(
        address indexed account,
        uint256 alteredAmount,
        uint256 addedAmount,
        uint256 prevWeather,
        uint256 prevIdx,
        uint256 newWeather,
        uint256 newIdx,
        uint256 newBonus
    );

    using SafeERC20 for IERC20;

    /////////////////////// TESTING //////////////////////
    // address constant public custodian = 0x925753106FCdB6D2f30C3db295328a0A1c5fD1D1; // Temporary: BF Multi-sig
    // address constant public token = 0x389781BD602A7FFCBd1464c95C48f813FF24a8C6; // Temporary: Bean Token
    // uint256 constant public bidStart = 1650891600;

    /////////////////////// TESTING //////////////////////

    // Bid Period Settings
    uint256 constant public bidStart = 1651496400; // 5/2 9 AM PST
    uint256 constant public bonusPerDay = 3;
    uint256 constant public bidDays = 7;
    uint256 constant public secondsPerDay = 86400;

    // Barn Raise Settings
    uint256 constant public start = bidStart + bidDays * secondsPerDay; // 5/9 9 AM PST
    uint256 constant public length = 259200; // 3 days denominated in seconds. 3*24*60*60
    uint256 constant public baseWeather = 20; // Start at 20% Weather
    uint256 constant public step = 600; // 10 minutes denominated in seconds.

    // General Settings
    address constant public custodian = 0x21DE18B6A8f78eDe6D16C50A167f6B222DC08DF7; // Temporary: BF Multi-sig
    address constant public token = 0xDC59ac4FeFa32293A95889Dc396682858d52e5Db; // Temporary: Bean Token
    uint256 constant target = 76_000_000 * 1e18;
    uint256 public funded = 0; // A variable indicating if the Barn Raise as been fully funded.

    // Farmer => Weather => idx => amount We need to add idx in the case where a Farmer posts 2 Bids at the same Weather.
    mapping(bytes32 => uint256) bids;

    constructor() {
        _transferOwnership(_msgSender());
        emit CreateBarnRaise(bidStart, bonusPerDay, start, length, step, target);
    }

    function sow(uint256 amount) external {
        require(started() && !ended(), "Barn Raise: Not active.");
        emit Sow(msg.sender, amount, getWeather());
        IERC20(token).safeTransferFrom(msg.sender, custodian, amount);
    }

    function createBid(uint256 amount, uint256 weather) external {
        uint256 bonus;
        (weather, bonus) = checkBid(weather);
        uint256 idx = saveBid(amount, weather);
        emit CreateBid(msg.sender, amount, weather, idx, bonus);
        IERC20(token).safeTransferFrom(msg.sender, custodian, amount);
    }

    function updateBid(uint256 newAmount, uint256 prevWeather, uint256 prevIdx, uint256 newWeather) external {
        uint256 bonus;
        (newWeather, bonus) = checkBid(newWeather);
        require(newWeather < prevWeather, "Barn Raise: Weather not valid.");
        uint256 prevAmount = deleteBid(newAmount, prevWeather, prevIdx);
        uint256 newIdx = saveBid(newAmount, newWeather);
        newAmount -= prevAmount;
        emit UpdateBid(msg.sender, prevAmount, newAmount, prevWeather, prevIdx, newWeather, newIdx, bonus);
        if (newAmount > 0) IERC20(token).safeTransferFrom(msg.sender, custodian, newAmount);
    }

    function setFunded(uint256 f) external onlyOwner {
        funded = f;
    }

    // Barn Raise

    function started() public view returns (bool) {
        return block.timestamp >= start;
    }

    function ended() public view returns (bool) {
        return block.timestamp > start + length || funded > 0;
    }

    function getWeather() public view returns (uint256 w) {
        if (!started()) return 0;
        w = (block.timestamp - start) / step + baseWeather;
    }

    // Bid Period

    function bid(bytes32 idx) external view returns (uint256) {
        return bids[idx];
    }

    function biddingStarted() public view returns (bool) {
        return block.timestamp >= bidStart;
    }

    function getBonus() public view returns (uint256 b) {
        if (started()) return 0;
        b = ((start - block.timestamp - 1) / secondsPerDay + 1) * bonusPerDay;
    }

    // Helpers
 
    function getMaxWeather(uint256 wea) private view returns (uint256 w) {
        w = getWeather();
        if (wea > w) w = wea;
    }

    function checkBid(uint256 weather) private view returns (uint256 w, uint256 b) {
        require(biddingStarted() && !ended(), "Barn Raise: Bidding not active.");
        w = getMaxWeather(weather);
        b = getBonus();
    }

    function saveBid(uint256 amount, uint256 weather) private returns (uint256 idx) {
        idx = block.timestamp;
        // CHECK IF HASH HERE IS CHEAPER!
        bytes32 hashId = createBidId(msg.sender, weather, idx);
        while (bids[hashId] > 0) {
            ++idx;
            hashId = createBidId(msg.sender, weather, idx);
        }
        bids[hashId] = amount;
    }

    function deleteBid(uint256 amount, uint256 weather, uint256 idx) private returns (uint256 prevAmount) {
        bytes32 hashId = createBidId(msg.sender, weather, idx);
        prevAmount = bids[hashId];
        require(prevAmount > 0, "Barn Raise: Bid not valid.");
        if (amount < prevAmount) prevAmount = amount;
        bids[hashId] -= prevAmount;
    }

    function createBidId(address account, uint256 w, uint256 idx) private pure returns (bytes32 id) {
        id = keccak256(abi.encodePacked(account, w, idx));
    }
}