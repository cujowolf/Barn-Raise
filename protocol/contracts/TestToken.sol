/*
 SPDX-License-Identifier: MIT
*/

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/**
 * @author Publius
 * @title Mock Token
**/
contract TestToken is Ownable, ERC20, ERC20Burnable {

    uint8 private _decimals = 18;

    constructor()
    ERC20("Barn Raise", "BARN")
    { }

    function mint(address account, uint256 amount) external onlyOwner returns (bool) {
        _mint(account, amount);
        return true;
    }

    function burnFrom(address account, uint256 amount) public override(ERC20Burnable) {
        ERC20Burnable.burnFrom(account, amount);
    }

    function burn(uint256 amount) public override(ERC20Burnable) {
        ERC20Burnable.burn(amount);
    }

    function setDecimals(uint8 dec) onlyOwner public {
        _decimals = dec;
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

}