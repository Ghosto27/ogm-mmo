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

        const textureGrass = loadTexture('/textures/grass.jpg');
        const textureCliff = loadTexture('/textures/cliff.jpg');
        const textureRock  = loadTexture('/textures/rock.jpg');

        Promise.all([textureGrass, textureCliff, textureRock])
            .then(([grass, cliff, rock]) => {
                const material = new THREE.ShaderMaterial({
                    uniforms: {
                        grassTexture: { value: grass },
                        cliffTexture: { value: cliff },
                        rockTexture:  { value: rock },
                        repeatGrass:  { value: 100.0 },
                        repeatCliff:  { value: 100.0 },
                        repeatRock:   { value: 100.0 },
                        maxHeight:    { value: terrain.maxHeight },
                        heightTransition: { value: 0.1 },
                    },
                    vertexShader: `
                        varying vec2 vUv;
                        varying float vHeight;
                        varying vec3 vNormal;
                        void main() {
                            vUv = uv;
                            vec4 worldPos = modelMatrix * vec4(position, 1.0);
                            vHeight = worldPos.y;
                            vNormal = normalize(mat3(modelMatrix) * normal);
                            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                        }
                    `,
                    fragmentShader: `
                        varying vec2 vUv;
                        varying float vHeight;
                        varying vec3 vNormal;
                        uniform sampler2D grassTexture;
                        uniform sampler2D cliffTexture;
                        uniform sampler2D rockTexture;
                        uniform float repeatGrass;
                        uniform float repeatCliff;
                        uniform float repeatRock;
                        uniform float maxHeight;
                        uniform float heightTransition;

                        void main() {
                            float normalizedHeight = vHeight / maxHeight;
                            float grassFactor = 1.0 - smoothstep(0.01 - heightTransition, 0.01 + heightTransition, normalizedHeight);
                            float rockFactor  = smoothstep(0.2 - heightTransition, 0.2 + heightTransition, normalizedHeight);
                            float cliffFactor = 1.0 - grassFactor - rockFactor;

                            vec4 grassColor = texture2D(grassTexture, vUv * repeatGrass);
                            vec4 cliffColor = texture2D(cliffTexture, vUv * repeatCliff);
                            vec4 rockColor  = texture2D(rockTexture,  vUv * repeatRock);

                            vec4 color = grassColor * grassFactor + cliffColor * cliffFactor + rockColor * rockFactor;
                            gl_FragColor = color;
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