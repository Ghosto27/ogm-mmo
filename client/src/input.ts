import * as THREE from 'three';
import { room } from './network';
import { camera } from './scene';
import { otherPlayers } from './player';

// ---------- КЛАВИШИ ----------
const keys: Record<string, boolean> = {};

window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup',   (e) => { keys[e.key.toLowerCase()] = false; });

export function getMovementInput(): { x: number; z: number } {
    let x = 0, z = 0;
    if (keys['w'] || keys['arrowup'] || keys['ц']) z -= 1;
    if (keys['s'] || keys['arrowdown'] || keys['ы']) z += 1;
    if (keys['a'] || keys['arrowleft'] || keys['ф']) x -= 1;
    if (keys['d'] || keys['arrowright'] || keys['в']) x += 1;
    if (x !== 0 || z !== 0) {
        const len = Math.sqrt(x * x + z * z);
        x /= len;
        z /= len;
    }
    return { x, z };
}

// Новая функция: движение относительно камеры
export function getCameraRelativeMovement(camera: THREE.Camera): THREE.Vector3 {
    const rawInput = getMovementInput();
    if (rawInput.x === 0 && rawInput.z === 0) {
        return new THREE.Vector3(0, 0, 0);
    }

    // Получаем чистые направления камеры
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0; // Движение только по горизонтали
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    // Вычисляем итоговый вектор движения
    const move = new THREE.Vector3();
    move.add(forward.multiplyScalar(-rawInput.z)); // Вперёд/назад
    move.add(right.multiplyScalar(rawInput.x));    // Влево/вправо
    move.normalize();

    return move;
}