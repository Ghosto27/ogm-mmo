import { room } from '../network';
import { pushUIMode, popUIMode } from '../cameraControls';

let container: HTMLDivElement;
let isVisible = false;
let miningLevelEl: HTMLSpanElement;
let miningBar: HTMLDivElement;
let miningText: HTMLDivElement;
let bsLevelEl: HTMLSpanElement;
let bsBar: HTMLDivElement;
let bsText: HTMLDivElement;

export function createProfessionsUI() {
    container = document.createElement('div');
    container.id = 'professions-panel';
    container.style.position = 'absolute';
    container.style.top = '50%';
    container.style.right = '10%';
    container.style.transform = 'translate(0%, -50%)';
    container.style.width = '320px';
    container.style.background = 'rgba(0, 0, 0, 0.85)';
    container.style.border = '2px solid #888';
    container.style.borderRadius = '8px';
    container.style.padding = '14px';
    container.style.display = 'none';
    container.style.zIndex = '1000';
    container.style.color = 'white';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.fontSize = '13px';

    const title = document.createElement('div');
    title.textContent = 'Professions';
    title.style.textAlign = 'center';
    title.style.fontWeight = 'bold';
    title.style.fontSize = '16px';
    title.style.marginBottom = '14px';
    container.appendChild(title);

    const miningRow = createProfessionRow('Mining', '#b87333');
    miningLevelEl = miningRow.levelEl;
    miningBar = miningRow.bar;
    miningText = miningRow.text;
    container.appendChild(miningRow.row);

    const bsRow = createProfessionRow('Blacksmithing', '#888888');
    bsLevelEl = bsRow.levelEl;
    bsBar = bsRow.bar;
    bsText = bsRow.text;
    container.appendChild(bsRow.row);

    document.body.appendChild(container);
}

function createProfessionRow(name: string, color: string): {
    row: HTMLDivElement;
    levelEl: HTMLSpanElement;
    bar: HTMLDivElement;
    text: HTMLDivElement;
} {
    const row = document.createElement('div');
    row.style.marginBottom = '12px';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.marginBottom = '4px';

    const label = document.createElement('span');
    label.textContent = name;
    label.style.fontWeight = 'bold';
    header.appendChild(label);

    const levelEl = document.createElement('span');
    levelEl.textContent = 'Lvl 1';
    levelEl.style.color = color;
    header.appendChild(levelEl);

    row.appendChild(header);

    const barBg = document.createElement('div');
    barBg.style.width = '100%';
    barBg.style.height = '14px';
    barBg.style.background = '#333';
    barBg.style.borderRadius = '4px';
    barBg.style.marginBottom = '2px';

    const bar = document.createElement('div');
    bar.style.width = '0%';
    bar.style.height = '100%';
    bar.style.background = color;
    bar.style.borderRadius = '4px';
    barBg.appendChild(bar);

    row.appendChild(barBg);

    const text = document.createElement('div');
    text.style.fontSize = '10px';
    text.style.color = '#aaa';
    text.textContent = '0 / 100 XP';
    row.appendChild(text);

    return { row, levelEl, bar, text };
}

export function toggleProfessions() {
    isVisible = !isVisible;
    container.style.display = isVisible ? 'block' : 'none';
    if (isVisible) {
        pushUIMode();
        refreshProfessions();
    } else {
        popUIMode();
    }
}

export function refreshProfessions() {
    if (!room || !room.sessionId) return;
    const player = room.state?.players?.get(room.sessionId);
    if (!player) return;

    if (player.professions?.mining) {
        const m = player.professions.mining;
        miningLevelEl.textContent = `Lvl ${m.level}`;
        const pct = m.xpToNext > 0 ? (m.xp / m.xpToNext) * 100 : 0;
        miningBar.style.width = `${Math.min(pct, 100)}%`;
        miningText.textContent = `${m.xp} / ${m.xpToNext} XP`;
    }
    if (player.professions?.blacksmithing) {
        const bs = player.professions.blacksmithing;
        bsLevelEl.textContent = `Lvl ${bs.level}`;
        const pct = bs.xpToNext > 0 ? (bs.xp / bs.xpToNext) * 100 : 0;
        bsBar.style.width = `${Math.min(pct, 100)}%`;
        bsText.textContent = `${bs.xp} / ${bs.xpToNext} XP`;
    }
}

export function isProfessionsVisible(): boolean {
    return isVisible;
}
