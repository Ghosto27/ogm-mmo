import { room } from '../network';
import { showChatPanel } from './chatUI';

let inputEl: HTMLInputElement;
let isActive = false;

export function createChatInput() {
    inputEl = document.createElement('input');
    inputEl.id = 'chat-input';
    inputEl.type = 'text';
    inputEl.placeholder = 'Нажмите Enter для отправки…';
    inputEl.style.position = 'absolute';
    inputEl.style.bottom = '20px';
    inputEl.style.left = '20px';
    inputEl.style.width = '300px';
    inputEl.style.padding = '6px';
    inputEl.style.background = 'rgba(0,0,0,0.7)';
    inputEl.style.color = 'white';
    inputEl.style.border = '1px solid #555';
    inputEl.style.borderRadius = '4px';
    inputEl.style.outline = 'none';

    inputEl.addEventListener('focus', () => { isActive = true; });
    inputEl.addEventListener('blur', () => { isActive = false; });
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const text = inputEl.value.trim();
            if (text && room) {
                room.send('chatMessage', text);
            }
            inputEl.value = '';
            inputEl.blur();   // возвращаем фокус игре
        }
    });

    // внутри createChatInput()
    inputEl.addEventListener('focus', () => { 
        isActive = true; 
        showChatPanel(); 
    });

    document.body.appendChild(inputEl);
}

export function isChatActive(): boolean {
    return isActive;
}