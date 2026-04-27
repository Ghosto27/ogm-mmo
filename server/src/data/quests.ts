export interface QuestDef {
    id: string;
    name: string;
    description: string;
    objective: 'kill';           // позже можно добавить 'collect', 'talk'
    targetMob: string;          // 'wolf' – идентификатор моба (в Mob.schema добавим тип)
    requiredCount: number;
    rewardXp: number;
    startDialogue: string;      // идентификатор диалога при предложении квеста
    completeDialogue: string;   // идентификатор диалога при сдаче квеста
}

export const quests: Record<string, QuestDef> = {
    kill_5_wolves: {
        id: 'kill_5_wolves',
        name: 'Истребитель волков',
        description: 'Убейте 5 волков в округе.',
        objective: 'kill',
        targetMob: 'wolf',
        requiredCount: 1,
        rewardXp: 200,
        startDialogue: "knight_quest1",
        completeDialogue: "knight_quest1_complete",
    },
    kill_10_wolves: {
        id: 'kill_10_wolves',
        name: 'Гроза волков',
        description: 'Уничтожьте 10 волков.',
        objective: 'kill',
        targetMob: 'wolf',
        requiredCount: 3,
        rewardXp: 500,
        startDialogue: "knight_quest2",
        completeDialogue: "knight_quest2_complete",
    },
};