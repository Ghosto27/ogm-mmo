import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

const templateCache = new Map<string, THREE.Group>();
const sizeCache = new Map<string, number>();   // максимальный размер модели (ширина/глубина) в единицах при scale=1

const extCache = new Map<string, string>();

/** Загружает (с кэшированием) шаблон модели */
export async function loadModelTemplate(modelName: string, ext?: string): Promise<THREE.Group> {
    const key = ext ? `${modelName}${ext}` : modelName;
    if (templateCache.has(key)) return templateCache.get(key)!;
    const loader = new GLTFLoader();
    const loadExt = ext || '.glb';
    const gltf = await loader.loadAsync(`/models/${modelName}${loadExt}`);
    const template = gltf.scene;
    templateCache.set(key, template);
    // Вычисляем bounding box один раз
    const box = new THREE.Box3().setFromObject(template);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.z);   // ширина или глубина
    sizeCache.set(key, maxDim);
    extCache.set(key, loadExt);
    return template;
}

/** Возвращает максимальный размер модели (X или Z) при scale=1 */
export function getModelBaseSize(modelName: string, ext?: string): number {
    const key = ext ? `${modelName}${ext}` : modelName;
    return sizeCache.get(key) ?? 2.0;   // 2.0 – безопасное умолчание
}

/** Создаёт глубокий клон модели без дополнительных данных */
export async function createModelClone(modelName: string, ext?: string): Promise<THREE.Group> {
    const template = await loadModelTemplate(modelName, ext);
    return template.clone(true);
}