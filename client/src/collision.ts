import * as THREE from 'three';
import { getTerrainHeightAt } from './render/TerrainRenderer';

// ---------- Типы коллизий ----------
interface SphereCollider {
    type: 'sphere';
    center: THREE.Vector3;
    radius: number;
}

interface CylinderCollider {
    type: 'cylinder';
    center: THREE.Vector3;   // центр нижнего основания
    radius: number;
    height: number;
}

interface BoxCollider {
    type: 'box';
    center: THREE.Vector3;      // центр коробки
    halfExtents: THREE.Vector3; // половинные размеры по осям
}

interface OBBCollider {
    type: 'obb';
    center: THREE.Vector3;
    halfExtents: THREE.Vector3;
    rotation: THREE.Matrix4;   // матрица поворота (или можно Quaternion, но Matrix4 удобнее)
}

type Collider = SphereCollider | CylinderCollider | BoxCollider | OBBCollider;

// ---------- Хранилище ----------
const colliders: Collider[] = [];
// Динамические коллайдеры (другие игроки, мобы) – обновляются каждый кадр
let dynamicColliders: Collider[] = [];
export const PLAYER_RADIUS = 0.4;
const MAX_STEP_HEIGHT = 0.4;   // высота, на которую игрок может "запрыгнуть"

// Для отладки (временный массив сфер, больше не используется, оставлен для совместимости)
export const colliderSpheres: THREE.Sphere[] = [];
export const allColliders = colliders;

// ---------- Функции добавления ----------

export function addSphereCollider(center: THREE.Vector3, radius: number) {
    colliders.push({ type: 'sphere', center: center.clone(), radius });
    colliderSpheres.push(new THREE.Sphere(center.clone(), radius));
}

export function addCylinderCollider(baseCenter: THREE.Vector3, radius: number, height: number) {
    colliders.push({ type: 'cylinder', center: baseCenter.clone(), radius, height });
}

export function addOBBCollider(center: THREE.Vector3, halfExtents: THREE.Vector3, rotation: THREE.Quaternion) {
    const rotMatrix = new THREE.Matrix4().makeRotationFromQuaternion(rotation);
    colliders.push({ type: 'obb', center: center.clone(), halfExtents: halfExtents.clone(), rotation: rotMatrix });
}

export function clearColliders() {
    colliders.length = 0;
    colliderSpheres.length = 0;
}

/**
 * Обновить список динамических коллайдеров (другие игроки, мобы).
 * Вызывается из игрового цикла каждый кадр перед проверкой движения.
 */
export function updateDynamicColliders(
    entities: { position: THREE.Vector3; radius: number }[]
) {
    dynamicColliders = entities.map(e => ({
        type: 'sphere',
        center: e.position.clone(),
        radius: e.radius,
    } as SphereCollider));
}

// ---------- Проверки и вспомогательные функции ----------

const playerSphere = new THREE.Sphere(new THREE.Vector3(), PLAYER_RADIUS);


// ---------- Основной метод движения со слайдингом ----------

export function applyMovementWithCollisions(
    currentPos: THREE.Vector3,
    rawDelta: THREE.Vector3,
    maxStep: number = 0.2
): THREE.Vector3 {
    const totalDist = rawDelta.length();
    if (totalDist === 0) return currentPos.clone();

    const steps = Math.max(1, Math.ceil(totalDist / maxStep));
    const stepDelta = rawDelta.clone().divideScalar(steps);

    let resultPos = currentPos.clone();
    let remainingDelta = rawDelta.clone(); // для слайдинга внутри шага (будет перезаписываться)

    for (let s = 0; s < steps; s++) {
        // Выполняем один суб-шаг с существующей логикой коллизий, но ограниченный stepDelta
        // Используем отдельную функцию, чтобы не дублировать код. Просто вызываем applyMovementOnce?
        // Мы не можем рекурсивно вызвать, создадим внутренний цикл итераций как раньше, но для stepDelta.
        const subResult = applySingleStep(resultPos, stepDelta);
        resultPos.copy(subResult);
    }

    return resultPos;
}

