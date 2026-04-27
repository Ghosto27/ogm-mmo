export interface DialogueNode {
    npcLine: string;
    choices: {
        text: string;
        nextId: string | null;           // null – конец диалога
        consequences?: {
            type: 'giveQuest' | 'completeQuest' | 'reward';
            questId?: string;
            rewardXp?: number;
        }[];
    }[];
}

export const dialogs: Record<string, DialogueNode> = {
    "knight_quest1": {
        npcLine: "Оборотни-волки нападают на караваны. Убей 5 штук – получишь награду.",
        choices: [
            { text: "Я согласен", nextId: "knight_quest1_accept",
              consequences: [{ type: 'giveQuest', questId: 'kill_5_wolves' }] },
            { text: "Пожалуй, откажусь", nextId: null }
        ]
    },
    "knight_quest1_accept": {
        npcLine: "Отлично! Как выполнишь – возвращайся.",
        choices: [
            { text: "Обязательно вернусь", nextId: null }
        ]
    },
    "knight_quest1_complete": {
        npcLine: "Ты сдержал слово! Вот твоя награда.",
        choices: [
            { text: "Спасибо", nextId: null,
              consequences: [{ type: 'completeQuest', questId: 'kill_5_wolves' }] }
        ]
    },
    "knight_quest2": {
        npcLine: "Оборотни-волки нападают на караваны. Убей 5 штук – получишь награду.",
        choices: [
            { text: "Я согласен", nextId: "knight_quest2_accept",
              consequences: [{ type: 'giveQuest', questId: 'kill_10_wolves' }] },
            { text: "Пожалуй, откажусь", nextId: null }
        ]
    },
    "knight_quest2_accept": {
        npcLine: "Отлично! Как выполнишь – возвращайся.",
        choices: [
            { text: "Обязательно вернусь", nextId: null }
        ]
    },
    "knight_quest2_complete": {
        npcLine: "Ты уничтожил 10 волков! Держи награду.",
        choices: [
            { text: "Спасибо", nextId: null,
            consequences: [{ type: 'completeQuest', questId: 'kill_10_wolves' }] }
        ]
    },
    "knight_idle": {
        npcLine: "Пока мне нечего тебе предложить. Возвращайся позже.",
        choices: [{ text: "Хорошо", nextId: null }]
    },
    // Можно добавить ещё веток
};