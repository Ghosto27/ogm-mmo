import { Schema, type, ArraySchema } from "@colyseus/schema";

export class NPC extends Schema {
    @type("string") id: string = "";
    @type("string") name: string = "";
    @type("number") x: number = 0;
    @type("number") z: number = 0;
    @type("string") currentDialogue: string = ""; // идентификатор диалогового узла
    @type([ "string" ]) availableQuestIds = new ArraySchema<string>();
}