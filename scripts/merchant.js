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
    config: false, // hide from settings UI; controlled by dialog
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

// --- Shuffle utility ---
function shuffleArray(array) {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

// --- Available rarity tags ---
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

Hooks.once("ready", () => {
  game.sanctumMerchant = game.sanctumMerchant || {};
  
  // --- Enhanced Config dialog with JSON import ---
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
          callback: async (html) => {
            try {
              const sourceValue = html.find('[name="source"]').val();
              // Save the selected source for next time
              await game.settings.set("sanctum-merchant", "itemSource", sourceValue);

              let sourceType, sourceId;

              if (sourceValue && sourceValue.includes(':')) {
                [sourceType, sourceId] = sourceValue.split(':');
              } else {
                sourceType = 'compendium';
                sourceId = sourceValue || game.settings.get("sanctum-merchant", "compendium");
              }
              
              const formula = html.find('[name="formula"]').val();
              // Get selected item types from the tags
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
                allowedTypes: types, // Now using the tag-selected types
                rareTags: tags,
                strictRarity,
                merchantMessage
              });
            } catch (err) {
              console.error("Merchant stocking failed:", err);
              ui.notifications.error("Something went wrong stocking the merchant.");
            }

            game.sanctumMerchant.openConfigDialog();
            return false;
          }
        },
        clear: {
          label: "Clear Inventory",
          callback: async () => {
            try {
              for (const token of canvas.tokens.controlled) {
                const actor = token.actor;
                if (!actor) continue;
                const itemIds = actor.items.map(i => i.id);
                if (itemIds.length > 0) {
                  await actor.deleteEmbeddedDocuments("Item", itemIds);
                  ui.notifications.info(`${actor.name}'s inventory cleared.`);
                } else {
                  ui.notifications.warn(`${actor.name} has no items to remove.`);
                }
              }
            } catch (err) {
              console.error("Inventory clear failed:", err);
              ui.notifications.error("Something went wrong clearing the merchant.");
            }
            game.sanctumMerchant.openConfigDialog();
          }
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
          // Keep "compendium" in sync if the user picked a compendium
          if (val?.startsWith("compendium:")) {
            await game.settings.set("sanctum-merchant", "compendium", val.split(':')[1]);
          }
          
          // Clear existing types and reload
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
        }, 500); // Small delay to let types populate first

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
            game.sanctumMerchant.openConfigDialog(); // Refresh to show new import
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

  // The rest of the code continues with populateMerchantWithJSON, auditTags, etc...
  // (keeping the existing implementation)

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

    // FIXED: Case-insensitive type filtering with debugging
    console.log("🔍 Filtering Debug Info:");
    console.log("- Allowed Types:", allowedTypes);
    console.log("- Total items before filtering:", items.length);
    console.log("- Sample item types:", items.slice(0, 10).map(i => ({ name: i.name, type: i.type })));
    
    const filteredItems = items.filter(item => {
      const itemType = (item.type || '').toLowerCase();
      const matches = allowedTypes.some(allowedType => 
        allowedType.toLowerCase() === itemType
      );
      
      // Debug first few items
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
        // FIXED: Only use systemRarity, don't use ddbType (that's weapon type, not rarity)
        let systemRarity = item.system?.rarity;
        
        // Handle D&D Beyond format conversions
        if (systemRarity === 'veryRare') systemRarity = 'very rare';
        if (systemRarity === 'legendary') systemRarity = 'legendary';
        if (systemRarity === 'rare') systemRarity = 'rare';
        if (systemRarity === 'uncommon') systemRarity = 'uncommon';
        if (systemRarity === 'common') systemRarity = 'common';
        if (!systemRarity || systemRarity.trim() === '') systemRarity = 'common'; // Default empty to common
        
        itemRarity = normalizeRarity(systemRarity);
      }
      
      // Debug first few items to see their actual structure
      if (filteredItems.indexOf(item) < 3) {
        console.log(`🔍 Item structure for "${item.name}":`);
        console.log("- item.system:", item.system);
        console.log("- item.flags?.ddbimporter?.dndbeyond:", item.flags?.ddbimporter?.dndbeyond);
        console.log("- Raw ddbType:", item.flags?.ddbimporter?.dndbeyond?.type);
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

    for (const token of canvas.tokens.controlled) {
      const actor = token.actor;
      if (!actor) continue;

      const actorItems = new Set(actor.items.map(i => i.name));
      const newItems = docs.filter(d => !actorItems.has(d.name));

      if (newItems.length > 0) {
        await actor.createEmbeddedDocuments("Item", newItems);

        const playerRecipients = game.users.filter(u => u.active && !u.isGM).map(u => u.id);
        const itemNames = newItems.map(i => i.name).join(", ");
        const merchantName = token.name || "The Merchant";

        ChatMessage.create({
          speaker: { alias: merchantName },
          content: `${merchantMessage}<br><strong>New Items:</strong> ${itemNames}`,
          whisper: playerRecipients
        });
        
        ui.notifications.info(`Stocked ${newItems.length} items from "${sourceName}" to ${merchantName}`);
      }
    }
  };

  // Keep existing auditTags implementation
  game.sanctumMerchant.auditTags = async function () {
    // Read the currently selected source
    const itemSource = game.settings.get("sanctum-merchant", "itemSource")
      || `compendium:${game.settings.get("sanctum-merchant", "compendium")}`;

    let [sourceType, sourceId] = itemSource.split(':');
    if (!sourceType || !sourceId) {
      sourceType = 'compendium';
      sourceId = game.settings.get("sanctum-merchant", "compendium");
    }

    // Load items depending on sourceType
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

    // Build groups
    const tagGroups = {};
    for (const tag of availableRarityTags) tagGroups[tag] = [];

    for (const item of items) {
      const nameLC = (item.name || "").toLowerCase();

      // structured rarity candidates
      const ddbType = item.flags?.ddbimporter?.dndbeyond?.type?.toLowerCase();
      const systemRarity = item.system?.rarity?.toLowerCase();

      const candidates = [ddbType, systemRarity];
      let detectedTag = null;
      let highestWeight = 0;

      // Prefer structured fields
      for (const field of candidates) {
        if (field && availableRarityTags.includes(field) && (rarityWeights[field] || 0) > highestWeight) {
          detectedTag = field;
          highestWeight = rarityWeights[field];
        }
      }

      // Fallback to text
      if (!detectedTag) {
        const fullText = `${item.name} ${JSON.stringify(item.system||{})} ${JSON.stringify(item.flags||{})}`
          .toLowerCase().replace(/[\s_-]+/g, "");
        for (const tag of availableRarityTags) {
          const normalized = tag.toLowerCase().replace(/[\s_-]+/g, "");
          const pattern = new RegExp(`\\b${normalized}\\b`, "i");
          if (pattern.test(fullText) && (rarityWeights[tag] || 0) > highestWeight) {
            detectedTag = tag;
            highestWeight = rarityWeights[tag];
          }
        }
      }

      // Final fallback to "common" keywords
      if (!detectedTag && fallbackCommon.some(f => nameLC.includes(f))) {
        detectedTag = "common";
      }

      if (detectedTag) {
        tagGroups[detectedTag].push({ item, tag: detectedTag });
      }
    }

    // Render dialog (same as before)
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
        // Keep existing audit dialog handlers
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

          for (const token of canvas.tokens.controlled) {
            const actor = token.actor;
            if (!actor) continue;

            const actorItems = new Set(actor.items.map(i => i.name));
            if (!actorItems.has(itemData.name)) {
              await actor.createEmbeddedDocuments("Item", [itemData]);
              ui.notifications.info(`${itemData.name} stocked to ${actor.name}`);
            } else {
              ui.notifications.warn(`${actor.name} already has ${itemData.name}`);
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

          for (const token of canvas.tokens.controlled) {
            const actor = token.actor;
            if (!actor) continue;
            const actorItems = new Set(actor.items.map(i => i.name));

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

              if (!actorItems.has(itemData.name)) {
                await actor.createEmbeddedDocuments("Item", [itemData]);
                ui.notifications.info(`${itemData.name} stocked to ${actor.name}`);
              } else {
                ui.notifications.warn(`${actor.name} already has ${itemData.name}`);
              }
            }
          }
        });
      }
    }, { width: 700, height: 600, resizable: true }).render(true);
  };

  // --- Append GM-only button to Actors tab ---
  const injectMerchantButton = () => {
    if (!game.user.isGM) return;

    const actorsTab = document.querySelector("#sidebar .tab[data-tab='actors']");
    if (!actorsTab) {
      setTimeout(injectMerchantButton, 100);
      return;
    }

    const headerActions = actorsTab.querySelector(".header-actions");
    if (!headerActions || actorsTab.querySelector("#sanctumMerchantButton")) return;

    const button = document.createElement("button");
    button.id = "sanctumMerchantButton";
    button.style.flexBasis = "auto";
    button.innerHTML = `<i class="fas fa-coins"></i> Stock Merchant`;

    button.addEventListener("click", () => {
      game.sanctumMerchant.openConfigDialog();
    });

    headerActions.appendChild(button);
    console.log("🛒 Sanctum Merchant button appended for GM!");
  };

  injectMerchantButton();
});