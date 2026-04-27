import { addMessage } from './chatUI';
import { showSpeechBubble } from './speechBubble';
import { otherPlayers, localModel } from '../player'; // чтобы получить модель по id
import * as THREE from 'three';

let listenersInstalled = false;

export function setupChatListeners(room: any) {
    if (!room || listenersInstalled) return;
    listenersInstalled = true;

    room.onMessage("chatMessage", (data: { senderId: string; senderName: string; text: string; timestamp: number }) => {
        addMessage(data);

        // Показываем облачко над головой отправителя
        let model: THREE.Object3D | null = null;
        if (data.senderId === room.sessionId) {
            model = localModel;
        } else {
            model = otherPlayers[data.senderId] || null;
        }
        if (model) {
            showSpeechBubble(model, data.text, data.senderId);
        }
    });
}