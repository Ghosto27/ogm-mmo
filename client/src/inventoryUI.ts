let container: HTMLDivElement;
let slotElements: HTMLDivElement[] = [];
let isVisible = false;

export function createInventoryUI() {
    container = document.createElement('div');
    container.id = 'inventory-panel';
    container.style.position = 'absolute';
    container.style.transform = 'translate(-50%, -50%)';
    container.style.bottom = '20px';
    container.style.right = '20px';
    container.style.transform = 'translate(-50%, -50%)';
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
        grid.appendChild(slot);
        slotElements.push(slot);
    }

    container.appendChild(grid);
    document.body.appendChild(container);
}

export function toggleInventory() {
    isVisible = !isVisible;
    container.style.display = isVisible ? 'block' : 'none';
}

export function updateInventoryUI(inventory: any) {
    if (!container || !isVisible) return; // обновляем только когда открыто

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

            // Всплывающая подсказка
            slot.title = `${item.name}\n${item.description}`;
        }
    }
}