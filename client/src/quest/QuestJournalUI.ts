import { getQuestName } from './questData';

let container: HTMLDivElement;

export function createQuestJournal() {
    container = document.createElement('div');
    container.id = 'quest-journal';
    container.style.position = 'absolute';
    container.style.right = '20px';
    container.style.top = '60%';
    container.style.width = '300px';
    container.style.background = 'rgba(0,0,0,0.85)';
    container.style.color = 'white';
    container.style.padding = '16px';
    container.style.borderRadius = '8px';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.fontSize = '14px';
    container.style.display = 'none';
    container.style.zIndex = '1002';
    
    const title = document.createElement('div');
    title.textContent = 'Журнал квестов';
    title.style.marginBottom = '8px';
    title.style.fontWeight = 'bold';
    container.appendChild(title);
    
    document.body.appendChild(container);
}

export function toggleQuestJournal() {
    container.style.display = container.style.display === 'none' ? 'block' : 'none';
}

export function updateQuestList(quests: Record<string, number>) {
    container.innerHTML = '<div style="font-weight:bold; margin-bottom:8px;">Журнал квестов</div>';
    const entries = Object.entries(quests);
    if (entries.length === 0) {
        const empty = document.createElement('div');
        empty.textContent = 'Нет активных квестов';
        container.appendChild(empty);
    } else {
        entries.forEach(([questId, progress]) => {
            const div = document.createElement('div');
            const name = getQuestName(questId);
            div.textContent = `${name}: ${progress}`;
            container.appendChild(div);
        });
    }
}