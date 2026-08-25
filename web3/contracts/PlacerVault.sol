// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./IBettazooEscrow.sol";

/**
 * @title PlacerVault
 * @notice Per-user vault holding USDT collateral, cloned per-user via PlacerVaultFactory
 *         (EIP-1167 minimal proxy). The owner deposits/withdraws freely; a keeper places
 *         and cancels BettazooEscrow offers on the owner's behalf, within owner-set bounds.
 *
 * Non-custodial guarantee: `withdraw()` always pays `msg.sender` — there is no destination
 * parameter anywhere in this contract. Neither the keeper nor any backend process can ever
 * redirect vault funds anywhere but back to the owner who deposited them.
 *
 * `escrow`/`stablecoin` are immutable and set once on the implementation contract's own
 * constructor — safe to share across every clone since immutables are inlined into the
 * shared runtime bytecode read via delegatecall. `owner`/`keeper`/`paused` are per-clone
 * storage, set through the one-time `initialize()` call.
 */
contract PlacerVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable stablecoin;
    address public immutable escrow;

    address public owner;
    address public keeper;
    bool public paused;
    uint256 public maxSingleOfferLiability; // 0 = no cap

    bool private _initialized;

    event VaultInitialized(address indexed owner, address indexed keeper);
    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event KeeperUpdated(address indexed oldKeeper, address indexed newKeeper);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event MaxSingleOfferLiabilityUpdated(uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyKeeper() {
        require(msg.sender == keeper, "Not keeper");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Vault paused");
        _;
    }

    /// @dev Runs once, on the implementation contract itself (never on a clone — clones
    ///      skip the constructor entirely). Sets the shared immutables and marks the
    ///      implementation as already-initialized so its own `initialize()` can never be
    ///      called — a standard guard against someone hijacking the bare implementation.
    constructor(address _escrow, address _stablecoin) {
        escrow = _escrow;
        stablecoin = IERC20(_stablecoin);
        _initialized = true;
    }

    /// @dev Called exactly once by the factory, atomically in the same transaction as
    ///      `Clones.clone()`, so there is no window for anyone to front-run this on a
    ///      freshly created clone.
    function initialize(address _owner, address _keeper) external {
        require(!_initialized, "Already initialized");
        _initialized = true;
        owner = _owner;
        keeper = _keeper;
        stablecoin.forceApprove(escrow, type(uint256).max);
        emit VaultInitialized(_owner, _keeper);
    }

    // ─── Owner ─────────────────────────────────────────────────────────────────

    function deposit(uint256 amount) external onlyOwner nonReentrant {
        stablecoin.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    /// @notice Withdraws to the owner only. This is the non-custodial guarantee in code:
    ///         no recipient parameter exists, so this function can never send funds
    ///         anywhere but back to whoever deposited them.
    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        stablecoin.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function setKeeper(address _keeper) external onlyOwner {
        emit KeeperUpdated(keeper, _keeper);
        keeper = _keeper;
    }

    /// @notice Hard, on-chain cap the keeper cannot exceed regardless of backend state.
    ///         0 means uncapped.
    function setMaxSingleOfferLiability(uint256 amount) external onlyOwner {
        maxSingleOfferLiability = amount;
        emit MaxSingleOfferLiabilityUpdated(amount);
    }

    /// @notice Hard kill switch: blocks the keeper from placing new offers regardless of
    ///         what the backend's own state thinks is going on.
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    // ─── Keeper ────────────────────────────────────────────────────────────────

    /// @notice Places an offer on the Escrow using this vault's own USDT balance as
    ///         collateral. The vault (not the keeper) becomes `Offer.placer` on-chain, so
    ///         both refunds (`cancelOffer`) and winnings (`resolveEvent`) flow back into
    ///         this vault automatically — the keeper never touches the funds directly.
    function placeOffer(
        string calldata eventId,
        uint8 outcome,
        uint256 odds,
        uint256 liability
    ) external onlyKeeper whenNotPaused nonReentrant returns (uint256 offerId) {
        if (maxSingleOfferLiability > 0) {
            require(liability <= maxSingleOfferLiability, "Exceeds max single offer liability");
        }
        return IBettazooEscrow(escrow).createOffer(eventId, outcome, odds, liability);
    }

    /// @notice Cancels an offer, refunding its remaining liability back into this vault.
    ///         Callable by the keeper (normal strategy churn) or the owner (emergency
    ///         override if the keeper is unresponsive or misbehaving).
    function cancelOffer(uint256 offerId) external nonReentrant {
        require(msg.sender == keeper || msg.sender == owner, "Not authorized");
        IBettazooEscrow(escrow).cancelOffer(offerId);
    }

    // ─── View ──────────────────────────────────────────────────────────────────

    function balance() external view returns (uint256) {
        return stablecoin.balanceOf(address(this));
    }
}
