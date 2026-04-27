import { addMessage } from './chatUI';

let listenersInstalled = false;

export function setupChatListeners(room: any) {
    if (!room || listenersInstalled) return;
    listenersInstalled = true;
    room.onMessage("chatMessage", (data: { senderName: string; text: string; timestamp: number }) => {
        addMessage(data);
    });
}