export interface RecipeInput {
    itemId: string;
    quantity: number;
}

export interface RecipeOutput {
    itemId: string;
    quantity: number;
}

export interface Recipe {
    id: string;
    name: string;
    stationType: 'furnace' | 'anvil';
    requiredLevel: number;
    xpReward: number;
    inputs: RecipeInput[];
    output: RecipeOutput;
    bonusChance: number;
}

export const recipes: Recipe[] = [
    // ===== Furnace (Smelting) =====
    {
        id: "smelt_copper",
        name: "Медный слиток",
        stationType: "furnace",
        requiredLevel: 1,
        xpReward: 25,
        inputs: [{ itemId: "copper_ore", quantity: 3 }],
        output: { itemId: "copper_bar", quantity: 1 },
        bonusChance: 0,
    },
    {
        id: "smelt_tin",
        name: "Оловянный слиток",
        stationType: "furnace",
        requiredLevel: 3,
        xpReward: 25,
        inputs: [{ itemId: "tin_ore", quantity: 3 }],
        output: { itemId: "tin_bar", quantity: 1 },
        bonusChance: 0,
    },
    {
        id: "smelt_bronze",
        name: "Бронзовый слиток",
        stationType: "furnace",
        requiredLevel: 5,
        xpReward: 40,
        inputs: [
            { itemId: "copper_bar", quantity: 2 },
            { itemId: "tin_bar", quantity: 1 },
        ],
        output: { itemId: "bronze_bar", quantity: 3 },
        bonusChance: 0.05,
    },
    {
        id: "smelt_iron",
        name: "Железный слиток",
        stationType: "furnace",
        requiredLevel: 10,
        xpReward: 50,
        inputs: [
            { itemId: "iron_ore", quantity: 3 },
            { itemId: "coal", quantity: 1 },
        ],
        output: { itemId: "iron_bar", quantity: 1 },
        bonusChance: 0.1,
    },

    // ===== Anvil (Smithing) =====
    {
        id: "craft_bronze_sword",
        name: "Бронзовый меч",
        stationType: "anvil",
        requiredLevel: 5,
        xpReward: 60,
        inputs: [{ itemId: "bronze_bar", quantity: 4 }],
        output: { itemId: "bronze_sword", quantity: 1 },
        bonusChance: 0,
    },
    {
        id: "craft_bronze_helmet",
        name: "Бронзовый шлем",
        stationType: "anvil",
        requiredLevel: 7,
        xpReward: 55,
        inputs: [{ itemId: "bronze_bar", quantity: 3 }],
        output: { itemId: "bronze_helmet", quantity: 1 },
        bonusChance: 0,
    },
    {
        id: "craft_iron_sword",
        name: "Железный меч",
        stationType: "anvil",
        requiredLevel: 15,
        xpReward: 100,
        inputs: [
            { itemId: "iron_bar", quantity: 6 },
            { itemId: "coal", quantity: 2 },
        ],
        output: { itemId: "iron_sword", quantity: 1 },
        bonusChance: 0.05,
    },
    {
        id: "craft_iron_helmet",
        name: "Железный шлем",
        stationType: "anvil",
        requiredLevel: 12,
        xpReward: 80,
        inputs: [
            { itemId: "iron_bar", quantity: 4 },
            { itemId: "coal", quantity: 1 },
        ],
        output: { itemId: "iron_helmet", quantity: 1 },
        bonusChance: 0.05,
    },
];
