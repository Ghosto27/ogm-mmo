// server/src/models/PlayerData.ts
import { Schema, ArraySchema, MapSchema, type } from "@colyseus/schema";
import { ItemSlot } from "./ItemSlot";
import { Item } from "./Item";

export class PlayerData extends Schema {
    @type([ ItemSlot ]) inventory = new ArraySchema<ItemSlot>();
    @type({ map: Item }) equipment = new MapSchema<Item>();
}