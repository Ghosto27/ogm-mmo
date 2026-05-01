import * as THREE from 'three';
import { scene } from '../scene';
import { getTerrainHeightAt } from '../render/TerrainRenderer';

// Хранилище моделей мешков
export const lootMeshes: { [bagId: string]: THREE.Mesh } = {};

// Данные для анимации дуги
const lootAnimations: { [bagId: string]: {
    startPos: THREE.Vector3;
    targetPos: THREE.Vector3;
    startTime: number;
    duration: number; // секунды
} } = {};

/**
 * Создаёт кубик и запускает анимацию вылета из точки start в точку target.
 */
export function spawnLootMesh(bagId: string, startX: number, startZ: number, targetX: number, targetZ: number) {
    if (lootMeshes[bagId]) return;

    // Вычисляем высоту на стартовой и целевой точках
    const yStart = getTerrainHeightAt(startX, startZ);
    const yTarget = getTerrainHeightAt(targetX, targetZ);

    const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const material = new THREE.MeshStandardMaterial({ color: 0xffff00 });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(startX, yStart + 0.3, startZ);
    scene.add(cube);
    lootMeshes[bagId] = cube;

    // Создаём запись анимации сразу с корректными высотами
    lootAnimations[bagId] = {
        startPos: new THREE.Vector3(startX, yStart + 0.3, startZ),
        targetPos: new THREE.Vector3(targetX, yTarget + 0.3, targetZ),
        startTime: performance.now(),
        duration: 0.5 + Math.random() * 0.3,
    };
}

/**
 * Удаляет модели, которых больше нет в состоянии, или мешки, ставшие пустыми.
 */
export function updateLootMeshes(lootBags: any) {
    // Удаляем неактуальные
    for (const bagId in lootMeshes) {
        const bag = lootBags.get(bagId);
        if (!bag || bag.items.length === 0) {
            scene.remove(lootMeshes[bagId]);
            delete lootMeshes[bagId];
            delete lootAnimations[bagId];
        }
    }
}

/**
 * Обновляет позиции моделей во время анимации.
 * Вызывается каждый кадр из main.ts.
 */
export function animateLootMeshes() {
    const now = performance.now();
    for (const bagId in lootAnimations) {
        const anim = lootAnimations[bagId];
        const mesh = lootMeshes[bagId];
        if (!mesh) continue;

        let t = (now - anim.startTime) / (anim.duration * 1000);
        if (t >= 1.0) {
            t = 1.0;
            delete lootAnimations[bagId]; // анимация завершена
        }

        // Вычисляем среднюю точку для дуги
        const midX = (anim.startPos.x + anim.targetPos.x) / 2;
        const midZ = (anim.startPos.z + anim.targetPos.z) / 2;
        const controlY = anim.startPos.y + 2.5; // высота дуги

        // Квадратичная кривая Безье для плавного полёта по дуге
        const curve = new THREE.QuadraticBezierCurve3(
            anim.startPos,
            new THREE.Vector3(midX, controlY, midZ),
            anim.targetPos
        );

        const point = curve.getPoint(t);
        mesh.position.copy(point);
        const groundY = getTerrainHeightAt(mesh.position.x, mesh.position.z);
        mesh.position.y = Math.max(mesh.position.y, groundY + 0.3);

        // Лёгкое вращение для эффекта
        mesh.rotation.x += 0.1;
        mesh.rotation.y += 0.1;
    }
}