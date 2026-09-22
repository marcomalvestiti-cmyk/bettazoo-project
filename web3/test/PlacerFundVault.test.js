const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Suite di test per PlacerFundVault.sol + PlacerFundVaultFactory.sol
 *
 * Garanzie da verificare, oltre alle basi ERC-4626:
 * - withdraw/redeem non sono MAI gated da approvedLPs o paused (un LP puo' sempre uscire).
 * - solo i NUOVI depositi sono gated da approvedLPs/paused.
 * - il collaterale bloccato in offerte Escrow aperte non e' prelevabile (maxRedeem/maxWithdraw
 *   capped dalla liquidita' reale), ma resta contato in totalAssets() cosi' che il prezzo-quota
 *   non crolli artificialmente quando il keeper apre un'offerta.
 * - reportSettlement non puo' mai far dichiarare al keeper piu' di quanto sia stato davvero
 *   bloccato per quella specifica offerta (cap hard, niente inflazione del NAV).
 * - la performance fee (high-water mark) si crystallizza solo sul profitto reale, mai sul
 *   primo deposito, ed e' divisa placer/piattaforma secondo factory.platformFeeShareOfPerformance.
 */
describe("PlacerFundVault + PlacerFundVaultFactory", function () {
  const USDT = (n) => BigInt(n) * 1_000_000n;

  let usdt, escrow, implementation, factory;
  let deployer, treasury, oracle, keeper, ownerA, ownerB, attacker, lp1, lp2, platformFeeRecipient, bettor;
  let escrowAddress, usdtAddress, implAddress, factoryAddress;

  beforeEach(async function () {
    [
      deployer, treasury, oracle, keeper, ownerA, ownerB, attacker,
      lp1, lp2, platformFeeRecipient, bettor,
    ] = await ethers.getSigners();

    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    usdt = await MockUSDT.deploy();
    usdtAddress = await usdt.getAddress();

    const Escrow = await ethers.getContractFactory("BettazooEscrow");
    escrow = await Escrow.deploy(usdtAddress, treasury.address, oracle.address);
    escrowAddress = await escrow.getAddress();

    const PlacerFundVault = await ethers.getContractFactory("PlacerFundVault");
    implementation = await PlacerFundVault.deploy(escrowAddress);
    implAddress = await implementation.getAddress();

    const Factory = await ethers.getContractFactory("PlacerFundVaultFactory");
    factory = await Factory.deploy(
      implAddress, escrowAddress, usdtAddress, keeper.address, platformFeeRecipient.address
    );
    factoryAddress = await factory.getAddress();

    for (const signer of [ownerA, ownerB, lp1, lp2]) {
      await usdt.mint(signer.address, USDT(10000));
    }
  });

  async function createFundVaultFor(signer) {
    const tx = await factory.connect(signer).createFundVault();
    await tx.wait();
    const vaultAddr = await factory.fundVaultOf(signer.address);
    return await ethers.getContractAt("PlacerFundVault", vaultAddr);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // Factory
  // ══════════════════════════════════════════════════════════════════════════════
  describe("PlacerFundVaultFactory", function () {
    it("crea un fund vault isolato per utente, inizializzato correttamente", async function () {
      const vault = await createFundVaultFor(ownerA);
      expect(await vault.owner()).to.equal(ownerA.address);
      expect(await vault.keeper()).to.equal(keeper.address);
      expect(await vault.escrow()).to.equal(escrowAddress);
      expect(await vault.asset()).to.equal(usdtAddress);
      expect(await vault.factory()).to.equal(factoryAddress);
      expect(await vault.approvedLPs(ownerA.address)).to.equal(true);
    });

    it("emette FundVaultCreated e registra fundVaultOf/allFundVaults", async function () {
      await expect(factory.connect(ownerA).createFundVault())
        .to.emit(factory, "FundVaultCreated");
      expect(await factory.allFundVaultsCount()).to.equal(1n);
    });

    it("rifiuta un secondo fund vault per lo stesso owner (one-per-user in v1)", async function () {
      await factory.connect(ownerA).createFundVault();
      await expect(factory.connect(ownerA).createFundVault())
        .to.be.revertedWith("Fund vault already exists");
    });

    it("valori di default: platformFeeShareOfPerformance=20, maxPerformanceFeePercent=30", async function () {
      expect(await factory.platformFeeShareOfPerformance()).to.equal(20n);
      expect(await factory.maxPerformanceFeePercent()).to.equal(30n);
    });

    it("solo l'owner della factory puo' aggiornare l'economia della performance fee", async function () {
      await expect(factory.connect(attacker).setPlatformFeeShareOfPerformance(50)).to.be.reverted;
      await expect(factory.connect(deployer).setPlatformFeeShareOfPerformance(50))
        .to.emit(factory, "PlatformFeeShareUpdated");
      expect(await factory.platformFeeShareOfPerformance()).to.equal(50n);
    });
  });

  describe("Implementation contract safety", function () {
    it("l'implementation non puo' essere inizializzata direttamente", async function () {
      await expect(
        implementation.initialize(ownerA.address, keeper.address, factoryAddress, usdtAddress)
      ).to.be.reverted;
    });
  });

  describe("Clone initialize() guard", function () {
    it("un clone gia' inizializzato dalla factory non puo' essere reinizializzato da nessuno", async function () {
      const vault = await createFundVaultFor(ownerA);
      await expect(
        vault.connect(attacker).initialize(attacker.address, attacker.address, factoryAddress, usdtAddress)
      ).to.be.reverted;
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // approvedLPs gate — solo sui depositi, mai sui prelievi
  // ══════════════════════════════════════════════════════════════════════════════
  describe("approvedLPs gate", function () {
    let vault, vaultAddress;

    beforeEach(async function () {
      vault = await createFundVaultFor(ownerA);
      vaultAddress = await vault.getAddress();
    });

    it("l'owner puo' depositare subito nel proprio fondo (auto-approvato all'init)", async function () {
      await usdt.connect(ownerA).approve(vaultAddress, USDT(1000));
      await expect(vault.connect(ownerA).deposit(USDT(1000), ownerA.address))
        .to.not.be.reverted;
    });

    it("un LP non approvato non puo' depositare", async function () {
      await usdt.connect(lp1).approve(vaultAddress, USDT(1000));
      await expect(vault.connect(lp1).deposit(USDT(500), lp1.address))
        .to.be.revertedWithCustomError(vault, "ERC4626ExceededMaxDeposit");
      await expect(vault.connect(lp1).mint(USDT(500), lp1.address))
        .to.be.revertedWithCustomError(vault, "ERC4626ExceededMaxMint");
    });

    it("solo l'owner puo' approvare/revocare un LP", async function () {
      await expect(vault.connect(attacker).setApprovedLP(lp1.address, true))
        .to.be.revertedWith("Not owner");
      await expect(vault.connect(ownerA).setApprovedLP(lp1.address, true))
        .to.emit(vault, "ApprovedLPUpdated").withArgs(lp1.address, true);
    });

    it("un LP approvato puo' depositare", async function () {
      await vault.connect(ownerA).setApprovedLP(lp1.address, true);
      await usdt.connect(lp1).approve(vaultAddress, USDT(1000));
      await expect(vault.connect(lp1).deposit(USDT(500), lp1.address))
        .to.not.be.reverted;
      expect(await vault.balanceOf(lp1.address)).to.be.gt(0n);
    });

    it("revocare un LP blocca SOLO i nuovi depositi, mai il prelievo delle quote gia' possedute", async function () {
      await vault.connect(ownerA).setApprovedLP(lp1.address, true);
      await usdt.connect(lp1).approve(vaultAddress, USDT(1000));
      await vault.connect(lp1).deposit(USDT(500), lp1.address);

      await vault.connect(ownerA).setApprovedLP(lp1.address, false);

      // Nuovo deposito bloccato
      await expect(vault.connect(lp1).deposit(USDT(100), lp1.address))
        .to.be.revertedWithCustomError(vault, "ERC4626ExceededMaxDeposit");

      // Prelievo delle quote esistenti resta sempre possibile
      const shares = await vault.balanceOf(lp1.address);
      await expect(vault.connect(lp1).redeem(shares, lp1.address, lp1.address))
        .to.not.be.reverted;
      expect(await vault.balanceOf(lp1.address)).to.equal(0n);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // pause() — blocca placeOffer e nuovi depositi, mai i prelievi
  // ══════════════════════════════════════════════════════════════════════════════
  describe("pause()", function () {
    let vault, vaultAddress;

    beforeEach(async function () {
      vault = await createFundVaultFor(ownerA);
      vaultAddress = await vault.getAddress();
      await usdt.connect(ownerA).approve(vaultAddress, USDT(10000));
      await vault.connect(ownerA).deposit(USDT(1000), ownerA.address);
    });

    it("solo l'owner puo' mettere in pausa o togliere la pausa", async function () {
      await expect(vault.connect(attacker).pause()).to.be.revertedWith("Not owner");
      await expect(vault.connect(ownerA).pause()).to.emit(vault, "Paused");
    });

    it("paused blocca placeOffer", async function () {
      await vault.connect(ownerA).pause();
      await expect(vault.connect(keeper).placeOffer("EVENT_1", 0, 25000n, USDT(100)))
        .to.be.revertedWith("Vault paused");
    });

    it("paused blocca i nuovi depositi", async function () {
      await vault.connect(ownerA).pause();
      await expect(vault.connect(ownerA).deposit(USDT(100), ownerA.address))
        .to.be.revertedWithCustomError(vault, "ERC4626ExceededMaxDeposit");
    });

    it("paused NON blocca il prelievo", async function () {
      await vault.connect(ownerA).pause();
      const maxR = await vault.maxRedeem(ownerA.address);
      await expect(vault.connect(ownerA).redeem(maxR, ownerA.address, ownerA.address))
        .to.not.be.reverted;
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Keeper — placeOffer / cancelOffer / reportSettlement + liquidita'
  // ══════════════════════════════════════════════════════════════════════════════
  describe("keeper placeOffer / cancelOffer / reportSettlement", function () {
    let vault, vaultAddress;

    beforeEach(async function () {
      vault = await createFundVaultFor(ownerA);
      vaultAddress = await vault.getAddress();
      await usdt.connect(ownerA).approve(vaultAddress, USDT(10000));
      await vault.connect(ownerA).deposit(USDT(1000), ownerA.address);
    });

    it("placeOffer sposta liability nell'Escrow ma totalAssets() resta invariato (niente NAV fantasma)", async function () {
      const totalAssetsBefore = await vault.totalAssets();
      await vault.connect(keeper).placeOffer("EVENT_1", 0, 25000n, USDT(400));

      expect(await vault.balance()).to.equal(USDT(600));
      expect(await vault.lockedLiability()).to.equal(USDT(400));
      expect(await vault.totalAssets()).to.equal(totalAssetsBefore); // 600 liquido + 400 locked = 1000
    });

    it("maxSingleOfferLiability e' un cap on-chain che il keeper non puo' superare", async function () {
      await vault.connect(ownerA).setMaxSingleOfferLiability(USDT(50));
      await expect(vault.connect(keeper).placeOffer("EVENT_1", 0, 25000n, USDT(100)))
        .to.be.revertedWith("Exceeds max single offer liability");
    });

    it("un indirizzo che non e' il keeper non puo' chiamare placeOffer", async function () {
      await expect(vault.connect(attacker).placeOffer("EVENT_1", 0, 25000n, USDT(100)))
        .to.be.revertedWith("Not keeper");
    });

    it("il capitale locked in un'offerta aperta non e' prelevabile (maxRedeem capped dalla liquidita')", async function () {
      await vault.connect(keeper).placeOffer("EVENT_1", 0, 25000n, USDT(400));

      const fullShares = await vault.balanceOf(ownerA.address);
      const maxR = await vault.maxRedeem(ownerA.address);
      expect(maxR).to.be.lt(fullShares);

      await expect(vault.connect(ownerA).redeem(fullShares, ownerA.address, ownerA.address))
        .to.be.revertedWithCustomError(vault, "ERC4626ExceededMaxRedeem");
      await expect(vault.connect(ownerA).redeem(maxR, ownerA.address, ownerA.address))
        .to.not.be.reverted;
    });

    it("cancelOffer rimborsa la liability residua e riconcilia lockedLiability esattamente", async function () {
      await vault.connect(keeper).placeOffer("EVENT_1", 0, 25000n, USDT(400));
      await vault.connect(keeper).cancelOffer(0);

      expect(await vault.balance()).to.equal(USDT(1000));
      expect(await vault.lockedLiability()).to.equal(0n);
      expect(await vault.offerLockedLiability(0)).to.equal(0n);
    });

    it("reportSettlement non puo' mai superare quanto era davvero bloccato per quella offerta", async function () {
      await vault.connect(keeper).placeOffer("EVENT_1", 0, 25000n, USDT(400));
      await expect(vault.connect(keeper).reportSettlement(0, USDT(401)))
        .to.be.revertedWith("Exceeds locked amount for offer");
      await expect(vault.connect(keeper).reportSettlement(0, USDT(400)))
        .to.emit(vault, "SettlementReported").withArgs(0n, USDT(400));
      expect(await vault.lockedLiability()).to.equal(0n);
    });

    it("reportSettlement e' chiamabile solo da keeper o owner", async function () {
      await vault.connect(keeper).placeOffer("EVENT_1", 0, 25000n, USDT(400));
      await expect(vault.connect(attacker).reportSettlement(0, USDT(100)))
        .to.be.revertedWith("Not authorized");
      await expect(vault.connect(ownerA).reportSettlement(0, USDT(100)))
        .to.not.be.reverted;
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Performance fee — high-water mark, split placer/piattaforma
  // ══════════════════════════════════════════════════════════════════════════════
  describe("Performance fee (crystallizeFees)", function () {
    let vault, vaultAddress;

    beforeEach(async function () {
      vault = await createFundVaultFor(ownerA);
      vaultAddress = await vault.getAddress();
      await usdt.connect(ownerA).approve(vaultAddress, USDT(10000));
    });

    it("il primo deposito stabilisce la baseline, non genera fee", async function () {
      await vault.connect(ownerA).deposit(USDT(1000), ownerA.address);
      const sharesAfterDeposit = await vault.balanceOf(ownerA.address);
      const supplyAfterDeposit = await vault.totalSupply();

      await expect(vault.crystallizeFees()).to.not.emit(vault, "FeesCrystallized");
      expect(await vault.totalSupply()).to.equal(supplyAfterDeposit);
      expect(await vault.balanceOf(ownerA.address)).to.equal(sharesAfterDeposit);
      expect(await vault.highWaterMark()).to.be.gt(0n);
    });

    it("nessuna fee se il prezzo-quota non supera l'high-water mark", async function () {
      await vault.connect(ownerA).deposit(USDT(1000), ownerA.address);
      await expect(vault.crystallizeFees()).to.not.emit(vault, "FeesCrystallized");
    });

    it("un profitto reale crystallizza una fee divisa placer/piattaforma secondo lo split di factory", async function () {
      await vault.connect(ownerA).deposit(USDT(1000), ownerA.address);
      await vault.connect(ownerA).setPerformanceFeePercent(20);

      // Simula un profitto (es. bet vinte) come afflusso diretto di USDT nel vault.
      await usdt.mint(vaultAddress, USDT(100)); // totalAssets 1000 -> 1100, +10%

      const supplyBefore = await vault.totalSupply();
      const hwmBefore = await vault.highWaterMark();

      const tx = await vault.crystallizeFees();
      await expect(tx).to.emit(vault, "FeesCrystallized");

      const supplyAfter = await vault.totalSupply();
      expect(supplyAfter).to.be.gt(supplyBefore); // dilution reale avvenuta

      const platformRecipientShares = await vault.balanceOf(platformFeeRecipient.address);
      expect(platformRecipientShares).to.be.gt(0n);

      // Split 20% piattaforma / 80% placer sulla fee stessa (default factory)
      const totalFeeShares = supplyAfter - supplyBefore;
      const expectedPlatformShare = totalFeeShares * 20n / 100n;
      const diff = platformRecipientShares > expectedPlatformShare
        ? platformRecipientShares - expectedPlatformShare
        : expectedPlatformShare - platformRecipientShares;
      expect(diff).to.be.lt(totalFeeShares / 100n + 10n); // tolleranza per arrotondamenti interi

      expect(await vault.highWaterMark()).to.be.gt(hwmBefore);
    });

    it("chiamare crystallizeFees due volte di seguito senza nuovo profitto e' idempotente", async function () {
      await vault.connect(ownerA).deposit(USDT(1000), ownerA.address);
      await vault.connect(ownerA).setPerformanceFeePercent(20);
      await usdt.mint(vaultAddress, USDT(100));

      await vault.crystallizeFees();
      const supplyAfterFirst = await vault.totalSupply();

      await expect(vault.crystallizeFees()).to.not.emit(vault, "FeesCrystallized");
      expect(await vault.totalSupply()).to.equal(supplyAfterFirst);
    });

    it("setPerformanceFeePercent e' capped dal massimo di factory e crystallizza prima di applicare la nuova aliquota", async function () {
      await expect(vault.connect(ownerA).setPerformanceFeePercent(31))
        .to.be.revertedWith("Exceeds platform max");
      await expect(vault.connect(ownerA).setPerformanceFeePercent(30))
        .to.not.be.reverted;
    });

    it("solo l'owner puo' cambiare la performance fee", async function () {
      await expect(vault.connect(attacker).setPerformanceFeePercent(10))
        .to.be.revertedWith("Not owner");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // End-to-end: LP capital -> keeper bets -> win -> reportSettlement -> fee reale
  // ══════════════════════════════════════════════════════════════════════════════
  describe("End-to-end: fund vault lifecycle via Escrow", function () {
    it("il vault vince una scommessa, il keeper riconcilia, e la performance fee si crystallizza sul profitto reale", async function () {
      const vault = await createFundVaultFor(ownerA);
      const vaultAddress = await vault.getAddress();

      await usdt.connect(ownerA).approve(vaultAddress, USDT(10000));
      await vault.connect(ownerA).deposit(USDT(1000), ownerA.address);
      await vault.connect(ownerA).setPerformanceFeePercent(20);

      const odds = 20000n; // 2.0x
      await vault.connect(keeper).placeOffer("EVENT_X", 0, odds, USDT(100));

      await usdt.mint(bettor.address, USDT(1000));
      await usdt.connect(bettor).approve(escrowAddress, USDT(1000));
      await escrow.connect(bettor).acceptOffers([0], USDT(100));

      // Il bettor perde (ha scommesso su outcome 0, vince outcome 1) — il vault vince.
      await escrow.connect(oracle).resolveEvent("EVENT_X", 1);

      // Vault riceve stake+liability al netto della fee piattaforma (5% default su Escrow)
      const fee = USDT(100) * 5n / 100n;
      const expectedBalance = USDT(900) + (USDT(200) - fee); // 900 liquido residuo + payout vinto
      expect(await vault.balance()).to.equal(expectedBalance);

      // Prima della riconciliazione, lockedLiability e' ancora "stale" (sovrastima temporanea,
      // mai un furto — solo NAV in ritardo finche' il keeper non segnala).
      expect(await vault.lockedLiability()).to.equal(USDT(100));

      await vault.connect(keeper).reportSettlement(0, USDT(100));
      expect(await vault.lockedLiability()).to.equal(0n);
      expect(await vault.totalAssets()).to.equal(expectedBalance);

      const supplyBefore = await vault.totalSupply();
      await expect(vault.crystallizeFees()).to.emit(vault, "FeesCrystallized");
      expect(await vault.totalSupply()).to.be.gt(supplyBefore);
      expect(await vault.balanceOf(platformFeeRecipient.address)).to.be.gt(0n);
    });
  });
});
