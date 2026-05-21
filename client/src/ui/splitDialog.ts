let overlay: HTMLDivElement | null = null;

export function showSplitDialog(
    itemName: string,
    maxQuantity: number,
    onConfirm: (quantity: number) => void
) {
    closeSplitDialog();

    overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.5); z-index: 2000;
        display: flex; align-items: center; justify-content: center;
    `;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeSplitDialog();
    });

    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: #222; border: 2px solid #888; border-radius: 8px;
        padding: 20px; color: white; font-family: Arial, sans-serif;
        font-size: 14px; min-width: 250px; text-align: center;
    `;
    dialog.addEventListener('click', (e) => e.stopPropagation());

    const title = document.createElement('div');
    title.textContent = `Split ${itemName}`;
    title.style.cssText = 'font-weight: bold; margin-bottom: 12px; font-size: 16px;';

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
        if (e.key === 'Enter') confirm();
        if (e.key === 'Escape') closeSplitDialog();
    });
    input.addEventListener('input', () => {
        let val = parseInt(input.value);
        if (isNaN(val) || val < 1) input.value = '1';
        else if (val > maxQuantity - 1) input.value = String(maxQuantity - 1);
    });

    inputRow.appendChild(label);
    inputRow.appendChild(input);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; gap: 10px; justify-content: center;';

    const splitBtn = document.createElement('button');
    splitBtn.textContent = 'Split';
    splitBtn.style.cssText = `
        padding: 6px 16px; border: none; border-radius: 4px;
        background: #4a4; color: white; cursor: pointer; font-size: 14px;
    `;
    splitBtn.addEventListener('click', confirm);

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

    input.focus();
    input.select();

    function confirm() {
        const qty = parseInt(input.value);
        if (isNaN(qty) || qty < 1 || qty >= maxQuantity) return;
        onConfirm(qty);
        closeSplitDialog();
    }
}

export function closeSplitDialog() {
    if (overlay) {
        document.body.removeChild(overlay);
        overlay = null;
    }
}
