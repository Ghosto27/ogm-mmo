import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

const templateCache = new Map<string, THREE.Group>();

/** Загружает (с кэшированием) шаблон модели */
export async function loadModelTemplate(modelName: string): Promise<THREE.Group> {
    if (templateCache.has(modelName)) return templateCache.get(modelName)!;
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(`/models/${modelName}.glb`);
    const template = gltf.scene;
    templateCache.set(modelName, template);
    return template;
}

/** Создаёт глубокий клон модели без дополнительных данных */
export async function createModelClone(modelName: string): Promise<THREE.Group> {
    const template = await loadModelTemplate(modelName);
    return template.clone(true);
}