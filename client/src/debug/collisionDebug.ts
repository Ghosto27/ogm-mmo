import * as THREE from 'three';
import { scene } from '../scene';

let debugGroup: THREE.Group | null = null;

/**
 * @param colliders – массив коллайдеров для отрисовки
 * @param playerPos – позиция игрока (для фильтрации по расстоянию)
 * @param maxDistance – максимальная дистанция от игрока, в которой коллайдеры отображаются
 */
export function updateCollisionDebug(
    colliders: any[],
    playerPos?: THREE.Vector3,
    maxDistance: number = 50
) {
    // Удаляем предыдущую отладку
    if (debugGroup) {
        scene.remove(debugGroup);
        debugGroup.traverse(child => {
            if (child instanceof THREE.Mesh) {
                child.geometry.dispose();
                (child.material as THREE.Material).dispose();
            }
        });
    }

    debugGroup = new THREE.Group();
    debugGroup.name = 'collision_debug';

    colliders.forEach(col => {
        // Фильтр по расстоянию: рисуем только если игрок близко
        if (playerPos && maxDistance > 0) {
            const dist = playerPos.distanceTo(col.center || col.position || new THREE.Vector3());
            if (dist > maxDistance) return;
        }

        if (col.type === 'sphere') {
            const geo = new THREE.SphereGeometry(col.radius, 16, 16);
            const mat = new THREE.MeshBasicMaterial({
                color: 0xff0000,
                wireframe: true,
                transparent: true,
                opacity: 0.3,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(col.center);
            debugGroup!.add(mesh);
        } else if (col.type === 'cylinder') {
            const geo = new THREE.CylinderGeometry(col.radius, col.radius, col.height, 16);
            const mat = new THREE.MeshBasicMaterial({
                color: 0x0000ff,
                wireframe: true,
                transparent: true,
                opacity: 0.3,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(col.center.x, col.center.y + col.height / 2, col.center.z);
            debugGroup!.add(mesh);
        } else if (col.type === 'box') {
            const { halfExtents, center } = col;
            const geo = new THREE.BoxGeometry(halfExtents.x * 2, halfExtents.y * 2, halfExtents.z * 2);
            const mat = new THREE.MeshBasicMaterial({
                color: 0x00ff00,
                wireframe: true,
                transparent: true,
                opacity: 0.3,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(center);
            debugGroup!.add(mesh);
        }
    });

    scene.add(debugGroup);
}