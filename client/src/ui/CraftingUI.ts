import { room } from '../network';
import { pushUIMode, popUIMode } from '../cameraControls';
import { showNotification } from './notificationUI';

let container: HTMLDivElement;
let recipeListEl: HTMLDivElement;
let isVisible = false;
let currentStationType: string = '';
let currentRecipes: any[] = [];

export function createCraftingUI() {
    container = document.createElement('div');
    container.id = 'crafting-panel';
    container.style.position = 'absolute';
    container.style.left = '50%';
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

    document.body.appendChild(container);
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

    room?.send('getStationRecipes', { stationType });
}

export function hideCraftingUI() {
    if (isVisible) {
        isVisible = false;
        container.style.display = 'none';
        popUIMode();
        currentStationType = '';
        currentRecipes = [];
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

        // Info block
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
