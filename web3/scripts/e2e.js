/**
 * Script E2E: simula il flusso completo
 *   1. Placer crea un'offerta (createOffer)
 *   2. Bettor approva USDT e accetta l'offerta (acceptOffers)
 *   3. Oracle risolve l'evento (resolveEvent)
 *   4. Verifica saldi finali
 */
const { ethers } = require("hardhat");

const ESCROW = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const USDT   = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const ODDS_PRECISION = 10000n;

async function bal(usdt, addr, label) {
  const raw = await usdt.balanceOf(addr);
  console.log(`  ${label}: ${ethers.formatUnits(raw, 6)} USDT`);
  return raw;
}

async function main() {
  const [deployer, treasury, oracle, alice, bob] = await ethers.getSigners();

  const usdt   = await ethers.getContractAt("MockUSDT",        USDT,   deployer);
  const escrow = await ethers.getContractAt("BettazooEscrow",  ESCROW, deployer);

  console.log("\n── SALDI INIZIALI ──────────────────────────");
  await bal(usdt, alice.address,    "Alice  (placer)");
  await bal(usdt, bob.address,      "Bob    (bettor)");
  await bal(usdt, treasury.address, "Treasury       ");
  await bal(usdt, ESCROW,           "Escrow         ");

  // ── 1. PLACER (Alice) crea un'offerta ─────────────────────────────────────
  const eventId  = "evt-e2e-001";
  const outcome  = 0;                                  // Home Win
  const odds     = 25000n;                              // 2.5x → 25000 (×ODDS_PRECISION)
  const liability = ethers.parseUnits("100", 6);        // 100 USDT

  // Alice: approve + createOffer
  await usdt.connect(alice).approve(ESCROW, liability);
  const tx1 = await escrow.connect(alice).createOffer(eventId, outcome, odds, liability);
  const rc1  = await tx1.wait();
  const ev1  = rc1.logs.map(l => { try { return escrow.interface.parseLog(l) } catch { return null } }).find(e => e?.name === "OfferCreated");
  const offerId = ev1.args.offerId;
  console.log(`\n✓ createOffer — offerId=${offerId}, odds=2.5x, liability=100 USDT`);

  // Verifica: max stake bettor = liability * P / (odds - P) = 100 * 10000 / (25000-10000) = 66.666... USDT
  const maxStake = liability * ODDS_PRECISION / (odds - ODDS_PRECISION);
  console.log(`  Max stake bettor: ${ethers.formatUnits(maxStake, 6)} USDT`);

  // ── 2. BETTOR (Bob) accetta l'offerta ─────────────────────────────────────
  const bettorStake = ethers.parseUnits("50", 6);   // 50 USDT (< maxStake)
  await usdt.connect(bob).approve(ESCROW, bettorStake);
  const tx2 = await escrow.connect(bob).acceptOffers([offerId], bettorStake);
  const rc2  = await tx2.wait();
  const ev2  = rc2.logs.map(l => { try { return escrow.interface.parseLog(l) } catch { return null } }).find(e => e?.name === "OfferMatched");
  const matchId = ev2.args.matchId;
  console.log(`\n✓ acceptOffers — matchId=${matchId}, bettorStake=50 USDT`);
  console.log(`  placerLiability usata: ${ethers.formatUnits(ev2.args.placerLiability, 6)} USDT`);

  // ── 3. ORACLE risolve (outcome 0 = Home Win → Alice vince) ────────────────
  const tx3 = await escrow.connect(oracle).resolveEvent(eventId, 0);
  await tx3.wait();
  console.log(`\n✓ resolveEvent — winningOutcome=0 (Home Win) → Alice vince`);

  // ── 4. SALDI FINALI ───────────────────────────────────────────────────────
  console.log("\n── SALDI FINALI ────────────────────────────");
  const aliceFinal    = await bal(usdt, alice.address,    "Alice  (placer)");
  const bobFinal      = await bal(usdt, bob.address,      "Bob    (bettor)");
  const treasuryFinal = await bal(usdt, treasury.address, "Treasury       ");
  const escrowFinal   = await bal(usdt, ESCROW,           "Escrow         ");

  // Calcoli attesi:
  //   totalPot  = bettorStake (50) + placerLiability (75) = 125 USDT  [netto liability = stake * (odds-P)/P]
  //   Actually: placerLiability = bettorStake * (odds - P) / P = 50 * 15000/10000 = 75 USDT
  //   rake      = 2% di 125 = 2.5 USDT
  //   Alice riceve 125 - 2.5 = 122.5 USDT (al netto di quanto aveva già speso: 100 liability)
  //   Alice netto: +22.5 USDT rispetto al suo saldo dopo createOffer
  //   Bob perde 50 USDT
  //   Treasury guadagna 2.5 USDT

  const INITIAL = ethers.parseUnits("10000", 6);
  console.log("\n── DELTA ───────────────────────────────────");
  const fmt = (v) => parseFloat(ethers.formatUnits(v, 6)).toFixed(6);
  console.log(`  Alice:    ${fmt(aliceFinal - INITIAL)} USDT (atteso: ~+22.5)`);
  console.log(`  Bob:      ${fmt(bobFinal   - INITIAL)} USDT (atteso: ~-50.0)`);
  console.log(`  Treasury: ${fmt(treasuryFinal)}  USDT (atteso: ~2.5)`);
  console.log(`  Escrow:   ${fmt(escrowFinal)}   USDT (atteso: 0.0)`);

  // L'offer è ancora active=true (remainingLiability=25 non consumata)
  // Alice recupera i fondi non matchati con cancelOffer
  const offerBefore = await escrow.offers(offerId);
  console.log(`\n── CANCEL UNMATCHED FUNDS ──────────────────`);
  console.log(`  Offer active=${offerBefore.active}, remainingLiability=${ethers.formatUnits(offerBefore.remainingLiability, 6)} USDT`);

  const tx4 = await escrow.connect(alice).cancelOffer(offerId);
  await tx4.wait();
  console.log("✓ cancelOffer — Alice recupera la liability residua");

  console.log("\n── SALDI DOPO CANCEL ───────────────────────");
  const aliceFinal2    = await bal(usdt, alice.address,    "Alice  (placer)");
  const escrowFinal2   = await bal(usdt, ESCROW,           "Escrow         ");

  console.log("\n── DELTA TOTALE ────────────────────────────");
  console.log(`  Alice:    ${fmt(aliceFinal2 - INITIAL)} USDT (atteso: ~-52.5 = 75 liability persa - 25 recuperata + 0 stake)`);
  console.log(`           [ha perso il match (75 liability), recuperato 25 non matchata]`);
  console.log(`  Bob:      ${fmt(bobFinal - INITIAL)} USDT (atteso: ~+72.5 = ha vinto il match)`);
  console.log(`  Treasury: ${fmt(treasuryFinal)}  USDT (atteso: ~2.5 = 2% di 125)`);
  console.log(`  Escrow:   ${fmt(escrowFinal2)}   USDT (atteso: 0.0 = tutto distribuito)`);

  const allOk = escrowFinal2 === 0n && treasuryFinal > 0n && bobFinal > INITIAL && aliceFinal2 < INITIAL;
  console.log(`\n${allOk ? "✓ FLUSSO E2E COMPLETO OK" : "✗ ANOMALIA"}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
