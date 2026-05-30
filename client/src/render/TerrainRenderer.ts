import * as THREE from 'three';
import { scene } from '../scene';
import type { BrushState } from '../editor/TerrainEditor';
import { SERVER_URL } from '../config';

export let terrainMesh: THREE.Mesh | null = null;
let lastTerrainKey: string = '';
export let heightmapData: { data: Uint8ClampedArray; width: number; height: number } | null = null;

// Храним текущие параметры ландшафта для быстрого доступа
export let terrainWidth = 0;
export let terrainDepth = 0;
export let terrainMaxHeight = 0;
let imageWidth = 0;
let imageHeight = 0;

// Буфер высот (129×129) для редактирования
let vertexHeightBuffer: Float32Array | null = null;
let terrainSegments = 0;

// Splatmap (256×256, RGBA) — DataTexture (без premultiplied alpha)
const SPLATMAP_SIZE = 512;
let splatData: Uint8Array | null = null;
let splatTexture: THREE.DataTexture | null = null;

let terrainReadyResolve: () => void;
export const terrainReady = new Promise<void>((resolve) => {
    terrainReadyResolve = resolve;
});

function loadTexture(url: string): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
        const loader = new THREE.TextureLoader();
        loader.load(
            url,
            (tex) => {
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                resolve(tex);
            },
            undefined,
            reject
        );
    });
}

export function updateTerrain(terrain: any) {
    if (!terrain) return;

    const currentKey = `${terrain.heightmapPath}_${terrain.width}_${terrain.depth}_${terrain.segments}_${terrain.maxHeight}`;
    if (currentKey === lastTerrainKey) return;
    lastTerrainKey = currentKey;

    if (terrainMesh) {
        scene.remove(terrainMesh);
        terrainMesh = null;
    }

    const geometry = new THREE.PlaneGeometry(terrain.width, terrain.depth, terrain.segments, terrain.segments);
    geometry.rotateX(-Math.PI / 2);

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, image.width, image.height).data;

        // Сохраняем данные для быстрого сэмплирования
        heightmapData = { data, width: image.width, height: image.height };
        imageWidth = image.width;
        imageHeight = image.height;
    terrainWidth = terrain.width;
    terrainDepth = terrain.depth;
    terrainMaxHeight = terrain.maxHeight;
    terrainSegments = terrain.segments;

    // Инициализируем буфер высот
    const numVertices = (terrain.segments + 1) * (terrain.segments + 1);
    vertexHeightBuffer = new Float32Array(numVertices);

        const vertices = geometry.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            const uvIndex = Math.floor(i / 3);
            const u = (uvIndex % (terrain.segments + 1)) / terrain.segments;
            const v = Math.floor(uvIndex / (terrain.segments + 1)) / terrain.segments;

            const px = Math.min(Math.floor(u * image.width), image.width - 1);
            const py = Math.min(Math.floor(v * image.height), image.height - 1);
            const pixelIndex = (py * image.width + px) * 4;
            const r = data[pixelIndex];

            const h = (r / 255) * terrain.maxHeight;
            vertices[i + 1] = h;
            if (vertexHeightBuffer) {
                vertexHeightBuffer[Math.floor(i / 3)] = h;
            }
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();

        // Инициализируем сплатмап (256×256)
        initSplatmap();

        const textureGrass = loadTexture('/textures/grass.jpg');
        const textureDirt  = loadTexture('/textures/cliff.jpg');
        const textureRock  = loadTexture('/textures/rock.jpg');
        const textureSand  = loadTexture('/textures/sand.jpg');

        Promise.all([textureGrass, textureDirt, textureRock, textureSand])
            .then(([grass, dirt, rock, sand]) => {
                const tiling = 100.0;
                const material = new THREE.ShaderMaterial({
                    uniforms: {
                        tex0: { value: grass },
                        tex1: { value: dirt },
                        tex2: { value: rock },
                        tex3: { value: sand },
                        splatMap: { value: splatTexture },
                        tiling: { value: tiling },
                    },
                    vertexShader: `
                        varying vec2 vUv;
                        void main() {
                            vUv = uv;
                            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                        }
                    `,
                    fragmentShader: `
                        varying vec2 vUv;
                        uniform sampler2D tex0;
                        uniform sampler2D tex1;
                        uniform sampler2D tex2;
                        uniform sampler2D tex3;
                        uniform sampler2D splatMap;
                        uniform float tiling;

                        void main() {
                            vec4 splat = texture2D(splatMap, vUv);
                            float total = splat.r + splat.g + splat.b + splat.a;
                            if (total < 0.001) {
                                gl_FragColor = vec4(0.15, 0.25, 0.1, 1.0);
                                return;
                            }
                            vec4 color = texture2D(tex0, vUv * tiling) * splat.r
                                       + texture2D(tex1, vUv * tiling) * splat.g
                                       + texture2D(tex2, vUv * tiling) * splat.b
                                       + texture2D(tex3, vUv * tiling) * splat.a;
                            gl_FragColor = vec4(color.rgb / total, 1.0);
                        }
                    `,
                    side: THREE.FrontSide,
                });

                terrainMesh = new THREE.Mesh(geometry, material);
                terrainMesh.receiveShadow = true;
                scene.add(terrainMesh);
                terrainReadyResolve();
            })
            .catch(() => {
                const material = new THREE.MeshStandardMaterial({ color: 0x3a9d23, roughness: 0.8 });
                terrainMesh = new THREE.Mesh(geometry, material);
                terrainMesh.receiveShadow = true;
                scene.add(terrainMesh);
                terrainReadyResolve();
            });
    };
    const baseUrl = SERVER_URL.replace(/\/+$/, '');
    image.src = `${baseUrl}${terrain.heightmapPath}`;
    image.onerror = () => {
        console.warn('[TERRAIN] Не удалось загрузить heightmap:', terrain.heightmapPath);
        // Если меш уже был, не удаляем его — оставляем старый
        if (!terrainMesh) {
            // fallback для первой загрузки
            const material = new THREE.MeshStandardMaterial({ color: 0x3a9d23, roughness: 0.8 });
            terrainMesh = new THREE.Mesh(geometry, material);
            terrainMesh.receiveShadow = true;
            scene.add(terrainMesh);
            terrainReadyResolve();
        }
    };
    (window as any).terrainWidth = terrainWidth;
    (window as any).terrainDepth = terrainDepth;
    (window as any).heightmapData = heightmapData;
}

