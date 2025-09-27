# Sanctum Merchant

Like my work? Buy me a coffee! 
<br/>
[<img alt="alt_text" src="https://github.com/Snelly87/Santum-Merchant/blob/main/docs/images/Screenshot%202025-09-27%20125147.png?raw=true" />](https://ko-fi.com/snelly87)


[![Foundry Version](https://img.shields.io/badge/foundry-v11+-blue)](https://foundryvtt.com/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)


A sophisticated merchant stocking system with seamless Item Piles integration for Foundry VTT. Automate merchant inventory management with intelligent item selection, rarity-based filtering, and flexible sourcing options.

<img width="1072" height="795" alt="image" src="https://github.com/user-attachments/assets/bf8e3f14-d507-4f0d-ba27-2564ba34123d" />
*Screenshot: Sanctum Merchant configuration dialog integrated into Item Piles merchant window*

## Features
### Stock Merchant button on the actors tab
- **Stock NPC and Player Characters**: "Stock Merchant" button appears directly in Actors tab in foundry righthand menu
  <img width="299" height="61" alt="image" src="https://github.com/user-attachments/assets/26b1fafa-386c-4870-8d8d-151bf3b9c31c" />


### Item Piles Integration
- **Seamless Integration**: "Stock Merchant" button appears directly in Item Piles merchant windows
- **Automatic Detection**: Recognizes Item Piles merchants and controlled tokens
- **Native Compatibility**: Works with all Item Piles merchant configurations

<img width="1888" height="795" alt="image" src="https://github.com/user-attachments/assets/ebbb5e60-bc99-45a9-83a8-5b86cc3a9cec" />
*Screenshot: Stock Merchant button in Item Piles interface*

### Flexible Item Sourcing
- **Compendium Support**: Stock from any Foundry item compendium
- **JSON Import**: Import custom item collections with temporary storage
- **Dynamic Type Detection**: Automatically discovers available item types from sources
- **Batch Management**: Handle multiple item sources simultaneously

<img width="1073" height="404" alt="image" src="https://github.com/user-attachments/assets/215fde93-a9d9-4fe5-835c-226105b4546c" />
*Screenshot: JSON import interface with sample data*

### Advanced Filtering System
- **Item Type Filtering**: Select specific categories (weapons, equipment, consumables, etc.)
- **Rarity-Based Selection**: Weighted selection based on item rarity tags
- **Strict vs. Loose Modes**: Choose between exclusive matching or weighted preference
- **Roll-Based Quantities**: Use dice formulas to determine stock amounts

<img width="1031" height="252" alt="image" src="https://github.com/user-attachments/assets/78348617-2d09-4673-9cb2-e0694186b468" />
<img width="1055" height="185" alt="image" src="https://github.com/user-attachments/assets/73a6f5d5-5113-4369-9987-14801ca5d910" />
<img width="1040" height="198" alt="image" src="https://github.com/user-attachments/assets/240dbd59-fccf-4554-950c-2e4ccc561ee0" />
<img width="1041" height="267" alt="image" src="https://github.com/user-attachments/assets/14018d56-6397-4fb7-a955-7dc8ae092b24" />
*Screenshot: Advanced filtering and rarity selection interface*

### Rarity Presets
- **Starter Gear**: Common and uncommon items for new parties
- **Legendary Vault**: High-tier magical items for epic campaigns
- **Exotic Bazaar**: Rare and unique items with special properties
- **Cursed Curiosities**: Dangerous magical items with risk/reward mechanics
- **Chaos Stock**: Random mix across all rarity levels

### Audit and Management Tools
- **Tag Audit System**: Review and categorize items by detected rarity
- **Individual Stocking**: Add specific items directly from audit interface
- **Bulk Operations**: Stock entire rarity categories at once
- **Search and Filter**: Find items within large collections

<img width="695" height="595" alt="image" src="https://github.com/user-attachments/assets/46a9255c-1cf0-4cdf-95af-ee7862cd4537" />
<img width="701" height="453" alt="image" src="https://github.com/user-attachments/assets/3601b61f-b2fe-48aa-9710-1aaeb0fb9983" />
<img width="699" height="598" alt="image" src="https://github.com/user-attachments/assets/04384f03-7b75-4688-aab5-bc556a008e3f" />
*Screenshot: Tag audit system showing items organized by rarity*

## Installation

### Method 1: Manifest URL
1. Open Foundry VTT and navigate to the **Add-on Modules** tab
2. Click **Install Module**
4. Search for Sanctum Merchant and click Install OR
5. Paste the following URL in the **Manifest URL** field:
```
https://github.com/Snelly87/sanctum-merchant/releases/latest/download/module.json
```
4. Click **Install**

### Dependencies
- **Required**: [Item Piles](https://foundryvtt.com/packages/item-piles) module
- **Foundry Version**: v11.315 or higher
- **Game Systems**: System-agnostic (works with any system supported by Item Piles)

## Usage

### Basic Workflow
1. **Open Stock Merchant Window**: Access any configured Item Piles merchant or open by clicking Stock Merchant button on the Actors tab on the foundry interface
2. **Click "Stock Merchant"**: Button appears in the merchant window header and the Sanctum Merchant Window
3. **Configure Options**: Select item source, types, rarities, and quantity formula
4. **Stock Items**: Items are automatically added to merchant inventory
5. **Review Results**: Check chat messages and merchant inventory

#### Item Sources
- **Compendiums**: Select from available item compendiums
- **JSON Collections**: Import and use custom item sets

#### Filtering
- **Item Types**: Choose which item categories to include
- **Rarity Tags**: Select target rarity levels
- **Strict Mode**: Enable for exact rarity matching, disable for weighted selection

#### Quantity Control
- **Roll Formula**: Use dice notation (e.g., "1d6+2") to determine stock amounts
- **Duplicate Prevention**: Automatically excludes items already in merchant inventory

### JSON Import Format

Custom item collections can be imported using this JSON structure:

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

### Settings

<img width="777" height="679" alt="image" src="https://github.com/user-attachments/assets/630c9eb4-9398-4682-8b1e-4e9b334ea589" />
*Screenshot: Module settings configuration*

Access module settings through Foundry's **Configure Settings** > **Module Settings**:

- **Default Compendium**: Primary source for item selection
- **Default Roll Formula**: Quantity determination formula
- **Allowed Item Types**: Default item categories to include
- **Strict Rarity Filtering**: Default filtering behavior
- **Merchant Message**: Custom text for player notifications

## API

### Public Methods

```javascript
// Access the main API
game.sanctumMerchant

// Stock merchant programmatically
await game.sanctumMerchant.populateMerchantWithJSON({
  source: "compendium-id-or-json-collection-id",
  sourceType: "compendium", // or "json"
  rollFormula: "1d6+2",
  allowedTypes: ["weapon", "equipment"],
  rareTags: ["common", "uncommon"],
  strictRarity: true,
  merchantMessage: "New stock has arrived!"
});

// Import JSON collection
const result = await game.sanctumMerchant.JSONImportManager.importJSON(jsonData);

// Audit rarity tags
await game.sanctumMerchant.auditTags();
```

### Hooks

The module fires the following hooks for integration:

```javascript
// Before stocking merchant
Hooks.on("sanctumMerchant.preStock", (merchant, items) => {
  // Your code here
});

// After stocking merchant
Hooks.on("sanctumMerchant.postStock", (merchant, items, success) => {
  // Your code here
});
```

## Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/Snelly/sanctum-merchant.git
cd sanctum-merchant

# Install dependencies (if any)
npm install

# Build the module (if applicable)
npm run build
```

### Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Debugging

Enable debug mode in browser console:
```javascript
game.sanctumMerchant.debugMode = true;
```

### Testing

The module includes extensive console logging for troubleshooting:
- Item filtering and selection processes
- Merchant detection and stocking results
- JSON import validation
- Rarity tag processing

## Compatibility

### Foundry Versions
- **Minimum**: v11.315
- **Tested**: v11.x, v12.x, v13.x
- **Recommended**: Latest stable release

### Game Systems
System-agnostic design works with any game system supported by Item Piles, including:
- D&D 5e
- Pathfinder 1e/2e  
- SWADE
- Generic systems

### Known Issues
- JSON collections are stored temporarily and cleaned up after 24 hours
- Very large compendiums (1000+ items) may experience slight performance delays during filtering

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Credits

- Built for [Foundry Virtual Tabletop](https://foundryvtt.com/)
- Integrates with [Item Piles](https://foundryvtt.com/packages/item-piles) by Fantasy Computerworks
- Icons provided by [Font Awesome](https://fontawesome.com/)

## Support

- **Issues**: [GitHub Issues](https://github.com/Snelly87/sanctum-merchant/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Snelly87/sanctum-merchant/discussions)
- **Discord**: [Foundry VTT Discord](https://discord.gg/foundryvtt) - #modules-troubleshooting

---

**Sanctum Merchant** streamlines merchant inventory management, transforming a tedious manual process into an efficient, automated system that enhances your Foundry VTT experience.
