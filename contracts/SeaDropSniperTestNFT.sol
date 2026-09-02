// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISeaDropTestnet {
    struct PublicDrop {
        uint80 mintPrice;
        uint48 startTime;
        uint48 endTime;
        uint16 maxTotalMintableByWallet;
        uint16 feeBps;
        bool restrictFeeRecipients;
    }

    function updatePublicDrop(PublicDrop calldata publicDrop) external;
    function updateCreatorPayoutAddress(address payoutAddress) external;
    function updateAllowedFeeRecipient(address feeRecipient, bool allowed) external;
}

/// @notice A deliberately small Sepolia-only fixture for exercising canonical SeaDrop.
/// @dev This is test infrastructure, not an audited production NFT implementation.
contract SeaDropSniperTestNFT {
    string public constant name = "SeaDrop Sniper Sepolia Test";
    string public constant symbol = "SNIPETEST";
    uint256 public constant maxSupply = 100;

    address public immutable owner;
    address public immutable allowedSeaDrop;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) private _numberMinted;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    error OnlyOwner();
    error OnlyAllowedSeaDrop();
    error InvalidAddress();
    error InvalidQuantity();
    error MaxSupplyExceeded();

    constructor(address seaDrop) {
        if (seaDrop == address(0)) revert InvalidAddress();
        owner = msg.sender;
        allowedSeaDrop = seaDrop;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    /// @notice Configures a public stage on the canonical SeaDrop deployment.
    function configurePublicDrop(
        address payoutAddress,
        uint80 mintPrice,
        uint48 startTime,
        uint48 endTime,
        uint16 maxTotalMintableByWallet
    ) external onlyOwner {
        if (payoutAddress == address(0)) revert InvalidAddress();
        if (startTime == 0 || endTime <= startTime || maxTotalMintableByWallet == 0) {
            revert InvalidQuantity();
        }

        ISeaDropTestnet seaDrop = ISeaDropTestnet(allowedSeaDrop);
        seaDrop.updateCreatorPayoutAddress(payoutAddress);
        seaDrop.updateAllowedFeeRecipient(payoutAddress, true);
        seaDrop.updatePublicDrop(
            ISeaDropTestnet.PublicDrop({
                mintPrice: mintPrice,
                startTime: startTime,
                endTime: endTime,
                maxTotalMintableByWallet: maxTotalMintableByWallet,
                feeBps: 0,
                restrictFeeRecipients: true
            })
        );
    }

    /// @notice Called only by SeaDrop after it has validated stage, price, and limits.
    function mintSeaDrop(address minter, uint256 quantity) external {
        if (msg.sender != allowedSeaDrop) revert OnlyAllowedSeaDrop();
        if (minter == address(0)) revert InvalidAddress();
        if (quantity == 0) revert InvalidQuantity();

        uint256 firstTokenId = totalSupply + 1;
        uint256 newTotalSupply = totalSupply + quantity;
        if (newTotalSupply > maxSupply) revert MaxSupplyExceeded();

        // SeaDrop reads these values to enforce limits, so update them before emitting mints.
        totalSupply = newTotalSupply;
        _numberMinted[minter] += quantity;
        balanceOf[minter] += quantity;

        for (uint256 tokenId = firstTokenId; tokenId <= newTotalSupply; ++tokenId) {
            ownerOf[tokenId] = minter;
            emit Transfer(address(0), minter, tokenId);
        }
    }

    function getMintStats(address minter)
        external
        view
        returns (uint256 minterNumMinted, uint256 currentTotalSupply, uint256 configuredMaxSupply)
    {
        return (_numberMinted[minter], totalSupply, maxSupply);
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        if (ownerOf[tokenId] == address(0)) revert InvalidQuantity();
        return "data:application/json,%7B%22name%22%3A%22SeaDrop%20Sniper%20Test%22%7D";
    }

    /// @dev SeaDrop probes its custom INonFungibleSeaDropToken interface through ERC-165.
    /// This permissive response is acceptable only for this isolated testnet fixture.
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId != 0xffffffff;
    }
}
