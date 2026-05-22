let tooltipElement: HTMLDivElement | null = null;
let _isMerchantOpen: () => boolean = () => false;
let _getSellPrice: (itemId: string) => number = () => 0;

export function setTooltipMerchantContext(isOpen: () => boolean, getSellPrice: (itemId: string) => number): void {
    _isMerchantOpen = isOpen;
    _getSellPrice = getSellPrice;
}

export function showTooltip(x: number, y: number, item: any) {
    hideTooltip();
    
    tooltipElement = document.createElement('div');
    tooltipElement.style.position = 'fixed';
    tooltipElement.style.left = (x + 15) + 'px';
    tooltipElement.style.top = (y + 15) + 'px';
    tooltipElement.style.background = 'rgba(0, 0, 0, 0.9)';
    tooltipElement.style.color = '#fff';
    tooltipElement.style.padding = '6px 10px';
    tooltipElement.style.borderRadius = '4px';
    tooltipElement.style.fontSize = '12px';
    tooltipElement.style.zIndex = '3000';
    tooltipElement.style.pointerEvents = 'none';

    if (_isMerchantOpen()) {
        const sellPrice = _getSellPrice(item.id);
        if (sellPrice > 0) {
            tooltipElement.innerHTML = `
                <strong>${item.name}</strong><br>
                <span style="color: #ffd700;">Цена продажи: ${sellPrice} gold/шт</span>
            `;
        } else {
            tooltipElement.innerHTML = `
                <strong>${item.name}</strong><br>
                <span style="color: #aaa;">Не продаётся</span>
            `;
        }
    } else {
        tooltipElement.innerHTML = `
            <strong>${item.name}</strong><br>
            <span style="color: #ccc;">${item.description}</span>
        `;
    }
    document.body.appendChild(tooltipElement);
}

export function hideTooltip() {
    if (tooltipElement) {
        document.body.removeChild(tooltipElement);
        tooltipElement = null;
    }
}