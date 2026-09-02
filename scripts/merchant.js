console.log("Sanctum Merchant | Script loaded");

const MODULE_ID = "sanctum-merchant";

const SM = {
  debug: false,
  log: (...args) => {
    if (SM.debug) console.log("Sanctum Merchant |", ...args);
  },
  warn: (...args) => console.warn("Sanctum Merchant |", ...args),
  error: (...args) => console.error("Sanctum Merchant |", ...args)
};

function asElement(value) {
  if (!value) return null;
  if (value instanceof HTMLElement) return value;
  if (value.element instanceof HTMLElement) return value.element;
  if (value[0] instanceof HTMLElement) return value[0];
  return null;
}

function trustedContent(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

function getDialogV2() {
  return foundry.applications.api.DialogV2;
}

function createTagElement(tag, { removable = true } = {}) {
  const span = document.createElement("span");
  span.className = "tag";
  span.dataset.tag = tag;
  span.style.cssText = "display:inline-block;background:#444;color:white;padding:2px 6px;margin:2px;border-radius:4px;";
  span.append(document.createTextNode(`${tag} `));
  if (removable) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "remove-tag";
    button.textContent = "x";
    button.style.cssText = "background:none;border:none;color:red;margin-left:4px;cursor:pointer;";
    button.addEventListener("click", () => span.remove());
    span.append(button);
  }
  return span;
}

class JSONImportManager {
  static tempCollections = new Map();

