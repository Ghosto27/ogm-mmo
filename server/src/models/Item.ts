import { Schema, MapSchema, type } from "@colyseus/schema";

export class Item extends Schema {
    @type("string") id: string = "";
    @type("string") name: string = "";
    @type("string") description: string = "";
    @type("number") maxStack: number = 1;
    @type("string") icon: string = "";
    @type("string") slot: string = "";
    @type("number") requiredLevel: number = 1;
    @type({ map: "number" }) bonuses = new MapSchema<number>();

    // Ручное клонирование (без конфликта с Schema.clone)
    cloneItem(): Item {
        const cloned = new Item();
        cloned.id = this.id;
        cloned.name = this.name;
        cloned.description = this.description;
        cloned.maxStack = this.maxStack;
        cloned.icon = this.icon;
        cloned.slot = this.slot;
        cloned.requiredLevel = this.requiredLevel;
        this.bonuses.forEach((value, key) => {
            cloned.bonuses.set(key, value);
        });
        return cloned;
    }

    // Сериализация для JSON (по аналогии с позицией)
    toJSON(): any {
        const bonusesObj: { [key: string]: number } = {};
        this.bonuses.forEach((value, key) => {
            bonusesObj[key] = value;
        });
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            maxStack: this.maxStack,
            icon: this.icon,
            slot: this.slot,
            requiredLevel: this.requiredLevel,
            bonuses: bonusesObj
        };
    }

    // Статический метод для восстановления из JSON
    static fromJSON(data: any): Item {
        const item = new Item();
        item.id = data.id;
        item.name = data.name;
        item.description = data.description;
        item.maxStack = data.maxStack;
        item.icon = data.icon;
        item.slot = data.slot;
        item.requiredLevel = data.requiredLevel;
        if (data.bonuses) {
            for (const key in data.bonuses) {
                item.bonuses.set(key, data.bonuses[key]);
            }
        }
        return item;
    }
}