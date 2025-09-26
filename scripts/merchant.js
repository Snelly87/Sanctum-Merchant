console.log("✅ Sanctum Merchant script loaded!");

// JSON Import Manager Class
class JSONImportManager {
  static tempCollections = new Map();
  
  static async importJSON(jsonData) {
    try {
      const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      
      if (!data.items || !Array.isArray(data.items)) {
        throw new Error("Invalid JSON structure. Must contain an 'items' array.");
      }
      
      const collectionId = `json-import-${Date.now()}`;
      const collectionName = data.name || "Imported Items";
      
      // Process items and ALWAYS generate valid Foundry IDs
      const processedItems = data.items.map(item => {
        // Remove the _id from the item data to avoid conflicts
        const { _id, ...itemData } = item;
        
        return {
          ...itemData,
          _id: foundry.utils.randomID(), // Always generate a valid 16-char ID
          type: item.type || 'equipment',
          system: {
            ...item.system,
            rarity: item.system?.rarity || 'common'
          }
        };
      });
      
      this.tempCollections.set(collectionId, {
        name: collectionName,
        items: processedItems,
        timestamp: Date.now()
      });
      
      this.cleanOldImports();
      
      return {
        id: collectionId,
        name: collectionName,
        itemCount: processedItems.length
      };
    } catch (error) {
      console.error("JSON Import failed:", error);
      throw error;
    }
  }
  
  static getCollection(collectionId) {
    return this.tempCollections.get(collectionId);
  }
  
  static getAllCollections() {
    return Array.from(this.tempCollections.entries()).map(([id, data]) => ({
      id,
      name: data.name,
      itemCount: data.items.length,
      timestamp: data.timestamp
    }));
  }
  
  static deleteCollection(collectionId) {
    return this.tempCollections.delete(collectionId);
  }
  
  static cleanOldImports() {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    for (const [id, data] of this.tempCollections.entries()) {
      if (data.timestamp < oneDayAgo) {
        this.tempCollections.delete(id);
      }
    }
  }
}

// Item Type Manager - gets available item types from source
class ItemTypeManager {
  static async getAvailableTypes(sourceValue) {
    let types = new Set();
    
    if (!sourceValue) return [];
    
    const [sourceType, sourceId] = sourceValue.includes(':') ? sourceValue.split(':') : ['compendium', sourceValue];
    
    if (sourceType === 'json') {
      const collection = JSONImportManager.getCollection(sourceId);
      if (collection) {
        collection.items.forEach(item => {
          if (item.type) types.add(item.type);
        });
      }
    } else {
      const pack = game.packs.get(sourceId);
      if (pack) {
        try {
          const index = await pack.getIndex({ fields: ["type"] });
          index.forEach(item => {
            if (item.type) types.add(item.type);
          });
        } catch (error) {
          console.warn("Could not load compendium types:", error);
        }
      }
    }
    
    return [...types].sort();
  }
}

// Improved Item Piles Integration
class SanctumMerchantItemPilesIntegration {
  static currentMerchantActor = null;
  static isIntegrationReady = false;
  
  static initialize() {
    console.log("Sanctum Merchant | Initializing Item Piles integration...");
    
    if (!game.modules.get("item-piles")?.active) {
      console.warn("Sanctum Merchant | Item Piles not detected - integration disabled");
      return;
    }
    
    // Wait for Item Piles to be ready
    Hooks.once("item-piles-ready", () => {
      this.setupHooks();
    });
    
    // Fallback check
    if (game.itempiles?.API) {
      this.setupHooks();
    } else {
      // Try again after a delay
      setTimeout(() => {
        if (game.itempiles?.API) {
          this.setupHooks();
        }
      }, 2000);
    }
  }
  
  static setupHooks() {
    if (this.isIntegrationReady) return;
    
    console.log("Sanctum Merchant | Setting up Item Piles hooks");
    
    // Hook into various Item Piles interfaces
    Hooks.on("renderApplication", this.onRenderApplication.bind(this));
    
    // Clean up when apps close
    Hooks.on("closeApplication", (app) => {
      if (app.actor === this.currentMerchantActor) {
        this.currentMerchantActor = null;
      }
    });
    
    this.isIntegrationReady = true;
    console.log("Sanctum Merchant | Item Piles integration ready");
  }
  
