console.log("Sanctum Merchant | Script loaded");

const MODULE_ID = "sanctum-merchant";
const DEFAULT_STOCK_TYPES = ["weapon", "equipment", "consumable", "loot", "container", "tool"];
const DEFAULT_STOCK_TAGS = ["rare", "very rare", "legendary"];
const DEFAULT_MERCHANT_MESSAGE = "🧿 Got somethin' that might interest ya'!";
const DEFAULT_FORMULA = "1d6+2";
const DEFAULT_ITEM_IMG = "icons/svg/item-bag.svg";
const JSON_COLLECTION_TEMPLATE = {
  name: "Harbor Market",
  items: [
    {
      name: "Lantern Oil",
      type: "consumable",
      rarity: "common",
      price: 1,
      priceDenomination: "gp",
      img: DEFAULT_ITEM_IMG
    },
    {
      name: "Boarding Pike",
      type: "weapon",
      rarity: "uncommon",
      price: 25,
      priceDenomination: "gp"
    }
  ]
};
const CURRENCY_TYPES = [
  { id: "cp", label: "CP (copper)", title: "100 cp = 1 gp" },
  { id: "sp", label: "SP (silver)", title: "10 sp = 1 gp" },
  { id: "ep", label: "EP (electrum)", title: "2 ep = 1 gp" },
  { id: "gp", label: "GP (gold)", title: "1 gp = 1 gp" },
  { id: "pp", label: "PP (platinum)", title: "1 pp = 10 gp" }
];

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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function jsonTemplateText() {
  return JSON.stringify(JSON_COLLECTION_TEMPLATE, null, 2);
}

function downloadJson(filename, data) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text) {
  try {
    if (game.clipboard?.copyPlainText) {
      await game.clipboard.copyPlainText(text);
      return true;
    }
  } catch (error) { /* fall through */ }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    return false;
  }
}

function getDialogV2() {
  return foundry.applications.api.DialogV2;
}

function getFilePicker() {
  return foundry.applications?.apps?.FilePicker ?? globalThis.FilePicker;
}

function dnd5eRarity(value) {
  const rarity = normalizeRarity(value);
  if (rarity === "very rare") return "veryRare";
  return rarity;
}

function sanitizeItemForActor(raw = {}) {
  const type = raw.type || "loot";
  const source = {
    name: String(raw.name || "Unnamed Item").trim() || "Unnamed Item",
    type,
    img: raw.img || DEFAULT_ITEM_IMG,
    system: foundry.utils.deepClone(raw.system || {})
  };
  if (source.system.rarity) source.system.rarity = dnd5eRarity(source.system.rarity);
  if (source.system.quantity == null) source.system.quantity = 1;
  try {
    const ItemClass = CONFIG.Item?.documentClass;
    if (ItemClass) {
      const data = new ItemClass(source).toObject();
      delete data._id;
      delete data.id;
      delete data.folder;
      return data;
    }
  } catch (error) {
    SM.warn("Could not instantiate item from catalog data:", error);
  }
  return source;
}

function normalizeCurrency(value) {
  const compact = String(value || "gp").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (compact === "cp" || compact.startsWith("copper")) return "cp";
  if (compact === "sp" || compact.startsWith("silver")) return "sp";
  if (compact === "ep" || compact.startsWith("electrum")) return "ep";
  if (compact === "pp" || compact.startsWith("platinum")) return "pp";
  return "gp";
}

