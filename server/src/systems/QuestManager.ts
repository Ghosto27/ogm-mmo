import { Client, Room } from "colyseus";
import { Player } from "../MyRoom";
import { quests } from "../data/quests";
import type { MyRoom } from "../MyRoom";

export class QuestManager {
    static giveQuest(player: Player, questId: string): boolean {
        if (!quests[questId]) return false;
        if (player.questProgress.has(questId)) return false;
        player.questProgress.set(questId, 0);
        console.log(`[QUEST] ${player.name} получил квест "${quests[questId].name}"`);
        return true;
    }

    static completeQuest(room: Room, player: Player, questId: string): boolean {
        const questDef = quests[questId];
        if (!questDef) return false;
        const progress = player.questProgress?.get(questId) ?? 0;
        if (progress >= questDef.requiredCount) {
            player.questProgress!.delete(questId);
            (room as MyRoom).addExperience(player, questDef.rewardXp);
            const client = room.clients.find((c: Client) => c.sessionId === player.sessionId);
            if (client) {
                client.send("questCompleted", { questId, name: questDef.name, rewardXp: questDef.rewardXp });
            }
            console.log(`[QUEST] ${player.name} завершил квест "${questDef.name}" и получил ${questDef.rewardXp} XP`);
            return true;
        }
        return false;
    }

    static onMobKilled(room: Room, player: Player, mobType: string): void {
        if (!player.questProgress) return;
        for (const [questId, count] of player.questProgress.entries()) {
            const def = quests[questId];
            if (def && def.objective === 'kill' && def.targetMob === mobType) {
                player.questProgress.set(questId, count + 1);
                const newCount = count + 1;
                console.log(`[QUEST] ${player.name}: прогресс квеста "${def.name}" ${newCount}/${def.requiredCount}`);
                const client = room.clients.find((c: Client) => c.sessionId === player.sessionId);
                if (client) {
                    client.send("questProgress", { questId, current: newCount, required: def.requiredCount });
                }
            }
        }
    }
}