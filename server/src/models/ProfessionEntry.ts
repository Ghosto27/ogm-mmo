import { Schema, type } from "@colyseus/schema";

export class ProfessionEntry extends Schema {
    @type("number") level: number = 1;
    @type("number") xp: number = 0;
    @type("number") xpToNext: number = 100;

    addXp(amount: number) {
        if (amount >= 0) {
            this.xp += amount;
            while (this.xp >= this.xpToNext) {
                this.xp -= this.xpToNext;
                this.level += 1;
                this.xpToNext = Math.floor(100 * Math.pow(this.level, 1.5));
            }
        } else {
            this.removeXp(-amount);
        }
    }

    removeXp(amount: number) {
        this.xp -= amount;
        while (this.xp < 0 && this.level > 1) {
            const prevThreshold = Math.floor(100 * Math.pow(this.level - 1, 1.5));
            this.xp += prevThreshold;
            this.level -= 1;
        }
        this.xpToNext = Math.floor(100 * Math.pow(this.level, 1.5));
        if (this.xp < 0) {
            this.xp = 0;
            this.level = 1;
            this.xpToNext = 100;
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
