import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { developmentChains } from "../helpers/hardhat-network-config";
import { ethers, network } from "hardhat";

const BASE_FEE = ethers.parseEther("0.25");
const GAS_PRICE_LINK = 1e9;

const deployMocks: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment
) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log("Detecting network...");

  if (developmentChains.includes(network.name)) {
    log("Detected development network - deploying mocks");

    const vrfCoordinatorV2Mock = await deploy("VRFCoordinatorV2Mock", {
      from: deployer,
      args: [BASE_FEE, GAS_PRICE_LINK],
      log: true,
    });

    log("VRFCoordinatorV2Mock deployed to:", vrfCoordinatorV2Mock.address);
  } else {
    log("Detected non-development network - skipping mocks");
  }
  log(
    "----------------------------------------------------------------------------"
  );
};

export default deployMocks;
deployMocks.tags = ["all", "mocks"];
