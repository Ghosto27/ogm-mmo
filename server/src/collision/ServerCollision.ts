// server/src/collision/ServerCollision.ts
import { villageData } from '../data/locations/village';

interface SphereCollider {
    type: 'sphere';
    centerX: number;
    centerZ: number;
    radius: number;
}

interface BoxCollider {
    type: 'box';
    centerX: number;
    centerZ: number;
    halfWidth: number;
    halfDepth: number;
}

type Collider = SphereCollider | BoxCollider;

const colliders: Collider[] = [];
const PLAYER_RADIUS = 0.4;

export function initServerColliders(): void {
    // Импортируем данные деревни

    colliders.length = 0;

    for (const obj of villageData) {
        const x = obj.x;
        const z = obj.z;

        if (obj.modelName === 'cube') {
            const halfW = (obj.scaleX || 1) / 2;
            const halfD = (obj.scaleZ || 1) / 2;
            colliders.push({
                type: 'box',
                centerX: x,
                centerZ: z,
                halfWidth: halfW,
                halfDepth: halfD,
            });
        } else if (obj.modelName === 'cylinder') {
            // колодец – представляем как сферу или цилиндр, обойдёмся сферой с радиусом scaleX
            colliders.push({
                type: 'sphere',
                centerX: x,
                centerZ: z,
                radius: obj.scaleX || 1, // радиус = scaleX
            });
        }
    }

    console.log(`[SERVER-COLLISION] Загружено ${colliders.length} коллизий деревни`);
}

