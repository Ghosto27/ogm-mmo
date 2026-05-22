import * as fs from 'fs';
import * as path from 'path';
import { ItemSlot } from '../models/ItemSlot';
import { Item } from '../models/Item';
import { Player } from '../MyRoom';
import { ProfessionsData } from '../models/ProfessionsData';
import { itemDatabase } from '../data/items';

const DATA_DIR = path.join(__dirname, '../../data/players');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function buildItemFromTemplate(itemId: string, customBonuses?: Record<string, number>): Item {
    const template = itemDatabase[itemId];
    if (!template) {
        const unknown = new Item();
        unknown.id = itemId;
        unknown.name = "Unknown Item";
        unknown.description = "This item no longer exists";
        unknown.maxStack = 1;
        return unknown;
    }

    const item = template.cloneItem();

    if (customBonuses) {
        for (const [key, value] of Object.entries(customBonuses)) {
            const current = item.bonuses.get(key) || 0;
            item.bonuses.set(key, current + value);
        }
    }

    return item;
}

export class PlayerPersistence {
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
            inventory: player.inventory.slots.map(slot => {
                if (!slot.item) return null;
                const data: Record<string, any> = { id: slot.item.id, quantity: slot.quantity };
                // Save custom bonuses only if they differ from template
                const template = itemDatabase[slot.item.id];
                if (template) {
                    const delta: Record<string, number> = {};
                    slot.item.bonuses.forEach((v, k) => {
                        if (v !== (template.bonuses.get(k) || 0)) {
                            delta[k] = v - (template.bonuses.get(k) || 0);
                        }
                    });
                    if (Object.keys(delta).length > 0) data.bonuses = delta;
                }
                return data;
            }),
            equipment: Object.fromEntries(
                Array.from(player.equipment.entries()).map(([key, item]) => {
                    const data: Record<string, any> = { id: item.id };
                    const template = itemDatabase[item.id];
                    if (template) {
                        const delta: Record<string, number> = {};
                        item.bonuses.forEach((v, k) => {
                            if (v !== (template.bonuses.get(k) || 0)) {
                                delta[k] = v - (template.bonuses.get(k) || 0);
                            }
                        });
                        if (Object.keys(delta).length > 0) data.bonuses = delta;
                    }
                    return [key, data];
                })
            ),
            quests: Object.fromEntries(player.questProgress.entries()),
            professions: player.professions.toJSON(),
            bank: player.bank.slots.map(slot => {
                if (!slot.item) return null;
                const data: Record<string, any> = { id: slot.item.id, quantity: slot.quantity };
                const template = itemDatabase[slot.item.id];
                if (template) {
                    const delta: Record<string, number> = {};
                    slot.item.bonuses.forEach((v, k) => {
                        if (v !== (template.bonuses.get(k) || 0)) {
                            delta[k] = v - (template.bonuses.get(k) || 0);
                        }
                    });
                    if (Object.keys(delta).length > 0) data.bonuses = delta;
                }
                return data;
            }),
        };
        const filePath = path.join(DATA_DIR, `${player.name}.json`);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }

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
        professions?: any;
        bank?: ItemSlot[];
    } | null {
        const filePath = path.join(DATA_DIR, `${playerName}.json`);
        if (!fs.existsSync(filePath)) return null;

        const raw = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);

        const quests = data.quests || {};

        const inventory: ItemSlot[] = [];
        for (const slotData of data.inventory) {
            if (!slotData) {
                inventory.push(new ItemSlot());
            } else {
                const item = buildItemFromTemplate(slotData.id, slotData.bonuses);
                const slot = new ItemSlot();
                slot.item = item;
                slot.quantity = slotData.quantity || 1;
                inventory.push(slot);
            }
        }

        const equipment = new Map<string, Item>();
        if (data.equipment) {
            for (const [key, itemData] of Object.entries(data.equipment)) {
                const ed = itemData as any;
                const item = buildItemFromTemplate(ed.id, ed.bonuses);
                equipment.set(key, item);
            }
        }

        const bank: ItemSlot[] | undefined = data.bank
            ? data.bank.map((slotData: any) => {
                if (!slotData) return new ItemSlot();
                const item = buildItemFromTemplate(slotData.id, slotData.bonuses);
                const slot = new ItemSlot();
                slot.item = item;
                slot.quantity = slotData.quantity || 1;
                return slot;
            })
            : undefined;

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
            professions: data.professions,
            bank,
        };
    }
}