  static async importJSON(jsonData) {
    try {
      const data = typeof jsonData === "string" ? JSON.parse(jsonData) : jsonData;

      if (!data.items || !Array.isArray(data.items)) {
        throw new Error("Invalid JSON structure. Must contain an 'items' array.");
      }

      const collectionId = `json-import-${Date.now()}`;
      const collectionName = data.name || "Imported Items";

      const processedItems = data.items.map(item => {
        const { _id, ...itemData } = item;
        return {
          ...itemData,
          _id: foundry.utils.randomID(),
          type: item.type || "equipment",
          system: {
            ...item.system,
            rarity: item.system?.rarity || "common"
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
      SM.error("JSON Import failed:", error);
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
      if (data.timestamp < oneDayAgo) this.tempCollections.delete(id);
    }
  }
}

class ItemTypeManager {
  static async getAvailableTypes(sourceValue) {
    const types = new Set();
    if (!sourceValue) return [];

    const [sourceType, sourceId] = sourceValue.includes(":")
      ? sourceValue.split(":")
      : ["compendium", sourceValue];

    if (sourceType === "json") {
      const collection = JSONImportManager.getCollection(sourceId);
      collection?.items.forEach(item => {
        if (item.type) types.add(item.type);
      });
    } else {
      const pack = game.packs.get(sourceId);
      if (pack) {
        try {
          const index = await pack.getIndex({ fields: ["type"] });
          index.forEach(item => {
            if (item.type) types.add(item.type);
          });
        } catch (error) {
          SM.warn("Could not load compendium types:", error);
        }
      }
    }

    return [...types].sort();
  }
}

class SanctumMerchantItemPilesIntegration {
  static currentMerchantActor = null;
  static isIntegrationReady = false;

  static initialize() {
    if (!game.modules.get("item-piles")?.active) {
      SM.log("Item Piles not detected - merchant header button disabled");
      return;
    }

    Hooks.once("item-piles-ready", () => this.setupHooks());

    if (game.itempiles?.API) this.setupHooks();
    else {
      setTimeout(() => {
        if (game.itempiles?.API) this.setupHooks();
      }, 2000);
    }
  }

  static setupHooks() {
    if (this.isIntegrationReady) return;

    Hooks.on("getApplicationHeaderButtons", this.onGetHeaderButtons.bind(this));
    Hooks.on("getMerchantAppHeaderButtons", this.onGetHeaderButtons.bind(this));
    Hooks.on("closeApplication", app => {
      if (app.actor === this.currentMerchantActor || app.merchant === this.currentMerchantActor) {
        this.currentMerchantActor = null;
      }
    });

    this.isIntegrationReady = true;
    SM.log("Item Piles integration ready");
  }

  static onGetHeaderButtons(app, buttons) {
    if (!game.user.isGM) return;
    if (!this.isMerchantWindow(app)) return;
    if (buttons.some(button => button.class === "sanctum-merchant-stock")) return;

    this.currentMerchantActor = app.merchant || app.actor;

    let hideText = false;
    try {
      hideText = game.settings.get("item-piles", "hideActorHeaderText") === true;
    } catch (error) {
      hideText = false;
    }
    buttons.unshift({
      label: hideText ? "" : "Stock Merchant",
      class: "sanctum-merchant-stock",
      icon: "fas fa-coins",
      onclick: () => {
        this.currentMerchantActor = app.merchant || app.actor;
        game.sanctumMerchant.openConfigDialog();
      }
    });
  }

  static isMerchantWindow(app) {
    const classes = app.options?.classes ?? [];
    if (app.constructor?.name === "MerchantApp") return true;
    if (classes.includes("item-piles-merchant-sheet")) return true;
    const actor = app.actor || app.merchant;
    return !!actor && this.isItemPilesMerchant(actor);
  }

  static isItemPilesMerchantApp(app) {
    const actor = app?.actor || app?.merchant;
    if (!actor) return false;
    if (this.isMerchantWindow(app)) return this.isItemPilesMerchant(actor);
    return this.isItemPilesMerchant(actor);
  }

  static isItemPilesMerchant(actor) {
    if (!actor) return false;
    try {
      if (!game.itempiles?.API?.isValidItemPile) return false;
      if (!game.itempiles.API.isValidItemPile(actor)) return false;
      const pileData = game.itempiles.API.getActorFlagData(actor);
      return pileData?.type === "merchant";
    } catch (error) {
      SM.log("Error checking Item Pile:", error);
      return false;
    }
  }

  static getOpenApps() {
    const apps = [];
    if (ui.windows) apps.push(...Object.values(ui.windows));
    if (foundry.applications?.instances) apps.push(...foundry.applications.instances.values());
    return apps;
  }

  static getCurrentMerchant() {
    if (this.currentMerchantActor && this.isItemPilesMerchant(this.currentMerchantActor)) {
      return this.currentMerchantActor;
    }

    if (canvas?.tokens?.controlled) {
      for (const token of canvas.tokens.controlled) {
        if (token.actor && this.isItemPilesMerchant(token.actor)) return token.actor;
      }
    }

    for (const app of this.getOpenApps()) {
      if (this.isItemPilesMerchantApp(app)) return app.actor || app.merchant;
    }

    return null;
  }

  static async addItemsToMerchant(merchant, items) {
    if (!this.isItemPilesMerchant(merchant)) {
      return this.addItemsDirect(merchant, items);
    }

    try {
      await game.itempiles.API.addItems(merchant, items);
      SM.log(`Added ${items.length} items via Item Piles API`);
      return true;
    } catch (error) {
      SM.error("Failed to add items via Item Piles API:", error);
      return this.addItemsDirect(merchant, items);
    }
  }

  static async addItemsDirect(merchant, items) {
    try {
      const actorItems = new Set(merchant.items.map(i => i.name));
      const newItems = items.filter(d => !actorItems.has(d.name));
      if (newItems.length === 0) return false;
      await merchant.createEmbeddedDocuments("Item", newItems);
      SM.log(`Added ${newItems.length} items directly`);
      return true;
    } catch (error) {
      SM.error("Failed to add items directly:", error);
      return false;
    }
  }

  static async clearMerchantInventory(merchant) {
    if (!merchant) {
      ui.notifications.error("No merchant provided to clear.");
      return false;
    }

    try {
      let itemIds = [];
      if (merchant.items && typeof merchant.items.map === "function") {
        itemIds = merchant.items.map(i => i.id);
      } else if (merchant.items?.contents) {
        itemIds = merchant.items.contents.map(i => i.id);
      } else {
        for (const item of merchant.items) itemIds.push(item.id);
      }

      if (itemIds.length === 0) {
        ui.notifications.warn(`${merchant.name} has no items to remove.`);
        return true;
      }

      if (this.isItemPilesMerchant(merchant) && game.itempiles?.API?.removeItems) {
        try {
          const itemsToRemove = merchant.items.map(item => ({
            _id: item.id,
            quantity: item.system?.quantity || 1
          }));
          await game.itempiles.API.removeItems(merchant, itemsToRemove);
        } catch (error) {
          SM.warn("Item Piles API clear failed, using direct method:", error);
          await merchant.deleteEmbeddedDocuments("Item", itemIds);
        }
      } else {
        await merchant.deleteEmbeddedDocuments("Item", itemIds);
      }

      ui.notifications.info(`${merchant.name}'s inventory cleared (${itemIds.length} items)!`);
      return true;
    } catch (error) {
      SM.error("Failed to clear merchant inventory:", error);
      ui.notifications.error("Failed to clear merchant inventory.");
      return false;
    }
  }
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "compendium", {
    name: "Default Compendium",
    hint: "Compendium to pull items from.",
    scope: "world",
    config: true,
    type: String,
    default: "world.ddb-oathbreaker-ddb-items"
  });

  game.settings.register(MODULE_ID, "itemSource", {
    name: "Item Source (compendium or json)",
    scope: "world",
    config: false,
    type: String,
    default: "compendium:world.ddb-oathbreaker-ddb-items"
  });

  game.settings.register(MODULE_ID, "formula", {
    name: "Default Roll Formula",
    hint: "Formula used to determine how many items to stock.",
    scope: "world",
    config: true,
    type: String,
    default: "1d6+2"
  });

  game.settings.register(MODULE_ID, "types", {
    name: "Allowed Item Types",
    hint: "Comma-separated list of item types to include.",
    scope: "world",
    config: true,
    type: String,
    default: "weapon,consumable,equipment,loot,container,tool"
  });

  game.settings.register(MODULE_ID, "strictRarity", {
    name: "Strict Rarity Filtering",
    hint: "Only include items with matching rarity tags.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "sendRestockMessage", {
    name: "Send Restock Message",
    hint: "Whisper a chat message to players when a merchant is stocked. Uncheck to restock silently.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "merchantMessage", {
    name: "Default Merchant Message",
    hint: "Message whispered to players when stocking the merchant (if Send Restock Message is enabled).",
    scope: "world",
    config: true,
    type: String,
    default: `🧿 Got somethin' that might interest ya'!`
  });

  game.settings.register(MODULE_ID, "tags", {
    name: "Default Rarity Tags",
    hint: "Comma-separated list of rarity tags to apply when no preset is selected.",
    scope: "world",
    config: true,
    type: String,
    default: ""
  });
});

const rarityWeights = {
  common: 1,
  uncommon: 2,
  rare: 3,
  "very rare": 4,
  legendary: 5,
  exotic: 6,
  cursed: 7,
  chaos: 8,
  "sanctum-blessed": 9
};

const fallbackCommon = [
  "potion", "scroll", "dagger", "leather", "torch", "rations",
  "sling", "club", "robe", "kit", "tools", "basic", "simple"
];

const rarityIcons = {
  common: "⚪",
  uncommon: "🟢",
  rare: "🔵",
  "very rare": "🟣",
  legendary: "🟠",
  exotic: "🌟",
  cursed: "☠️",
  chaos: "🌀",
  "sanctum-blessed": "🔮"
};

function shuffleArray(array) {
  let currentIndex = array.length;
  let randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

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

function fieldValue(root, name) {
  return root.querySelector(`[name="${name}"]`)?.value ?? "";
}

function fieldChecked(root, name) {
  return !!root.querySelector(`[name="${name}"]`)?.checked;
}

function selectedTags(root, selector) {
  return Array.from(root.querySelectorAll(selector)).map(el => el.dataset.tag).filter(Boolean);
}

async function stockMerchantCallback(root) {
  try {
    const sourceValue = fieldValue(root, "source");
    await game.settings.set(MODULE_ID, "itemSource", sourceValue);

    let sourceType;
    let sourceId;
    if (sourceValue?.includes(":")) [sourceType, sourceId] = sourceValue.split(":");
    else {
      sourceType = "compendium";
      sourceId = sourceValue || game.settings.get(MODULE_ID, "compendium");
    }

    const formula = fieldValue(root, "formula");
    const types = selectedTags(root, ".item-types .tag");
    const presetName = fieldValue(root, "rarity-preset");
    const merchantMessage = fieldValue(root, "merchantMessage");
    const sendRestockMessage = fieldChecked(root, "sendRestockMessage");
    const strictRarity = fieldChecked(root, "strictRarity");

    let tags;
    if (presetName && rarityPresets[presetName]) tags = rarityPresets[presetName];
    else tags = selectedTags(root, ".rarity-tags .tag").map(tag => tag.toLowerCase());

    if (types.length === 0) {
      ui.notifications.warn("Please select at least one item type.");
      return false;
    }

    if (sourceType === "compendium") {
      await game.settings.set(MODULE_ID, "compendium", sourceId);
      await game.settings.set(MODULE_ID, "formula", formula);
      await game.settings.set(MODULE_ID, "types", types.join(","));
      await game.settings.set(MODULE_ID, "strictRarity", strictRarity);
      await game.settings.set(MODULE_ID, "merchantMessage", merchantMessage);
      await game.settings.set(MODULE_ID, "tags", tags.join(","));
    }

    await game.settings.set(MODULE_ID, "sendRestockMessage", sendRestockMessage);

    await game.sanctumMerchant.populateMerchantWithJSON({
      source: sourceId,
      sourceType,
      rollFormula: formula,
      allowedTypes: types,
      rareTags: tags,
      strictRarity,
      merchantMessage,
      sendRestockMessage
    });

    ui.notifications.info("Items stocked successfully!");
  } catch (err) {
    SM.error("Merchant stocking failed:", err);
    ui.notifications.error("Something went wrong stocking the merchant.");
  }
  return false;
}

async function clearInventoryCallback() {
  try {
    let merchant = SanctumMerchantItemPilesIntegration.getCurrentMerchant();
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
    await SanctumMerchantItemPilesIntegration.clearMerchantInventory(merchant);
  } catch (err) {
    SM.error("Inventory clear failed:", err);
    ui.notifications.error("Something went wrong clearing the merchant.");
  }
}

async function resetMerchantSettings() {
  try {
    await game.settings.set(MODULE_ID, "compendium", "world.ddb-oathbreaker-ddb-items");
    await game.settings.set(MODULE_ID, "formula", "1d6+2");
    await game.settings.set(MODULE_ID, "types", "weapon,consumable,equipment,loot,container,tool");
    await game.settings.set(MODULE_ID, "strictRarity", true);
    await game.settings.set(MODULE_ID, "sendRestockMessage", true);
    await game.settings.set(MODULE_ID, "merchantMessage", `🧿 Got somethin' that might interest ya'!`);
    await game.settings.set(MODULE_ID, "tags", "");
    ui.notifications.info("Sanctum Merchant settings reset to default.");
  } catch (err) {
    SM.error("Reset failed:", err);
    ui.notifications.error("Could not reset merchant settings.");
  }
}

function injectMerchantButton(root) {
  if (!game.user?.isGM) return;

  const host = asElement(root) ?? asElement(ui.actors);
  const headerActions = host?.querySelector(".header-actions");
  if (!headerActions) return;
  if (headerActions.querySelector("#sanctumMerchantButton")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.id = "sanctumMerchantButton";
  button.innerHTML = `<i class="fas fa-coins"></i> Stock Merchant`;
  button.addEventListener("click", () => game.sanctumMerchant.openConfigDialog());
  headerActions.appendChild(button);
}

function bindConfigDialog(dialog) {
  const root = dialog.element;
  const savedSource = game.settings.get(MODULE_ID, "itemSource")
    || `compendium:${game.settings.get(MODULE_ID, "compendium")}`;
  const sourceSelect = root.querySelector('[name="source"]');
  if (sourceSelect) {
    if (savedSource && sourceSelect.querySelector(`option[value="${savedSource}"]`)) {
      sourceSelect.value = savedSource;
    } else {
      sourceSelect.value = `compendium:${game.settings.get(MODULE_ID, "compendium")}`;
    }
  }

  async function populateItemTypes(sourceValue) {
    const typeSelect = root.querySelector('[name="type-select"]');
    if (!typeSelect) return;
    typeSelect.disabled = true;
    typeSelect.innerHTML = "<option>Loading types...</option>";

    try {
      const availableTypes = await ItemTypeManager.getAvailableTypes(sourceValue);
      typeSelect.innerHTML = "";
      typeSelect.disabled = availableTypes.length === 0;
      if (availableTypes.length === 0) {
        typeSelect.innerHTML = "<option>No types found</option>";
        return;
      }
      for (const type of availableTypes) {
        const option = document.createElement("option");
        option.value = type;
        option.textContent = type;
        typeSelect.append(option);
      }
    } catch (error) {
      SM.error("Error loading item types:", error);
      typeSelect.innerHTML = "<option>Error loading types</option>";
    }
  }

  function restoreSavedTypes() {
    const typeList = root.querySelector(".item-types");
    if (!typeList) return;
    const savedTypes = game.settings.get(MODULE_ID, "types").split(",").map(t => t.trim()).filter(Boolean);
    for (const type of savedTypes) {
      if (!typeList.querySelector(`[data-tag="${type}"]`)) {
        typeList.append(createTagElement(type));
      }
    }
  }

  sourceSelect?.addEventListener("change", async event => {
    const val = event.currentTarget.value;
    await game.settings.set(MODULE_ID, "itemSource", val);
    if (val?.startsWith("compendium:")) {
      await game.settings.set(MODULE_ID, "compendium", val.split(":")[1]);
    }
    root.querySelector(".item-types")?.replaceChildren();
    await populateItemTypes(val);
    restoreSavedTypes();
  });

  root.querySelector(".add-type")?.addEventListener("click", () => {
    const type = root.querySelector('[name="type-select"]')?.value;
    const typeList = root.querySelector(".item-types");
    if (type && typeList && !typeList.querySelector(`[data-tag="${type}"]`)) {
      typeList.append(createTagElement(type));
    }
  });

  root.querySelector(".select-all-types")?.addEventListener("click", () => {
    const typeSelect = root.querySelector('[name="type-select"]');
    const typeList = root.querySelector(".item-types");
    if (!typeSelect || !typeList) return;
    for (const option of typeSelect.options) {
      const type = option.value;
      if (type && !typeList.querySelector(`[data-tag="${type}"]`)) {
        typeList.append(createTagElement(type));
      }
    }
  });

  const formulaInput = root.querySelector('[name="formula"]');
  if (formulaInput) formulaInput.value = game.settings.get(MODULE_ID, "formula");
  const strictInput = root.querySelector('[name="strictRarity"]');
  if (strictInput) strictInput.checked = game.settings.get(MODULE_ID, "strictRarity");
  const messageInput = root.querySelector('[name="merchantMessage"]');
  if (messageInput) messageInput.value = game.settings.get(MODULE_ID, "merchantMessage");
  const sendMessageInput = root.querySelector('[name="sendRestockMessage"]');
  if (sendMessageInput) sendMessageInput.checked = game.settings.get(MODULE_ID, "sendRestockMessage") !== false;

  root.querySelector(".import-json")?.addEventListener("click", async () => {
    const jsonText = fieldValue(root, "json-import");
    if (!jsonText) {
      ui.notifications.warn("Please paste JSON data to import.");
      return;
    }
    try {
      const result = await JSONImportManager.importJSON(jsonText);
      ui.notifications.info(`Imported "${result.name}" with ${result.itemCount} items.`);
      const textarea = root.querySelector('[name="json-import"]');
      if (textarea) textarea.value = "";
      dialog.close();
      game.sanctumMerchant.openConfigDialog();
    } catch (error) {
      ui.notifications.error(`Import failed: ${error.message}`);
    }
  });

  root.querySelector(".manage-imports")?.addEventListener("click", () => {
    const collections = JSONImportManager.getAllCollections();
    let html = "<h3>Imported Collections</h3>";
    if (collections.length === 0) html += "<p>No imported collections found.</p>";
    else {
      html += collections.map(col => {
        const date = new Date(col.timestamp).toLocaleString();
        return `<div style="margin:10px 0;padding:5px;border:1px solid #ccc;">
          <strong>${col.name}</strong> (${col.itemCount} items)<br>
          <small>Imported: ${date}</small><br>
          <button type="button" class="delete-import" data-id="${col.id}">Delete</button>
        </div>`;
      }).join("");
    }

    getDialogV2().wait({
      window: { title: "Manage Imports" },
      content: trustedContent(html),
      buttons: [{ action: "close", label: "Close" }],
      render: (_event, dialog) => {
        dialog.element.querySelectorAll(".delete-import").forEach(button => {
          button.addEventListener("click", () => {
            JSONImportManager.deleteCollection(button.dataset.id);
            ui.notifications.info("Collection deleted.");
            dialog.close();
            game.sanctumMerchant.openConfigDialog();
          });
        });
      }
    });
  });

  const rarityList = root.querySelector(".rarity-tags");
  const savedTags = game.settings.get(MODULE_ID, "tags").split(",").map(t => t.trim()).filter(Boolean);
  savedTags.forEach(tag => rarityList?.append(createTagElement(tag)));

  root.querySelector('[name="rarity-preset"]')?.addEventListener("change", event => {
    const presetValue = event.currentTarget.value;
    rarityList?.replaceChildren();
    if (presetValue && rarityPresets[presetValue]) {
      rarityPresets[presetValue].forEach(tag => rarityList.append(createTagElement(tag, { removable: false })));
    }
  });

  root.querySelector(".add-rarity")?.addEventListener("click", () => {
    const tag = root.querySelector('[name="rarity-select"]')?.value;
    if (tag && rarityList && !rarityList.querySelector(`[data-tag="${tag}"]`)) {
      rarityList.append(createTagElement(tag));
    }
  });

  populateItemTypes(sourceSelect?.value).then(restoreSavedTypes);
}

function configDialogContent() {
  const compendiums = game.packs.filter(p => p.metadata.type === "Item");
  const jsonCollections = JSONImportManager.getAllCollections();

  let sourceOptions = "";
  compendiums.forEach(pack => {
    sourceOptions += `<option value="compendium:${pack.collection}">${pack.title}</option>`;
  });
  if (jsonCollections.length > 0) {
    sourceOptions += '<optgroup label="--- Imported JSON ---">';
    jsonCollections.forEach(collection => {
      sourceOptions += `<option value="json:${collection.id}">${collection.name} (${collection.itemCount} items)</option>`;
    });
    sourceOptions += "</optgroup>";
  }

  const rarityOptions = availableRarityTags
    .map(tag => `<option value="${tag}">${tag}</option>`)
    .join("");

  return trustedContent(`
    <div class="form-group" style="border:2px solid #4a90e2;padding:10px;border-radius:5px;background:#f0f8ff;">
      <label><strong>Import JSON Items</strong></label>
      <textarea name="json-import" placeholder='Paste JSON like: {"name": "Collection Name", "items": [...]}'
                style="width:100%;height:80px;font-family:monospace;font-size:11px;"></textarea>
      <button type="button" class="import-json" style="margin-top:5px;">
        <i class="fas fa-file-import"></i> Import JSON
      </button>
      <button type="button" class="manage-imports" style="margin-top:5px;margin-left:5px;">
        <i class="fas fa-list"></i> Manage Imports
      </button>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="width:150px;padding:8px 10px;vertical-align:top;"><label>Item Source</label></td>
        <td style="padding:8px 10px;">
          <select name="source" style="width:100%;height:28px;padding:4px;box-sizing:border-box;">${sourceOptions}</select>
        </td>
      </tr>
      <tr>
        <td style="width:150px;padding:8px 10px;vertical-align:top;"><label>Roll Formula</label></td>
        <td style="padding:8px 10px;">
          <input type="text" name="formula" style="width:100%;height:28px;padding:4px;box-sizing:border-box;" />
        </td>
      </tr>
      <tr>
        <td style="width:150px;padding:8px 10px;vertical-align:top;"><label>Select Item Types</label></td>
        <td style="padding:8px 10px;">
          <select name="type-select" disabled style="width:100%;height:28px;padding:4px;margin:0 0 5px 0;box-sizing:border-box;">
            <option>Loading types...</option>
          </select>
          <div>
            <button type="button" class="add-type" style="width:50px;">Add</button>
            <button type="button" class="select-all-types" style="width:70px;white-space:nowrap;margin-left:5px;">Select All</button>
          </div>
          <div class="item-types" style="margin-top:5px;min-height:30px;border:1px solid #ccc;padding:5px;"></div>
          <p style="font-size:0.8em;margin-top:4px;">Item types will populate when you select a source above.</p>
        </td>
      </tr>
      <tr>
        <td style="width:150px;padding:8px 10px;vertical-align:top;"><label>Rarity Preset</label></td>
        <td style="padding:8px 10px;">
          <select name="rarity-preset" style="width:100%;height:28px;padding:4px;box-sizing:border-box;">
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
        <td style="width:150px;padding:8px 10px;vertical-align:top;"><label>Select Rarity Tags</label></td>
        <td style="padding:8px 10px;">
          <select name="rarity-select" style="width:100%;height:28px;padding:4px;margin:0 0 5px 0;box-sizing:border-box;">
            ${rarityOptions}
          </select>
          <div><button type="button" class="add-rarity" style="width:50px;">Add</button></div>
          <div class="rarity-tags" style="margin-top:5px;"></div>
        </td>
      </tr>
      <tr>
        <td style="width:150px;padding:8px 10px;vertical-align:top;"><label>Strict Filtering</label></td>
        <td style="padding:8px 10px;">
          <label><input type="checkbox" name="strictRarity" /> Strict rarity filtering</label>
          <p style="font-size:0.8em;margin-top:4px;">
            When checked, only items with selected rarity tags will be considered.
            When unchecked, all items are eligible but matching tags are favored.
          </p>
        </td>
      </tr>
      <tr>
        <td style="width:150px;padding:8px 10px;vertical-align:top;"><label>Restock Message</label></td>
        <td style="padding:8px 10px;">
          <label>
            <input type="checkbox" name="sendRestockMessage" />
            Whisper restock message to players
          </label>
          <p style="font-size:0.8em;margin-top:4px;">
            Uncheck to stock merchants without posting a chat message.
          </p>
          <input type="text" name="merchantMessage" style="width:100%;height:28px;padding:4px;margin-top:6px;box-sizing:border-box;" />
        </td>
      </tr>
    </table>
  `);
}

Hooks.once("ready", () => {
  SanctumMerchantItemPilesIntegration.initialize();

  game.sanctumMerchant = game.sanctumMerchant || {};
  game.sanctumMerchant.debugMode = false;
  game.sanctumMerchant.JSONImportManager = JSONImportManager;

  game.sanctumMerchant.toggleDebug = () => {
    SM.debug = !SM.debug;
    game.sanctumMerchant.debugMode = SM.debug;
    ui.notifications.info(`Debug Mode: ${SM.debug ? "ON" : "OFF"}`);
  };

  game.sanctumMerchant.exportItemsByRarity = async (options = {}) => {
    try {
      const {
        samplesPerRarity = 3,
        includeAllData = false,
        sourceType = "current",
        sourceId = null
      } = options;

      let actualSourceType;
      let actualSourceId;
      if (sourceType === "current") {
        let itemSource = game.settings.get(MODULE_ID, "itemSource");
        if (!itemSource) itemSource = `compendium:${game.settings.get(MODULE_ID, "compendium")}`;
        [actualSourceType, actualSourceId] = itemSource.includes(":")
          ? itemSource.split(":")
          : ["compendium", itemSource];
      } else {
        actualSourceType = sourceType;
        actualSourceId = sourceId;
      }

      let items = [];
      let sourceName = "";

      if (actualSourceType === "json") {
        const collection = JSONImportManager.getCollection(actualSourceId);
        if (!collection) {
          ui.notifications.error("JSON collection not found.");
          return;
        }
        items = collection.items;
        sourceName = collection.name;
      } else {
        const pack = game.packs.get(actualSourceId);
        if (!pack) {
          ui.notifications.error(`Compendium "${actualSourceId}" not found.`);
          return;
        }
        const index = await pack.getIndex({ fields: ["name", "type", "flags", "system", "img"] });
        items = (await Promise.all(index.map(async item => {
          const doc = await pack.getDocument(item._id);
          return doc ? doc.toObject() : null;
        }))).filter(Boolean);
        sourceName = pack.title;
      }

      const itemsByRarity = {};
      for (const rarityTag of availableRarityTags) itemsByRarity[rarityTag] = [];
      itemsByRarity.unclassified = [];

      for (const item of items) {
        let itemRarity;
        if (actualSourceType === "json") {
          itemRarity = item.system?.rarity?.toLowerCase().trim().replace(/[\s_-]+/g, " ");
        } else {
          let systemRarity = item.system?.rarity;
          if (systemRarity === "veryRare") systemRarity = "very rare";
          if (!systemRarity || systemRarity.trim() === "") systemRarity = "common";
          itemRarity = systemRarity.toLowerCase().trim().replace(/[\s_-]+/g, " ");
        }

        let matched = false;
        for (const tag of availableRarityTags) {
          const normalizedTag = tag.toLowerCase().trim().replace(/[\s_-]+/g, " ");
          if (itemRarity === normalizedTag) {
            itemsByRarity[tag].push(item);
            matched = true;
            break;
          }
        }
        if (!matched) itemsByRarity.unclassified.push(item);
      }

      const exportData = {
        metadata: {
          exportDate: new Date().toISOString(),
          source: sourceName,
          sourceType: actualSourceType,
          sourceId: actualSourceId,
          totalItems: items.length,
          samplesPerRarity,
          includeAllData
        },
        rarityCounts: {},
        itemsByRarity: {}
      };

      for (const [rarity, rarityItems] of Object.entries(itemsByRarity)) {
        if (rarityItems.length === 0) continue;
        exportData.rarityCounts[rarity] = rarityItems.length;
        const samples = rarityItems.slice(0, samplesPerRarity);
        exportData.itemsByRarity[rarity] = includeAllData
          ? samples
          : samples.map(item => ({
            _id: item._id,
            name: item.name,
            type: item.type,
            img: item.img,
            system: {
              rarity: item.system?.rarity,
              description: item.system?.description?.value?.substring(0, 200) + "...",
              price: item.system?.price,
              quantity: item.system?.quantity,
              weight: item.system?.weight,
              attunement: item.system?.attunement,
              equipped: item.system?.equipped
            }
          }));
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
      const filename = `sanctum-merchant-export-${timestamp}.json`;
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 100);

      ui.notifications.info(`Exported ${items.length} items to ${filename}`);
      return exportData;
    } catch (error) {
      SM.error("Export failed:", error);
      ui.notifications.error(`Export failed: ${error.message}`);
      throw error;
    }
  };

  game.sanctumMerchant.quickExport = () => game.sanctumMerchant.exportItemsByRarity({
    samplesPerRarity: 5,
    includeAllData: false
  });

  game.sanctumMerchant.fullExport = () => game.sanctumMerchant.exportItemsByRarity({
    samplesPerRarity: 10,
    includeAllData: true
  });

  game.sanctumMerchant.exportFromCompendium = (packId, samples = 3) => game.sanctumMerchant.exportItemsByRarity({
    samplesPerRarity: samples,
    includeAllData: false,
    sourceType: "compendium",
    sourceId: packId
  });

  injectMerchantButton();
  Hooks.on("renderActorDirectory", (app, element) => injectMerchantButton(element ?? app.element));
  Hooks.on("renderSidebar", () => injectMerchantButton());

  game.sanctumMerchant.debugActorsTab = () => {
    const host = asElement(ui.actors);
    console.log("Sanctum Merchant | Actors tab debug", {
      isGM: game.user.isGM,
      actorsApp: !!ui.actors,
      host: !!host,
      headerActions: !!host?.querySelector(".header-actions"),
      existingButton: !!document.querySelector("#sanctumMerchantButton")
    });
    injectMerchantButton(host);
  };

  game.sanctumMerchant.openConfigDialog = async () => {
    const result = await getDialogV2().wait({
      window: { title: "Sanctum Merchant", icon: "fa-solid fa-coins", resizable: true },
      position: { width: 700, height: 650 },
      content: configDialogContent(),
      buttons: [
        {
          action: "stock",
          label: "Stock Merchant",
          icon: "fa-solid fa-coins",
          default: true,
          callback: async (_event, _button, dialog) => {
            await stockMerchantCallback(dialog.element);
            return "reopen";
          }
        },
        {
          action: "clear",
          label: "Clear Inventory",
          icon: "fa-solid fa-trash",
          callback: async () => {
            await clearInventoryCallback();
            return "reopen";
          }
        },
        {
          action: "reset",
          label: "Reset to Default",
          callback: async () => {
            await resetMerchantSettings();
            return "reopen";
          }
        },
        {
          action: "audit",
          label: "Audit Tags",
          callback: async () => {
            await game.sanctumMerchant.auditTags();
            return "audit";
          }
        },
        {
          action: "cancel",
          label: "Cancel",
          icon: "fa-solid fa-xmark",
          callback: () => "cancel"
        }
      ],
      render: (_event, dialog) => bindConfigDialog(dialog)
    });

    if (result === "reopen") game.sanctumMerchant.openConfigDialog();
  };

  game.sanctumMerchant.populateMerchantWithJSON = async function(options = {}) {
    const {
      source,
      sourceType = "compendium",
      rollFormula = "1d6+2",
      allowedTypes = ["weapon", "equipment", "consumable", "loot", "container", "tool"],
      rareTags = ["rare", "very rare", "legendary"],
      strictRarity = true,
      merchantMessage = "🧿 Got somethin' that might interest ya'!",
      sendRestockMessage = game.settings.get(MODULE_ID, "sendRestockMessage") !== false
    } = options;

    let items = [];
    let sourceName = "";

    if (sourceType === "json") {
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
      const index = await pack.getIndex({ fields: ["type", "name", "flags", "system"] });
      items = index.map(item => ({ ...item, system: item.system || {} }));
      sourceName = pack.title;
    }

    const filteredItems = items.filter(item => {
      const itemType = (item.type || "").toLowerCase();
      return allowedTypes.some(allowedType => allowedType.toLowerCase() === itemType);
    });

    const normalizeRarity = str => str?.toLowerCase().trim().replace(/[\s_-]+/g, " ") || null;
    const rareTagsNormalized = rareTags.map(t => normalizeRarity(t));
    const weightedIds = [];

    for (const item of filteredItems) {
      let itemRarity;
      if (sourceType === "json") itemRarity = normalizeRarity(item.system?.rarity);
      else {
        let systemRarity = item.system?.rarity;
        if (systemRarity === "veryRare") systemRarity = "very rare";
        if (!systemRarity || systemRarity.trim() === "") systemRarity = "common";
        itemRarity = normalizeRarity(systemRarity);
      }

      if (strictRarity) {
        if (rareTagsNormalized.includes(itemRarity)) weightedIds.push(...Array(3).fill(item._id));
      } else {
        const weight = rareTagsNormalized.includes(itemRarity) ? 3 : 1;
        weightedIds.push(...Array(weight).fill(item._id));
      }
    }

    if (weightedIds.length === 0) {
      ui.notifications.warn(`No items found matching criteria in "${sourceName}".`);
      return;
    }

    const roll = await new Roll(rollFormula).evaluate();
    const numToSelect = Math.min(Math.max(1, roll.total), weightedIds.length);
    const selectedIds = shuffleArray([...weightedIds]).slice(0, numToSelect);
    const uniqueIds = [...new Set(selectedIds)];

    let docs = [];
    if (sourceType === "json") {
      const collection = JSONImportManager.getCollection(source);
      docs = uniqueIds.map(id => collection.items.find(i => i._id === id)).filter(Boolean);
    } else {
      const pack = game.packs.get(source);
      const loadedDocs = await Promise.all(uniqueIds.map(id => pack.getDocument(id)));
      docs = loadedDocs.map(d => d.toObject());
    }

    let merchant = SanctumMerchantItemPilesIntegration.getCurrentMerchant();
    let stockedCount = 0;
    const tokensToStock = merchant ? [{ actor: merchant, name: merchant.name }] : canvas.tokens.controlled;

    for (const token of tokensToStock) {
      const actor = token.actor;
      if (!actor) continue;
      const success = await SanctumMerchantItemPilesIntegration.addItemsToMerchant(actor, docs);
      if (!success) continue;
      stockedCount++;
      const merchantName = token.name || actor.name || "The Merchant";
      if (sendRestockMessage) {
        const playerRecipients = game.users.filter(u => u.active && !u.isGM).map(u => u.id);
        const itemNames = docs.map(i => i.name).join(", ");
        ChatMessage.create({
          speaker: { alias: merchantName },
          content: `${merchantMessage}<br><strong>New Items:</strong> ${itemNames}`,
          whisper: playerRecipients
        });
      }
      ui.notifications.info(`Stocked ${docs.length} items from "${sourceName}" to ${merchantName}`);
    }

    if (stockedCount === 0) {
      ui.notifications.warn("No merchants were stocked. Make sure you have a merchant selected or controlled.");
    }
  };

  game.sanctumMerchant.auditTags = async function() {
    const itemSource = game.settings.get(MODULE_ID, "itemSource")
      || `compendium:${game.settings.get(MODULE_ID, "compendium")}`;

    let [sourceType, sourceId] = itemSource.split(":");
    if (!sourceType || !sourceId) {
      sourceType = "compendium";
      sourceId = game.settings.get(MODULE_ID, "compendium");
    }

    let items = [];
    let sourceTitle = "";

    if (sourceType === "json") {
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
        const fullText = `${item.name} ${JSON.stringify(item.system || {})} ${JSON.stringify(item.flags || {})}`
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

      if (!detectedTag && fallbackCommon.some(f => nameLC.includes(f))) detectedTag = "common";
      if (detectedTag) tagGroups[detectedTag].push({ item, tag: detectedTag });
    }

    let output = `
      <h2>Rarity Tag Audit — ${sourceTitle}</h2>
      <div style="margin-bottom:10px;">
        <label for="name-filter">Filter by name:</label>
        <input type="text" id="name-filter" placeholder="e.g. potion, scroll, hat" style="width:220px;margin-left:6px;">
      </div>
      <div style="height:calc(100% - 60px);overflow-y:auto;" id="audit-results">
    `;

    for (const [tag, arr] of Object.entries(tagGroups)) {
      output += `
        <div class="sanctum-tag-group" style="margin-bottom:10px;">
          <div class="sanctum-tag-header" data-tag="${tag}" style="cursor:pointer;font-weight:bold;background:#333;color:#fff;padding:6px;border-radius:4px;display:flex;justify-content:space-between;align-items:center;">
            <span class="sanctum-tag-label">▶ ${tag} (${arr.length})</span>
            <button type="button" class="stock-group" data-tag="${tag}" style="padding:2px 6px;font-size:0.75em;background:#3fa9f5;color:white;border:none;border-radius:3px;cursor:pointer;">Stock All</button>
          </div>
          <ul class="sanctum-tag-items" style="display:none;margin-top:6px;padding-left:20px;">
            ${arr.map(({ item, tag: itemTag }) => `
              <li style="margin-bottom:4px;">
                <div style="display:inline-block;white-space:nowrap;">
                  <span class="sanctum-item-link" data-source-type="${sourceType}" data-source-id="${sourceId}" data-id="${item._id}"
                        style="color:#3fa9f5;cursor:pointer;text-decoration:underline;">
                    ${rarityIcons[itemTag] || ""} ${item.name}
                  </span>
                  <button type="button" class="stock-item" data-source-type="${sourceType}" data-source-id="${sourceId}" data-id="${item._id}"
                          title="Stock this item to selected token(s)"
                          style="margin-left:6px;width:32px;height:24px;font-size:0.8em;background:#3fa9f5;color:white;border:none;border-radius:3px;cursor:pointer;">
                    +
                  </button>
                </div>
              </li>
            `).join("")}
          </ul>
        </div>
      `;
    }
    output += "</div>";

    async function loadItemData(st, sid, id) {
      if (st === "compendium") {
        const pack = game.packs.get(sid);
        const doc = await pack?.getDocument(id);
        return doc ? doc.toObject() : null;
      }
      const col = JSONImportManager.getCollection(sid);
      return col?.items.find(i => i._id === id) ?? null;
    }

    async function stockItemData(itemData) {
      if (!itemData) return;
      const merchant = SanctumMerchantItemPilesIntegration.getCurrentMerchant();
      const targets = merchant ? [{ actor: merchant }] : canvas.tokens.controlled;
      for (const token of targets) {
        const actor = token.actor;
        if (!actor) continue;
        const success = await SanctumMerchantItemPilesIntegration.addItemsToMerchant(actor, [itemData]);
        if (success) ui.notifications.info(`${itemData.name} stocked to ${actor.name}`);
      }
    }

    getDialogV2().wait({
      window: { title: "Sanctum Merchant Tag Audit", resizable: true },
      position: { width: 700, height: 600 },
      content: trustedContent(output),
      buttons: [{ action: "close", label: "Close" }],
      render: (_event, dialog) => {
        const root = dialog.element;
        root.querySelectorAll(".sanctum-tag-header").forEach(header => {
          header.addEventListener("click", event => {
            if (event.target.closest(".stock-group")) return;
            const itemsList = header.nextElementSibling;
            const isVisible = itemsList.style.display !== "none";
            itemsList.style.display = isVisible ? "none" : "block";
            const visibleCount = Array.from(itemsList.querySelectorAll("li")).filter(li => li.style.display !== "none").length;
            header.querySelector(".sanctum-tag-label").textContent =
              `${isVisible ? "▶" : "▼"} ${header.dataset.tag} (${visibleCount || itemsList.querySelectorAll("li").length})`;
          });
        });

        root.querySelectorAll(".sanctum-item-link").forEach(link => {
          link.addEventListener("click", async event => {
            event.preventDefault();
            const { sourceType: st, sourceId: sid, id } = link.dataset;
            if (st === "compendium") {
              const pack = game.packs.get(sid);
              const doc = await pack?.getDocument(id);
              doc?.sheet.render(true);
            } else {
              const col = JSONImportManager.getCollection(sid);
              const data = col?.items.find(i => i._id === id);
              if (!data) return;
              const tmp = new CONFIG.Item.documentClass(data, { temporary: true });
              tmp.sheet.render(true);
            }
          });
        });

        root.querySelectorAll(".stock-item").forEach(button => {
          button.addEventListener("click", async () => {
            const itemData = await loadItemData(button.dataset.sourceType, button.dataset.sourceId, button.dataset.id);
            await stockItemData(itemData);
          });
        });

        root.querySelector("#name-filter")?.addEventListener("keydown", event => {
          if (event.key !== "Enter") return;
          const query = event.currentTarget.value.trim().toLowerCase();
          root.querySelectorAll(".sanctum-tag-group").forEach(group => {
            const items = group.querySelectorAll("li");
            let matchCount = 0;
            items.forEach(li => {
              const itemName = li.querySelector(".sanctum-item-link")?.textContent.toLowerCase() ?? "";
              const matches = itemName.includes(query);
              li.style.display = matches ? "" : "none";
              if (matches) matchCount++;
            });
            const header = group.querySelector(".sanctum-tag-header");
            const list = group.querySelector(".sanctum-tag-items");
            if (matchCount > 0) {
              group.style.display = "";
              list.style.display = "block";
              header.querySelector(".sanctum-tag-label").textContent = `▼ ${header.dataset.tag} (${matchCount})`;
            } else {
              group.style.display = "none";
            }
          });
        });

        root.querySelectorAll(".stock-group").forEach(button => {
          button.addEventListener("click", async event => {
            event.preventDefault();
            event.stopPropagation();
            const group = button.closest(".sanctum-tag-group");
            for (const el of group.querySelectorAll(".sanctum-item-link")) {
              const itemData = await loadItemData(el.dataset.sourceType, el.dataset.sourceId, el.dataset.id);
              await stockItemData(itemData);
            }
          });
        });
      }
    });
  };

  console.log("Sanctum Merchant | Ready. Toggle debug with game.sanctumMerchant.toggleDebug()");
});