  static onRenderApplication(app, html, data) {
    if (!game.user.isGM) return;
    
    // Debug logging to see what apps are rendering
    console.log("Sanctum Merchant | App rendered:", app.constructor.name, app);
    
    if (!this.isItemPilesMerchantApp(app)) return;
    
    console.log("Sanctum Merchant | Detected Item Piles merchant app, adding button");
    
    // Store the current merchant
    this.currentMerchantActor = app.actor || app.merchant;
    
    // Instead of trying to insert into Item Piles DOM, create an integrated button
    this.createIntegratedButton(app);
  }
  
static createIntegratedButton(app) {
  // Remove any existing buttons
  $('.sanctum-merchant-itempiles-btn').remove();
  
  // Wait for the DOM to be fully rendered
  setTimeout(() => {
    const html = app.element;
    
    console.log("=== SANCTUM MERCHANT BUTTON DEBUG ===");
    console.log("App:", app);
    console.log("App constructor:", app.constructor.name);
    console.log("HTML element:", html);
    console.log("HTML length:", html?.length);
    
    if (!html || html.length === 0) {
      console.error("Sanctum Merchant | No valid app element found");
      return;
    }
    
    // Log the full structure to understand what we're working with
    console.log("Full HTML structure:");
    console.log(html[0].outerHTML.substring(0, 500) + "...");
    
    const button = $(`
      <button type="button" class="sanctum-merchant-itempiles-btn">
        <i class="fas fa-coins"></i> Stock Merchant
      </button>
    `);
    
    // Constrained button styling for flexbox layouts
    button.css({
      'margin-right': '5px',
      'padding': '4px 8px',
      'white-space': 'nowrap',
      'flex': '0 0 auto',        // Don't grow, don't shrink, auto width
      'flex-grow': '0',          // Explicitly prevent growing
      'flex-shrink': '0',        // Explicitly prevent shrinking
      'width': 'auto',           // Auto width based on content
      'min-width': 'auto',       // Don't enforce minimum width
      'max-width': '120px',      // Cap the maximum width
      'box-sizing': 'border-box' // Include padding/border in width
    });
    
    button.on('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      console.log(`Sanctum Merchant | Opening for merchant: ${this.currentMerchantActor?.name}`);
      
      if (!game.sanctumMerchant?.openConfigDialog) {
        ui.notifications.error("Sanctum Merchant not properly loaded.");
        return;
      }
      
      game.sanctumMerchant.openConfigDialog();
    });
    
    let inserted = false;
    
    // Try multiple selectors to find window controls
    const possibleSelectors = [
      '.window-controls',
      '.header-controls',
      '.window-header .controls',
      '.window-header button:last-child',
      '.window-header'
    ];
    
    for (const selector of possibleSelectors) {
      const elements = html.find(selector);
      console.log(`Selector "${selector}": found ${elements.length} elements`);
      
      if (elements.length > 0) {
        console.log(`First element with "${selector}":`, elements[0]);
        
        if (selector === '.window-header') {
          // If we found window header, wait a bit more for Svelte to render buttons
          setTimeout(() => {
            const headerElement = elements.first();
            // Look for both button elements AND anchor elements with header-button class
            const buttons = headerElement.find('button, a.header-button, .header-button');
            console.log(`Buttons/links in window header (after delay): ${buttons.length}`);
            
            // Log detailed button information
            buttons.each(function(i) {
              const $btn = $(this);
              const tagName = this.tagName.toLowerCase();
              console.log(`  ${tagName.toUpperCase()} ${i}: text="${$btn.text().trim()}" title="${$btn.attr('title') || ''}" aria-label="${$btn.attr('aria-label') || ''}" classes="${$btn.attr('class') || ''}"`);
            });
            
            // Also log the header structure to understand layout
            console.log("Header HTML structure:", headerElement[0].outerHTML.substring(0, 400));
            
            if (buttons.length > 0) {
              // Look for "Open Sheet" button more broadly - check aria-label too
              let openSheetButton = null;
              buttons.each(function() {
                const $btn = $(this);
                const text = $btn.text().trim().toLowerCase();
                const title = ($btn.attr('title') || '').toLowerCase();
                const ariaLabel = ($btn.attr('aria-label') || '').toLowerCase();
                
                console.log(`  Checking element: "${text}" title: "${title}" aria-label: "${ariaLabel}"`);
                
                if (text.includes('open') || text.includes('sheet') || 
                    title.includes('open') || title.includes('sheet') ||
                    ariaLabel.includes('open') || ariaLabel.includes('sheet')) {
                  openSheetButton = $btn;
                  console.log("  -> Found Open Sheet button!");
                  return false; // break
                }
              });
              
            if (openSheetButton) {
              // Debug: Let's clone an existing button and modify it instead
              console.log("Sanctum Merchant | Cloning existing button to match styling");
              
              const clonedButton = openSheetButton.clone();
              
              // Modify the cloned button's content
              clonedButton.removeClass('item-piles-open-actor-sheet')
                         .addClass('item-piles-stock-merchant')
                         .attr('aria-label', 'Stock Merchant');
              
              clonedButton.find('i').removeClass('fa-user').addClass('fa-coins');
              clonedButton.find('span').text('Stock');
              
              // Add our click handler
              clonedButton.off('click').on('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                console.log(`Sanctum Merchant | Opening for merchant: ${this.currentMerchantActor?.name}`);
                
                if (!game.sanctumMerchant?.openConfigDialog) {
                  ui.notifications.error("Sanctum Merchant not properly loaded.");
                  return;
                }
                
                game.sanctumMerchant.openConfigDialog();
              });
              
              openSheetButton.before(clonedButton);
              console.log("Sanctum Merchant | Button cloned and inserted before Open Sheet button");
            } else {
              // Fallback: create our button and force debug the styling
              console.log("Sanctum Merchant | Creating new button with extensive debugging");
              
              const button = $(`
                <a class="header-button item-piles-stock-merchant svelte-ip-acci" aria-label="Stock Merchant" tabindex="0" role="button">
                  <i class="fas fa-coins" title=""></i>
                  <span class="svelte-ip-acci has-icon">Stock</span>
                </a>
              `);
              
              button.on('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                console.log(`Sanctum Merchant | Opening for merchant: ${this.currentMerchantActor?.name}`);
                
                if (!game.sanctumMerchant?.openConfigDialog) {
                  ui.notifications.error("Sanctum Merchant not properly loaded.");
                  return;
                }
                
                game.sanctumMerchant.openConfigDialog();
              });
              
              // Insert before the first button/link
              buttons.first().before(button);
              
              // Debug the styling after a delay
              setTimeout(() => {
                const existingButton = buttons.first();
                const ourButton = button;
                
                console.log("=== BUTTON STYLING DEBUG ===");
                console.log("Existing button computed styles:");
                const existingStyles = window.getComputedStyle(existingButton[0]);
                console.log("Background:", existingStyles.backgroundColor);
                console.log("Color:", existingStyles.color);
                console.log("Border:", existingStyles.border);
                console.log("Padding:", existingStyles.padding);
                console.log("Font size:", existingStyles.fontSize);
                
                console.log("Our button computed styles:");
                const ourStyles = window.getComputedStyle(ourButton[0]);
                console.log("Background:", ourStyles.backgroundColor);
                console.log("Color:", ourStyles.color);
                console.log("Border:", ourStyles.border);
                console.log("Padding:", ourStyles.padding);
                console.log("Font size:", ourStyles.fontSize);
                
                console.log("CSS classes comparison:");
                console.log("Existing classes:", existingButton[0].className);
                console.log("Our classes:", ourButton[0].className);
                
              }, 200);
              
              console.log("Sanctum Merchant | Button inserted before first button/link");
            }
            } else {
              console.log("Sanctum Merchant | Still no buttons/links found after delay");
              // Position on right side if no buttons
              button.css({
                'position': 'absolute',
                'right': '50px',
                'top': '50%',
                'transform': 'translateY(-50%)'
              });
              headerElement.css('position', 'relative');
              headerElement.append(button);
              console.log("Sanctum Merchant | Button positioned on right side");
            }
          }, 500); // Increased timeout
          
          inserted = true; // Mark as handled
          break;
        } else {
          // Found controls container, insert the button
          elements.first().prepend(button);
          inserted = true;
          console.log(`Sanctum Merchant | Button inserted using selector: ${selector}`);
          break;
        }
      }
    }
    
    // Last resort: find any header and add button with absolute positioning
    if (!inserted) {
      console.log("Sanctum Merchant | Trying absolute positioning fallback");
      
      const anyHeader = html.find('.window-header, .app-header, header').first();
      console.log("Any header found:", anyHeader.length > 0);
      
      if (anyHeader.length > 0) {
        button.css({
          'position': 'absolute',
          'top': '5px',
          'right': '50px',
          'z-index': '1000'
        });
        
        anyHeader.css('position', 'relative');
        anyHeader.append(button);
        inserted = true;
        console.log("Sanctum Merchant | Button added with absolute positioning");
      }
    }
    
    // Super last resort: add to the window somewhere visible
    if (!inserted) {
      console.log("Sanctum Merchant | Trying emergency fallback");
      
      button.css({
        'position': 'fixed',
        'top': '10px',
        'right': '200px',
        'z-index': '9999',
        'background': '#ff4444',
        'color': 'white',
        'border': '2px solid yellow'
      });
      
      $('body').append(button);
      inserted = true;
      console.log("Sanctum Merchant | Button added as emergency overlay");
      
      // Auto-remove after 10 seconds as this is clearly wrong
      setTimeout(() => {
        button.remove();
        console.log("Sanctum Merchant | Emergency button auto-removed");
      }, 10000);
    }
    
    if (inserted) {
      console.log("Sanctum Merchant | Button successfully inserted");
      
      // Remove button when window closes
      const originalClose = app.close.bind(app);
      app.close = async function(...args) {
        $('.sanctum-merchant-itempiles-btn').remove();
        console.log("Sanctum Merchant | Button removed on close");
        return originalClose(...args);
      };
    } else {
      console.error("Sanctum Merchant | Failed to insert button anywhere");
    }
    
