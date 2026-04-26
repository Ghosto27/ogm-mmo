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

export const createLocalToonMaterial = (map: THREE.Texture | null) => {
    return new THREE.MeshToonMaterial({
        color: 0xffffff,
        gradientMap: toonGradientMap,
        map: map,
    });
};

export const createEnemyToonMaterial = (map: THREE.Texture | null) => {
    return new THREE.MeshToonMaterial({
        color: 0x3399ff,
        gradientMap: toonGradientMap,
        map: map,
    });
};

export function cloneMaterial(original: THREE.MeshStandardMaterial, sessionId?: string): THREE.MeshToonMaterial {
    const map = original.map ?? null;
    const newMat = sessionId ? createEnemyToonMaterial(map) : createLocalToonMaterial(map);

    (newMat as any).alphaMap = original.alphaMap ?? null;
    (newMat as any).emissiveMap = original.emissiveMap ?? null;
    (newMat as any).aoMap = original.aoMap ?? null;
    (newMat as any).normalMap = original.normalMap ?? null;

    newMat.transparent = original.transparent;
    newMat.alphaTest = original.alphaTest;
    newMat.side = original.side;
    newMat.depthWrite = original.depthWrite;
    newMat.depthTest = original.depthTest;
    newMat.opacity = original.opacity;

    newMat.vertexColors = original.vertexColors;
    newMat.wireframe = original.wireframe;
    newMat.emissive = original.emissive;
    newMat.emissiveIntensity = original.emissiveIntensity;

    return newMat;
}