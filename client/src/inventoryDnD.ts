import { room } from './network';

// ---------- Types ----------

interface DragState {
    isDragging: boolean;
    sourceType: 'inventory' | 'equipment';
    sourceIndex: string;       // inventory slot index OR equipment slot name
    sourceElement: HTMLElement;
    ghost: HTMLElement | null;
    offsetX: number;
    offsetY: number;
}

// ---------- State ----------

let dragState: DragState = {
    isDragging: false,
    sourceType: 'inventory',
    sourceIndex: '0',
    sourceElement: null as any,
    ghost: null,
    offsetX: 0,
    offsetY: 0,
};

let highlightedTarget: HTMLElement | null = null;

// ---------- Ghost element ----------

function createGhost(slot: HTMLElement, clientX: number, clientY: number): HTMLElement {
    const ghost = document.createElement('div');
    ghost.style.position = 'fixed';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '9999';
    ghost.style.opacity = '0.7';
    ghost.style.width = slot.offsetWidth + 'px';
    ghost.style.height = slot.offsetHeight + 'px';
    ghost.style.borderRadius = '4px';
    ghost.style.display = 'flex';
    ghost.style.alignItems = 'center';
    ghost.style.justifyContent = 'center';
    ghost.style.background = 'rgba(255, 255, 255, 0.15)';
    ghost.style.border = '2px solid #aaa';
    ghost.style.left = (clientX - dragState.offsetX) + 'px';
    ghost.style.top = (clientY - dragState.offsetY) + 'px';
    // Copy the slot content
    const icon = slot.querySelector('div');
    if (icon) {
        const clone = icon.cloneNode(true) as HTMLElement;
        ghost.appendChild(clone);
    }
    document.body.appendChild(ghost);
    return ghost;
}

function cleanupGhost() {
    if (dragState.ghost) {
        document.body.removeChild(dragState.ghost);
        dragState.ghost = null;
    }
}

// ---------- Highlight ----------

function clearHighlight() {
    if (highlightedTarget) {
        highlightedTarget.style.border = '';
        highlightedTarget.style.boxShadow = '';
        highlightedTarget = null;
    }
}

function highlightDropZones(enable: boolean) {
    const allDroppable = document.querySelectorAll<HTMLElement>('[data-dropzone]');
    allDroppable.forEach(el => {
        if (enable) {
            el.style.border = '2px dashed #888';
        } else {
            el.style.border = '';
            el.style.boxShadow = '';
        }
    });
}

function updateHoverHighlight(clientX: number, clientY: number) {
    clearHighlight();
    const target = getDropTarget(clientX, clientY);
    if (target) {
        const isValid = isValidDrop(dragState.sourceType, dragState.sourceIndex, target);
        if (isValid) {
            target.style.border = '2px solid #44ff44';
            target.style.boxShadow = '0 0 8px rgba(68, 255, 68, 0.5)';
        } else {
            target.style.border = '2px solid #ff4444';
            target.style.boxShadow = '0 0 8px rgba(255, 68, 68, 0.5)';
        }
        highlightedTarget = target;
    }
}

// ---------- Drop target detection ----------

function getDropTarget(clientX: number, clientY: number): HTMLElement | null {
    // Temporarily hide ghost so elementFromPoint works
    if (dragState.ghost) {
        dragState.ghost.style.display = 'none';
    }
    const el = document.elementFromPoint(clientX, clientY);
    if (dragState.ghost) {
        dragState.ghost.style.display = '';
    }
    if (!el) return null;
    // Walk up to find a dropzone
    const dropZone = (el as HTMLElement).closest('[data-dropzone]') as HTMLElement;
    return dropZone || null;
}

// ---------- Validation ----------