// ---------- Функции получения высоты ----------

const raycaster = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);
const _rayOrigin = new THREE.Vector3();

export function getTerrainHeightAt(x: number, z: number): number {
    if (!terrainMesh) return 0;
    _rayOrigin.set(x, 500, z);
    raycaster.set(_rayOrigin, down);
    const intersects = raycaster.intersectObject(terrainMesh);
    if (intersects.length > 0) return intersects[0].point.y;
    return 0;
}

/** Быстрое сэмплирование высоты без raycasting (для 60+ FPS) */
export function getTerrainHeightAtFast(x: number, z: number): number {
    if (!heightmapData || terrainWidth === 0 || terrainDepth === 0) return 0;
    if (!heightmapData || terrainWidth === 0 || terrainDepth === 0) {
        console.warn(`[FAST] Missing data (heightmapData: ${!!heightmapData}, terrainWidth: ${terrainWidth}, terrainDepth: ${terrainDepth})`);
        return 0;
    }

    // Мировые координаты -> UV (0..1)
    const u = (x / terrainWidth) + 0.5;
    const v = (z / terrainDepth) + 0.5;

    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;

    // Билинейная интерполяция
    const imgW = heightmapData.width;
    const imgH = heightmapData.height;
    const px = u * (imgW - 1);
    const py = v * (imgH - 1);

    const x1 = Math.floor(px);
    const x2 = Math.min(x1 + 1, imgW - 1);
    const y1 = Math.floor(py);
    const y2 = Math.min(y1 + 1, imgH - 1);

    const idx = (y: number, x: number) => (y * imgW + x) * 4;

    const r11 = heightmapData.data[idx(y1, x1)];
    const r21 = heightmapData.data[idx(y1, x2)];
    const r12 = heightmapData.data[idx(y2, x1)];
    const r22 = heightmapData.data[idx(y2, x2)];

    const fx = px - x1;
    const fy = py - y1;

    const rTop = r11 + (r21 - r11) * fx;
    const rBottom = r12 + (r22 - r12) * fx;
    const r = rTop + (rBottom - rTop) * fy;

    return (r / 255) * terrainMaxHeight;
}

// ---------- Terrain Editor ----------

export function getTerrainSegments() { return terrainSegments; }
export function getVertexHeightBuffer() { return vertexHeightBuffer; }

