import { Schema, type } from "@colyseus/schema";
import { Item } from "./Item";

export class ItemSlot extends Schema {
  @type(Item) item: Item | null = null;
  @type("number") quantity: number = 0;
}