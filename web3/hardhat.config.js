require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: 'cancun', // required for transient storage (TSTORE/TLOAD), live on Arbitrum since ArbOS 32
    },
  },
  networks: {
    hardhat: {},
    arbitrumSepolia: {
      url:      process.env.ARB_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId:  421614,
    },
  },
  etherscan: {
    apiKey: {
      arbitrumSepolia: process.env.ARBISCAN_API_KEY || '',
    },
    customChains: [
      {
        network:   'arbitrumSepolia',
        chainId:   421614,
        urls: {
          apiURL:    'https://api-sepolia.arbiscan.io/api',
          browserURL:'https://sepolia.arbiscan.io',
        },
      },
    ],
  },
};
