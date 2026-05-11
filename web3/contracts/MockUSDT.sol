// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDT — Bettazoo Alpha Test Token (no real value)
contract MockUSDT is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 1_000 * 10 ** 6; // 1 000 BTZ-USD
    uint256 public constant COOLDOWN      = 24 hours;

    mapping(address => uint256) public lastClaim;

    constructor() ERC20("Bettazoo Test USD", "BTZ-USD") {
        // Mint 10 M to deployer for seeding escrow / liquidity testing
        _mint(msg.sender, 10_000_000 * 10 ** 6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Claim 1 000 BTZ-USD once every 24 hours.
    function faucet() external {
        require(
            block.timestamp >= lastClaim[msg.sender] + COOLDOWN,
            "Cooldown: wait 24 h between claims"
        );
        lastClaim[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    /// @return claimable    true if the address can claim right now
    /// @return waitSeconds  seconds until next claim (0 if claimable)
    function canClaim(address user) external view returns (bool claimable, uint256 waitSeconds) {
        uint256 next = lastClaim[user] + COOLDOWN;
        if (block.timestamp >= next) return (true, 0);
        return (false, next - block.timestamp);
    }
}
