# 🛒 Sanctum Merchant

A Foundry VTT module that dynamically stocks merchant actors with items from compendiums or custom JSON sources. Perfect for campaigns that want immersive, randomized shops without manual inventory management.

---

## ✨ Features

* Stock merchants from **compendiums** or **custom JSON files**.
* Configurable rarity filtering and strictness.
* Randomized inventory with guaranteed fallback items.
* Adjustable roll formula for number of stocked items (default: `1d6+2`).
* Adds a **Stock Merchant** button directly on merchant actor sheets.
* Saves last-used merchant source for convenience.

---

## 📦 Installation

1. Download or clone this repository into your Foundry VTT `modules` folder.
2. Enable **Sanctum Merchant** in your world’s module settings.
3. (Optional) Add JSON item files in your module’s `data` folder to extend available items.

---

## 🚀 Usage

1. Open any **merchant actor sheet**.
2. Click the **Stock Merchant** button.
3. In the config dialog:

   * Select source (compendium or JSON).
   * Adjust rarity/strictness if desired.
   * Confirm.
4. The merchant’s inventory will be automatically populated.

---

## ⚙️ Configuration

### Settings

* **Default Compendium**: Used when no source is selected.
* **Last Source**: Remembers your most recent merchant source.

### Options in Config Dialog

* **Source**: Compendium or JSON import.
* **Strict Rarity**: Enforces exact rarity match instead of lenient filtering.
* **Rarity Tags**: Defines which tags (e.g., `rare`, `legendary`, `exotic`) should be considered.
* **Allowed Types**: Filters items by type (default: `weapon`, `consumable`, `equipment`, `loot`).

---

## 📂 JSON Imports

You can stock merchants with custom JSON files. The `JSONImportManager` ensures your data matches Foundry’s expected item format:

```json
{
  "_id": "unique-id",
  "name": "Example Item",
  "type": "loot",
  "img": "icons/svg/item-bag.svg",
  "system": {
    "price": 100
  }
}
```

* Missing fields will be normalized with defaults.
* Example fallback: `name: "Unknown Item"`, `type: "loot"`, `price: 0`.

---

## 🔧 Developer Breakdown

### Initialization & Settings

* Registers Foundry settings for default compendium and last used source.

### JSON Import Manager

* Loads and normalizes external JSON files into Foundry-compatible items.

### Merchant Stocking Logic

* Randomly selects items from a source using roll formulas.
* Ensures at least one **common fallback item** is stocked.

### Merchant Source Helpers

* Builds list of compendiums + JSON imports for the config dialog.

### Config Dialog

* Lets users configure stocking options and confirm stocking.

### UI Injection

* Adds a **Stock Merchant** button directly on merchant sheets.

### Utilities

* Implements shuffle logic for randomized inventories.

---

## 🛠️ Roadmap

* [ ] Weighted rarity options.
* [ ] Price scaling by merchant type or player level.
* [ ] Scheduled automatic restocking.
* [ ] Improved UI for filtering/sorting item lists.

---

## 🐞 Debugging

* Logs important events in the browser console:

  * ✅ Module load confirmation.
  * ⚠️ Warnings for missing sources or empty merchants.

---

## 📸 Screenshots


---

## 📜 License

MIT License. Free to use, modify, and distribute.
