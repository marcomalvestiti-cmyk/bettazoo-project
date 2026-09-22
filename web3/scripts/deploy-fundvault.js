require('dotenv').config();
const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

// Deploys PlacerFundVault implementation + PlacerFundVaultFactory (Tier 3, item 2/3 —
// ERC-4626 vault for third-party LP capital), pointed at the ALREADY-LIVE Escrow/USDT
// from the Vigorish redeploy (arbitrum-sepolia-escrow-v2.json, 2026-09-21). No Escrow
// redeploy needed for this one — PlacerFundVault only calls the same public
// createOffer/cancelOffer surface every other placer already uses (see
// contracts/IBettazooEscrow.sol). Reuses the SAME keeper wallet already funded and
// running for the single-owner PlacerVault (one keeper process manages both vault
// types — see backend/src/services/keeperService.js) instead of generating a new one.
const USDT_ADDRESS = process.env.USDT_ADDRESS || '0x29fA91A7288A2b3De899F4ed1679e288018f69a0';
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS || '0xD01D7Af6eB42968DdE249cD56ab382F2eF7fF04D';
const KEEPER_ADDRESS = process.env.KEEPER_ADDRESS || '0x15d2A347B5FAE71de407Cd0cEb6203760ed4724d';
const PLATFORM_FEE_RECIPIENT = process.env.PLATFORM_FEE_RECIPIENT || '0xa4c486cEaff47a130057BD624dCd265Fa66f3284';

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  console.log('Network:', network.name, network.chainId.toString());
  console.log('Deployer:', deployer.address);

  for (const [label, addr] of [['USDT_ADDRESS', USDT_ADDRESS], ['ESCROW_ADDRESS', ESCROW_ADDRESS]]) {
    const code = await ethers.provider.getCode(addr);
    if (code === '0x') throw new Error(`No contract code at ${label} ${addr} — aborting`);
  }
  console.log('Using existing USDT:  ', USDT_ADDRESS);
  console.log('Using existing Escrow:', ESCROW_ADDRESS);
  console.log('Default keeper:       ', KEEPER_ADDRESS);
  console.log('Platform fee recipient:', PLATFORM_FEE_RECIPIENT);

  // 1. Deploy PlacerFundVault implementation, pointed at the existing Escrow.
  const PlacerFundVault = await ethers.getContractFactory('PlacerFundVault');
  const fundVaultImpl = await PlacerFundVault.deploy(ESCROW_ADDRESS);
  await fundVaultImpl.waitForDeployment();
  const fundVaultImplAddress = await fundVaultImpl.getAddress();
  console.log('PlacerFundVault implementation deployed →', fundVaultImplAddress);

  // 2. Deploy PlacerFundVaultFactory.
  const PlacerFundVaultFactory = await ethers.getContractFactory('PlacerFundVaultFactory');
  const factory = await PlacerFundVaultFactory.deploy(
    fundVaultImplAddress,
    ESCROW_ADDRESS,
    USDT_ADDRESS,
    KEEPER_ADDRESS,
    PLATFORM_FEE_RECIPIENT
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  const factoryDeployBlock = (await factory.deploymentTransaction().wait()).blockNumber;
  console.log('PlacerFundVaultFactory deployed →', factoryAddress, `(block ${factoryDeployBlock})`);

  // ── Backend env (no secrets here — the keeper key is already on Railway from the
  // single-owner vault deploy, this script only ever needs the keeper's ADDRESS) ───────
  const backendEnvPath = path.join(__dirname, '..', '..', 'backend', '.env');
  fs.appendFileSync(
    backendEnvPath,
    `\n# Added by deploy-fundvault.js on ${new Date().toISOString()} — Fund Vault (Tier 3 item 2/3)\n` +
    `FUND_VAULT_FACTORY_ADDRESS=${factoryAddress}\n` +
    `FUND_VAULT_FACTORY_DEPLOY_BLOCK=${factoryDeployBlock}\n`
  );
  console.log('\nFUND_VAULT_FACTORY_ADDRESS + FUND_VAULT_FACTORY_DEPLOY_BLOCK appended to backend/.env.');

  // ── Frontend env — public values only ───────────────────────────────────────────────
  const frontendEnvPath = path.join(__dirname, '..', '..', 'frontend', '.env.local');
  fs.appendFileSync(
    frontendEnvPath,
    `\n# Added by deploy-fundvault.js on ${new Date().toISOString()} — Fund Vault (Tier 3 item 2/3)\n` +
    `NEXT_PUBLIC_FUND_VAULT_FACTORY_ADDRESS=${factoryAddress}\n`
  );

  const record = {
    network: 'arbitrumSepolia',
    chainId: 421614,
    escrowAddress: ESCROW_ADDRESS,
    usdtAddress: USDT_ADDRESS,
    fundVaultImplementationAddress: fundVaultImplAddress,
    fundVaultFactoryAddress: factoryAddress,
    fundVaultFactoryDeployBlock: factoryDeployBlock,
    defaultKeeperAddress: KEEPER_ADDRESS,
    platformFeeRecipient: PLATFORM_FEE_RECIPIENT,
    deployedAt: new Date().toISOString(),
  };
  const recordPath = path.join(__dirname, '..', 'deployments', 'arbitrum-sepolia-fundvault.json');
  fs.mkdirSync(path.dirname(recordPath), { recursive: true });
  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2));

  console.log('\n=== Public values (safe to share) ===');
  console.log(JSON.stringify(record, null, 2));
  console.log(`\nSaved to ${recordPath}`);
  console.log('\nNext: review backend/.env + frontend/.env.local locally, then set on Railway');
  console.log('(FUND_VAULT_FACTORY_ADDRESS, FUND_VAULT_FACTORY_DEPLOY_BLOCK) and Vercel');
  console.log('(NEXT_PUBLIC_FUND_VAULT_FACTORY_ADDRESS) — only after explicit confirmation.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
