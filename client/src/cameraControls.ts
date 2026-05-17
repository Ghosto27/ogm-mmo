import * as THREE from 'three';
import { camera, renderer } from './scene';
import { getTerrainHeightAtFast } from './render/TerrainRenderer';

// === Over-the-Shoulder Camera State ===
let cameraTarget = new THREE.Vector3(0, 0, 0);  // Pivot point (player shoulder area)
let yaw = 0;                                      // Horizontal rotation (full 360°)
let pitch = 0.2;                                  // Vertical angle from horizon; positive = camera above pivot (look down), negative = camera below (look up)
let distance = 4;                                 // Distance from pivot

const MIN_PITCH = -0.5;                           // ~-30° below horizon (look up at sky)
const MAX_PITCH = 1.0;                            // ~+60° above horizon (look down at ground)
const MIN_DIST = 1.5;
const MAX_DIST = 10;

// Over-the-shoulder offset (camera positioned to right of player center)
const SHOULDER_OFFSET_X = 1.5;   // right bias in world units
const SHOULDER_OFFSET_Y = 0.3;   // slight upward bias

// Lerp smoothing speed
const LERP_SPEED = 8;

// Terrain collision offset — keep camera this high above terrain
const COLLISION_OFFSET = 0.3;

let currentCamPos = new THREE.Vector3(0, 0, 0);

// ----- Action / Cursor mode -----
export let actionMode = false;
export let isRightDragging = false;
let prevMouse = new THREE.Vector2();

/** Попытаться войти в Action‑режим (захватить мышь) */
export function enableActionMode() {
    if (!document.pointerLockElement) {
        renderer.domElement.requestPointerLock();
    }
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
        document.body.style.cursor = 'default';
    } else {
        document.body.style.cursor = 'none';
    }
});

export function setCameraTarget(x: number, y: number, z: number) {
    cameraTarget.set(x, y, z);
}

/**
 * Over-the-shoulder camera update.
 * Should be called every frame with deltaTime for smooth lerp.
 */
export function updateCamera(deltaTime: number) {
    const pivot = cameraTarget;

    // Pre-compute trig values
    const sinYaw = Math.sin(yaw);
    const cosYaw = Math.cos(yaw);
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);

    // 1. Calculate ideal camera position (behind pivot at distance)
    const idealPos = new THREE.Vector3(
        pivot.x + distance * cosPitch * sinYaw,
        pivot.y + distance * sinPitch,
        pivot.z + distance * cosPitch * cosYaw
    );

    // 2. Apply shoulder offset — full at close range, zero at max distance
    const distT = (distance - MIN_DIST) / (MAX_DIST - MIN_DIST);
    const shoulderScale = 1 - Math.min(1, Math.max(0, distT));
    const rightDir = new THREE.Vector3(cosYaw, 0, -sinYaw);
    idealPos.addScaledVector(rightDir, SHOULDER_OFFSET_X * shoulderScale);
    idealPos.y += SHOULDER_OFFSET_Y * shoulderScale;

    // 3. Terrain collision — prevent camera from going below terrain
    const terrainHeight = getTerrainHeightAtFast(idealPos.x, idealPos.z);
    const minY = terrainHeight + COLLISION_OFFSET;
    if (idealPos.y < minY) {
        idealPos.y = minY;
    }

    // 4. Lerp smoothing for camera movement
    if (currentCamPos.lengthSq() === 0) {
        currentCamPos.copy(idealPos);
    } else {
        const lerpFactor = Math.min(1, LERP_SPEED * deltaTime);
        currentCamPos.lerp(idealPos, lerpFactor);
    }

    // 5. Set camera position and look at pivot
    camera.position.copy(currentCamPos);
    camera.lookAt(pivot);
}

// ---------- Управление режимом камеры из UI ----------
export let uiWindowsOpen = 0;
let altToggled = false;

export function pushUIMode() {
    uiWindowsOpen++;
    if (uiWindowsOpen > 0) disableActionMode();
}

export function popUIMode() {
    uiWindowsOpen--;
    if (uiWindowsOpen <= 0) {
        uiWindowsOpen = 0;
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
        yaw -= e.movementX * sensitivity;
        pitch += e.movementY * sensitivity;
        if (pitch < MIN_PITCH) pitch = MIN_PITCH;
        if (pitch > MAX_PITCH) pitch = MAX_PITCH;
        return;
    }

    // В Cursor‑режиме вращаем камеру только при зажатой ПКМ
    if (!isRightDragging) return;
    const dx = e.clientX - prevMouse.x;
    const dy = e.clientY - prevMouse.y;
    prevMouse.set(e.clientX, e.clientY);
    const sensitivity = 0.01;
    yaw -= dx * sensitivity;
    pitch += dy * sensitivity;
    if (pitch < MIN_PITCH) pitch = MIN_PITCH;
    if (pitch > MAX_PITCH) pitch = MAX_PITCH;
});

renderer.domElement.addEventListener('wheel', (e) => {
    distance += e.deltaY * 0.01;
    if (distance < MIN_DIST) distance = MIN_DIST;
    if (distance > MAX_DIST) distance = MAX_DIST;
}, { passive: true });