// Вспомогательная функция одного шага (копия оригинального кода без изменений)
function applySingleStep(currentPos: THREE.Vector3, delta: THREE.Vector3): THREE.Vector3 {
    const MAX_ITERATIONS = 3;
    let resultPos = currentPos.clone().add(delta);
    let originalDelta = delta.clone();

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        let collided = false;
        let closestInfo: { normal: THREE.Vector3; pushTo: THREE.Vector3 } | null = null;
        let minDistSq = Infinity;

        const all = [...colliders, ...dynamicColliders];
        const playerSphere = new THREE.Sphere(new THREE.Vector3(), PLAYER_RADIUS);

        for (const col of all) {
            if (col.type === 'sphere') {
                const distSq = resultPos.distanceToSquared(col.center);
                const touchDist = col.radius + PLAYER_RADIUS;
                if (distSq < touchDist * touchDist) {
                    if (distSq < minDistSq) {
                        minDistSq = distSq;
                        const normal = new THREE.Vector3().subVectors(resultPos, col.center).normalize();
                        const pushTo = col.center.clone().addScaledVector(normal, col.radius + PLAYER_RADIUS);
                        closestInfo = { normal, pushTo };
                        collided = true;
                    }
                }
            } else if (col.type === 'cylinder') {
                const playerBottom = resultPos.y;
                const playerTop = resultPos.y + PLAYER_RADIUS * 2;
                if (playerTop > col.center.y && playerBottom < col.center.y + col.height) {
                    const dx = resultPos.x - col.center.x;
                    const dz = resultPos.z - col.center.z;
                    const distXZ = Math.sqrt(dx * dx + dz * dz);
                    const touchDist = col.radius + PLAYER_RADIUS;
                    if (distXZ < touchDist) {
                        if (distXZ < 0.001) {
                            const arbitrary = new THREE.Vector3(1, 0, 0);
                            const pushTo = new THREE.Vector3(col.center.x + arbitrary.x * touchDist, resultPos.y, col.center.z);
                            closestInfo = { normal: arbitrary, pushTo };
                        } else {
                            const normX = dx / distXZ;
                            const normZ = dz / distXZ;
                            const pushTo = new THREE.Vector3(
                                col.center.x + normX * touchDist,
                                resultPos.y,
                                col.center.z + normZ * touchDist
                            );
                            closestInfo = { normal: new THREE.Vector3(normX, 0, normZ), pushTo };
                        }
                        collided = true;
                        minDistSq = 0;
                    }
                }
            } else if (col.type === 'obb') {
                const obb = col as OBBCollider;
                const invRotation = new THREE.Matrix4().copy(obb.rotation).invert();
                const localPlayerPos = resultPos.clone().sub(obb.center).applyMatrix4(invRotation);

                const half = obb.halfExtents;
                const closest = new THREE.Vector3(
                    Math.max(-half.x, Math.min(localPlayerPos.x, half.x)),
                    Math.max(-half.y, Math.min(localPlayerPos.y, half.y)),
                    Math.max(-half.z, Math.min(localPlayerPos.z, half.z))
                );
                const distSq = localPlayerPos.distanceToSquared(closest);

                if (distSq < PLAYER_RADIUS * PLAYER_RADIUS) {
                    const localNormal = localPlayerPos.clone().sub(closest).normalize();
                    const worldNormal = localNormal.clone()
                        .applyMatrix4(new THREE.Matrix4().extractRotation(obb.rotation))
                        .normalize();

                    // Определяем, пол (верхняя грань) или стена/наклон
                    const isTopSurface = worldNormal.y > 0.7;

                    if (!isTopSurface) {
                        // Стена или наклонная грань – проверяем, можно ли "зашагнуть"
                        const topLocalY = half.y;
                        const topWorldY = new THREE.Vector3(closest.x, topLocalY, closest.z)
                            .applyMatrix4(obb.rotation)
                            .add(obb.center).y;
                        if (topWorldY <= resultPos.y + MAX_STEP_HEIGHT) {
                            // Зашагиваем: поднимаем игрока на верхнюю грань
                            resultPos.y = topWorldY + PLAYER_RADIUS;
                            continue; // не выталкиваем
                        }
                    }

                    // Обычное выталкивание (включая пол, если isTopSurface)
                    const penetration = PLAYER_RADIUS - Math.sqrt(distSq);
                    const pushTo = resultPos.clone().addScaledVector(worldNormal, penetration);
                    if (distSq < minDistSq) {
                        minDistSq = distSq;
                        closestInfo = { normal: worldNormal, pushTo };
                        collided = true;
                    }
                }
            }
        }

        if (!collided) break;

        const info = closestInfo!;
        resultPos.copy(info.pushTo);
        const normalComponent = info.normal.clone().multiplyScalar(originalDelta.dot(info.normal));
        const tangentDelta = originalDelta.clone().sub(normalComponent);
        originalDelta.copy(tangentDelta);
        resultPos.add(tangentDelta);
    }

    // Находим опору под ногами и ставим игрока так, чтобы его низ касался поверхности
    const groundY = computeGroundHeight(resultPos);
    resultPos.y = groundY + PLAYER_RADIUS;

    // Ограничение длины шага исходной дельтой, чтобы не ускорило
    const actualDelta = new THREE.Vector3().subVectors(resultPos, currentPos);
    if (actualDelta.length() > delta.length()) {
        actualDelta.normalize().multiplyScalar(delta.length());
        resultPos.copy(currentPos).add(actualDelta);
    }

    return resultPos;
}

