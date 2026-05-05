const { ethers } = require("hardhat");

async function main() {
  const [deployer, treasury, oracle, alice, bob] = await ethers.getSigners();

  console.log("Deployer:", deployer.address);
  console.log("Treasury:", treasury.address);
  console.log("Oracle:  ", oracle.address);

  // 1. Deploy MockUSDT
  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const usdt = await MockUSDT.deploy();
  await usdt.waitForDeployment();
  const usdtAddress = await usdt.getAddress();
  console.log("MockUSDT:", usdtAddress);

  // 2. Deploy BettazooEscrow
  const Escrow = await ethers.getContractFactory("BettazooEscrow");
  const escrow = await Escrow.deploy(usdtAddress, treasury.address, oracle.address);
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log("BettazooEscrow:", escrowAddress);

  // 3. Mint 10.000 USDT (6 decimali) ai primi wallet per testing
  const MINT = ethers.parseUnits("10000", 6);
  for (const wallet of [deployer, alice, bob]) {
    await usdt.mint(wallet.address, MINT);
    console.log(`Minted 10000 USDT → ${wallet.address}`);
  }

  console.log("\n=== INDIRIZZI DA COPIARE IN .env.local ===");
  console.log(`NEXT_PUBLIC_USDT_ADDRESS=${usdtAddress}`);
  console.log(`NEXT_PUBLIC_ESCROW_ADDRESS=${escrowAddress}`);
  console.log(`NEXT_PUBLIC_ORACLE_ADDRESS=${oracle.address}`);
  console.log(`NEXT_PUBLIC_TREASURY_ADDRESS=${treasury.address}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
