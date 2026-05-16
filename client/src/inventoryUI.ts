import { room } from './network';
import { showTooltip, hideTooltip } from './tooltip';
import { pushUIMode, popUIMode } from './cameraControls';

let container: HTMLDivElement;
let slotElements: HTMLDivElement[] = [];
let isVisible = false;

// ---------- Интерфейс инвентаря ----------
export function createInventoryUI() {
    container = document.createElement('div');
    container.id = 'inventory-panel';
    container.style.position = 'absolute';
    container.style.bottom = '20px';
    container.style.right = '20px';
    container.style.width = '300px';
    container.style.background = 'rgba(0, 0, 0, 0.8)';
    container.style.border = '2px solid white';
    container.style.borderRadius = '8px';
    container.style.padding = '10px';
    container.style.display = 'none';
    container.style.zIndex = '1000';
    container.style.color = 'white';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.fontSize = '12px';

    // Заголовок
    const title = document.createElement('div');
    title.textContent = 'Инвентарь';
    title.style.textAlign = 'center';
    title.style.marginBottom = '8px';
    container.appendChild(title);

    // Сетка слотов (5 столбцов, 4 строки)
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(5, 50px)';
    grid.style.gap = '4px';
    grid.style.justifyContent = 'center';

    for (let i = 0; i < 20; i++) {
        const slot = document.createElement('div');
        slot.style.width = '50px';
        slot.style.height = '50px';
        slot.style.background = 'rgba(255, 255, 255, 0.1)';
        slot.style.border = '1px solid #555';
        slot.style.borderRadius = '4px';
        slot.style.display = 'flex';
        slot.style.alignItems = 'center';
        slot.style.justifyContent = 'center';
        slot.style.position = 'relative';
        slot.dataset.index = String(i);
        slot.title = `Слот ${i+1}`;
        // Drag & Drop attributes
        slot.dataset.dropzone = 'inventory';
        slot.dataset.slotIndex = String(i);
        slot.dataset.draggable = 'true';
        slot.dataset.sourceType = 'inventory';

        // ----- Обработчики мыши -----
        // ПКМ – использовать предмет (зелье)
        slot.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            const index = parseInt(slot.dataset.index!);
            const slotData = getSlotData(index);
            if (slotData && slotData.item) {
                const item = slotData.item;
                if (item.slot) {
                    // Экипировка – надеть
                    room?.send('equipItem', { slotIndex: index });
                } else if (item.id === 'potion_hp_01') {
                    // Зелье – использовать
                    room?.send('useItem', { slotIndex: index });
                }
            }
        });

        // При наведении показываем тултип
        slot.addEventListener('mouseenter', (event) => {
            const index = parseInt(slot.dataset.index!);
            const slotData = getSlotData(index);
            if (slotData && slotData.item) {
                showTooltip(event.clientX, event.clientY, slotData.item);
            }
        });

        slot.addEventListener('mouseleave', () => {
            hideTooltip();
        });

        // Shift+click for splitting stacks
        slot.addEventListener('click', (event) => {
            if (!event.shiftKey) return;
            const index = parseInt(slot.dataset.index!);
            const slotData = getSlotData(index);
            if (!slotData || !slotData.item || slotData.quantity <= 1) return;
            event.stopPropagation();
            showSplitDialog(index, slotData.item.name, slotData.quantity);
        });

        grid.appendChild(slot);
        slotElements.push(slot);
    }

    container.appendChild(grid);
    document.body.appendChild(container);
}

export function toggleInventory() {
    isVisible = !isVisible;
    container.style.display = isVisible ? 'block' : 'none';
    if (isVisible) {
        pushUIMode();
    } else {
        popUIMode();
    }
}

export function updateInventoryUI(inventory: any) {
    if (!container) return;

    for (let i = 0; i < slotElements.length; i++) {
        const slot = slotElements[i];
        const slotData = inventory.slots[i];
        slot.innerHTML = ''; // очищаем

        if (slotData && slotData.item) {
            const item = slotData.item;
            const quantity = slotData.quantity;

            // Иконка (пока цветной квадратик)
            const icon = document.createElement('div');
            icon.style.width = '40px';
            icon.style.height = '40px';
            icon.style.background = item.id === 'potion_hp_01' ? '#ff5555' : '#55aaff';
            icon.style.borderRadius = '4px';
            icon.style.display = 'flex';
            icon.style.alignItems = 'center';
            icon.style.justifyContent = 'center';
            icon.textContent = item.name.charAt(0); // первая буква названия
            slot.appendChild(icon);

            // Количество, если больше 1
            if (quantity > 1) {
                const qty = document.createElement('span');
                qty.style.position = 'absolute';
                qty.style.bottom = '2px';
                qty.style.right = '2px';
                qty.style.background = 'black';
                qty.style.color = 'white';
                qty.style.fontSize = '10px';
                qty.style.padding = '0 2px';
                qty.style.borderRadius = '2px';
                qty.textContent = String(quantity);
                slot.appendChild(qty);
            }

            // Всплывающая подсказка (title оставим как fallback)
            slot.title = '';
        } else {
            slot.title = '';
        }
    }
}

