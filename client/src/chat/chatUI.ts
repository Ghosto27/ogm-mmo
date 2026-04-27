import { isChatActive } from './chatInput';

interface ChatMessage {
    senderName: string;
    text: string;
    timestamp: number;
}

let hideTimer: number | undefined;
const messagesContainer = document.createElement('div');
const messageList = document.createElement('ul');


function resetHideTimer() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
        if (!isChatActive()) {
            messagesContainer.style.display = 'none';
        } else {
            resetHideTimer(); // чат активен — продлеваем
        }
    }, 10000);
}

export function showChatPanel() {
    messagesContainer.style.display = 'block';
    resetHideTimer();
}

export function hideChatPanel() {
    messagesContainer.style.display = 'none';
    if (hideTimer) clearTimeout(hideTimer);
}

function initUI() {
    messagesContainer.id = 'chat-panel';
    messagesContainer.style.position = 'absolute';
    messagesContainer.style.bottom = '60px';
    messagesContainer.style.left = '20px';
    messagesContainer.style.width = '300px';
    messagesContainer.style.maxHeight = '200px';
    messagesContainer.style.overflowY = 'auto';
    messagesContainer.style.background = 'rgba(0,0,0,0.7)';
    messagesContainer.style.color = 'white';
    messagesContainer.style.fontFamily = 'Arial, sans-serif';
    messagesContainer.style.fontSize = '12px';
    messagesContainer.style.padding = '8px';
    messagesContainer.style.borderRadius = '4px';
    messagesContainer.style.display = 'none';   // показываем только когда есть сообщения

    messageList.style.listStyle = 'none';
    messageList.style.margin = '0';
    messageList.style.padding = '0';

    messagesContainer.appendChild(messageList);
    document.body.appendChild(messagesContainer);
}

let messageCount = 0;
const MAX_VISIBLE = 20;   // последние 20 сообщений

export function addMessage(msg: ChatMessage) {

    showChatPanel();
    if (messagesContainer.style.display === 'none') {
        messagesContainer.style.display = 'block';
    }

    const li = document.createElement('li');
    const time = new Date(msg.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    li.textContent = `[${time}] ${msg.senderName}: ${msg.text}`;
    li.style.padding = '2px 0';
    messageList.appendChild(li);

    // Удаляем старые сообщения сверх лимита
    if (++messageCount > MAX_VISIBLE) {
        const first = messageList.firstChild;
        if (first) messageList.removeChild(first);
        messageCount--;
    }

    // Автопрокрутка вниз
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

initUI();