# Changelog

All notable changes to Sanctum Merchant are documented in this file.

## [Unreleased]

## [1.3.0] - 2026-09-04

### Added

- Custom collections persist in the world (import JSON or add items by hand). Manage, rename, and export them.
- **Add item** form: name, type, rarity, optional price, and an image picker (browse or upload).
- **Stock on merchant** puts a custom item on the current shop without rolling.
- Pick existing collection items and **Stock selected** or **Stock all** onto the current merchant.
- Edit or delete items already in a custom collection.
- **Discard Roll** clears the rolled preview without closing Stock Merchant.
- Item Source shows a preview of item count, types, rarities, and example names.
- Custom collections sections collapse and expand with a clear chevron and “Click to expand/collapse”.
- Live match count under filters shows how many items would roll before you click Roll Stock.
- **Shop profiles**: General store, Alchemist, Blacksmith, and Fence fill types, rarities, formula, restock mode, and chat in one click.
- **Add vs Replace** on the rolled stock panel, next to Discard Roll. The world setting is only the default.
- JSON collection **template**: insert, copy, or download a starter file.
- JSON import **preview** before save: counts, types, rarities, skipped rows, then new collection or merge.
- Double-click a rolled item or a custom collection item to open its full item sheet.
- Price shows on rolled stock rows and custom collection rows.
- Custom item **currency** dropdown: CP, SP, EP, GP, PP. JSON import/export keeps `priceDenomination`.

### Changed

- Default item source is empty. Stock Merchant uses the merchant’s saved source, else last used, else the first Item pack — not the Oathbreaker DDB pack.
- JSON import accepts `{ "name", "items" }`, a bare item array, a single item, or Foundry `results` dumps. Export matches the template (no `_id`).

### Fixed

- Deleting or renaming a custom collection no longer closes Stock Merchant.
- Item Source preview shows again after selecting a pack (it was writing into the hidden JSON import box).

## [1.2.0] - 2026-09-03

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
- The Stock Merchant target line updates when you select a token, click an actor, or open an Item Piles merchant while the window is already open.
- Opening Stock Merchant from an Item Piles header uses that merchant when several shop windows are open, instead of the first one found.
- **Reset to Default** clears the active merchant’s saved filters as well as world defaults.
- `populateMerchantWithJSON` keeps the previous default types, rarities, formula, and merchant message when those options are omitted.
- Confirm Stock saves the filters that produced the preview; changing source, types, rarities, or formula clears the preview so a new roll is required.
- Replace restock restores the previous inventory if the new items fail to add.

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