function parsePriceString(text) {
  const match = String(text || "").trim().match(/^(-?\d+(?:\.\d+)?)\s*([a-zA-Z].*)?$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return { value, denomination: normalizeCurrency(match[2] || "gp") };
}

function parseItemPrice(item = {}) {
  const fallbackDenom = item.priceDenomination || item.denomination
    || (item.system?.price && typeof item.system.price === "object" && item.system.price.denomination)
    || "gp";
  if (typeof item.price === "string") {
    const parsed = parsePriceString(item.price);
    if (!parsed) return null;
    if (!/[a-zA-Z]/.test(item.price)) parsed.denomination = normalizeCurrency(fallbackDenom);
    return parsed;
  }
  const raw = item.system?.price;
  if (typeof raw === "string") return parsePriceString(raw);
  const value = Number(typeof raw === "number" ? raw : (raw?.value ?? item.price));
  if (!Number.isFinite(value)) return null;
  return { value, denomination: normalizeCurrency(fallbackDenom) };
}

function formatItemPrice(item) {
  const parsed = parseItemPrice(item);
  if (!parsed) return "—";
  return `${parsed.value} ${parsed.denomination}`;
}

function currencyOptionsHtml(selected = "gp") {
  const current = normalizeCurrency(selected);
  return CURRENCY_TYPES.map(entry =>
    `<option value="${entry.id}" title="${entry.title}"${entry.id === current ? " selected" : ""}>${entry.label}</option>`
  ).join("");
}

async function renderItemSheet(doc) {
  const sheet = doc?.sheet;
  if (!sheet?.render) return false;
  await sheet.render({ force: true });
  sheet.bringToFront?.();
  return true;
}

async function openItemSheet(item, { sourceType, sourceId } = {}) {
  if (!item) return;
  try {
    if (item.sheet) {
      await renderItemSheet(item);
      return;
    }
    const uuid = item.uuid || item.flags?.core?.sourceId;
    if (uuid && globalThis.fromUuid) {
      const doc = await fromUuid(uuid);
      if (doc && await renderItemSheet(doc)) return;
    }
    if (sourceType === "compendium" && sourceId && item._id) {
      const pack = game.packs.get(sourceId);
      const doc = await pack?.getDocument(item._id);
      if (doc && await renderItemSheet(doc)) return;
    }
    const ItemClass = CONFIG.Item?.documentClass;
    if (!ItemClass) throw new Error("Item document class is missing.");
    const tmp = new ItemClass(sanitizeItemForActor(item), { temporary: true });
    await renderItemSheet(tmp);
  } catch (error) {
    SM.error("Could not open item:", error);
    ui.notifications.warn(`Could not open ${item.name || "item"}.`);
  }
}

function openImagePicker({ current, callback } = {}) {
  const FilePicker = getFilePicker();
  if (!FilePicker) {
    ui.notifications.error("Image picker is not available.");
    return;
  }
  const picker = new FilePicker({
    type: "image",
    current: current || DEFAULT_ITEM_IMG,
    callback
  });
  if (typeof picker.browse === "function") return picker.browse();
  return picker.render({ force: true });
}

function ensureMerchantStyles() {
  if (document.querySelector('link[href*="sanctum-merchant.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `modules/${MODULE_ID}/styles/sanctum-merchant.css`;
  document.head.appendChild(link);
}

Hooks.once("init", ensureMerchantStyles);
if (document.head) ensureMerchantStyles();

const STOCK_FLAG = "stock";
const stockPreview = new WeakMap();
const jsonImportPreview = new WeakMap();
let selectedDirectoryActorId = null;
let targetRefreshQueued = false;

function normalizeRarity(str) {
  if (!str || !String(str).trim()) return "common";
  let value = String(str).toLowerCase().trim();
  if (value === "veryrare") value = "very rare";
  return value.replace(/[\s_-]+/g, " ");
}

function actorsMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.uuid && b.uuid) return a.uuid === b.uuid;
  return !!(a.id && b.id && a.id === b.id);
}

function resolveStockTarget() {
  const ip = SanctumMerchantItemPilesIntegration;
  const pinned = ip.currentMerchantActor;
  const merchantTargets = [];
  for (const app of ip.getOpenApps()) {
    if (!ip.isMerchantWindow(app)) continue;
    const actor = app.merchant || app.actor;
    if (!actor) continue;
    merchantTargets.push({ actor, name: actor.name, source: "window" });
  }
  if (pinned) {
    const pinnedTarget = merchantTargets.find(entry => actorsMatch(entry.actor, pinned));
    if (pinnedTarget) return pinnedTarget;
  }
  if (merchantTargets.length) return merchantTargets[0];
  for (const token of canvas?.tokens?.controlled ?? []) {
    if (!token.actor) continue;
    return { actor: token.actor, name: token.name || token.actor.name, token, source: "token" };
  }
  const directoryActor = selectedDirectoryActorId ? game.actors.get(selectedDirectoryActorId) : null;
  if (directoryActor) {
    return { actor: directoryActor, name: directoryActor.name, source: "directory" };
  }
  return null;
}

function getStockFlagDocument(actor) {
  if (!actor) return null;
  if (actor.isToken) return actor.token?.document ?? actor.token ?? actor;
  return actor;
}

function getWorldChatMode() {
  try {
    const mode = game.settings.get(MODULE_ID, "restockChatMode");
    if (mode === "off" || mode === "summary" || mode === "full") return mode;
  } catch (error) { /* ignore */ }
  try {
    return game.settings.get(MODULE_ID, "sendRestockMessage") === false ? "off" : "full";
  } catch (error) {
    return "full";
  }
}

function getWorldStockConfig() {
  const compendium = game.settings.get(MODULE_ID, "compendium") || "";
  const storedSource = game.settings.get(MODULE_ID, "itemSource") || "";
  const itemSource = storedSource || (compendium ? `compendium:${compendium}` : "");
  return {
    source: itemSource,
    formula: game.settings.get(MODULE_ID, "formula"),
    types: game.settings.get(MODULE_ID, "types").split(",").map(t => t.trim()).filter(Boolean),
    tags: game.settings.get(MODULE_ID, "tags").split(",").map(t => t.trim()).filter(Boolean),
    strictRarity: game.settings.get(MODULE_ID, "strictRarity"),
    merchantMessage: game.settings.get(MODULE_ID, "merchantMessage"),
    restockChatMode: getWorldChatMode(),
    restockMode: game.settings.get(MODULE_ID, "restockMode") || "add"
  };
}

function loadMerchantStockConfig(actor) {
  const saved = getStockFlagDocument(actor)?.getFlag?.(MODULE_ID, STOCK_FLAG);
  return saved && typeof saved === "object" ? saved : null;
}

async function saveMerchantStockConfig(actor, config) {
  const doc = getStockFlagDocument(actor);
  if (!doc?.setFlag) return;
  await doc.setFlag(MODULE_ID, STOCK_FLAG, config);
}

async function clearMerchantStockConfig(actor) {
  const doc = getStockFlagDocument(actor);
  if (!doc?.unsetFlag) return;
  await doc.unsetFlag(MODULE_ID, STOCK_FLAG);
}

function findOpenConfigDialog() {
  const apps = foundry.applications?.instances?.values?.() ?? [];
  for (const app of apps) {
    if (app.element?.querySelector?.("[data-sanctum-config]")) return app;
  }
  return null;
}

function stockTargetKey(target) {
  if (!target?.actor) return "";
  return [
    target.source || "",
    target.actor.uuid || target.actor.id || "",
    target.token?.id || target.actor.token?.id || ""
  ].join(":");
}

function setConfigDialogTarget(dialog, target) {
  const root = dialog?.element;
  if (!root) return;
  const label = root.querySelector("[data-sanctum-target]");
  if (label) {
    label.textContent = target
      ? `Target: ${target.name}`
      : "No merchant selected — open an Item Piles merchant or control a token.";
  }
  const title = target ? `Sanctum Merchant — ${target.name}` : "Sanctum Merchant";
  if (dialog.options?.window) dialog.options.window.title = title;
  const titleEl = root.querySelector(".window-title");
  if (titleEl) titleEl.textContent = title;
}

function refreshOpenConfigDialogTarget() {
  const dialog = findOpenConfigDialog();
  if (!dialog?.element) return;
  const target = resolveStockTarget();
  const key = stockTargetKey(target);
  const previous = dialog.element.dataset.sanctumTargetKey ?? "";
  if (key === previous) {
    setConfigDialogTarget(dialog, target);
    return;
  }
  dialog.element.dataset.sanctumTargetKey = key;
  clearStockPreview(dialog);
  bindConfigDialog(dialog);
}

function queueConfigTargetRefresh() {
  if (targetRefreshQueued) return;
  targetRefreshQueued = true;
  requestAnimationFrame(() => {
    targetRefreshQueued = false;
    refreshOpenConfigDialogTarget();
  });
}

function bindActorDirectoryTarget(root) {
  const host = asElement(root) ?? asElement(ui.actors);
  if (!host || host.dataset.sanctumTargetClicks) return;
  host.dataset.sanctumTargetClicks = "true";
  host.addEventListener("click", event => {
    const row = event.target.closest("[data-entry-id], [data-document-id]");
    if (!row || !host.contains(row)) return;
    const id = row.dataset.entryId || row.dataset.documentId;
    if (!id || !game.actors.get(id)) return;
    selectedDirectoryActorId = id;
    queueConfigTargetRefresh();
  });
}

function registerConfigTargetWatchers() {
  if (registerConfigTargetWatchers.done) return;
  registerConfigTargetWatchers.done = true;
  Hooks.on("controlToken", queueConfigTargetRefresh);
  const onMerchantApp = app => {
    if (SanctumMerchantItemPilesIntegration.isMerchantWindow(app)) queueConfigTargetRefresh();
  };
  Hooks.on("renderApplication", onMerchantApp);
  Hooks.on("closeApplication", onMerchantApp);
  Hooks.on("renderApplicationV2", onMerchantApp);
  Hooks.on("closeApplicationV2", onMerchantApp);
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
  static STORAGE_KEY = "jsonCollections";

  static _load() {
    try {
      const data = game.settings.get(MODULE_ID, this.STORAGE_KEY);
      return data && typeof data === "object" ? foundry.utils.duplicate(data) : {};
    } catch (error) {
      return {};
    }
  }

  static async _save(collections) {
    await game.settings.set(MODULE_ID, this.STORAGE_KEY, foundry.utils.duplicate(collections));
  }

  static normalizeItem(item = {}) {
    const parsedPrice = parseItemPrice(item);
    const price = parsedPrice && parsedPrice.value > 0
      ? {
        ...(typeof item.system?.price === "object" && item.system.price ? item.system.price : {}),
        value: parsedPrice.value,
        denomination: parsedPrice.denomination
      }
      : item.system?.price;
    let rarity = item.system?.rarity || item.rarity || "common";
    if (rarity === "veryRare") rarity = "very rare";
    return {
      ...item,
      _id: item._id || foundry.utils.randomID(),
      name: String(item.name || "Unnamed Item").trim() || "Unnamed Item",
      type: item.type || "equipment",
      img: item.img || DEFAULT_ITEM_IMG,
      system: {
        ...(item.system || {}),
        rarity,
        ...(price ? { price } : {})
      }
    };
  }

  static serializeItem(item = {}) {
    let rarity = item.system?.rarity || item.rarity || "common";
    if (rarity === "veryRare") rarity = "very rare";
    rarity = normalizeRarity(rarity);
    const out = {
      name: String(item.name || "Unnamed Item").trim() || "Unnamed Item",
      type: item.type || "equipment",
      rarity
    };
    if (item.img && item.img !== DEFAULT_ITEM_IMG) out.img = item.img;
    const parsedPrice = parseItemPrice(item);
    if (parsedPrice && parsedPrice.value > 0) {
      out.price = parsedPrice.value;
      out.priceDenomination = parsedPrice.denomination;
    }
    const system = item.system && typeof item.system === "object"
      ? foundry.utils.deepClone(item.system)
      : null;
    if (system) {
      const extra = Object.keys(system).filter(key => !["rarity", "price", "quantity"].includes(key));
      if (extra.length) out.system = system;
    }
    return out;
  }

  static extractImportItems(data) {
    if (Array.isArray(data)) return { name: "Imported Items", rawItems: data };
    if (!data || typeof data !== "object") {
      throw new Error("JSON must be an object or an array of items.");
    }
    if (Array.isArray(data.items)) {
      return {
        name: String(data.name || "Imported Items").trim() || "Imported Items",
        rawItems: data.items
      };
    }
    if (Array.isArray(data.results)) {
      return {
        name: String(data.name || "Imported Items").trim() || "Imported Items",
        rawItems: data.results
      };
    }
    if (data.name && (data.type || data.system || data.rarity || data.price)) {
      return { name: "Imported Items", rawItems: [data] };
    }
    throw new Error('Invalid JSON. Use { "name": "Collection", "items": [...] } or an array of items.');
  }

  static parseJSON(jsonData) {
    let data;
    try {
      data = typeof jsonData === "string" ? JSON.parse(jsonData) : jsonData;
    } catch (error) {
      throw new Error(`JSON is not valid: ${error.message}`);
    }
    const { name, rawItems } = this.extractImportItems(data);
    const items = [];
    const skipped = [];
    rawItems.forEach((raw, index) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        skipped.push({ index, reason: "not an item object" });
        return;
      }
      const itemName = String(raw.name || "").trim();
      if (!itemName) {
        skipped.push({ index, reason: "missing name" });
        return;
      }
      items.push(this.normalizeItem({ ...raw, _id: foundry.utils.randomID() }));
    });
    return { name, items, skipped, total: rawItems.length };
  }

  static async saveParsed(parsed, { collectionId, name } = {}) {
    if (!parsed?.items?.length) throw new Error("No valid items to import.");
    const collections = this._load();
    const added = parsed.items.map(item => this.normalizeItem({ ...item, _id: foundry.utils.randomID() }));
    if (collectionId && collections[collectionId]) {
      collections[collectionId].items.push(...added);
      collections[collectionId].timestamp = Date.now();
      await this._save(collections);
      return {
        id: collectionId,
        name: collections[collectionId].name,
        itemCount: collections[collectionId].items.length,
        added: added.length,
        merged: true,
        skipped: parsed.skipped?.length || 0
      };
    }
    const id = `json-${foundry.utils.randomID()}`;
    const collectionName = String(name || parsed.name || "Imported Items").trim() || "Imported Items";
    collections[id] = { name: collectionName, items: added, timestamp: Date.now() };
    await this._save(collections);
    return {
      id,
      name: collectionName,
      itemCount: added.length,
      added: added.length,
      merged: false,
      skipped: parsed.skipped?.length || 0
    };
  }

  static async importJSON(jsonData, options = {}) {
    return this.saveParsed(this.parseJSON(jsonData), options);
  }

  static async createCollection(name) {
    const collections = this._load();
    const id = `json-${foundry.utils.randomID()}`;
    const collectionName = String(name || "Custom Items").trim() || "Custom Items";
    collections[id] = { name: collectionName, items: [], timestamp: Date.now() };
    await this._save(collections);
    return { id, name: collectionName, itemCount: 0 };
  }

  static async addItem(collectionId, item) {
    const collections = this._load();
    if (!collections[collectionId]) throw new Error("Collection not found.");
    const doc = this.normalizeItem(item);
    collections[collectionId].items.push(doc);
    collections[collectionId].timestamp = Date.now();
    await this._save(collections);
    return doc;
  }

  static async updateItem(collectionId, itemId, item) {
    const collections = this._load();
    const collection = collections[collectionId];
    if (!collection) throw new Error("Collection not found.");
    const index = collection.items.findIndex(entry => entry._id === itemId);
    if (index < 0) throw new Error("Item not found.");
    const updated = this.normalizeItem({ ...item, _id: itemId });
    collection.items[index] = updated;
    collection.timestamp = Date.now();
    await this._save(collections);
    return updated;
  }

  static async deleteItem(collectionId, itemId) {
    const collections = this._load();
    const collection = collections[collectionId];
    if (!collection) return false;
    const next = collection.items.filter(entry => entry._id !== itemId);
    if (next.length === collection.items.length) return false;
    collection.items = next;
    collection.timestamp = Date.now();
    await this._save(collections);
    return true;
  }

  static async renameCollection(collectionId, name) {
    const collections = this._load();
    if (!collections[collectionId]) return false;
    collections[collectionId].name = String(name || "").trim() || collections[collectionId].name;
    await this._save(collections);
    return true;
  }

  static getCollection(collectionId) {
    return this._load()[collectionId];
  }

  static getAllCollections() {
    return Object.entries(this._load()).map(([id, data]) => ({
      id,
      name: data.name,
      itemCount: data.items?.length || 0,
      timestamp: data.timestamp
    }));
  }

  static async deleteCollection(collectionId) {
    const collections = this._load();
    if (!(collectionId in collections)) return false;
    delete collections[collectionId];
    await this._save(collections);
    return true;
  }

  static exportCollection(collectionId) {
    const collection = this.getCollection(collectionId);
    if (!collection) {
      ui.notifications.error("Collection not found.");
      return;
    }
    const payload = {
      name: collection.name,
      items: (collection.items || []).map(item => this.serializeItem(item))
    };
    const filename = `${collection.name.replace(/[^\w-]+/g, "-").toLowerCase() || "collection"}.json`;
    downloadJson(filename, payload);
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
      if (this.isMerchantWindow(app)) queueConfigTargetRefresh();
    });

    this.isIntegrationReady = true;
    SM.log("Item Piles integration ready");
  }

  static onGetHeaderButtons(app, buttons) {
    if (!game.user.isGM) return;
    if (!this.isMerchantWindow(app)) return;
    if (buttons.some(button => button.class === "sanctum-merchant-stock")) return;

    this.currentMerchantActor = app.merchant || app.actor;
    queueConfigTargetRefresh();

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
    return resolveStockTarget()?.actor ?? null;
  }

  static async addItemsToMerchant(merchant, items) {
    const prepared = items.map(item => sanitizeItemForActor(item));
    if (!this.isItemPilesMerchant(merchant)) {
      return this.addItemsDirect(merchant, prepared);
    }

    try {
      await game.itempiles.API.addItems(merchant, prepared.map(item => ({
        item,
        quantity: Number(item.system?.quantity) || 1
      })));
      SM.log(`Added ${prepared.length} items via Item Piles API`);
      return true;
    } catch (error) {
      SM.error("Failed to add items via Item Piles API:", error);
      return this.addItemsDirect(merchant, prepared);
    }
  }

  static async addItemsDirect(merchant, items) {
    try {
      const prepared = items.map(item => sanitizeItemForActor(item));
      const actorItems = new Set(merchant.items.map(i => i.name));
      const newItems = prepared.filter(d => !actorItems.has(d.name));
      if (newItems.length === 0) {
        SM.warn("Every item name was already on the merchant.");
        return false;
      }
      await merchant.createEmbeddedDocuments("Item", newItems);
      SM.log(`Added ${newItems.length} items directly`);
      return true;
    } catch (error) {
      SM.error("Failed to add items directly:", error);
      ui.notifications.error(`Could not create items: ${error.message}`);
      return false;
    }
  }

  static async clearMerchantInventory(merchant, { silent = false } = {}) {
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
        if (!silent) ui.notifications.warn(`${merchant.name} has no items to remove.`);
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

      if (!silent) ui.notifications.info(`${merchant.name}'s inventory cleared (${itemIds.length} items)!`);
      return true;
    } catch (error) {
      SM.error("Failed to clear merchant inventory:", error);
      ui.notifications.error("Failed to clear merchant inventory.");
      return false;
    }
  }

  static snapshotItems(merchant) {
    if (!merchant?.items) return [];
    return merchant.items.map(item => item.toObject());
  }

  static async restoreItems(merchant, items) {
    if (!merchant || !items?.length) return true;
    try {
      if (this.isItemPilesMerchant(merchant) && game.itempiles?.API?.addItems) {
        await game.itempiles.API.addItems(merchant, items);
        return true;
      }
      await merchant.createEmbeddedDocuments("Item", items);
      return true;
    } catch (error) {
      SM.error("Failed to restore merchant inventory via Item Piles:", error);
      try {
        await merchant.createEmbeddedDocuments("Item", items);
        return true;
      } catch (fallbackError) {
        SM.error("Failed to restore merchant inventory:", fallbackError);
        return false;
      }
    }
  }
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "compendium", {
    name: "Default Compendium",
    hint: "Leave blank to use the last source chosen in Stock Merchant.",
    scope: "world",
    config: true,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, "itemSource", {
    name: "Item Source (compendium or json)",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, "jsonCollections", {
    scope: "world",
    config: false,
    type: Object,
    default: {}
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
    hint: "Legacy toggle. Use Restock Chat instead.",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "restockChatMode", {
    name: "Restock Chat",
    hint: "What to whisper to players when a merchant is stocked.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      off: "Off (no chat message)",
      summary: "Summary (count and rarities)",
      full: "Full list of item names"
    },
    default: "full"
  });

  game.settings.register(MODULE_ID, "chatModeMigrated", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "restockMode", {
    name: "Default Restock Mode",
    hint: "Default for new merchants and Reset. Change Add vs Replace on the rolled stock panel before Confirm.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      add: "Add to stock",
      replace: "Replace stock"
    },
    default: "add"
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

const shopProfiles = {
  general: {
    label: "General store",
    types: ["equipment", "loot", "consumable"],
    tags: ["common", "uncommon"],
    formula: "1d6+2",
    restockMode: "add",
    restockChatMode: "summary",
    merchantMessage: DEFAULT_MERCHANT_MESSAGE
  },
  alchemist: {
    label: "Alchemist",
    types: ["consumable", "loot"],
    tags: ["common", "uncommon", "rare"],
    formula: "1d4+2",
    restockMode: "add",
    restockChatMode: "summary",
    merchantMessage: "Fresh brews and bottled trouble."
  },
  blacksmith: {
    label: "Blacksmith",
    types: ["weapon", "equipment"],
    tags: ["common", "uncommon", "rare"],
    formula: "1d6",
    restockMode: "replace",
    restockChatMode: "summary",
    merchantMessage: "Steel on the rack. Don't waste my time."
  },
  fence: {
    label: "Fence",
    types: ["loot", "equipment", "weapon"],
    tags: ["rare", "very rare", "cursed", "exotic"],
    formula: "1d4+1",
    restockMode: "replace",
    restockChatMode: "off",
    merchantMessage: "Keep your voice down."
  }
};

function packGroupLabel(pack) {
  const meta = pack.metadata || {};
  const pkg = meta.packageName || "";
  const type = meta.packageType
    || (pkg === game.world?.id ? "world" : pkg === game.system?.id ? "system" : "module");
  if (type === "world" || pkg === game.world?.id) {
    return `World — ${game.world.title || game.world.id}`;
  }
  if (type === "system" || pkg === game.system?.id) {
    return game.system.title || "System";
  }
  return game.modules.get(pkg)?.title || pkg || "Other";
}

function sourceOptionHtml() {
  const packs = game.packs.filter(p => p.documentName === "Item" || p.metadata?.type === "Item");
  const groups = new Map();
  for (const pack of packs) {
    const label = packGroupLabel(pack);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(pack);
  }
  const groupNames = [...groups.keys()].sort((a, b) => {
    const rank = name => (name.startsWith("World") ? 0 : name === (game.system?.title || "System") ? 1 : 2);
    const diff = rank(a) - rank(b);
    return diff || a.localeCompare(b);
  });
  let html = '<option value="">Select a source</option>';
  for (const groupName of groupNames) {
    html += `<optgroup label="${escapeHtml(groupName)}">`;
    for (const pack of groups.get(groupName).sort((a, b) => a.title.localeCompare(b.title))) {
      html += `<option value="compendium:${pack.collection}">${escapeHtml(pack.title)}</option>`;
    }
    html += "</optgroup>";
  }
  const collections = JSONImportManager.getAllCollections();
  if (collections.length) {
    html += '<optgroup label="Custom collections">';
    collections.forEach(collection => {
      html += `<option value="json:${collection.id}">${escapeHtml(collection.name)} (${collection.itemCount} items)</option>`;
    });
    html += "</optgroup>";
  }
  return html;
}

const sourceItemCache = new Map();

async function loadSourceItems(sourceValue) {
  if (!sourceValue) return null;
  const isJson = sourceValue.startsWith("json:");
  if (!isJson && sourceItemCache.has(sourceValue)) return sourceItemCache.get(sourceValue);
  const promise = (async () => {
    const [sourceType, sourceId] = sourceValue.includes(":")
      ? sourceValue.split(":")
      : ["compendium", sourceValue];
    if (sourceType === "json") {
      const collection = JSONImportManager.getCollection(sourceId);
      if (!collection) return null;
      return { title: collection.name, items: collection.items || [] };
    }
    const pack = game.packs.get(sourceId);
    if (!pack) return null;
    const index = await pack.getIndex({ fields: ["name", "type", "system"] });
    return { title: pack.title, items: [...index] };
  })();
  if (!isJson) sourceItemCache.set(sourceValue, promise);
  return promise;
}

function itemRarity(item) {
  let rarity = item.system?.rarity;
  if (rarity === "veryRare") rarity = "very rare";
  return normalizeRarity(rarity);
}

function countFilterMatches(items, { types, tags, strictRarity }) {
  const allowedTypes = (types || []).map(type => String(type).toLowerCase());
  const rareTags = (tags || []).map(tag => normalizeRarity(tag));
  const total = items.length;
  if (!allowedTypes.length) {
    return { status: "need-types", match: 0, typeMatch: 0, total };
  }
  const byType = items.filter(item => allowedTypes.includes((item.type || "").toLowerCase()));
  if (strictRarity !== false && !rareTags.length) {
    return { status: "need-rarities", match: 0, typeMatch: byType.length, total };
  }
  const match = strictRarity !== false
    ? byType.filter(item => rareTags.includes(itemRarity(item)))
    : byType;
  return { status: "ok", match: match.length, typeMatch: byType.length, total };
}

async function summarizeItemSource(sourceValue) {
  const loaded = await loadSourceItems(sourceValue);
  if (!loaded) return null;
  const types = {};
  const rarities = {};
  for (const item of loaded.items) {
    const type = item.type || "unknown";
    types[type] = (types[type] || 0) + 1;
    const rarity = itemRarity(item);
    rarities[rarity] = (rarities[rarity] || 0) + 1;
  }
  const sortCounts = obj => Object.entries(obj).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return {
    title: loaded.title,
    total: loaded.items.length,
    types: sortCounts(types),
    rarities: sortCounts(rarities),
    sample: loaded.items.slice(0, 10).map(item => item.name).filter(Boolean)
  };
}

let matchCountSeq = 0;
async function fillFilterMatchCount(root) {
  const box = root.querySelector(".sanctum-match-count");
  if (!box) return;
  const config = readFormStockConfig(root);
  const seq = ++matchCountSeq;
  if (!config.sourceId && !String(config.source || "").includes(":")) {
    box.hidden = true;
    box.textContent = "";
    box.classList.remove("is-empty", "is-ready");
    return;
  }
  box.hidden = false;
  box.classList.remove("is-empty", "is-ready");
  box.textContent = "Counting matches…";
  try {
    const loaded = await loadSourceItems(config.source);
    if (seq !== matchCountSeq) return;
    if (!loaded) {
      box.hidden = true;
      return;
    }
    const result = countFilterMatches(loaded.items, config);
    if (result.status === "need-types") {
      box.textContent = "Select item types to see how many items would match.";
    } else if (result.status === "need-rarities") {
      box.textContent = `0 items would match — strict rarity is on and no rarity tags are selected (${result.typeMatch} match the types).`;
      box.classList.add("is-empty");
    } else if (result.match === 0) {
      box.textContent = `0 items match these filters (${result.typeMatch} match the types, ${result.total} in source). Roll Stock would find nothing.`;
      box.classList.add("is-empty");
    } else {
      box.textContent = `${result.match} item${result.match === 1 ? "" : "s"} match these filters (${result.total} in source).`;
      box.classList.add("is-ready");
    }
  } catch (error) {
    if (seq !== matchCountSeq) return;
    box.textContent = `Could not count matches: ${error.message}`;
    box.classList.add("is-empty");
  }
}

function renderSourcePreview(box, summary) {
  box.replaceChildren();
  if (!summary) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const title = document.createElement("div");
  title.className = "sanctum-source-preview-title";
  title.textContent = `${summary.title} — ${summary.total} item${summary.total === 1 ? "" : "s"}`;
  const types = document.createElement("div");
  types.textContent = `Types: ${summary.types.map(([name, count]) => `${name} ${count}`).join(" · ") || "none"}`;
  const rarities = document.createElement("div");
  rarities.textContent = `Rarities: ${summary.rarities.map(([name, count]) => `${name} ${count}`).join(" · ") || "none"}`;
  box.append(title, types, rarities);
  if (summary.sample.length) {
    const sample = document.createElement("div");
    sample.className = "sanctum-source-preview-sample";
    sample.textContent = `Examples: ${summary.sample.join(", ")}`;
    box.append(sample);
  }
}

let sourcePreviewSeq = 0;
async function fillSourcePreview(root, sourceValue) {
  const box = root.querySelector("[data-sanctum-source-preview]");
  if (!box) return;
  const seq = ++sourcePreviewSeq;
  if (!sourceValue) {
    renderSourcePreview(box, null);
    return;
  }
  box.hidden = false;
  box.textContent = "Loading source…";
  try {
    const summary = await summarizeItemSource(sourceValue);
    if (seq !== sourcePreviewSeq) return;
    renderSourcePreview(box, summary);
  } catch (error) {
    if (seq !== sourcePreviewSeq) return;
    box.textContent = `Could not read source: ${error.message}`;
  }
}

function pickSourceValue(sourceSelect, preferred) {
  const options = [...sourceSelect.options].map(option => option.value).filter(Boolean);
  if (preferred && options.includes(preferred)) return preferred;
  const lastUsed = game.settings.get(MODULE_ID, "itemSource");
  if (lastUsed && options.includes(lastUsed)) return lastUsed;
  const firstPack = options.find(value => value.startsWith("compendium:"));
  return firstPack || options[0] || "";
}

function fillCollectionSelect(select, selectedId = "") {
  if (!select) return;
  const collections = JSONImportManager.getAllCollections();
  select.innerHTML = "";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "No collection";
  select.append(none);
  const create = document.createElement("option");
  create.value = "__new__";
  create.textContent = "— New collection —";
  select.append(create);
  collections.forEach(collection => {
    const option = document.createElement("option");
    option.value = collection.id;
    option.textContent = `${collection.name} (${collection.itemCount})`;
    select.append(option);
  });
  if (selectedId && [...select.options].some(option => option.value === selectedId)) {
    select.value = selectedId;
  } else {
    select.value = "";
  }
}

function fillImportTargetSelect(select, selectedId = "") {
  if (!select) return;
  const collections = JSONImportManager.getAllCollections();
  select.innerHTML = "";
  const create = document.createElement("option");
  create.value = "";
  create.textContent = "New collection";
  select.append(create);
  collections.forEach(collection => {
    const option = document.createElement("option");
    option.value = collection.id;
    option.textContent = `Merge into ${collection.name} (${collection.itemCount})`;
    select.append(option);
  });
  if (selectedId && [...select.options].some(option => option.value === selectedId)) {
    select.value = selectedId;
  } else {
    select.value = "";
  }
}

function refreshConfigDialogCollections(dialog, { removedId } = {}) {
  const root = dialog?.element;
  if (!root) return;
  const sourceSelect = root.querySelector('[name="source"]');
  const collectionSelect = root.querySelector('[name="collection-select"]');
  const importTarget = root.querySelector('[name="import-target"]');
  const previousSource = sourceSelect?.value;
  const previousCollection = collectionSelect?.value;
  const previousImportTarget = importTarget?.value;
  if (sourceSelect) {
    sourceSelect.innerHTML = sourceOptionHtml();
    const keepSource = previousSource
      && previousSource !== `json:${removedId}`
      && [...sourceSelect.options].some(option => option.value === previousSource);
    sourceSelect.value = keepSource ? previousSource : pickSourceValue(sourceSelect, "");
    if (sourceSelect.value !== previousSource) {
      sourceSelect.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      fillSourcePreview(root, sourceSelect.value);
    }
  }
  const keepCollection = previousCollection
    && previousCollection !== removedId
    && previousCollection !== "__new__"
    ? previousCollection
    : "";
  fillCollectionSelect(collectionSelect, keepCollection);
  const newNameWrap = root.querySelector(".sanctum-new-collection-name");
  if (newNameWrap) newNameWrap.hidden = collectionSelect?.value !== "__new__";
  fillCatalogList(root, collectionSelect?.value);
  fillImportTargetSelect(importTarget, previousImportTarget === removedId ? "" : previousImportTarget);
  if (previousImportTarget === removedId) syncImportTargetName(root);
}

function countItemGroups(items) {
  const types = {};
  const rarities = {};
  for (const item of items) {
    const type = item.type || "unknown";
    types[type] = (types[type] || 0) + 1;
    const rarity = itemRarity(item);
    rarities[rarity] = (rarities[rarity] || 0) + 1;
  }
  const sortCounts = obj => Object.entries(obj).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { types: sortCounts(types), rarities: sortCounts(rarities) };
}

function fillJsonImportPreview(root, parsed) {
  const wrap = root.querySelector(".sanctum-import-preview");
  const summaryBox = root.querySelector(".sanctum-import-preview-summary");
  const nameInput = root.querySelector('[name="import-collection-name"]');
  const targetSelect = root.querySelector('[name="import-target"]');
  const confirmBtn = root.querySelector(".confirm-json-import");
  if (!wrap || !summaryBox) return;
  if (!parsed) {
    wrap.hidden = true;
    summaryBox.replaceChildren();
    if (confirmBtn) confirmBtn.disabled = true;
    return;
  }
  wrap.hidden = false;
  const groups = countItemGroups(parsed.items);
  renderSourcePreview(summaryBox, {
    title: parsed.name,
    total: parsed.items.length,
    types: groups.types,
    rarities: groups.rarities,
    sample: parsed.items.slice(0, 10).map(item => item.name).filter(Boolean)
  });
  if (parsed.skipped?.length) {
    const skip = document.createElement("div");
    skip.className = "sanctum-import-preview-skipped";
    const details = parsed.skipped.slice(0, 6).map(entry => `#${entry.index + 1} ${entry.reason}`).join("; ");
    skip.textContent = `Skipped ${parsed.skipped.length}: ${details}`;
    summaryBox.append(skip);
  }
  fillImportTargetSelect(targetSelect);
  if (nameInput) {
    nameInput.value = parsed.name || "Imported Items";
    nameInput.disabled = false;
  }
  if (confirmBtn) confirmBtn.disabled = parsed.items.length === 0;
  setAccordion(root, "import", true);
}

function syncImportTargetName(root) {
  const nameInput = root.querySelector('[name="import-collection-name"]');
  const targetSelect = root.querySelector('[name="import-target"]');
  if (!nameInput || !targetSelect) return;
  const collectionId = targetSelect.value;
  if (collectionId) {
    const collection = JSONImportManager.getCollection(collectionId);
    nameInput.value = collection?.name || "";
    nameInput.disabled = true;
  } else {
    nameInput.disabled = false;
  }
}

function normalizeRestockMode(value) {
  return value === "replace" ? "replace" : "add";
}

function syncRestockModeControls(root, value) {
  const mode = normalizeRestockMode(value);
  root.querySelectorAll('[name="restockMode"], [name="previewRestockMode"]').forEach(select => {
    select.value = mode;
  });
  const preview = root.querySelector(".sanctum-preview");
  preview?.classList.toggle("is-replace", mode === "replace");
}

function applyShopProfile(root, profile) {
  if (!profile) return;
  const formulaInput = root.querySelector('[name="formula"]');
  if (formulaInput) formulaInput.value = profile.formula;
  syncRestockModeControls(root, profile.restockMode);
  const chatSelect = root.querySelector('[name="restockChatMode"]');
  if (chatSelect) chatSelect.value = profile.restockChatMode;
  const messageInput = root.querySelector('[name="merchantMessage"]');
  if (messageInput) messageInput.value = profile.merchantMessage;
  const presetSelect = root.querySelector('[name="rarity-preset"]');
  if (presetSelect) presetSelect.value = "";
  const typeList = root.querySelector(".item-types");
  typeList?.replaceChildren();
  profile.types.forEach(type => typeList?.append(createTagElement(type)));
  const rarityList = root.querySelector(".rarity-tags");
  rarityList?.replaceChildren();
  profile.tags.forEach(tag => rarityList?.append(createTagElement(tag)));
}

function fieldValue(root, name) {
  return root.querySelector(`[name="${name}"]`)?.value ?? "";
}

function fieldChecked(root, name) {
  return !!root.querySelector(`[name="${name}"]`)?.checked;
}

function selectedTags(root, selector) {
  return Array.from(root.querySelectorAll(selector)).map(el => el.dataset.tag).filter(Boolean);
}

function readFormStockConfig(root) {
  const sourceValue = fieldValue(root, "source");
  let sourceType;
  let sourceId;
  if (sourceValue?.includes(":")) [sourceType, sourceId] = sourceValue.split(":");
  else {
    sourceType = "compendium";
    sourceId = sourceValue || game.settings.get(MODULE_ID, "compendium");
  }
  const presetName = fieldValue(root, "rarity-preset");
  const tags = presetName && rarityPresets[presetName]
    ? rarityPresets[presetName]
    : selectedTags(root, ".rarity-tags .tag").map(tag => tag.toLowerCase());
  return {
    source: sourceValue || `compendium:${sourceId}`,
    sourceType,
    sourceId,
    formula: fieldValue(root, "formula"),
    types: selectedTags(root, ".item-types .tag"),
    tags,
    presetName,
    strictRarity: fieldChecked(root, "strictRarity"),
    merchantMessage: fieldValue(root, "merchantMessage"),
    restockChatMode: fieldValue(root, "restockChatMode") || "full",
    restockMode: normalizeRestockMode(fieldValue(root, "previewRestockMode") || fieldValue(root, "restockMode"))
  };
}

async function saveWorldStockConfig(config) {
  if (config.sourceType === "compendium") {
    await game.settings.set(MODULE_ID, "itemSource", config.source);
    await game.settings.set(MODULE_ID, "compendium", config.sourceId);
    await game.settings.set(MODULE_ID, "formula", config.formula);
    await game.settings.set(MODULE_ID, "types", config.types.join(","));
    await game.settings.set(MODULE_ID, "strictRarity", config.strictRarity);
    await game.settings.set(MODULE_ID, "merchantMessage", config.merchantMessage);
    await game.settings.set(MODULE_ID, "tags", config.tags.join(","));
  }
  await game.settings.set(MODULE_ID, "restockChatMode", config.restockChatMode);
  await game.settings.set(MODULE_ID, "restockMode", config.restockMode);
}

function stockRollFingerprint(config) {
  return JSON.stringify({
    source: config.source || "",
    sourceId: config.sourceId || "",
    formula: config.formula || "",
    types: [...(config.types || [])].map(t => String(t).toLowerCase()).sort(),
    tags: [...(config.tags || [])].map(t => normalizeRarity(t)).sort(),
    strictRarity: config.strictRarity !== false
  });
}

function clearStockPreview(dialog) {
  stockPreview.delete(dialog);
  const root = dialog?.element;
  if (!root) return;
  renderStockPreview(root, []);
  const heading = root.querySelector(".sanctum-preview-heading");
  if (heading) heading.textContent = "Rolled stock";
}

function invalidatePreviewIfRollInputsChanged(dialog) {
  const preview = stockPreview.get(dialog);
  if (!preview) return;
  if (stockRollFingerprint(readFormStockConfig(dialog.element)) === stockRollFingerprint(preview.config)) return;
  clearStockPreview(dialog);
}

function setAccordion(root, id, open) {
  const toggle = root.querySelector(`[data-accordion="${id}"]`);
  const body = root.querySelector(`[data-accordion-body="${id}"]`);
  if (!toggle || !body) return;
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  toggle.classList.toggle("is-open", open);
  body.hidden = !open;
  const hint = toggle.querySelector(".sanctum-accordion-hint");
  if (hint) hint.textContent = open ? "Click to collapse" : "Click to expand";
  const icon = toggle.querySelector(".sanctum-accordion-icon");
  if (icon) {
    icon.classList.toggle("fa-chevron-right", !open);
    icon.classList.toggle("fa-chevron-down", open);
  }
}

function bindAccordions(root) {
  root.querySelectorAll(".sanctum-accordion-toggle").forEach(toggle => {
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      setAccordion(root, toggle.dataset.accordion, open);
    });
  });
}

