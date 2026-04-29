import * as THREE from 'three';

const createGradientMap = (): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 1;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#8b8b8b';
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = '#c8c8c8';
    ctx.fillRect(1, 0, 1, 1);
    ctx.fillStyle = '#eaeaea';
    ctx.fillRect(2, 0, 1, 1);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    return texture;
};

export const toonGradientMap = createGradientMap();

export const createLocalToonMaterial = (map: THREE.Texture | null, vertexColors: boolean = false) => {
    return new THREE.MeshToonMaterial({
        color: 0xffffff,
        gradientMap: toonGradientMap,
        map: map,
        vertexColors: vertexColors,
    });
};

export const createEnemyToonMaterial = (map: THREE.Texture | null, vertexColors: boolean = false) => {
    return new THREE.MeshToonMaterial({
        color: 0x3399ff,
        gradientMap: toonGradientMap,
        map: map,
        vertexColors: vertexColors,
    });
};

export function cloneMaterial(original: THREE.Material, sessionId?: string): THREE.MeshToonMaterial {
    const phys = original as THREE.MeshPhysicalMaterial;
    const map = (phys as any).map ?? null;
    const newMat = sessionId
        ? createEnemyToonMaterial(map, phys.vertexColors)
        : createLocalToonMaterial(map, phys.vertexColors);

    // Явно дублируем ключевые свойства, чтобы гарантировать их применение
    newMat.vertexColors = phys.vertexColors;        // ← теперь точно скопируется
    // Принудительно делаем emissive белым, чтобы модель не была тёмной
    newMat.emissive = new THREE.Color(0xffffff);
    newMat.emissiveIntensity = 0.5;

    // ❗ Временно отключаем градиентную карту
    newMat.gradientMap = null;

    (newMat as any).alphaMap = (phys as any).alphaMap ?? null;
    (newMat as any).emissiveMap = (phys as any).emissiveMap ?? null;
    (newMat as any).aoMap = (phys as any).aoMap ?? null;
    (newMat as any).normalMap = (phys as any).normalMap ?? null;

    newMat.transparent = phys.transparent;
    newMat.alphaTest = phys.alphaTest;
    newMat.side = phys.side;
    newMat.depthWrite = phys.depthWrite;
    newMat.depthTest = phys.depthTest;
    newMat.opacity = phys.opacity;

    newMat.wireframe = phys.wireframe;

    newMat.needsUpdate = true;

    return newMat;
}