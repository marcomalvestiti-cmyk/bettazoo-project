require('dotenv').config();
const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

// Redeploys BettazooEscrow (adds per-placer fee override — see PlacerFeeOverrideUpdated)
// plus a matching PlacerVault implementation + PlacerVaultFactory (escrow is `immutable`
// inside PlacerVault, so a new Escrow always needs a new vault impl/factory pair).
// Reuses the ALREADY-LIVE MockUSDT — no reason to redeploy the token. Same pattern as
// deploy-vault.js (point at what's live, deploy only what changed).
//
// Deliberately does NOT touch the old Escrow/vault deployment (arbitrum-sepolia-vault.json)
// — the existing real vault stays exactly as-is (grandfathered), see the Tier 3 plan notes.
const USDT_ADDRESS      = process.env.USDT_ADDRESS      || '0x29fA91A7288A2b3De899F4ed1679e288018f69a0';
const TREASURY_ADDRESS  = process.env.TREASURY_ADDRESS  || '0xa4c486cEaff47a130057BD624dCd265Fa66f3284';
const ORACLE_ADDRESS    = process.env.ORACLE_ADDRESS    || '0xa4c486cEaff47a130057BD624dCd265Fa66f3284';
const KEEPER_FUNDING_ETH = process.env.KEEPER_FUNDING_ETH || '0.02';

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  console.log('Network:', network.name, network.chainId.toString());
  console.log('Deployer:', deployer.address);

  const usdtCode = await ethers.provider.getCode(USDT_ADDRESS);
  if (usdtCode === '0x') {
    throw new Error(`No contract code at USDT_ADDRESS ${USDT_ADDRESS} — aborting`);
  }
  console.log('Using existing USDT:', USDT_ADDRESS);
  console.log('Treasury:', TREASURY_ADDRESS);
  console.log('Oracle:  ', ORACLE_ADDRESS);

  // 1. Deploy the new BettazooEscrow (with placerFeeOverride support)
  const Escrow = await ethers.getContractFactory('BettazooEscrow');
  const escrow = await Escrow.deploy(USDT_ADDRESS, TREASURY_ADDRESS, ORACLE_ADDRESS);
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  const escrowDeployBlock = (await escrow.deploymentTransaction().wait()).blockNumber;
  console.log('BettazooEscrow deployed →', escrowAddress, `(block ${escrowDeployBlock})`);

  // 2. Generate a fresh keeper wallet — never logged in full below, only its address.
  const keeperWallet = ethers.Wallet.createRandom();
  console.log('Generated keeper address:', keeperWallet.address);

  // 3. Fund it with a small amount of Sepolia ETH for gas (placeOffer/cancelOffer txs).
  const fundTx = await deployer.sendTransaction({
    to: keeperWallet.address,
    value: ethers.parseEther(KEEPER_FUNDING_ETH),
  });
  await fundTx.wait();
  console.log(`Funded keeper with ${KEEPER_FUNDING_ETH} ETH — tx ${fundTx.hash}`);

  // 4. Deploy PlacerVault implementation, pointed at the NEW escrow
  const PlacerVault = await ethers.getContractFactory('PlacerVault');
  const vaultImpl = await PlacerVault.deploy(escrowAddress, USDT_ADDRESS);
  await vaultImpl.waitForDeployment();
  const vaultImplAddress = await vaultImpl.getAddress();
  console.log('PlacerVault implementation deployed →', vaultImplAddress);

  // 5. Deploy PlacerVaultFactory
  const PlacerVaultFactory = await ethers.getContractFactory('PlacerVaultFactory');
  const factory = await PlacerVaultFactory.deploy(
    vaultImplAddress,
    escrowAddress,
    USDT_ADDRESS,
    keeperWallet.address
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  const factoryDeployBlock = (await factory.deploymentTransaction().wait()).blockNumber;
  console.log('PlacerVaultFactory deployed →', factoryAddress, `(block ${factoryDeployBlock})`);

  // ── Secrets: written directly to backend/.env, never printed to stdout ──────────────
  const backendEnvPath = path.join(__dirname, '..', '..', 'backend', '.env');
  const secretLines =
    `\n# Added by deploy-vig.js on ${new Date().toISOString()} — Vigorish per-vault redeploy\n` +
    `CONTRACT_ADDRESS=${escrowAddress}\n` +
    `ESCROW_DEPLOY_BLOCK=${escrowDeployBlock}\n` +
    `VAULT_FACTORY_ADDRESS=${factoryAddress}\n` +
    `VAULT_FACTORY_DEPLOY_BLOCK=${factoryDeployBlock}\n` +
    `KEEPER_PRIVATE_KEY=${keeperWallet.privateKey}\n`;
  fs.appendFileSync(backendEnvPath, secretLines);
  console.log(`\nCONTRACT_ADDRESS + ESCROW_DEPLOY_BLOCK + VAULT_FACTORY_ADDRESS + VAULT_FACTORY_DEPLOY_BLOCK + KEEPER_PRIVATE_KEY appended to backend/.env (gitignored, not printed here).`);

  // ── Public values: safe to print and to store in frontend/.env.local ───────────────
  const frontendEnvPath = path.join(__dirname, '..', '..', 'frontend', '.env.local');
  fs.appendFileSync(
    frontendEnvPath,
    `\n# Added by deploy-vig.js on ${new Date().toISOString()} — Vigorish per-vault redeploy\n` +
    `NEXT_PUBLIC_ESCROW_ADDRESS=${escrowAddress}\n` +
    `NEXT_PUBLIC_VAULT_FACTORY_ADDRESS=${factoryAddress}\n`
  );

  const record = {
    network: 'arbitrumSepolia',
    chainId: 421614,
    escrowAddress,
    escrowDeployBlock,
    usdtAddress: USDT_ADDRESS,
    treasuryAddress: TREASURY_ADDRESS,
    oracleAddress: ORACLE_ADDRESS,
    vaultImplementationAddress: vaultImplAddress,
    vaultFactoryAddress: factoryAddress,
    vaultFactoryDeployBlock: factoryDeployBlock,
    keeperAddress: keeperWallet.address,
    deployedAt: new Date().toISOString(),
    supersedes: 'arbitrum-sepolia-vault.json (grandfathered, not migrated)',
  };
  const recordPath = path.join(__dirname, '..', 'deployments', 'arbitrum-sepolia-escrow-v2.json');
  fs.mkdirSync(path.dirname(recordPath), { recursive: true });
  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2));

  console.log('\n=== Public values (safe to share) ===');
  console.log(JSON.stringify(record, null, 2));
  console.log(`\nSaved to ${recordPath}`);
  console.log('\nNext: review backend/.env + frontend/.env.local locally, then update Railway');
  console.log('(CONTRACT_ADDRESS, ESCROW_DEPLOY_BLOCK, VAULT_FACTORY_ADDRESS, VAULT_FACTORY_DEPLOY_BLOCK,');
  console.log('KEEPER_PRIVATE_KEY) and Vercel (NEXT_PUBLIC_ESCROW_ADDRESS, NEXT_PUBLIC_VAULT_FACTORY_ADDRESS)');
  console.log('— only after explicit confirmation, this is a production cutover.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
