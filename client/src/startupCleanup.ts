import * as THREE from 'three';
import { scene } from './scene';

export function cleanUpScene() {
    const toRemove: THREE.Object3D[] = [];

    scene.traverse((child: THREE.Object3D) => {
        // Явно пропускаем источники света и камеру
        if (child instanceof THREE.Light || child instanceof THREE.Camera) return;
        // Пропускаем важные объекты сцены (можно расширить)
        if (child instanceof THREE.GridHelper || child.name === 'floor') return;

        // Удаляем только безымянные Object3D/Group в центре координат
        if (child !== scene && child.position.lengthSq() < 0.01 && !child.name) {
            toRemove.push(child);
        }
    });

    toRemove.forEach(child => {
        if (child.parent) child.parent.remove(child);
        console.log('[CLEANUP] Удалён:', child.type, child.name);
    });
    console.log(`[CLEANUP] Мусорных объектов удалено: ${toRemove.length}`);
}