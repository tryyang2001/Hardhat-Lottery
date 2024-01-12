import { deployments, getNamedAccounts, network, ethers } from "hardhat";
import {
  developmentChains,
  networkConfig,
} from "../../helpers/hardhat-network-config";
import { Raffle, VRFCoordinatorV2Mock } from "../../typechain-types";
import { expect } from "chai";
import { EventLog } from "ethers";

developmentChains.includes(network.name) &&
  describe("Raffle Unit Tests", () => {
    let raffleContract: Raffle;
    let vrfCoordinatorV2Mock: VRFCoordinatorV2Mock;
    let deployer: string;
    let interval: number;

    beforeEach(async () => {
      deployer = (await getNamedAccounts()).deployer;

      await deployments.fixture(["all"]);

      raffleContract = await ethers.getContract("Raffle", deployer);
      vrfCoordinatorV2Mock = await ethers.getContract(
        "VRFCoordinatorV2Mock",
        deployer
      );

      vrfCoordinatorV2Mock.addConsumer(
        await raffleContract.getSubscriptionId(),
        await raffleContract.getAddress()
      );

      const raffleInterval = await raffleContract.getInterval();
      interval = parseInt(raffleInterval.toString());
    });

    describe("constructor", () => {
      it("initializes the raffle contract correctly", async () => {
        const initialRaffleState = await raffleContract.getRaffleState();
        expect(initialRaffleState.toString()).to.equal("0");

        const raffleInterval = await raffleContract.getInterval();
        expect(raffleInterval).to.equal(
          networkConfig[network.config.chainId!].interval
        );

        const raffleTicketPrice = await raffleContract.getTicketPrice();
        expect(raffleTicketPrice).to.equal(
          networkConfig[network.config.chainId!].ticketPrice
        );
      });
    });

    describe("buyTicket", () => {
      it("buys a ticket with the amount paid by the buyer", async () => {
        const ethAmount = ethers.parseEther("0.01");

        expect(await raffleContract.getNumberOfParticipants()).to.equal(0);

        await raffleContract.buyTicket({
          value: ethAmount,
        });

        expect(await raffleContract.getNumberOfParticipants()).to.equal(1);

        const participant = await raffleContract.getParticipant(0);
        expect(participant).to.equal((await getNamedAccounts()).deployer);
      });

      it("emits a TicketPurchase event", async () => {
        const ethAmount = ethers.parseEther("0.01");

        await expect(
          raffleContract.buyTicket({
            value: ethAmount,
          })
        )
          .to.emit(raffleContract, "TicketPurchase")
          .withArgs((await getNamedAccounts()).deployer, ethAmount);
      });

      it("reverts if the amount paid is less than the ticket price", async () => {
        await expect(
          raffleContract.buyTicket({
            value: ethers.parseEther("0.009"),
          })
        ).to.be.revertedWith("Raffle: ticket price is not correct");
      });

      it("reverts if the raffle state is not OPEN", async () => {
        // to change the raffle state to CALCULATING_WINNER, we need time passed, has player, balance not empty
        await setRaffleStateToCalculating(raffleContract, interval);

        await expect(
          raffleContract.buyTicket({
            value: ethers.parseEther("0.01"),
          })
        ).to.be.revertedWith("Raffle: raffle is not open");
      });
    });

    describe("checkUpkeep", () => {
      it("returns true if the raffle satisfies all the conditions", async () => {
        // to satisfy "has players" and "balance not empty"
        await raffleContract.buyTicket({
          value: ethers.parseEther("0.01"),
        });

        // to satisfy time passed
        await network.provider.send("evm_increaseTime", [interval + 1]);
        await network.provider.send("evm_mine", []);

        const { upkeepNeeded } = await raffleContract.checkUpkeep("0x");

        expect(upkeepNeeded).to.equal(true);
      });

      it("returns false if there is no participant in the raffle", async () => {
        // to satisfy time passed
        await network.provider.send("evm_increaseTime", [interval + 1]);
        await network.provider.send("evm_mine", []);

        const { upkeepNeeded } = await raffleContract.checkUpkeep("0x");

        expect(upkeepNeeded).to.equal(false);
      });

      it("returns false if not enough time has passed", async () => {
        await raffleContract.buyTicket({
          value: ethers.parseEther("0.01"),
        });

        const { upkeepNeeded } = await raffleContract.checkUpkeep("0x");

        expect(upkeepNeeded).to.equal(false);
      });

      it("returns false if the raffle state is not open", async () => {
        await setRaffleStateToCalculating(raffleContract, interval);

        const { upkeepNeeded } = await raffleContract.checkUpkeep("0x");

        expect(upkeepNeeded).to.equal(false);
      });
    });

    describe("performUpkeep", () => {
      it("should only be triggered by checkUpkeep", async () => {
        await expect(raffleContract.performUpkeep("0x")).to.be.revertedWith(
          "Raffle: upkeep not triggered by checkUpkeep"
        );
      });

      it("should change the raffle state to CALCULATING_WINNER on triggered by checkUpkeep", async () => {
        await setRaffleStateToCalculating(raffleContract, interval, false);

        const { upkeepNeeded } = await raffleContract.checkUpkeep("0x");

        expect(upkeepNeeded).to.equal(true);

        await raffleContract.performUpkeep("0x");

        expect(await raffleContract.getRaffleState()).to.equal(1);
      });

      it("should emit a RandomNumberRequested event", async () => {
        await setRaffleStateToCalculating(raffleContract, interval, false);

        const { upkeepNeeded } = await raffleContract.checkUpkeep("0x");

        expect(upkeepNeeded).to.equal(true);

        await expect(raffleContract.performUpkeep("0x"))
          .to.emit(raffleContract, "RandomNumberRequested")
          .withArgs((requestId: bigint) => expect(requestId).to.greaterThan(0));
      });
    });

    describe("fullfillRandomWords", () => {
      let raffleAddress: string;
      beforeEach(async () => {
        raffleAddress = await raffleContract.getAddress();
      });

      it("can only be called after performUpkeep", async () => {
        // don't call performUpkeep first
        await setRaffleStateToCalculating(raffleContract, interval, false);

        await expect(
          vrfCoordinatorV2Mock.fulfillRandomWords(0, raffleAddress)
        ).to.be.revertedWith("nonexistent request");
      });

      it("picks a winner, reset the raffle, transfer credits to the winner, and emit a WinnerAnnounced event", async () => {
        // assume we have 3 players
        const accounts = await ethers.getSigners();

        let initialBalance: { [key: string]: bigint } = {};

        accounts.slice(1, 4).forEach(async (account) => {
          await raffleContract.connect(account).buyTicket({
            value: ethers.parseEther("0.01"),
          });

          const balance = await ethers.provider.getBalance(account.address);
          initialBalance[account.address] = balance;
        });

        const startingTimestamp = await raffleContract.getPreviousTimestamp();
        const contractBalance = await ethers.provider.getBalance(raffleAddress);

        await new Promise<void>(async (resolve, reject) => {
          try {
            // to satisfy time passed
            await network.provider.send("evm_increaseTime", [interval + 1]);
            await network.provider.send("evm_mine", []);

            const tx = await raffleContract.performUpkeep("0x");
            const receipt = await tx.wait(1);

            const requestId = (receipt!.logs![1] as EventLog).args![0];

            expect(requestId).to.be.not.null;
            await expect(
              vrfCoordinatorV2Mock.fulfillRandomWords(requestId, raffleAddress)
            )
              .to.emit(raffleContract, "WinnerAnnounced")
              .withArgs(async (winner: string) => {
                try {
                  // check if there is a valid winner
                  const recentWinner = await raffleContract.getRecentWinner();
                  expect(recentWinner).to.equal(winner);

                  const participants = accounts
                    .slice(1, 4)
                    .map((account) => account.address);
                  expect(participants).to.include(winner);

                  // check if the raffle state is reset
                  const raffleState = await raffleContract.getRaffleState();
                  expect(raffleState).to.equal(0); //should be OPEN
                  const numberOfParticipants =
                    await raffleContract.getNumberOfParticipants();
                  expect(numberOfParticipants).to.equal(0); // as new round started, there should be no participants
                  expect(
                    await raffleContract.getPreviousTimestamp()
                  ).to.greaterThan(startingTimestamp); // timestamp should be updated

                  // check if the winner received the credits
                  const winnerBalance = await ethers.provider.getBalance(
                    winner
                  );
                  expect(
                    await ethers.provider.getBalance(raffleAddress)
                  ).to.equal(0);
                  expect(initialBalance[winner] + contractBalance).to.equal(
                    winnerBalance
                  );
                  resolve();
                } catch (error) {
                  reject(error);
                }
              });
          } catch (error) {
            reject(error);
          }
        });
      });
    });
  });

async function setRaffleStateToCalculating(
  raffleContract: Raffle,
  interval: number,
  toPerformUpkeep: boolean = true
) {
  // to satisfy "has players" and "balance not empty"
  await raffleContract.buyTicket({
    value: ethers.parseEther("0.01"),
  });

  // to satisfy time passed
  await network.provider.send("evm_increaseTime", [interval + 1]);
  await network.provider.send("evm_mine", []);

  toPerformUpkeep && (await raffleContract.performUpkeep("0x"));
}
