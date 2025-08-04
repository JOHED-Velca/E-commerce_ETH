// contracts/FlowCartToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract FlowCartToken is ERC20 {
    constructor(uint256 initialSupply) ERC20("FlowCart Token", "FCT") {
        _mint(msg.sender, initialSupply);
    }
}