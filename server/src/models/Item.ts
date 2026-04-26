import { Schema, type } from "@colyseus/schema";

export class Item extends Schema {
  @type("string") id: string = "";           // "potion_hp_01"
  @type("string") name: string = "";         // "Зелье здоровья"
  @type("string") description: string = "";  // "Восстанавливает 50 HP"
  @type("number") maxStack: number = 1;      // Макс. количество в одной ячейке
  @type("string") icon: string = "";         // "icons/potion.png"
}