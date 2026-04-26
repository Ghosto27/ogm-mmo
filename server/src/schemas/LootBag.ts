import { Schema, ArraySchema, type } from "@colyseus/schema";
import { ItemSlot } from "../models/ItemSlot";
import { Item } from "../models/Item";

export class LootBag extends Schema {
    @type("string") id: string = "";
    @type("number") x: number = 0;
    @type("number") z: number = 0;
    @type("number") mobX: number = 0;
    @type("number") mobZ: number = 0;
    @type([ItemSlot]) items = new ArraySchema<ItemSlot>();

    constructor(id: string, x: number, z: number, mobX: number, mobZ: number, items: { item: Item, quantity: number }[]) {
        super();
        this.id = id;
        this.x = x;
        this.z = z;
        this.mobX = mobX;
        this.mobZ = mobZ;
        items.forEach(i => {
            const slot = new ItemSlot();
            slot.item = i.item;
            slot.quantity = i.quantity;
            this.items.push(slot);
        });
    }
}