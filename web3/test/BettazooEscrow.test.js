const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Suite di test per BettazooEscrow.sol
 *
 * Meccanica quote (ODDS_PRECISION = 10000):
 *   odds 2.0  → 20000
 *   odds 2.5  → 25000
 *   odds 3.0  → 30000
 *
 * MockUSDT: 6 decimali → 1 USDT = 1_000_000 unità
 *
 * Formule chiave:
 *   maxBettorStake = placerLiability * ODDS_PRECISION / (odds - ODDS_PRECISION)
 *   liabilityConsumed = bettorStake * (odds - ODDS_PRECISION) / ODDS_PRECISION
 *   platformFee = winnerNetProfit * 5 / 100
 *     (netProfit = placerLiability se vince il bettor, bettorStake se vince il placer)
 *   winnerPayout = totalPot - platformFee
 */
describe("BettazooEscrow", function () {
  const ODDS_PRECISION = 10000n;
  const PLATFORM_FEE_PCT = 5n;

  // Helper: converte USDT interi in unità con 6 decimali
  const USDT = (n) => BigInt(n) * 1_000_000n;

  let usdt, escrow;
  let owner, placer1, placer2, placer3, bettor1, bettor2, treasury, oracle;
  let escrowAddress;

  beforeEach(async function () {
    [owner, placer1, placer2, placer3, bettor1, bettor2, treasury, oracle] =
      await ethers.getSigners();

    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    usdt = await MockUSDT.deploy();

    const BettazooEscrow = await ethers.getContractFactory("BettazooEscrow");
    escrow = await BettazooEscrow.deploy(
      await usdt.getAddress(),
      treasury.address,
      oracle.address
    );
    escrowAddress = await escrow.getAddress();

    // Fondi iniziali per tutti i partecipanti
    for (const signer of [placer1, placer2, placer3, bettor1, bettor2]) {
      await usdt.mint(signer.address, USDT(10000));
      await usdt.connect(signer).approve(escrowAddress, USDT(10000));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // createOffer
  // ══════════════════════════════════════════════════════════════════════════════
  describe("createOffer", function () {
    it("blocca i fondi del placer e aggiorna lo stato", async function () {
      const liability = USDT(100);
      const odds = 25000n; // 2.5x

      const placerBefore = await usdt.balanceOf(placer1.address);
      await escrow.connect(placer1).createOffer("EVENT_1", 0, odds, liability);
      const placerAfter = await usdt.balanceOf(placer1.address);

      expect(placerBefore - placerAfter).to.equal(liability);
      expect(await usdt.balanceOf(escrowAddress)).to.equal(liability);

      const offer = await escrow.offers(0);
      expect(offer.placer).to.equal(placer1.address);
      expect(offer.odds).to.equal(odds);
      expect(offer.liability).to.equal(liability);
      expect(offer.remainingLiability).to.equal(liability);
      expect(offer.active).to.be.true;
      expect(offer.outcome).to.equal(0);
      expect(offer.eventId).to.equal("EVENT_1");
    });

    it("emette OfferCreated con i parametri corretti", async function () {
      await expect(
        escrow.connect(placer1).createOffer("EVENT_1", 0, 25000n, USDT(100))
      )
        .to.emit(escrow, "OfferCreated")
        .withArgs(0, placer1.address, "EVENT_1", 0, 25000n, USDT(100));
    });

    it("incrementa l'offerId ad ogni chiamata", async function () {
      await escrow.connect(placer1).createOffer("EVENT_1", 0, 20000n, USDT(50));
      await escrow.connect(placer2).createOffer("EVENT_1", 0, 30000n, USDT(60));
      const offer0 = await escrow.offers(0);
      const offer1 = await escrow.offers(1);
      expect(offer0.id).to.equal(0);
      expect(offer1.id).to.equal(1);
    });

    it("reverte se odds <= ODDS_PRECISION (quota <= 1.0)", async function () {
      await expect(
        escrow.connect(placer1).createOffer("EVENT_1", 0, 10000n, USDT(100))
      ).to.be.revertedWith("Odds must be > 1");

      await expect(
        escrow.connect(placer1).createOffer("EVENT_1", 0, 5000n, USDT(100))
      ).to.be.revertedWith("Odds must be > 1");
    });

    it("reverte se liability è zero", async function () {
      await expect(
        escrow.connect(placer1).createOffer("EVENT_1", 0, 25000n, 0)
      ).to.be.revertedWith("Liability must be > 0");
    });

    it("reverte se l'evento è già risolto", async function () {
      await escrow.connect(oracle).resolveEvent("EVENT_X", 0);
      await expect(
        escrow.connect(placer1).createOffer("EVENT_X", 0, 20000n, USDT(100))
      ).to.be.revertedWith("Event already resolved");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // cancelOffer
  // ══════════════════════════════════════════════════════════════════════════════
  describe("cancelOffer", function () {
    it("rimborsa la liability intera se non abbinata", async function () {
      await escrow.connect(placer1).createOffer("EVENT_1", 0, 20000n, USDT(100));

      const balBefore = await usdt.balanceOf(placer1.address);
      await escrow.connect(placer1).cancelOffer(0);
      const balAfter = await usdt.balanceOf(placer1.address);

      expect(balAfter - balBefore).to.equal(USDT(100));

      const offer = await escrow.offers(0);
      expect(offer.active).to.be.false;
      expect(offer.remainingLiability).to.equal(0);
    });

    it("rimborsa solo la liability residua se parzialmente abbinata", async function () {
      // odds 2.0 → bettorStake=50 consuma 50 di liability
      await escrow.connect(placer1).createOffer("EVENT_1", 0, 20000n, USDT(100));
      await escrow.connect(bettor1).acceptOffers([0], USDT(50));

      const balBefore = await usdt.balanceOf(placer1.address);
      await escrow.connect(placer1).cancelOffer(0);
      const balAfter = await usdt.balanceOf(placer1.address);

      expect(balAfter - balBefore).to.equal(USDT(50));
    });

    it("reverte se chiamato da non-proprietario", async function () {
      await escrow.connect(placer1).createOffer("EVENT_1", 0, 20000n, USDT(100));
      await expect(
        escrow.connect(placer2).cancelOffer(0)
      ).to.be.revertedWith("Not offer owner");
    });

    it("reverte se l'offerta è già inattiva", async function () {
      await escrow.connect(placer1).createOffer("EVENT_1", 0, 20000n, USDT(100));
      await escrow.connect(placer1).cancelOffer(0);
      await expect(
        escrow.connect(placer1).cancelOffer(0)
      ).to.be.revertedWith("Offer not active");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // acceptOffers – singola offerta
  // ══════════════════════════════════════════════════════════════════════════════
  describe("acceptOffers – singola offerta", function () {
    // odds 2.0 (20000), liability 100 USDT → maxBettorStake = 100 USDT
    beforeEach(async function () {
      await escrow.connect(placer1).createOffer("EVENT_1", 0, 20000n, USDT(100));
    });

    it("abbinamento completo: trasferisce lo stake del bettor e azzera la liability", async function () {
      const bettorStake = USDT(100);

      const bettorBefore = await usdt.balanceOf(bettor1.address);
      const escrowBefore = await usdt.balanceOf(escrowAddress);

      await escrow.connect(bettor1).acceptOffers([0], bettorStake);

      const bettorAfter = await usdt.balanceOf(bettor1.address);
      const escrowAfter = await usdt.balanceOf(escrowAddress);

      expect(bettorBefore - bettorAfter).to.equal(bettorStake);
      // escrow aveva 100 (liability placer), ora ha 100+100=200
      expect(escrowAfter - escrowBefore).to.equal(bettorStake);

      const offer = await escrow.offers(0);
      expect(offer.remainingLiability).to.equal(0);
      expect(offer.active).to.be.false;
    });

    it("abbinamento parziale: aggiorna correttamente la liability residua", async function () {
      // stake 50 → liability consumata = 50 * (20000-10000)/10000 = 50 USDT
      await escrow.connect(bettor1).acceptOffers([0], USDT(50));

      const offer = await escrow.offers(0);
      expect(offer.remainingLiability).to.equal(USDT(50));
      expect(offer.active).to.be.true;
    });

    it("emette OfferMatched con i parametri corretti", async function () {
      await expect(
        escrow.connect(bettor1).acceptOffers([0], USDT(100))
      )
        .to.emit(escrow, "OfferMatched")
        .withArgs(0, 0, bettor1.address, USDT(100), USDT(100));
    });

    it("crea il BetRecord con i dati corretti", async function () {
      await escrow.connect(bettor1).acceptOffers([0], USDT(100));

      const rec = await escrow.betRecords(0);
      expect(rec.bettor).to.equal(bettor1.address);
      expect(rec.placer).to.equal(placer1.address);
      expect(rec.bettorStake).to.equal(USDT(100));
      expect(rec.placerLiability).to.equal(USDT(100));
      expect(rec.odds).to.equal(20000n);
      expect(rec.outcome).to.equal(0);
      expect(rec.settled).to.be.false;
    });

    it("reverte se l'evento è già risolto", async function () {
      await escrow.connect(oracle).resolveEvent("EVENT_1", 0);
      await expect(
        escrow.connect(bettor1).acceptOffers([0], USDT(50))
      ).to.be.revertedWith("Event already resolved");
    });

    it("reverte se l'offerta è inattiva", async function () {
      await escrow.connect(placer1).cancelOffer(0);
      await expect(
        escrow.connect(bettor1).acceptOffers([0], USDT(50))
      ).to.be.revertedWith("Offer not active");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // acceptOffers – multi-matching
  // ══════════════════════════════════════════════════════════════════════════════
  describe("acceptOffers – multi-matching", function () {
    /**
     * Setup tre offerte per EVENT_1, outcome 0:
     *   Offerta 0 (placer1): odds 2.0 (20000), liability 100 USDT → maxStake = 100 USDT
     *   Offerta 1 (placer2): odds 3.0 (30000), liability  60 USDT → maxStake =  30 USDT
     *   Offerta 2 (placer3): odds 2.5 (25000), liability  75 USDT → maxStake =  50 USDT
     *   Totale disponibile: 180 USDT di stake bettor
     */
    beforeEach(async function () {
      await escrow.connect(placer1).createOffer("EVENT_1", 0, 20000n, USDT(100));
      await escrow.connect(placer2).createOffer("EVENT_1", 0, 30000n, USDT(60));
      await escrow.connect(placer3).createOffer("EVENT_1", 0, 25000n, USDT(75));
    });

    it("abbina lo stake del bettor su tutte e tre le offerte", async function () {
      const totalStake = USDT(180);

      const bettorBefore = await usdt.balanceOf(bettor1.address);
      await escrow.connect(bettor1).acceptOffers([0, 1, 2], totalStake);
      const bettorAfter = await usdt.balanceOf(bettor1.address);

      expect(bettorBefore - bettorAfter).to.equal(totalStake);

      // Tutte le offerte devono essere esaurite
      for (const id of [0, 1, 2]) {
        const offer = await escrow.offers(id);
        expect(offer.remainingLiability).to.equal(0n);
        expect(offer.active).to.be.false;
      }
    });

    it("calcola correttamente stake e liability per ciascun match", async function () {
      await escrow.connect(bettor1).acceptOffers([0, 1, 2], USDT(180));

      // Match 0: stake=100, liability=100 (odds 2.0 → 100*(20000-10000)/10000=100)
      const m0 = await escrow.betRecords(0);
      expect(m0.bettorStake).to.equal(USDT(100));
      expect(m0.placerLiability).to.equal(USDT(100));
      expect(m0.odds).to.equal(20000n);

      // Match 1: stake=30, liability=60 (odds 3.0 → 30*(30000-10000)/10000=60)
      const m1 = await escrow.betRecords(1);
      expect(m1.bettorStake).to.equal(USDT(30));
      expect(m1.placerLiability).to.equal(USDT(60));
      expect(m1.odds).to.equal(30000n);

      // Match 2: stake=50, liability=75 (odds 2.5 → 50*(25000-10000)/10000=75)
      const m2 = await escrow.betRecords(2);
      expect(m2.bettorStake).to.equal(USDT(50));
      expect(m2.placerLiability).to.equal(USDT(75));
      expect(m2.odds).to.equal(25000n);
    });

    it("si ferma quando lo stake è esaurito (fill parziale sul terzo batch)", async function () {
      // stake 130 → copre offer0 (100) + offer1 (30), offer2 non toccata
      await escrow.connect(bettor1).acceptOffers([0, 1, 2], USDT(130));

      const offer0 = await escrow.offers(0);
      const offer1 = await escrow.offers(1);
      const offer2 = await escrow.offers(2);

      expect(offer0.remainingLiability).to.equal(0n);
      expect(offer0.active).to.be.false;
      expect(offer1.remainingLiability).to.equal(0n);
      expect(offer1.active).to.be.false;
      expect(offer2.remainingLiability).to.equal(USDT(75)); // intatta
      expect(offer2.active).to.be.true;
    });

    it("abbinamento parziale sull'ultima offerta", async function () {
      // stake 120 → offer0 piena (100) + offer1 parziale (20 su 30)
      // offer1 liability consumata = 20 * (30000-10000)/10000 = 40 USDT
      await escrow.connect(bettor1).acceptOffers([0, 1, 2], USDT(120));

      const offer0 = await escrow.offers(0);
      const offer1 = await escrow.offers(1);
      const offer2 = await escrow.offers(2);

      expect(offer0.remainingLiability).to.equal(0n);
      expect(offer1.remainingLiability).to.equal(USDT(20)); // 60-40=20
      expect(offer1.active).to.be.true;
      expect(offer2.remainingLiability).to.equal(USDT(75)); // intatta
    });

    it("trasferisce solo l'actualStake (non il totalBettorStake se non tutto abbinato)", async function () {
      // Offerte disponibili per 180 USDT ma il bettor chiede 200 → paga solo 180
      const bettorBefore = await usdt.balanceOf(bettor1.address);
      await escrow.connect(bettor1).acceptOffers([0, 1, 2], USDT(200));
      const bettorAfter = await usdt.balanceOf(bettor1.address);

      expect(bettorBefore - bettorAfter).to.equal(USDT(180));
    });

    it("registra i matchId nel mapping dell'evento", async function () {
      await escrow.connect(bettor1).acceptOffers([0, 1, 2], USDT(180));
      const ids = await escrow.getEventMatchIds("EVENT_1");
      expect(ids.length).to.equal(3);
      expect(ids[0]).to.equal(0n);
      expect(ids[1]).to.equal(1n);
      expect(ids[2]).to.equal(2n);
    });

    it("reverte se le offerte hanno eventId diversi", async function () {
      await escrow.connect(placer1).createOffer("EVENT_2", 0, 20000n, USDT(50));
      // offer 3 è su EVENT_2, offer 0 è su EVENT_1
      await expect(
        escrow.connect(bettor1).acceptOffers([0, 3], USDT(50))
      ).to.be.revertedWith("Offers must be for same event");
    });

    it("reverte se le offerte hanno outcome diversi", async function () {
      // offer 0 è outcome 0; creo offer 3 su stesso event ma outcome 1
      await escrow.connect(placer1).createOffer("EVENT_1", 1, 20000n, USDT(50));
      await expect(
        escrow.connect(bettor1).acceptOffers([0, 3], USDT(50))
      ).to.be.revertedWith("Offers must be for same outcome");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // resolveEvent – bettor vince (outcome coincide)
  // ══════════════════════════════════════════════════════════════════════════════
  describe("resolveEvent – bettor vince", function () {
    /**
     * odds 2.0, liability 100, bettorStake 100
     * totalPot = 200 USDT | netProfit = placerLiability = 100 | fee = 5 USDT | bettor riceve 195 USDT
     */
    beforeEach(async function () {
      await escrow.connect(placer1).createOffer("EVENT_1", 0, 20000n, USDT(100));
      await escrow.connect(bettor1).acceptOffers([0], USDT(100));
    });

    it("paga il bettor e il treasury con importi corretti", async function () {
      const bettorBefore = await usdt.balanceOf(bettor1.address);
      const treasuryBefore = await usdt.balanceOf(treasury.address);

      await escrow.connect(oracle).resolveEvent("EVENT_1", 0); // outcome 0 → bettor vince

      const bettorAfter = await usdt.balanceOf(bettor1.address);
      const treasuryAfter = await usdt.balanceOf(treasury.address);

      // netProfit=placerLiability=100, fee=5, payout=195
      expect(bettorAfter - bettorBefore).to.equal(USDT(195));
      expect(treasuryAfter - treasuryBefore).to.equal(USDT(5));
    });

    it("non paga il placer quando perde", async function () {
      const placerBefore = await usdt.balanceOf(placer1.address);
      await escrow.connect(oracle).resolveEvent("EVENT_1", 0);
      const placerAfter = await usdt.balanceOf(placer1.address);
      expect(placerAfter).to.equal(placerBefore);
    });

    it("marca il BetRecord come settled", async function () {
      await escrow.connect(oracle).resolveEvent("EVENT_1", 0);
      const rec = await escrow.betRecords(0);
      expect(rec.settled).to.be.true;
    });

    it("emette EventResolved", async function () {
      await expect(escrow.connect(oracle).resolveEvent("EVENT_1", 0))
        .to.emit(escrow, "EventResolved")
        .withArgs("EVENT_1", 0);
    });

    it("emette WinningsPaid per il bettor", async function () {
      await expect(escrow.connect(oracle).resolveEvent("EVENT_1", 0))
        .to.emit(escrow, "WinningsPaid")
        .withArgs(bettor1.address, USDT(195));
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // resolveEvent – placer vince (outcome diverso)
  // ══════════════════════════════════════════════════════════════════════════════
  describe("resolveEvent – placer vince", function () {
    /**
     * odds 3.0, liability 60, bettorStake 30
     * totalPot = 90 USDT | netProfit = bettorStake = 30 | fee = 1.5 USDT | placer riceve 88.5 USDT
     */
    beforeEach(async function () {
      await escrow.connect(placer1).createOffer("EVENT_1", 0, 30000n, USDT(60));
      await escrow.connect(bettor1).acceptOffers([0], USDT(30));
    });

    it("paga il placer e il treasury con importi corretti", async function () {
      const placerBefore = await usdt.balanceOf(placer1.address);
      const treasuryBefore = await usdt.balanceOf(treasury.address);

      await escrow.connect(oracle).resolveEvent("EVENT_1", 1); // outcome 1 → placer vince

      const placerAfter = await usdt.balanceOf(placer1.address);
      const treasuryAfter = await usdt.balanceOf(treasury.address);

      // netProfit=bettorStake=30, fee=1.5 (1_500_000), payout=88.5 (88_500_000)
      const netProfit = USDT(30);
      const fee = netProfit * PLATFORM_FEE_PCT / 100n;
      const payout = USDT(90) - fee;

      expect(placerAfter - placerBefore).to.equal(payout);
      expect(treasuryAfter - treasuryBefore).to.equal(fee);
    });

    it("non paga il bettor quando perde", async function () {
      const bettorBefore = await usdt.balanceOf(bettor1.address);
      await escrow.connect(oracle).resolveEvent("EVENT_1", 1);
      const bettorAfter = await usdt.balanceOf(bettor1.address);
      expect(bettorAfter).to.equal(bettorBefore);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // resolveEvent – multi-matching completo
  // ══════════════════════════════════════════════════════════════════════════════
  describe("resolveEvent – multi-matching completo", function () {
    /**
     * Tre placer, un bettor copre 180 USDT su tre offerte:
     *   Match 0: stake=100, liability=100 → pot=200, netProfit=100, fee=5,    payout=195
     *   Match 1: stake= 30, liability= 60 → pot= 90, netProfit= 60, fee=3,    payout= 87
     *   Match 2: stake= 50, liability= 75 → pot=125, netProfit= 75, fee=3.75, payout=121.25
     *
     * Totale fee (bettor wins): 11.75 USDT
     */
    beforeEach(async function () {
      await escrow.connect(placer1).createOffer("EVENT_1", 0, 20000n, USDT(100));
      await escrow.connect(placer2).createOffer("EVENT_1", 0, 30000n, USDT(60));
      await escrow.connect(placer3).createOffer("EVENT_1", 0, 25000n, USDT(75));
      await escrow.connect(bettor1).acceptOffers([0, 1, 2], USDT(180));
    });

    it("bettor vince: riceve la somma di tutti i payout netti", async function () {
      const bettorBefore = await usdt.balanceOf(bettor1.address);
      const treasuryBefore = await usdt.balanceOf(treasury.address);

      await escrow.connect(oracle).resolveEvent("EVENT_1", 0);

      const bettorAfter = await usdt.balanceOf(bettor1.address);
      const treasuryAfter = await usdt.balanceOf(treasury.address);

      // fee = placerLiability * 5% per ogni match (bettor vince, netProfit = placerLiability)
      const fee0 = USDT(100) * PLATFORM_FEE_PCT / 100n; // 5 USDT
      const fee1 = USDT(60)  * PLATFORM_FEE_PCT / 100n; // 3 USDT
      const fee2 = USDT(75)  * PLATFORM_FEE_PCT / 100n; // 3.75 USDT = 3_750_000n

      const totalBettorGain = (USDT(200) - fee0) + (USDT(90) - fee1) + (USDT(125) - fee2);
      const totalFee = fee0 + fee1 + fee2;

      expect(bettorAfter - bettorBefore).to.equal(totalBettorGain);
      expect(treasuryAfter - treasuryBefore).to.equal(totalFee);
    });

    it("placer vincono: ciascuno riceve il proprio payout netto", async function () {
      const p1Before = await usdt.balanceOf(placer1.address);
      const p2Before = await usdt.balanceOf(placer2.address);
      const p3Before = await usdt.balanceOf(placer3.address);
      const treasuryBefore = await usdt.balanceOf(treasury.address);

      await escrow.connect(oracle).resolveEvent("EVENT_1", 1); // outcome 1 → placers vincono

      const p1After = await usdt.balanceOf(placer1.address);
      const p2After = await usdt.balanceOf(placer2.address);
      const p3After = await usdt.balanceOf(placer3.address);
      const treasuryAfter = await usdt.balanceOf(treasury.address);

      // fee = bettorStake * 5% per ogni match (placer vince, netProfit = bettorStake)
      const fee0p = USDT(100) * PLATFORM_FEE_PCT / 100n; // bettorStake0=100 → fee=5
      const fee1p = USDT(30)  * PLATFORM_FEE_PCT / 100n; // bettorStake1= 30 → fee=1.5
      const fee2p = USDT(50)  * PLATFORM_FEE_PCT / 100n; // bettorStake2= 50 → fee=2.5

      expect(p1After - p1Before).to.equal(USDT(200) - fee0p); // 195
      expect(p2After - p2Before).to.equal(USDT(90)  - fee1p); // 88.5
      expect(p3After - p3Before).to.equal(USDT(125) - fee2p); // 122.5

      const totalFee = fee0p + fee1p + fee2p; // 9 USDT
      expect(treasuryAfter - treasuryBefore).to.equal(totalFee);
    });

    it("il contratto si svuota completamente dopo la risoluzione", async function () {
      await escrow.connect(oracle).resolveEvent("EVENT_1", 0);
      // Totale bloccato: 100+60+75 (placer) + 180 (bettor) = 415 USDT
      // Tutto distribuito tra bettor e treasury
      const finalBalance = await usdt.balanceOf(escrowAddress);
      expect(finalBalance).to.equal(0n);
    });

    it("due bettors su stesso evento: ogni match risolto separatamente", async function () {
      // bettor2 piazza un'ulteriore offerta sullo stesso evento (nuove offerte)
      await escrow.connect(placer1).createOffer("EVENT_1", 0, 20000n, USDT(200));
      await escrow.connect(bettor2).acceptOffers([3], USDT(200)); // offerId=3

      const b1Before = await usdt.balanceOf(bettor1.address);
      const b2Before = await usdt.balanceOf(bettor2.address);

      await escrow.connect(oracle).resolveEvent("EVENT_1", 0); // tutti i bettors vincono

      const b1After = await usdt.balanceOf(bettor1.address);
      const b2After = await usdt.balanceOf(bettor2.address);

      // bettor1: fee = placerLiability * 5% per match
      const f0 = USDT(100) * PLATFORM_FEE_PCT / 100n;
      const f1 = USDT(60)  * PLATFORM_FEE_PCT / 100n;
      const f2 = USDT(75)  * PLATFORM_FEE_PCT / 100n;
      const expectedB1 = (USDT(200) - f0) + (USDT(90) - f1) + (USDT(125) - f2);
      expect(b1After - b1Before).to.equal(expectedB1);

      // bettor2: stake=200, liability=200 → netProfit=200, fee=10, payout=390
      expect(b2After - b2Before).to.equal(USDT(390));
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Precisione platform fee 5% sul net profit
  // ══════════════════════════════════════════════════════════════════════════════
  describe("precisione platform fee 5%", function () {
    it("fee esatta su netProfit divisibile per 100", async function () {
      // odds 2.0, liability 200, stake 200 → pot 400, bettor vince
      // netProfit = placerLiability = 200, fee = 10, payout = 390
      await escrow.connect(placer1).createOffer("EVENT_1", 0, 20000n, USDT(200));
      await escrow.connect(bettor1).acceptOffers([0], USDT(200));

      const treasuryBefore = await usdt.balanceOf(treasury.address);
      const bettorBefore = await usdt.balanceOf(bettor1.address);

      await escrow.connect(oracle).resolveEvent("EVENT_1", 0);

      expect(await usdt.balanceOf(treasury.address) - treasuryBefore).to.equal(USDT(10));
      expect(await usdt.balanceOf(bettor1.address) - bettorBefore).to.equal(USDT(390));
    });

    it("fee con decimali USDT (netProfit 60 USDT → fee 3 USDT)", async function () {
      // odds 3.0, liability 60, stake 30 → pot 90, bettor vince
      // netProfit = placerLiability = 60, fee = 3_000_000 = 3 USDT
      await escrow.connect(placer1).createOffer("EVENT_1", 0, 30000n, USDT(60));
      await escrow.connect(bettor1).acceptOffers([0], USDT(30));

      const treasuryBefore = await usdt.balanceOf(treasury.address);

      await escrow.connect(oracle).resolveEvent("EVENT_1", 0); // bettor vince

      // fee = 60_000_000 * 5 / 100 = 3_000_000 = 3 USDT
      expect(await usdt.balanceOf(treasury.address) - treasuryBefore).to.equal(3_000_000n);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Matematica multi-matching: verifica formule
  // ══════════════════════════════════════════════════════════════════════════════
  describe("matematica multi-matching", function () {
    it("maxBettorStake = liability * PRECISION / (odds - PRECISION)", async function () {
      // odds 2.5 → maxStake = liability / 1.5
      // liability=75 → maxStake=50
      await escrow.connect(placer1).createOffer("EVENT_1", 0, 25000n, USDT(75));
      // Il bettor prova a usare 50 + 1 → solo 50 vengono abbinati
      const bettorBefore = await usdt.balanceOf(bettor1.address);
      await escrow.connect(bettor1).acceptOffers([0], USDT(51));
      const bettorAfter = await usdt.balanceOf(bettor1.address);

      // Deve pagare solo 50 USDT (l'offerta è esaurita a 50)
      expect(bettorBefore - bettorAfter).to.equal(USDT(50));
      const offer = await escrow.offers(0);
      expect(offer.remainingLiability).to.equal(0n);
    });

    it("liabilityConsumed = stake * (odds - PRECISION) / PRECISION", async function () {
      // odds 3.0, stake 25 → liability = 25 * 2.0 = 50 USDT
      await escrow.connect(placer1).createOffer("EVENT_1", 0, 30000n, USDT(100));
      await escrow.connect(bettor1).acceptOffers([0], USDT(25));

      const rec = await escrow.betRecords(0);
      expect(rec.bettorStake).to.equal(USDT(25));
      expect(rec.placerLiability).to.equal(USDT(50)); // 25*(30000-10000)/10000=50
    });

    it("la liability residua si riduce correttamente dopo match parziali successivi", async function () {
      // offer: odds 2.0, liability 100 USDT
      await escrow.connect(placer1).createOffer("EVENT_1", 0, 20000n, USDT(100));

      // Primo bettor: stake 40 → liability consumata 40
      await escrow.connect(bettor1).acceptOffers([0], USDT(40));
      let offer = await escrow.offers(0);
      expect(offer.remainingLiability).to.equal(USDT(60));

      // Secondo bettor: stake 60 → liability consumata 60 → offer esaurita
      await escrow.connect(bettor2).acceptOffers([0], USDT(60));
      offer = await escrow.offers(0);
      expect(offer.remainingLiability).to.equal(0n);
      expect(offer.active).to.be.false;
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Controllo accessi
  // ══════════════════════════════════════════════════════════════════════════════
  describe("controllo accessi", function () {
    it("reverte resolveEvent se chiamato da non-oracle e non-owner", async function () {
      await expect(
        escrow.connect(bettor1).resolveEvent("EVENT_1", 0)
      ).to.be.revertedWith("Not oracle");
    });

    it("permette all'owner di chiamare resolveEvent", async function () {
      await expect(
        escrow.connect(owner).resolveEvent("EVENT_1", 0)
      ).to.emit(escrow, "EventResolved");
    });

    it("reverte resolveEvent se l'evento è già risolto", async function () {
      await escrow.connect(oracle).resolveEvent("EVENT_1", 0);
      await expect(
        escrow.connect(oracle).resolveEvent("EVENT_1", 1)
      ).to.be.revertedWith("Already resolved");
    });

    it("setOracle funziona solo per l'owner", async function () {
      await escrow.connect(owner).setOracle(bettor1.address);
      expect(await escrow.oracle()).to.equal(bettor1.address);

      await expect(
        escrow.connect(bettor2).setOracle(bettor2.address)
      ).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
    });

    it("setTreasury funziona solo per l'owner", async function () {
      await escrow.connect(owner).setTreasury(bettor1.address);
      expect(await escrow.treasury()).to.equal(bettor1.address);
    });

    it("platformFeePercentage di default è 5", async function () {
      expect(await escrow.platformFeePercentage()).to.equal(5);
    });

    it("setPlatformFee funziona solo per l'owner", async function () {
      await escrow.connect(owner).setPlatformFee(10);
      expect(await escrow.platformFeePercentage()).to.equal(10);

      await expect(
        escrow.connect(bettor1).setPlatformFee(0)
      ).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
    });

    it("setPlatformFee reverte se fee > 100%", async function () {
      await expect(
        escrow.connect(owner).setPlatformFee(101)
      ).to.be.revertedWith("Fee exceeds 100%");
    });

    it("acceptOffers reverte se nessun array di offerte", async function () {
      await expect(
        escrow.connect(bettor1).acceptOffers([], USDT(100))
      ).to.be.revertedWith("No offers");
    });

    it("acceptOffers reverte se stake zero", async function () {
      await escrow.connect(placer1).createOffer("EVENT_1", 0, 20000n, USDT(100));
      await expect(
        escrow.connect(bettor1).acceptOffers([0], 0)
      ).to.be.revertedWith("Stake must be > 0");
    });
  });
});
