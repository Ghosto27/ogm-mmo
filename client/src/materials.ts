import * as THREE from 'three';

const createGradientMap = (): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 1;
    const ctx = canvas.getContext('2d')!;

    // Более светлая тень (средне-серый вместо почти чёрного)
    ctx.fillStyle = '#777777'; // ~0.47 яркости
    ctx.fillRect(0, 0, 1, 1);

    ctx.fillStyle = '#aaaaaa'; // ~0.67
    ctx.fillRect(1, 0, 1, 1);

    ctx.fillStyle = '#ffffff';
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