export function syncVertexBufferToMesh() {
    if (!terrainMesh || !vertexHeightBuffer) return;
    const positions = terrainMesh.geometry.attributes.position.array;
    for (let i = 0; i < vertexHeightBuffer.length; i++) {
        positions[i * 3 + 1] = vertexHeightBuffer[i];
    }
    terrainMesh.geometry.attributes.position.needsUpdate = true;
    terrainMesh.geometry.computeVertexNormals();
}

export function applyBrush(centerX: number, centerZ: number, brush: BrushState) {
    if (!terrainMesh || !vertexHeightBuffer) return;
    const segments = terrainSegments;
    const positions = terrainMesh.geometry.attributes.position.array;
    const radius = brush.radius;

    const halfW = terrainWidth / 2;
    const halfD = terrainDepth / 2;

    // Для flatten: высота вершины в центре кисти
    let flattenAvg = brush.targetHeight;
    if (brush.tool === 'flatten') {
        let closestDist = Infinity;
        for (let i = 0; i < vertexHeightBuffer.length; i++) {
            const row = Math.floor(i / (segments + 1));
            const col = i % (segments + 1);
            const u = col / segments;
            const v = row / segments;
            const vx = u * terrainWidth - halfW;
            const vz = v * terrainDepth - halfD;
            const dx = vx - centerX;
            const dz = vz - centerZ;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < closestDist) {
                closestDist = dist;
                flattenAvg = vertexHeightBuffer[i];
            }
        }
    }

    for (let i = 0; i < vertexHeightBuffer.length; i++) {
        const row = Math.floor(i / (segments + 1));
        const col = i % (segments + 1);
        const u = col / segments;
        const v = row / segments;

        const vx = u * terrainWidth - halfW;
        const vz = v * terrainDepth - halfD;
        const dx = vx - centerX;
        const dz = vz - centerZ;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > radius) continue;

        let weight = 1;
        if (brush.falloff === 'gaussian') {
            weight = Math.exp(-(dist * dist) / (radius * radius * 0.5));
        } else if (brush.falloff === 'linear') {
            weight = 1 - dist / radius;
        }

        const currentH = vertexHeightBuffer[i];

        let newH = currentH;
        switch (brush.tool) {
            case 'raise':
                newH = currentH + brush.strength * weight;
                break;
            case 'lower':
                newH = currentH - brush.strength * weight;
                break;
            case 'flatten':
                newH = currentH + (flattenAvg - currentH) * weight * 0.3;
                break;
            case 'smooth': {
                let sum = 0;
                let count = 0;
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        const nr = row + dr;
                        const nc = col + dc;
                        if (nr < 0 || nr > segments || nc < 0 || nc > segments) continue;
                        sum += vertexHeightBuffer[nr * (segments + 1) + nc];
                        count++;
                    }
                }
                const avg = sum / count;
                newH = currentH + (avg - currentH) * weight * 0.3;
                break;
            }
        }

        newH = Math.max(0, Math.min(terrainMaxHeight, newH));
        vertexHeightBuffer[i] = newH;
        positions[i * 3 + 1] = newH;
    }

    terrainMesh.geometry.attributes.position.needsUpdate = true;
    terrainMesh.geometry.computeVertexNormals();
}

export function exportHeightmapToBlob(): Promise<Blob | null> {
    return new Promise((resolve) => {
        if (!vertexHeightBuffer) { resolve(null); return; }

        const size = terrainSegments + 1; // 129
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        const imageData = ctx.createImageData(size, size);

        for (let i = 0; i < vertexHeightBuffer.length; i++) {
            const pixel = Math.round((vertexHeightBuffer[i] / terrainMaxHeight) * 255);
            const clamped = Math.max(0, Math.min(255, pixel));
            imageData.data[i * 4] = clamped;
            imageData.data[i * 4 + 1] = clamped;
            imageData.data[i * 4 + 2] = clamped;
            imageData.data[i * 4 + 3] = 255;
        }

        ctx.putImageData(imageData, 0, 0);

        canvas.toBlob((blob) => {
            resolve(blob);
        }, 'image/png');
    });
}

export function exportRawHeights(): Uint8Array {
    if (!vertexHeightBuffer) return new Uint8Array(0);
    const data = new Uint8Array(vertexHeightBuffer.length);
    for (let i = 0; i < vertexHeightBuffer.length; i++) {
        data[i] = Math.round((vertexHeightBuffer[i] / terrainMaxHeight) * 255);
    }
    return data;
}