/** Проверка: пересекает ли круг (моб) какой-либо коллайдер */
export function isPositionBlocked(mobX: number, mobZ: number, mobRadius: number): boolean {
    for (const col of colliders) {
        if (col.type === 'sphere') {
            const dx = mobX - col.centerX;
            const dz = mobZ - col.centerZ;
            const distSq = dx * dx + dz * dz;
            const touchDist = col.radius + mobRadius;
            if (distSq < touchDist * touchDist) {
                return true;
            }
        } else if (col.type === 'box') {
            const closestX = Math.max(col.centerX - col.halfWidth, Math.min(mobX, col.centerX + col.halfWidth));
            const closestZ = Math.max(col.centerZ - col.halfDepth, Math.min(mobZ, col.centerZ + col.halfDepth));
            const dx = mobX - closestX;
            const dz = mobZ - closestZ;
            if (dx * dx + dz * dz < mobRadius * mobRadius) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Перемещение моба с учётом коллизий (слайдинг).
 * @param currentX, currentZ – текущая позиция
 * @param deltaX, deltaZ – желаемое смещение
 * @param mobRadius – радиус коллизии моба
 * @returns { x, z } – результирующая позиция
 */
export function applyMobMovementWithCollisions(
    currentX: number, currentZ: number,
    deltaX: number, deltaZ: number,
    mobRadius: number,
    maxStep: number = 0.4   // максимальная длина одного подшага
): { x: number; z: number } {
    const totalDist = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
    if (totalDist === 0) return { x: currentX, z: currentZ };

    const steps = Math.max(1, Math.ceil(totalDist / maxStep));
    const stepDeltaX = deltaX / steps;
    const stepDeltaZ = deltaZ / steps;

    let curX = currentX;
    let curZ = currentZ;

    for (let s = 0; s < steps; s++) {
        // Выполняем один суб-шаг с текущей логикой слайдинга
        const MAX_ITERATIONS = 3;
        let resultX = curX + stepDeltaX;
        let resultZ = curZ + stepDeltaZ;
        let remainingDX = stepDeltaX;
        let remainingDZ = stepDeltaZ;

        for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
            let collided = false;
            let closestInfo: { normalX: number; normalZ: number; pushToX: number; pushToZ: number } | null = null;
            let minDistSq = Infinity;

            for (const col of colliders) {
                if (col.type === 'sphere') {
                    const dx = resultX - col.centerX;
                    const dz = resultZ - col.centerZ;
                    const distSq = dx * dx + dz * dz;
                    const touchDist = col.radius + mobRadius;
                    if (distSq < touchDist * touchDist) {
                        if (distSq < minDistSq) {
                            minDistSq = distSq;
                            const dist = Math.sqrt(distSq);
                            const normX = dx / dist;
                            const normZ = dz / dist;
                            const pushToX = col.centerX + normX * touchDist;
                            const pushToZ = col.centerZ + normZ * touchDist;
                            closestInfo = { normalX: normX, normalZ: normZ, pushToX, pushToZ };
                            collided = true;
                        }
                    }
                } else if (col.type === 'box') {
                    const closestX = Math.max(col.centerX - col.halfWidth, Math.min(resultX, col.centerX + col.halfWidth));
                    const closestZ = Math.max(col.centerZ - col.halfDepth, Math.min(resultZ, col.centerZ + col.halfDepth));
                    const dx = resultX - closestX;
                    const dz = resultZ - closestZ;
                    const distSq = dx * dx + dz * dz;
                    if (distSq < mobRadius * mobRadius) {
                        if (distSq < 0.0001) {
                            const deltaToCenterX = resultX - col.centerX;
                            const deltaToCenterZ = resultZ - col.centerZ;
                            let pushX = 0, pushZ = 0;
                            if (Math.abs(deltaToCenterX) > Math.abs(deltaToCenterZ)) {
                                pushX = deltaToCenterX > 0 ? mobRadius : -mobRadius;
                            } else {
                                pushZ = deltaToCenterZ > 0 ? mobRadius : -mobRadius;
                            }
                            closestInfo = {
                                normalX: pushX / mobRadius,
                                normalZ: pushZ / mobRadius,
                                pushToX: resultX + pushX,
                                pushToZ: resultZ + pushZ,
                            };
                        } else {
                            const dist = Math.sqrt(distSq);
                            const normX = dx / dist;
                            const normZ = dz / dist;
                            const pushToX = closestX + normX * mobRadius;
                            const pushToZ = closestZ + normZ * mobRadius;
                            closestInfo = { normalX: normX, normalZ: normZ, pushToX, pushToZ };
                        }
                        collided = true;
                        minDistSq = 0;
                    }
                }
            }

            if (!collided) break;

            const info = closestInfo!;
            resultX = info.pushToX;
            resultZ = info.pushToZ;

            const dot = remainingDX * info.normalX + remainingDZ * info.normalZ;
            const tangentX = remainingDX - info.normalX * dot;
            const tangentZ = remainingDZ - info.normalZ * dot;

            remainingDX = tangentX;
            remainingDZ = tangentZ;

            resultX += remainingDX;
            resultZ += remainingDZ;
        }

        // Ограничение длины шага исходной величиной (чтобы не ускоряться)
        const stepActualDX = resultX - curX;
        const stepActualDZ = resultZ - curZ;
        const stepActualLen = Math.sqrt(stepActualDX * stepActualDX + stepActualDZ * stepActualDZ);
        const stepDesiredLen = Math.sqrt(stepDeltaX * stepDeltaX + stepDeltaZ * stepDeltaZ);
        if (stepActualLen > stepDesiredLen && stepDesiredLen > 0) {
            const scale = stepDesiredLen / stepActualLen;
            resultX = curX + stepActualDX * scale;
            resultZ = curZ + stepActualDZ * scale;
        }

        curX = resultX;
        curZ = resultZ;
    }

    // Финальное ограничение общей длины (на всякий случай)
    const totalActualDX = curX - currentX;
    const totalActualDZ = curZ - currentZ;
    const totalActualLen = Math.sqrt(totalActualDX * totalActualDX + totalActualDZ * totalActualDZ);
    const totalDesiredLen = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
    if (totalActualLen > totalDesiredLen && totalDesiredLen > 0) {
        const scale = totalDesiredLen / totalActualLen;
        curX = currentX + totalActualDX * scale;
        curZ = currentZ + totalActualDZ * scale;
    }

    return { x: curX, z: curZ };
}

export function isPlayerPositionBlocked(x: number, z: number): boolean {
    return isPositionBlocked(x, z, PLAYER_RADIUS);
}