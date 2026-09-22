// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import "./IBettazooEscrow.sol";
import "./PlacerFundVaultFactory.sol";

/**
 * @title PlacerFundVault
 * @notice ERC-4626 vault that lets a placer ("fund manager") raise third-party USDT capital
 *         (LPs) into a shared, quote-based pool, cloned per-owner via PlacerFundVaultFactory
 *         (EIP-1167 minimal proxy). A keeper places/cancels BettazooEscrow offers on the
 *         pool's behalf, within owner-set bounds — same trust model as the single-owner
 *         PlacerVault, extended to socialized capital with a performance fee.
 *
 * Non-custodial guarantee for LPs: withdraw()/redeem() always pay the caller-chosen
 * receiver via standard ERC-4626 mechanics, and are never gated by `approvedLPs` or
 * `paused` — an LP can always exit their own position regardless of what the fund manager
 * does later. Only *new* deposits are gated.
 *
 * NAV accounting: `totalAssets()` = liquid balance + `lockedLiability`. Liability leaves the
 * vault the instant an offer is placed (BettazooEscrow.createOffer pulls it immediately) and
 * only returns via a plain ERC20 transfer when BettazooEscrow.resolveEvent pays out directly
 * — there is no callback into the placer, so the vault cannot know on its own when that
 * capital is free again (and a callback would let one malicious/buggy fund vault block
 * resolveEvent's single loop over every bettor/placer in that event). `reportSettlement`
 * lets the keeper (already trusted with placing every bet) report it, capped per-offer so
 * it can never inflate NAV beyond what was truly locked for that specific offer — the same
 * "harvest/report" pattern used by production DeFi vaults (e.g. Yearn strategists).
 */