function pinPreviewAboveFooter(root) {
  const preview = root.querySelector(".sanctum-preview");
  const footer = root.querySelector(".form-footer");
  if (!preview || !footer || preview.nextElementSibling === footer) return;
  footer.parentElement?.insertBefore(preview, footer);
}

function renderItemPickList(list, docs, checkboxClass, { actions = false } = {}) {
  list.replaceChildren();
  docs.forEach((item, index) => {
    const rarity = normalizeRarity(item.system?.rarity);
    const row = document.createElement("div");
    row.className = "sanctum-preview-row";
    if (actions) row.classList.add("has-actions");
    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = checkboxClass;
    check.dataset.index = String(index);
    check.dataset.id = item._id || String(index);
    check.checked = true;
    const img = document.createElement("img");
    img.src = item.img || DEFAULT_ITEM_IMG;
    img.alt = "";
    const name = document.createElement("span");
    name.className = "sanctum-preview-name";
    name.textContent = item.name || "Unnamed Item";
    const meta = document.createElement("span");
    meta.className = "sanctum-preview-meta";
    meta.textContent = `${item.type || "item"} · ${rarity}`;
    const price = document.createElement("span");
    price.className = "sanctum-preview-price";
    price.textContent = formatItemPrice(item);
    row.title = "Double-click to open";
    row.classList.add("is-openable");
    row.append(check, img, name, meta, price);
    if (actions) {
      const actionWrap = document.createElement("div");
      actionWrap.className = "sanctum-row-actions";
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "edit-catalog-item";
      editBtn.dataset.id = item._id;
      editBtn.title = "Edit";
      editBtn.innerHTML = '<i class="fas fa-pen"></i>';
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "delete-catalog-item";
      deleteBtn.dataset.id = item._id;
      deleteBtn.title = "Delete";
      deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
      actionWrap.append(editBtn, deleteBtn);
      row.append(actionWrap);
    }
    list.append(row);
  });
}

