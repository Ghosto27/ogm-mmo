import * as THREE from 'three';
import { scene } from '../scene';

let terrainMesh: THREE.Mesh | null = null;
let lastTerrainKey: string = '';

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

        const vertices = geometry.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            const uvIndex = Math.floor(i / 3);
            const u = (uvIndex % (terrain.segments + 1)) / terrain.segments;
            const v = Math.floor(uvIndex / (terrain.segments + 1)) / terrain.segments;

            const px = Math.floor(u * (image.width - 1));
            const py = Math.floor((1 - v) * (image.height - 1));
            const pixelIndex = (py * image.width + px) * 4;
            const r = data[pixelIndex];
            if (i === 0) {
                console.log('First pixel data (R,G,B,A):', r, data[pixelIndex+1], data[pixelIndex+2], data[pixelIndex+3]);
                console.log('Applied height:', (r / 255) * terrain.maxHeight);
                console.log('maxHeight from server:', terrain.maxHeight);
            }

            vertices[i + 1] = (r / 255) * terrain.maxHeight;
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            color: 0x3a9d23,
            roughness: 0.8,
            metalness: 0.1,
            flatShading: true,
        });

        terrainMesh = new THREE.Mesh(geometry, material);
        terrainMesh.receiveShadow = true;
        scene.add(terrainMesh);
    };
    image.src = terrain.heightmapPath;
}

const raycaster = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);

export function getTerrainHeightAt(x: number, z: number): number {
    if (!terrainMesh) return 0;
    
    const origin = new THREE.Vector3(x, 500, z);
    raycaster.set(origin, down);
    
    const intersects = raycaster.intersectObject(terrainMesh);
    if (intersects.length > 0) {
        return intersects[0].point.y;
    }
    
    return 0;
}