contract PlacerFundVault is ERC4626Upgradeable, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;
    using Math for uint256;

    uint256 private constant PRICE_PRECISION = 1e18;

    address public immutable escrow;

    address public owner;
    address public keeper;
    address public factory;
    bool public paused;
    uint256 public maxSingleOfferLiability; // 0 = no cap

    uint256 public lockedLiability;
    mapping(uint256 => uint256) public offerLockedLiability;

    mapping(address => bool) public approvedLPs;

    uint256 public performanceFeePercent; // owner-set, capped by factory.maxPerformanceFeePercent()
    uint256 public highWaterMark;          // price per share (assets * 1e18 / supply), 0 until first deposit

    event VaultInitialized(address indexed owner, address indexed keeper, address indexed factory);
    event KeeperUpdated(address indexed oldKeeper, address indexed newKeeper);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event MaxSingleOfferLiabilityUpdated(uint256 amount);
    event ApprovedLPUpdated(address indexed lp, bool approved);
    event PerformanceFeePercentUpdated(uint256 percent);
    event SettlementReported(uint256 indexed offerId, uint256 resolvedAmount);
    event FeesCrystallized(uint256 placerShares, uint256 platformShares, uint256 newHighWaterMark);

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
    ///      skip the constructor). Sets the shared immutable and permanently locks the
    ///      implementation via `_disableInitializers` so its own `initialize()` can never
    ///      be called — same intent as PlacerVault's `_initialized` guard, using the
    ///      canonical OZ mechanism since this contract is Initializable-based.
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address _escrow) {
        escrow = _escrow;
        _disableInitializers();
    }

    /// @dev Called exactly once by the factory, atomically in the same transaction as
    ///      `Clones.clone()`, so there is no window for anyone to front-run this on a
    ///      freshly created clone.
    function initialize(
        address _owner,
        address _keeper,
        address _factory,
        address _stablecoin
    ) external initializer {
        __ERC20_init("Bettazoo Vault Share", "BZVS");
        __ERC4626_init(IERC20(_stablecoin));
        owner = _owner;
        keeper = _keeper;
        factory = _factory;
        approvedLPs[_owner] = true; // manager can always fund their own vault, no extra step
        emit ApprovedLPUpdated(_owner, true);
        IERC20(_stablecoin).forceApprove(escrow, type(uint256).max);
        emit VaultInitialized(_owner, _keeper, _factory);
    }

    // ─── ERC-4626 overrides ────────────────────────────────────────────────────

    /// @notice NAV includes capital currently locked as collateral in open Escrow offers —
    ///         see contract-level note on why this can't be read trustlessly on-chain and
    ///         is instead tracked incrementally via placeOffer/cancelOffer/reportSettlement.
    function totalAssets() public view override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this)) + lockedLiability;
    }

    /// @notice Redemptions are capped by liquid balance — collateral locked in open offers
    ///         cannot be withdrawn until it returns (via cancelOffer or reportSettlement
    ///         freeing it up, both of which only ever reflect real on-chain balance moves).
    ///         `maxWithdraw` is defined by ERC4626Upgradeable in terms of `maxRedeem`, so
    ///         overriding this alone is sufficient (see OZ's own override guidance).
    function maxRedeem(address account) public view override returns (uint256) {
        uint256 ownerShares = balanceOf(account);
        uint256 liquidShares = _convertToShares(IERC20(asset()).balanceOf(address(this)), Math.Rounding.Floor);
        return ownerShares < liquidShares ? ownerShares : liquidShares;
    }

    function maxDeposit(address receiver) public view override returns (uint256) {
        if (paused || !approvedLPs[receiver]) return 0;
        return super.maxDeposit(receiver);
    }

    function maxMint(address receiver) public view override returns (uint256) {
        if (paused || !approvedLPs[receiver]) return 0;
        return super.maxMint(receiver);
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override nonReentrant {
        require(!paused, "Vault paused");
        require(approvedLPs[receiver], "LP not approved");
        bool firstDeposit = totalSupply() == 0;
        if (!firstDeposit) _crystallizeFees();
        super._deposit(caller, receiver, assets, shares);
        if (firstDeposit) {
            // Nothing to crystallize on the very first deposit — it establishes the
            // baseline, it is not "profit" over an undefined prior price.
            highWaterMark = totalAssets().mulDiv(PRICE_PRECISION, totalSupply());
        }
    }

    function _withdraw(
        address caller,
        address receiver,
        address shareOwner,
        uint256 assets,
        uint256 shares
    ) internal override nonReentrant {
        _crystallizeFees();
        super._withdraw(caller, receiver, shareOwner, assets, shares);
    }

    /// @dev Modest virtual-shares offset (OZ v4.9+ mechanism) so the classic ERC-4626
    ///      inflation/donation attack against an empty vault is economically unprofitable
    ///      without needing a manual seed-deposit dance in the factory.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 3;
    }

    // ─── Performance fee ───────────────────────────────────────────────────────

    /// @notice Vault-level high-water mark performance fee: whenever the price per share
    ///         exceeds the last crystallized peak, mints fee shares (diluting all holders
    ///         pro-rata) to the placer and the platform, split per
    ///         `factory.platformFeeShareOfPerformance()`, then ratchets the peak up to the
    ///         resulting post-fee price. This is the standard vault-level (not
    ///         per-depositor) performance fee pattern used across DeFi — freely-transferable
    ///         ERC-20 shares can't carry a reliable per-holder cost basis, so the fee is
    ///         socialized like every other production vault with this feature.
    ///         Permissionless and idempotent — safe to call from anywhere, including
    ///         automatically on every deposit/withdraw.
    function crystallizeFees() external {
        _crystallizeFees();
    }

    function _crystallizeFees() internal {
        uint256 supply = totalSupply();
        if (supply == 0) return;

        uint256 assets = totalAssets();
        uint256 currentPrice = assets.mulDiv(PRICE_PRECISION, supply);
        if (currentPrice <= highWaterMark) return;

        uint256 totalProfitAssets = (currentPrice - highWaterMark).mulDiv(supply, PRICE_PRECISION);
        uint256 feeAssets = (totalProfitAssets * performanceFeePercent) / 100;
        if (feeAssets == 0) {
            highWaterMark = currentPrice;
            return;
        }
        if (feeAssets >= assets) feeAssets = assets - 1; // guard: never mint against zero remaining assets

        uint256 platformSharePercent = PlacerFundVaultFactory(factory).platformFeeShareOfPerformance();
        uint256 platformFeeAssets = (feeAssets * platformSharePercent) / 100;
        uint256 placerFeeAssets = feeAssets - platformFeeAssets;

        uint256 denom = assets - feeAssets;
        uint256 placerShares = placerFeeAssets.mulDiv(supply, denom);
        uint256 platformShares = platformFeeAssets.mulDiv(supply, denom);

        if (placerShares > 0) _mint(owner, placerShares);
        if (platformShares > 0) {
            _mint(PlacerFundVaultFactory(factory).platformFeeRecipient(), platformShares);
        }

        highWaterMark = totalAssets().mulDiv(PRICE_PRECISION, totalSupply());
        emit FeesCrystallized(placerShares, platformShares, highWaterMark);
    }

    // ─── Owner ─────────────────────────────────────────────────────────────────

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

    /// @notice Hard kill switch: blocks the keeper from placing new offers and blocks new
    ///         deposits — never blocks LP withdrawals.
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /// @notice On-chain LP allowlist — a real gate, not just a UI/backend one. Revoking an
    ///         address only blocks *new* deposits from it; withdraw/redeem are never gated
    ///         by this mapping, so an LP already in the vault can always exit.
    function setApprovedLP(address lp, bool approved) external onlyOwner {
        approvedLPs[lp] = approved;
        emit ApprovedLPUpdated(lp, approved);
    }

    function setPerformanceFeePercent(uint256 percent) external onlyOwner {
        require(percent <= PlacerFundVaultFactory(factory).maxPerformanceFeePercent(), "Exceeds platform max");
        _crystallizeFees(); // don't apply a new rate retroactively to already-earned profit
        performanceFeePercent = percent;
        emit PerformanceFeePercentUpdated(percent);
    }

    // ─── Keeper ────────────────────────────────────────────────────────────────

    /// @notice Places an offer using this vault's own USDT balance as collateral, and
    ///         tracks the newly-locked liability for NAV accounting. The vault (not the
    ///         keeper) becomes `Offer.placer` on-chain, so both refunds and winnings flow
    ///         back into this vault automatically.
    function placeOffer(
        string calldata eventId,
        uint8 outcome,
        uint256 odds,
        uint256 liability
    ) external onlyKeeper whenNotPaused nonReentrant returns (uint256 offerId) {
        if (maxSingleOfferLiability > 0) {
            require(liability <= maxSingleOfferLiability, "Exceeds max single offer liability");
        }
        offerId = IBettazooEscrow(escrow).createOffer(eventId, outcome, odds, liability);
        lockedLiability += liability;
        offerLockedLiability[offerId] += liability;
    }

    /// @notice Cancels an offer and reconciles locked liability by the exact refund
    ///         received (measured via balance delta — no interface change to the Escrow
    ///         needed). Callable by the keeper or the owner (emergency override).
    function cancelOffer(uint256 offerId) external nonReentrant {
        require(msg.sender == keeper || msg.sender == owner, "Not authorized");
        uint256 before = IERC20(asset()).balanceOf(address(this));
        IBettazooEscrow(escrow).cancelOffer(offerId);
        uint256 refunded = IERC20(asset()).balanceOf(address(this)) - before;
        lockedLiability -= refunded;
        offerLockedLiability[offerId] -= refunded;
    }

    /// @notice Reports that `resolvedAmount` of `offerId`'s liability has been resolved
    ///         (matched and the event settled, win or lose — either way it's no longer
    ///         at risk locked collateral from this vault's perspective; the win/loss P&L
    ///         itself is already reflected automatically in the vault's real balance via
    ///         BettazooEscrow's direct payout). Hard-capped by what was actually locked
    ///         for this specific offer, so the keeper can never inflate NAV beyond the
    ///         truth — worst case is a late report, which only understates NAV, never a
    ///         theft vector.
    function reportSettlement(uint256 offerId, uint256 resolvedAmount) external nonReentrant {
        require(msg.sender == keeper || msg.sender == owner, "Not authorized");
        require(resolvedAmount <= offerLockedLiability[offerId], "Exceeds locked amount for offer");
        offerLockedLiability[offerId] -= resolvedAmount;
        lockedLiability -= resolvedAmount;
        emit SettlementReported(offerId, resolvedAmount);
    }

    // ─── View ──────────────────────────────────────────────────────────────────

    function balance() external view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }
}
