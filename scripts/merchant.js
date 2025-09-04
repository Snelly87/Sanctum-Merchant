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
    default: "weapon,consumable,equipment,loot"
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

game.settings.register("sanctum-merchant", "lastSource", {
  name: "Last Selected Source",
  hint: "Remember the last selected item source",
  scope: "world",
  config: false,  // Hidden from config menu
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
          
          <div class="form-group">
            <label>Item Source</label>
            <select name="source">
              ${sourceOptions}
            </select>
          </div>
          
          <div class="form-group">
            <label>Roll Formula</label>
            <input type="text" name="formula" />
          </div>
          <div class="form-group">
            <label>Allowed Types (comma-separated)</label>
            <input type="text" name="types" />
          </div>
          <div class="form-group">
            <label>Rarity Preset</label>
            <select name="rarity-preset">
              <option value="">None</option>
              <option value="starter">Starter Gear</option>
              <option value="vault">Legendary Vault</option>
              <option value="bazaar">Exotic Bazaar</option>
              <option value="cursed">Cursed Curiosities</option>
              <option value="chaos">Chaos Stock</option>
            </select>
          </div>
          <div class="form-group">
            <label>Select Rarity Tags</label>
            <select name="rarity-select">
              ${availableRarityTags.map(tag => `<option value="${tag}">${tag}</option>`).join("")}
            </select>
            <button type="button" class="add-rarity">Add</button>
            <div class="rarity-tags" style="margin-top:5px;"></div>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" name="strictRarity" />
              Strict rarity filtering
            </label>
            <p style="font-size:0.8em;margin-top:4px;">
              When checked, only items with selected rarity tags will be considered.
              When unchecked, all items are eligible but matching tags are favored.
            </p>
          </div>
          <div class="form-group">
            <label>Merchant Message</label>
            <input type="text" name="merchantMessage" />
          </div>
        </form>
      `,
      buttons: {
        confirm: {
          label: "Stock Merchant",
          callback: async (html) => {
            try {
				const sourceValue = html.find('[name="source"]').val();
				// Save the selected source for next time
				await game.settings.set("sanctum-merchant", "lastSource", sourceValue);

				let sourceType, sourceId;

				if (sourceValue && sourceValue.includes(':')) {
				  [sourceType, sourceId] = sourceValue.split(':');
				} else {
				  sourceType = 'compendium';
				  sourceId = sourceValue || game.settings.get("sanctum-merchant", "compendium");
				}
              
              const formula = html.find('[name="formula"]').val();
              const types = html.find('[name="types"]').val().split(",").map(t => t.trim()).filter(Boolean);
              const presetName = html.find('[name="rarity-preset"]').val();
              const merchantMessage = html.find('[name="merchantMessage"]').val();
              const strictRarity = html.find('[name="strictRarity"]').is(":checked");

              let tags;
              if (presetName && rarityPresets[presetName]) {
                tags = rarityPresets[presetName];
              } else {
                tags = Array.from(html.find(".rarity-tags .tag")).map(el => el.dataset.tag.toLowerCase());
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
              await game.settings.set("sanctum-merchant", "types", "weapon,consumable,equipment,loot");
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
        // Set default values
        const lastSource = game.settings.get("sanctum-merchant", "lastSource");
			if (lastSource && html.find(`[name="source"] option[value="${lastSource}"]`).length > 0) {
			  // Use last selected source if it still exists
			  html.find('[name="source"]').val(lastSource);
			} else {
			  // Fall back to default compendium
			  const defaultSource = game.settings.get("sanctum-merchant", "compendium");
			  html.find('[name="source"]').val(`compendium:${defaultSource}`);
			}
        html.find('[name="formula"]').val(game.settings.get("sanctum-merchant", "formula"));
        html.find('[name="types"]').val(game.settings.get("sanctum-merchant", "types"));
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
      height: 600,
      resizable: true
    }).render(true);

  };





  // --- Merchant stocking logic ---
game.sanctumMerchant.populateMerchant = async function(options = {}) {
  const {
    compendiumName = "world.ddb-oathbreaker-ddb-items",
    rollFormula = "1d6+2",
    allowedTypes = ["weapon", "consumable", "equipment", "loot"],
    rareTags = ["rare", "legendary", "exotic", "sanctum-blessed"],
    strictRarity = true,
    merchantMessage
  } = options;

  const fallbackCommon = [
    "potion", "scroll", "dagger", "leather", "torch", "rations",
    "sling", "club", "robe", "kit", "tools", "basic", "simple"
  ];

  const pack = game.packs.get(compendiumName);
  if (!pack) {
    ui.notifications.error(`Compendium "${compendiumName}" not found.`);
    return;
  }

  // Load only necessary fields from the compendium index for efficiency
  const index = await pack.getIndex({
    fields: ["type", "name", "flags", "system"]
  });

  const filteredItems = index.filter(i => allowedTypes.includes(i.type));
  const debug = options.debug || false;

  // --- Rarity normalization helper ---
  function normalizeRarity(str) {
    return str?.toLowerCase().trim().replace(/[\s_-]+/g, " ") || null;
  }

  const rareTagsNormalized = rareTags.map(t => normalizeRarity(t));
  const weightedIds = [];

  for (const item of filteredItems) {
    const name = item.name?.toLowerCase() || "";
    let weight = 1;

    // -----------------------------
    // Audit-style rarity detection
    // -----------------------------
    const ddbType = item.flags?.ddbimporter?.dndbeyond?.type?.toLowerCase();
    const systemRarity = item.system?.rarity?.toLowerCase();

    let detectedTag = null;

    // Prefer structured fields first
    for (const field of [ddbType, systemRarity]) {
      if (field && rareTagsNormalized.includes(normalizeRarity(field))) {
        detectedTag = normalizeRarity(field);
        break;
      }
    }

    // Fallback to name + system + flags text search
    if (!detectedTag) {
      const fullText = `${item.name} ${JSON.stringify(item.system || {})} ${JSON.stringify(item.flags || {})}`.toLowerCase().replace(/[\s_-]+/g, "");
      for (const tag of rareTagsNormalized) {
        if (fullText.includes(tag.replace(/\s/g, ""))) {
          detectedTag = tag;
          break;
        }
      }
    }

    // Debug example
    if (item.name.toLowerCase().includes("potion of speed")) {
      console.log("DEBUG RARITY:", {
        name: item.name,
        ddbType,
        systemRarity,
        detectedTag,
        allFlags: item.flags?.ddbimporter?.dndbeyond
      });
    }

    // -----------------------------
    // Apply strict or loose rarity rules
    // -----------------------------
    if (strictRarity) {
      if (detectedTag && rareTagsNormalized.includes(detectedTag)) {
        weight = 3;
        weightedIds.push(...Array(weight).fill(item._id));
      } else {
        console.debug("Skipped (rarity mismatch):", { name: item.name, detectedTag, allowedTags: rareTagsNormalized });
      }
    } else {
      const matchesTag = detectedTag && rareTagsNormalized.includes(detectedTag);
      const matchesFallback = rareTagsNormalized.includes("common") && fallbackCommon.some(f => name.includes(f));
      if (matchesTag || matchesFallback) weight = 3;
      weightedIds.push(...Array(weight).fill(item._id));
    }
  }

  if (weightedIds.length === 0) {
    ui.notifications.warn("No items found matching the selected criteria.");
    return;
  }

  const roll = await (new Roll(rollFormula)).evaluate({ async: true });
  const numToSelect = Math.min(Math.max(0, roll.total ?? 0), weightedIds.length);

  const selectedIds = shuffleArray(weightedIds).slice(0, numToSelect);
  const uniqueIds = [...new Set(selectedIds)];

  // Load full item documents only for the selected unique items
  const docs = await Promise.all(uniqueIds.map(id => pack.getDocument(id)));

  for (const token of canvas.tokens.controlled) {
    const actor = token.actor;
    if (!actor) continue;

    const actorItems = new Set(actor.items.map(i => i.name));
    const newItems = docs.filter(d => !actorItems.has(d.name)).map(d => d.toObject());

    if (newItems.length > 0) {
      await actor.createEmbeddedDocuments("Item", newItems);

      const playerRecipients = game.users.filter(u => u.active && !u.isGM).map(u => u.id);
      const itemNames = newItems.map(i => i.name).join(", ");
      const merchantName = token.name || "The Merchant";
      const message = merchantMessage || `🧿 Got somethin' that might interest ya'!`;

      ChatMessage.create({
        speaker: { alias: merchantName },
        content: `${message} : <strong>${itemNames}</strong>. Fine items, indeed!`,
        whisper: playerRecipients
      });
    }
  }
};

game.sanctumMerchant.populateMerchantWithJSON = async function(options = {}) {
  const {
    source,
    sourceType = 'compendium',
    rollFormula = "1d6+2",
    allowedTypes = ["weapon", "equipment", "consumable", "loot", "container", "backpack"],
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

  const filteredItems = items.filter(item => allowedTypes.includes(item.type));
  
  function normalizeRarity(str) {
    return str?.toLowerCase().trim().replace(/[\s_-]+/g, " ") || null;
  }
  
  const rareTagsNormalized = rareTags.map(t => normalizeRarity(t));
  const weightedIds = [];

  for (const item of filteredItems) {
    let itemRarity;
    if (sourceType === 'json') {
      itemRarity = normalizeRarity(item.system?.rarity);
    } else {
      const ddbType = item.flags?.ddbimporter?.dndbeyond?.type;
      const systemRarity = item.system?.rarity;
      itemRarity = normalizeRarity(ddbType || systemRarity || 'common');
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

		game.sanctumMerchant.debugRarity = async function({
  compendiumName = "world.ddb-oathbreaker-ddb-items",
  rareTags = ["rare", "very rare", "legendary", "exotic", "sanctum-blessed"]
} = {}) {

  const pack = game.packs.get(compendiumName);
  if (!pack) return console.error(`Compendium "${compendiumName}" not found.`);

  const index = await pack.getIndex({ fields: ["name", "type", "flags", "system"] });
  const normalize = str => str?.toLowerCase().trim().replace(/[\s_-]+/g, " ") || null;
  const rareTagsNormalized = rareTags.map(normalize);

  const rows = [];

  for (const item of index) {
    const name = item.name || "";

    // Structured rarity detection
    const ddbType = item.flags?.ddbimporter?.dndbeyond?.type?.toLowerCase();
    const systemRarity = item.system?.rarity?.toLowerCase();
    let detectedTag = null;

    for (const field of [ddbType, systemRarity]) {
      if (field && rareTagsNormalized.includes(normalize(field))) {
        detectedTag = normalize(field);
        break;
      }
    }

    // Fallback to text search
    if (!detectedTag) {
      const fullText = `${item.name} ${JSON.stringify(item.system || {})} ${JSON.stringify(item.flags || {})}`.toLowerCase().replace(/[\s_-]+/g, "");
      for (const tag of rareTagsNormalized) {
        if (fullText.includes(tag.replace(/\s/g, ""))) {
          detectedTag = tag;
          break;
        }
      }
    }

    const included = detectedTag && rareTagsNormalized.includes(detectedTag);
    rows.push({
      Name: item.name,
      Type: item.type,
      DDBType: ddbType,
      SystemRarity: systemRarity,
      Detected: detectedTag,
      Matches: included
    });
  }

  console.table(rows);
  console.log(`🧾 Total items matching allowed tags: ${rows.filter(r => r.Matches).length}`);
};

game.sanctumMerchant.auditTags = async function () {

  const compendiumName = game.settings.get("sanctum-merchant", "compendium");

  const pack = game.packs.get(compendiumName);

  if (!pack) return ui.notifications.error(`Compendium "${compendiumName}" not found.`);



  const index = await pack.getIndex({ fields: ["name", "type", "flags", "system"] });

  const tagGroups = {};



  for (const tag of availableRarityTags) {

    tagGroups[tag] = [];

  }



	for (const item of index) {

	  const name = item.name?.toLowerCase() || "";



	  // 🎯 Structured rarity fields

	  const ddbType = item.flags?.ddbimporter?.dndbeyond?.type?.toLowerCase();

	  const systemRarity = item.system?.rarity?.toLowerCase();



	  const rarityFields = [ddbType, systemRarity];



	  let detectedTag = null;

	  let highestWeight = 0;



	  // 🧠 Prioritize structured fields

	  for (const field of rarityFields) {

		if (availableRarityTags.includes(field) && rarityWeights[field] > highestWeight) {

		  detectedTag = field;

		  highestWeight = rarityWeights[field];

		}

	  }



	  // 🧪 Fallback to name-based detection

	  if (!detectedTag) {

		const fullText = `${item.name} ${JSON.stringify(item.system || {})} ${JSON.stringify(item.flags || {})}`

		  .toLowerCase()

		  .replace(/[\s_-]+/g, "");



		for (const tag of availableRarityTags) {

		  const normalized = tag.toLowerCase().replace(/[\s_-]+/g, "");

		  const pattern = new RegExp(`\\b${normalized}\\b`, "i");

		  if (pattern.test(fullText) && rarityWeights[tag] > highestWeight) {

			detectedTag = tag;

			highestWeight = rarityWeights[tag];

		  }

		}

	  }



	  // 🧙‍♂️ Final fallback to "common" keywords

	  if (!detectedTag && fallbackCommon.some(f => name.includes(f))) {

		detectedTag = "common";

	  }



	  // ✅ Group the item

	  if (detectedTag) {

		tagGroups[detectedTag].push({ item, tag: detectedTag });

	  }



	  // 🧪 Optional debug log

	  //console.log(`🧪 ${item.name} → Tag: ${detectedTag} (Weight: ${highestWeight})`);

	}





			let output = `

		  <h2>🧮 Rarity Tag Audit</h2>

		  <div style="margin-bottom:10px;">

			<label for="name-filter">Filter by name:</label>

			<input type="text" id="name-filter" placeholder="e.g. potion, scroll, hat" style="width: 200px; margin-left: 6px;">

		  </div>

		  <div style="height:calc(100% - 40px);overflow-y:auto;" id="audit-results">

		`;





		for (const [tag, items] of Object.entries(tagGroups)) {

		  output += `

			<div class="sanctum-tag-group" style="margin-bottom:10px;">

			  <div class="sanctum-tag-header" data-tag="${tag}" style="cursor:pointer;font-weight:bold;background:#333;color:#fff;padding:6px;border-radius:4px;display:flex;justify-content:space-between;align-items:center;">

				  <span class="sanctum-tag-label">▶ ${tag} (${items.length})</span>

				  <button type="button" class="stock-group" data-tag="${tag}" style="padding:2px 6px;font-size:0.75em;background:#3fa9f5;color:white;border:none;border-radius:3px;cursor:pointer;">

					Stock All 🛒

				  </button>

				</div>



			  <ul class="sanctum-tag-items" style="display:none;margin-top:6px;padding-left:20px;">

				${items.map(({ item, tag }) => `

				  <li style="margin-bottom: 4px;">

					<div style="display: inline-block; white-space: nowrap;">

					  <span class="sanctum-item-link" data-pack="${compendiumName}" data-id="${item._id}"

						style="color:#3fa9f5;cursor:pointer;text-decoration:underline;">

						${rarityIcons[tag] || ""} ${item.name}

					  </span>

					  <button class="stock-item" data-pack="${compendiumName}" data-id="${item._id}"

						  title="Stock this item to selected token(s)"

						  style="margin-left: 6px; width: 32px; height: 24px; font-size: 0.8em; background: #3fa9f5; color: white; border: none; border-radius: 3px; cursor: pointer; text-align: center; line-height: 1; vertical-align: middle;">

						  🛒

						</button>

					</div>

				  </li>

				`).join("")}

			</div>

		  `;

		}



		  output += `</div>`;



			new Dialog({

			  title: "Sanctum Merchant Tag Audit",

			  content: output,

			  buttons: {

				close: {

				  label: "Close",

				  callback: () => {} 

				}

			  },

			  render: html => {

				html.find(".sanctum-item-link").on("click", async function (event) {

				  event.preventDefault();

				  const packName = this.dataset.pack;

				  const itemId = this.dataset.id;

				  const pack = game.packs.get(packName);

				  if (!pack) return;

				  const doc = await pack.getDocument(itemId);

				  if (doc) doc.sheet.render(true);

				});



				html.find(".sanctum-tag-header").on("click", function () {

				  const itemsList = $(this).next(".sanctum-tag-items");

				  const isVisible = itemsList.is(":visible");

				  itemsList.slideToggle(150);

				  $(this).html(`${isVisible ? "▶" : "▼"} ${$(this).text().slice(2)}`);

				});



				html.find(".stock-item").on("click", async function () {

				  const packName = this.dataset.pack;

				  const itemId = this.dataset.id;

				  const pack = game.packs.get(packName);

				  const doc = await pack.getDocument(itemId);

				  if (!doc) return;



				  for (const token of canvas.tokens.controlled) {

					const actor = token.actor;

					if (!actor) continue;



					const actorItems = new Set(actor.items.map(i => i.name));

					if (!actorItems.has(doc.name)) {

					  await actor.createEmbeddedDocuments("Item", [doc.toObject()]);

					  ui.notifications.info(`${doc.name} stocked to ${actor.name}`);

					} else {

					  ui.notifications.warn(`${actor.name} already has ${doc.name}`);

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



					  // Show group only if it has matches

					  group.toggle(matchCount > 0);



					  // Expand group if it has matches

					  const header = group.find(".sanctum-tag-header");

					  const list = group.find(".sanctum-tag-items");

					  if (matchCount > 0) {

						list.show();

						header.html(`▼ ${header.text().slice(2)}`);

					  } else {

						list.hide();

						header.html(`▶ ${header.text().slice(2)}`);

					  }

					});

				  }

				});

				html.closest(".app").on("keydown", function (event) {

					  if (event.key === "Enter") {

						const activeTag = event.target.tagName.toLowerCase();

						if (activeTag === "input") {

						  event.preventDefault();       // stops form submission

						  event.stopImmediatePropagation(); // blocks Foundry's internal handler

						  runNameFilter();              // manually trigger filter logic

						}

					  }

				});

				html.find(".stock-group").on("click", async function (event) {

				  event.preventDefault(); // prevent any default behavior

				  event.stopPropagation(); // prevent bubbling that might remove the button



				  const tag = this.dataset.tag;

				  const group = $(this).closest(".sanctum-tag-group");

				  const items = group.find(".sanctum-item-link");



				  if (!items.length) return;



				  for (const token of canvas.tokens.controlled) {

					const actor = token.actor;

					if (!actor) continue;



					const actorItems = new Set(actor.items.map(i => i.name));



					for (const el of items) {

					  const packName = el.dataset.pack;

					  const itemId = el.dataset.id;

					  const pack = game.packs.get(packName);

					  const doc = await pack.getDocument(itemId);

					  if (!doc) continue;



					  if (!actorItems.has(doc.name)) {

						await actor.createEmbeddedDocuments("Item", [doc.toObject()]);

						ui.notifications.info(`${doc.name} stocked to ${actor.name}`);

					  } else {

						ui.notifications.warn(`${actor.name} already has ${doc.name}`);

					  }

					}

				  }

				});





				function runNameFilter() {

				  const query = html.find("#name-filter").val().trim().toLowerCase();

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



					if (matchCount > 0) {

					  group.show();

					  list.show();

					  header.html(`▼ ${header.text().slice(2)}`);

					} else {

					  group.hide();

					}

				  });

				}

			  }

			}, {

			  width: 700,

			  height: 600,

			  resizable: true

			}).render(true);

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