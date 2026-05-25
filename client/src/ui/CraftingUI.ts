import { room } from '../network';
import { pushUIMode, popUIMode } from '../cameraControls';
import { showNotification } from './notificationUI';
import { registerDropHandler } from '../inventoryDnD';
import { getItemColor, createItemIcon } from '../itemColors';

const SALVAGE_RATE_MIN = 0.2;
const SALVAGE_RATE_MAX = 0.3;

const salvageRecipes: Record<string, { inputs: { itemId: string; quantity: number }[] }> = {
    bronze_sword: { inputs: [{ itemId: "bronze_bar", quantity: 4 }] },
    bronze_helmet: { inputs: [{ itemId: "bronze_bar", quantity: 3 }] },
    iron_helmet: { inputs: [{ itemId: "iron_bar", quantity: 4 }, { itemId: "coal", quantity: 1 }] },
    iron_sword: { inputs: [{ itemId: "iron_bar", quantity: 6 }, { itemId: "coal", quantity: 2 }] },
};

const itemNames: Record<string, string> = {
    bronze_bar: "Бронзовый слиток",
    iron_bar: "Железный слиток",
    coal: "Уголь",
};

let container: HTMLDivElement;
let recipeListEl: HTMLDivElement;
let isVisible = false;
let currentStationType: string = '';
let currentRecipes: any[] = [];
let salvageWrapper: HTMLDivElement;

// Salvage state
let salvageSlotEl: HTMLDivElement;
let salvagePreviewEl: HTMLDivElement;
let salvageBtnEl: HTMLButtonElement;
let pendingSalvageIndex: number | null = null;

function getInventorySlotData(slotIndex: number): { item: any; quantity: number } | null {
    if (!room || !room.sessionId) return null;
    const player = room.state?.players?.get(room.sessionId);
    if (!player) return null;
    const slot = player.inventory?.slots?.[slotIndex];
    return slot ? { item: slot.item, quantity: slot.quantity } : null;
}

function renderSalvagePreview(slotIndex: number | null) {
    salvageSlotEl.innerHTML = '';
    salvagePreviewEl.style.display = 'none';
    salvageBtnEl.style.display = 'none';
    pendingSalvageIndex = null;

    if (slotIndex === null) {
        salvageSlotEl.textContent = 'Сюда';
        salvageSlotEl.style.color = '#888';
        return;
    }

    const slotData = getInventorySlotData(slotIndex);
    if (!slotData || !slotData.item) {
        salvageSlotEl.textContent = 'Сюда';
        salvageSlotEl.style.color = '#888';
        return;
    }

    const itemId = slotData.item.id;
    const recipe = salvageRecipes[itemId];
    if (!recipe) {
        salvageSlotEl.textContent = 'Нельзя разобрать';
        salvageSlotEl.style.color = '#ff4444';
        return;
    }

    pendingSalvageIndex = slotIndex;

    salvageSlotEl.innerHTML = '';
    const itemDiv = createItemIcon(slotData.item, 50);
    salvageSlotEl.appendChild(itemDiv);

    let previewHtml = '<div style="margin-top: 8px; font-size: 12px; color: #ccc;">Вернётся (20-30%):</div>';
    for (const inp of recipe.inputs) {
        const minQty = Math.max(1, Math.round(inp.quantity * SALVAGE_RATE_MIN));
        const maxQty = Math.max(1, Math.round(inp.quantity * SALVAGE_RATE_MAX));
        const rangeText = minQty === maxQty ? `${minQty}` : `${minQty}-${maxQty}`;
        const name = itemNames[inp.itemId] || inp.itemId;
        previewHtml += `<div style="font-size: 13px; padding: 2px 0; color: ${getItemColor({ id: inp.itemId })};">${rangeText}x ${name}</div>`;
    }
    salvagePreviewEl.innerHTML = previewHtml;
    salvagePreviewEl.style.display = 'block';
    salvageBtnEl.style.display = 'inline-block';
}

