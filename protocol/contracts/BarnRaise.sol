// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./ISwapRouter.sol";
import "./IQuoter.sol";
import "./IWETH.sol";

/**
 * @author publius
 * @title Barn Raiser 
 */

interface IERC20D {
    function decimals() external view returns (uint8);
}

contract BarnRaise is Ownable, ReentrancyGuard {

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

    event Contribution(
        address token,
        uint256 amount
    );

    using SafeERC20 for IERC20;

    /////////////////////// RINKEBY //////////////////////

    // uint256 constant public bidStart = 1650891600;
    // address constant public USDC = 0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b; // Rinkeby
    // address constant WETH        = 0xc778417E063141139Fce010982780140Aa0cD5Ab;

    /////////////////////// MAINNET //////////////////////

    uint256 constant public bidStart = 1651496400; // 5/2 9 AM PST
    address constant public WETH     = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address constant public USDC     = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    //////////////////////////////////////////////////////

    // Bid Period Settings
    uint256 constant public bonusPerDay   = 3;
    uint256 constant public bidDays       = 7;
    uint256 constant public secondsPerDay = 86400;

    // Barn Raise Settings
    uint256 constant public start       = bidStart + bidDays * secondsPerDay; // 5/9 9 AM PST
    uint256 constant public length      = 259200; // 3 days denominated in seconds. 3*24*60*60
    uint256 constant public baseWeather = 20; // Start at 20% Weather
    uint256 constant public step        = 600; // 10 minutes denominated in seconds.
    uint256 constant public maxWeather  = 452;

    // Raise Settings
    address constant public custodian = 0x21DE18B6A8f78eDe6D16C50A167f6B222DC08DF7; // Temporary: BF Multi-sig
    uint256 constant target           = 77_000_000 * 1e18;
    uint256 constant decimals         = 6;

    // Uniswap Settings
    address constant SWAP_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    address constant QUOTER      = 0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6;
    uint24 constant POOL_FEE     = 500;

    uint256 public funded = 0; // A variable indicating if the Barn Raise as been fully funded.
    mapping(address => uint256) whitelisted; // A mapping specifying whether a token is whitelisted or not.

    // Farmer => Weather => idx => amount We need to add idx in the case where a Farmer posts 2 Bids at the same Weather.
    mapping(bytes32 => uint256) bids;

    constructor(address[] memory tokens) {
        for (uint256 i = 0; i < tokens.length; i++) {
            whitelisted[tokens[i]] = 10 ** (IERC20D(tokens[i]).decimals() - decimals);
        }
        IERC20(WETH).approve(SWAP_ROUTER, type(uint256).max);
        _transferOwnership(_msgSender());
        emit CreateBarnRaise(bidStart, bonusPerDay, start, length, step, target);
    }

    ////////////////////////////////////////// SOW ////////////////////////////////////////////////

    function buyAndSow(uint256 minBuyAmount, uint256 amount) external payable nonReentrant {
        uint256 amountOut = buy(minBuyAmount);
        _sow(amount + amountOut);
        if (amount > 0) sendToken(USDC, amount);
        emit Contribution(USDC, amount + amountOut);
    }

    function sow(address token, uint256 amount) external nonReentrant {
        _sow(amount / whitelisted[token]);
        sendToken(token, amount);
        emit Contribution(token, amount);
    }

    function _sow(uint256 amount) private {
        require(started() && !ended(), "Barn Raise: Not active.");
        emit Sow(msg.sender, amount, getWeather());
    }

    ///////////////////////////////////// CREATE BID //////////////////////////////////////////////

    function buyAndCreateBid(uint256 minBuyAmount, uint256 amount, uint256 weather) external payable nonReentrant {
        uint256 amountOut = buy(minBuyAmount);
        if (amount > 0) sendToken(USDC, amount);
        _createBid(amount + amountOut, weather);
        emit Contribution(USDC, amount + amountOut);
    }

    function createBid(address token, uint256 amount, uint256 weather) external nonReentrant {
        _createBid(amount / whitelisted[token], weather);
        sendToken(token, amount);
        emit Contribution(token, amount);
    }

    function _createBid(uint256 amount, uint256 weather) private {
        uint256 bonus;
        (weather, bonus) = checkBid(weather);
        uint256 idx = saveBid(amount, weather);
        emit CreateBid(msg.sender, amount, weather, idx, bonus);
    }

    ///////////////////////////////////// UPDATE BID //////////////////////////////////////////////

    function buyAndUpdateBid(
        uint256 minBuyAmount, 
        uint256 newAmount, 
        uint256 prevWeather, 
        uint256 prevIdx, 
        uint256 newWeather
    ) external payable nonReentrant {
        uint256 amountOut = buy(minBuyAmount);
        newAmount = _updateBid(newAmount, amountOut, prevWeather, prevIdx, newWeather);
        emit Contribution(USDC, newAmount + amountOut);
        if (newAmount > 0) sendToken(USDC, newAmount);
    }

    function updateBid(
        address token, 
        uint256 newAmount, 
        uint256 prevWeather, 
        uint256 prevIdx, 
        uint256 newWeather
    ) external nonReentrant {
        newAmount = _updateBid(newAmount, 0, prevWeather, prevIdx, newWeather);
        if (newAmount > 0) {
            emit Contribution(token, newAmount);
            sendToken(token, newAmount * whitelisted[token]);
        }
    }

    function _updateBid(
        uint256 newAmount,
        uint256 extraAmount,
        uint256 prevWeather, 
        uint256 prevIdx, 
        uint256 newWeather
    ) private returns (uint256 transferAmount) {
        uint256 bonus;
        (newWeather, bonus) = checkBid(newWeather);
        require(newWeather < prevWeather, "Barn Raise: Weather not valid.");
        uint256 prevAmount = deleteBid(newAmount, prevWeather, prevIdx);
        uint256 newIdx = saveBid(newAmount + extraAmount, newWeather);
        transferAmount = newAmount - prevAmount;
        emit UpdateBid(msg.sender, prevAmount, transferAmount + extraAmount, prevWeather, prevIdx, newWeather, newIdx, bonus);
    }

    ///////////////////////////////////// Barn Raise //////////////////////////////////////////////

    function setFunded(uint256 f) external onlyOwner {
        funded = f;
    }

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

    ///////////////////////////////////// Bid Period //////////////////////////////////////////////

    function bid(bytes32 idx) external view returns (uint256) {
        return bids[idx];
    }

    function getBonus() public view returns (uint256 b) {
        if (started()) return 0;
        b = ((start - block.timestamp - 1) / secondsPerDay + 1) * bonusPerDay;
    }

    function biddingStarted() public view returns (bool) {
        return block.timestamp >= bidStart;
    }

    function checkBid(uint256 weather) private view returns (uint256 w, uint256 b) {
        require(biddingStarted() && !ended(), "Barn Raise: Bidding not active.");
        require(weather <= maxWeather, "Barn Raise: Weather too high.");
         w = getWeather();
        if (weather > w) w = weather;
        b = getBonus();
    }

    function saveBid(uint256 amount, uint256 weather) private returns (uint256 idx) {
        idx = block.timestamp;
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

    ///////////////////////////////////// Contributing //////////////////////////////////////////////

    function whitelist(address token) external onlyOwner {
        whitelisted[token] = 10 ** (IERC20D(token).decimals() - decimals);
    }

    function dewhitelist(address token) external onlyOwner {
        whitelisted[token] = 0;
    }

    function isWhitelisted(address token) public view returns (bool) {
        return whitelisted[token] > 0;
    }

    function sendToken(address token, uint256 amount) private {
        IERC20(token).safeTransferFrom(msg.sender, custodian, amount);
    }

    function buy(uint256 minAmountOut) private returns (uint256 amountOut) {
        IWETH(WETH).deposit{value: msg.value}();
        ISwapRouter.ExactInputSingleParams memory params =
            ISwapRouter.ExactInputSingleParams({
                tokenIn: WETH,
                tokenOut: USDC,
                fee: POOL_FEE,
                recipient: custodian,
                deadline: block.timestamp,
                amountIn: msg.value,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0
            });
        amountOut = ISwapRouter(SWAP_ROUTER).exactInputSingle(params);
    }

    function getUsdcOut(uint ethAmount) external payable returns (uint256) {
        return IQuoter(QUOTER).quoteExactInputSingle(
            WETH,
            USDC,
            POOL_FEE,
            ethAmount,
            0
        );
    }
}