require("@nomiclabs/hardhat-waffle");
require("solidity-coverage")
require("hardhat-gas-reporter")
module.exports = {
  defaultNetwork: "hardhat",
  solidity: {
    version: "0.8.4",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000
      }
    }
  },
  gasReporter: {
    enabled: false
  },
  mocha: {
    timeout: 100000
  }
}