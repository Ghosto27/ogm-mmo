import { room } from '../network';
import { showTooltip, hideTooltip } from '../tooltip';
import { pushUIMode, popUIMode } from '../cameraControls';
import { showSplitDialog } from './splitDialog';
import { getItemColor } from '../itemColors';

let container: HTMLDivElement;
let slotElements: HTMLDivElement[] = [];
let isVisible = false;

export function createBankUI() {
    container = document.createElement('div');
    container.id = 'bank-panel';
    container.style.position = 'absolute';
    container.style.left = '20px';
    container.style.bottom = '20px';
    container.style.width = '380px';
    container.style.background = 'rgba(0, 0, 0, 0.85)';
    container.style.border = '2px solid #c8a84e';
    container.style.borderRadius = '8px';
    container.style.padding = '10px';
    container.style.display = 'none';
    container.style.zIndex = '1000';
    container.style.color = 'white';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.fontSize = '12px';

    const title = document.createElement('div');
    title.textContent = 'Bank';
    title.style.textAlign = 'center';
    title.style.marginBottom = '8px';
    title.style.color = '#c8a84e';
    title.style.fontWeight = 'bold';
    title.style.fontSize = '14px';
    container.appendChild(title);

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(8, 42px)';
    grid.style.gap = '3px';
    grid.style.justifyContent = 'center';

    for (let i = 0; i < 40; i++) {
        const slot = document.createElement('div');
        slot.style.width = '42px';
        slot.style.height = '42px';
        slot.style.background = 'rgba(255, 255, 255, 0.08)';
        slot.style.border = '1px solid #555';
        slot.style.borderRadius = '4px';
        slot.style.display = 'flex';
        slot.style.alignItems = 'center';
        slot.style.justifyContent = 'center';
        slot.style.position = 'relative';
        slot.dataset.index = String(i);
        slot.dataset.dropzone = 'bank';
        slot.dataset.slotIndex = String(i);
        slot.dataset.draggable = 'true';
        slot.dataset.sourceType = 'bank';

        slot.addEventListener('mouseenter', (event) => {
            const index = parseInt(slot.dataset.index!);
            const slotData = getBankSlotData(index);
            if (slotData && slotData.item) {
                showTooltip(event.clientX, event.clientY, slotData.item);
            }
        });
        slot.addEventListener('mouseleave', () => hideTooltip());

        // Shift+click: split stacks
        slot.addEventListener('click', (event) => {
            if (!event.shiftKey) return;
            const index = parseInt(slot.dataset.index!);
            const slotData = getBankSlotData(index);
            if (!slotData || !slotData.item || slotData.quantity <= 1) return;
            event.stopPropagation();
            showSplitDialog(slotData.item.name, slotData.quantity, (qty) => {
                room?.send('splitBankItem', { fromBankSlotIndex: index, quantity: qty });
            });
        });

        grid.appendChild(slot);
        slotElements.push(slot);
    }

    container.appendChild(grid);
    document.body.appendChild(container);
}

export function toggleBank() {
    isVisible = !isVisible;
    container.style.display = isVisible ? 'block' : 'none';
    if (isVisible) {
        pushUIMode();
    } else {
        popUIMode();
    }
}

export function updateBankUI(bank: any) {
    if (!container || !bank || !bank.slots) return;

    for (let i = 0; i < slotElements.length; i++) {
        const slot = slotElements[i];
        const slotData = bank.slots[i];
        slot.innerHTML = '';

        if (slotData && slotData.item) {
            const item = slotData.item;
            const quantity = slotData.quantity;

            const icon = document.createElement('div');
            icon.style.width = '34px';
            icon.style.height = '34px';
            icon.style.background = getItemColor(item);
            icon.style.borderRadius = '4px';
            icon.style.display = 'flex';
            icon.style.alignItems = 'center';
            icon.style.justifyContent = 'center';
            icon.style.fontSize = '10px';
            icon.textContent = item.name?.charAt(0) || '?';
            slot.appendChild(icon);

            if (quantity > 1) {
                const qty = document.createElement('span');
                qty.style.position = 'absolute';
                qty.style.bottom = '1px';
                qty.style.right = '1px';
                qty.style.background = 'black';
                qty.style.color = 'white';
                qty.style.fontSize = '9px';
                qty.style.padding = '0 2px';
                qty.style.borderRadius = '2px';
                qty.textContent = String(quantity);
                slot.appendChild(qty);
            }
        }
    }
}

export function isBankVisible(): boolean {
    return isVisible;
}

export function hideBank() {
    if (isVisible) {
        isVisible = false;
        container.style.display = 'none';
        popUIMode();
    }
}

function getBankSlotData(slotIndex: number): any {
    if (!room || !room.sessionId) return null;
    const player = room.state?.players?.get(room.sessionId);
    if (!player) return null;
    const slot = player.bank?.slots?.[slotIndex];
    return slot ? { item: slot.item, quantity: slot.quantity } : null;
}
