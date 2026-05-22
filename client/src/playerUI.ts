let hpText: HTMLElement;
let expBar: HTMLElement;
let expText: HTMLElement;
let goldText: HTMLElement;

export function createPlayerUI(playerName: string, level: number) {
    const container = document.createElement('div');
    container.id = 'player-panel';
    container.style.position = 'absolute';
    container.style.top = '20px';
    container.style.left = '20px';
    container.style.color = 'white';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.fontSize = '14px';
    container.style.pointerEvents = 'none';
    container.style.background = 'rgba(0,0,0,0.7)';
    container.style.padding = '8px';
    container.style.borderRadius = '4px'; 

    const nameEl = document.createElement('div');
    nameEl.textContent = `${playerName} (ур. ${level})`;
    container.appendChild(nameEl);

    hpText = document.createElement('div');
    hpText.id = 'hp-display';
    container.appendChild(hpText);

    // Контейнер для опыта
    const expContainer = document.createElement('div');
    expContainer.style.width = '200px';
    expContainer.style.height = '12px';
    expContainer.style.background = '#333';
    expContainer.style.borderRadius = '4px';
    expContainer.style.marginTop = '4px';

    expBar = document.createElement('div');
    expBar.style.width = '0%';
    expBar.style.height = '100%';
    expBar.style.background = '#ffaa00';
    expBar.style.borderRadius = '4px';
    expContainer.appendChild(expBar);

    container.appendChild(expContainer);

    expText = document.createElement('div');
    expText.style.fontSize = '10px';
    expText.style.color = '#aaa';
    container.appendChild(expText);

    goldText = document.createElement('div');
    goldText.style.fontSize = '12px';
    goldText.style.color = '#ffd700';
    goldText.style.marginTop = '4px';
    goldText.textContent = '💰 0';
    container.appendChild(goldText);

    document.body.appendChild(container);
}

export function updatePlayerUI(hp: number, maxHp: number, level: number, exp: number, expToLevel: number, gold?: number) {
    if (hpText) {
        hpText.textContent = `❤️ ${hp}/${maxHp}`;
    }
    const nameEl = document.querySelector('#player-panel div:first-child');
    if (nameEl) {
        nameEl.textContent = `${localStorage.getItem('ogm_playerName') || 'Герой'} (ур. ${level})`;
    }
    if (expBar && expText) {
        const percent = (exp / expToLevel) * 100;
        expBar.style.width = `${percent}%`;
        expText.textContent = `Опыт: ${exp}/${expToLevel}`;
    }
    if (goldText && gold !== undefined) {
        goldText.textContent = `💰 ${gold}`;
    }
}