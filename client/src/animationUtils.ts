import * as THREE from 'three';
import { localModel, otherPlayers, mixers, hpBars, localHpBar, actions, fsm } from './player';

const targetPositions: { [id: string]: THREE.Vector3 } = {};
const INTERPOLATION_SPEED = 10.0;

let lastAnimTime: number | null = null;
let lastLogTime = 0;

export function setTargetPosition(id: string, x: number, z: number, y?: number) {
    if (!targetPositions[id]) targetPositions[id] = new THREE.Vector3(x, y ?? 0, z);
    else targetPositions[id].set(x, y ?? targetPositions[id].y, z);
}
function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

export function updateAnimations(deltaTime: number) {
    // Log local player animation time before mixer update to detect loops/jumps
    if (fsm && fsm['local']) {
        const stateName = fsm['local'].currentStateName;
        if (stateName && actions && actions['local']) {
            const action = actions['local'][stateName];
            if (action && action.isRunning()) {
                const now = performance.now();
                const animTime = action.time;
                const animDuration = action.getClip().duration;
                
                // Log when animation loops (time wraps around)
                if (lastAnimTime !== null && animTime < lastAnimTime - 0.01) {
                    console.log(`[ANIM] ${stateName} LOOPED: time ${lastAnimTime.toFixed(3)} → ${animTime.toFixed(3)}, dur=${animDuration.toFixed(3)}, dt=${deltaTime.toFixed(4)}`);
                }
                // Log large time jumps (>30ms worth of animation)
                if (lastAnimTime !== null && (animTime - lastAnimTime) > deltaTime + 0.03) {
                    console.warn(`[ANIM] ${stateName} TIME JUMP: ${lastAnimTime.toFixed(3)} → ${animTime.toFixed(3)} (expected +${deltaTime.toFixed(4)}), dur=${animDuration.toFixed(3)}`);
                }
                // Log long frames
                if (deltaTime > 0.05) {
                    console.warn(`[ANIM] Long frame: dt=${(deltaTime*1000).toFixed(1)}ms, state=${stateName}, animTime=${animTime.toFixed(3)}/${animDuration.toFixed(3)}`);
                }
                lastAnimTime = animTime;
            } else {
                lastAnimTime = null;
            }
        } else {
            lastAnimTime = null;
        }
    }

    // Обновляем все скелетные миксеры
    for (const id in mixers) {
        mixers[id].update(deltaTime);
    }

    // Интерполяция позиций
    for (const id in targetPositions) {
        const model = id === 'local' ? localModel : otherPlayers[id];
        if (!model) continue;
        const target = targetPositions[id];
        const t = Math.min(INTERPOLATION_SPEED * deltaTime, 1.0);
        model.position.x = lerp(model.position.x, target.x, t);
        model.position.y = lerp(model.position.y, target.y, t);
        model.position.z = lerp(model.position.z, target.z, t);
    }

    // Перемещаем HP-бары за моделями
    for (const id of Object.keys(mixers)) {
        const model = id === 'local' ? localModel : otherPlayers[id];
        if (!model) continue;
        const bar = id === 'local' ? localHpBar : hpBars[id];
        if (bar && bar.visible) {
            bar.position.x = model.position.x;
            bar.position.z = model.position.z;
            bar.position.y = model.position.y + 2;
        }
    }


}