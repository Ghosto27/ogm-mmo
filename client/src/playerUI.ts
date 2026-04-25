let hpText: HTMLElement;

export function createPlayerUI(playerName: string, level: number) {
    const container = document.createElement('div');
    container.id = 'player-panel';
    container.style.position = 'absolute';
    container.style.top = '20px';
    container.style.left = '20px';
    container.style.color = 'white';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.background = 'rgba(0,0,0,0.7)';
    container.style.fontSize = '14px';
    container.style.pointerEvents = 'none'; // не мешает кликам по сцене
    container.style.padding = '8px';
    container.style.borderRadius = '4px'; 

    const nameEl = document.createElement('div');
    nameEl.textContent = `${playerName} (ур. ${level})`;
    container.appendChild(nameEl);

    hpText = document.createElement('div');
    hpText.id = 'hp-display';
    container.appendChild(hpText);

    document.body.appendChild(container);
}

export function updatePlayerUI(hp: number, maxHp: number, level: number) {
    if (hpText) {
        hpText.textContent = `❤️ ${hp}/${maxHp}`;
    }
    // Если нужно обновлять уровень
    const nameEl = document.querySelector('#player-panel div:first-child');
    if (nameEl) {
        nameEl.textContent = `${localStorage.getItem('ogm_playerName') || 'Герой'} (ур. ${level})`;
    }
}