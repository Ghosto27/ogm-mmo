import { Schema, type } from "@colyseus/schema";

export class ProfessionEntry extends Schema {
    @type("number") level: number = 1;
    @type("number") xp: number = 0;
    @type("number") xpToNext: number = 100;

    addXp(amount: number) {
        this.xp += amount;
        while (this.xp >= this.xpToNext) {
            this.xp -= this.xpToNext;
            this.level += 1;
            this.xpToNext = Math.floor(100 * Math.pow(this.level, 1.5));
        }
    }

    toJSON(): any {
        return {
            level: this.level,
            xp: this.xp,
            xpToNext: this.xpToNext
        };
    }

    static fromJSON(data: any): ProfessionEntry {
        const entry = new ProfessionEntry();
        entry.level = data.level ?? 1;
        entry.xp = data.xp ?? 0;
        entry.xpToNext = data.xpToNext ?? 100;
        return entry;
    }
}