    console.log("=== END SANCTUM MERCHANT BUTTON DEBUG ===");
    
  }, 1000); // Increased timeout to 1 second
}
  
  static isItemPilesMerchantApp(app) {
    // Handle different app structures - some have app.actor, some have app.merchant
    const actor = app.actor || app.merchant;
    if (!actor) {
      console.log("Sanctum Merchant | No actor/merchant found in app");
      return false;
    }
    
    const appName = app.constructor.name;
    console.log("Sanctum Merchant | Checking app:", appName, "with actor:", actor.name);
    
    // More comprehensive app detection
    const itemPilesAppPatterns = [
      'ItemPile',
      'Merchant', 
      'MerchantApp',
      'ItemPileInventoryApp',
      'ItemPileMerchantApp'
    ];
    
    const isItemPilesApp = itemPilesAppPatterns.some(pattern => 
      appName.includes(pattern)
    );
    
    if (isItemPilesApp) {
      console.log("Sanctum Merchant | Found Item Piles app pattern:", appName);
      return this.isItemPilesMerchant(actor);
    }
    
    // Also check if it's any app with an actor that might be an Item Piles merchant
    if (this.isItemPilesMerchant(actor)) {
      console.log("Sanctum Merchant | Found merchant via actor check:", appName);
      return true;
    }
    
    return false;
  }
  
  static isItemPilesMerchant(actor) {
    if (!actor) {
      console.log("Sanctum Merchant | No actor provided");
      return false;
    }
    
    console.log("Sanctum Merchant | Checking if actor is merchant:", actor.name);
    
    try {
      if (!game.itempiles?.API?.isValidItemPile) {
        console.log("Sanctum Merchant | Item Piles API not available, assuming this is a merchant");
        return true; // If Item Piles API isn't available, assume it's a merchant since it came from a Merchant app
      }
      
      const isValidPile = game.itempiles.API.isValidItemPile(actor);
      console.log("Sanctum Merchant | isValidItemPile:", isValidPile);
      
      if (!isValidPile) {
        console.log("Sanctum Merchant | Not a valid item pile");
        return false;
      }
      
      const pileData = game.itempiles.API.getActorFlagData(actor);
      console.log("Sanctum Merchant | Pile data:", pileData);
      
      const isMerchant = pileData?.type === "merchant";
      console.log("Sanctum Merchant | Is merchant:", isMerchant);
      
      return isMerchant;
    } catch (error) {
      console.error("Sanctum Merchant | Error checking Item Pile:", error);
      // If there's an error with the API, but we got here from a MerchantApp, assume it's a merchant
      return true;
    }
  }
  
  static getCurrentMerchant() {
    // First try stored merchant
    if (this.currentMerchantActor && this.isItemPilesMerchant(this.currentMerchantActor)) {
      return this.currentMerchantActor;
    }
    
    // Then check controlled tokens
    for (const token of canvas.tokens.controlled) {
      if (token.actor && this.isItemPilesMerchant(token.actor)) {
        return token.actor;
      }
    }
    
    // Finally check open windows
    for (const app of Object.values(ui.windows)) {
      if (this.isItemPilesMerchantApp(app)) {
        return app.actor || app.merchant;
      }
    }
    
    return null;
  }
  
  static async addItemsToMerchant(merchant, items) {
    if (!this.isItemPilesMerchant(merchant)) {
      // Fallback to regular actor if not an Item Piles merchant
      console.log("Sanctum Merchant | Adding items directly to actor (not Item Piles merchant)");
      return this.addItemsDirect(merchant, items);
    }
    
    try {
      // Use Item Piles API for better integration
      await game.itempiles.API.addItems(merchant, items);
      console.log(`Sanctum Merchant | Added ${items.length} items via Item Piles API`);
      return true;
      
    } catch (error) {
      console.error("Failed to add items via Item Piles API:", error);
      // Fallback to direct method
      return this.addItemsDirect(merchant, items);
    }
  }
  
  static async addItemsDirect(merchant, items) {
    try {
      const actorItems = new Set(merchant.items.map(i => i.name));
      const newItems = items.filter(d => !actorItems.has(d.name));
      
      if (newItems.length > 0) {
        await merchant.createEmbeddedDocuments("Item", newItems);
        console.log(`Sanctum Merchant | Added ${newItems.length} items directly`);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Failed to add items directly:", error);
      return false;
    }
  }
  
  static async clearMerchantInventory(merchant) {
    if (!merchant) {
      ui.notifications.error("No merchant provided to clear.");
      return false;
    }
    
    console.log(`Sanctum Merchant | Clearing ${merchant.name} - items: ${merchant.items.size}`);
    
    try {
      let itemIds = [];
      
      // Handle different item collection types
      if (merchant.items && typeof merchant.items.map === 'function') {
        itemIds = merchant.items.map(i => i.id);
      } else if (merchant.items && merchant.items.contents) {
        itemIds = merchant.items.contents.map(i => i.id);
      } else {
        try {
          for (const item of merchant.items) {
            itemIds.push(item.id);
          }
        } catch (error) {
          console.error("Could not iterate over items:", error);
        }
      }
      
      if (itemIds.length === 0) {
        ui.notifications.warn(`${merchant.name} has no items to remove.`);
        return true;
      }
      
      // Try Item Piles API first if it's a merchant
      if (this.isItemPilesMerchant(merchant) && game.itempiles?.API?.removeItems) {
        try {
          const itemsToRemove = merchant.items.map(item => ({
            _id: item.id,
            quantity: item.system?.quantity || 1
          }));
          
          await game.itempiles.API.removeItems(merchant, itemsToRemove);
          console.log(`Sanctum Merchant | Cleared via Item Piles API`);
        } catch (error) {
          console.warn("Item Piles API clear failed, using direct method:", error);
          await merchant.deleteEmbeddedDocuments("Item", itemIds);
        }
      } else {
        // Direct removal
        await merchant.deleteEmbeddedDocuments("Item", itemIds);
      }
      
      ui.notifications.info(`${merchant.name}'s inventory cleared (${itemIds.length} items)!`);
      return true;
      
    } catch (error) {
      console.error("Failed to clear merchant inventory:", error);
      ui.notifications.error("Failed to clear merchant inventory.");
      return false;
    }
  }
}

Hooks.once("init", () => {
  console.log("Sanctum Merchant | Initializing...");

  game.settings.register("sanctum-merchant", "compendium", {
    name: "Default Compendium",
    hint: "Compendium to pull items from.",
    scope: "world",
    config: true,
    type: String,
    default: "world.ddb-oathbreaker-ddb-items"
  });
  
  game.settings.register("sanctum-merchant", "itemSource", {
    name: "Item Source (compendium or json)",
    scope: "world",
    config: false,
    type: String,
    default: "compendium:world.ddb-oathbreaker-ddb-items"
  });

  game.settings.register("sanctum-merchant", "formula", {
    name: "Default Roll Formula",
    hint: "Formula used to determine how many items to stock.",
    scope: "world",
    config: true,
    type: String,
    default: "1d6+2"
  });

  game.settings.register("sanctum-merchant", "types", {
    name: "Allowed Item Types",
    hint: "Comma-separated list of item types to include.",
    scope: "world",
    config: true,
    type: String,
    default: "weapon,consumable,equipment,loot,container,tool"
  });

  game.settings.register("sanctum-merchant", "strictRarity", {
    name: "Strict Rarity Filtering",
    hint: "Only include items with matching rarity tags.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register("sanctum-merchant", "merchantMessage", {
    name: "Default Merchant Message",
    hint: "Message whispered to players when stocking the merchant.",
    scope: "world",
    config: true,
    type: String,
    default: `🧿 Got somethin' that might interest ya'!`
  });
  
  game.settings.register("sanctum-merchant", "tags", {
    name: "Default Rarity Tags",
    hint: "Comma-separated list of rarity tags to apply when no preset is selected.",
    scope: "world",
    config: true,
    type: String,
    default: ""
  });
});

const rarityWeights = {
  "common": 1,
  "uncommon": 2,
  "rare": 3,
  "very rare": 4,
  "legendary": 5,
  "exotic": 6,
  "cursed": 7,
  "chaos": 8,
  "sanctum-blessed": 9
};

const fallbackCommon = [
  "potion", "scroll", "dagger", "leather", "torch", "rations",
  "sling", "club", "robe", "kit", "tools", "basic", "simple"
];

const rarityIcons = {
  "common": "⚪",
  "uncommon": "🟢",
  "rare": "🔵",
  "very rare": "🟣",
  "legendary": "🟠",
  "exotic": "🌟",
  "cursed": "☠️",
  "chaos": "🌀",
  "sanctum-blessed": "🔮"
};

