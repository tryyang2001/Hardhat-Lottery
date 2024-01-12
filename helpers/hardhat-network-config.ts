import { ethers } from "ethers";

interface NetworkConfigItem {
  name: string;
  blockConfirmations: number;
  vrfCoordinatorV2Address?: string;
  ticketPrice: bigint;
  gasLaneKeyHash: string;
  subscriptionId: string;
  callbackGasLimit: number;
  interval: number; //in seconds
}

interface NetworkConfig {
  [networkId: number]: NetworkConfigItem;
}

export const networkConfig: NetworkConfig = {
  11155111: {
    name: "sepolia",
    blockConfirmations: 1,
    vrfCoordinatorV2Address: "0x8103B0A8A00be2DDC778e6e7eaa21791Cd364625",
    ticketPrice: ethers.parseEther("0.01"),
    gasLaneKeyHash:
      "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c",
    subscriptionId: "8449",
    callbackGasLimit: 500000,
    interval: 60,
  },
  31337: {
    name: "hardhat",
    blockConfirmations: 1,
    ticketPrice: ethers.parseEther("0.01"),
    gasLaneKeyHash:
      "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c",
    subscriptionId: "0", //fake subscription id
    callbackGasLimit: 500000,
    interval: 30,
  },
};

export const developmentChains = ["hardhat", "localhost", "ganache"];
