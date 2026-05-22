import { Item } from "../models/Item";
import { MapSchema } from "@colyseus/schema";

export const itemDatabase: { [id: string]: Item } = {
  "potion_hp_01": Object.assign(new Item(), {
    id: "potion_hp_01",
    name: "Зелье здоровья",
    description: "Восстанавливает 50 HP",
    maxStack: 5,
    icon: "icons/potion.png",
  }),
  "sword_01": Object.assign(new Item(), {
    id: "sword_01",
    name: "Меч новичка",
    description: "Простой, но надёжный",
    maxStack: 1,
    icon: "icons/sword.png",
    slot: "weapon",
    requiredLevel: 1,
    bonuses: new MapSchema<number>({ strength: 20 })
  }),

  // ---- Mining (resources) ----
  "copper_ore": Object.assign(new Item(), {
    id: "copper_ore",
    name: "Медная руда",
    description: "Красноватая руда. Требует плавки.",
    maxStack: 20,
    icon: "icons/copper_ore.png",
  }),
  "tin_ore": Object.assign(new Item(), {
    id: "tin_ore",
    name: "Оловянная руда",
    description: "Серебристая руда. Требует плавки.",
    maxStack: 20,
    icon: "icons/tin_ore.png",
  }),
  "iron_ore": Object.assign(new Item(), {
    id: "iron_ore",
    name: "Железная руда",
    description: "Тёмно-серая руда. Требует плавки.",
    maxStack: 20,
    icon: "icons/iron_ore.png",
  }),
  "coal": Object.assign(new Item(), {
    id: "coal",
    name: "Уголь",
    description: "Топливо для плавки.",
    maxStack: 20,
    icon: "icons/coal.png",
  }),

  // ---- Blacksmithing (bars) ----
  "copper_bar": Object.assign(new Item(), {
    id: "copper_bar",
    name: "Медный слиток",
    description: "Очищенная медь. Подходит для ковки.",
    maxStack: 10,
    icon: "icons/copper_bar.png",
  }),
  "tin_bar": Object.assign(new Item(), {
    id: "tin_bar",
    name: "Оловянный слиток",
    description: "Мягкий металл. Компонент бронзы.",
    maxStack: 10,
    icon: "icons/tin_bar.png",
  }),
  "bronze_bar": Object.assign(new Item(), {
    id: "bronze_bar",
    name: "Бронзовый слиток",
    description: "Прочный сплав меди и олова.",
    maxStack: 10,
    icon: "icons/bronze_bar.png",
  }),
  "iron_bar": Object.assign(new Item(), {
    id: "iron_bar",
    name: "Железный слиток",
    description: "Крепкий металл для серьёзного оружия.",
    maxStack: 10,
    icon: "icons/iron_bar.png",
  }),

  // ---- Blacksmithing (equipment) ----
  "bronze_sword": Object.assign(new Item(), {
    id: "bronze_sword",
    name: "Бронзовый меч",
    description: "Прочный меч из бронзы.",
    maxStack: 1,
    icon: "icons/bronze_sword.png",
    slot: "weapon",
    requiredLevel: 5,
    bonuses: new MapSchema<number>({ strength: 5 })
  }),
  "iron_sword": Object.assign(new Item(), {
    id: "iron_sword",
    name: "Железный меч",
    description: "Тяжёлый меч из железа.",
    maxStack: 1,
    icon: "icons/iron_sword.png",
    slot: "weapon",
    requiredLevel: 10,
    bonuses: new MapSchema<number>({ strength: 12 })
  }),
  "bronze_helmet": Object.assign(new Item(), {
    id: "bronze_helmet",
    name: "Бронзовый шлем",
    description: "Защищает голову.",
    maxStack: 1,
    icon: "icons/bronze_helmet.png",
    slot: "head",
    requiredLevel: 5,
    bonuses: new MapSchema<number>({ defense: 3 })
  }),
  "iron_helmet": Object.assign(new Item(), {
    id: "iron_helmet",
    name: "Железный шлем",
    description: "Надёжная защита.",
    maxStack: 1,
    icon: "icons/iron_helmet.png",
    slot: "head",
    requiredLevel: 12,
    bonuses: new MapSchema<number>({ defense: 6 })
  }),

  // ---- Loot ----
  "skeleton_bone": Object.assign(new Item(), {
    id: "skeleton_bone",
    name: "Bone",
    description: "A skeletal bone",
    maxStack: 10,
    icon: "icons/bone.png",
  }),
};