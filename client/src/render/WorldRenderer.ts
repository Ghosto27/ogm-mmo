// WorldRenderer.ts — добавлена поддержка GLTF-моделей

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { scene } from '../scene';
import { getTerrainHeightAt, terrainReady } from './TerrainRenderer';
import { addBoxCollider, addCylinderCollider } from '../collision';

// Теперь храним любые объекты (Mesh или Group)
export const worldMeshes: { [id: string]: THREE.Object3D } = {};
const modelCache = new Map<string, Promise<THREE.Group>>();

/** Загружает GLTF-модель (с кэшированием) */
async function loadModel(modelName: string): Promise<THREE.Group> {
    if (modelCache.has(modelName)) return modelCache.get(modelName)!;
    const loader = new GLTFLoader();
    const promise = loader.loadAsync(`/models/${modelName}.glb`).then(gltf => gltf.scene);
    modelCache.set(modelName, promise);
    return promise;
}

/**
 * Создаёт меш или группу в зависимости от modelName.
 * Для cube, cylinder, plane – примитивы.
 * Для остальных – загрузка GLTF.
 */
export async function createMesh(obj: any): Promise<THREE.Object3D | null> {
    const { modelName } = obj;
    if (modelName === 'cube') {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial({ color: obj.color || '#ffffff' });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.editorMode = true;
        mesh.userData.editorType = 'cube';
        return mesh;
    } else if (modelName === 'cylinder') {
        const geometry = new THREE.CylinderGeometry(1, 1, 1, 16);
        const material = new THREE.MeshStandardMaterial({ color: obj.color || '#ffffff' });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.editorMode = true;
        mesh.userData.editorType = 'cylinder';
        return mesh;
    } else if (modelName === 'plane') {
        const geometry = new THREE.PlaneGeometry(1, 1);
        const material = new THREE.MeshStandardMaterial({ color: obj.color || '#ffffff' });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.editorMode = true;
        return mesh;
    } else if (!modelName || modelName === '') {
        console.warn(`[WORLD] Объект без modelName, создаю куб`);
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial({ color: '#ffffff' });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.editorMode = true;
        mesh.userData.editorType = 'cube';
        return mesh;
    }

    // GLTF модель
    try {
        const template = await loadModel(modelName);
        const clone = template.clone(true);
        clone.userData.editorMode = true;
        clone.userData.modelName = modelName;
        return clone;
    } catch (err) {
        console.warn(`[WORLD] Не удалось загрузить модель ${modelName}:`, err);
        return null;
    }
}

/**
 * Обновляет объекты мира (асинхронно).
 */
export async function updateWorldObjects(worldObjects: any) {
    if (!worldObjects || !worldObjects.forEach) return;

    // Удаляем объекты, отсутствующие в стейте
    for (const id in worldMeshes) {
        if (!worldObjects.has(id)) {
            scene.remove(worldMeshes[id]);
            delete worldMeshes[id];
        }
    }

    // Ждём готовности ландшафта
    await terrainReady;

    // Получаем массив записей и обрабатываем последовательно
    const entries = Array.from(worldObjects.entries()) as [string, any][];
    for (const [id, obj] of entries) {
        // Пропускаем растительность
        if (id.startsWith('pine_') || id.startsWith('rocky_')) continue;
        if (worldMeshes[id]) continue;

        const obj3D = await createMesh(obj);
        if (!obj3D) continue;

        // Позиция с учётом ландшафта
        if (obj.y !== undefined) {
            // Объект редактора – используем сохранённую высоту
            // Статическая деревня – высчитываем по террейну
            const y = getTerrainHeightAt(obj.x, obj.z);
            const offset = obj.modelName === 'plane' ? 0.05 : (obj.scaleY || 1) / 2;
            obj3D.position.set(obj.x, obj.y, obj.z);
        } else {
            // Статическая деревня – высчитываем по террейну
            const y = getTerrainHeightAt(obj.x, obj.z);
            const offset = obj.modelName === 'plane' ? 0.05 : (obj.scaleY || 1) / 2;
            obj3D.position.set(obj.x, y + offset, obj.z);
        }
        obj3D.scale.set(obj.scaleX, obj.scaleY, obj.scaleZ);
        obj3D.rotation.y = obj.rotationY || 0;
        obj3D.rotation.x = obj.rotationX || 0;

        scene.add(obj3D);

        // Коллизии для примитивов
        if (obj.modelName === 'cube') {
            const halfExtents = new THREE.Vector3(
                (obj.scaleX || 1) / 2,
                (obj.scaleY || 1) / 2,
                (obj.scaleZ || 1) / 2
            );
            addBoxCollider(obj3D.position.clone(), halfExtents);
        } else if (obj.modelName === 'cylinder') {
            const radius = obj.scaleX || 1;
            const height = obj.scaleY || 1;
            const baseY = obj3D.position.y - height / 2;
            addCylinderCollider(
                new THREE.Vector3(obj3D.position.x, baseY, obj3D.position.z),
                radius,
                height
            );
        }

        worldMeshes[id] = obj3D;
    }
}