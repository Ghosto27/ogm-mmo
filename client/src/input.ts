import * as THREE from 'three';
import { getCameraYaw } from './cameraControls';

import { isChatActive } from './chat/chatInput';
import { normalizeKey } from './keyboard';

export let sprintKey = false;

// Temp vectors for getCameraRelativeMovement (one-time allocation, no GC pressure)
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();

// Состояние осей движения (для редактора и других потребителей)
export const inputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
};

// ---------- КЛАВИШИ ----------
const keys: Record<string, boolean> = {};

window.addEventListener('keydown', (e) => {
    if (isChatActive()) return;
    if (e.key === 'Shift') sprintKey = true;
    const normalized = normalizeKey(e.key);
    keys[normalized] = true;
    // Обновляем inputState
    if (normalized === 'w' || normalized === 'arrowup' || normalized === 'ц') inputState.forward = true;
    if (normalized === 's' || normalized === 'arrowdown' || normalized === 'ы') inputState.backward = true;
    if (normalized === 'a' || normalized === 'arrowleft' || normalized === 'ф') inputState.left = true;
    if (normalized === 'd' || normalized === 'arrowright' || normalized === 'в') inputState.right = true;
    if (normalized === 'q' || normalized === 'й') inputState.down = true;
    if (normalized === 'e' || normalized === 'у') inputState.up = true;
});
window.addEventListener('keyup', (e) => {
    if (isChatActive()) return;
    if (e.key === 'Shift') sprintKey = false;
    const normalized = normalizeKey(e.key);
    keys[normalized] = false;
    // Обновляем inputState
    if (normalized === 'w' || normalized === 'arrowup' || normalized === 'ц') inputState.forward = false;
    if (normalized === 's' || normalized === 'arrowdown' || normalized === 'ы') inputState.backward = false;
    if (normalized === 'a' || normalized === 'arrowleft' || normalized === 'ф') inputState.left = false;
    if (normalized === 'd' || normalized === 'arrowright' || normalized === 'в') inputState.right = false;
    if (normalized === 'q' || normalized === 'й') inputState.down = false;
    if (normalized === 'e' || normalized === 'у') inputState.up = false;
});

export function getMovementInput(): { x: number; z: number } {
    let x = 0, z = 0;
    if (keys['w'] || keys['arrowup'] || keys['ц']) z -= 1;
    if (keys['s'] || keys['arrowdown'] || keys['ы']) z += 1;
    if (keys['a'] || keys['arrowleft'] || keys['ф']) x += 1;
    if (keys['d'] || keys['arrowright'] || keys['в']) x -= 1;
    if (x !== 0 || z !== 0) {
        const len = Math.sqrt(x * x + z * z);
        x /= len;
        z /= len;
    }
    return { x, z };
}

// Движение относительно камеры (по yaw, чтобы не зависеть от lerp-позиции)
export function getCameraRelativeMovement(camera: THREE.Camera): THREE.Vector3 {
    const rawInput = getMovementInput();
    if (rawInput.x === 0 && rawInput.z === 0) {
        return _move.set(0, 0, 0);
    }

    const yaw = getCameraYaw();
    const sinYaw = Math.sin(yaw);
    const cosYaw = Math.cos(yaw);

    _forward.set(-sinYaw, 0, -cosYaw).normalize();
    _right.set(cosYaw, 0, -sinYaw).normalize();

    _move.set(0, 0, 0);
    _move.add(_forward.multiplyScalar(-rawInput.z));
    _move.add(_right.multiplyScalar(-rawInput.x));
    _move.normalize();

    return _move;
}