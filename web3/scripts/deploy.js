require('dotenv').config();
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  // On a real network use env vars; fall back to deployer for local testing.
  const treasuryAddress = process.env.TREASURY_ADDRESS || deployer.address;
  const oracleAddress   = process.env.ORACLE_ADDRESS   || deployer.address;

  console.log("Deployer:", deployer.address);
  console.log("Treasury:", treasuryAddress);
  console.log("Oracle:  ", oracleAddress);

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

  // 3. Chiama faucet per ottenere USDT di test (1000 USDT al deployer)
  await usdt.faucet();
  console.log(`Faucet chiamato → ${deployer.address}`);

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║         INDIRIZZI DA COPIARE IN frontend/.env.local      ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  NEXT_PUBLIC_USDT_ADDRESS=${usdtAddress}`);
  console.log(`║  NEXT_PUBLIC_ESCROW_ADDRESS=${escrowAddress}`);
  console.log(`║  NEXT_PUBLIC_ORACLE_ADDRESS=${oracleAddress}`);
  console.log(`║  NEXT_PUBLIC_TREASURY_ADDRESS=${treasuryAddress}`);
  console.log("╚══════════════════════════════════════════════════════════╝");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
