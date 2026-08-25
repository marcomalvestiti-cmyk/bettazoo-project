// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./PlacerVault.sol";

/**
 * @title PlacerVaultFactory
 * @notice Deploys one isolated PlacerVault clone (EIP-1167 minimal proxy) per user.
 *         One vault per owner in v1 — see `vaultOf`.
 */
contract PlacerVaultFactory is Ownable {
    address public immutable implementation;
    address public immutable escrow;
    address public immutable stablecoin;

    // Only affects vaults created after an update — existing vaults keep whatever keeper
    // they were initialized with, independently updatable by their own owner via
    // PlacerVault.setKeeper.
    address public defaultKeeper;

    mapping(address => address) public vaultOf; // owner => vault
    address[] public allVaults;

    event VaultCreated(address indexed owner, address indexed vault);
    event DefaultKeeperUpdated(address indexed oldKeeper, address indexed newKeeper);

    constructor(
        address _implementation,
        address _escrow,
        address _stablecoin,
        address _defaultKeeper
    ) Ownable(msg.sender) {
        implementation = _implementation;
        escrow = _escrow;
        stablecoin = _stablecoin;
        defaultKeeper = _defaultKeeper;
    }

    /// @notice Clones the PlacerVault implementation and initializes it for the caller,
    ///         atomically in one transaction — no window for anyone to front-run the
    ///         clone's `initialize()` call.
    function createVault() external returns (address vault) {
        require(vaultOf[msg.sender] == address(0), "Vault already exists");
        vault = Clones.clone(implementation);
        PlacerVault(vault).initialize(msg.sender, defaultKeeper);
        vaultOf[msg.sender] = vault;
        allVaults.push(vault);
        emit VaultCreated(msg.sender, vault);
    }

    function setDefaultKeeper(address _keeper) external onlyOwner {
        emit DefaultKeeperUpdated(defaultKeeper, _keeper);
        defaultKeeper = _keeper;
    }

    function allVaultsCount() external view returns (uint256) {
        return allVaults.length;
    }
}