function renderStockPreview(root, docs) {
  const wrap = root.querySelector(".sanctum-preview");
  const list = root.querySelector(".sanctum-preview-list");
  if (!wrap || !list) return;
  pinPreviewAboveFooter(root);
  renderItemPickList(list, docs, "sanctum-preview-item");
  wrap.classList.toggle("is-open", docs.length > 0);
  syncRestockModeControls(root, fieldValue(root, "restockMode"));
}

function fillCatalogList(root, collectionId) {
  const wrap = root.querySelector(".sanctum-catalog");
  const list = root.querySelector(".sanctum-catalog-list");
  if (!wrap || !list) return;
  const collection = collectionId && collectionId !== "__new__"
    ? JSONImportManager.getCollection(collectionId)
    : null;
  const items = collection?.items || [];
  wrap.hidden = !collection;
  if (collection) {
    setAccordion(root, "collections", true);
    setAccordion(root, "catalog", true);
  }
  const heading = wrap.querySelector(".sanctum-catalog-heading");
  if (heading) {
    heading.textContent = collection
      ? `${collection.name} (${items.length})`
      : "Collection items";
  }
  const actions = wrap.querySelector(".sanctum-catalog-actions");
  if (actions) actions.hidden = items.length === 0;
  renderItemPickList(list, items, "sanctum-catalog-item", { actions: true });
}

