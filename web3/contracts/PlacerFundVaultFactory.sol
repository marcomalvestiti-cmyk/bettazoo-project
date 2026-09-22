// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./PlacerFundVault.sol";

/**
 * @title PlacerFundVaultFactory
 * @notice Deploys one isolated PlacerFundVault clone (EIP-1167 minimal proxy) per fund
 *         manager. One fund vault per owner in v1, same convention as PlacerVaultFactory.
 *         Also holds the platform-wide performance-fee economics (recipient, platform's
 *         share of the fee, and the cap on the rate a manager can set) so they can be
 *         updated live for every existing fund vault without a redeploy — same pattern
 *         already used by BettazooEscrow.platformFeePercentage.
 */
contract PlacerFundVaultFactory is Ownable {
    address public immutable implementation;
    address public immutable escrow;
    address public immutable stablecoin;

    // Only affects vaults created after an update — existing vaults keep whatever keeper
    // they were initialized with, independently updatable by their own owner via
    // PlacerFundVault.setKeeper.
    address public defaultKeeper;

    address public platformFeeRecipient;
    uint256 public platformFeeShareOfPerformance; // % of the performance fee itself, 0-100
    uint256 public maxPerformanceFeePercent;       // cap on manager-set performanceFeePercent, 0-100

    mapping(address => address) public fundVaultOf; // owner => fund vault
    address[] public allFundVaults;

    event FundVaultCreated(address indexed owner, address indexed vault);
    event DefaultKeeperUpdated(address indexed oldKeeper, address indexed newKeeper);
    event PlatformFeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event PlatformFeeShareUpdated(uint256 percent);
    event MaxPerformanceFeePercentUpdated(uint256 percent);

    constructor(
        address _implementation,
        address _escrow,
        address _stablecoin,
        address _defaultKeeper,
        address _platformFeeRecipient
    ) Ownable(msg.sender) {
        implementation = _implementation;
        escrow = _escrow;
        stablecoin = _stablecoin;
        defaultKeeper = _defaultKeeper;
        platformFeeRecipient = _platformFeeRecipient;
        platformFeeShareOfPerformance = 20;
        maxPerformanceFeePercent = 30;
    }

    /// @notice Clones the PlacerFundVault implementation and initializes it for the caller,
    ///         atomically in one transaction — no window for anyone to front-run the
    ///         clone's `initialize()` call.
    function createFundVault() external returns (address vault) {
        require(fundVaultOf[msg.sender] == address(0), "Fund vault already exists");
        vault = Clones.clone(implementation);
        PlacerFundVault(vault).initialize(msg.sender, defaultKeeper, address(this), stablecoin);
        fundVaultOf[msg.sender] = vault;
        allFundVaults.push(vault);
        emit FundVaultCreated(msg.sender, vault);
    }

    function setDefaultKeeper(address _keeper) external onlyOwner {
        emit DefaultKeeperUpdated(defaultKeeper, _keeper);
        defaultKeeper = _keeper;
    }

    function setPlatformFeeRecipient(address _recipient) external onlyOwner {
        emit PlatformFeeRecipientUpdated(platformFeeRecipient, _recipient);
        platformFeeRecipient = _recipient;
    }

    function setPlatformFeeShareOfPerformance(uint256 percent) external onlyOwner {
        require(percent <= 100, "Invalid percent");
        platformFeeShareOfPerformance = percent;
        emit PlatformFeeShareUpdated(percent);
    }

    function setMaxPerformanceFeePercent(uint256 percent) external onlyOwner {
        require(percent <= 100, "Invalid percent");
        maxPerformanceFeePercent = percent;
        emit MaxPerformanceFeePercentUpdated(percent);
    }

    function allFundVaultsCount() external view returns (uint256) {
        return allFundVaults.length;
    }
}
