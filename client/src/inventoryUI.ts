import { room } from './network';
import { showTooltip, hideTooltip } from './tooltip';
import { pushUIMode, popUIMode } from './cameraControls';
import { fsm } from './player';
import { showSplitDialog } from './ui/splitDialog';
import { createItemIcon } from './itemColors';
import { isMerchantOpen, getSellPrice } from './ui/MerchantUI';

let container: HTMLDivElement;
let slotElements: HTMLDivElement[] = [];
let isVisible = false;
let lastInvSlotIds: { id: string | null; qty: number }[] = [];

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
        // ПКМ – продажа торговцу / использование предмета
        slot.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            const index = parseInt(slot.dataset.index!);
            const slotData = getSlotData(index);
            if (!slotData || !slotData.item) return;
            const item = slotData.item;

            // Если открыт торговец и предмет продаётся
            if (isMerchantOpen()) {
                const sellPrice = getSellPrice(item.id);
                if (sellPrice > 0) {
                    if (slotData.quantity > 1) {
                        showSellConfirmDialog(item.name, slotData.quantity, sellPrice, (qty) => {
                            room?.send('merchantSellItem', { inventorySlot: index, quantity: qty });
                        });
                    } else {
                        room?.send('merchantSellItem', { inventorySlot: index, quantity: 1 });
                    }
                    return;
                }
            }

            if (item.slot) {
                // Экипировка – надеть
                room?.send('equipItem', { slotIndex: index });
            } else if (item.id?.startsWith('potion_hp')) {
                // Зелье – использовать
                if (fsm['local']?.isPlayingOneShot) return;
                room?.send('useItem', { slotIndex: index });
                fsm['local']?.requestConsume();
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

        // Shift+click: split stacks
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
        const itemId = slotData?.item?.id || null;
        const quantity = slotData?.quantity || 0;

        // Skip if content hasn't changed
        if (lastInvSlotIds[i]?.id === itemId && lastInvSlotIds[i]?.qty === quantity) continue;
        lastInvSlotIds[i] = { id: itemId, qty: quantity };

        slot.innerHTML = '';

        if (slotData && slotData.item) {
            const item = slotData.item;
            const quantity = slotData.quantity;

            const icon = createItemIcon(item, 40);
            slot.appendChild(icon);

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

// ---------- Диалог подтверждения продажи стака ----------
function showSellConfirmDialog(itemName: string, maxQty: number, unitPrice: number, onConfirm: (qty: number) => void): void {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:5000;display:flex;align-items:center;justify-content:center;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:#222;border:2px solid #22AA22;border-radius:8px;padding:20px;color:#fff;font-family:monospace;min-width:300px;';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:14px;margin-bottom:10px;';
    title.textContent = `Продажа: ${itemName}`;
    dialog.appendChild(title);

    const qtyRow = document.createElement('div');
    qtyRow.style.cssText = 'margin-bottom:10px;display:flex;align-items:center;gap:10px;';

    const qtyLabel = document.createElement('span');
    qtyLabel.textContent = 'Количество:';
    qtyRow.appendChild(qtyLabel);

    const qtyInput = document.createElement('input');
    qtyInput.type = 'range';
    qtyInput.min = '1';
    qtyInput.max = String(maxQty);
    qtyInput.value = String(maxQty);
    qtyInput.style.cssText = 'flex:1;';
    qtyRow.appendChild(qtyInput);

    const qtyDisplay = document.createElement('span');
    qtyDisplay.textContent = String(maxQty);
    qtyRow.appendChild(qtyDisplay);

    dialog.appendChild(qtyRow);

    const priceDisplay = document.createElement('div');
    priceDisplay.style.cssText = 'text-align:center;font-size:16px;margin-bottom:15px;color:#ffd700;';
    priceDisplay.textContent = `💰 ${maxQty * unitPrice} gold`;
    dialog.appendChild(priceDisplay);

    qtyInput.addEventListener('input', () => {
        const v = parseInt(qtyInput.value) || 1;
        qtyDisplay.textContent = String(v);
        priceDisplay.textContent = `💰 ${v * unitPrice} gold`;
    });

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;justify-content:center;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Отмена';
    cancelBtn.style.cssText = 'padding:6px 16px;background:#555;color:#fff;border:none;border-radius:4px;cursor:pointer;font-family:monospace;';
    cancelBtn.addEventListener('click', () => document.body.removeChild(overlay));
    btnRow.appendChild(cancelBtn);

    const sellBtn = document.createElement('button');
    sellBtn.textContent = 'Продать';
    sellBtn.style.cssText = 'padding:6px 16px;background:#22AA22;color:#fff;border:none;border-radius:4px;cursor:pointer;font-family:monospace;';
    sellBtn.addEventListener('click', () => {
        const qty = parseInt(qtyInput.value) || 1;
        onConfirm(qty);
        document.body.removeChild(overlay);
    });
    btnRow.appendChild(sellBtn);

    dialog.appendChild(btnRow);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
}

export { slotElements };