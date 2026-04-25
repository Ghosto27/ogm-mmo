const WORLD_SIZE = 50;
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let isVisible = false;
let overlayDiv: HTMLDivElement;
const MAX_DIMENSION = 500; // размер стороны карты в пикселях
const SCALE = MAX_DIMENSION / WORLD_SIZE;

export function createWorldMap() {
    overlayDiv = document.createElement('div');
    overlayDiv.id = 'worldmap-overlay';
    overlayDiv.style.position = 'absolute';
    overlayDiv.style.top = '50%';
    overlayDiv.style.left = '50%';
    overlayDiv.style.transform = 'translate(-50%, -50%)';
    overlayDiv.style.zIndex = '1001';
    overlayDiv.style.display = 'none';
    overlayDiv.style.background = 'rgba(0, 0, 0, 0.8)';
    overlayDiv.style.padding = '10px';
    overlayDiv.style.borderRadius = '8px';
    overlayDiv.style.border = '2px solid white';
    overlayDiv.style.pointerEvents = 'auto';

    const title = document.createElement('div');
    title.textContent = 'Карта мира';
    title.style.color = 'white';
    title.style.fontFamily = 'Arial, sans-serif';
    title.style.fontSize = '16px';
    title.style.textAlign = 'center';
    title.style.marginBottom = '8px';
    overlayDiv.appendChild(title);

    canvas = document.createElement('canvas');
    canvas.width = MAX_DIMENSION;
    canvas.height = MAX_DIMENSION;
    canvas.style.display = 'block';
    canvas.style.margin = '0 auto';
    overlayDiv.appendChild(canvas);
    ctx = canvas.getContext('2d')!;

    const closeButton = document.createElement('button');
    closeButton.textContent = 'X';
    closeButton.style.position = 'absolute';
    closeButton.style.top = '5px';
    closeButton.style.right = '5px';
    closeButton.style.background = '#aa0000';
    closeButton.style.color = 'white';
    closeButton.style.border = 'none';
    closeButton.style.borderRadius = '3px';
    closeButton.style.cursor = 'pointer';
    closeButton.onclick = toggleWorldMap;
    overlayDiv.appendChild(closeButton);

    document.body.appendChild(overlayDiv);
}

export function toggleWorldMap() {
    isVisible = !isVisible;
    overlayDiv.style.display = isVisible ? 'block' : 'none';

    // Скрываем/показываем миникарту и координаты
    const miniCanvas = document.querySelector('canvas[style*="right: 20px"]') as HTMLCanvasElement;
    if (miniCanvas) miniCanvas.style.display = isVisible ? 'none' : 'block';
    const coordsText = document.querySelector('div[style*="right: 20px"]') as HTMLDivElement;
    if (coordsText) coordsText.style.display = isVisible ? 'none' : 'block';
}

export function updateWorldMap(
    localX: number,
    localZ: number,
    localRotationY: number,
    otherPlayersData: { x: number; z: number; rotationY: number; visible: boolean }[]
) {
    if (!ctx || !isVisible) return;

    ctx.clearRect(0, 0, MAX_DIMENSION, MAX_DIMENSION);
    ctx.fillStyle = '#2d5a27';
    ctx.fillRect(0, 0, MAX_DIMENSION, MAX_DIMENSION);

    // Сетка
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    const stepWorld = 5;
    const stepPx = stepWorld * SCALE;
    for (let i = stepPx; i < MAX_DIMENSION; i += stepPx) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, MAX_DIMENSION);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(MAX_DIMENSION, i);
        ctx.stroke();
    }

    const centerX = MAX_DIMENSION / 2;
    const centerY = MAX_DIMENSION / 2;
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
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fill();
        if (p.rotationY !== undefined) {
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(px, py);
            const dx = Math.sin(p.rotationY) * 10;
            const dy = Math.cos(p.rotationY) * 10;
            ctx.lineTo(px + dx, py + dy);
            ctx.stroke();
        }
    }

    // Локальный игрок в центре
    const localPX = centerX;
    const localPY = centerY;
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(localPX, localPY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(localPX, localPY);
    const dx = Math.sin(localRotationY) * 16;
    const dy = Math.cos(localRotationY) * 16;
    ctx.lineTo(localPX + dx, localPY + dy);
    ctx.stroke();
}