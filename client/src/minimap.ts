const MAP_SIZE_PX = 200;
const WORLD_SIZE = 50;
const SCALE = MAP_SIZE_PX / WORLD_SIZE;

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let coordsText: HTMLElement;

export function createMinimap() {
    canvas = document.createElement('canvas');
    canvas.width = MAP_SIZE_PX;
    canvas.height = MAP_SIZE_PX;
    canvas.style.position = 'absolute';
    canvas.style.top = '20px';
    canvas.style.right = '20px';
    canvas.style.border = '2px solid rgba(255,255,255,0.5)';
    canvas.style.borderRadius = '4px';
    canvas.style.pointerEvents = 'none';
    document.body.appendChild(canvas);
    // Создаём элемент для координат
    coordsText = document.createElement('div');
    coordsText.style.position = 'absolute';
    coordsText.style.top = `${20 + MAP_SIZE_PX + 4}px`; // прямо под картой
    coordsText.style.right = '20px';
    coordsText.style.color = 'white';
    coordsText.style.fontFamily = 'Arial, sans-serif';
    coordsText.style.fontSize = '11px';
    coordsText.style.textAlign = 'right';
    coordsText.style.pointerEvents = 'none';
    document.body.appendChild(coordsText);

    ctx = canvas.getContext('2d')!;
}

export function updateMinimap(
    localX: number,
    localZ: number,
    localRotationY: number,
    otherPlayersData: { x: number; z: number; rotationY: number; visible: boolean }[],
    mobsData: { x: number; z: number; visible: boolean }[]   // <-- новый параметр
) {
    if (!ctx) return;
    const centerX = MAP_SIZE_PX / 2;
    const centerY = MAP_SIZE_PX / 2;

    ctx.clearRect(0, 0, MAP_SIZE_PX, MAP_SIZE_PX);

    // Фон
    ctx.fillStyle = '#2d5a27';
    ctx.fillRect(0, 0, MAP_SIZE_PX, MAP_SIZE_PX);

    // Сетка
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    const stepWorld = 5;
    const stepPx = stepWorld * SCALE;
    // Смещение сетки в зависимости от позиции игрока
    const offsetX = (-localX * SCALE) % stepPx;
    const offsetZ = (-localZ * SCALE) % stepPx;

    // Вертикальные линии
    for (let i = -stepPx + offsetX; i < MAP_SIZE_PX + stepPx; i += stepPx) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, MAP_SIZE_PX);
        ctx.stroke();
    }
    // Горизонтальные линии
    for (let i = -stepPx + offsetZ; i < MAP_SIZE_PX + stepPx; i += stepPx) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(MAP_SIZE_PX, i);
        ctx.stroke();
    }

    function worldToPixel(x: number, z: number): [number, number] {
        const px = (x - localX) * SCALE + centerX;
        const py = (z - localZ) * SCALE + centerY;
        return [px, py];
    }

    // Другие игроки
    const otherColor = '#3399ff';
    for (const p of otherPlayersData) {
        if (!p.visible) continue;
        const [px, py] = worldToPixel(p.x, p.z);
        ctx.fillStyle = otherColor;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
        if (p.rotationY !== undefined) {
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(px, py);
            const dx = Math.sin(p.rotationY) * 6;
            const dy = Math.cos(p.rotationY) * 6;
            ctx.lineTo(px + dx, py + dy);
            ctx.stroke();
        }
    }

    // Мобы (красные)
    const mobColor = '#ff3333';   // ярко-красный
    for (const m of mobsData) {
        if (!m.visible) continue;
        const [px, py] = worldToPixel(m.x, m.z);
        ctx.fillStyle = mobColor;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // Локальный игрок
    // Локальный игрок всегда в центре карты
    const localPX = centerX;
    const localPY = centerY;
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(localPX, localPY, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(localPX, localPY);
    const localDX = Math.sin(localRotationY) * 10;
    const localDY = Math.cos(localRotationY) * 10;
    ctx.lineTo(localPX + localDX, localPY + localDY);
    ctx.stroke();
    // Обновляем координаты под картой
    if (coordsText) {
        coordsText.textContent = `X: ${localX.toFixed(1)}  Z: ${localZ.toFixed(1)}`;
    }
}