import { Schema, ArraySchema, type } from "@colyseus/schema";
import { ItemSlot } from "./ItemSlot";
import { Item } from "./Item";

export class Inventory extends Schema {
  @type([ ItemSlot ]) slots = new ArraySchema<ItemSlot>();
  @type("number") maxSlots: number = 20;

  constructor(maxSlots?: number) {
    super();
    if (maxSlots !== undefined) this.maxSlots = maxSlots;
    for (let i = 0; i < this.maxSlots; i++) {
      this.slots.push(new ItemSlot());
    }
  }

  // Положить предмет в первую подходящую ячейку
  addItem(item: Item, quantity: number = 1): boolean {
    // Сначала пытаемся добавить в существующую ячейку с таким же предметом
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (slot.item && slot.item.id === item.id) {
        const canAdd = item.maxStack - slot.quantity;
        if (canAdd > 0) {
          const toAdd = Math.min(quantity, canAdd);
          slot.quantity += toAdd;
          return true;
        }
      }
    }
    // Ищем пустую ячейку
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (slot.item === null) {
        slot.item = item;
        slot.quantity = quantity;
        return true;
      }
    }
    return false;
  }

  // Удалить указанное количество предмета из слота (по индексу)
  removeItem(slotIndex: number, quantity: number = 1): boolean {
    if (slotIndex < 0 || slotIndex >= this.slots.length) return false;
    const slot = this.slots[slotIndex];
    if (!slot.item || slot.quantity < quantity) return false;
    slot.quantity -= quantity;
    if (slot.quantity <= 0) {
      slot.item = null;
      slot.quantity = 0;
    }
    return true;
  }

  // Получить предмет по индексу слота
  getItem(slotIndex: number): { item: Item | null; quantity: number } | null {
    if (slotIndex < 0 || slotIndex >= this.slots.length) return null;
    const slot = this.slots[slotIndex];
    return { item: slot.item, quantity: slot.quantity };
  }
}