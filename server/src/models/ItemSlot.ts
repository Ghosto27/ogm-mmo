import { Schema, type } from "@colyseus/schema";
import { Item } from "./Item";

export class ItemSlot extends Schema {
    @type(Item) item: Item | null = null;
    @type("number") quantity: number = 0;

    // Ручное клонирование слота (без конфликта с Schema.clone)
    cloneSlot(): ItemSlot {
        const slot = new ItemSlot();
        if (this.item) {
            slot.item = this.item.cloneItem();
        }
        slot.quantity = this.quantity;
        return slot;
    }

    // Сериализация для JSON
    toJSON(): any {
        return {
            item: this.item ? this.item.toJSON() : null,
            quantity: this.quantity
        };
    }

    // Статический метод для восстановления из JSON
    static fromJSON(data: any): ItemSlot {
        const slot = new ItemSlot();
        if (data.item) {
            slot.item = Item.fromJSON(data.item);
        }
        slot.quantity = data.quantity || 0;
        return slot;
    }
}