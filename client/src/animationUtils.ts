import * as THREE from 'three';
import { localModel, otherPlayers, mixers, hpBars, localHpBar, actions, fsm } from './player';
import { mobModels } from './mobPlayer';

const targetPositions: { [id: string]: THREE.Vector3 } = {};
const INTERPOLATION_SPEED = 10.0;

export function setTargetPosition(id: string, x: number, z: number) {
    if (!targetPositions[id]) targetPositions[id] = new THREE.Vector3(x, 0, z);
    else targetPositions[id].set(x, 0, z);
}

function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

export function updateAnimations(deltaTime: number) {
    //console.log('[ANIM] updateAnimations called, mixers:', Object.keys(mixers).length);
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
            bar.position.y = model.position.y + 3;
        }
    }

    // Диагностика: проверяем завершение одноразовых анимаций
    for (const id in mixers) {
        const fsmObj = fsm[id];
        //console.log(`[CHECK] ${id} isPlayingOneShot=${fsmObj?.isPlayingOneShot}`);
        if (!fsmObj || !fsmObj.isPlayingOneShot) continue;
        const curState = fsmObj.currentStateName;
        const action = actions[id]?.[curState || ''];
        if (!action) continue;
        const elapsed = action.time;
        const duration = action.getClip().duration;
        //console.log(`[CHECK] ${id} "${curState}" time=${elapsed.toFixed(3)}/${duration.toFixed(3)} running=${action.isRunning()}`);
        if (!action.isRunning() || elapsed >= duration) {
            //console.log(`[CHECK] ${id} marking as finished, returning to idle`);
            fsmObj.isPlayingOneShot = false;
            Object.values(actions[id]).forEach(a => {
                if (a && a.loop === THREE.LoopRepeat) a.paused = false;
            });
            if (curState !== 'death') {
                fsmObj.transitionTo('idle', 0.2);
            }
        }
    }
}