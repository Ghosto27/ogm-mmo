import * as THREE from 'three';
import { camera, renderer } from './scene';

let cameraTarget = new THREE.Vector3(0, 0, 0);
let theta = 0;
let phi = Math.PI / 4;
let distance = 5;
const MIN_PHI = 0.1;
const MAX_PHI = Math.PI / 2.2;
const MIN_DIST = 1.5;
const MAX_DIST = 15;

export let isRightDragging = false;
let prevMouse = new THREE.Vector2();

// ----- Action / Cursor mode -----
export let actionMode = false;            // реальное состояние (синхронизируется с pointer‑lock)

/** Попытаться войти в Action‑режим (захватить мышь) */
export function enableActionMode() {
    if (!document.pointerLockElement) {
        renderer.domElement.requestPointerLock();
    }
    // Если захват уже активен, флаг будет обновлён в pointerlockchange
}

/** Принудительно выйти из Action‑режима (показать курсор) */
export function disableActionMode() {
    if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock();
    }
}

// Обработчик смены состояния захвата
document.addEventListener('pointerlockchange', () => {
    const isLocked = document.pointerLockElement === renderer.domElement;
    if (isLocked !== actionMode) {
        console.log(`[CAMERA] Action mode: ${isLocked ? 'ON' : 'OFF'}`);
    }
    actionMode = isLocked;
    if (!isLocked) {
        // Если захват снят (Escape, Alt, UI), можно установить курсор по умолчанию
        document.body.style.cursor = 'default';
    } else {
        document.body.style.cursor = 'none';
    }
});

// Если захват потерян не по нашей воле (например, Escape), ничего страшного,
// следующий клик/нажатие в canvas снова запросит захват (см. main.ts)

export function setCameraTarget(x: number, y: number, z: number) {
    cameraTarget.set(x, y, z);
}

export function updateCamera() {
    const camX = cameraTarget.x + distance * Math.sin(phi) * Math.sin(theta);
    const camY = cameraTarget.y + distance * Math.cos(phi);
    const camZ = cameraTarget.z + distance * Math.sin(phi) * Math.cos(theta);
    camera.position.set(camX, camY, camZ);
    camera.lookAt(cameraTarget);
}

// ---------- Управление режимом камеры из UI ----------
export let uiWindowsOpen = 0;
let altToggled = false;

export function pushUIMode() {
    //console.trace('pushUIMode called');
    uiWindowsOpen++;
    if (uiWindowsOpen > 0) disableActionMode();
}

export function popUIMode() {
    //console.trace('popUIMode called');
    uiWindowsOpen--;
    if (uiWindowsOpen <= 0) {
        uiWindowsOpen = 0;
        // Always try to re-enable action mode when the last UI window closes.
        // Do NOT check altToggled here — that check causes a race condition where
        // pressing Alt while a UI window is open leaves the user stuck in cursor mode
        // after the window closes (the pop already happened, Alt toggle can't re-trigger it).
        enableActionMode();
    }
}

/** Переключить состояние Alt (true – Cursor Mode, false – Action Mode) */
export function toggleAltMode() {
    altToggled = !altToggled;
}

/** Проверить, включён ли Cursor Mode через Alt */
export function isAltToggled(): boolean {
    return altToggled;
}

// ---------- Управление мышью ----------
window.addEventListener('mousedown', (e) => {
    if (e.button === 2) {
        isRightDragging = true;
        prevMouse.set(e.clientX, e.clientY);
    }
});

window.addEventListener('mouseup', (e) => {
    if (e.button === 2) {
        isRightDragging = false;
    }
});

window.addEventListener('mousemove', (e) => {
    // В Action‑режиме (захват активен) используем movementX/Y
    if (actionMode) {
        const sensitivity = 0.002;
        theta -= e.movementX * sensitivity;
        phi -= e.movementY * sensitivity;
        if (phi < MIN_PHI) phi = MIN_PHI;
        if (phi > MAX_PHI) phi = MAX_PHI;
        return;
    }

    // В Cursor‑режиме вращаем камеру только при зажатой ПКМ
    if (!isRightDragging) return;
    const dx = e.clientX - prevMouse.x;
    const dy = e.clientY - prevMouse.y;
    prevMouse.set(e.clientX, e.clientY);
    const sensitivity = 0.01;
    theta -= dx * sensitivity;
    phi -= dy * sensitivity;
    if (phi < MIN_PHI) phi = MIN_PHI;
    if (phi > MAX_PHI) phi = MAX_PHI;
});

renderer.domElement.addEventListener('wheel', (e) => {
    distance += e.deltaY * 0.01;
    if (distance < MIN_DIST) distance = MIN_DIST;
    if (distance > MAX_DIST) distance = MAX_DIST;
}, { passive: true });