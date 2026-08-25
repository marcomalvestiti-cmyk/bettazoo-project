require('dotenv').config();
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  // On a real network use env vars; fall back to deployer for local testing.
  const treasuryAddress = process.env.TREASURY_ADDRESS || deployer.address;
  const oracleAddress   = process.env.ORACLE_ADDRESS   || deployer.address;
  const keeperAddress   = process.env.KEEPER_ADDRESS   || deployer.address;

  console.log("Deployer:", deployer.address);
  console.log("Treasury:", treasuryAddress);
  console.log("Oracle:  ", oracleAddress);
  console.log("Keeper:  ", keeperAddress);

  // 1. Deploy MockUSDT
  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const usdt = await MockUSDT.deploy();
  await usdt.waitForDeployment();
  const usdtAddress = await usdt.getAddress();
  console.log("MockUSDT deployed →", usdtAddress);

  // 2. Deploy BettazooEscrow
  const Escrow = await ethers.getContractFactory("BettazooEscrow");
  const escrow = await Escrow.deploy(usdtAddress, treasuryAddress, oracleAddress);
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log("BettazooEscrow deployed →", escrowAddress);

  // 3. Deploy PlacerVault implementation (cloned per-user by the factory, never used directly)
  const PlacerVault = await ethers.getContractFactory("PlacerVault");
  const vaultImpl = await PlacerVault.deploy(escrowAddress, usdtAddress);
  await vaultImpl.waitForDeployment();
  const vaultImplAddress = await vaultImpl.getAddress();
  console.log("PlacerVault implementation deployed →", vaultImplAddress);

  // 4. Deploy PlacerVaultFactory
  const PlacerVaultFactory = await ethers.getContractFactory("PlacerVaultFactory");
  const vaultFactory = await PlacerVaultFactory.deploy(
    vaultImplAddress,
    escrowAddress,
    usdtAddress,
    keeperAddress
  );
  await vaultFactory.waitForDeployment();
  const vaultFactoryAddress = await vaultFactory.getAddress();
  console.log("PlacerVaultFactory deployed →", vaultFactoryAddress);

  // 5. Chiama faucet per ottenere USDT di test (1000 USDT al deployer)
  await usdt.faucet();
  console.log(`Faucet chiamato → ${deployer.address}`);

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║         INDIRIZZI DA COPIARE IN frontend/.env.local      ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  NEXT_PUBLIC_USDT_ADDRESS=${usdtAddress}`);
  console.log(`║  NEXT_PUBLIC_ESCROW_ADDRESS=${escrowAddress}`);
  console.log(`║  NEXT_PUBLIC_ORACLE_ADDRESS=${oracleAddress}`);
  console.log(`║  NEXT_PUBLIC_TREASURY_ADDRESS=${treasuryAddress}`);
  console.log(`║  NEXT_PUBLIC_VAULT_FACTORY_ADDRESS=${vaultFactoryAddress}`);
  console.log("╚══════════════════════════════════════════════════════════╝");

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║         VARIABILI DA COPIARE IN backend (.env)           ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  VAULT_FACTORY_ADDRESS=${vaultFactoryAddress}`);
  console.log(`║  KEEPER_PRIVATE_KEY=<chiave privata del wallet keeper — NON committare>`);
  console.log("╚══════════════════════════════════════════════════════════╝");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
