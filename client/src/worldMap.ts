// worldMap.ts — большая карта (M) с отображением heightmap из TerrainRenderer

import {
    terrainWidth,
    terrainDepth
} from './render/TerrainRenderer';
import { fullMapCanvas } from './minimap';

// ---------- Константы ----------
const MAX_DIMENSION = 1024;          // размер канваса в пикселях
const VIEW_SIZE = 1500;               // сколько игровых единиц видно на карте (как в миникарте)

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let isVisible = false;
let overlayDiv: HTMLDivElement;

// Динамические размеры мира (будут актуализированы после загрузки террейна)
let worldWidth = 50;
let worldDepth = 50;
let scale = MAX_DIMENSION / VIEW_SIZE;

// ---------- Создание ----------

export function createWorldMap() {
    overlayDiv = document.createElement('div');
    Object.assign(overlayDiv.style, {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: '1001',
        display: 'none',
        background: 'rgba(0, 0, 0, 0.8)',
        padding: '10px',
        borderRadius: '8px',
        border: '2px solid white',
        pointerEvents: 'auto',
    });
    overlayDiv.id = 'worldmap-overlay';

    const title = document.createElement('div');
    title.textContent = 'Карта мира';
    Object.assign(title.style, {
        color: 'white',
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        textAlign: 'center',
        marginBottom: '8px',
    });
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
    Object.assign(closeButton.style, {
        position: 'absolute',
        top: '5px',
        right: '5px',
        background: '#aa0000',
        color: 'white',
        border: 'none',
        borderRadius: '3px',
        cursor: 'pointer',
    });
    closeButton.onclick = toggleWorldMap;
    overlayDiv.appendChild(closeButton);

    document.body.appendChild(overlayDiv);
    // fullMapCanvas будет построен при первом открытии (если данные террейна уже готовы)
}

// ---------- Управление видимостью ----------

export function toggleWorldMap() {
    isVisible = !isVisible;
    overlayDiv.style.display = isVisible ? 'block' : 'none';

    // Скрываем миникарту и координаты (если есть)
    const miniCanvas = document.querySelector('canvas[style*="right: 20px"]') as HTMLCanvasElement;
    if (miniCanvas) miniCanvas.style.display = isVisible ? 'none' : 'block';
    const coordsText = document.querySelector('div[style*="right: 20px"]') as HTMLDivElement;
    if (coordsText) coordsText.style.display = isVisible ? 'none' : 'block';
}

// ---------- Главное обновление ----------

