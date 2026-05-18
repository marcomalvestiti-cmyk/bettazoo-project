// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BettazooEscrow
 * @notice Escrow P2P per scommesse in stablecoin con multi-matching e platform fee del 5%.
 *
 * Meccanica delle quote (odds):
 *   odds in formato europeo decimale * ODDS_PRECISION (10000).
 *   Es: 2.5x → odds = 25000
 *
 * Flusso:
 *   1. Placer chiama createOffer() bloccando la propria "liability" (collaterale max pagato se perde).
 *      max_stake_bettor = liability * ODDS_PRECISION / (odds - ODDS_PRECISION)
 *   2. Bettor chiama acceptOffers([id, id, ...], totalStake) e il contratto:
 *      - distribuisce lo stake sulle offerte nell'ordine fornito
 *      - calcola la liability consumata per ogni offerta
 *      - trasferisce l'actualStake (potenzialmente < totalStake se offerte esaurite)
 *   3. Oracle/Admin chiama resolveEvent(eventId, winningOutcome):
 *      - itera tutti i BetRecord dell'evento
 *      - calcola fee = winnerNetProfit * platformFeePercentage / 100
 *        (winnerNetProfit = placerLiability se vince il bettor, bettorStake se vince il placer)
 *      - paga il vincitore (totalPot - fee) e il treasury (fee)
 */
