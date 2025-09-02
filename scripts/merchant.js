console.log("✅ Sanctum Merchant script loaded!");

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
  

  // --- Config dialog ---
game.sanctumMerchant.openConfigDialog = () => {
  new Dialog({
    title: "Sanctum Merchant",
    content: `
      <form>
        <div class="form-group">
          <label>Compendium Name</label>
          <input type="text" name="compendium" />
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

            // Save settings
            await game.settings.set("sanctum-merchant", "compendium", compendium);
            await game.settings.set("sanctum-merchant", "formula", formula);
            await game.settings.set("sanctum-merchant", "types", types.join(","));
            await game.settings.set("sanctum-merchant", "strictRarity", strictRarity);
            await game.settings.set("sanctum-merchant", "merchantMessage", merchantMessage);
            await game.settings.set("sanctum-merchant", "tags", tags.join(","));

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
	  }
	},

      cancel: { label: "Cancel" }
    },
    default: "confirm",
    render: html => {
      html.find('[name="compendium"]').val(game.settings.get("sanctum-merchant", "compendium"));
      html.find('[name="formula"]').val(game.settings.get("sanctum-merchant", "formula"));
      html.find('[name="types"]').val(game.settings.get("sanctum-merchant", "types"));
      html.find('[name="strictRarity"]').prop("checked", game.settings.get("sanctum-merchant", "strictRarity"));
      html.find('[name="merchantMessage"]').val(game.settings.get("sanctum-merchant", "merchantMessage"));

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
  }).render(true);
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
	  console.log(`🧪 ${item.name} → Tag: ${detectedTag} (Weight: ${highestWeight})`);
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
			  <div class="sanctum-tag-header" style="cursor:pointer;font-weight:bold;background:#333;color:#fff;padding:6px;border-radius:4px;">
				▶ ${tag} (${items.length})
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
        const detectedTag =
		  item.flags?.ddbimporter?.dndbeyond?.type?.toLowerCase() ||
		  item.system?.rarity?.toLowerCase() ||
		  availableRarityTags.find(tag => {
			const pattern = new RegExp(`\\b${tag}\\b`, "i");
			return pattern.test(name);
		  }) ||
		  (fallbackCommon.some(f => name.includes(f)) ? "common" : null);

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
            const message = options.merchantMessage || `🧿 Got somethin' that might interest ya'!`;
			ChatMessage.create({
			  speaker: { alias: merchantName },
			  content: `"${message} : <strong>${itemNames}</strong>. Fine items, indeed!"`,
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
