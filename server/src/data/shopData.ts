import * as fs from 'fs';
import * as path from 'path';

export interface ShopEntry {
    buyPrice: number;
    sellPrice: number;
}

const SHOP_PATH = path.join(__dirname, 'shop.json');
let shopData: Record<string, ShopEntry> = {};

export function loadShopData(): void {
    try {
        const raw = fs.readFileSync(SHOP_PATH, 'utf-8');
        shopData = JSON.parse(raw);
        console.log(`[SHOP] Загружено ${Object.keys(shopData).length} позиций`);
    } catch (err) {
        console.error('[SHOP] Ошибка загрузки shop.json:', err);
    }
}

export function getShopData(): Record<string, ShopEntry> {
    return shopData;
}

export function getBuyPrice(itemId: string): number {
    return shopData[itemId]?.buyPrice ?? 0;
}

export function getSellPrice(itemId: string): number {
    return shopData[itemId]?.sellPrice ?? 0;
}

export function isBuyable(itemId: string): boolean {
    return (shopData[itemId]?.buyPrice ?? 0) > 0;
}

export function isSellable(itemId: string): boolean {
    return (shopData[itemId]?.sellPrice ?? 0) > 0;
}