function isValidDrop(sourceType: string, sourceIndex: string, target: HTMLElement): boolean {
    const targetType = target.dataset.dropzone;
    if (targetType === 'inventory') {
        // Dropping on an inventory slot
        return true; // always valid (swap/move)
    }
    if (targetType === 'equipment') {
        // Dropping on an equipment slot - only valid if source has equipable item
        if (sourceType !== 'inventory') return false; // equipment -> equipment not supported yet
        // The server will validate the item slot type, so we allow the attempt
        return true;
    }
    return false;
}

// ---------- Execute drop ----------

function executeDrop(target: HTMLElement) {
    const targetType = target.dataset.dropzone;
    const sourceType = dragState.sourceType;
    const sourceIndex = dragState.sourceIndex;

    if (targetType === 'inventory') {
        const toSlotIndex = target.dataset.slotIndex;
        if (toSlotIndex === undefined) return;

        if (sourceType === 'inventory') {
            // Inventory slot -> Inventory slot: move/swap
            room?.send('moveItem', { fromSlotIndex: parseInt(sourceIndex), toSlotIndex: parseInt(toSlotIndex) });
        } else if (sourceType === 'equipment') {
            // Equipment slot -> Inventory slot: unequip to slot
            room?.send('unequipToSlot', { slot: sourceIndex, toSlotIndex: parseInt(toSlotIndex) });
        }
    } else if (targetType === 'equipment') {
        const equipSlot = target.dataset.equipSlot;
        if (!equipSlot) return;

        if (sourceType === 'inventory') {
            // Inventory slot -> Equipment slot: equip
            room?.send('equipItemToSlot', { slotIndex: parseInt(sourceIndex), targetSlot: equipSlot });
        }
        // equipment -> equipment: not supported yet
    }
}

// ---------- Drag lifecycle ----------

function onMouseDown(e: MouseEvent) {
    // Only left click
    if (e.button !== 0) return;
    // Find draggable parent
    const target = (e.target as HTMLElement).closest('[data-draggable="true"]') as HTMLElement;
    if (!target) return;
    // Check if slot has an item (has inner content)
    const icon = target.querySelector('div');
    if (!icon) return; // empty slot

    const sourceType = target.dataset.sourceType as 'inventory' | 'equipment';
    const sourceIndex = target.dataset.sourceType === 'inventory'
        ? target.dataset.slotIndex!
        : target.dataset.equipSlot!;

    if (sourceIndex === undefined) return;

    e.preventDefault();

    const rect = target.getBoundingClientRect();
    dragState = {
        isDragging: true,
        sourceType,
        sourceIndex,
        sourceElement: target,
        ghost: null,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
    };
    dragState.ghost = createGhost(target, e.clientX, e.clientY);
    highlightDropZones(true);
}

function onMouseMove(e: MouseEvent) {
    if (!dragState.isDragging || !dragState.ghost) return;

    dragState.ghost.style.left = (e.clientX - dragState.offsetX) + 'px';
    dragState.ghost.style.top = (e.clientY - dragState.offsetY) + 'px';

    updateHoverHighlight(e.clientX, e.clientY);
}

function onMouseUp(e: MouseEvent) {
    if (!dragState.isDragging) return;

    const target = getDropTarget(e.clientX, e.clientY);
    if (target) {
        const isValid = isValidDrop(dragState.sourceType, dragState.sourceIndex, target);
        if (isValid) {
            executeDrop(target);
        }
    } else {
        // Dropped outside any window - drop item on ground (inventory only)
        if (dragState.sourceType === 'inventory') {
            const slotIndex = parseInt(dragState.sourceIndex);
            if (!isNaN(slotIndex)) {
                room?.send('dropItem', { slotIndex });
            }
        }
    }

    // Cleanup
    cleanupDrag();
}

function cleanupDrag() {
    cleanupGhost();
    highlightDropZones(false);
    clearHighlight();
    dragState.isDragging = false;
}

// ---------- Init / Destroy ----------

export function initDragDrop() {
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
}

export function destroyDragDrop() {
    window.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    cleanupDrag();
}
