import { ethers, getNamedAccounts, network } from "hardhat";
import { developmentChains } from "../../helpers/hardhat-network-config";
import { Raffle } from "../../typechain-types";
import { expect } from "chai";

!developmentChains.includes(network.name) &&
  describe("Raffle integration tests", () => {
    let raffleContract: Raffle;
    let raffleAddress: string;
    let ticketPrice: bigint;

    beforeEach(async () => {
      const { deployer } = await getNamedAccounts();
      raffleContract = await ethers.getContract("Raffle", deployer);
      raffleAddress = await raffleContract.getAddress();
      ticketPrice = await raffleContract.getTicketPrice();
    });

    describe("raffle game flow", () => {
      it("should allow buying tickets, when times up, select a random winner, send credits to him, and reset the game states", async () => {
        console.log("Setting up the game...");
        const startingTimestamp = await raffleContract.getPreviousTimestamp();
        const accounts = await ethers.getSigners();

        console.log("Buying tickets...");

        raffleContract.buyTicket({
          value: ethers.parseEther("0.01"),
        });

        // wait here for 20 seconds to ensure ticket buying is done
        await new Promise<void>((resolve, reject) => {
          setTimeout(() => {
            resolve();
          }, 20000);
        });

        // await expect(raffleContract.buyTicket()).to.be.reverted;

        const winnerStartingBalance = await ethers.provider.getBalance(
          accounts[0].address
        );

        console.log("Setting up listener of the WinnerAnnounced event...");

        await new Promise<void>(async (resolve, reject) => {
          raffleContract.once(
            raffleContract.filters.WinnerAnnounced,
            async (winner: string) => {
              console.log("WinnerAnnounced event is fired!");

              const recentWinner = await raffleContract.getRecentWinner();

              expect(recentWinner).to.equal(winner);
              expect(winner).to.equal(accounts[0].address);

              // ensure game states are reset
              const raffleState = await raffleContract.getRaffleState();
              expect(raffleState).to.equal(0);

              const numberOfParticipants =
                await raffleContract.getNumberOfParticipants();
              expect(numberOfParticipants).to.equal(0);

              const newTimestamp = await raffleContract.getPreviousTimestamp();
              expect(newTimestamp).to.greaterThan(startingTimestamp);

              const contractBalance = await ethers.provider.getBalance(
                raffleAddress
              );
              expect(contractBalance).to.equal(0);

              // ensure fund is sent to the winner
              const winnerCurrentBalance = await ethers.provider.getBalance(
                winner
              );
              expect(winnerCurrentBalance).to.greaterThan(
                winnerStartingBalance
              );
              expect(winnerStartingBalance + ticketPrice).to.equal(
                winnerCurrentBalance
              );
              console.log(
                "Test passed! You may press Ctrl + C now to terminate the test."
              );

              resolve();
            }
          );

          // wait for 60 seconds
          await new Promise<void>((resolve, reject) => {
            setTimeout(() => {
              resolve();
            }, 60000);
          });

          // trigger the event
          await raffleContract.emit("WinnerAnnounced", accounts[0].address);
        });
      });
    });
  });