// Shuffle utility
function shuffleArray(array) {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

// Available rarity tags
const availableRarityTags = [
  "common", "uncommon", "rare", "very rare", "legendary",
  "exotic", "cursed", "forged", "sanctum-blessed"
];

const rarityPresets = {
  starter: ["common", "uncommon"],
  vault: ["legendary", "very rare", "sanctum-blessed"],
  bazaar: ["rare", "exotic", "sanctum-blessed"],
  cursed: ["cursed", "forged", "rare"],
  chaos: ["common", "rare", "cursed", "exotic"]
};

const presetDescriptions = {
  starter: "Basic adventuring gear for low-level parties",
  vault: "High-tier magical items for epic loot drops",
  bazaar: "Exotic and rare items with flair",
  cursed: "Risky magical curios with dark potential",
  chaos: "A wild mix of everything"
};

// Updated Stock Merchant callback
const stockMerchantCallback = async (html) => {
  try {
    const sourceValue = html.find('[name="source"]').val();
    await game.settings.set("sanctum-merchant", "itemSource", sourceValue);

    let sourceType, sourceId;

    if (sourceValue && sourceValue.includes(':')) {
      [sourceType, sourceId] = sourceValue.split(':');
    } else {
      sourceType = 'compendium';
      sourceId = sourceValue || game.settings.get("sanctum-merchant", "compendium");
    }
    
    const formula = html.find('[name="formula"]').val();
    const types = Array.from(html.find(".item-types .tag")).map(el => el.dataset.tag);
    const presetName = html.find('[name="rarity-preset"]').val();
    const merchantMessage = html.find('[name="merchantMessage"]').val();
    const strictRarity = html.find('[name="strictRarity"]').is(":checked");

    let tags;
    if (presetName && rarityPresets[presetName]) {
      tags = rarityPresets[presetName];
    } else {
      tags = Array.from(html.find(".rarity-tags .tag")).map(el => el.dataset.tag.toLowerCase());
    }

    // Validation
    if (types.length === 0) {
      ui.notifications.warn("Please select at least one item type.");
      return false;
    }

    // Save settings for compendium sources
    if (sourceType === 'compendium') {
      await game.settings.set("sanctum-merchant", "compendium", sourceId);
      await game.settings.set("sanctum-merchant", "formula", formula);
      await game.settings.set("sanctum-merchant", "types", types.join(","));
      await game.settings.set("sanctum-merchant", "strictRarity", strictRarity);
      await game.settings.set("sanctum-merchant", "merchantMessage", merchantMessage);
      await game.settings.set("sanctum-merchant", "tags", tags.join(","));
    }

    await game.sanctumMerchant.populateMerchantWithJSON({
      source: sourceId,
      sourceType: sourceType,
      rollFormula: formula,
      allowedTypes: types,
      rareTags: tags,
      strictRarity,
      merchantMessage
    });
    
    ui.notifications.info("Items stocked successfully!");
    
  } catch (err) {
    console.error("Merchant stocking failed:", err);
    ui.notifications.error("Something went wrong stocking the merchant.");
  }

  game.sanctumMerchant.openConfigDialog();
  return false;
};

// Updated Clear Inventory callback
const clearInventoryCallback = async () => {
  try {
    console.log("Sanctum Merchant | Clear inventory callback triggered");
    
    // Try to get merchant from Item Piles integration first
    let merchant = SanctumMerchantItemPilesIntegration.getCurrentMerchant();
    
    // Fallback to controlled tokens if no Item Piles merchant found
    if (!merchant) {
      for (const token of canvas.tokens.controlled) {
        if (token.actor) {
          merchant = token.actor;
          break;
        }
      }
    }
    
    if (!merchant) {
      ui.notifications.error("No merchant found to clear.");
      return;
    }
    
    const success = await SanctumMerchantItemPilesIntegration.clearMerchantInventory(merchant);
    
    if (success) {
      ui.notifications.info("Inventory cleared successfully!");
    }
    
  } catch (err) {
    console.error("Inventory clear failed:", err);
    ui.notifications.error("Something went wrong clearing the merchant.");
  }
  
  game.sanctumMerchant.openConfigDialog();
};

Hooks.once("ready", () => {
  console.log("🛒 Sanctum Merchant READY hook fired!");
  
  // Initialize Item Piles integration
  SanctumMerchantItemPilesIntegration.initialize();
  
  game.sanctumMerchant = game.sanctumMerchant || {};
  
  // Append GM-only button to Actors tab with better timing and debugging
  const injectMerchantButton = () => {
    if (!game.user.isGM) {
      console.log("Sanctum Merchant | Not GM, skipping actors tab button");
      return;
    }

    console.log("Sanctum Merchant | Attempting to inject actors tab button");
    
    const actorsTab = document.querySelector("#sidebar .tab[data-tab='actors']");
    if (!actorsTab) {
      console.log("Sanctum Merchant | Actors tab not found, retrying in 500ms");
      setTimeout(injectMerchantButton, 500);
      return;
    }

    const headerActions = actorsTab.querySelector(".header-actions");
    if (!headerActions) {
      console.log("Sanctum Merchant | Header actions not found, retrying in 500ms");
      setTimeout(injectMerchantButton, 500);
      return;
    }
    
    if (actorsTab.querySelector("#sanctumMerchantButton")) {
      console.log("Sanctum Merchant | Button already exists in actors tab");
      return;
    }

    const button = document.createElement("button");
    button.id = "sanctumMerchantButton";
    button.innerHTML = `<i class="fas fa-coins"></i> Stock Merchant`;

    button.addEventListener("click", () => {
      console.log("Sanctum Merchant | Actors tab button clicked");
      game.sanctumMerchant.openConfigDialog();
    });

    headerActions.appendChild(button);
    console.log("🛒 Sanctum Merchant button appended to actors tab!");
  };

  // Try multiple times with different delays  
  injectMerchantButton();
  setTimeout(injectMerchantButton, 1000);
  setTimeout(injectMerchantButton, 2000);
  
  // Also try when actors tab is rendered
  Hooks.on("renderActorDirectory", () => {
    console.log("Sanctum Merchant | ActorDirectory rendered, injecting button");
    setTimeout(injectMerchantButton, 100);
  });
  
  // Manual debug command for actors tab
  game.sanctumMerchant.debugActorsTab = () => {
    console.log("=== ACTORS TAB DEBUG ===");
    console.log("User is GM:", game.user.isGM);
    
    const sidebar = document.querySelector("#sidebar");
    console.log("Sidebar found:", !!sidebar);
    
    const actorsTab = document.querySelector("#sidebar .tab[data-tab='actors']");
    console.log("Actors tab found:", !!actorsTab);
    if (actorsTab) {
      console.log("Actors tab HTML:", actorsTab.outerHTML.substring(0, 200) + "...");
    }
    
    const headerActions = actorsTab?.querySelector(".header-actions");
    console.log("Header actions found:", !!headerActions);
    if (headerActions) {
      console.log("Header actions HTML:", headerActions.outerHTML);
      console.log("Header actions children:", headerActions.children.length);
    }
    
    const existingButton = document.querySelector("#sanctumMerchantButton");
    console.log("Existing button found:", !!existingButton);
    
    // Try to inject manually
    if (game.user.isGM && actorsTab && headerActions && !existingButton) {
      const button = document.createElement("button");
      button.id = "sanctumMerchantButton";
      button.innerHTML = `<i class="fas fa-coins"></i> Stock Merchant`;
      
      button.addEventListener("click", () => {
        console.log("Manual actors tab button clicked");
        game.sanctumMerchant.openConfigDialog();
      });
      
      headerActions.appendChild(button);
      console.log("Manual button injection attempted");
    }
  };
  
  // Manual fallback command for testing
  game.sanctumMerchant.forceAddButton = () => {
    console.log("Sanctum Merchant | Manual button addition triggered");
    for (const app of Object.values(ui.windows)) {
      console.log("Checking app:", app.constructor.name, app);
      if ((app.actor || app.merchant) && SanctumMerchantItemPilesIntegration.isItemPilesMerchant(app.actor || app.merchant)) {
        console.log("Found merchant app, creating integrated button");
        SanctumMerchantItemPilesIntegration.currentMerchantActor = app.actor || app.merchant;
        SanctumMerchantItemPilesIntegration.createIntegratedButton(app);
        break; // Only create one button
      }
    }
  };
  
  // Alternative direct insertion method
  game.sanctumMerchant.injectButtonNow = () => {
    const merchantApp = Object.values(ui.windows).find(app => app.constructor.name === 'MerchantApp');
    if (!merchantApp) {
      console.log("No MerchantApp found");
      return;
    }
    
    console.log("Found MerchantApp, attempting direct injection");
    const html = merchantApp.element;
    
    // Create a very obvious button
    const button = $(`
      <div style="position: fixed; top: 100px; right: 20px; z-index: 99999; background: red; color: white; padding: 10px; border: 3px solid yellow; cursor: pointer; font-size: 14px; font-weight: bold;">
        STOCK MERCHANT - CLICK ME
      </div>
    `);
    
    button.on('click', (e) => {
      e.preventDefault();
      SanctumMerchantItemPilesIntegration.currentMerchantActor = merchantApp.actor || merchantApp.merchant;
      game.sanctumMerchant.openConfigDialog();
    });
    
    $('body').append(button);
    console.log("Button added to body with fixed positioning");
    
    // Auto-remove after 30 seconds
    setTimeout(() => button.remove(), 30000);
  };

  // Enhanced Config dialog with JSON import
  game.sanctumMerchant.openConfigDialog = () => {
    // Build source dropdown with both compendiums and JSON imports
    const compendiums = game.packs.filter(p => p.metadata.type === "Item");
    const jsonCollections = JSONImportManager.getAllCollections();
    
    let sourceOptions = '';
    compendiums.forEach(pack => {
      sourceOptions += `<option value="compendium:${pack.collection}">${pack.title}</option>`;
    });
    
    if (jsonCollections.length > 0) {
      sourceOptions += '<optgroup label="--- Imported JSON ---">';
      jsonCollections.forEach(collection => {
        const date = new Date(collection.timestamp).toLocaleDateString();
        sourceOptions += `<option value="json:${collection.id}">${collection.name} (${collection.itemCount} items)</option>`;
      });
      sourceOptions += '</optgroup>';
    }

    new Dialog({
      title: "Sanctum Merchant",
      content: `
        <form>
          <div class="form-group" style="border: 2px solid #4a90e2; padding: 10px; border-radius: 5px; background: #f0f8ff;">
            <label><strong>Import JSON Items</strong></label>
            <textarea name="json-import" placeholder='Paste JSON like: {"name": "Collection Name", "items": [...]}' 
                      style="width: 100%; height: 80px; font-family: monospace; font-size: 11px;"></textarea>
            <button type="button" class="import-json" style="margin-top: 5px;">
              <i class="fas fa-file-import"></i> Import JSON
            </button>
            <button type="button" class="manage-imports" style="margin-top: 5px; margin-left: 5px;">
              <i class="fas fa-list"></i> Manage Imports
            </button>
          </div>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="width: 150px; padding: 8px 10px; vertical-align: top;">
                <label>Item Source</label>
              </td>
              <td style="padding: 8px 10px;">
                <select name="source" style="width: 100%; height: 28px; padding: 4px; margin: 0; box-sizing: border-box; border: 1px solid #ccc;">
                  ${sourceOptions}
                </select>
              </td>
            </tr>
            
            <tr>
              <td style="width: 150px; padding: 8px 10px; vertical-align: top;">
                <label>Roll Formula</label>
              </td>
              <td style="padding: 8px 10px;">
                <input type="text" name="formula" style="width: 100%; height: 28px; padding: 4px; margin: 0; box-sizing: border-box; border: 1px solid #ccc;" />
              </td>
            </tr>
            
            <tr>
              <td style="width: 150px; padding: 8px 10px; vertical-align: top;">
                <label>Select Item Types</label>
              </td>
              <td style="padding: 8px 10px;">
                <select name="type-select" disabled style="width: 100%; height: 28px; padding: 4px; margin: 0 0 5px 0; box-sizing: border-box; border: 1px solid #ccc;">
                  <option>Loading types...</option>
                </select>
                <div>
                  <button type="button" class="add-type" style="width: 50px;">Add</button>
                  <button type="button" class="select-all-types" style="width: 70px; white-space: nowrap; margin-left: 5px;">Select All</button>
                </div>
                <div class="item-types" style="margin-top:5px; min-height: 30px; border: 1px solid #ccc; padding: 5px;"></div>
                <p style="font-size:0.8em;margin-top:4px;">
                  Item types will populate when you select a source above.
                </p>
              </td>
            </tr>
            
            <tr>
              <td style="width: 150px; padding: 8px 10px; vertical-align: top;">
                <label>Rarity Preset</label>
              </td>
              <td style="padding: 8px 10px;">
                <select name="rarity-preset" style="width: 100%; height: 28px; padding: 4px; margin: 0; box-sizing: border-box; border: 1px solid #ccc;">
                  <option value="">None</option>
                  <option value="starter">Starter Gear</option>
                  <option value="vault">Legendary Vault</option>
                  <option value="bazaar">Exotic Bazaar</option>
                  <option value="cursed">Cursed Curiosities</option>
                  <option value="chaos">Chaos Stock</option>
                </select>
              </td>
            </tr>
            
            <tr>
              <td style="width: 150px; padding: 8px 10px; vertical-align: top;">
                <label>Select Rarity Tags</label>
              </td>
              <td style="padding: 8px 10px;">
                <select name="rarity-select" style="width: 100%; height: 28px; padding: 4px; margin: 0 0 5px 0; box-sizing: border-box; border: 1px solid #ccc;">
                  ${availableRarityTags.map(tag => `<option value="${tag}">${tag}</option>`).join("")}
                </select>
                <div>
                  <button type="button" class="add-rarity" style="width: 50px;">Add</button>
                </div>
                <div class="rarity-tags" style="margin-top:5px;"></div>
              </td>
            </tr>
            
            <tr>
              <td style="width: 150px; padding: 8px 10px; vertical-align: top;">
                <label>Strict Filtering</label>
              </td>
              <td style="padding: 8px 10px;">
                <label>
                  <input type="checkbox" name="strictRarity" />
                  Strict rarity filtering
                </label>
                <p style="font-size:0.8em;margin-top:4px;">
                  When checked, only items with selected rarity tags will be considered.
                  When unchecked, all items are eligible but matching tags are favored.
                </p>
              </td>
            </tr>
            
            <tr>
              <td style="width: 150px; padding: 8px 10px; vertical-align: top;">
                <label>Merchant Message</label>
              </td>
              <td style="padding: 8px 10px;">
                <input type="text" name="merchantMessage" style="width: 100%; height: 28px; padding: 4px; margin: 0; box-sizing: border-box; border: 1px solid #ccc;" />
              </td>
            </tr>
          </table>
        </form>
      `,
      buttons: {
        confirm: {
          label: "Stock Merchant",
          callback: stockMerchantCallback
        },
        clear: {
          label: "Clear Inventory",
          callback: clearInventoryCallback
        },
        reset: {
          label: "Reset to Default",
          callback: async () => {
            try {
              await game.settings.set("sanctum-merchant", "compendium", "world.ddb-oathbreaker-ddb-items");
              await game.settings.set("sanctum-merchant", "formula", "1d6+2");
              await game.settings.set("sanctum-merchant", "types", "weapon,consumable,equipment,loot,container,tool");
              await game.settings.set("sanctum-merchant", "strictRarity", true);
              await game.settings.set("sanctum-merchant", "merchantMessage", `🧿 Got somethin' that might interest ya'!`);
              await game.settings.set("sanctum-merchant", "tags", "");
              ui.notifications.info("Sanctum Merchant settings reset to default.");
              game.sanctumMerchant.openConfigDialog();
            } catch (err) {
              console.error("Reset failed:", err);
              ui.notifications.error("Could not reset merchant settings.");
            }
          }
        },
        audit: {
          label: "Audit Tags",
          callback: async () => {
            await game.sanctumMerchant.auditTags();
            game.sanctumMerchant.openConfigDialog();
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "confirm",
      render: html => {
        // Restore source from itemSource
        const savedSource = game.settings.get("sanctum-merchant", "itemSource")
          || `compendium:${game.settings.get("sanctum-merchant", "compendium")}`;

        // If the saved option exists, select it; otherwise fall back
        if (savedSource && html.find(`[name="source"] option[value="${savedSource}"]`).length > 0) {
          html.find('[name="source"]').val(savedSource);
        } else {
          const defaultSource = game.settings.get("sanctum-merchant", "compendium");
          html.find('[name="source"]').val(`compendium:${defaultSource}`);
        }

        // Function to populate item types
        async function populateItemTypes(sourceValue) {
          const typeSelect = html.find('[name="type-select"]');
          const typeList = html.find(".item-types");
          
          typeSelect.prop('disabled', true).html('<option>Loading types...</option>');
          
          try {
            const availableTypes = await ItemTypeManager.getAvailableTypes(sourceValue);
            
            typeSelect.prop('disabled', false).empty();
            availableTypes.forEach(type => {
              typeSelect.append(`<option value="${type}">${type}</option>`);
            });
            
            if (availableTypes.length === 0) {
              typeSelect.append('<option>No types found</option>').prop('disabled', true);
            }
          } catch (error) {
            console.error("Error loading item types:", error);
            typeSelect.html('<option>Error loading types</option>');
          }
        }

        // Source change handler
        html.find('[name="source"]').on('change', async (e) => {
          const val = e.currentTarget.value;
          await game.settings.set("sanctum-merchant", "itemSource", val);
          if (val?.startsWith("compendium:")) {
            await game.settings.set("sanctum-merchant", "compendium", val.split(':')[1]);
          }
          
          html.find(".item-types").empty();
          await populateItemTypes(val);
        });

        // Initial population of item types
        populateItemTypes(html.find('[name="source"]').val());

        // Add type handler
        html.find('.add-type').click(() => {
          const select = html.find('[name="type-select"]');
          const type = select.val();
          const typeList = html.find(".item-types");
          if (type && !typeList.find(`[data-tag="${type}"]`).length) {
            const typeElem = $(`<span class="tag" data-tag="${type}" style="display:inline-block;background:#444!important;color:white!important;padding:2px 6px;margin:2px;border-radius:4px;">
              ${type} <button class="remove-tag" style="background:none!important;border:none!important;color:red!important;margin-left:4px;cursor:pointer;">x</button>
            </span>`);
            typeElem.find(".remove-tag").click(() => typeElem.remove());
            typeList.append(typeElem);
          }
        });

        // Select all types handler
        html.find('.select-all-types').click(() => {
          const select = html.find('[name="type-select"]');
          const typeList = html.find(".item-types");
          
          select.find('option').each(function() {
            const type = $(this).val();
            if (!typeList.find(`[data-tag="${type}"]`).length) {
              const typeElem = $(`<span class="tag" data-tag="${type}" style="display:inline-block;background:#444;color:white;padding:2px 6px;margin:2px;border-radius:4px;">
                ${type} <button class="remove-tag" style="background:none;border:none;color:red;margin-left:4px;cursor:pointer;">x</button>
              </span>`);
              typeElem.find(".remove-tag").click(() => typeElem.remove());
              typeList.append(typeElem);
            }
          });
        });

        // Load saved item types
        const savedTypes = game.settings.get("sanctum-merchant", "types").split(",").map(t => t.trim()).filter(Boolean);
        setTimeout(() => {
          savedTypes.forEach(type => {
            const typeList = html.find(".item-types");
            if (!typeList.find(`[data-tag="${type}"]`).length) {
              const typeElem = $(`<span class="tag" data-tag="${type}" style="display:inline-block;background:#444!important;color:white!important;padding:2px 6px;margin:2px;border-radius:4px;">
                ${type} <button class="remove-tag" style="background:none!important;border:none!important;color:red!important;margin-left:4px;cursor:pointer;">x</button>
              </span>`);
              typeElem.find(".remove-tag").click(() => typeElem.remove());
              typeList.append(typeElem);
            }
          });
        }, 500);

        html.find('[name="formula"]').val(game.settings.get("sanctum-merchant", "formula"));
        html.find('[name="strictRarity"]').prop("checked", game.settings.get("sanctum-merchant", "strictRarity"));
        html.find('[name="merchantMessage"]').val(game.settings.get("sanctum-merchant", "merchantMessage"));

        // Import JSON handler
        html.find('.import-json').click(async () => {
          const jsonText = html.find('[name="json-import"]').val();
          if (!jsonText) {
            ui.notifications.warn("Please paste JSON data to import.");
            return;
          }
          
          try {
            const result = await JSONImportManager.importJSON(jsonText);
            ui.notifications.success(`Imported "${result.name}" with ${result.itemCount} items.`);
            html.find('[name="json-import"]').val('');
            game.sanctumMerchant.openConfigDialog();
          } catch (error) {
            ui.notifications.error(`Import failed: ${error.message}`);
          }
        });
        
        // Manage imports handler
        html.find('.manage-imports').click(() => {
          const collections = JSONImportManager.getAllCollections();
          let content = '<h3>Imported Collections</h3>';
          
          if (collections.length === 0) {
            content += '<p>No imported collections found.</p>';
          } else {
            collections.forEach(col => {
              const date = new Date(col.timestamp).toLocaleString();
              content += `
                <div style="margin: 10px 0; padding: 5px; border: 1px solid #ccc;">
                  <strong>${col.name}</strong> (${col.itemCount} items)<br>
                  <small>Imported: ${date}</small><br>
                  <button class="delete-import" data-id="${col.id}">Delete</button>
                </div>`;
            });
          }
          
          new Dialog({
            title: "Manage Imports",
            content: content,
            buttons: { close: { label: "Close" } },
            render: dlg => {
              dlg.find('.delete-import').click(function() {
                JSONImportManager.deleteCollection($(this).data('id'));
                ui.notifications.info("Collection deleted.");
                dlg.close();
                game.sanctumMerchant.openConfigDialog();
              });
            }
          }).render(true);
        });

        // Existing rarity tag handlers
        const savedTags = game.settings.get("sanctum-merchant", "tags").split(",").map(t => t.trim()).filter(Boolean);
        savedTags.forEach(tag => {
          const tagElem = $(`<span class="tag" data-tag="${tag}" style="display:inline-block;background:#444;color:white;padding:2px 6px;margin:2px;border-radius:4px;">
            ${tag} <button class="remove-tag" style="background:none;border:none;color:red;margin-left:4px;cursor:pointer;">x</button>
          </span>`);
          tagElem.find(".remove-tag").click(() => tagElem.remove());
          html.find(".rarity-tags").append(tagElem);
        });

        html.find('[name="rarity-preset"]').change(function () {
          const presetValue = $(this).val();
          const tagList = html.find(".rarity-tags");
          tagList.empty();
          if (presetValue && rarityPresets[presetValue]) {
            rarityPresets[presetValue].forEach(tag => {
              const tagElem = $(`<span class="tag" data-tag="${tag}" style="display:inline-block;background:#444;color:white;padding:2px 6px;margin:2px;border-radius:4px;">
                ${tag}
              </span>`);
              tagList.append(tagElem);
            });
          }
        });

        html.find(".add-rarity").click(() => {
          const select = html.find('[name="rarity-select"]');
          const tag = select.val();
          const tagList = html.find(".rarity-tags");
          if (!tagList.find(`[data-tag="${tag}"]`).length) {
            const tagElem = $(`<span class="tag" data-tag="${tag}" style="display:inline-block;background:#444;color:white;padding:2px 6px;margin:2px;border-radius:4px;">
              ${tag} <button class="remove-tag" style="background:none;border:none;color:red;margin-left:4px;cursor:pointer;">x</button>
            </span>`);
            tagElem.find(".remove-tag").click(() => tagElem.remove());
            tagList.append(tagElem);
          }
        });
      }
    }, {
      width: 700,
      height: 650,
      resizable: true
    }).render(true);
  };

  game.sanctumMerchant.populateMerchantWithJSON = async function(options = {}) {
    const {
      source,
      sourceType = 'compendium',
      rollFormula = "1d6+2",
      allowedTypes = ["weapon", "equipment", "consumable", "loot", "container", "tool"],
      rareTags = ["rare", "very rare", "legendary"],
      strictRarity = true,
      merchantMessage = "🧿 Got somethin' that might interest ya'!"
    } = options;

    let items = [];
    let sourceName = "";

    if (sourceType === 'json') {
      const collection = JSONImportManager.getCollection(source);
      if (!collection) {
        ui.notifications.error("JSON collection not found. It may have expired.");
        return;
      }
      items = collection.items;
      sourceName = collection.name;
    } else {
      const pack = game.packs.get(source);
      if (!pack) {
        ui.notifications.error(`Compendium "${source}" not found.`);
        return;
      }
      
      const index = await pack.getIndex({
        fields: ["type", "name", "flags", "system"]
      });
      
      items = index.map(item => ({
        ...item,
        system: item.system || {}
      }));
      sourceName = pack.title;
    }

    console.log("🔍 Filtering Debug Info:");
    console.log("- Allowed Types:", allowedTypes);
    console.log("- Total items before filtering:", items.length);
    console.log("- Sample item types:", items.slice(0, 10).map(i => ({ name: i.name, type: i.type })));
    
    const filteredItems = items.filter(item => {
      const itemType = (item.type || '').toLowerCase();
      const matches = allowedTypes.some(allowedType => 
        allowedType.toLowerCase() === itemType
      );
      
      if (items.indexOf(item) < 5) {
        console.log(`- Item "${item.name}" (type: "${item.type}") matches: ${matches}`);
      }
      
      return matches;
    });
    
    console.log("- Items after type filtering:", filteredItems.length);
    
    function normalizeRarity(str) {
      return str?.toLowerCase().trim().replace(/[\s_-]+/g, " ") || null;
    }
    
    const rareTagsNormalized = rareTags.map(t => normalizeRarity(t));
    const weightedIds = [];

    console.log("🎯 Rarity Filtering Debug:");
    console.log("- Selected rarity tags:", rareTags);
    console.log("- Normalized rarity tags:", rareTagsNormalized);
    console.log("- Strict rarity mode:", strictRarity);

    for (const item of filteredItems) {
      let itemRarity;
      if (sourceType === 'json') {
        itemRarity = normalizeRarity(item.system?.rarity);
      } else {
        let systemRarity = item.system?.rarity;
        
        if (systemRarity === 'veryRare') systemRarity = 'very rare';
        if (systemRarity === 'legendary') systemRarity = 'legendary';
        if (systemRarity === 'rare') systemRarity = 'rare';
        if (systemRarity === 'uncommon') systemRarity = 'uncommon';
        if (systemRarity === 'common') systemRarity = 'common';
        if (!systemRarity || systemRarity.trim() === '') systemRarity = 'common';
        
        itemRarity = normalizeRarity(systemRarity);
      }
      
      if (filteredItems.indexOf(item) < 3) {
        console.log(`🔍 Item structure for "${item.name}":`);
        console.log("- item.system:", item.system);
        console.log("- Raw systemRarity:", item.system?.rarity);
        console.log(`- Final detected rarity: "${itemRarity}"`);
        console.log(`- Matches our tags: ${rareTagsNormalized.includes(itemRarity)}`);
      }
      
      if (strictRarity) {
        if (rareTagsNormalized.includes(itemRarity)) {
          weightedIds.push(...Array(3).fill(item._id));
        }
      } else {
        const weight = rareTagsNormalized.includes(itemRarity) ? 3 : 1;
        weightedIds.push(...Array(weight).fill(item._id));
      }
    }

    console.log("- Items after rarity filtering:", weightedIds.length);

    if (weightedIds.length === 0) {
      ui.notifications.warn(`No items found matching criteria in "${sourceName}".`);
      return;
    }

    const roll = await new Roll(rollFormula).evaluate({ async: true });
    const numToSelect = Math.min(Math.max(1, roll.total), weightedIds.length);
    
    const selectedIds = shuffleArray([...weightedIds]).slice(0, numToSelect);
    const uniqueIds = [...new Set(selectedIds)];
    
    let docs = [];
    if (sourceType === 'json') {
      const collection = JSONImportManager.getCollection(source);
      docs = uniqueIds.map(id => collection.items.find(i => i._id === id)).filter(Boolean);
    } else {
      const pack = game.packs.get(source);
      const loadedDocs = await Promise.all(uniqueIds.map(id => pack.getDocument(id)));
      docs = loadedDocs.map(d => d.toObject());
    }

    // Try to get merchant from Item Piles integration
    let merchant = SanctumMerchantItemPilesIntegration.getCurrentMerchant();
    let stockedCount = 0;

    // Fallback to controlled tokens if no Item Piles merchant
    const tokensToStock = merchant ? [{ actor: merchant, name: merchant.name }] : canvas.tokens.controlled;

    for (const token of tokensToStock) {
      const actor = token.actor;
      if (!actor) continue;

      const success = await SanctumMerchantItemPilesIntegration.addItemsToMerchant(actor, docs);
      
      if (success) {
        stockedCount++;
        
        const playerRecipients = game.users.filter(u => u.active && !u.isGM).map(u => u.id);
        const itemNames = docs.map(i => i.name).join(", ");
        const merchantName = token.name || actor.name || "The Merchant";

        ChatMessage.create({
          speaker: { alias: merchantName },
          content: `${merchantMessage}<br><strong>New Items:</strong> ${itemNames}`,
          whisper: playerRecipients
        });
        
        ui.notifications.info(`Stocked ${docs.length} items from "${sourceName}" to ${merchantName}`);
      }
    }
    
    if (stockedCount === 0) {
      ui.notifications.warn("No merchants were stocked. Make sure you have a merchant selected or controlled.");
    }
  };

  game.sanctumMerchant.auditTags = async function () {
    const itemSource = game.settings.get("sanctum-merchant", "itemSource")
      || `compendium:${game.settings.get("sanctum-merchant", "compendium")}`;

    let [sourceType, sourceId] = itemSource.split(':');
    if (!sourceType || !sourceId) {
      sourceType = 'compendium';
      sourceId = game.settings.get("sanctum-merchant", "compendium");
    }

    let items = [];
    let sourceTitle = "";

    if (sourceType === 'json') {
      const col = JSONImportManager.getCollection(sourceId);
      if (!col) return ui.notifications.error("JSON collection not found. It may have expired.");
      items = col.items.map(i => ({ ...i, system: i.system || {}, _id: i._id }));
      sourceTitle = col.name;
    } else {
      const pack = game.packs.get(sourceId);
      if (!pack) return ui.notifications.error(`Compendium "${sourceId}" not found.`);
      const index = await pack.getIndex({ fields: ["name", "type", "flags", "system"] });
      items = index.map(i => ({ ...i, system: i.system || {}, _id: i._id }));
      sourceTitle = pack.title;
    }

    const tagGroups = {};
    for (const tag of availableRarityTags) tagGroups[tag] = [];

    for (const item of items) {
      const nameLC = (item.name || "").toLowerCase();

      const ddbType = item.flags?.ddbimporter?.dndbeyond?.type?.toLowerCase();
      const systemRarity = item.system?.rarity?.toLowerCase();

      const candidates = [ddbType, systemRarity];
      let detectedTag = null;
      let highestWeight = 0;

      for (const field of candidates) {
        if (field && availableRarityTags.includes(field) && (rarityWeights[field] || 0) > highestWeight) {
          detectedTag = field;
          highestWeight = rarityWeights[field];
        }
      }

      if (!detectedTag) {
        const fullText = `${item.name} ${JSON.stringify(item.system||{})} ${JSON.stringify(item.flags||{})}`
          .toLowerCase().replace(/[\s_-]+/g, "");
        for (const tag of availableRarityTags) {
          const normalized = tag.toLowerCase().replace(/[\s_-]+/g, "");
          const pattern = new RegExp("\\b" + normalized + "\\b", "i");
          if (pattern.test(fullText) && (rarityWeights[tag] || 0) > highestWeight) {
            detectedTag = tag;
            highestWeight = rarityWeights[tag];
          }
        }
      }

      if (!detectedTag && fallbackCommon.some(f => nameLC.includes(f))) {
        detectedTag = "common";
      }

      if (detectedTag) {
        tagGroups[detectedTag].push({ item, tag: detectedTag });
      }
    }

    let output = `
      <h2>🧮 Rarity Tag Audit — ${sourceTitle}</h2>
      <div style="margin-bottom:10px;">
        <label for="name-filter">Filter by name:</label>
        <input type="text" id="name-filter" placeholder="e.g. potion, scroll, hat" style="width: 220px; margin-left: 6px;">
      </div>
      <div style="height:calc(100% - 60px);overflow-y:auto;" id="audit-results">
    `;

    for (const [tag, arr] of Object.entries(tagGroups)) {
      output += `
        <div class="sanctum-tag-group" style="margin-bottom:10px;">
          <div class="sanctum-tag-header" data-tag="${tag}" style="cursor:pointer;font-weight:bold;background:#333;color:#fff;padding:6px;border-radius:4px;display:flex;justify-content:space-between;align-items:center;">
            <span class="sanctum-tag-label">▶ ${tag} (${arr.length})</span>
            <button type="button" class="stock-group" data-tag="${tag}" style="padding:2px 6px;font-size:0.75em;background:#3fa9f5;color:white;border:none;border-radius:3px;cursor:pointer;">Stock All 🛒</button>
          </div>
          <ul class="sanctum-tag-items" style="display:none;margin-top:6px;padding-left:20px;">
            ${arr.map(({ item, tag }) => `
              <li style="margin-bottom: 4px;">
                <div style="display: inline-block; white-space: nowrap;">
                  <span class="sanctum-item-link"
                        data-source-type="${sourceType}"
                        data-source-id="${sourceId}"
                        data-id="${item._id}"
                        style="color:#3fa9f5;cursor:pointer;text-decoration:underline;">
                    ${rarityIcons[tag] || ""} ${item.name}
                  </span>
                  <button class="stock-item"
                          data-source-type="${sourceType}"
                          data-source-id="${sourceId}"
                          data-id="${item._id}"
                          title="Stock this item to selected token(s)"
                          style="margin-left: 6px; width: 32px; height: 24px; font-size: 0.8em; background: #3fa9f5; color: white; border: none; border-radius: 3px; cursor: pointer; text-align: center; line-height: 1; vertical-align: middle;">
                    🛒
                  </button>
                </div>
              </li>
            `).join("")}
          </ul>
        </div>
      `;
    }

    output += `</div>`;

    new Dialog({
      title: "Sanctum Merchant Tag Audit",
      content: output,
      buttons: { close: { label: "Close", callback: () => {} } },
      render: html => {
        html.find(".sanctum-tag-header").on("click", function () {
          const itemsList = $(this).next(".sanctum-tag-items");
          const isVisible = itemsList.is(":visible");
          itemsList.slideToggle(150);
          $(this).find(".sanctum-tag-label").text(`${isVisible ? "▶" : "▼"} ${$(this).data("tag")} (${itemsList.find("li:visible").length || itemsList.find("li").length})`);
        });

        html.find(".sanctum-item-link").on("click", async function (event) {
          event.preventDefault();
          const st = this.dataset.sourceType;
          const sid = this.dataset.sourceId;
          const id = this.dataset.id;

          if (st === 'compendium') {
            const pack = game.packs.get(sid);
            if (!pack) return;
            const doc = await pack.getDocument(id);
            if (doc) doc.sheet.render(true);
          } else {
            const col = JSONImportManager.getCollection(sid);
            if (!col) return;
            const data = col.items.find(i => i._id === id);
            if (!data) return;
            const tmp = new CONFIG.Item.documentClass(data, {temporary: true});
            tmp.sheet.render(true);
          }
        });

        html.find(".stock-item").on("click", async function () {
          const st = this.dataset.sourceType;
          const sid = this.dataset.sourceId;
          const id = this.dataset.id;

          let itemData;

          if (st === 'compendium') {
            const pack = game.packs.get(sid);
            if (!pack) return;
            const doc = await pack.getDocument(id);
            if (!doc) return;
            itemData = doc.toObject();
          } else {
            const col = JSONImportManager.getCollection(sid);
            if (!col) return;
            itemData = col.items.find(i => i._id === id);
            if (!itemData) return;
          }

          const merchant = SanctumMerchantItemPilesIntegration.getCurrentMerchant();
          if (merchant) {
            const success = await SanctumMerchantItemPilesIntegration.addItemsToMerchant(merchant, [itemData]);
            if (success) {
              ui.notifications.info(`${itemData.name} stocked to ${merchant.name}`);
            }
          } else {
            for (const token of canvas.tokens.controlled) {
              const actor = token.actor;
              if (!actor) continue;
              const success = await SanctumMerchantItemPilesIntegration.addItemsToMerchant(actor, [itemData]);
              if (success) {
                ui.notifications.info(`${itemData.name} stocked to ${actor.name}`);
              }
            }
          }
        });

        html.find("#name-filter").on("keydown", function (event) {
          if (event.key === "Enter") {
            const query = this.value.trim().toLowerCase();
            const groups = html.find(".sanctum-tag-group");

            groups.each(function () {
              const group = $(this);
              const items = group.find("li");
              let matchCount = 0;
              items.each(function () {
                const itemName = $(this).find(".sanctum-item-link").text().toLowerCase();
                const matches = itemName.includes(query);
                $(this).toggle(matches);
                if (matches) matchCount++;
              });
              const header = group.find(".sanctum-tag-header");
              const list = group.find(".sanctum-tag-items");
              if (matchCount > 0) { group.show(); list.show(); header.find(".sanctum-tag-label").text(`▼ ${header.data("tag")} (${matchCount})`); }
              else { group.hide(); }
            });
          }
        });

        html.find(".stock-group").on("click", async function (event) {
          event.preventDefault();
          event.stopPropagation();

          const group = $(this).closest(".sanctum-tag-group");
          const links = group.find(".sanctum-item-link");
          const merchant = SanctumMerchantItemPilesIntegration.getCurrentMerchant();
          const tokensToStock = merchant ? [{ actor: merchant }] : canvas.tokens.controlled;

          for (const token of tokensToStock) {
            const actor = token.actor;
            if (!actor) continue;

            for (const el of links) {
              const st = el.dataset.sourceType;
              const sid = el.dataset.sourceId;
              const id = el.dataset.id;

              let itemData;
              if (st === 'compendium') {
                const pack = game.packs.get(sid);
                if (!pack) continue;
                const doc = await pack.getDocument(id);
                if (!doc) continue;
                itemData = doc.toObject();
              } else {
                const col = JSONImportManager.getCollection(sid);
                if (!col) continue;
                itemData = col.items.find(i => i._id === id);
                if (!itemData) continue;
              }

              const success = await SanctumMerchantItemPilesIntegration.addItemsToMerchant(actor, [itemData]);
              if (success) {
                ui.notifications.info(`${itemData.name} stocked to ${actor.name}`);
              }
            }
          }
        });
      }
    }, { width: 700, height: 600, resizable: true }).render(true);
  };
});