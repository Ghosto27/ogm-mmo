import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { scene } from '../scene';
import { getTerrainHeightAtFast, getTerrainHeightAt } from './TerrainRenderer';
import { addSphereCollider, clearColliders, addCylinderCollider } from '../collision';
import { getColliderConfig } from '../collisionConfig';

const instanceMeshes: Map<string, THREE.InstancedMesh> = new Map();
const nextIndices: Map<string, number> = new Map();
const addedIds: Set<string> = new Set();
const loadingPromises: Map<string, Promise<THREE.InstancedMesh>> = new Map();
const modelHeights: Map<string, number> = new Map();
const modelWidths: Map<string, number> = new Map();

let vegetationLoaded = false;

async function loadModel(modelName: string): Promise<THREE.InstancedMesh> {
    if (loadingPromises.has(modelName)) {
        return loadingPromises.get(modelName)!;
    }

    const promise = new Promise<THREE.InstancedMesh>(async (resolve, reject) => {
        try {
            const loader = new GLTFLoader();
            const gltf = await loader.loadAsync(`/models/${modelName}.glb`);

            let found: THREE.Mesh | null = null;
            gltf.scene.traverse((child) => {
                if (!found && child instanceof THREE.Mesh) found = child;
            });
            if (!found) throw new Error(`No mesh found in ${modelName}.glb`);

            const template: THREE.Mesh = found;
            const geo = template.geometry.clone() as THREE.BufferGeometry;
            const mat = template.material;
            const box = new THREE.Box3().setFromObject(template);
            const size = new THREE.Vector3();
            box.getSize(size);
            const height = size.y;
            const width = Math.max(size.x, size.z);
            modelHeights.set(modelName, height);
            modelWidths.set(modelName, width);

            const mesh = new THREE.InstancedMesh(geo, mat, 5000);
            mesh.userData.modelName = modelName;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            scene.add(mesh);
            resolve(mesh);
        } catch (err) {
            reject(err);
        }
    });

    loadingPromises.set(modelName, promise);
    return promise;
}

export async function addVegetationInstance(obj: any): Promise<void> {
    if (addedIds.has(obj.id)) return;
    addedIds.add(obj.id);

    const modelName = obj.modelName?.trim();
    if (!modelName) return;

    let mesh = instanceMeshes.get(modelName);
    if (!mesh) {
        mesh = await loadModel(modelName);
        // Не перезаписываем, если другой вызов уже добавил меш
        if (!instanceMeshes.has(modelName)) {
            instanceMeshes.set(modelName, mesh);
            nextIndices.set(modelName, 0);
        }
    }

    const idx = nextIndices.get(modelName) || 0;
    if (idx >= mesh.count) {
        return;
    }

    const matrix = new THREE.Matrix4();
    const y = getTerrainHeightAtFast(obj.x, obj.z);
    const scale = obj.scaleX || 1;

    matrix.compose(
        new THREE.Vector3(obj.x, y, obj.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, obj.rotationY || 0, 0)),
        new THREE.Vector3(scale, scale, scale)
    );
    mesh.setMatrixAt(idx, matrix);
    mesh.instanceMatrix.needsUpdate = true;

    // --- Создание коллизии с учётом scale объекта ---
    const modelHeight = modelHeights.get(modelName) || 2.0;
    const modelWidth = modelWidths.get(modelName) || 1.0;
    const config = getColliderConfig(modelName);
    const instanceScale = obj.scaleX || 1;   // или (obj.scaleX ?? 1)

    if (config && config.type === 'cylinder') {
        // Базовые размеры из конфига умножаем на scale
        const radius = (config.cylinderRadius ?? (modelWidth * 0.25)) * instanceScale;
        const height = (config.cylinderHeight ?? modelHeight * 0.3) * instanceScale;
        const baseY = y;
        addCylinderCollider(new THREE.Vector3(obj.x, baseY, obj.z), radius, height);
    } else {
        // Сфера (автоматически или с базовыми размерами из конфига)
        const baseRadius = config?.radius ?? (modelWidth / 2);
        const baseOffsetY = config?.yOffset ?? modelHeight * 0.05;
        const radius = baseRadius * instanceScale -0.4;
        const offsetY = baseOffsetY * instanceScale;
        addSphereCollider(new THREE.Vector3(obj.x, y + offsetY, obj.z), radius);
    }

    nextIndices.set(modelName, idx + 1);
}

export async function finalizeVegetation() {
    for (const [modelName, mesh] of instanceMeshes.entries()) {
        const usedCount = nextIndices.get(modelName) || 0;
        if (usedCount === 0) {
            scene.remove(mesh);
            mesh.dispose();
            instanceMeshes.delete(modelName);
            continue;
        }

        const newMesh = new THREE.InstancedMesh(mesh.geometry, mesh.material, usedCount);
        newMesh.userData = mesh.userData;
        newMesh.castShadow = mesh.castShadow;
        newMesh.receiveShadow = mesh.receiveShadow;

        const matrix = new THREE.Matrix4();
        for (let i = 0; i < usedCount; i++) {
            mesh.getMatrixAt(i, matrix);
            newMesh.setMatrixAt(i, matrix);
        }
        newMesh.instanceMatrix.needsUpdate = true;

        scene.remove(mesh);
        scene.add(newMesh);
        mesh.dispose();

        instanceMeshes.set(modelName, newMesh);
    }

    vegetationLoaded = true;
}

export function isVegetationLoaded(): boolean {
    return vegetationLoaded;
}

export function clearAllVegetation() {
    instanceMeshes.forEach((mesh) => {
        scene.remove(mesh);
        mesh.dispose();
    });
    instanceMeshes.clear();
    nextIndices.clear();
    addedIds.clear();
    loadingPromises.clear();
    vegetationLoaded = false;
    clearColliders();
}

export function getAllInstancedMeshes(): THREE.InstancedMesh[] {
    return Array.from(instanceMeshes.values());
}