function onSalvageDrop(sourceType: string, sourceIndex: string) {
    if (sourceType !== 'inventory') return;
    const idx = parseInt(sourceIndex);
    if (isNaN(idx)) return;

    const slotData = getInventorySlotData(idx);
    if (!slotData || !slotData.item) return;

    const recipe = salvageRecipes[slotData.item.id];
    if (!recipe) {
        showNotification('Этот предмет нельзя разобрать', 2000);
        return;
    }

    renderSalvagePreview(idx);
}

function doSalvage() {
    if (pendingSalvageIndex === null) return;
    room?.send('salvageItem', { slotIndex: pendingSalvageIndex });
    renderSalvagePreview(null);
}

export function createCraftingUI() {
    container = document.createElement('div');
    container.id = 'crafting-panel';
    container.style.position = 'absolute';
    container.style.left = '20%';
    container.style.top = '40%';
    container.style.transform = 'translate(-50%, -50%)';
    container.style.width = '480px';
    container.style.maxHeight = '400px';
    container.style.background = 'rgba(0, 0, 0, 0.9)';
    container.style.border = '2px solid #aaa';
    container.style.borderRadius = '8px';
    container.style.padding = '12px';
    container.style.display = 'none';
    container.style.zIndex = '1000';
    container.style.color = 'white';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.fontSize = '13px';
    container.style.overflowY = 'auto';

    const title = document.createElement('div');
    title.id = 'crafting-title';
    title.style.textAlign = 'center';
    title.style.fontWeight = 'bold';
    title.style.fontSize = '15px';
    title.style.marginBottom = '10px';
    title.textContent = 'Crafting';
    container.appendChild(title);

    recipeListEl = document.createElement('div');
    recipeListEl.id = 'crafting-recipes';
    container.appendChild(recipeListEl);

    // Salvage section
    salvageWrapper = document.createElement('div');
    salvageWrapper.id = 'crafting-salvage';

    const separator = document.createElement('hr');
    separator.style.cssText = 'border: none; border-top: 1px solid #555; margin: 12px 0;';
    salvageWrapper.appendChild(separator);

    const salvageTitle = document.createElement('div');
    salvageTitle.textContent = 'Разбор предметов';
    salvageTitle.style.cssText = 'text-align: center; font-weight: bold; font-size: 14px; margin-bottom: 8px;';
    salvageWrapper.appendChild(salvageTitle);

    const slotRow = document.createElement('div');
    slotRow.style.cssText = 'display: flex; align-items: center; gap: 10px;';

    salvageSlotEl = document.createElement('div');
    salvageSlotEl.setAttribute('data-dropzone', 'salvage');
    salvageSlotEl.style.cssText = `
        width: 50px; height: 50px; border: 2px dashed #888; border-radius: 6px;
        display: flex; align-items: center; justify-content: center;
        background: rgba(255,255,255,0.05); cursor: default; flex-shrink: 0;
        font-size: 11px; color: #888; text-align: center; line-height: 1.2;
        transition: border-color 0.15s, background 0.15s;
    `;
    salvageSlotEl.textContent = 'Сюда';
    slotRow.appendChild(salvageSlotEl);

    const previewCol = document.createElement('div');
    previewCol.style.cssText = 'flex: 1; display: flex; flex-direction: column; gap: 6px;';

    salvagePreviewEl = document.createElement('div');
    salvagePreviewEl.style.display = 'none';
    previewCol.appendChild(salvagePreviewEl);

    salvageBtnEl = document.createElement('button');
    salvageBtnEl.textContent = 'Разобрать';
    salvageBtnEl.style.cssText = `
        padding: 6px 14px; border: none; border-radius: 4px;
        background: #a44; color: white; cursor: pointer;
        font-size: 12px; display: none; align-self: flex-start;
    `;
    salvageBtnEl.addEventListener('click', doSalvage);
    previewCol.appendChild(salvageBtnEl);

    slotRow.appendChild(previewCol);
    salvageWrapper.appendChild(slotRow);
    container.appendChild(salvageWrapper);

    salvageSlotEl.addEventListener('mouseenter', () => {
        if (!salvageSlotEl.querySelector('div')) {
            salvageSlotEl.style.borderColor = '#4f4';
            salvageSlotEl.style.background = 'rgba(68,255,68,0.1)';
        }
    });
    salvageSlotEl.addEventListener('mouseleave', () => {
        salvageSlotEl.style.borderColor = '#888';
        salvageSlotEl.style.background = 'rgba(255,255,255,0.05)';
    });

    document.body.appendChild(container);
    registerDropHandler('salvage', onSalvageDrop);
}

