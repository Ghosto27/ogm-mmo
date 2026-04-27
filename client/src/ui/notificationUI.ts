let container: HTMLDivElement;
const notifications: HTMLDivElement[] = [];

export function createNotificationUI() {
    container = document.createElement('div');
    container.id = 'notification-area';
    container.style.position = 'absolute';
    container.style.right = '20px';
    container.style.top = '30%';
    container.style.width = '260px';
    container.style.display = 'flex';
    container.style.flexDirection = 'column-reverse'; // новые снизу, старые уходят вверх
    container.style.gap = '8px';
    container.style.zIndex = '2000';
    container.style.pointerEvents = 'none';   // не мешает кликам по сцене
    document.body.appendChild(container);
}

export function showNotification(text: string, duration = 3000) {
    const div = document.createElement('div');
    div.textContent = text;
    div.style.background = 'rgba(0, 0, 0, 0.8)';
    div.style.color = '#ffd700';  // золотистый текст
    div.style.padding = '8px 12px';
    div.style.borderRadius = '4px';
    div.style.fontFamily = 'Arial, sans-serif';
    div.style.fontSize = '13px';
    div.style.transition = 'opacity 0.4s';
    div.style.pointerEvents = 'auto'; // чтобы можно было навести и прочитать
    container.appendChild(div);
    notifications.push(div);

    // Ограничим количество видимых уведомлений (не более 5)
    if (notifications.length > 5) {
        const oldest = notifications.shift();
        if (oldest && oldest.parentElement) {
            oldest.parentElement.removeChild(oldest);
        }
    }

    // Автоматическое исчезновение
    setTimeout(() => {
        div.style.opacity = '0';
        setTimeout(() => {
            if (div.parentElement) div.parentElement.removeChild(div);
            const idx = notifications.indexOf(div);
            if (idx !== -1) notifications.splice(idx, 1);
        }, 400); // ждём завершения анимации
    }, duration);
}