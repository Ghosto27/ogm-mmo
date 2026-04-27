let questDefs: Record<string, { name: string; description: string }> = {};

export function setQuestDefs(defs: Record<string, { name: string; description: string }>) {
    questDefs = defs;
}

export function getQuestName(questId: string): string {
    return questDefs[questId]?.name ?? questId;
}

export function getQuestDescription(questId: string): string {
    return questDefs[questId]?.description ?? '';
}