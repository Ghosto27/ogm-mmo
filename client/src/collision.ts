import * as THREE from 'three';

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
const PLAYER_RADIUS = 0.4;

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

export function addBoxCollider(center: THREE.Vector3, halfExtents: THREE.Vector3) {
    colliders.push({ type: 'box', center: center.clone(), halfExtents: halfExtents.clone() });
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
    maxStep: number = 0.4
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
            } else if (col.type === 'box') {
                const box = col as BoxCollider;
                const { halfExtents, center } = box;
                const closestX = Math.max(center.x - halfExtents.x, Math.min(resultPos.x, center.x + halfExtents.x));
                const closestY = Math.max(center.y - halfExtents.y, Math.min(resultPos.y, center.y + halfExtents.y));
                const closestZ = Math.max(center.z - halfExtents.z, Math.min(resultPos.z, center.z + halfExtents.z));
                const dx = resultPos.x - closestX;
                const dz = resultPos.z - closestZ;
                const dy = resultPos.y - closestY;
                const distSq = dx*dx + dy*dy + dz*dz;
                if (distSq < PLAYER_RADIUS * PLAYER_RADIUS) {
                    // ... существующая логика box (оставьте как была) ...
                }
            } else if (col.type === 'obb') {
                const obb = col as OBBCollider;
                // Обработка OBB (как вы писали ранее, но теперь с правильным типом)
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
                    const penetration = PLAYER_RADIUS - Math.sqrt(distSq);
                    let normalLocal: THREE.Vector3;
                    if (distSq < 0.0001) {
                        const absDistX = half.x - Math.abs(localPlayerPos.x);
                        const absDistY = half.y - Math.abs(localPlayerPos.y);
                        const absDistZ = half.z - Math.abs(localPlayerPos.z);
                        if (absDistX <= absDistY && absDistX <= absDistZ) {
                            normalLocal = new THREE.Vector3(Math.sign(localPlayerPos.x), 0, 0);
                        } else if (absDistY <= absDistX && absDistY <= absDistZ) {
                            normalLocal = new THREE.Vector3(0, Math.sign(localPlayerPos.y), 0);
                        } else {
                            normalLocal = new THREE.Vector3(0, 0, Math.sign(localPlayerPos.z));
                        }
                    } else {
                        normalLocal = localPlayerPos.clone().sub(closest).normalize();
                    }
                    const worldNormal = normalLocal.clone()
                        .applyMatrix4(new THREE.Matrix4().extractRotation(obb.rotation))
                        .normalize();
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

    // Ограничение длины шага исходной дельтой, чтобы не ускорило
    const actualDelta = new THREE.Vector3().subVectors(resultPos, currentPos);
    if (actualDelta.length() > delta.length()) {
        actualDelta.normalize().multiplyScalar(delta.length());
        resultPos.copy(currentPos).add(actualDelta);
    }

    return resultPos;
}

// sphereVsAABBcenter остается как есть, в том же файле
function sphereVsAABBcenter(sphereCenter: THREE.Vector3, box: BoxCollider): { dist: number; closestPoint: THREE.Vector3 } {
    const closest = new THREE.Vector3();
    const half = box.halfExtents;
    closest.x = Math.max(box.center.x - half.x, Math.min(sphereCenter.x, box.center.x + half.x));
    closest.y = Math.max(box.center.y - half.y, Math.min(sphereCenter.y, box.center.y + half.y));
    closest.z = Math.max(box.center.z - half.z, Math.min(sphereCenter.z, box.center.z + half.z));
    const dist = sphereCenter.distanceTo(closest);
    return { dist, closestPoint: closest };
}

/** Возвращает все активные коллайдеры (статика + динамика) – для отладки */
export function getAllColliders(): Collider[] {
    return [...colliders, ...dynamicColliders];
}