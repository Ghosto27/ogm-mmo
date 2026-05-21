import { room } from './network';
import { showTooltip, hideTooltip } from './tooltip';
import { pushUIMode, popUIMode } from './cameraControls';
import { fsm } from './player';
import { showSplitDialog } from './ui/splitDialog';

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
                    if (fsm['local']?.isPlayingOneShot) return;
                    room?.send('useItem', { slotIndex: index });
                    // Play consume animation
                    fsm['local']?.requestConsume();
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
            showSplitDialog(slotData.item.name, slotData.quantity, (qty) => {
                room?.send('splitItem', { fromSlotIndex: index, quantity: qty });
            });
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

export { slotElements };