// ---------- Splatmap ----------

function initSplatmap() {
    if (splatData) return;
    const size = SPLATMAP_SIZE * SPLATMAP_SIZE * 4;
    splatData = new Uint8Array(size) as unknown as Uint8Array;
    // По умолчанию вся трава (R=255, остальные 0)
    for (let i = 0; i < size; i += 4) {
        splatData[i] = 255;
    }
    splatTexture = new THREE.DataTexture(splatData as any, SPLATMAP_SIZE, SPLATMAP_SIZE, THREE.RGBAFormat);
    splatTexture.flipY = false;
    splatTexture.needsUpdate = true;
    // Загружаем существующий сплатмап с сервера
    loadSplatmapFromServer();
}

function loadSplatmapFromServer() {
    if (!splatData) return;
    const baseUrl = SERVER_URL.replace(/\/+$/, '');
    fetch(`${baseUrl}/textures/splatmap.raw?t=${Date.now()}`)
        .then((res) => {
            if (!res.ok) throw new Error('No splatmap file');
            return res.arrayBuffer();
        })
        .then((buffer) => {
            const loaded = new Uint8Array(buffer);
            const len = Math.min(loaded.length, splatData!.length);
            for (let i = 0; i < len; i++) splatData![i] = loaded[i];
            if (splatTexture) splatTexture.needsUpdate = true;
        })
        .catch(() => {
            // Нет файла — оставляем умолчание (вся трава)
        });
}

export function applyPaintBrush(
    worldX: number, worldZ: number,
    channel: number, strength: number, radius: number,
    falloff: string, erase: boolean
) {
    if (!splatData) return;
    const halfW = terrainWidth / 2;
    const halfD = terrainDepth / 2;
    const u = (worldX + halfW) / terrainWidth;
    const v = (worldZ + halfD) / terrainDepth;
    if (u < 0 || u > 1 || v < 0 || v > 1) return;
    const cx = u * SPLATMAP_SIZE;
    const cy = (1 - v) * SPLATMAP_SIZE;
    const pixelRadius = Math.max(1, radius / (terrainWidth / SPLATMAP_SIZE));

    const data = splatData;

    const minX = Math.max(0, Math.floor(cx - pixelRadius));
    const maxX = Math.min(SPLATMAP_SIZE - 1, Math.ceil(cx + pixelRadius));
    const minY = Math.max(0, Math.floor(cy - pixelRadius));
    const maxY = Math.min(SPLATMAP_SIZE - 1, Math.ceil(cy + pixelRadius));

    for (let py = minY; py <= maxY; py++) {
        for (let px = minX; px <= maxX; px++) {
            const dx = px - cx;
            const dy = py - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > pixelRadius) continue;

            let weight = 1;
            if (falloff === 'gaussian') {
                weight = Math.exp(-(dist * dist) / (pixelRadius * pixelRadius * 0.5));
            } else if (falloff === 'linear') {
                weight = 1 - dist / pixelRadius;
            }

            const idx = (py * SPLATMAP_SIZE + px) * 4;
            const addVal = Math.round(strength * weight * 255);
            if (erase) {
                const oldVal = data[idx + channel];
                data[idx + channel] = Math.max(0, oldVal - addVal);
                const delta = oldVal - data[idx + channel];
                if (delta > 0) {
                    data[idx] = Math.min(255, data[idx] + delta);
                }
            } else {
                data[idx + channel] = Math.min(255, data[idx + channel] + addVal);
                for (let c = 0; c < 4; c++) {
                    if (c !== channel) {
                        data[idx + c] = Math.max(0, data[idx + c] - Math.round(addVal / 3));
                    }
                }
            }
        }
    }

    if (splatTexture) splatTexture.needsUpdate = true;
}

export function exportSplatmapToCanvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = SPLATMAP_SIZE;
    c.height = SPLATMAP_SIZE;
    const ctx = c.getContext('2d')!;
    if (splatData) {
        const id = ctx.createImageData(SPLATMAP_SIZE, SPLATMAP_SIZE);
        for (let i = 0; i < id.data.length; i++) {
            id.data[i] = splatData[i];
        }
        ctx.putImageData(id, 0, 0);
    }
    return c;
}

export function getSplatTexture() { return splatTexture; }

export function exportSplatmapRaw(): Uint8Array | null {
    return splatData;
}