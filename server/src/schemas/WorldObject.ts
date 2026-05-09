// server/src/schemas/WorldObject.ts
import { Schema, type } from "@colyseus/schema";

export class WorldObject extends Schema {
    @type("string") id: string = "";
    @type("string") modelName: string = "";      // cube, cylinder, или имя glb модели
    @type("number") x: number = 0;
    @type("number") z: number = 0;
    @type("number") y: number = 0;
    @type("number") rotationY: number = 0;
    @type("number") rotationX: number = 0;
    @type("number") rotationZ: number = 0;
    @type("number") scaleX: number = 1;
    @type("number") scaleY: number = 1;
    @type("number") scaleZ: number = 1;
    @type("string") color: string = "#ffffff";    // CSS-цвет (hex)
}