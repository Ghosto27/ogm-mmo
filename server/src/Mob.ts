import { Schema, type } from "@colyseus/schema";

export class Mob extends Schema {
    @type("number") x: number = 0;
    @type("number") z: number = 0;
    @type("number") rotationY: number = 0;
    @type("number") hp: number = 100;
    @type("number") maxHp: number = 100;
    @type("number") level: number = 1;
    @type("number") expReward: number = 50;
    @type("string") state: string = "idle";       // idle, patrol, chase, attack, dead
    @type("string") targetId: string = "";        // sessionId игрока, которого атакует
    @type("number") lastAttackTime: number = 0;
}