import { Schema, MapSchema, type } from "@colyseus/schema";

export class Item extends Schema {
    @type("string") id: string = "";
    @type("string") name: string = "";
    @type("string") description: string = "";
    @type("number") maxStack: number = 1;
    @type("string") icon: string = "";

    // Новые поля для экипировки
    @type("string") slot: string = "";              // "head", "chest", "gloves", "legs", "weapon", "shield"
    @type("number") requiredLevel: number = 1;
    @type({ map: "number" }) bonuses = new MapSchema<number>(); // например, { "strength": 5, "vitality": 10 }
}