let targetPanel: HTMLElement;
let hpText: HTMLElement;

export function createTargetUI() {
    targetPanel = document.createElement('div');
    targetPanel.id = 'target-panel';
    targetPanel.style.position = 'absolute';
    targetPanel.style.top = '20px';  // ниже своей панели
    targetPanel.style.left = '250px';
    targetPanel.style.color = '#ffd700';
    targetPanel.style.fontFamily = 'Arial, sans-serif';
    targetPanel.style.fontSize = '14px';
    targetPanel.style.background = 'rgba(0,0,0,0.7)';
    targetPanel.style.padding = '8px';
    targetPanel.style.borderRadius = '4px';
    targetPanel.style.display = 'none';
    targetPanel.style.pointerEvents = 'none';
    
    const nameEl = document.createElement('div');
    nameEl.id = 'target-name';
    targetPanel.appendChild(nameEl);
    
    hpText = document.createElement('div');
    hpText.id = 'target-hp';
    targetPanel.appendChild(hpText);
    
    document.body.appendChild(targetPanel);
}

export function showTargetUI(name: string, level: number, hp: number, maxHp: number) {
    if (!targetPanel) return;
    const nameEl = document.getElementById('target-name');
    if (nameEl) nameEl.textContent = `${name} (ур. ${level})`;
    if (hpText) hpText.textContent = `❤️ ${hp}/${maxHp}`;
    targetPanel.style.display = 'block';
}

export function updateTargetHP(hp: number, maxHp: number) {
    if (!hpText) return;
    if (hpText) hpText.textContent = `❤️ ${hp}/${maxHp}`;
}

export function hideTargetUI() {
    if (!targetPanel) return;
    targetPanel.style.display = 'none';
}