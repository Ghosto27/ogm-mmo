import { room } from '../network';
import { pushUIMode, popUIMode } from '../cameraControls';

const ADMIN_ITEMS = [
    { id: 'copper_ore', name: 'Медная руда', category: 'Руда' },
    { id: 'tin_ore', name: 'Оловянная руда', category: 'Руда' },
    { id: 'iron_ore', name: 'Железная руда', category: 'Руда' },
    { id: 'coal', name: 'Уголь', category: 'Руда' },
    { id: 'copper_bar', name: 'Медный слиток', category: 'Слитки' },
    { id: 'tin_bar', name: 'Оловянный слиток', category: 'Слитки' },
    { id: 'bronze_bar', name: 'Бронзовый слиток', category: 'Слитки' },
    { id: 'iron_bar', name: 'Железный слиток', category: 'Слитки' },
    { id: 'bronze_sword', name: 'Бронзовый меч', category: 'Оружие' },
    { id: 'iron_sword', name: 'Железный меч', category: 'Оружие' },
    { id: 'bronze_helmet', name: 'Бронзовый шлем', category: 'Броня' },
    { id: 'iron_helmet', name: 'Железный шлем', category: 'Броня' },
    { id: 'potion_hp_01', name: 'Зелье здоровья', category: 'Расходники' },
];

let container: HTMLDivElement;
let isVisible = false;

function createStyledSelect(id: string, options: { value: string, text: string }[]): HTMLSelectElement {
    const select = document.createElement('select');
    select.id = id;
    select.style.width = '100%';
    select.style.padding = '6px';
    select.style.fontSize = '13px';
    select.style.borderRadius = '4px';
    select.style.border = '1px solid #555';
    select.style.background = '#222';
    select.style.color = 'white';
    select.style.boxSizing = 'border-box';
    for (const opt of options) {
        const el = document.createElement('option');
        el.value = opt.value;
        el.textContent = opt.text;
        select.appendChild(el);
    }
    return select;
}

function createStyledInput(id: string, defaultValue: string): HTMLInputElement {
    const input = document.createElement('input');
    input.id = id;
    input.type = 'number';
    input.value = defaultValue;
    input.style.width = '100%';
    input.style.padding = '6px';
    input.style.fontSize = '13px';
    input.style.borderRadius = '4px';
    input.style.border = '1px solid #555';
    input.style.background = '#222';
    input.style.color = 'white';
    input.style.boxSizing = 'border-box';
    return input;
}

function createStyledButton(text: string, color: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.width = '100%';
    btn.style.padding = '8px';
    btn.style.fontSize = '14px';
    btn.style.border = 'none';
    btn.style.borderRadius = '4px';
    btn.style.background = color;
    btn.style.color = 'white';
    btn.style.cursor = 'pointer';
    btn.style.fontWeight = 'bold';
    btn.addEventListener('click', onClick);
    return btn;
}

function createSection(title: string, color: string): { section: HTMLDivElement, header: () => HTMLDivElement } {
    const section = document.createElement('div');
    section.style.marginBottom = '14px';
    section.style.paddingBottom = '10px';
    section.style.borderBottom = '1px solid #333';
    const header = document.createElement('div');
    header.textContent = title;
    header.style.fontWeight = 'bold';
    header.style.fontSize = '14px';
    header.style.marginBottom = '8px';
    header.style.color = color;
    section.appendChild(header);
    return { section, header: () => header };
}

