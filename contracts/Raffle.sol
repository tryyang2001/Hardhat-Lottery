// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/vrf/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/automation/interfaces/AutomationCompatibleInterface.sol";

/**
 * @title Raffle
 * @dev Raffle contract that does the following:
 *   1. allow users to buy tickets for a raffle
 *   2. automatically select a winner from a list of participants, totally random and verifiable.
 *   3. allow users to withdraw their funds
 */
contract Raffle is VRFConsumerBaseV2, AutomationCompatibleInterface {
    enum RaffleState {
        OPEN,
        CALCULATING_WINNER
    }

    uint256 private immutable i_ticketPrice;
    address payable[] private s_participants;

    // chainlink VRF variables
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    bytes32 private immutable i_gasLaneKeyHash;
    uint64 private immutable i_subscriptionId;
    uint16 private constant REQUEST_CONFIRMATIONs = 3;
    uint32 private immutable i_callbackGasLimit;
    uint32 private constant NUM_WORDS = 1;

    address private s_recentWinner;
    RaffleState private s_raffleState;

    // chainlink automation variables
    uint256 private s_previousTimestamp;
    uint256 private immutable i_interval;

    // event on received ticket purchase
    event TicketPurchase(address indexed buyer, uint256 amount);
    event RandomNumberRequested(uint256 requestId);
    event WinnerAnnounced(address indexed winner);

    constructor(address vrfCoordinatorV2, bytes32 keyHash, uint64 subscriptionId, uint32 callbackGasLimit, uint256 interval, uint256 ticketPrice) VRFConsumerBaseV2(vrfCoordinatorV2) {
        // set ticket price
        i_ticketPrice = ticketPrice;

        // set chainlink VRF variables
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_gasLaneKeyHash = keyHash;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;

        // set interval
        s_previousTimestamp = block.timestamp;
        i_interval = interval;

        // initial state should be OPEN
        s_raffleState = RaffleState.OPEN;
    }

    function buyTicket() public payable onlyOpenState {
        require(msg.value == i_ticketPrice, "Raffle: ticket price is not correct");
        s_participants.push(payable(msg.sender));

        // emit event on received ticket purchase
        emit TicketPurchase(msg.sender, msg.value);
    }

    /**
     * @dev Callback function used by VRF Coordinator
     */
    function fulfillRandomWords(uint256, uint256[] memory randomWords) internal override {
        // select winner based on the random number
        uint256 winnerIndex = randomWords[0] % s_participants.length;
        address payable winner = s_participants[winnerIndex];
        s_recentWinner = winner;

        // set raffle state back to OPEN after winner is selected
        s_raffleState = RaffleState.OPEN;

        // clean up participants array
        delete s_participants;

        // update previous timestamp
        s_previousTimestamp = block.timestamp;

        // transfer credits to the winner
        (bool success,) = winner.call{value: address(this).balance}("");
        require(success, "Raffle: failed to transfer credits to the winner");

        emit WinnerAnnounced(winner);
    }

    /**
     * @dev Callback function used by Chainlink Automation to check if upkeep is needed
     */
    function checkUpkeep(bytes memory /*checkData*/) public view override returns(bool upkeepNeeded, bytes memory /*performData*/) {
        // check if raffle is open
        bool isOpen = s_raffleState == RaffleState.OPEN;
        
        // check if time interval has reached
        bool isTimePassed = block.timestamp - s_previousTimestamp >= i_interval;

        // check if there is at least 1 participant
        bool hasParticipants = s_participants.length > 0;

        // check if contract balance is not empty
        bool hasBalance = address(this).balance > 0;

        return isOpen && isTimePassed && hasParticipants && hasBalance ? (true, bytes("")) : (false, bytes(""));
    }

    /**
     * @dev Callback function used by Chainlink Automation to perform action when upkeep is needed
     */
    function performUpkeep(bytes calldata /*performData*/) external override {
        (bool triggerByCheckUpkeep, ) = checkUpkeep("");
        require(triggerByCheckUpkeep, "Raffle: upkeep not triggered by checkUpkeep");

        // set raffle state to CALCULATING_WINNER
        s_raffleState = RaffleState.CALCULATING_WINNER;

        // request random number from chainlink VRF
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLaneKeyHash,
            i_subscriptionId,
            REQUEST_CONFIRMATIONs,
            i_callbackGasLimit,
            NUM_WORDS
        );

        // emit the event on random number requested
        emit RandomNumberRequested(requestId);
    }

    // getter
    function getTicketPrice() public view returns (uint256) {
        return i_ticketPrice;
    }

    function getParticipant(uint256 index) public view returns (address payable) {
        return s_participants[index];
    }

    function getNumberOfParticipants() public view returns (uint256) {
        return s_participants.length;
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function getRaffleState() public view returns (RaffleState) {
        return s_raffleState;
    }

    function getPreviousTimestamp() public view returns (uint256) {
        return s_previousTimestamp;
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }

    function getSubscriptionId() public view returns (uint64) {
        return i_subscriptionId;
    }

    function getNumberOfWords() public pure returns (uint32) {
        return NUM_WORDS;
    }

    function getRequestConfirmations() public pure returns (uint16) {
        return REQUEST_CONFIRMATIONs;
    }

    // modifier
    modifier onlyOpenState() {
        require(s_raffleState == RaffleState.OPEN, "Raffle: raffle is not open");
        _;
    }
}