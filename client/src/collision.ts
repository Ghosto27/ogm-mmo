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
    center: THREE.Vector3;
    radius: number;
    height: number;
}

interface BoxCollider {
    type: 'box';
    center: THREE.Vector3;
    halfExtents: THREE.Vector3;
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

// Reusable temp objects for collision functions (avoids per-frame GC pressure)
const _stepDelta = new THREE.Vector3();
const _moveResultPos = new THREE.Vector3();
const _applyResultPos = new THREE.Vector3();
const _applyOriginalDelta = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _pushTo = new THREE.Vector3();
const _bestNormal = new THREE.Vector3();
const _bestPushTo = new THREE.Vector3();
const _tempVec = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _invRotation = new THREE.Matrix4();
const _extractRotation = new THREE.Matrix4();

// Для отладки (временный массив сфер, больше не используется, оставлен для совместимости)
export const allColliders = colliders;

// ---------- Функции добавления ----------

export function addSphereCollider(center: THREE.Vector3, radius: number) {
    colliders.push({ type: 'sphere', center: center.clone(), radius });
}

export function addCylinderCollider(baseCenter: THREE.Vector3, radius: number, height: number) {
    colliders.push({ type: 'cylinder', center: baseCenter.clone(), radius, height });
}

export function addOBBCollider(center: THREE.Vector3, halfExtents: THREE.Vector3, rotation: THREE.Quaternion) {
    const rotMatrix = new THREE.Matrix4().makeRotationFromQuaternion(rotation);
    colliders.push({ type: 'obb', center: center.clone(), halfExtents: halfExtents.clone(), rotation: rotMatrix });
}


// Reusable pool for dynamic collider entries (avoids per-frame object literals)
const _dynColPool: Collider[] = [];
let _dynColCount = 0;

/**
 * Обновить список динамических коллайдеров (другие игроки, мобы).
 * Вызывается из игрового цикла каждый кадр перед проверкой движения.
 */
export function updateDynamicColliders(
    entities: { position: THREE.Vector3; radius: number }[]
) {
    dynamicColliders.length = 0;
    _dynColCount = 0;
    for (const e of entities) {
        if (_dynColCount < _dynColPool.length) {
            const entry = _dynColPool[_dynColCount];
            (entry as any).center = e.position;
            (entry as any).radius = e.radius;
            dynamicColliders.push(entry);
        } else {
            dynamicColliders.push({ type: 'sphere', center: e.position, radius: e.radius });
            _dynColPool.push(dynamicColliders[dynamicColliders.length - 1]);
        }
        _dynColCount++;
    }
}

// ---------- Основной метод движения со слайдингом ----------

export function applyMovementWithCollisions(
    currentPos: THREE.Vector3,
    rawDelta: THREE.Vector3,
    maxStep: number = 0.2
): THREE.Vector3 {
    const totalDist = rawDelta.length();
    if (totalDist === 0) return _moveResultPos.copy(currentPos);

    const steps = Math.max(1, Math.ceil(totalDist / maxStep));
    _stepDelta.copy(rawDelta).divideScalar(steps);

    _moveResultPos.copy(currentPos);

    for (let s = 0; s < steps; s++) {
        _moveResultPos.copy(applySingleStep(_moveResultPos, _stepDelta));
    }

    return _moveResultPos;
}

// Вспомогательная функция одного шага (копия оригинального кода без изменений)
function applySingleStep(currentPos: THREE.Vector3, delta: THREE.Vector3): THREE.Vector3 {
    const MAX_ITERATIONS = 3;
    _applyResultPos.copy(currentPos).add(delta);
    _applyOriginalDelta.copy(delta);

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        let collided = false;
        let minDistSq = Infinity;

        for (let pass = 0; pass < 2; pass++) {
            const cols = pass === 0 ? colliders : dynamicColliders;
            if (pass === 1 && dynamicColliders.length === 0) continue;

            for (const col of cols) {
                if (col.type === 'sphere') {
                    const distSq = _applyResultPos.distanceToSquared(col.center);
                    const touchDist = col.radius + PLAYER_RADIUS;
                    if (distSq < touchDist * touchDist) {
                        if (distSq < minDistSq) {
                            minDistSq = distSq;
                            _normal.subVectors(_applyResultPos, col.center).normalize();
                            _pushTo.copy(col.center).addScaledVector(_normal, col.radius + PLAYER_RADIUS);
                            _bestNormal.copy(_normal);
                            _bestPushTo.copy(_pushTo);
                            collided = true;
                        }
                    }
                } else if (col.type === 'cylinder') {
                    const playerBottom = _applyResultPos.y;
                    const playerTop = _applyResultPos.y + PLAYER_RADIUS * 2;
                    if (playerTop > col.center.y && playerBottom < col.center.y + col.height) {
                        const dx = _applyResultPos.x - col.center.x;
                        const dz = _applyResultPos.z - col.center.z;
                        const distXZ = Math.sqrt(dx * dx + dz * dz);
                        const touchDist = col.radius + PLAYER_RADIUS;
                        if (distXZ < touchDist) {
                            if (distXZ < 0.001) {
                                _normal.set(1, 0, 0);
                                _pushTo.set(col.center.x + 1 * touchDist, _applyResultPos.y, col.center.z);
                            } else {
                                const normX = dx / distXZ;
                                const normZ = dz / distXZ;
                                _normal.set(normX, 0, normZ);
                                _pushTo.set(col.center.x + normX * touchDist, _applyResultPos.y, col.center.z + normZ * touchDist);
                            }
                            _bestNormal.copy(_normal);
                            _bestPushTo.copy(_pushTo);
                            collided = true;
                            minDistSq = 0;
                        }
                    }
                } else if (col.type === 'obb') {
                    const obb = col as OBBCollider;
                    _invRotation.copy(obb.rotation).invert();
                    _tempVec.copy(_applyResultPos).sub(obb.center).applyMatrix4(_invRotation);

                    const half = obb.halfExtents;
                    _closest.set(
                        Math.max(-half.x, Math.min(_tempVec.x, half.x)),
                        Math.max(-half.y, Math.min(_tempVec.y, half.y)),
                        Math.max(-half.z, Math.min(_tempVec.z, half.z))
                    );
                    const distSq = _tempVec.distanceToSquared(_closest);

                    if (distSq < PLAYER_RADIUS * PLAYER_RADIUS) {
                        _normal.copy(_tempVec).sub(_closest).normalize();
                        _extractRotation.extractRotation(obb.rotation);
                        _normal.applyMatrix4(_extractRotation).normalize();

                        const isTopSurface = _normal.y > 0.7;

                        if (!isTopSurface) {
                            const topLocalY = half.y;
                            _tempVec.set(_closest.x, topLocalY, _closest.z)
                                .applyMatrix4(obb.rotation)
                                .add(obb.center);
                            if (_tempVec.y <= _applyResultPos.y + MAX_STEP_HEIGHT) {
                                _applyResultPos.y = _tempVec.y + PLAYER_RADIUS;
                                continue;
                            }
                        }

                        const penetration = PLAYER_RADIUS - Math.sqrt(distSq);
                        _pushTo.copy(_applyResultPos).addScaledVector(_normal, penetration);
                        if (distSq < minDistSq) {
                            minDistSq = distSq;
                            _bestNormal.copy(_normal);
                            _bestPushTo.copy(_pushTo);
                            collided = true;
                        }
                    }
                }
            }
        }

        if (!collided) break;

        _applyResultPos.copy(_bestPushTo);
        _normal.copy(_bestNormal).multiplyScalar(_applyOriginalDelta.dot(_bestNormal));
        _tempVec.copy(_applyOriginalDelta).sub(_normal);
        _applyOriginalDelta.copy(_tempVec);
        _applyResultPos.add(_tempVec);
    }

