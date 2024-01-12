import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import {
  developmentChains,
  networkConfig,
} from "../helpers/hardhat-network-config";
import { ethers, network } from "hardhat";
import { VRFCoordinatorV2Mock } from "../typechain-types";
import { EventLog } from "ethers";

const deployRaffleContract: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment
) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  let vrfCoordinatorV2Address;
  let subscriptionId: string;

  // deploy mocks for development
  if (developmentChains.includes(network.name)) {
    const vrfCoordinatorV2Mock: VRFCoordinatorV2Mock = await ethers.getContract(
      "VRFCoordinatorV2Mock"
    );
    vrfCoordinatorV2Address = await vrfCoordinatorV2Mock.getAddress();

    // mock subscription id
    const subscription = await vrfCoordinatorV2Mock.createSubscription();
    const receipt = await subscription.wait(1);
    subscriptionId = (receipt!.logs[0] as EventLog).args.subId;

    // fund subscription
    await vrfCoordinatorV2Mock.fundSubscription(
      subscriptionId,
      ethers.parseEther("2")
    );
  } else {
    vrfCoordinatorV2Address =
      networkConfig[network.config.chainId!].vrfCoordinatorV2Address;
    subscriptionId = networkConfig[network.config.chainId!].subscriptionId;
  }

  log("Deploying Raffle contract...");

  const raffle = await deploy("Raffle", {
    from: deployer,
    args: [
      vrfCoordinatorV2Address,
      networkConfig[network.config.chainId!].gasLaneKeyHash,
      subscriptionId,
      networkConfig[network.config.chainId!].callbackGasLimit,
      networkConfig[network.config.chainId!].interval,
      networkConfig[network.config.chainId!].ticketPrice,
    ],
    log: true,
    waitConfirmations:
      networkConfig[network.config.chainId!].blockConfirmations,
  });

  log("Raffle deployed to:", raffle.address);

  if (developmentChains.includes(network.name)) {
    const vrfCoordinatorV2Mock: VRFCoordinatorV2Mock = await ethers.getContract(
      "VRFCoordinatorV2Mock"
    );
    vrfCoordinatorV2Mock.addConsumer(subscriptionId, raffle.address);
  } else {
    // verify the contract on etherscan
    log("Verifying contract on Etherscan...");

    await hre.run("verify:verify", {
      address: raffle.address,
      constructorArguments: [
        vrfCoordinatorV2Address,
        networkConfig[network.config.chainId!].gasLaneKeyHash,
        subscriptionId,
        networkConfig[network.config.chainId!].callbackGasLimit,
        networkConfig[network.config.chainId!].interval,
        networkConfig[network.config.chainId!].ticketPrice,
      ],
    });

    log("Contract verified!");
  }
  log(
    "----------------------------------------------------------------------------"
  );
};

export default deployRaffleContract;
deployRaffleContract.tags = ["all", "raffle"];
