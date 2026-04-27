// server/src/chat/ChatManager.ts
import { Client, Room } from "colyseus";

const MAX_MSG_LENGTH = 200;

export class ChatManager {
    static sanitize(text: string): string {
        return text
            .replace(/<[^>]*>/g, '')   // удаляем HTML‑теги
            .substring(0, MAX_MSG_LENGTH);
    }

    static sendMessage(room: Room, client: Client, message: string) {
        const player = room.state.players.get(client.sessionId);
        if (!player) return;

        const clean = this.sanitize(message);
        if (clean.length === 0) return;

        room.broadcast("chatMessage", {
            senderId: client.sessionId,
            senderName: player.name,
            text: clean,
            timestamp: Date.now()
        });
    }
}