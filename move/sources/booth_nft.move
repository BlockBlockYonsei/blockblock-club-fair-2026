module blockblock::booth_nft {
    use std::string::{Self, String};
    use sui::display;
    use sui::event;
    use sui::object::{Self, ID, UID};
    use sui::package;
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    const E_NOT_ADMIN: u64 = 1;
    const E_SOLD_OUT: u64 = 3;
    const E_PAUSED: u64 = 4;
    const E_MAX_SUPPLY_ZERO: u64 = 5;

    public struct BOOTH_NFT has drop {}

    public struct MintConfig has key {
        id: UID,
        admin: address,
        max_supply: u64,
        minted: u64,
        paused: bool,
    }

    public struct BoothNFT has key, store {
        id: UID,
        name: String,
        image_url: String,
        minter: address,
        mint_number: u64,
    }

    public struct MintedEvent has copy, drop {
        minter: address,
        nft_id: ID,
        mint_number: u64,
    }

    fun init(otw: BOOTH_NFT, ctx: &mut TxContext) {
        let keys = vector[
            string::utf8(b"name"),
            string::utf8(b"description"),
            string::utf8(b"image"),
            string::utf8(b"project_url"),
            string::utf8(b"creator"),
            string::utf8(b"link"),
        ];

        let values = vector[
            string::utf8(b"{name}"),
            string::utf8(b"BlockBlock booth commemorative NFT"),
            string::utf8(b"{image_url}"),
            string::utf8(b"https://blockblock-club-fair-2026.onrender.com"),
            string::utf8(b"BlockBlock Booth"),
            string::utf8(b"https://blockblock-club-fair-2026.onrender.com"),
        ];

        let publisher = package::claim(otw, ctx);
        let mut nft_display = display::new_with_fields<BoothNFT>(&publisher, keys, values, ctx);
        display::update_version(&mut nft_display);

        transfer::public_transfer(publisher, tx_context::sender(ctx));
        transfer::public_transfer(nft_display, tx_context::sender(ctx));
    }

    public entry fun create_mint_config(max_supply: u64, ctx: &mut TxContext) {
        assert!(max_supply > 0, E_MAX_SUPPLY_ZERO);

        let config = MintConfig {
            id: object::new(ctx),
            admin: tx_context::sender(ctx),
            max_supply,
            minted: 0,
            paused: false,
        };

        transfer::share_object(config);
    }

    public entry fun mint(config: &mut MintConfig, name: String, image_url: String, ctx: &mut TxContext) {
        let sender = tx_context::sender(ctx);

        assert!(!config.paused, E_PAUSED);
        assert!(config.minted < config.max_supply, E_SOLD_OUT);
        config.minted = config.minted + 1;

        let nft = BoothNFT {
            id: object::new(ctx),
            name,
            image_url,
            minter: sender,
            mint_number: config.minted,
        };

        event::emit(MintedEvent {
            minter: sender,
            nft_id: object::id(&nft),
            mint_number: config.minted,
        });

        transfer::public_transfer(nft, sender);
    }

    public entry fun set_paused(config: &mut MintConfig, paused: bool, ctx: &TxContext) {
        assert_admin(config, ctx);
        config.paused = paused;
    }

    public fun minted_count(config: &MintConfig): u64 {
        config.minted
    }

    public fun max_supply(config: &MintConfig): u64 {
        config.max_supply
    }

    public fun is_paused(config: &MintConfig): bool {
        config.paused
    }

    fun assert_admin(config: &MintConfig, ctx: &TxContext) {
        assert!(tx_context::sender(ctx) == config.admin, E_NOT_ADMIN);
    }
}