export function createAdminPanel() {
    container = document.createElement('div');
    container.id = 'admin-panel';
    container.style.position = 'absolute';
    container.style.left = '50%';
    container.style.top = '40%';
    container.style.transform = 'translate(-50%, -50%)';
    container.style.width = '340px';
    container.style.background = 'rgba(0, 0, 0, 0.92)';
    container.style.border = '2px solid #ff4444';
    container.style.borderRadius = '8px';
    container.style.padding = '16px';
    container.style.display = 'none';
    container.style.zIndex = '1100';
    container.style.color = 'white';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.fontSize = '14px';
    container.style.maxHeight = '500px';
    container.style.overflowY = 'auto';

    const title = document.createElement('div');
    title.textContent = 'Admin Panel';
    title.style.textAlign = 'center';
    title.style.fontWeight = 'bold';
    title.style.fontSize = '16px';
    title.style.marginBottom = '12px';
    title.style.color = '#ff6666';
    container.appendChild(title);

    // === XP Section ===
    const xpSection = createSection('— XP —', '#ffaa44');
    container.appendChild(xpSection.section);

    const profLabel = document.createElement('div');
    profLabel.textContent = 'Profession:';
    profLabel.style.fontSize = '12px';
    profLabel.style.marginBottom = '3px';
    profLabel.style.color = '#aaa';
    xpSection.section.appendChild(profLabel);

    const profSelect = createStyledSelect('admin-prof-select', [
        { value: 'mining', text: 'Mining' },
        { value: 'blacksmithing', text: 'Blacksmithing' },
    ]);
    xpSection.section.appendChild(profSelect);

    const xpLabel = document.createElement('div');
    xpLabel.textContent = 'XP amount (negative to remove):';
    xpLabel.style.fontSize = '12px';
    xpLabel.style.marginTop = '6px';
    xpLabel.style.marginBottom = '3px';
    xpLabel.style.color = '#aaa';
    xpSection.section.appendChild(xpLabel);

    const xpInput = createStyledInput('admin-xp-input', '100');
    xpSection.section.appendChild(xpInput);

    const xpBtn = createStyledButton('Add XP', '#c44', () => {
        const prof = (document.getElementById('admin-prof-select') as HTMLSelectElement)?.value;
        const amount = parseInt((document.getElementById('admin-xp-input') as HTMLInputElement)?.value || '0', 10);
        if (isNaN(amount) || amount === 0) return;
        room?.send('adminAddXp', { profession: prof, amount });
    });
    xpBtn.style.marginTop = '6px';
    xpSection.section.appendChild(xpBtn);

    const xpResult = document.createElement('div');
    xpResult.id = 'admin-xp-result';
    xpResult.style.marginTop = '6px';
    xpResult.style.textAlign = 'center';
    xpResult.style.fontSize = '13px';
    xpResult.style.color = '#8f8';
    xpSection.section.appendChild(xpResult);

    // === Items Section ===
    const itemSection = createSection('— Items —', '#44aaff');
    container.appendChild(itemSection.section);

    const itemLabel = document.createElement('div');
    itemLabel.textContent = 'Item:';
    itemLabel.style.fontSize = '12px';
    itemLabel.style.marginBottom = '3px';
    itemLabel.style.color = '#aaa';
    itemSection.section.appendChild(itemLabel);

    // Group items by category
    const categories: string[] = [];
    const catMap: Record<string, { value: string, text: string }[]> = {};
    for (const it of ADMIN_ITEMS) {
        if (!catMap[it.category]) {
            catMap[it.category] = [];
            categories.push(it.category);
        }
        catMap[it.category].push({ value: it.id, text: it.name });
    }

    const itemSelect = document.createElement('select');
    itemSelect.id = 'admin-item-select';
    itemSelect.style.width = '100%';
    itemSelect.style.padding = '6px';
    itemSelect.style.fontSize = '13px';
    itemSelect.style.borderRadius = '4px';
    itemSelect.style.border = '1px solid #555';
    itemSelect.style.background = '#222';
    itemSelect.style.color = 'white';
    itemSelect.style.boxSizing = 'border-box';

    for (const cat of categories) {
        const group = document.createElement('optgroup');
        group.label = cat;
        for (const opt of catMap[cat]) {
            const el = document.createElement('option');
            el.value = opt.value;
            el.textContent = opt.text;
            group.appendChild(el);
        }
        itemSelect.appendChild(group);
    }
    itemSection.section.appendChild(itemSelect);

    const qtyLabel = document.createElement('div');
    qtyLabel.textContent = 'Quantity:';
    qtyLabel.style.fontSize = '12px';
    qtyLabel.style.marginTop = '6px';
    qtyLabel.style.marginBottom = '3px';
    qtyLabel.style.color = '#aaa';
    itemSection.section.appendChild(qtyLabel);

    const qtyInput = createStyledInput('admin-item-qty', '1');
    itemSection.section.appendChild(qtyInput);

    const itemBtn = createStyledButton('Add Item', '#4488cc', () => {
        const itemId = (document.getElementById('admin-item-select') as HTMLSelectElement)?.value;
        const qty = parseInt((document.getElementById('admin-item-qty') as HTMLInputElement)?.value || '1', 10);
        if (!itemId || isNaN(qty) || qty <= 0) return;
        room?.send('adminAddItem', { itemId, quantity: qty });
    });
    itemBtn.style.marginTop = '6px';
    itemSection.section.appendChild(itemBtn);

    const itemResult = document.createElement('div');
    itemResult.id = 'admin-item-result';
    itemResult.style.marginTop = '6px';
    itemResult.style.textAlign = 'center';
    itemResult.style.fontSize = '13px';
    itemResult.style.color = '#8f8';
    itemSection.section.appendChild(itemResult);

    document.body.appendChild(container);
}

export function toggleAdminPanel() {
    isVisible = !isVisible;
    container.style.display = isVisible ? 'block' : 'none';
    if (isVisible) {
        pushUIMode();
    } else {
        popUIMode();
        const xpResult = document.getElementById('admin-xp-result');
        if (xpResult) xpResult.textContent = '';
        const itemResult = document.getElementById('admin-item-result');
        if (itemResult) itemResult.textContent = '';
    }
}

export function isAdminVisible(): boolean {
    return isVisible;
}
