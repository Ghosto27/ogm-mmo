import { Item } from "../models/Item";

// Простейшая база предметов
export const itemDatabase: { [id: string]: Item } = {
  "potion_hp_01": Object.assign(new Item(), {
    id: "potion_hp_01",
    name: "Зелье здоровья",
    description: "Восстанавливает 50 HP",
    maxStack: 5,
    icon: "icons/potion.png" // позже можно добавить реальные иконки
  }),
  "sword_01": Object.assign(new Item(), {
    id: "sword_01",
    name: "Меч новичка",
    description: "Простой, но надёжный",
    maxStack: 1,
    icon: "icons/sword.png"
  })
};