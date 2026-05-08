import * as THREE from 'three';
import { scene } from '../scene';
import { getTerrainHeightAt, terrainReady } from './TerrainRenderer';
import { addBoxCollider, addCylinderCollider } from '../collision';

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

    // Дожидаемся готовности ландшафта перед применением высоты
    terrainReady.then(() => {
        worldObjects.forEach((obj: any, id: string) => {
            // Пропускаем объекты растительности – их обрабатывает VegetationRenderer
            if (id.startsWith('pine_') || id.startsWith('rocky_')) return;
            if (worldMeshes[id]) return; // уже создан

            const mesh = createMesh(obj);
            if (mesh) {
                const y = getTerrainHeightAt(obj.x, obj.z);
                const offset = obj.modelName === 'plane' ? 0.05 : (obj.scaleY || 1) / 2;
                mesh.position.set(obj.x, y + offset, obj.z);
                mesh.scale.set(obj.scaleX, obj.scaleY, obj.scaleZ);
                mesh.rotation.y = obj.rotationY || 0;
                mesh.rotation.x = obj.rotationX || 0;
                (window as any).x = obj.x;
                (window as any).z = obj.z;

                scene.add(mesh);

                // --- Создание коллизии для объекта деревни ---
                if (obj.modelName === 'cube') {
                    const halfExtents = new THREE.Vector3(
                        (obj.scaleX || 1) / 2,
                        (obj.scaleY || 1) / 2,
                        (obj.scaleZ || 1) / 2
                    );
                    // Центр куба находится там же, где и position (уже с учётом terrain + offset)
                    addBoxCollider(mesh.position.clone(), halfExtents);
                } else if (obj.modelName === 'cylinder') {
                    // Базовая модель цилиндра имеет радиус 1, поэтому после масштабирования радиус = scaleX
                    const radius = obj.scaleX || 1;
                    const height = obj.scaleY || 1;
                    const baseY = mesh.position.y - height / 2;
                    addCylinderCollider(
                        new THREE.Vector3(mesh.position.x, baseY, mesh.position.z),
                        radius,
                        height
                    );
                }
                worldMeshes[id] = mesh;
            }
        });
    });
}

function createMesh(obj: any): THREE.Mesh | null {
    let geometry: THREE.BufferGeometry;
    switch (obj.modelName) {
        case 'cube': geometry = new THREE.BoxGeometry(1, 1, 1); break;
        case 'cylinder': geometry = new THREE.CylinderGeometry(1, 1, 1, 16); break;
        case 'plane': geometry = new THREE.PlaneGeometry(1, 1); break;
        default:
            console.warn(`[WORLD] Unknown modelName: ${obj.modelName}`);
            return null;
    }
    const material = new THREE.MeshStandardMaterial({ color: obj.color || '#ffffff' });
    return new THREE.Mesh(geometry, material);
}