<img width="1536" height="1024" alt="Cover photo of a fan" src="https://github.com/user-attachments/assets/fc63535d-3be2-4cc9-8f48-22dbbcb85074" />

# Sanctum Merchant

Like my work? Buy me a coffee!
<br/>
[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/W7W31LXJ6F)

[![Foundry Version](https://img.shields.io/badge/foundry-v13+-blue)](https://foundryvtt.com/)
![Static Badge](https://img.shields.io/badge/Foundry%20Verified%20Version-14-14?color=rgb(255%2C0%2C0))
![Static Badge](https://img.shields.io/badge/Latest_Release-1.1.1-0?color=rgb(0%2C0%2C255))
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

A merchant stocking system with Item Piles integration for Foundry VTT. Automate shop inventories with rarity filtering, roll-based quantities, and items from compendiums or pasted JSON.

**Current release: 1.1.1** — verified on Foundry Virtual Tabletop **Version 14 Stable (Build 367)**. See the [changelog](CHANGELOG.md).

### What's new

- **Unreleased** — per-merchant saved shops, add vs replace restock, roll-then-confirm preview, and restock chat Off / Summary / Full.
- **1.1.1** — optional silent restocks.
- **1.1.0** — Foundry **V14** support (Application V2 dialogs, Actors-tab button, Item Piles header button).

<img width="1072" height="795" alt="image" src="https://github.com/user-attachments/assets/bf8e3f14-d507-4f0d-ba27-2564ba34123d" />
*Screenshot: Sanctum Merchant configuration dialog with an Item Piles merchant window*

## Features

### Stock Merchant button on the Actors tab

- **Stock NPC and player characters**: the **Stock Merchant** button appears in the Actors directory header on the right-hand sidebar.

  <img width="299" height="61" alt="image" src="https://github.com/user-attachments/assets/26b1fafa-386c-4870-8d8d-151bf3b9c31c" />

### Item Piles integration

- **Header button**: **Stock Merchant** appears on Item Piles merchant windows next to Open Sheet / Show To Players.
- **Automatic detection**: uses the Item Piles API to recognize merchant piles and controlled tokens.
- **Native add/remove**: stocks and clears inventory through `game.itempiles.API.addItems` / `removeItems`.

<img width="1888" height="795" alt="image" src="https://github.com/user-attachments/assets/ebbb5e60-bc99-45a9-83a8-5b86cc3a9cec" />
*Screenshot: Stock Merchant button in the Item Piles merchant header*

### Flexible item sourcing

- **Compendiums**: stock from any Foundry Item pack.
- **JSON import**: paste a custom collection (kept in memory for 24 hours).
- **Dynamic types**: item types are read from the selected source.
- **Last source remembered**: world settings store your last compendium and filters.

<img width="1073" height="404" alt="image" src="https://github.com/user-attachments/assets/215fde93-a9d9-4fe5-835c-226105b4546c" />
*Screenshot: JSON import interface*

### Filtering

- **Item types**: weapons, equipment, consumables, loot, containers, tools, and any types the source provides.
- **Rarity tags**: common through legendary, plus campaign tags (exotic, cursed, forged, sanctum-blessed).
- **Strict vs loose**: exact rarity match, or all items with matching rarities weighted higher.
- **Roll formula**: dice notation such as `1d6+2` for how many items to stock.
- **Silent restock**: turn off **Send Restock Message** if you do not want a chat whisper when shops refresh.

<img width="1031" height="252" alt="image" src="https://github.com/user-attachments/assets/78348617-2d09-4673-9cb2-e0694186b468" />
<img width="1055" height="185" alt="image" src="https://github.com/user-attachments/assets/73a6f5d5-5113-4369-9987-14801ca5d910" />
<img width="1040" height="198" alt="image" src="https://github.com/user-attachments/assets/240dbd59-fccf-4554-950c-2e4ccc561ee0" />
<img width="1041" height="267" alt="image" src="https://github.com/user-attachments/assets/14018d56-6397-4fb7-a955-7dc8ae092b24" />
*Screenshot: filtering and rarity selection*

### Rarity presets

- **Starter Gear**: common and uncommon
- **Legendary Vault**: legendary, very rare, sanctum-blessed
- **Exotic Bazaar**: rare, exotic, sanctum-blessed
- **Cursed Curiosities**: cursed, forged, rare
- **Chaos Stock**: mixed rarities

### Audit tools

- Group a source’s items by detected rarity
- Stock one item or an entire rarity group
- Filter the audit list by name

<img width="695" height="595" alt="image" src="https://github.com/user-attachments/assets/46a9255c-1cf0-4cdf-95af-ee7862cd4537" />
<img width="701" height="453" alt="image" src="https://github.com/user-attachments/assets/3601b61f-b2fe-48aa-9710-1aaeb0fb9983" />
<img width="699" height="598" alt="image" src="https://github.com/user-attachments/assets/04384f03-7b75-4688-aab5-bc556a008e3f" />
*Screenshot: tag audit organized by rarity*

## Installation

### Manifest URL

1. In Foundry, open **Add-on Modules**.
2. Click **Install Module**.
3. Search for **Sanctum Merchant**, or paste this Manifest URL:

```
https://github.com/Snelly87/Sanctum-Merchant/releases/latest/download/module.json
```

4. Click **Install**, then enable the module in your world.

If you already had 1.0.0 installed and it disappeared after moving to Foundry 14, install 1.1.1 from that URL and enable **Sanctum Merchant** again in Manage Modules.

### Manual install

Clone or copy the `sanctum-merchant` folder into Foundry’s `Data/modules` directory, then enable it in the world.

### Requirements

- **Foundry VTT**: 13 or higher (verified on 14.367)
- **Optional**: [Item Piles](https://foundryvtt.com/packages/item-piles) — needed for merchant windows and the header Stock button
- **Game systems**: system-agnostic; works with any system Item Piles supports (including D&D 5e)

## Usage

1. Select an Item Piles merchant token, or open its merchant window.
2. Click **Stock Merchant** on the Actors tab or in the Item Piles window header.
3. Choose a source, item types, rarity tags or a preset, restock mode (add or replace), chat mode, and a roll formula.
4. Click **Roll Stock**. Uncheck any items you do not want, then **Confirm Stock**.
5. Filters are saved on that merchant. Use **Clear Inventory** to empty it, or **Audit Tags** to stock specific items.

### Filtering

- **Item Types**: categories to include
- **Rarity Tags / Presets**: which rarities to pull
- **Strict Mode**: on = only those rarities; off = all items, with matching rarities favored
- **Roll Formula**: how many items to add (for example `1d6+2`)

Items already on the merchant (same name) are not added again when using the direct fallback path.

### JSON import format

```json
{
  "name": "Custom Collection Name",
  "items": [
    {
      "_id": "unique-item-id",
      "name": "Magic Sword",
      "type": "weapon",
      "system": {
        "rarity": "rare",
        "description": {
          "value": "<p>A gleaming magical blade...</p>"
        }
      },
      "img": "icons/weapons/swords/sword-magic-glowing.webp"
    }
  ]
}
```

JSON collections live in memory only and are removed after 24 hours.

### Settings

<img width="777" height="679" alt="image" src="https://github.com/user-attachments/assets/630c9eb4-9398-4682-8b1e-4e9b334ea589" />
*Screenshot: module settings*

**Configure Settings → Module Settings → Sanctum Merchant**

- **Default Compendium**
- **Default Roll Formula**
- **Allowed Item Types**
- **Strict Rarity Filtering**
- **Default Restock Mode**: add to stock, or replace (clear then add)
- **Restock Chat**: Off, Summary, or Full list of item names
- **Merchant Message** (used for Summary and Full chat modes)

## API

```javascript
game.sanctumMerchant

await game.sanctumMerchant.populateMerchantWithJSON({
  source: "compendium-id-or-json-collection-id",
  sourceType: "compendium", // or "json"
  rollFormula: "1d6+2",
  allowedTypes: ["weapon", "equipment"],
  rareTags: ["common", "uncommon"],
  strictRarity: true,
  merchantMessage: "New stock has arrived!",
  restockChatMode: "summary", // "off" | "summary" | "full"
  restockMode: "replace" // "add" | "replace"
});

const result = await game.sanctumMerchant.JSONImportManager.importJSON(jsonData);

await game.sanctumMerchant.auditTags();
```

Export samples from the current source (downloads a JSON file):

```javascript
const data = await game.sanctumMerchant.exportItemsByRarity({ samplesPerRarity: 2 });
console.log(JSON.stringify(data, null, 2));

game.sanctumMerchant.quickExport();
game.sanctumMerchant.fullExport();
```

## Debugging

In the browser console (F12):

```javascript
game.sanctumMerchant.toggleDebug();
```

That turns verbose Sanctum Merchant logging on or off. On load you should see:

```
Sanctum Merchant | Script loaded
Sanctum Merchant | Ready. Toggle debug with game.sanctumMerchant.toggleDebug()
```

## Compatibility

### Foundry versions

| | |
|---|---|
| **Minimum** | 13 |
| **Verified** | 14.367 |
| **Not supported** | 11 and 12 |

### Game systems

System-agnostic. Tested with D&D 5e.

### Known issues

- JSON collections are temporary (24 hours).
- Very large packs (1000+ items) can take a moment to filter.
- Unlinked merchant tokens stock the **token actor** (what Item Piles sells). The world actor sheet can look empty even when the merchant window is full.

## Changelog

- **[Unreleased](CHANGELOG.md)** — per-merchant shops, preview, add/replace, chat modes
- **[1.1.1](CHANGELOG.md)** — silent restock option
- **[1.1.0](CHANGELOG.md)** — Foundry V14 compatibility

Full notes: [CHANGELOG.md](CHANGELOG.md).

## License

MIT — see [LICENSE](LICENSE).

## Credits

- Built for [Foundry Virtual Tabletop](https://foundryvtt.com/)
- Integrates with [Item Piles](https://foundryvtt.com/packages/item-piles) by Fantasy Computerworks
- Icons from [Font Awesome](https://fontawesome.com/)

## Support

- **Issues**: [GitHub Issues](https://github.com/Snelly87/Sanctum-Merchant/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Snelly87/Sanctum-Merchant/discussions)
- **Discord**: [Foundry VTT Discord](https://discord.gg/foundryvtt) — #modules-troubleshooting
