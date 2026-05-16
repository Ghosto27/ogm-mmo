import { room } from '../network';
import { showTooltip, hideTooltip } from '../tooltip';
import { pushUIMode, popUIMode } from '../cameraControls';

let container: HTMLDivElement;
let slotElements: HTMLDivElement[] = [];
let currentBagId: string | null = null;

export function getCurrentBagId(): string | null {
    return currentBagId;
}

function getLootSlotData(slotIndex: number): any | null {
    if (!currentBagId || !room || !room.state) return null;
    const bag = room.state.lootBags.get(currentBagId);
    if (!bag || !bag.items || slotIndex >= bag.items.length) return null;
    const slot = bag.items[slotIndex];
    return slot?.item ? { name: slot.item.name, description: slot.item.description } : null;
}

export function createLootUI() {
    container = document.createElement('div');
    container.id = 'loot-panel';
    container.style.position = 'absolute';
    container.style.top = '60%';
    container.style.left = '50%';
    container.style.width = '250px';
    // Смещаем правее на 120 пикселей и центрируем по вертикали
    container.style.transform = 'translate(calc(-50% + 400px), -50%)';
    container.style.background = 'rgba(0, 0, 0, 0.8)';
    container.style.border = '2px solid white';
    container.style.borderRadius = '8px';
    container.style.padding = '10px';
    container.style.display = 'none';
    container.style.zIndex = '1001';
    container.style.color = 'white';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.fontSize = '12px';

    const title = document.createElement('div');
    title.textContent = 'Добыча';
    container.appendChild(title);

    const grid = document.createElement('div');
    grid.style.display = 'flex';
    grid.style.flexWrap = 'wrap';
    grid.style.gap = '4px';
    grid.style.marginTop = '5px';
    container.appendChild(grid);

    for (let i = 0; i < 6; i++) { // до 6 слотов
        const slot = document.createElement('div');
        slot.style.width = '40px';
        slot.style.height = '40px';
        slot.style.background = 'rgba(255,255,255,0.1)';
        slot.style.border = '1px solid #555';
        slot.style.borderRadius = '4px';
        slot.style.display = 'flex';
        slot.style.alignItems = 'center';
        slot.style.justifyContent = 'center';
        slot.style.position = 'relative';
        slot.dataset.index = String(i);
        // Обработчик клика
        slot.addEventListener('click', () => onSlotClick(i));
        // Обработчики наведения
        slot.addEventListener('mouseenter', (event) => {
            const index = parseInt(slot.dataset.index!);
            const itemData = getLootSlotData(index);
            if (itemData) {
                showTooltip(event.clientX, event.clientY, itemData);
            }
        });
        
        slot.addEventListener('mouseleave', () => {
            hideTooltip();
        });
        
        grid.appendChild(slot);
        slotElements.push(slot);
    }

    document.body.appendChild(container);
}

function onSlotClick(slotIndex: number) {
    if (!currentBagId) return;
    // Отправляем запрос на сервер
    if (room) {
        room.send("lootItem", { bagId: currentBagId, slotIndex });
    }
}

export function showLootUI(bagId: string, items: any[]) {
    currentBagId = bagId;
    container.style.display = 'block';
    updateLootSlots(items);
    pushUIMode();
}

export function hideLootUI() {
    const wasVisible = container.style.display !== 'none';
    container.style.display = 'none';
    currentBagId = null;
    if (wasVisible) popUIMode();
}

export function updateLootSlots(items: any[]) {
    for (let i = 0; i < slotElements.length; i++) {
        const slot = slotElements[i];
        slot.innerHTML = '';
        if (i < items.length) {
            const item = items[i].item;
            const qty = items[i].quantity;
            const icon = document.createElement('div');
            icon.style.width = '30px';
            icon.style.height = '30px';
            icon.style.background = item.id === 'potion_hp_01' ? '#ff5555' : '#55aaff';
            icon.style.borderRadius = '4px';
            icon.textContent = item.name.charAt(0);
            slot.appendChild(icon);
            if (qty > 1) {
                const qtySpan = document.createElement('span');
                qtySpan.style.position = 'absolute';
                qtySpan.style.bottom = '1px';
                qtySpan.style.right = '1px';
                qtySpan.style.background = 'black';
                qtySpan.style.color = 'white';
                qtySpan.style.fontSize = '8px';
                qtySpan.textContent = String(qty);
                slot.appendChild(qtySpan);
            }
        }
    }
}