contract BettazooEscrow is Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant ODDS_PRECISION = 10000;

    // Percentage of the winner's net profit sent to treasury.
    // Applied only to profit (not to the returned stake), settable by owner.
    uint256 public platformFeePercentage = 5;

    IERC20 public immutable stablecoin;
    address public treasury;
    address public oracle;

    uint256 private _nextOfferId;
    uint256 private _nextMatchId;

    struct Offer {
        uint256 id;
        address placer;
        string eventId;
        uint8 outcome;
        uint256 odds;             // formato europeo * ODDS_PRECISION
        uint256 liability;        // collaterale totale bloccato dal placer
        uint256 remainingLiability; // collaterale non ancora abbinato
        bool active;
    }

    struct BetRecord {
        uint256 id;
        uint256 offerId;
        string eventId;
        address bettor;
        address placer;
        uint256 bettorStake;
        uint256 placerLiability;
        uint8 outcome;
        uint256 odds;
        bool settled;
    }

    mapping(uint256 => Offer) public offers;
    mapping(uint256 => BetRecord) public betRecords;
    mapping(string => bool) public eventResolved;
    mapping(string => uint8) public eventResult;
    mapping(string => uint256[]) private _eventMatchIds;

    event OfferCreated(
        uint256 indexed offerId,
        address indexed placer,
        string eventId,
        uint8 outcome,
        uint256 odds,
        uint256 liability
    );
    event OfferMatched(
        uint256 indexed matchId,
        uint256 indexed offerId,
        address indexed bettor,
        uint256 bettorStake,
        uint256 placerLiability
    );
    event EventResolved(string eventId, uint8 winningOutcome);
    event WinningsPaid(address indexed winner, uint256 amount);

    modifier onlyOracle() {
        require(msg.sender == oracle || msg.sender == owner(), "Not oracle");
        _;
    }

    constructor(
        address _stablecoin,
        address _treasury,
        address _oracle
    ) Ownable(msg.sender) {
        stablecoin = IERC20(_stablecoin);
        treasury = _treasury;
        oracle = _oracle;
    }

    // ─── Placer ────────────────────────────────────────────────────────────────

    /**
     * @notice Crea un'offerta bloccando la liability del placer.
     * @param eventId   Identificativo dell'evento (stringa arbitraria)
     * @param outcome   Esito su cui il bettor scommette (0=casa, 1=pareggio, 2=ospite, ecc.)
     * @param odds      Quote europee * ODDS_PRECISION (min 10001 → 1.0001x)
     * @param liability Collaterale massimo che il placer paga se il bettor vince
     */
    function createOffer(
        string calldata eventId,
        uint8 outcome,
        uint256 odds,
        uint256 liability
    ) external returns (uint256 offerId) {
        require(odds > ODDS_PRECISION, "Odds must be > 1");
        require(liability > 0, "Liability must be > 0");
        require(!eventResolved[eventId], "Event already resolved");

        stablecoin.safeTransferFrom(msg.sender, address(this), liability);

        offerId = _nextOfferId++;
        offers[offerId] = Offer({
            id: offerId,
            placer: msg.sender,
            eventId: eventId,
            outcome: outcome,
            odds: odds,
            liability: liability,
            remainingLiability: liability,
            active: true
        });

        emit OfferCreated(offerId, msg.sender, eventId, outcome, odds, liability);
    }

    /**
     * @notice Annulla un'offerta non ancora abbinata e rimborsa la liability residua.
     */
    function cancelOffer(uint256 offerId) external {
        Offer storage offer = offers[offerId];
        require(offer.placer == msg.sender, "Not offer owner");
        require(offer.active, "Offer not active");

        uint256 refund = offer.remainingLiability;
        offer.remainingLiability = 0;
        offer.active = false;

        if (refund > 0) {
            stablecoin.safeTransfer(msg.sender, refund);
        }
    }

    // ─── Bettor ────────────────────────────────────────────────────────────────

    /**
     * @notice Accetta una lista di offerte (multi-matching) per coprire lo stake del bettor.
     * @dev    Tutte le offerte devono essere per lo stesso eventId e lo stesso outcome.
     *         Il contratto trasferisce solo l'actualStake realmente abbinato.
     * @param offerIds        Array di offer ID ordinati per priorità (migliore quota per prima)
     * @param totalBettorStake Stake totale che il bettor vuole piazzare
     * @return matchIds       ID dei BetRecord creati (dimensione = numero di match effettuati)
     */
    function acceptOffers(
        uint256[] calldata offerIds,
        uint256 totalBettorStake
    ) external returns (uint256[] memory matchIds) {
        require(offerIds.length > 0, "No offers");
        require(totalBettorStake > 0, "Stake must be > 0");

        string memory eventId = offers[offerIds[0]].eventId;
        uint8 outcome = offers[offerIds[0]].outcome;
        require(!eventResolved[eventId], "Event already resolved");

        // Buffer temporaneo; verrà ridimensionato a matchCount alla fine
        uint256[] memory tempIds = new uint256[](offerIds.length);
        uint256 remainingStake = totalBettorStake;
        uint256 matchCount = 0;

        for (uint256 i = 0; i < offerIds.length; i++) {
            Offer storage offer = offers[offerIds[i]];
            require(offer.active, "Offer not active");
            require(
                keccak256(bytes(offer.eventId)) == keccak256(bytes(eventId)),
                "Offers must be for same event"
            );
            require(offer.outcome == outcome, "Offers must be for same outcome");

            // Skip matching se lo stake è esaurito, ma continua la validazione
            if (remainingStake == 0) continue;

            // Stake massimo che questa offerta può assorbire con la liability residua
            uint256 maxStakeForOffer = offer.remainingLiability * ODDS_PRECISION /
                (offer.odds - ODDS_PRECISION);
            if (maxStakeForOffer == 0) continue;

            uint256 stakeForOffer = remainingStake < maxStakeForOffer
                ? remainingStake
                : maxStakeForOffer;

            uint256 liabilityForOffer = stakeForOffer * (offer.odds - ODDS_PRECISION) /
                ODDS_PRECISION;
            if (liabilityForOffer == 0) continue;

            offer.remainingLiability -= liabilityForOffer;
            if (offer.remainingLiability == 0) {
                offer.active = false;
            }

            uint256 matchId = _nextMatchId++;
            betRecords[matchId] = BetRecord({
                id: matchId,
                offerId: offerIds[i],
                eventId: eventId,
                bettor: msg.sender,
                placer: offer.placer,
                bettorStake: stakeForOffer,
                placerLiability: liabilityForOffer,
                outcome: outcome,
                odds: offer.odds,
                settled: false
            });
            _eventMatchIds[eventId].push(matchId);
            tempIds[matchCount] = matchId;
            matchCount++;

            remainingStake -= stakeForOffer;

            emit OfferMatched(matchId, offerIds[i], msg.sender, stakeForOffer, liabilityForOffer);
        }

        require(matchCount > 0, "No stake matched");

        // Trasferisce solo l'importo realmente abbinato
        uint256 actualStake = totalBettorStake - remainingStake;
        stablecoin.safeTransferFrom(msg.sender, address(this), actualStake);

        // Copia nel risultato finale ridimensionato
        matchIds = new uint256[](matchCount);
        for (uint256 i = 0; i < matchCount; i++) {
            matchIds[i] = tempIds[i];
        }
    }

    // ─── Oracle ────────────────────────────────────────────────────────────────

    /**
     * @notice Risolve un evento e distribuisce i fondi.
     *         Fee = winnerNetProfit * platformFeePercentage / 100, inviata al treasury.
     *         Il vincitore riceve la propria puntata iniziale + profitto netto al netto della fee.
     * @param eventId        Identificativo dell'evento
     * @param winningOutcome L'esito vincente
     */
    function resolveEvent(
        string calldata eventId,
        uint8 winningOutcome
    ) external onlyOracle {
        require(!eventResolved[eventId], "Already resolved");

        eventResolved[eventId] = true;
        eventResult[eventId] = winningOutcome;

        uint256[] memory matchIds = _eventMatchIds[eventId];

        for (uint256 i = 0; i < matchIds.length; i++) {
            BetRecord storage record = betRecords[matchIds[i]];
            if (record.settled) continue;
            record.settled = true;

            uint256 totalPot = record.bettorStake + record.placerLiability;

            // Net profit of the winner (what they earned above their own stake).
            // Fee applies only to this profit, not to the returned stake.
            address winner;
            uint256 winnerNetProfit;
            if (winningOutcome == record.outcome) {
                winner = record.bettor;
                winnerNetProfit = record.placerLiability;
            } else {
                winner = record.placer;
                winnerNetProfit = record.bettorStake;
            }

            uint256 fee = winnerNetProfit * platformFeePercentage / 100;
            uint256 winnerPayout = totalPot - fee;

            stablecoin.safeTransfer(winner, winnerPayout);
            if (fee > 0) stablecoin.safeTransfer(treasury, fee);

            emit WinningsPaid(winner, winnerPayout);
        }

        emit EventResolved(eventId, winningOutcome);
    }

    // ─── Admin ─────────────────────────────────────────────────────────────────

    function setOracle(address _oracle) external onlyOwner {
        oracle = _oracle;
    }

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }

    function setPlatformFee(uint256 _fee) external onlyOwner {
        require(_fee <= 100, "Fee exceeds 100%");
        platformFeePercentage = _fee;
    }

    // ─── View ──────────────────────────────────────────────────────────────────

    function getEventMatchIds(string calldata eventId)
        external
        view
        returns (uint256[] memory)
    {
        return _eventMatchIds[eventId];
    }
}
