# Sanctum Merchant

[![Foundry Version](https://img.shields.io/badge/foundry-v11+-blue)](https://foundryvtt.com/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![GitHub release](https://img.shields.io/github/release/[USERNAME]/sanctum-merchant)](https://github.com/[USERNAME]/sanctum-merchant/releases)

A sophisticated merchant stocking system with seamless Item Piles integration for Foundry VTT. Automate merchant inventory management with intelligent item selection, rarity-based filtering, and flexible sourcing options.

![Main Interface](<img width="1072" height="795" alt="image" src="https://github.com/user-attachments/assets/f8a9e5bb-6bcc-49c2-8b4a-7f022572eef5" />)
*Screenshot: Sanctum Merchant configuration dialog integrated into Item Piles merchant window*

## Features

### Item Piles Integration
- **Seamless Integration**: "Stock Merchant" button appears directly in Item Piles merchant windows
- **Automatic Detection**: Recognizes Item Piles merchants and controlled tokens
- **Native Compatibility**: Works with all Item Piles merchant configurations

![Item Piles Integration](screenshots/item-piles-integration.png)
*Screenshot: Stock Merchant button in Item Piles interface*

### Flexible Item Sourcing
- **Compendium Support**: Stock from any Foundry item compendium
- **JSON Import**: Import custom item collections with temporary storage
- **Dynamic Type Detection**: Automatically discovers available item types from sources
- **Batch Management**: Handle multiple item sources simultaneously

![JSON Import](screenshots/json-import.png)
*Screenshot: JSON import interface with sample data*

### Advanced Filtering System
- **Item Type Filtering**: Select specific categories (weapons, equipment, consumables, etc.)
- **Rarity-Based Selection**: Weighted selection based on item rarity tags
- **Strict vs. Loose Modes**: Choose between exclusive matching or weighted preference
- **Roll-Based Quantities**: Use dice formulas to determine stock amounts

![Filtering Options](screenshots/filtering-options.png)
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

![Audit Interface](screenshots/audit-interface.png)
*Screenshot: Tag audit system showing items organized by rarity*

## Installation

### Method 1: Manifest URL
1. Open Foundry VTT and navigate to the **Add-on Modules** tab
2. Click **Install Module**
3. Paste the following URL in the **Manifest URL** field:
```
https://github.com/[USERNAME]/sanctum-merchant/releases/latest/download/module.json
```
4. Click **Install**

### Dependencies
- **Required**: [Item Piles](https://foundryvtt.com/packages/item-piles) module
- **Foundry Version**: v11.315 or higher
- **Game Systems**: System-agnostic (works with any system supported by Item Piles)

## Usage

### Basic Workflow
1. **Open Item Piles Merchant**: Access any configured Item Piles merchant
2. **Click "Stock Merchant"**: Button appears in the merchant window header
3. **Configure Options**: Select item source, types, rarities, and quantity formula
4. **Stock Items**: Items are automatically added to merchant inventory
5. **Review Results**: Check chat messages and merchant inventory

### Configuration Options

![Configuration Dialog](screenshots/configuration-dialog.png)
*Screenshot: Main configuration dialog with all options visible*

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

![Settings Interface](screenshots/settings-interface.png)
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
git clone https://github.com/[USERNAME]/sanctum-merchant.git
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

- **Issues**: [GitHub Issues](https://github.com/[USERNAME]/sanctum-merchant/issues)
- **Discussions**: [GitHub Discussions](https://github.com/[USERNAME]/sanctum-merchant/discussions)
- **Discord**: [Foundry VTT Discord](https://discord.gg/foundryvtt) - #modules-troubleshooting

---

**Sanctum Merchant** streamlines merchant inventory management, transforming a tedious manual process into an efficient, automated system that enhances your Foundry VTT experience.
