import { room } from './network';
import { showTooltip, hideTooltip } from './tooltip';
import { pushUIMode, popUIMode } from './cameraControls';

let container: HTMLDivElement;
let isVisible = false;

// Имя, уровень, статы
let nameEl: HTMLElement;
let levelEl: HTMLElement;
let statsEl: HTMLElement;

// Слоты экипировки
const slotDivs: { [slotName: string]: HTMLDivElement } = {};
const slotPositions: { [slotName: string]: { top: string; left: string } } = {
    head:      { top: '10px', left: '20px' },
    chest:     { top: '60px', left: '20px' },
    gloves:    { top: '110px', left: '20px' },
    legs:      { top: '160px', left: '20px' },
    weapon:    { top: '110px', left: '100px' },
    shield:    { top: '160px', left: '100px' },
};

export function createCharacterPanel() {
    container = document.createElement('div');
    container.id = 'character-panel';
    container.style.position = 'absolute';
    container.style.top = '50%';
    container.style.left = '5%';
    container.style.transform = 'translateY(-50%)';
    container.style.width = '320px';
    container.style.background = 'rgba(0, 0, 0, 0.8)';
    container.style.border = '2px solid white';
    container.style.borderRadius = '8px';
    container.style.padding = '10px';
    container.style.display = 'none';
    container.style.zIndex = '1000';
    container.style.color = 'white';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.fontSize = '12px';

    // Заголовок (Имя и уровень)
    const header = document.createElement('div');
    header.style.textAlign = 'center';
    header.style.marginBottom = '8px';
    nameEl = document.createElement('div');
    nameEl.style.fontSize = '16px';
    nameEl.style.fontWeight = 'bold';
    header.appendChild(nameEl);
    levelEl = document.createElement('div');
    levelEl.style.fontSize = '12px';
    levelEl.style.color = '#aaa';
    header.appendChild(levelEl);
    container.appendChild(header);

    // Кукла персонажа (прямоугольник)
    const dummyContainer = document.createElement('div');
    dummyContainer.style.position = 'relative';
    dummyContainer.style.width = '160px';
    dummyContainer.style.height = '220px';
    dummyContainer.style.margin = '0 auto 10px';
    const dummy = document.createElement('div');
    dummy.style.width = '160px';
    dummy.style.height = '220px';
    dummy.style.background = 'rgba(255,255,255,0.1)';
    dummy.style.border = '1px solid #555';
    dummy.style.position = 'absolute';
    dummy.style.top = '50%';
    dummy.style.left = '50%';
    dummy.style.transform = 'translate(-50%, -50%)';
    dummy.style.display = 'flex';
    dummy.style.alignItems = 'center';
    dummy.style.justifyContent = 'center';
    dummy.textContent = '';
    dummyContainer.appendChild(dummy);

    // Слоты экипировки
    Object.keys(slotPositions).forEach(slotName => {
        const pos = slotPositions[slotName];
        const slotDiv = document.createElement('div');
        slotDiv.style.position = 'absolute';
        slotDiv.style.top = pos.top;
        slotDiv.style.left = pos.left;
        slotDiv.style.width = '40px';
        slotDiv.style.height = '40px';
        slotDiv.style.background = 'rgba(255,255,255,0.1)';
        slotDiv.style.border = '1px solid #555';
        slotDiv.style.borderRadius = '4px';
        slotDiv.style.display = 'flex';
        slotDiv.style.alignItems = 'center';
        slotDiv.style.justifyContent = 'center';
        slotDiv.title = getSlotLabel(slotName);
        // Drag & Drop attributes
        slotDiv.dataset.dropzone = 'equipment';
        slotDiv.dataset.equipSlot = slotName;
        slotDiv.dataset.draggable = 'true';
        slotDiv.dataset.sourceType = 'equipment';

        // Обработчики мыши для снятия предмета
        slotDiv.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            if (room) {
                room.send('unequipItem', { slot: slotName });
            }
        });
        slotDiv.addEventListener('mouseenter', (event) => {
            const player = room?.state?.players.get(room.sessionId);
            const item = player?.equipment.get(slotName);
            if (item) showTooltip(event.clientX, event.clientY, item);
        });
        slotDiv.addEventListener('mouseleave', hideTooltip);

        dummyContainer.appendChild(slotDiv);
        slotDivs[slotName] = slotDiv;
    });

    container.appendChild(dummyContainer);

    // Таблица статов
    statsEl = document.createElement('div');
    statsEl.style.fontSize = '11px';
    statsEl.style.lineHeight = '1.5';
    container.appendChild(statsEl);

    document.body.appendChild(container);
}

function getSlotLabel(slot: string): string {
    const labels: { [key: string]: string } = {
        head: 'Голова',
        chest: 'Торс',
        gloves: 'Перчатки',
        legs: 'Ноги',
        weapon: 'Оружие',
        shield: 'Щит',
    };
    return labels[slot] || slot;
}

export function toggleCharacterPanel() {
    isVisible = !isVisible;
    container.style.display = isVisible ? 'block' : 'none';
    if (isVisible) {
        pushUIMode();
    } else {
        popUIMode();
    }
}

export function updateCharacterPanel(player: any) {
    if (!container) return;
    // Имя и уровень
    if (nameEl) nameEl.textContent = player.name;
    if (levelEl) levelEl.textContent = `Уровень ${player.level}`;

    // Слоты экипировки
    Object.keys(slotDivs).forEach(slotName => {
        const slotDiv = slotDivs[slotName];
        slotDiv.innerHTML = '';
        const item = player.equipment?.get(slotName);
        if (item) {
            const icon = document.createElement('div');
            icon.style.width = '30px';
            icon.style.height = '30px';
            icon.style.background = item.id === 'potion_hp_01' ? '#ff5555' : '#55aaff';
            icon.style.borderRadius = '4px';
            icon.textContent = item.name.charAt(0);
            slotDiv.appendChild(icon);
            slotDiv.title = '';
        } else {
            slotDiv.title = getSlotLabel(slotName);
        }
    });

    // Статы
    if (statsEl && player.stats) {
        const s = player.stats;
        statsEl.innerHTML = `
            <div>Сила: ${s.strength}</div>
            <div>Ловкость: ${s.dexterity}</div>
            <div>Интеллект: ${s.intelligence}</div>
            <div>Живучесть: ${s.vitality}</div>
            <div>Удача: ${s.luck}</div>
            <hr style="border-color: #555;">
            <div>Атака: ${s.attackPower}</div>
            <div>Защита: ${s.defense}</div>
            <div>Крит: ${s.critChance.toFixed(1)}%</div>
        `;
    }
}

export const equipmentSlotElements = slotDivs;