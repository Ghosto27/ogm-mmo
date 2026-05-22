import { room } from '../network';
import { setTooltipMerchantContext } from '../tooltip';
import { pushUIMode, popUIMode } from '../cameraControls';

let container: HTMLDivElement;
let buyList: HTMLDivElement;
let goldText: HTMLElement;
let isVisible = false;
let merchantItems: { itemId: string; buyPrice: number; sellPrice: number }[] = [];

export function isMerchantOpen(): boolean {
    return isVisible;
}

export function getSellPrice(itemId: string): number {
    const entry = merchantItems.find(e => e.itemId === itemId);
    return entry?.sellPrice ?? 0;
}

export function showMerchantUI(): void {
    isVisible = true;
    container.style.display = 'flex';
    room?.send('getMerchantData');
    pushUIMode();
}

export function hideMerchantUI(): void {
    isVisible = false;
    container.style.display = 'none';
    popUIMode();
}

export function updateMerchantGold(gold: number): void {
    goldText.textContent = `💰 ${gold} gold`;
}

export function updateMerchantItems(items: { itemId: string; buyPrice: number; sellPrice: number }[]): void {
    merchantItems = items;
    buyList.innerHTML = '';
    for (const entry of items) {
        if (entry.buyPrice <= 0) continue;
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 6px 4px; border-bottom: 1px solid #333;';

        const nameSpan = document.createElement('span');
        nameSpan.style.cssText = 'flex: 1;';
        const name = entry.itemId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        nameSpan.textContent = name;

        const priceSpan = document.createElement('span');
        priceSpan.style.cssText = 'color: #ffd700; margin: 0 10px;';
        priceSpan.textContent = `${entry.buyPrice} gold`;

        const buyBtn = document.createElement('button');
        buyBtn.style.cssText = 'padding: 4px 10px; background: #22AA22; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-family: monospace;';
        buyBtn.textContent = 'Купить';
        buyBtn.addEventListener('click', () => {
            room?.send('merchantBuyItem', { itemId: entry.itemId, quantity: 1 });
        });

        row.appendChild(nameSpan);
        row.appendChild(priceSpan);
        row.appendChild(buyBtn);
        buyList.appendChild(row);
    }
}

export function initMerchantUI(): void {
    container = document.createElement('div');
    container.id = 'merchant-ui';
    container.style.cssText = `
        display: none;
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 400px;
        max-height: 500px;
        background: rgba(0, 0, 0, 0.9);
        border: 2px solid #22AA22;
        border-radius: 8px;
        color: #fff;
        font-family: monospace;
        flex-direction: column;
        z-index: 2000;
    `;

    const header = document.createElement('div');
    header.style.cssText = 'padding: 10px; border-bottom: 1px solid #22AA22; font-size: 16px; font-weight: bold; display: flex; justify-content: space-between;';
    const title = document.createElement('span');
    title.textContent = '🏪 Торговец';
    goldText = document.createElement('span');
    goldText.textContent = '💰 0 gold';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background: none; border: none; color: #fff; cursor: pointer; font-size: 16px;';
    closeBtn.addEventListener('click', hideMerchantUI);
    header.appendChild(title);
    header.appendChild(goldText);
    header.appendChild(closeBtn);
    container.appendChild(header);

    const tabBar = document.createElement('div');
    tabBar.style.cssText = 'display: flex; border-bottom: 1px solid #444;';

    const buyTab = document.createElement('button');
    buyTab.textContent = 'Покупка';
    buyTab.style.cssText = 'flex: 1; padding: 8px; background: #22AA22; color: #fff; border: none; cursor: pointer; font-family: monospace;';
    buyTab.addEventListener('click', () => {
        buyList.style.display = 'block';
        sellInfo.style.display = 'none';
        buyTab.style.background = '#22AA22';
        sellTab.style.background = '#333';
    });

    const sellTab = document.createElement('button');
    sellTab.textContent = 'Продажа';
    sellTab.style.cssText = 'flex: 1; padding: 8px; background: #333; color: #fff; border: none; cursor: pointer; font-family: monospace;';
    sellTab.addEventListener('click', () => {
        buyList.style.display = 'none';
        sellInfo.style.display = 'block';
        buyTab.style.background = '#333';
        sellTab.style.background = '#22AA22';
    });

    tabBar.appendChild(buyTab);
    tabBar.appendChild(sellTab);
    container.appendChild(tabBar);

    buyList = document.createElement('div');
    buyList.style.cssText = 'flex: 1; overflow-y: auto; padding: 4px 10px;';
    container.appendChild(buyList);

    const sellInfo = document.createElement('div');
    sellInfo.style.cssText = 'display: none; padding: 20px; text-align: center; color: #aaa;';
    sellInfo.textContent = 'Нажмите ПКМ по предмету в инвентаре для продажи';
    container.appendChild(sellInfo);

    document.body.appendChild(container);

    // Закрытие по Esc
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isVisible) hideMerchantUI();
    });

    setTooltipMerchantContext(isMerchantOpen, getSellPrice);
}


