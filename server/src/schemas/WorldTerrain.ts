import { Schema, type } from "@colyseus/schema";

export class WorldTerrain extends Schema {
    @type("string") heightmapPath: string = "";
    @type("number") width: number = 100;
    @type("number") depth: number = 100;
    @type("number") segments: number = 128;
    @type("number") maxHeight: number = 10;
}