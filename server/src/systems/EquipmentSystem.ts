import { Player } from "../MyRoom";
import { Item } from "../models/Item";
import { PlayerStats } from "../models/PlayerStats";
import { MapSchema } from "@colyseus/schema";

export class EquipmentSystem {
    static equipItem(player: Player, item: Item, fromSlotIndex: number): boolean {
        // 1. Проверяем, что предмет можно надеть
        if (!item.slot) return false; // не экипировка
        if (item.requiredLevel > player.level) return false;
        
        // 2. Если слот занят, сначала снимаем старую вещь
        const currentEquipped = player.equipment.get(item.slot);
        if (currentEquipped) {
            this.unequipItem(player, item.slot);
        }

        // 3. Убираем предмет из инвентаря
        const slot = player.inventory.slots[fromSlotIndex];
        if (!slot || slot.item?.id !== item.id || slot.quantity < 1) return false;
        player.inventory.removeItem(fromSlotIndex, 1);

        // 4. Надеваем предмет
        player.equipment.set(item.slot, item);

        // 5. Применяем бонусы
        this.applyBonuses(player.stats, item.bonuses, 1);
        this.recalculateStats(player);
        return true;
    }

    static unequipItem(player: Player, slot: string): boolean {
        const item = player.equipment.get(slot);
        if (!item) return false;

        // Снимаем бонусы
        this.applyBonuses(player.stats, item.bonuses, -1);
        
        // Возвращаем предмет в инвентарь
        player.inventory.addItem(item, 1);
        player.equipment.delete(slot);
        
        this.recalculateStats(player);
        return true;
    }

    private static applyBonuses(stats: PlayerStats, bonuses: MapSchema<number>, multiplier: 1 | -1) {
        bonuses.forEach((value, key) => {
            switch (key) {
                case 'strength': stats.strength += value * multiplier; break;
                case 'dexterity': stats.dexterity += value * multiplier; break;
                case 'intelligence': stats.intelligence += value * multiplier; break;
                case 'vitality': stats.vitality += value * multiplier; break;
                case 'luck': stats.luck += value * multiplier; break;
            }
        });
    }

    static recalculateStats(player: Player) {
        const s = player.stats;
        s.attackPower = s.strength * 2;
        s.defense = Math.floor(s.vitality * 0.5);
        s.critChance = Math.min(50, s.dexterity * 0.5 + s.luck * 0.2);
        player.maxHp = 100 + s.vitality * 5;
        player.hp = Math.min(player.hp, player.maxHp);
    }
}