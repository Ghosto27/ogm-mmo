// WorldRenderer.ts — добавлена поддержка GLTF-моделей

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { scene } from '../scene';
import { getTerrainHeightAt, terrainReady } from './TerrainRenderer';
import { addCylinderCollider, addOBBCollider, addSphereCollider } from '../collision';
import { isEditorActive } from '../editor/EditorState';
import { getColliderConfig } from '../collisionConfig';

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
        clone.userData.editorType = 'model';
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
        if (id.startsWith('pine_') || id.startsWith('rocky_')) continue;

        // --- ОБНОВЛЕНИЕ СУЩЕСТВУЮЩЕГО МЕША ---
        if (worldMeshes[id]) {
            // Если редактор активен, не обновляем editor_ объекты (ими управляет редактор)
            if (id.startsWith('editor_') && isEditorActive()) {
                continue;
            }
            const existing = worldMeshes[id];
            //console.log(`[WORLD-UPDATE] id=${id}, oldPos=(${existing.position.x.toFixed(1)},${existing.position.y.toFixed(1)},${existing.position.z.toFixed(1)})`);

            if (obj.y !== undefined) {
                existing.position.set(obj.x, obj.y, obj.z);
            } else {
                const y = getTerrainHeightAt(obj.x, obj.z);
                const offset = obj.modelName === 'plane' ? 0.05 : (obj.scaleY || 1) / 2;
                existing.position.set(obj.x, y + offset, obj.z);
            }
            existing.scale.set(obj.scaleX, obj.scaleY, obj.scaleZ);
            existing.rotation.y = obj.rotationY || 0;
            existing.rotation.x = obj.rotationX || 0;
            existing.rotation.z = obj.rotationZ || 0;

            //console.log(`[WORLD-UPDATE] id=${id}, newPos=(${existing.position.x.toFixed(1)},${existing.position.y.toFixed(1)},${existing.position.z.toFixed(1)})`);

            // Коллизии (только для примитивов, чтобы не забивать)
            /* if (obj.modelName === 'cube') {
                const halfExtents = new THREE.Vector3(
                    (obj.scaleX || 1) / 2,
                    (obj.scaleY || 1) / 2,
                    (obj.scaleZ || 1) / 2
                );
                addBoxCollider(existing.position.clone(), halfExtents);
            } else if (obj.modelName === 'cylinder') {
                const radius = obj.scaleX || 1;
                const height = obj.scaleY || 1;
                const baseY = existing.position.y - height / 2;
                addCylinderCollider(
                    new THREE.Vector3(existing.position.x, baseY, existing.position.z),
                    radius,
                    height
                );
            } */

            continue;
        }

        // Создание нового меша (старый код без изменений)
        const obj3D = await createMesh(obj);
        if (!obj3D) continue;
        if (id.startsWith('editor_') && isEditorActive()) {
            // Не создаём новые editor_-объекты, пока редактор активен
            continue;
        }

        if (obj.y !== undefined) {
            obj3D.position.set(obj.x, obj.y, obj.z);
        } else {
            const y = getTerrainHeightAt(obj.x, obj.z);
            const offset = obj.modelName === 'plane' ? 0.05 : (obj.scaleY || 1) / 2;
            obj3D.position.set(obj.x, y + offset, obj.z);
        }
        obj3D.scale.set(obj.scaleX, obj.scaleY, obj.scaleZ);
        obj3D.rotation.y = obj.rotationY || 0;
        obj3D.rotation.x = obj.rotationX || 0;
        obj3D.rotation.z = obj.rotationZ || 0;

        scene.add(obj3D);

        // Коллизии для примитивов
        if (obj.modelName === 'cube') {
            const halfExtents = new THREE.Vector3(
                (obj.scaleX || 1) / 2,
                (obj.scaleY || 1) / 2,
                (obj.scaleZ || 1) / 2
            );
            // Всегда создаём OBB с учётом поворота объекта
            const quaternion = new THREE.Quaternion().setFromEuler(obj3D.rotation);
            addOBBCollider(obj3D.position.clone(), halfExtents, quaternion);
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
                // Для моделей (не примитивов) создаём коллизию
        if (obj.modelName !== 'cube' && obj.modelName !== 'cylinder' && obj.modelName !== 'plane') {
            createCollisionForModel(obj3D, obj);
        }

        worldMeshes[id] = obj3D;
    }
}

function createCollisionForModel(mesh: THREE.Object3D, obj: any) {
    const modelName = obj.modelName;
    if (!modelName) return;

    // Получаем конфиг (может быть null)
    const config = getColliderConfig(modelName);
    const scale = obj.scaleX || 1;   // предполагаем равномерный масштаб
    const meshY = mesh.position.y;

    if (config && config.type === 'cylinder') {
        // Цилиндр из конфига (базовые размеры * scale)
        const radius = (config.cylinderRadius ?? 0.5) * scale;
        const height = (config.cylinderHeight ?? 1) * scale;
        const baseY = meshY - height / 2;  // центр цилиндра в нижней точке? Зависит от модели. Для деревьев pivot внизу, поэтому высота от земли вверх.
        // Считаем, что цилиндр начинается от земли (mesh.position.y) и идёт вверх на height.
        const center = new THREE.Vector3(mesh.position.x, meshY, mesh.position.z);
        addCylinderCollider(center, radius, height);
    } else {
        // Автоматическая сфера на основе bounding box
        const box = new THREE.Box3().setFromObject(mesh);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.z);
        const radius = (maxDim / 2) * 0.9;  // немного уменьшаем
        // Центр сферы – центр бокса или нижняя часть? Для камней/деревьев лучше центр.
        const center = new THREE.Vector3();
        box.getCenter(center);
        // Если модель стоит на земле, сфера может быть слишком высокой; можно сместить ниже.
        // Но для простоты берём центр бокса.
        addSphereCollider(center, radius);
    }
}