    const groundY = computeGroundHeight(_applyResultPos);
    _applyResultPos.y = groundY + PLAYER_RADIUS;

    _tempVec.subVectors(_applyResultPos, currentPos);
    if (_tempVec.length() > delta.length()) {
        _tempVec.normalize().multiplyScalar(delta.length());
        _applyResultPos.copy(currentPos).add(_tempVec);
    }

    return _applyResultPos;
}

/** Вычисляет высоту опоры (пола) под текущей позицией игрока (XZ) */
function computeGroundHeight(pos: THREE.Vector3): number {
    let bestY = -Infinity;

    for (const col of colliders) {
        if (col.type === 'obb') {
            const obb = col as OBBCollider;
            _invRotation.copy(obb.rotation).invert();
            _tempVec.copy(pos).sub(obb.center).applyMatrix4(_invRotation);

            const half = obb.halfExtents;
            const hTolerance = 0.25;
            if (Math.abs(_tempVec.x) <= half.x + PLAYER_RADIUS + hTolerance &&
                Math.abs(_tempVec.z) <= half.z + PLAYER_RADIUS + hTolerance) {
                const topLocalY = half.y;
                _tempVec.set(_tempVec.x, topLocalY, _tempVec.z)
                    .applyMatrix4(obb.rotation)
                    .add(obb.center);
                const groundY = _tempVec.y;
                if (groundY <= pos.y + MAX_STEP_HEIGHT && groundY > bestY) {
                    bestY = groundY;
                }
            }
        }
    }

    const terrainY = getTerrainHeightAt(pos.x, pos.z);
    if (bestY < terrainY) {
        bestY = terrainY;
    }

    return bestY;
}

/** Возвращает все активные коллайдеры (статика + динамика) – для отладки */
export function getAllColliders(): Collider[] {
    return [...colliders, ...dynamicColliders];
}