export function showCraftingUI(stationType: string) {
    currentStationType = stationType;
    isVisible = true;
    container.style.display = 'block';
    pushUIMode();

    const title = document.getElementById('crafting-title');
    if (title) {
        title.textContent = stationType === 'furnace' ? 'Smelting (Furnace)' : 'Smithing (Anvil)';
    }

    const includeSalvage = stationType === 'anvil';
    salvageWrapper.style.display = includeSalvage ? '' : 'none';
    if (!includeSalvage) renderSalvagePreview(null);

    room?.send('getStationRecipes', { stationType });
}

export function hideCraftingUI() {
    if (isVisible) {
        isVisible = false;
        container.style.display = 'none';
        popUIMode();
        currentStationType = '';
        currentRecipes = [];
        renderSalvagePreview(null);
    }
}

export function isCraftingVisible(): boolean {
    return isVisible;
}

export function updateCraftingRecipes(recipes: any[]) {
    currentRecipes = recipes;
    recipeListEl.innerHTML = '';

    if (!recipes || recipes.length === 0) {
        recipeListEl.textContent = 'Нет доступных рецептов';
        recipeListEl.style.textAlign = 'center';
        recipeListEl.style.padding = '20px';
        recipeListEl.style.color = '#888';
        return;
    }
    recipeListEl.style.textAlign = '';

    for (const recipe of recipes) {
        const row = document.createElement('div');
        row.style.cssText = `
            display: flex; align-items: center; justify-content: space-between;
            padding: 8px; margin-bottom: 4px; border-radius: 4px;
            background: ${recipe.canCraft ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)'};
            border: 1px solid ${recipe.canCraft ? '#555' : '#333'};
            opacity: ${recipe.canCraft ? '1' : '0.5'};
        `;

        const info = document.createElement('div');
        info.style.flex = '1';

        const name = document.createElement('div');
        name.textContent = recipe.name;
        name.style.fontWeight = 'bold';
        name.style.fontSize = '13px';
        info.appendChild(name);

        const details = document.createElement('div');
        details.style.fontSize = '11px';
        details.style.color = '#aaa';
        details.style.marginTop = '2px';

        const levelOk = recipe.hasLevel;
        details.textContent = `Lvl ${recipe.requiredLevel} `;
        details.textContent += levelOk ? '✅' : '🔒';
        details.textContent += ` | ${recipe.xpReward} XP`;

        if (recipe.successChance != null && recipe.successChance < 1) {
            details.textContent += ` | ${Math.round(recipe.successChance * 100)}%`;
        }
        if (recipe.bonusChanceActual != null && recipe.bonusChanceActual > 0) {
            details.textContent += ` | бонус ${Math.round(recipe.bonusChanceActual * 100)}%`;
        }

        if (recipe.inputs) {
            details.textContent += ' | ';
            details.textContent += recipe.inputs.map((inp: any) => {
                const has = recipe.hasIngredients?.[inp.itemId];
                return `${has ? '' : '❌'}${inp.itemId} x${inp.quantity}`;
            }).join(', ');
        }

        info.appendChild(details);

        const craftBtn = document.createElement('button');
        craftBtn.textContent = 'Craft';
        craftBtn.style.cssText = `
            padding: 6px 14px; border: none; border-radius: 4px;
            background: ${recipe.canCraft ? '#4a4' : '#444'};
            color: ${recipe.canCraft ? 'white' : '#666'};
            cursor: ${recipe.canCraft ? 'pointer' : 'default'};
            font-size: 12px; margin-left: 8px; min-width: 60px;
        `;
        craftBtn.disabled = !recipe.canCraft;
        craftBtn.addEventListener('click', () => {
            if (!recipe.canCraft) return;
            room?.send('craftRecipe', { stationType: currentStationType, recipeId: recipe.id });
        });

        row.appendChild(info);
        row.appendChild(craftBtn);
        recipeListEl.appendChild(row);
    }
}
