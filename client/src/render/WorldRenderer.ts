// client/src/render/WorldRenderer.ts
import * as THREE from 'three';
import { scene } from '../scene';

const worldMeshes: { [id: string]: THREE.Mesh } = {};

export function updateWorldObjects(worldObjects: any) {
    if (!worldObjects || !worldObjects.forEach) return;
    // Удаляем объекты, которых больше нет в стейте
    for (const id in worldMeshes) {
        if (!worldObjects.has(id)) {
            scene.remove(worldMeshes[id]);
            delete worldMeshes[id];
        }
    }

    // Создаём новые объекты
    worldObjects.forEach((obj: any, id: string) => {
        if (worldMeshes[id]) return; // уже есть

        const mesh = createMesh(obj);
        if (mesh) {
            mesh.position.set(obj.x, 0, obj.z);
            // Масштаб
            mesh.scale.set(obj.scaleX, obj.scaleY, obj.scaleZ);
            // Поворот (если нужно)
            //mesh.rotation.y = obj.rotationY || 0;
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
    const mesh = new THREE.Mesh(geometry, material);
    // Немного приподнимем, чтобы объекты не утопали в землю
    mesh.position.y = (obj.scaleY || 1) / 2;
    mesh.rotation.y = obj.rotationY || 0;
    mesh.rotation.x = obj.rotationX || 0;
    return mesh;
}