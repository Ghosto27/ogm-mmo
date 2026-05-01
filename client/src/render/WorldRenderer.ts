import * as THREE from 'three';
import { scene } from '../scene';
import { getTerrainHeightAt } from '../render/TerrainRenderer';

const worldMeshes: { [id: string]: THREE.Mesh } = {};

export function updateWorldObjects(worldObjects: any) {
    if (!worldObjects || !worldObjects.forEach) return;
    for (const id in worldMeshes) {
        if (!worldObjects.has(id)) {
            scene.remove(worldMeshes[id]);
            delete worldMeshes[id];
        }
    }

    worldObjects.forEach((obj: any, id: string) => {
        if (worldMeshes[id]) return;

        const mesh = createMesh(obj);
        if (mesh) {
            const y = getTerrainHeightAt(obj.x, obj.z);
            const offset = obj.modelName === 'plane' ? 0.05 : (obj.scaleY || 1) / 2;
            mesh.position.set(obj.x, y + offset, obj.z);
            mesh.scale.set(obj.scaleX, obj.scaleY, obj.scaleZ);
            mesh.rotation.y = obj.rotationY || 0;
            mesh.rotation.x = obj.rotationX || 0;
            scene.add(mesh);
            worldMeshes[id] = mesh;
        }
    });
}

function createMesh(obj: any): THREE.Mesh | null {
    let geometry: THREE.BufferGeometry;
    switch (obj.modelName) {
        case 'cube':
            geometry = new THREE.BoxGeometry(1, 1, 1);
            break;
        case 'cylinder':
            geometry = new THREE.CylinderGeometry(1, 1, 1, 16);
            break;
        case 'plane':
            geometry = new THREE.PlaneGeometry(1, 1);
            break;
        default:
            console.warn(`[WORLD] Unknown modelName: ${obj.modelName}`);
            return null;
    }
    const material = new THREE.MeshStandardMaterial({ color: obj.color || '#ffffff' });
    return new THREE.Mesh(geometry, material);
}