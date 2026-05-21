import * as THREE from 'three';
import { scene } from '../scene';

export let terrainMesh: THREE.Mesh | null = null;
let lastTerrainKey: string = '';
export let heightmapData: { data: Uint8ClampedArray; width: number; height: number } | null = null;

// Храним текущие параметры ландшафта для быстрого доступа
export let terrainWidth = 0;
export let terrainDepth = 0;
export let terrainMaxHeight = 0;
let imageWidth = 0;
let imageHeight = 0;

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

        const vertices = geometry.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            const uvIndex = Math.floor(i / 3);
            const u = (uvIndex % (terrain.segments + 1)) / terrain.segments;
            const v = Math.floor(uvIndex / (terrain.segments + 1)) / terrain.segments;

            const px = Math.floor(u * (image.width - 1));
            const py = Math.floor(v * (image.height - 1));
            const pixelIndex = (py * image.width + px) * 4;
            const r = data[pixelIndex];

            vertices[i + 1] = (r / 255) * terrain.maxHeight;
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
    image.src = terrain.heightmapPath;
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