async function stockCatalogSelection(root, { all = false } = {}) {
  const target = resolveStockTarget();
  if (!target) {
    ui.notifications.error("No merchant selected. Open an Item Piles merchant or control a token.");
    return;
  }
  const collectionId = root.querySelector('[name="collection-select"]')?.value;
  const collection = JSONImportManager.getCollection(collectionId);
  if (!collection?.items?.length) {
    ui.notifications.warn("This collection has no items.");
    return;
  }
  let docs = collection.items;
  if (!all) {
    const checked = new Set(
      [...root.querySelectorAll(".sanctum-catalog-item:checked")].map(el => el.dataset.id)
    );
    docs = docs.filter(item => checked.has(item._id));
  }
  if (!docs.length) {
    ui.notifications.warn("Select at least one item to stock.");
    return;
  }
  const success = await SanctumMerchantItemPilesIntegration.addItemsToMerchant(target.actor, docs);
  if (success) {
    ui.notifications.info(`Stocked ${docs.length} item${docs.length === 1 ? "" : "s"} from "${collection.name}" on ${target.name}.`);
  } else {
    ui.notifications.warn(`Could not add those items to ${target.name}.`);
  }
}

async function rollStockPreview(dialog) {
  const root = dialog.element;
  const target = resolveStockTarget();
  if (!target) {
    ui.notifications.error("No merchant selected. Open an Item Piles merchant or control a token.");
    return;
  }
  const config = readFormStockConfig(root);
  if (config.types.length === 0) {
    ui.notifications.warn("Please select at least one item type.");
    return;
  }
  const rolled = await game.sanctumMerchant.selectStockItems(config);
  if (!rolled?.docs?.length) return;
  stockPreview.set(dialog, { docs: rolled.docs, sourceName: rolled.sourceName, config, target });
  renderStockPreview(root, rolled.docs);
  const heading = root.querySelector(".sanctum-preview-heading");
  if (heading) heading.textContent = `Rolled stock (${rolled.docs.length}) for ${target.name}`;
  ui.notifications.info(`Rolled ${rolled.docs.length} items. Uncheck any to skip, double-click for details, then Confirm Stock.`);
}

async function confirmStockPreview(dialog) {
  const preview = stockPreview.get(dialog);
  if (!preview?.docs?.length) {
    ui.notifications.warn("Roll stock first, then confirm.");
    return;
  }
  const root = dialog.element;
  const current = readFormStockConfig(root);
  if (stockRollFingerprint(current) !== stockRollFingerprint(preview.config)) {
    clearStockPreview(dialog);
    ui.notifications.warn("Filters changed since the last roll. Roll Stock again.");
    return;
  }
  const checked = new Set(
    Array.from(root.querySelectorAll(".sanctum-preview-item:checked")).map(el => Number(el.dataset.index))
  );
  const docs = preview.docs.filter((_item, index) => checked.has(index));
  if (docs.length === 0) {
    ui.notifications.warn("No items selected to stock.");
    return;
  }
  const config = {
    ...preview.config,
    restockMode: normalizeRestockMode(current.restockMode),
    restockChatMode: current.restockChatMode,
    merchantMessage: current.merchantMessage
  };
  const target = resolveStockTarget() || preview.target;
  if (!target) {
    ui.notifications.error("No merchant selected. Open an Item Piles merchant or control a token.");
    return;
  }
  await saveWorldStockConfig(config);
  await saveMerchantStockConfig(target.actor, {
    source: config.source,
    formula: config.formula,
    types: config.types,
    tags: config.tags,
    strictRarity: config.strictRarity,
    merchantMessage: config.merchantMessage,
    restockChatMode: config.restockChatMode,
    restockMode: config.restockMode
  });
  await game.sanctumMerchant.commitStockItems(target.actor, docs, {
    sourceName: preview.sourceName,
    merchantName: target.name,
    restockMode: config.restockMode,
    restockChatMode: config.restockChatMode,
    merchantMessage: config.merchantMessage
  });
  clearStockPreview(dialog);
}

async function clearInventoryCallback() {
  try {
    const target = resolveStockTarget();
    if (!target) {
      ui.notifications.error("No merchant selected. Open an Item Piles merchant or control a token.");
      return;
    }
    await SanctumMerchantItemPilesIntegration.clearMerchantInventory(target.actor);
  } catch (err) {
    SM.error("Inventory clear failed:", err);
    ui.notifications.error("Something went wrong clearing the merchant.");
  }
}

