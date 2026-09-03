# Changelog

All notable changes to Sanctum Merchant are documented in this file.

## [Unreleased]

### Added

- Per-merchant saved filters (source, types, rarities, formula, restock mode, chat mode) on the actor or unlinked token.
- **Add** vs **Replace** restock mode.
- **Roll Stock** preview: uncheck items, then **Confirm Stock**.
- Restock chat modes: Off, Summary, or Full list.

### Changed

- Stock and clear always target one live merchant: open Item Piles window, else the controlled token’s actor (unlinked tokens included).
- Opening Stock Merchant focuses an existing window instead of stacking another.

### Fixed

- Stock Merchant, import manager, and tag audit windows scroll inside a fixed height so footer buttons stay visible without resizing.

## [1.1.1] - 2026-09-02

### Added

- Option to skip the restock whisper: **Send Restock Message** in module settings and the Stock Merchant dialog (GitHub issue #14).

## [1.1.0] - 2026-09-02

### Foundry VTT

- Verified for Foundry Virtual Tabletop **Version 14 Stable (Build 367)**.
- Compatibility is now `minimum: 13`, `verified: 14`.
- Removed the `maximum: 13` cap that Foundry’s V14 sidegrade had written into `module.json` (that field blocked the module from loading on V14).
- Item Piles is declared as an optional module relationship.

### Changed

- Config, import-manager, and rarity-audit windows now use Application V2 `DialogV2` instead of the deprecated V1 `Dialog`.
- Replaced jQuery DOM usage with native DOM APIs.
- Actors-tab **Stock Merchant** button injects into `ui.actors` / `.header-actions` (no 500ms retry loop).
- Item Piles **Stock Merchant** button is added through `getMerchantAppHeaderButtons` instead of scraping the Svelte header.
- Dice rolls use `await new Roll(formula).evaluate()` (the `{ async: true }` option is gone in V14).
- Verbose debug logging is off by default; enable with `game.sanctumMerchant.toggleDebug()`.

### Fixed

- Console spam from deprecated Dialog/jQuery access and the Actors-tab injector retry loop on Foundry 13/14.
- Merchant detection no longer treats every actor sheet as an Item Piles merchant when the Item Piles API is missing.

### Notes

- Requires Foundry V13+. Foundry V11/V12 are no longer supported.
- Full merchant stocking still works best with [Item Piles](https://foundryvtt.com/packages/item-piles) enabled.
- If the module does not appear after updating, enable **Sanctum Merchant** in Manage Modules and reload the world.

## [1.0.0] - 2025-09-26

- Initial public release with Item Piles integration, rarity presets, JSON import, and tag audit tools.
