// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.9;

import '@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol';

contract TestMintableERC20Token is ERC20PresetMinterPauser {
    constructor(string memory name, string memory symbol)
        ERC20PresetMinterPauser(name, symbol)
    {}
}