async function resetMerchantSettings() {
  try {
    await game.settings.set(MODULE_ID, "compendium", "");
    await game.settings.set(MODULE_ID, "itemSource", "");
    await game.settings.set(MODULE_ID, "formula", DEFAULT_FORMULA);
    await game.settings.set(MODULE_ID, "types", DEFAULT_STOCK_TYPES.join(","));
    await game.settings.set(MODULE_ID, "strictRarity", true);
    await game.settings.set(MODULE_ID, "sendRestockMessage", true);
    await game.settings.set(MODULE_ID, "restockChatMode", "full");
    await game.settings.set(MODULE_ID, "restockMode", "add");
    await game.settings.set(MODULE_ID, "merchantMessage", DEFAULT_MERCHANT_MESSAGE);
    await game.settings.set(MODULE_ID, "tags", "");
    const target = resolveStockTarget();
    if (target?.actor) {
      await clearMerchantStockConfig(target.actor);
      ui.notifications.info(`Sanctum Merchant settings reset to default for ${target.name}.`);
    } else {
      ui.notifications.info("Sanctum Merchant world settings reset to default.");
    }
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
  root.querySelector(".item-types")?.replaceChildren();
  root.querySelector(".rarity-tags")?.replaceChildren();
  const target = resolveStockTarget();
  const config = { ...getWorldStockConfig(), ...(target ? loadMerchantStockConfig(target.actor) : {}) };
  root.dataset.sanctumTargetKey = stockTargetKey(target);
  setConfigDialogTarget(dialog, target);

  const sourceSelect = root.querySelector('[name="source"]');
  if (sourceSelect) {
    sourceSelect.innerHTML = sourceOptionHtml();
    sourceSelect.value = pickSourceValue(sourceSelect, config.source);
    fillSourcePreview(root, sourceSelect.value);
  }
  fillCollectionSelect(root.querySelector('[name="collection-select"]'));
  const collectionSelect = root.querySelector('[name="collection-select"]');
  const newNameWrap = root.querySelector(".sanctum-new-collection-name");
  if (newNameWrap) {
    newNameWrap.hidden = collectionSelect?.value !== "__new__";
  }
  fillCatalogList(root, collectionSelect?.value);
  pinPreviewAboveFooter(root);

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

  function restoreSavedTypes(types = config.types) {
    const typeList = root.querySelector(".item-types");
    if (!typeList) return;
    for (const type of types || []) {
      if (!typeList.querySelector(`[data-tag="${type}"]`)) {
        typeList.append(createTagElement(type));
      }
    }
  }

  if (!root.dataset.sanctumBound) {
    root.dataset.sanctumBound = "true";
    bindAccordions(root);
    sourceSelect?.addEventListener("change", async event => {
      const val = event.currentTarget.value;
      await game.settings.set(MODULE_ID, "itemSource", val);
      if (val?.startsWith("compendium:")) {
        await game.settings.set(MODULE_ID, "compendium", val.split(":")[1]);
      }
      root.querySelector(".item-types")?.replaceChildren();
      await populateItemTypes(val);
      restoreSavedTypes();
      await fillSourcePreview(root, val);
      await fillFilterMatchCount(root);
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

    root.querySelector(".insert-json-template")?.addEventListener("click", () => {
      const textarea = root.querySelector('[name="json-import"]');
      if (textarea) textarea.value = jsonTemplateText();
      ui.notifications.info("Inserted the collection template. Edit it, then Preview import.");
    });

    root.querySelector(".copy-json-template")?.addEventListener("click", async () => {
      const copied = await copyText(jsonTemplateText());
      ui.notifications[copied ? "info" : "warn"](copied
        ? "Copied the collection template."
        : "Could not copy. Use Insert template instead.");
    });

    root.querySelector(".download-json-template")?.addEventListener("click", () => {
      downloadJson("sanctum-collection-template.json", JSON_COLLECTION_TEMPLATE);
      ui.notifications.info("Downloaded sanctum-collection-template.json.");
    });

    root.querySelector(".import-json")?.addEventListener("click", () => {
      const jsonText = fieldValue(root, "json-import");
      if (!jsonText) {
        ui.notifications.warn("Paste JSON, or insert the template first.");
        return;
      }
      try {
        const parsed = JSONImportManager.parseJSON(jsonText);
        jsonImportPreview.set(dialog, parsed);
        fillJsonImportPreview(root, parsed);
        if (!parsed.items.length) {
          ui.notifications.warn(`No valid items to import${parsed.skipped.length ? ` (${parsed.skipped.length} skipped)` : ""}.`);
          return;
        }
        ui.notifications.info(`Ready to import ${parsed.items.length} item${parsed.items.length === 1 ? "" : "s"}. Confirm below.`);
      } catch (error) {
        jsonImportPreview.delete(dialog);
        fillJsonImportPreview(root, null);
        ui.notifications.error(`Import failed: ${error.message}`);
      }
    });

    root.querySelector('[name="import-target"]')?.addEventListener("change", () => syncImportTargetName(root));

    root.querySelector(".cancel-json-import")?.addEventListener("click", () => {
      jsonImportPreview.delete(dialog);
      fillJsonImportPreview(root, null);
    });

    root.querySelector(".confirm-json-import")?.addEventListener("click", async () => {
      const parsed = jsonImportPreview.get(dialog);
      if (!parsed?.items?.length) {
        ui.notifications.warn("Preview import first.");
        return;
      }
      try {
        const result = await JSONImportManager.saveParsed(parsed, {
          collectionId: fieldValue(root, "import-target"),
          name: fieldValue(root, "import-collection-name")
        });
        jsonImportPreview.delete(dialog);
        fillJsonImportPreview(root, null);
        const textarea = root.querySelector('[name="json-import"]');
        if (textarea) textarea.value = "";
        if (sourceSelect) {
          sourceSelect.innerHTML = sourceOptionHtml();
          sourceSelect.value = `json:${result.id}`;
          await game.settings.set(MODULE_ID, "itemSource", sourceSelect.value);
          root.querySelector(".item-types")?.replaceChildren();
          await populateItemTypes(sourceSelect.value);
        }
        fillCollectionSelect(root.querySelector('[name="collection-select"]'), result.id);
        fillCatalogList(root, result.id);
        const skipNote = result.skipped ? ` (${result.skipped} skipped)` : "";
        ui.notifications.info(result.merged
          ? `Added ${result.added} item${result.added === 1 ? "" : "s"} to "${result.name}"${skipNote}.`
          : `Saved "${result.name}" with ${result.itemCount} item${result.itemCount === 1 ? "" : "s"}${skipNote}.`);
      } catch (error) {
        ui.notifications.error(`Import failed: ${error.message}`);
      }
    });

    root.querySelector(".clear-roll")?.addEventListener("click", () => clearStockPreview(dialog));

    async function openRowItem(event) {
      if (event.target.closest("input, button, a")) return;
      const row = event.target.closest(".sanctum-preview-row");
      if (!row) return;
      event.preventDefault();
      const previewCheck = row.querySelector(".sanctum-preview-item");
      if (previewCheck) {
        const index = Number(previewCheck.dataset.index);
        const preview = stockPreview.get(dialog);
        const item = Number.isInteger(index) ? preview?.docs?.[index] : null;
        if (item) await openItemSheet(item, preview.config);
        return;
      }
      const catalogCheck = row.querySelector(".sanctum-catalog-item");
      if (!catalogCheck) return;
      const collectionId = root.querySelector('[name="collection-select"]')?.value;
      const item = JSONImportManager.getCollection(collectionId)?.items.find(entry => entry._id === catalogCheck.dataset.id);
      if (item) await openItemSheet(item, { sourceType: "json", sourceId: collectionId });
    }
    root.querySelector(".sanctum-preview-list")?.addEventListener("dblclick", openRowItem);
    root.querySelector(".sanctum-catalog-list")?.addEventListener("dblclick", openRowItem);

    root.addEventListener("change", event => {
      const name = event.target?.name;
      if (name !== "restockMode" && name !== "previewRestockMode") return;
      syncRestockModeControls(root, event.target.value);
    });

    root.querySelector(".manage-imports")?.addEventListener("click", () => openManageCollectionsDialog(dialog));

    root.querySelector('[name="collection-select"]')?.addEventListener("change", event => {
      const wrap = root.querySelector(".sanctum-new-collection-name");
      if (wrap) wrap.hidden = event.currentTarget.value !== "__new__";
      if (!root.dataset.editingItemId) resetCustomItemForm();
      fillCatalogList(root, event.currentTarget.value);
    });

    root.querySelector(".stock-selected-catalog")?.addEventListener("click", () => stockCatalogSelection(root, { all: false }));
    root.querySelector(".stock-all-catalog")?.addEventListener("click", () => stockCatalogSelection(root, { all: true }));

    root.querySelector(".sanctum-catalog-list")?.addEventListener("click", async event => {
      const editBtn = event.target.closest(".edit-catalog-item");
      const deleteBtn = event.target.closest(".delete-catalog-item");
      if (!editBtn && !deleteBtn) return;
      const collectionId = root.querySelector('[name="collection-select"]')?.value;
      const itemId = (editBtn || deleteBtn).dataset.id;
      const item = JSONImportManager.getCollection(collectionId)?.items.find(entry => entry._id === itemId);
      if (!item) return;
      if (editBtn) {
        beginEditCatalogItem(item);
        return;
      }
      const confirmed = await getDialogV2().confirm({
        window: { title: "Delete item" },
        content: `<p>Remove <strong>${escapeHtml(item.name)}</strong> from this collection?</p>`
      });
      if (!confirmed) return;
      await JSONImportManager.deleteItem(collectionId, itemId);
      if (root.dataset.editingItemId === itemId) resetCustomItemForm();
      fillCatalogList(root, collectionId);
      fillCollectionSelect(root.querySelector('[name="collection-select"]'), collectionId);
      ui.notifications.info(`Removed ${item.name}.`);
    });

    root.querySelector(".pick-item-img")?.addEventListener("click", () => {
      openImagePicker({
        current: fieldValue(root, "new-item-img") || DEFAULT_ITEM_IMG,
        callback: path => {
          const input = root.querySelector('[name="new-item-img"]');
          const preview = root.querySelector(".sanctum-item-img-preview");
          if (input) input.value = path;
          if (preview) preview.src = path;
        }
      });
    });

    function customItemPayload() {
      const rarity = fieldValue(root, "new-item-rarity") || "common";
      return {
        name: fieldValue(root, "new-item-name"),
        type: fieldValue(root, "new-item-type") || "equipment",
        rarity,
        img: fieldValue(root, "new-item-img"),
        price: fieldValue(root, "new-item-price"),
        priceDenomination: fieldValue(root, "new-item-currency") || "gp",
        system: { rarity }
      };
    }

    async function saveCustomItemFromForm() {
      const collectionSelect = root.querySelector('[name="collection-select"]');
      const editingId = root.dataset.editingItemId;
      let collectionId = editingId
        ? (root.dataset.editingCollectionId || collectionSelect?.value)
        : collectionSelect?.value;
      if (!editingId && !collectionId) {
        ui.notifications.warn("Select a collection, or choose New collection.");
        return null;
      }
      if (!editingId && collectionId === "__new__") {
        const created = await JSONImportManager.createCollection(fieldValue(root, "new-collection-name"));
        collectionId = created.id;
      }
      const payload = customItemPayload();
      if (!payload.name) {
        ui.notifications.warn("Enter an item name.");
        return null;
      }
      const doc = editingId
        ? await JSONImportManager.updateItem(collectionId, editingId, payload)
        : await JSONImportManager.addItem(collectionId, payload);
      return {
        doc,
        collectionId,
        collection: JSONImportManager.getCollection(collectionId),
        updated: !!editingId
      };
    }

    function resetCustomItemForm() {
      delete root.dataset.editingItemId;
      delete root.dataset.editingCollectionId;
      const nameInput = root.querySelector('[name="new-item-name"]');
      if (nameInput) nameInput.value = "";
      const priceInput = root.querySelector('[name="new-item-price"]');
      if (priceInput) priceInput.value = "";
      const currencySelect = root.querySelector('[name="new-item-currency"]');
      if (currencySelect) currencySelect.value = "gp";
      const imgInput = root.querySelector('[name="new-item-img"]');
      if (imgInput) imgInput.value = DEFAULT_ITEM_IMG;
      const preview = root.querySelector(".sanctum-item-img-preview");
      if (preview) preview.src = DEFAULT_ITEM_IMG;
      const addBtn = root.querySelector(".add-custom-item");
      if (addBtn) addBtn.innerHTML = '<i class="fas fa-plus"></i> Add to collection';
      const cancelBtn = root.querySelector(".cancel-edit-item");
      if (cancelBtn) cancelBtn.hidden = true;
    }

    function beginEditCatalogItem(item) {
      root.dataset.editingItemId = item._id;
      root.dataset.editingCollectionId = root.querySelector('[name="collection-select"]')?.value || "";
      const nameInput = root.querySelector('[name="new-item-name"]');
      if (nameInput) nameInput.value = item.name || "";
      const typeSelect = root.querySelector('[name="new-item-type"]');
      if (typeSelect) typeSelect.value = item.type || "equipment";
      const raritySelect = root.querySelector('[name="new-item-rarity"]');
      if (raritySelect) raritySelect.value = normalizeRarity(item.system?.rarity);
      const priceInput = root.querySelector('[name="new-item-price"]');
      if (priceInput) priceInput.value = item.system?.price?.value ?? "";
      const currencySelect = root.querySelector('[name="new-item-currency"]');
      if (currencySelect) currencySelect.value = normalizeCurrency(item.system?.price?.denomination);
      const imgPath = item.img || DEFAULT_ITEM_IMG;
      const imgInput = root.querySelector('[name="new-item-img"]');
      if (imgInput) imgInput.value = imgPath;
      const preview = root.querySelector(".sanctum-item-img-preview");
      if (preview) preview.src = imgPath;
      const addBtn = root.querySelector(".add-custom-item");
      if (addBtn) addBtn.innerHTML = '<i class="fas fa-save"></i> Save changes';
      const cancelBtn = root.querySelector(".cancel-edit-item");
      if (cancelBtn) cancelBtn.hidden = false;
      nameInput?.scrollIntoView({ block: "nearest" });
      setAccordion(root, "collections", true);
      setAccordion(root, "additem", true);
    }

    async function refreshSourceAfterCustomItem(collectionId) {
      if (!sourceSelect) return;
      sourceSelect.innerHTML = sourceOptionHtml();
      sourceSelect.value = `json:${collectionId}`;
      await game.settings.set(MODULE_ID, "itemSource", sourceSelect.value);
      root.querySelector(".item-types")?.replaceChildren();
      await populateItemTypes(sourceSelect.value);
      restoreSavedTypes();
      fillCollectionSelect(root.querySelector('[name="collection-select"]'), collectionId);
      const wrap = root.querySelector(".sanctum-new-collection-name");
      if (wrap) wrap.hidden = true;
      fillCatalogList(root, collectionId);
      await fillSourcePreview(root, sourceSelect.value);
    }

    root.querySelector(".cancel-edit-item")?.addEventListener("click", () => resetCustomItemForm());

    root.querySelector(".add-custom-item")?.addEventListener("click", async () => {
      try {
        const saved = await saveCustomItemFromForm();
        if (!saved) return;
        ui.notifications.info(saved.updated
          ? `Updated ${saved.doc.name} in "${saved.collection?.name}".`
          : `Added ${saved.doc.name} to "${saved.collection?.name}".`);
        resetCustomItemForm();
        await refreshSourceAfterCustomItem(saved.collectionId);
      } catch (error) {
        ui.notifications.error(`Could not add item: ${error.message}`);
      }
    });

    root.querySelector(".stock-custom-item")?.addEventListener("click", async () => {
      try {
        const target = resolveStockTarget();
        if (!target) {
          ui.notifications.error("No merchant selected. Open an Item Piles merchant or control a token.");
          return;
        }
        const saved = await saveCustomItemFromForm();
        if (!saved) return;
        const success = await SanctumMerchantItemPilesIntegration.addItemsToMerchant(target.actor, [saved.doc]);
        if (success) {
          ui.notifications.info(`Stocked ${saved.doc.name} on ${target.name} and saved to "${saved.collection?.name}".`);
        } else {
          ui.notifications.warn(`Saved ${saved.doc.name} to the collection, but could not add it to ${target.name}.`);
        }
        resetCustomItemForm();
        await refreshSourceAfterCustomItem(saved.collectionId);
      } catch (error) {
        ui.notifications.error(`Could not stock item: ${error.message}`);
      }
    });

    root.querySelector('[name="shop-profile"]')?.addEventListener("change", event => {
      const profile = shopProfiles[event.currentTarget.value];
      if (!profile) return;
      applyShopProfile(root, profile);
      invalidatePreviewIfRollInputsChanged(dialog);
    });

    root.querySelector('[name="rarity-preset"]')?.addEventListener("change", event => {
      const presetValue = event.currentTarget.value;
      const list = root.querySelector(".rarity-tags");
      list?.replaceChildren();
      if (presetValue && rarityPresets[presetValue]) {
        rarityPresets[presetValue].forEach(tag => list.append(createTagElement(tag, { removable: false })));
      }
    });

    root.querySelector(".add-rarity")?.addEventListener("click", () => {
      const tag = root.querySelector('[name="rarity-select"]')?.value;
      const list = root.querySelector(".rarity-tags");
      if (tag && list && !list.querySelector(`[data-tag="${tag}"]`)) {
        list.append(createTagElement(tag));
      }
    });

    const onRollInputsChanged = () => queueMicrotask(() => {
      invalidatePreviewIfRollInputsChanged(dialog);
      fillFilterMatchCount(root);
    });
    root.addEventListener("change", event => {
      if (["source", "formula", "strictRarity", "rarity-preset", "shop-profile"].includes(event.target?.name)) {
        onRollInputsChanged();
      }
    });
    root.addEventListener("input", event => {
      if (event.target?.name === "formula") onRollInputsChanged();
    });
    root.addEventListener("click", event => {
      if (event.target.closest(".add-type, .select-all-types, .add-rarity, .remove-tag")) onRollInputsChanged();
    });
  }

  const formulaInput = root.querySelector('[name="formula"]');
  if (formulaInput) formulaInput.value = config.formula;
  const strictInput = root.querySelector('[name="strictRarity"]');
  if (strictInput) strictInput.checked = config.strictRarity;
  const messageInput = root.querySelector('[name="merchantMessage"]');
  if (messageInput) messageInput.value = config.merchantMessage;
  const chatSelect = root.querySelector('[name="restockChatMode"]');
  if (chatSelect) chatSelect.value = config.restockChatMode || "full";
  syncRestockModeControls(root, config.restockMode || "add");

  const rarityList = root.querySelector(".rarity-tags");
  (config.tags || []).forEach(tag => rarityList?.append(createTagElement(tag)));

  populateItemTypes(sourceSelect?.value).then(() => {
    restoreSavedTypes();
    fillFilterMatchCount(root);
  });
}

function openManageCollectionsDialog(parentDialog) {
  const collections = JSONImportManager.getAllCollections();
  let html = "<h3>Custom collections</h3>";
  if (collections.length === 0) html += "<p>No saved collections yet. Import JSON or add an item to create one.</p>";
  else {
    html += collections.map(col => {
      const date = col.timestamp ? new Date(col.timestamp).toLocaleString() : "";
      return `<div class="sanctum-collection-row" data-id="${col.id}">
        <input type="text" class="rename-field" value="${escapeHtml(col.name)}" />
        <span>${col.itemCount} items${date ? ` · ${date}` : ""}</span>
        <div>
          <button type="button" class="rename-import" data-id="${col.id}">Rename</button>
          <button type="button" class="export-import" data-id="${col.id}">Export</button>
          <button type="button" class="delete-import" data-id="${col.id}">Delete</button>
        </div>
      </div>`;
    }).join("");
  }

  getDialogV2().wait({
    classes: ["sanctum-merchant-dialog"],
    window: { title: "Manage Collections" },
    content: trustedContent(html),
    buttons: [{ action: "close", label: "Close" }],
    render: (_event, manageDialog) => {
      const root = manageDialog.element;
      root.querySelectorAll(".rename-import").forEach(button => {
        button.addEventListener("click", async () => {
          const name = root.querySelector(`.sanctum-collection-row[data-id="${button.dataset.id}"] .rename-field`)?.value;
          await JSONImportManager.renameCollection(button.dataset.id, name);
          ui.notifications.info("Collection renamed.");
          refreshConfigDialogCollections(parentDialog);
        });
      });
      root.querySelectorAll(".export-import").forEach(button => {
        button.addEventListener("click", () => JSONImportManager.exportCollection(button.dataset.id));
      });
      root.querySelectorAll(".delete-import").forEach(button => {
        button.addEventListener("click", async () => {
          const id = button.dataset.id;
          await JSONImportManager.deleteCollection(id);
          ui.notifications.info("Collection deleted.");
          button.closest(".sanctum-collection-row")?.remove();
          if (!root.querySelector(".sanctum-collection-row")) {
            const heading = root.querySelector("h3");
            heading?.insertAdjacentHTML("afterend", "<p>No saved collections yet. Import JSON or add an item to create one.</p>");
          }
          refreshConfigDialogCollections(parentDialog, { removedId: id });
        });
      });
    }
  });
}

function configDialogContent() {
  const rarityOptions = availableRarityTags
    .map(tag => `<option value="${tag}">${tag}</option>`)
    .join("");
  const typeOptions = DEFAULT_STOCK_TYPES
    .map(type => `<option value="${type}">${type}</option>`)
    .join("");
  const profileOptions = Object.entries(shopProfiles)
    .map(([id, profile]) => `<option value="${id}">${profile.label}</option>`)
    .join("");

  return trustedContent(`
    <div data-sanctum-config="true"></div>
    <p data-sanctum-target style="margin:0 0 8px 0;font-weight:bold;"></p>
    <div class="sanctum-collections">
      <button type="button" class="sanctum-accordion-toggle" data-accordion="collections" aria-expanded="false">
        <i class="fas fa-chevron-right sanctum-accordion-icon"></i>
        <span>Custom collections</span>
        <span class="sanctum-accordion-hint">Click to expand</span>
      </button>
      <div class="sanctum-accordion-body" data-accordion-body="collections" hidden>
        <button type="button" class="sanctum-accordion-toggle is-sub" data-accordion="import" aria-expanded="false">
          <i class="fas fa-chevron-right sanctum-accordion-icon"></i>
          <span>Import JSON</span>
          <span class="sanctum-accordion-hint">Click to expand</span>
        </button>
        <div class="sanctum-accordion-body" data-accordion-body="import" hidden>
          <textarea name="json-import" class="sanctum-json-import" placeholder='Paste JSON, or insert the template. Example: {"name": "Harbor Market", "items": [{"name": "Lantern Oil", "type": "consumable", "rarity": "common", "price": 1}]}'></textarea>
          <div class="sanctum-collection-actions">
            <button type="button" class="insert-json-template"><i class="fas fa-file-code"></i> Insert template</button>
            <button type="button" class="copy-json-template"><i class="fas fa-copy"></i> Copy template</button>
            <button type="button" class="download-json-template"><i class="fas fa-download"></i> Download template</button>
          </div>
          <div class="sanctum-collection-actions">
            <button type="button" class="import-json"><i class="fas fa-file-import"></i> Preview import</button>
            <button type="button" class="manage-imports"><i class="fas fa-list"></i> Manage collections</button>
          </div>
          <div class="sanctum-import-preview" hidden>
            <div class="sanctum-import-preview-summary"></div>
            <div class="sanctum-import-preview-fields">
              <label>Collection name
                <input type="text" name="import-collection-name" placeholder="Collection name" />
              </label>
              <label>Add to
                <select name="import-target"></select>
              </label>
            </div>
            <div class="sanctum-collection-actions">
              <button type="button" class="confirm-json-import" disabled><i class="fas fa-check"></i> Confirm import</button>
              <button type="button" class="cancel-json-import">Clear preview</button>
            </div>
          </div>
        </div>
        <button type="button" class="sanctum-accordion-toggle is-sub" data-accordion="additem" aria-expanded="false">
          <i class="fas fa-chevron-right sanctum-accordion-icon"></i>
          <span>Add or edit item</span>
          <span class="sanctum-accordion-hint">Click to expand</span>
        </button>
        <div class="sanctum-accordion-body" data-accordion-body="additem" hidden>
          <select name="collection-select"></select>
          <input type="text" name="new-collection-name" class="sanctum-new-collection-name" placeholder="New collection name" hidden />
          <div class="sanctum-new-item">
            <input type="text" name="new-item-name" placeholder="Item name" />
            <select name="new-item-type">${typeOptions}</select>
            <select name="new-item-rarity">${rarityOptions}</select>
            <div class="sanctum-item-price">
              <input type="text" name="new-item-price" placeholder="Price" />
              <select name="new-item-currency" title="CP 100 = 1 gp · SP 10 = 1 gp · EP 2 = 1 gp · PP 1 = 10 gp">
                ${currencyOptionsHtml("gp")}
              </select>
            </div>
            <div class="sanctum-item-img">
              <img class="sanctum-item-img-preview" src="${DEFAULT_ITEM_IMG}" alt="" />
              <input type="hidden" name="new-item-img" value="${DEFAULT_ITEM_IMG}" />
              <button type="button" class="pick-item-img" title="Browse or upload an image">
                <i class="fas fa-image"></i> Choose image
              </button>
            </div>
            <button type="button" class="add-custom-item"><i class="fas fa-plus"></i> Add to collection</button>
            <button type="button" class="cancel-edit-item" hidden>Cancel edit</button>
            <button type="button" class="stock-custom-item"><i class="fas fa-coins"></i> Stock on merchant</button>
          </div>
        </div>
        <div class="sanctum-catalog" hidden>
          <button type="button" class="sanctum-accordion-toggle is-sub" data-accordion="catalog" aria-expanded="false">
            <i class="fas fa-chevron-right sanctum-accordion-icon"></i>
            <span class="sanctum-catalog-heading">Collection items</span>
            <span class="sanctum-accordion-hint">Click to expand</span>
          </button>
          <div class="sanctum-accordion-body" data-accordion-body="catalog" hidden>
            <div class="sanctum-catalog-list"></div>
            <div class="sanctum-catalog-actions">
              <button type="button" class="stock-selected-catalog"><i class="fas fa-check"></i> Stock selected</button>
              <button type="button" class="stock-all-catalog"><i class="fas fa-coins"></i> Stock all</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="width:150px;padding:8px 10px;vertical-align:top;"><label>Shop Profile</label></td>
        <td style="padding:8px 10px;">
          <select name="shop-profile" style="width:100%;height:28px;padding:4px;box-sizing:border-box;">
            <option value="">None</option>
            ${profileOptions}
          </select>
        </td>
      </tr>
      <tr>
        <td style="width:150px;padding:8px 10px;vertical-align:top;"><label>Item Source</label></td>
        <td style="padding:8px 10px;">
          <select name="source" style="width:100%;height:28px;padding:4px;box-sizing:border-box;">${sourceOptionHtml()}</select>
          <div class="sanctum-source-preview" data-sanctum-source-preview hidden></div>
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
          <div class="sanctum-match-count" hidden></div>
        </td>
      </tr>
      <tr>
        <td style="width:150px;padding:8px 10px;vertical-align:top;"><label>Restock Mode</label></td>
        <td style="padding:8px 10px;">
          <select name="restockMode" style="width:100%;height:28px;padding:4px;box-sizing:border-box;">
            <option value="add">Add to stock</option>
            <option value="replace">Replace stock (clear first)</option>
          </select>
          <p style="font-size:0.8em;margin-top:4px;">Saved on this merchant. You can still change it on the rolled list before Confirm.</p>
        </td>
      </tr>
      <tr>
        <td style="width:150px;padding:8px 10px;vertical-align:top;"><label>Restock Chat</label></td>
        <td style="padding:8px 10px;">
          <select name="restockChatMode" style="width:100%;height:28px;padding:4px;box-sizing:border-box;">
            <option value="off">Off (no chat message)</option>
            <option value="summary">Summary (count and rarities)</option>
            <option value="full">Full list of item names</option>
          </select>
          <input type="text" name="merchantMessage" style="width:100%;height:28px;padding:4px;margin-top:6px;box-sizing:border-box;" />
        </td>
      </tr>
    </table>
    <div class="sanctum-preview">
      <div class="sanctum-preview-toolbar">
        <strong class="sanctum-preview-heading">Rolled stock</strong>
        <div class="sanctum-preview-actions">
          <label class="sanctum-preview-restock">
            Restock
            <select name="previewRestockMode">
              <option value="add">Add to stock</option>
              <option value="replace">Replace stock (clear first)</option>
            </select>
          </label>
          <button type="button" class="clear-roll"><i class="fas fa-times"></i> Discard roll</button>
        </div>
      </div>
      <p class="sanctum-preview-replace-hint">Replace clears this merchant's current inventory first.</p>
      <div class="sanctum-preview-list"></div>
    </div>
  `);
}

Hooks.once("ready", async () => {
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

  if (!game.settings.get(MODULE_ID, "chatModeMigrated")) {
    if (game.settings.get(MODULE_ID, "sendRestockMessage") === false) {
      await game.settings.set(MODULE_ID, "restockChatMode", "off");
    }
    await game.settings.set(MODULE_ID, "chatModeMigrated", true);
  }

  injectMerchantButton();
  bindActorDirectoryTarget();
  registerConfigTargetWatchers();
  Hooks.on("renderActorDirectory", (app, element) => {
    injectMerchantButton(element ?? app.element);
    bindActorDirectoryTarget(element ?? app.element);
  });
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
    const existing = findOpenConfigDialog();
    if (existing) {
      existing.bringToFront?.();
      refreshOpenConfigDialogTarget();
      return existing;
    }
    const target = resolveStockTarget();
    const dialog = new (getDialogV2())({
      classes: ["sanctum-merchant-dialog"],
      window: {
        title: target ? `Sanctum Merchant — ${target.name}` : "Sanctum Merchant",
        icon: "fa-solid fa-coins",
        resizable: true
      },
      position: { width: 720, height: 760 },
      form: { closeOnSubmit: false },
      content: configDialogContent(),
      buttons: [
        {
          action: "roll",
          label: "Roll Stock",
          icon: "fa-solid fa-dice",
          default: true,
          callback: async (_event, _button, app) => rollStockPreview(app)
        },
        {
          action: "confirm",
          label: "Confirm Stock",
          icon: "fa-solid fa-coins",
          callback: async (_event, _button, app) => confirmStockPreview(app)
        },
        {
          action: "discard",
          label: "Discard Roll",
          icon: "fa-solid fa-rotate-left",
          callback: (_event, _button, app) => clearStockPreview(app)
        },
        {
          action: "clear",
          label: "Clear Inventory",
          icon: "fa-solid fa-trash",
          callback: async () => clearInventoryCallback()
        },
        {
          action: "reset",
          label: "Reset to Default",
          callback: async (_event, _button, app) => {
            await resetMerchantSettings();
            clearStockPreview(app);
            bindConfigDialog(app);
          }
        },
        {
          action: "audit",
          label: "Audit Tags",
          callback: async () => game.sanctumMerchant.auditTags()
        },
        {
          action: "cancel",
          label: "Cancel",
          icon: "fa-solid fa-xmark",
          callback: (_event, _button, app) => app.close()
        }
      ]
    });
    dialog.addEventListener("render", () => bindConfigDialog(dialog));
    return dialog.render({ force: true });
  };

  async function selectStockItems(config) {
    const sourceType = config.sourceType || (config.source?.includes(":") ? config.source.split(":")[0] : "compendium");
    const sourceId = config.sourceId || (config.source?.includes(":") ? config.source.split(":")[1] : config.source);
    const allowedTypes = config.types || config.allowedTypes || [];
    const rareTags = config.tags || config.rareTags || [];
    const strictRarity = config.strictRarity !== false;
    const rollFormula = config.formula || config.rollFormula || DEFAULT_FORMULA;

    let items = [];
    let sourceName = "";

    if (sourceType === "json") {
      const collection = JSONImportManager.getCollection(sourceId);
      if (!collection) {
        ui.notifications.error("JSON collection not found. It may have expired.");
        return null;
      }
      items = collection.items;
      sourceName = collection.name;
    } else {
      const pack = game.packs.get(sourceId);
      if (!pack) {
        ui.notifications.error(`Compendium "${sourceId}" not found.`);
        return null;
      }
      const index = await pack.getIndex({ fields: ["type", "name", "flags", "system"] });
      items = index.map(item => ({ ...item, system: item.system || {} }));
      sourceName = pack.title;
    }

    const filteredItems = items.filter(item => {
      const itemType = (item.type || "").toLowerCase();
      return allowedTypes.some(allowedType => allowedType.toLowerCase() === itemType);
    });

    const rareTagsNormalized = rareTags.map(t => normalizeRarity(t));
    const weightedIds = [];
    for (const item of filteredItems) {
      const itemRarity = normalizeRarity(item.system?.rarity === "veryRare" ? "very rare" : item.system?.rarity);
      if (strictRarity) {
        if (rareTagsNormalized.includes(itemRarity)) weightedIds.push(...Array(3).fill(item._id));
      } else {
        const weight = rareTagsNormalized.includes(itemRarity) ? 3 : 1;
        weightedIds.push(...Array(weight).fill(item._id));
      }
    }

    if (weightedIds.length === 0) {
      ui.notifications.warn(`No items found matching criteria in "${sourceName}".`);
      return null;
    }

    const roll = await new Roll(rollFormula).evaluate();
    const numToSelect = Math.min(Math.max(1, roll.total), weightedIds.length);
    const uniqueIds = [...new Set(shuffleArray([...weightedIds]).slice(0, numToSelect))];

    let docs = [];
    if (sourceType === "json") {
      const collection = JSONImportManager.getCollection(sourceId);
      docs = uniqueIds.map(id => collection.items.find(i => i._id === id)).filter(Boolean);
    } else {
      const pack = game.packs.get(sourceId);
      const loadedDocs = await Promise.all(uniqueIds.map(id => pack.getDocument(id)));
      docs = loadedDocs.filter(Boolean).map(d => d.toObject());
    }
    return { docs, sourceName };
  }

  async function commitStockItems(actor, docs, {
    sourceName = "",
    merchantName = actor?.name || "The Merchant",
    restockMode = "add",
    restockChatMode = "full",
    merchantMessage = DEFAULT_MERCHANT_MESSAGE
  } = {}) {
    if (!actor) {
      ui.notifications.warn("No merchants were stocked. Make sure you have a merchant selected or controlled.");
      return false;
    }
    let replacedSnapshot = null;
    if (restockMode === "replace") {
      replacedSnapshot = SanctumMerchantItemPilesIntegration.snapshotItems(actor);
      const cleared = await SanctumMerchantItemPilesIntegration.clearMerchantInventory(actor, { silent: true });
      if (!cleared) {
        ui.notifications.error(`Could not clear ${merchantName} for replace restock.`);
        return false;
      }
    }
    const success = await SanctumMerchantItemPilesIntegration.addItemsToMerchant(actor, docs);
    if (!success) {
      if (replacedSnapshot?.length) {
        const restored = await SanctumMerchantItemPilesIntegration.restoreItems(actor, replacedSnapshot);
        ui.notifications.warn(restored
          ? `Could not add items to ${merchantName}. Previous stock was restored.`
          : `Could not add items to ${merchantName}, and previous stock could not be restored.`);
      } else {
        ui.notifications.warn(`Could not add items to ${merchantName}.`);
      }
      return false;
    }
    if (restockChatMode === "full" || restockChatMode === "summary") {
      const playerRecipients = game.users.filter(u => u.active && !u.isGM).map(u => u.id);
      let content;
      if (restockChatMode === "summary") {
        const counts = {};
        for (const item of docs) {
          const rarity = normalizeRarity(item.system?.rarity === "veryRare" ? "very rare" : item.system?.rarity);
          counts[rarity] = (counts[rarity] || 0) + 1;
        }
        const breakdown = Object.entries(counts).map(([rarity, count]) => `${count} ${rarity}`).join(", ");
        content = `${merchantMessage}<br>New stock: ${docs.length} items (${breakdown})`;
      } else {
        content = `${merchantMessage}<br><strong>New Items:</strong> ${docs.map(i => i.name).join(", ")}`;
      }
      ChatMessage.create({
        speaker: { alias: merchantName },
        content,
        whisper: playerRecipients
      });
    }
    ui.notifications.info(`Stocked ${docs.length} items from "${sourceName}" to ${merchantName}`);
    return true;
  }

  game.sanctumMerchant.selectStockItems = selectStockItems;
  game.sanctumMerchant.commitStockItems = commitStockItems;

  game.sanctumMerchant.populateMerchantWithJSON = async function(options = {}) {
    const config = {
      source: options.source,
      sourceType: options.sourceType || "compendium",
      sourceId: options.source,
      formula: options.rollFormula || options.formula || DEFAULT_FORMULA,
      types: options.allowedTypes || options.types || DEFAULT_STOCK_TYPES,
      tags: options.rareTags || options.tags || DEFAULT_STOCK_TAGS,
      strictRarity: options.strictRarity,
      merchantMessage: options.merchantMessage || DEFAULT_MERCHANT_MESSAGE,
      restockChatMode: options.restockChatMode
        ?? (options.sendRestockMessage === false ? "off" : getWorldChatMode()),
      restockMode: options.restockMode || "add"
    };
    const rolled = await selectStockItems(config);
    if (!rolled?.docs?.length) return;
    const target = resolveStockTarget();
    if (!target) {
      ui.notifications.warn("No merchants were stocked. Make sure you have a merchant selected or controlled.");
      return;
    }
    await commitStockItems(target.actor, rolled.docs, {
      sourceName: rolled.sourceName,
      merchantName: target.name,
      restockMode: config.restockMode,
      restockChatMode: config.restockChatMode,
      merchantMessage: config.merchantMessage
    });
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
      classes: ["sanctum-merchant-dialog"],
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
