import { heightmapData, terrainWidth, terrainDepth } from './render/TerrainRenderer';

const MAP_SIZE_PX = 256;          // размер canvas в пикселях
//let WORLD_SIZE = 2048;            // будет обновлено из terrainWidth
export let fullMapCanvas: HTMLCanvasElement | null = null;
let lastHeightmapKey = '';
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let coordsText: HTMLElement;

// Вспомогательные функции для цвета
function lerpColor(color1: string, color2: string, t: number): string {
    const c1 = hexToRgb(color1);
    const c2 = hexToRgb(color2);
    const r = Math.round(c1.r + (c2.r - c1.r) * t);
    const g = Math.round(c1.g + (c2.g - c1.g) * t);
    const b = Math.round(c1.b + (c2.b - c1.b) * t);
    return `rgb(${r},${g},${b})`;
}
function hexToRgb(hex: string) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

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

    coordsText = document.createElement('div');
    coordsText.style.position = 'absolute';
    coordsText.style.top = `${20 + MAP_SIZE_PX + 4}px`;
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
    localX: number, localZ: number, localRotationY: number,
    otherPlayersData: { x: number; z: number; rotationY: number; visible: boolean }[],
    mobsData: { x: number; z: number; visible: boolean }[],
    npcsData: { x: number; z: number; visible: boolean }[]
) {
    if (!ctx) return;

    const WORLD_SIZE = terrainWidth > 0 ? terrainWidth : 2048;
    const VIEW_SIZE = 512;                  // сколько метров показывать вокруг игрока
    const SCALE = MAP_SIZE_PX / VIEW_SIZE;  // пикселей на метр
    const centerX = MAP_SIZE_PX / 2;
    const centerY = MAP_SIZE_PX / 2;

    // ---------- 1. Статическая карта высот ----------
    if (heightmapData && WORLD_SIZE > 0) {
        const currentKey = `${WORLD_SIZE}_${terrainDepth}_${heightmapData.width}_${heightmapData.height}`;
        if (currentKey !== lastHeightmapKey || !fullMapCanvas) {
            fullMapCanvas = document.createElement('canvas');
            fullMapCanvas.width = heightmapData.width;
            fullMapCanvas.height = heightmapData.height;
            const fullCtx = fullMapCanvas.getContext('2d')!;

            const imgData = fullCtx.createImageData(heightmapData.width, heightmapData.height);
            for (let i = 0; i < heightmapData.data.length; i += 4) {
                const r = heightmapData.data[i];
                const normalized = r / 255;
                let colorR, colorG, colorB;
                if (normalized < 0.1) {
                    colorR = 58; colorG = 157; colorB = 35;
                } else if (normalized < 0.3) {
                    const t = (normalized - 0.3) / 0.3;
                    colorR = Math.round(139 + (194 - 139) * t);
                    colorG = Math.round(191 + (178 - 191) * t);
                    colorB = Math.round(58 + (128 - 58) * t);
                } else {
                    const t = (normalized - 0.6) / 0.4;
                    colorR = Math.round(194 + (139 - 194) * t);
                    colorG = Math.round(178 + (90 - 178) * t);
                    colorB = Math.round(128 + (43 - 128) * t);
                }
                imgData.data[i] = colorR;
                imgData.data[i+1] = colorG;
                imgData.data[i+2] = colorB;
                imgData.data[i+3] = 255;
            }
            fullCtx.putImageData(imgData, 0, 0);
            lastHeightmapKey = currentKey;
        }
    }

  // ---------- 2. Очистка и фон ----------
    ctx.clearRect(0, 0, MAP_SIZE_PX, MAP_SIZE_PX);

    // Рисуем фон (пустоту) за границами мира
    ctx.fillStyle = '#1a1a2e';  // тёмный фон для пустоты
    ctx.fillRect(0, 0, MAP_SIZE_PX, MAP_SIZE_PX);

    if (fullMapCanvas) {
        const worldLeft = localX - VIEW_SIZE / 2;
        const worldTop = localZ - VIEW_SIZE / 2;

        // UV-координаты: 0 = левый/верхний край мира, 1 = правый/нижний
        const uMin = (worldLeft / WORLD_SIZE) + 0.5;
        const vMin = (worldTop / WORLD_SIZE) + 0.5;
        const uMax = uMin + VIEW_SIZE / WORLD_SIZE;
        const vMax = vMin + VIEW_SIZE / WORLD_SIZE;

        // Размер одного UV-юнита в пикселях fullMapCanvas
        const canvasW = fullMapCanvas.width;
        const canvasH = fullMapCanvas.height;

        // Регион-источник в fullMapCanvas (с обрезкой)
        const srcX = Math.max(0, Math.floor(uMin * (canvasW - 1)));
        const srcY = Math.max(0, Math.floor(vMin * (canvasH - 1)));
        const srcW = Math.min(canvasW - 1, Math.ceil(uMax * (canvasW - 1))) - srcX;
        const srcH = Math.min(canvasH - 1, Math.ceil(vMax * (canvasH - 1))) - srcY;

        // Масштаб: сколько пикселей миникарты приходится на один пиксель fullMapCanvas
        const scaleX = MAP_SIZE_PX / (VIEW_SIZE / WORLD_SIZE) / canvasW;
        const scaleY = MAP_SIZE_PX / (VIEW_SIZE / WORLD_SIZE) / canvasH;

        // Размеры региона назначения на миникарте
        const dstW = srcW * scaleX;
        const dstH = srcH * scaleY;

        // Смещение, чтобы карта рисовалась в правильной позиции даже при частичном выходе за границы
        const dstX = uMin >= 0 ? 0 : -uMin * (MAP_SIZE_PX / (VIEW_SIZE / WORLD_SIZE));
        const dstY = vMin >= 0 ? 0 : -vMin * (MAP_SIZE_PX / (VIEW_SIZE / WORLD_SIZE));

        // Рисуем только видимую часть карты высот
        if (srcW > 0 && srcH > 0) {
            ctx.drawImage(
                fullMapCanvas,
                srcX, srcY, srcW, srcH,
                dstX, dstY, dstW, dstH
            );
        }
    }

    // ---------- 3. Сетка ----------
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 0.5;
    const stepWorld = 50;
    const stepPx = stepWorld * SCALE;
    const offsetX = (-localX * SCALE) % stepPx;
    const offsetZ = (-localZ * SCALE) % stepPx;
    for (let i = -stepPx + offsetX; i < MAP_SIZE_PX + stepPx; i += stepPx) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, MAP_SIZE_PX);
        ctx.stroke();
    }
    for (let i = -stepPx + offsetZ; i < MAP_SIZE_PX + stepPx; i += stepPx) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(MAP_SIZE_PX, i);
        ctx.stroke();
    }

    // ---------- 4. Объекты ----------
    function worldToPixel(x: number, z: number): [number, number] {
        const px = (x - localX) * SCALE + centerX;
        const py = (z - localZ) * SCALE + centerY;
        return [px, py];
    }

    // --- Отладочная метка: центр мира (0,0) ---
    const [zeroX, zeroZ] = worldToPixel(0, 0);
    if (zeroX >= -10 && zeroX <= MAP_SIZE_PX + 10 && zeroZ >= -10 && zeroZ <= MAP_SIZE_PX + 10) {
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(zeroX, zeroZ, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'black';
        ctx.font = '8px monospace';
        ctx.fillText('ORIGIN', zeroX + 7, zeroZ);
    }

    // Другие игроки
    ctx.fillStyle = '#3399ff';
    for (const p of otherPlayersData) {
        if (!p.visible) continue;
        const [px, py] = worldToPixel(p.x, p.z);
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
        if (p.rotationY !== undefined) {
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + Math.sin(p.rotationY) * 6, py + Math.cos(p.rotationY) * 6);
            ctx.stroke();
        }
    }

    // Мобы
    ctx.fillStyle = '#ff3333';
    for (const m of mobsData) {
        if (!m.visible) continue;
        const [px, py] = worldToPixel(m.x, m.z);
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // NPC (жёлтые)
    const npcColor = '#FFFF00';
    for (const n of npcsData) {
        if (!n.visible) continue;
        const [px, py] = worldToPixel(n.x, n.z);
        ctx.fillStyle = npcColor;
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fill();
    }

    // Локальный игрок
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + Math.sin(localRotationY) * 10, centerY + Math.cos(localRotationY) * 10);
    ctx.stroke();

    if (coordsText) {
        coordsText.textContent = `X: ${localX.toFixed(1)}  Z: ${localZ.toFixed(1)}`;
    }
}