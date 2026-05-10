import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

const templateCache = new Map<string, THREE.Group>();
const sizeCache = new Map<string, number>();   // максимальный размер модели (ширина/глубина) в единицах при scale=1

/** Загружает (с кэшированием) шаблон модели */
export async function loadModelTemplate(modelName: string): Promise<THREE.Group> {
    if (templateCache.has(modelName)) return templateCache.get(modelName)!;
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(`/models/${modelName}.glb`);
    const template = gltf.scene;
    templateCache.set(modelName, template);
    // Вычисляем bounding box один раз
    const box = new THREE.Box3().setFromObject(template);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.z);   // ширина или глубина
    sizeCache.set(modelName, maxDim);
    return template;
}

/** Возвращает максимальный размер модели (X или Z) при scale=1 */
export function getModelBaseSize(modelName: string): number {
    return sizeCache.get(modelName) ?? 2.0;   // 2.0 – безопасное умолчание
}

/** Создаёт глубокий клон модели без дополнительных данных */
export async function createModelClone(modelName: string): Promise<THREE.Group> {
    const template = await loadModelTemplate(modelName);
    return template.clone(true);
}