/** Вычисляет высоту опоры (пола) под текущей позицией игрока (XZ) */
function computeGroundHeight(pos: THREE.Vector3): number {
    let bestY = -Infinity;
    const halfHeight = PLAYER_RADIUS; // нижняя точка коллайдера

    for (const col of colliders) {
        if (col.type === 'obb') {
            const obb = col as OBBCollider;
            // Переводим точку под ногами в локальную систему OBB
            const localPoint = pos.clone().sub(obb.center).applyMatrix4(
                new THREE.Matrix4().copy(obb.rotation).invert()
            );
            const half = obb.halfExtents;
            const hTolerance = 0.25; // дополнительный допуск, чтобы "нащупать" ступеньку перед игроком
            if (Math.abs(localPoint.x) <= half.x + PLAYER_RADIUS + hTolerance &&
                Math.abs(localPoint.z) <= half.z + PLAYER_RADIUS + hTolerance) {
                // Верхняя грань OBB в локальных координатах
                const topLocalY = half.y;
                // Преобразуем точку на верхней грани обратно в мировые
                const topWorldPoint = new THREE.Vector3(localPoint.x, topLocalY, localPoint.z)
                    .applyMatrix4(obb.rotation)
                    .add(obb.center);
                const groundY = topWorldPoint.y;
                // Опора не должна быть выше, чем разрешённый шаг
                if (groundY <= pos.y + MAX_STEP_HEIGHT && groundY > bestY) {
                    bestY = groundY;
                }
            }
        }
        // другие типы коллизий (сферы, цилиндры) можно добавить позже
    }

    // Если OBB-опора не найдена или она ниже террейна, использовать террейн
    const terrainY = getTerrainHeightAt(pos.x, pos.z); // +0.2 (половина радиуса, чтобы не тонуть)
    if (bestY < terrainY) {
        bestY = terrainY;
    }

    return bestY;
}

/** Возвращает все активные коллайдеры (статика + динамика) – для отладки */
export function getAllColliders(): Collider[] {
    return [...colliders, ...dynamicColliders];
}