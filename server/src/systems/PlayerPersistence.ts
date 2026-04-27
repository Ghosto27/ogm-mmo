import * as fs from 'fs';
import * as path from 'path';
import { ItemSlot } from '../models/ItemSlot';
import { Item } from '../models/Item';
import { Player } from '../MyRoom'; // импортируем класс Player

const DATA_DIR = path.join(__dirname, '../../data/players');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

export class PlayerPersistence {
    // Сохраняем ВСЕ важные параметры игрока
    static savePlayer(player: Player) {
        const data = {
            hp: player.hp,
            maxHp: player.maxHp,
            level: player.level,
            exp: player.exp,
            expToLevel: player.expToLevel,
            stats: {
                strength: player.stats.strength,
                dexterity: player.stats.dexterity,
                intelligence: player.stats.intelligence,
                vitality: player.stats.vitality,
                luck: player.stats.luck,
                attackPower: player.stats.attackPower,
                defense: player.stats.defense,
                critChance: player.stats.critChance,
            },
            inventory: player.inventory.slots.map(slot => slot.toJSON()),
            equipment: Object.fromEntries(
                Array.from(player.equipment.entries()).map(([key, item]) => [key, item.toJSON()])
            ),
            quests: Object.fromEntries(player.questProgress.entries())
        };
        const filePath = path.join(DATA_DIR, `${player.name}.json`);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }

    // Загружаем все сохранённые параметры
    static loadPlayer(playerName: string): {
        hp: number;
        maxHp: number;
        level: number;
        exp: number;
        expToLevel: number;
        stats: {
            strength: number;
            dexterity: number;
            intelligence: number;
            vitality: number;
            luck: number;
            attackPower: number;
            defense: number;
            critChance: number;
        };
        inventory: ItemSlot[];
        equipment: Map<string, Item>;
        quests?: Record<string, number>;
    } | null {
        const filePath = path.join(DATA_DIR, `${playerName}.json`);
        if (!fs.existsSync(filePath)) return null;

        const raw = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);

        const quests = data.quests || {};

        const inventory = data.inventory.map((slotData: any) =>
            ItemSlot.fromJSON(slotData)
        );
        const equipment = new Map<string, Item>();
        if (data.equipment) {
            for (const [key, itemData] of Object.entries(data.equipment)) {
                equipment.set(key, Item.fromJSON(itemData as any));
            }
        }

        return {
            hp: data.hp,
            maxHp: data.maxHp,
            level: data.level,
            exp: data.exp,
            expToLevel: data.expToLevel,
            stats: data.stats,
            inventory,
            equipment,
            quests,
        };
    }
}