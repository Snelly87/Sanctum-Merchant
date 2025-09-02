console.log("✅ Sanctum Merchant script loaded!");

Hooks.once("init", () => {
  console.log("Sanctum Merchant | Initializing...");

  game.settings.register("sanctum-merchant", "defaultConfig", {
    name: "Sanctum Merchant Default Config",
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });
});


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

  // --- Config dialog ---
game.sanctumMerchant.openConfigDialog = () => {
  new Dialog({
    title: "Sanctum Merchant",
    content: `
      <form>
        <div class="form-group">
          <label>Compendium Name</label>
          <input type="text" name="compendium" value="world.ddb-oathbreaker-ddb-items"/>
        </div>
        <div class="form-group">
          <label>Roll Formula</label>
          <input type="text" name="formula" value="1d6+2"/>
        </div>
        <div class="form-group">
          <label>Allowed Types (comma-separated)</label>
          <input type="text" name="types" value="weapon,consumable,equipment,loot"/>
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
            <input type="checkbox" name="strictRarity" checked />
            Strict rarity filtering
          </label>
          <p style="font-size:0.8em;margin-top:4px;">
            When checked, only items with selected rarity tags will be considered.
            When unchecked, all items are eligible but matching tags are favored.
          </p>
        </div>
        <div class="form-group">
          <label>Merchant Message</label>
          <input type="text" name="merchantMessage" value="🧿 &quot;Got somethin' that might interest ya'!&quot;" />
          <p style="font-size:0.8em;margin-top:4px;">
            This message will be whispered to players when the merchant stocks new items.
          </p>
        </div>
      </form>
    `,
    buttons: {
      confirm: {
        label: "Stock Merchant",
        callback: async (html) => {
          try {
            const compendium = html.find('[name="compendium"]').val();
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


            await game.settings.set("sanctum-merchant", "defaultConfig", {
			  compendium,
			  formula,
			  types,
			  tags,
			  strictRarity,
			  merchantMessage
			});


            await game.sanctumMerchant.populateMerchant({
              compendiumName: compendium,
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
        }
      },
      cancel: { label: "Cancel" }
    },
    default: "confirm",
    render: html => {
      const cfg = game.settings.get("sanctum-merchant", "defaultConfig");
      html.find('[name="merchantMessage"]').val(cfg.merchantMessage || `🧿 "Got somethin' that might interest ya'!"`);
      html.find('[name="compendium"]').val(cfg.compendium || "world.ddb-oathbreaker-ddb-items");
      html.find('[name="formula"]').val(cfg.formula || "1d6+2");
      html.find('[name="types"]').val((cfg.types || ["weapon", "consumable", "equipment", "loot"]).join(","));
      html.find('[name="strictRarity"]').prop("checked", cfg.strictRarity !== false);

      if (cfg.tags && !rarityPresets[cfg.tags]) {
        (cfg.tags || []).forEach(tag => {
          const tagElem = $(`<span class="tag" data-tag="${tag}" style="display:inline-block;background:#444;color:white;padding:2px 6px;margin:2px;border-radius:4px;">
            ${tag} <button class="remove-tag" style="background:none;border:none;color:red;margin-left:4px;cursor:pointer;">x</button>
          </span>`);
          tagElem.find(".remove-tag").click(() => tagElem.remove());
          html.find(".rarity-tags").append(tagElem);
        });
      }

      html.find('[name="rarity-preset"]').change(function() {
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

    // Include flags in the index to access importer data and potentially system data
    const index = await pack.getIndex({ fields: ["type", "flags", "name", "system"] });

    // Filter items by type first
    const filteredItems = index.filter(i => allowedTypes.includes(i.type));

    // Build the weighted list of IDs
    const weightedIds = [];
    for (const item of filteredItems) {
        const name = item.name?.toLowerCase() || "";
        let weight = 1;

        // Try to get rarity from multiple possible locations, starting with the DDB type field
        const detectedTag = item.flags?.ddbimporter?.dndbeyond?.type?.toLowerCase()
          || item.system?.rarity?.toLowerCase()
          || availableRarityTags.find(tag => {
            const pattern = new RegExp(`\\b${tag}\\b`, "i");
            return pattern.test(name);
          });

        if (strictRarity) {
            // In strict mode, only add items if their detected tag is in the rareTags list
            if (detectedTag && rareTags.includes(detectedTag)) {
                weight = 3;
                weightedIds.push(...Array(weight).fill(item._id));
            }
        } else {
            // In non-strict mode, favor items with a matching tag or a common fallback
            const matchesTag = detectedTag && rareTags.includes(detectedTag);
            const matchesFallback = rareTags.includes("common") && fallbackCommon.some(f => name.includes(f));

            if (matchesTag || matchesFallback) {
                weight = 3;
            }

            weightedIds.push(...Array(weight).fill(item._id));
        }
    }

    if (weightedIds.length === 0) {
        ui.notifications.warn("No items found matching the selected criteria.");
        return;
    }

    const roll = await (new Roll(rollFormula)).evaluate({ async: true });
    const numToSelect = Math.min(Math.max(0, roll.total ?? 0), weightedIds.length);

    // Shuffle the weighted IDs and get a list of unique items to create
    const selectedIds = shuffleArray(weightedIds).slice(0, numToSelect);
    const uniqueIds = [...new Set(selectedIds)];

    const docs = await Promise.all(uniqueIds.map(id => pack.getDocument(id)));

    for (const token of canvas.tokens.controlled) {
        const actor = token.actor;
        if (!actor) continue;

        // Remove duplicates and only add items if they don't already exist
        const actorItems = new Set(actor.items.map(i => i.name));
        const newItems = docs
            .filter(d => !actorItems.has(d.name))
            .map(d => d.toObject());

        if (newItems.length > 0) {
            await actor.createEmbeddedDocuments("Item", newItems);
            const playerRecipients = game.users.filter(u => u.active && !u.isGM).map(u => u.id);
            const itemNames = newItems.map(i => i.name).join(", ");
            const merchantName = token.name || "The Merchant";
            const message = options.merchantMessage || `🧿 "Got somethin' that might interest ya'!"`;
			ChatMessage.create({
			  speaker: { alias: merchantName },
			  content: `${message} : <strong>${itemNames}</strong>. Fine items, indeed!"`,
			  whisper: playerRecipients
			});

        }
    }
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