export function updateWorldMap(
    localX: number, localZ: number, localRotationY: number,
    otherPlayersData: { x: number; z: number; rotationY: number; visible: boolean }[],
    mobsData: { x: number; z: number; visible: boolean }[],
    npcsData: { x: number; z: number; visible: boolean }[]
) {
    if (!ctx || !isVisible) return;

    // Актуализируем размеры мира
    worldWidth = terrainWidth || 50;
    worldDepth = terrainDepth || 50;
    scale = MAX_DIMENSION / VIEW_SIZE;

    ctx.clearRect(0, 0, MAX_DIMENSION, MAX_DIMENSION);

    // Фон
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, MAX_DIMENSION, MAX_DIMENSION);

    // Рисуем фрагмент карты высот
    if ( fullMapCanvas ) {
        drawHeightmapFragment(localX, localZ);
    }

    // Сетка
    drawGrid(localX, localZ);

    // Маркеры
    const centerX = MAX_DIMENSION / 2;
    const centerY = MAX_DIMENSION / 2;

    // Центр деревни (0,0,0)
    const [originPX, originPY] = worldToPixel(0, 0, localX, localZ, centerX, centerY);
    drawOriginMarker([originPX, originPY]);

    // Локальный игрок
    drawPlayerMarker(centerX, centerY, localRotationY, '#ffcc00', 8, 16);

    // Другие игроки
    for (const p of otherPlayersData) {
        if (!p.visible) continue;
        const [px, py] = worldToPixel(p.x, p.z, localX, localZ, centerX, centerY);
        drawPlayerMarker(px, py, p.rotationY, '#3399ff', 6, 10);
    }

    // Мобы
    for (const m of mobsData) {
        if (!m.visible) continue;
        const [px, py] = worldToPixel(m.x, m.z, localX, localZ, centerX, centerY);
        ctx.fillStyle = '#ff3333';
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
    }

    // NPC (жёлтые)
    const npcColor = '#FFFF00';
    for (const n of npcsData) {
        if (!n.visible) continue;
        const [px, py] = worldToPixel(n.x, n.z, localX, localZ, centerX, centerY);
        ctx.fillStyle = npcColor;
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ---------- Вспомогательные методы ----------

function worldToPixel(worldX: number, worldZ: number, localX: number, localZ: number, centerX: number, centerY: number): [number, number] {
    const px = centerX + (worldX - localX) * scale;
    const py = centerY + (worldZ - localZ) * scale;   // убрали минус, как в minimap
    return [px, py];
}

function drawHeightmapFragment(localX: number, localZ: number) {
    if (!fullMapCanvas) return;

    const imgW = fullMapCanvas.width;
    const imgH = fullMapCanvas.height;

    // Как в minimap: worldTop = localZ - VIEW_SIZE/2 (север будет "внизу", синхронизируемся)
    const worldLeft = localX - VIEW_SIZE / 2;
    const worldTop = localZ - VIEW_SIZE / 2;

    const uMin = (worldLeft / worldWidth) + 0.5;
    const vMin = (worldTop / worldDepth) + 0.5;
    const uMax = uMin + VIEW_SIZE / worldWidth;
    const vMax = vMin + VIEW_SIZE / worldDepth;

    const srcX = Math.max(0, Math.floor(uMin * (imgW - 1)));
    const srcY = Math.max(0, Math.floor(vMin * (imgH - 1)));
    const srcW = Math.min(imgW - 1, Math.ceil(uMax * (imgW - 1))) - srcX;
    const srcH = Math.min(imgH - 1, Math.ceil(vMax * (imgH - 1))) - srcY;

    // Масштаб пикселей fullMapCanvas в канвас
    const scaleX = MAX_DIMENSION / (VIEW_SIZE / worldWidth) / imgW;
    const scaleY = MAX_DIMENSION / (VIEW_SIZE / worldDepth) / imgH;

    const dstW = srcW * scaleX;
    const dstH = srcH * scaleY;

    // Смещение, чтобы карта правильно позиционировалась даже при обрезке
    const dstX = uMin >= 0 ? 0 : -uMin * (MAX_DIMENSION / (VIEW_SIZE / worldWidth));
    const dstY = vMin >= 0 ? 0 : -vMin * (MAX_DIMENSION / (VIEW_SIZE / worldDepth));

    if (srcW > 0 && srcH > 0) {
        ctx.drawImage(fullMapCanvas, srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH);
    }
}

function drawGrid(localX: number, localZ: number) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    const stepWorld = 5;
    const stepPx = stepWorld * scale;

    const startWorldX = localX - VIEW_SIZE / 2;
    for (let wx = Math.ceil(startWorldX / stepWorld) * stepWorld; wx <= localX + VIEW_SIZE / 2; wx += stepWorld) {
        const x = ((wx - localX) * scale) + MAX_DIMENSION / 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, MAX_DIMENSION);
        ctx.stroke();
    }

    const startWorldZ = localZ - VIEW_SIZE / 2;
    for (let wz = Math.ceil(startWorldZ / stepWorld) * stepWorld; wz <= localZ + VIEW_SIZE / 2; wz += stepWorld) {
        const y = MAX_DIMENSION / 2 + (wz - localZ) * scale;   // убрали минус
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(MAX_DIMENSION, y);
        ctx.stroke();
    }
}

function drawPlayerMarker(px: number, py: number, rotationY: number, color: string, radius: number, dirLength: number) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    const dx = Math.sin(rotationY) * dirLength;
    const dy = Math.cos(rotationY) * dirLength; // ось Y canvas вниз
    ctx.lineTo(px + dx, py + dy);
    ctx.stroke();
}

function drawOriginMarker(originPixel: [number, number]) {
    const [px, py] = originPixel;
    const size = 10;
    ctx.save();
    ctx.fillStyle = '#FFD700'; // золотой
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    // рисуем ромб
    ctx.beginPath();
    ctx.moveTo(px, py - size);
    ctx.lineTo(px + size, py);
    ctx.lineTo(px, py + size);
    ctx.lineTo(px - size, py);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // буква "O" в центре (опционально)
    ctx.fillStyle = '#000';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('O', px, py);
    ctx.restore();
}