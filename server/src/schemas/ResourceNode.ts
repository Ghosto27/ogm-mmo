import { Schema, type } from "@colyseus/schema";

export class ResourceNode extends Schema {
    @type("string") id: string = "";
    @type("string") type: string = "";       // "copper_ore", "iron_ore", "tin_ore", "coal"
    @type("number") x: number = 0;
    @type("number") z: number = 0;
    @type("number") y: number = 0;
    @type("string") state: string = "active"; // "active" | "depleted"
    @type("number") respawnAt: number = 0;

    get minMiningLevel(): number {
        switch (this.type) {
            case "copper_ore": return 1;
            case "tin_ore": return 3;
            case "coal": return 5;
            case "iron_ore": return 10;
            default: return 1;
        }
    }

    get baseXpReward(): number {
        switch (this.type) {
            case "copper_ore": return 10;
            case "tin_ore": return 15;
            case "coal": return 20;
            case "iron_ore": return 25;
            default: return 10;
        }
    }

    get respawnTimeMs(): number {
        switch (this.type) {
            case "copper_ore": return 60000;
            case "tin_ore": return 90000;
            case "coal": return 120000;
            case "iron_ore": return 180000;
            default: return 60000;
        }
    }

    toJSON(): any {
        return {
            id: this.id,
            type: this.type,
            x: this.x,
            z: this.z
        };
    }

    static fromJSON(data: any): ResourceNode {
        const node = new ResourceNode();
        node.id = data.id;
        node.type = data.type;
        node.x = data.x;
        node.z = data.z;
        return node;
    }
}