// ---------- Вспомогательная функция получения данных слота ----------
function getSlotData(slotIndex: number): any {
    // Мы не храним ссылку на инвентарь, но можем получить текущее состояние через room
    // Проще всего хранить последний известный inventory в переменной модуля
    // Либо искать через room.state.players.get(room.sessionId).inventory
    // Но чтобы не усложнять, будем хранить ссылку в самом inventoryUI
    // Пока для простоты реализуем через window или замыкание.
    // Самый надёжный способ: импортировать room и запрашивать актуальные данные.
    if (!room || !room.sessionId) return null;
    const player = room.state?.players?.get(room.sessionId);
    if (!player) return null;
    const slot = player.inventory.slots[slotIndex];
    return slot ? { item: slot.item, quantity: slot.quantity } : null;
}

// ---------- Split Stack Dialog ----------
let splitDialogOverlay: HTMLDivElement | null = null;

function showSplitDialog(slotIndex: number, itemName: string, maxQuantity: number) {
    closeSplitDialog(); // cleanup any existing dialog

    // Overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.5); z-index: 2000;
        display: flex; align-items: center; justify-content: center;
    `;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeSplitDialog();
    });

    // Dialog box
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: #222; border: 2px solid #888; border-radius: 8px;
        padding: 20px; color: white; font-family: Arial, sans-serif;
        font-size: 14px; min-width: 250px; text-align: center;
    `;
    dialog.addEventListener('click', (e) => e.stopPropagation());

    // Title
    const title = document.createElement('div');
    title.textContent = `Split ${itemName}`;
    title.style.cssText = 'font-weight: bold; margin-bottom: 12px; font-size: 16px;';

    // Input container
    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 8px;';

    const label = document.createElement('span');
    label.textContent = 'Quantity:';

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = String(maxQuantity - 1);
    input.value = String(Math.floor(maxQuantity / 2));
    input.style.cssText = `
        width: 80px; padding: 4px 8px; border: 1px solid #555;
        border-radius: 4px; background: #333; color: white;
        font-size: 14px; text-align: center;
    `;
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmSplit();
        if (e.key === 'Escape') closeSplitDialog();
    });

    // Validate input on change
    input.addEventListener('input', () => {
        let val = parseInt(input.value);
        if (isNaN(val) || val < 1) input.value = '1';
        else if (val > maxQuantity - 1) input.value = String(maxQuantity - 1);
    });

    inputRow.appendChild(label);
    inputRow.appendChild(input);

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; gap: 10px; justify-content: center;';

    const splitBtn = document.createElement('button');
    splitBtn.textContent = 'Split';
    splitBtn.style.cssText = `
        padding: 6px 16px; border: none; border-radius: 4px;
        background: #4a4; color: white; cursor: pointer; font-size: 14px;
    `;
    splitBtn.addEventListener('click', confirmSplit);

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
        padding: 6px 16px; border: none; border-radius: 4px;
        background: #666; color: white; cursor: pointer; font-size: 14px;
    `;
    cancelBtn.addEventListener('click', closeSplitDialog);

    btnRow.appendChild(splitBtn);
    btnRow.appendChild(cancelBtn);

    dialog.appendChild(title);
    dialog.appendChild(inputRow);
    dialog.appendChild(btnRow);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    splitDialogOverlay = overlay;

    // Focus and select input
    input.focus();
    input.select();

    function confirmSplit() {
        const qty = parseInt(input.value);
        if (isNaN(qty) || qty < 1 || qty >= maxQuantity) return;
        room?.send('splitItem', { fromSlotIndex: slotIndex, quantity: qty });
        closeSplitDialog();
    }
}

function closeSplitDialog() {
    if (splitDialogOverlay) {
        document.body.removeChild(splitDialogOverlay);
        splitDialogOverlay = null;
    }
}

export { slotElements };