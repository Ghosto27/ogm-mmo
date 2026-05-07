import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { scene } from '../scene';
import { getTerrainHeightAtFast, getTerrainHeightAt } from '../render/TerrainRenderer';

const instanceMeshes: Map<string, THREE.InstancedMesh> = new Map();
const nextIndices: Map<string, number> = new Map();
const addedIds: Set<string> = new Set();
const loadingPromises: Map<string, Promise<THREE.InstancedMesh>> = new Map();
const modelHeights: Map<string, number> = new Map();

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
            const height = box.max.y - box.min.y;
            modelHeights.set(modelName, height);
            //console.log(`[VEGETATION] Model ${modelName} height: ${height.toFixed(2)} units`);

            const mesh = new THREE.InstancedMesh(geo, mat, 5000);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            scene.add(mesh);
            //console.log(`[VEGETATION] Loaded model '${modelName}' into InstancedMesh.`);
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
        //console.warn(`[VEGETATION] InstancedMesh for '${modelName}' is full!`);
        return;
    }

    const matrix = new THREE.Matrix4();
    const y = getTerrainHeightAtFast(obj.x, obj.z);
    //console.log('YYY:', y);
    const scale = obj.scaleX || 1;

    matrix.compose(
        new THREE.Vector3(obj.x, y, obj.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, obj.rotationY || 0, 0)),
        new THREE.Vector3(scale, scale, scale)
    );
    mesh.setMatrixAt(idx, matrix);
    mesh.instanceMatrix.needsUpdate = true;

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
        //console.log(`[VEGETATION] Finalized ${modelName}: ${usedCount} instances, new mesh created.`);
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
}