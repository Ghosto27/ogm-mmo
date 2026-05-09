import * as THREE from 'three';
import { localModel, otherPlayers, mixers, hpBars, localHpBar, actions, fsm } from './player';

const targetPositions: { [id: string]: THREE.Vector3 } = {};
const INTERPOLATION_SPEED = 10.0;

export function setTargetPosition(id: string, x: number, z: number, y?: number) {
    if (!targetPositions[id]) targetPositions[id] = new THREE.Vector3(x, y ?? 0, z);
    else targetPositions[id].set(x, y ?? targetPositions[id].y, z);
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
        model.position.y = lerp(model.position.y, target.y, t);
        model.position.z = lerp(model.position.z, target.z, t);
        /* // Для удалённых игроков корректируем высоту по ландшафту
        if (id !== 'local') {
            const y = getTerrainHeightAt(model.position.x, model.position.z);
            model.position.y = y + 0.1;
        } */
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