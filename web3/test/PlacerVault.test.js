const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Suite di test per PlacerVault.sol + PlacerVaultFactory.sol
 *
 * Garanzia non-custodial da verificare: withdraw() paga sempre msg.sender,
 * il keeper non ha mai una via per spostare fondi fuori dal vault se non
 * tramite l'owner stesso.
 */
describe("PlacerVault + PlacerVaultFactory", function () {
  const USDT = (n) => BigInt(n) * 1_000_000n;
  const ODDS_PRECISION = 10000n;

  let usdt, escrow, implementation, factory;
  let deployer, treasury, oracle, keeper, ownerA, ownerB, attacker;
  let escrowAddress, usdtAddress, implAddress, factoryAddress;

  beforeEach(async function () {
    [deployer, treasury, oracle, keeper, ownerA, ownerB, attacker] =
      await ethers.getSigners();

    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    usdt = await MockUSDT.deploy();
    usdtAddress = await usdt.getAddress();

    const Escrow = await ethers.getContractFactory("BettazooEscrow");
    escrow = await Escrow.deploy(usdtAddress, treasury.address, oracle.address);
    escrowAddress = await escrow.getAddress();

    const PlacerVault = await ethers.getContractFactory("PlacerVault");
    implementation = await PlacerVault.deploy(escrowAddress, usdtAddress);
    implAddress = await implementation.getAddress();

    const Factory = await ethers.getContractFactory("PlacerVaultFactory");
    factory = await Factory.deploy(implAddress, escrowAddress, usdtAddress, keeper.address);
    factoryAddress = await factory.getAddress();

    for (const signer of [ownerA, ownerB]) {
      await usdt.mint(signer.address, USDT(10000));
    }
  });

  async function createVaultFor(signer) {
    const tx = await factory.connect(signer).createVault();
    await tx.wait();
    const vaultAddr = await factory.vaultOf(signer.address);
    return await ethers.getContractAt("PlacerVault", vaultAddr);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // Factory
  // ══════════════════════════════════════════════════════════════════════════════
  describe("PlacerVaultFactory", function () {
    it("crea un vault isolato per utente e lo inizializza correttamente", async function () {
      const vault = await createVaultFor(ownerA);
      expect(await vault.owner()).to.equal(ownerA.address);
      expect(await vault.keeper()).to.equal(keeper.address);
      expect(await vault.escrow()).to.equal(escrowAddress);
      expect(await vault.stablecoin()).to.equal(usdtAddress);
    });

    it("emette VaultCreated e registra vaultOf/allVaults", async function () {
      await expect(factory.connect(ownerA).createVault())
        .to.emit(factory, "VaultCreated");
      const vaultAddr = await factory.vaultOf(ownerA.address);
      expect(vaultAddr).to.not.equal(ethers.ZeroAddress);
      expect(await factory.allVaultsCount()).to.equal(1n);
      expect(await factory.allVaults(0)).to.equal(vaultAddr);
    });

    it("due utenti diversi ottengono indirizzi vault distinti", async function () {
      const vaultA = await createVaultFor(ownerA);
      const vaultB = await createVaultFor(ownerB);
      expect(await vaultA.getAddress()).to.not.equal(await vaultB.getAddress());
      expect(await vaultA.owner()).to.equal(ownerA.address);
      expect(await vaultB.owner()).to.equal(ownerB.address);
    });

    it("rifiuta un secondo vault per lo stesso owner (one-vault-per-user in v1)", async function () {
      await factory.connect(ownerA).createVault();
      await expect(factory.connect(ownerA).createVault())
        .to.be.revertedWith("Vault already exists");
    });

    it("solo l'owner della factory puo' aggiornare il defaultKeeper", async function () {
      await expect(factory.connect(attacker).setDefaultKeeper(attacker.address))
        .to.be.reverted;
      await expect(factory.connect(deployer).setDefaultKeeper(attacker.address))
        .to.emit(factory, "DefaultKeeperUpdated");
      expect(await factory.defaultKeeper()).to.equal(attacker.address);
    });

    it("il defaultKeeper aggiornato si applica solo ai vault creati dopo l'update", async function () {
      const vaultA = await createVaultFor(ownerA);
      await factory.connect(deployer).setDefaultKeeper(attacker.address);
      const vaultB = await createVaultFor(ownerB);
      expect(await vaultA.keeper()).to.equal(keeper.address);
      expect(await vaultB.keeper()).to.equal(attacker.address);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Implementation contract itself must be neutralized
  // ══════════════════════════════════════════════════════════════════════════════
  describe("Implementation contract safety", function () {
    it("l'implementation non puo' essere inizializzata direttamente (gia' neutralizzata dal constructor)", async function () {
      await expect(implementation.initialize(attacker.address, attacker.address))
        .to.be.revertedWith("Already initialized");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Clone initialize() cannot be re-called or front-run
  // ══════════════════════════════════════════════════════════════════════════════
  describe("Clone initialize() guard", function () {
    it("un clone gia' inizializzato dalla factory non puo' essere reinizializzato da nessuno", async function () {
      const vault = await createVaultFor(ownerA);
      await expect(vault.connect(attacker).initialize(attacker.address, attacker.address))
        .to.be.revertedWith("Already initialized");
      // Owner/keeper restano quelli impostati dalla factory, non quelli del tentativo di attacco
      expect(await vault.owner()).to.equal(ownerA.address);
      expect(await vault.keeper()).to.equal(keeper.address);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Deposit / Withdraw — non-custodial invariant
  // ══════════════════════════════════════════════════════════════════════════════
  describe("deposit / withdraw", function () {
    let vault, vaultAddress;

    beforeEach(async function () {
      vault = await createVaultFor(ownerA);
      vaultAddress = await vault.getAddress();
      await usdt.connect(ownerA).approve(vaultAddress, USDT(10000));
    });

    it("deposit trasferisce USDT dall'owner al vault", async function () {
      await expect(vault.connect(ownerA).deposit(USDT(500)))
        .to.emit(vault, "Deposited").withArgs(ownerA.address, USDT(500));
      expect(await vault.balance()).to.equal(USDT(500));
      expect(await usdt.balanceOf(ownerA.address)).to.equal(USDT(9500));
    });

    it("solo l'owner puo' depositare", async function () {
      await usdt.mint(attacker.address, USDT(100));
      await usdt.connect(attacker).approve(vaultAddress, USDT(100));
      await expect(vault.connect(attacker).deposit(USDT(100)))
        .to.be.revertedWith("Not owner");
    });

    it("withdraw paga sempre e solo msg.sender, mai un altro indirizzo (nessun parametro destinatario esiste)", async function () {
      await vault.connect(ownerA).deposit(USDT(500));
      const before = await usdt.balanceOf(ownerA.address);
      await expect(vault.connect(ownerA).withdraw(USDT(200)))
        .to.emit(vault, "Withdrawn").withArgs(ownerA.address, USDT(200));
      expect(await usdt.balanceOf(ownerA.address)).to.equal(before + USDT(200));
      expect(await vault.balance()).to.equal(USDT(300));
    });

    it("il keeper non puo' prelevare fondi, indipendentemente dall'importo", async function () {
      await vault.connect(ownerA).deposit(USDT(500));
      await expect(vault.connect(keeper).withdraw(USDT(1)))
        .to.be.revertedWith("Not owner");
    });

    it("un attaccante non puo' prelevare fondi di un altro owner", async function () {
      await vault.connect(ownerA).deposit(USDT(500));
      await expect(vault.connect(attacker).withdraw(USDT(1)))
        .to.be.revertedWith("Not owner");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Keeper — placeOffer / cancelOffer
  // ══════════════════════════════════════════════════════════════════════════════
  describe("keeper placeOffer / cancelOffer", function () {
    let vault, vaultAddress;

    beforeEach(async function () {
      vault = await createVaultFor(ownerA);
      vaultAddress = await vault.getAddress();
      await usdt.connect(ownerA).approve(vaultAddress, USDT(10000));
      await vault.connect(ownerA).deposit(USDT(1000));
    });

    it("il keeper puo' piazzare un'offerta usando il balance del vault come collaterale", async function () {
      const odds = 25000n; // 2.5x
      const liability = USDT(100);
      await vault.connect(keeper).placeOffer("EVENT_1", 0, odds, liability);

      const offer = await escrow.offers(0);
      expect(offer.placer).to.equal(vaultAddress); // il vault, non il keeper, e' il placer on-chain
      expect(offer.liability).to.equal(liability);
      expect(await vault.balance()).to.equal(USDT(900));
    });

    it("un indirizzo che non e' il keeper non puo' chiamare placeOffer", async function () {
      await expect(vault.connect(attacker).placeOffer("EVENT_1", 0, 25000n, USDT(100)))
        .to.be.revertedWith("Not keeper");
      await expect(vault.connect(ownerA).placeOffer("EVENT_1", 0, 25000n, USDT(100)))
        .to.be.revertedWith("Not keeper");
    });

    it("pause() blocca il keeper anche con una strategia valida, indipendentemente dallo stato del backend", async function () {
      await vault.connect(ownerA).pause();
      await expect(vault.connect(keeper).placeOffer("EVENT_1", 0, 25000n, USDT(100)))
        .to.be.revertedWith("Vault paused");

      await vault.connect(ownerA).unpause();
      await expect(vault.connect(keeper).placeOffer("EVENT_1", 0, 25000n, USDT(100)))
        .to.not.be.reverted;
    });

    it("solo l'owner puo' mettere in pausa o togliere la pausa", async function () {
      await expect(vault.connect(attacker).pause()).to.be.revertedWith("Not owner");
      await expect(vault.connect(keeper).pause()).to.be.revertedWith("Not owner");
    });

    it("maxSingleOfferLiability e' un cap on-chain che il keeper non puo' superare", async function () {
      await vault.connect(ownerA).setMaxSingleOfferLiability(USDT(50));
      await expect(vault.connect(keeper).placeOffer("EVENT_1", 0, 25000n, USDT(100)))
        .to.be.revertedWith("Exceeds max single offer liability");
      await expect(vault.connect(keeper).placeOffer("EVENT_1", 0, 25000n, USDT(50)))
        .to.not.be.reverted;
    });

    it("cancelOffer rimborsa la liability residua nel vault, non al keeper", async function () {
      await vault.connect(keeper).placeOffer("EVENT_1", 0, 25000n, USDT(100));
      const balanceBeforeCancel = await vault.balance();
      await vault.connect(keeper).cancelOffer(0);
      expect(await vault.balance()).to.equal(balanceBeforeCancel + USDT(100));
    });

    it("cancelOffer e' chiamabile anche dall'owner come override di emergenza", async function () {
      await vault.connect(keeper).placeOffer("EVENT_1", 0, 25000n, USDT(100));
      await expect(vault.connect(ownerA).cancelOffer(0)).to.not.be.reverted;
    });

    it("un estraneo non puo' chiamare cancelOffer", async function () {
      await vault.connect(keeper).placeOffer("EVENT_1", 0, 25000n, USDT(100));
      await expect(vault.connect(attacker).cancelOffer(0))
        .to.be.revertedWith("Not authorized");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // End-to-end: vault come placer in un ciclo completo di scommessa
  // ══════════════════════════════════════════════════════════════════════════════
  describe("End-to-end: vault placer lifecycle via Escrow", function () {
    it("il vault paga il bettor vincente e riceve la fee dedotta correttamente, senza intervento del keeper sui fondi", async function () {
      const vault = await createVaultFor(ownerA);
      const vaultAddress = await vault.getAddress();
      await usdt.connect(ownerA).approve(vaultAddress, USDT(10000));
      await vault.connect(ownerA).deposit(USDT(1000));

      const odds = 20000n; // 2.0x
      await vault.connect(keeper).placeOffer("EVENT_X", 0, odds, USDT(100));

      const signers = await ethers.getSigners();
      const bettor = signers[7]; // fresh signer, distinct from deployer/treasury/oracle/keeper/ownerA/ownerB/attacker
      await usdt.mint(bettor.address, USDT(1000));
      await usdt.connect(bettor).approve(escrowAddress, USDT(1000));
      await escrow.connect(bettor).acceptOffers([0], USDT(100));

      // Il bettor vince (outcome 0)
      await escrow.connect(oracle).resolveEvent("EVENT_X", 0);

      // Vault non riceve nulla in piu' (ha perso la sua liability), il balance resta 900
      expect(await vault.balance()).to.equal(USDT(900));

      // Il bettor riceve il pot al netto della fee del 5% sul profitto netto (100 USDT)
      const fee = USDT(100) * 5n / 100n;
      const expectedPayout = USDT(200) - fee; // stake + liability - fee
      expect(await usdt.balanceOf(bettor.address)).to.equal(USDT(1000) - USDT(100) + expectedPayout);
    });
  });
});
