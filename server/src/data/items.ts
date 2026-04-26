import { Item } from "../models/Item";
import { MapSchema } from "@colyseus/schema";

export const itemDatabase: { [id: string]: Item } = {
  "potion_hp_01": Object.assign(new Item(), {
    id: "potion_hp_01",
    name: "Зелье здоровья",
    description: "Восстанавливает 50 HP",
    maxStack: 5,
    icon: "icons/potion.png",
    // зелье не экипируется — slot и bonuses не нужны
  }),
  "sword_01": Object.assign(new Item(), {
    id: "sword_01",
    name: "Меч новичка",
    description: "Простой, но надёжный",
    maxStack: 1,
    icon: "icons/sword.png",
    slot: "weapon",
    requiredLevel: 1,
    bonuses: new MapSchema<number>({ strength: 5 })
  })
};