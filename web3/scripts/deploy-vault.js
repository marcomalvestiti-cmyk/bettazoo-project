require('dotenv').config();
const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

// Points at the ALREADY-LIVE Escrow/USDT on Arbitrum Sepolia — this script deploys only
// the new PlacerVault implementation + PlacerVaultFactory, it never redeploys Escrow or
// MockUSDT. Override via env if targeting a different existing deployment.
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS || '0xCae37Cf08022bC94CC1cd09555fe130dd10E9923';
const USDT_ADDRESS   = process.env.USDT_ADDRESS   || '0x29fA91A7288A2b3De899F4ed1679e288018f69a0';
const KEEPER_FUNDING_ETH = process.env.KEEPER_FUNDING_ETH || '0.02';

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  console.log('Network:', network.name, network.chainId.toString());
  console.log('Deployer:', deployer.address);

  // Sanity check — don't deploy a vault pointed at a dead/wrong address.
  const escrowCode = await ethers.provider.getCode(ESCROW_ADDRESS);
  if (escrowCode === '0x') {
    throw new Error(`No contract code at ESCROW_ADDRESS ${ESCROW_ADDRESS} — aborting`);
  }
  console.log('Using existing BettazooEscrow:', ESCROW_ADDRESS);
  console.log('Using existing USDT:          ', USDT_ADDRESS);

  // 1. Generate a fresh keeper wallet — never logged in full below, only its address.
  const keeperWallet = ethers.Wallet.createRandom();
  console.log('Generated keeper address:', keeperWallet.address);

  // 2. Fund it with a small amount of Sepolia ETH for gas (placeOffer/cancelOffer txs).
  const fundTx = await deployer.sendTransaction({
    to: keeperWallet.address,
    value: ethers.parseEther(KEEPER_FUNDING_ETH),
  });
  await fundTx.wait();
  console.log(`Funded keeper with ${KEEPER_FUNDING_ETH} ETH — tx ${fundTx.hash}`);

  // 3. Deploy PlacerVault implementation (cloned per-user by the factory)
  const PlacerVault = await ethers.getContractFactory('PlacerVault');
  const vaultImpl = await PlacerVault.deploy(ESCROW_ADDRESS, USDT_ADDRESS);
  await vaultImpl.waitForDeployment();
  const vaultImplAddress = await vaultImpl.getAddress();
  console.log('PlacerVault implementation deployed →', vaultImplAddress);

  // 4. Deploy PlacerVaultFactory
  const PlacerVaultFactory = await ethers.getContractFactory('PlacerVaultFactory');
  const factory = await PlacerVaultFactory.deploy(
    vaultImplAddress,
    ESCROW_ADDRESS,
    USDT_ADDRESS,
    keeperWallet.address
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  const deployBlock = (await factory.deploymentTransaction().wait()).blockNumber;
  console.log('PlacerVaultFactory deployed →', factoryAddress, `(block ${deployBlock})`);

  // ── Secrets: written directly to backend/.env, never printed to stdout ──────────────
  const backendEnvPath = path.join(__dirname, '..', '..', 'backend', '.env');
  const secretLines =
    `\n# Added by deploy-vault.js on ${new Date().toISOString()}\n` +
    `VAULT_FACTORY_ADDRESS=${factoryAddress}\n` +
    `VAULT_FACTORY_DEPLOY_BLOCK=${deployBlock}\n` +
    `KEEPER_PRIVATE_KEY=${keeperWallet.privateKey}\n`;
  fs.appendFileSync(backendEnvPath, secretLines);
  console.log(`\nKEEPER_PRIVATE_KEY + VAULT_FACTORY_ADDRESS + VAULT_FACTORY_DEPLOY_BLOCK appended to backend/.env (gitignored, not printed here).`);

  // ── Public values: safe to print and to store in frontend/.env.local ───────────────
  const frontendEnvPath = path.join(__dirname, '..', '..', 'frontend', '.env.local');
  fs.appendFileSync(frontendEnvPath, `\nNEXT_PUBLIC_VAULT_FACTORY_ADDRESS=${factoryAddress}\n`);

  const record = {
    network: 'arbitrumSepolia',
    chainId: 421614,
    escrowAddress: ESCROW_ADDRESS,
    usdtAddress: USDT_ADDRESS,
    vaultImplementationAddress: vaultImplAddress,
    vaultFactoryAddress: factoryAddress,
    vaultFactoryDeployBlock: deployBlock,
    keeperAddress: keeperWallet.address,
    deployedAt: new Date().toISOString(),
  };
  const recordPath = path.join(__dirname, '..', 'deployments', 'arbitrum-sepolia-vault.json');
  fs.mkdirSync(path.dirname(recordPath), { recursive: true });
  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2));

  console.log('\n=== Public values (safe to share) ===');
  console.log(JSON.stringify(record, null, 2));
  console.log(`\nSaved to ${recordPath}`);
  console.log('\nNext: add VAULT_FACTORY_ADDRESS + KEEPER_PRIVATE_KEY (from backend/.env) to Railway,');
  console.log('and NEXT_PUBLIC_VAULT_FACTORY_ADDRESS to Vercel (frontend project).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
