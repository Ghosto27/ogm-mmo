import * as THREE from 'three';
import { camera, renderer } from './scene';

export type CameraMode = 'default' | 'aiming' | 'blocking';

interface CameraConfig {
    distance: number;
    shoulderOffsetX: number;
    shoulderOffsetY: number;
    pitch: number;
    fov: number;
}

const MODE_CONFIGS: Record<CameraMode, CameraConfig> = {
    default:  { distance: 3.5, shoulderOffsetX: 0.0, shoulderOffsetY: 1.3, pitch: -0.4, fov: 50 },
    aiming:   { distance: 2.5, shoulderOffsetX: 0.5, shoulderOffsetY: 0.9, pitch: -0.2, fov: 50 },
    blocking: { distance: 3.5, shoulderOffsetX: 0.0, shoulderOffsetY: 0.5, pitch: -0.2, fov: 50 },
};

const TRANSITION_SPEED = 5;
const MIN_PITCH = -0.8;
const MAX_PITCH = 0.8;
const MIN_DIST = 1.5;
const MAX_DIST = 10;

// Current camera parameters
let cameraTarget = new THREE.Vector3(0, 0, 0);
let yaw = 0;
let pitch = -0.4;
let distance = 3.5;
let shoulderOffsetX = 0.0;
let shoulderOffsetY = 1.3;
let camFov = 50;

// Mode state
let _currentMode: CameraMode = 'default';
let _targetMode: CameraMode = 'default';
let _transitionProgress = 1;

// Transition start capture
let _startDist = 3.5;
let _startShoulderX = 0.0;
let _startShoulderY = 1.3;
let _startPitch = -0.4;
let _startFov = 50;

// Look blend: 0 = lookAt(pivot) (default/block), 1 = forward-vector (aim)
let _lookBlend = 0;
let _lookBlendStart = 0;
let _lookBlendEnd = 0;
let _aimPitchOffset = 0;

// Smooth zoom target (default mode only)
let _targetScrollDist = 3.5;

export let actionMode = false;
export let isRightDragging = false;
let prevMouse = new THREE.Vector2();

export let uiWindowsOpen = 0;
let altToggled = false;

export let isBlocking = false;
export let isAiming = false;

let reticleEl: HTMLElement | null = null;

// --- Reticle ---
function createReticle(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'camera-reticle';
    el.style.cssText = `
        position: fixed; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        width: 24px; height: 24px;
        pointer-events: none; z-index: 9999; display: none;
    `;
    el.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24">
        <circle cx="12" cy="12" r="8" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="1.5"/>
        <line x1="12" y1="1" x2="12" y2="5" stroke="rgba(255,255,255,0.8)" stroke-width="1.5"/>
        <line x1="12" y1="19" x2="12" y2="23" stroke="rgba(255,255,255,0.8)" stroke-width="1.5"/>
        <line x1="1" y1="12" x2="5" y2="12" stroke="rgba(255,255,255,0.8)" stroke-width="1.5"/>
        <line x1="19" y1="12" x2="23" y2="12" stroke="rgba(255,255,255,0.8)" stroke-width="1.5"/>
        <circle cx="12" cy="12" r="2" fill="rgba(255,0,0,0.9)"/>
    </svg>`;
    document.body.appendChild(el);
    return el;
}

// --- Public API ---
export function setCameraMode(mode: CameraMode) {
    if (mode === _targetMode && _transitionProgress >= 1) return;

    _startDist = distance;
    _startShoulderX = shoulderOffsetX;
    _startShoulderY = shoulderOffsetY;
    _startFov = camFov;

    // Don't transition pitch in aiming mode — keeps current vertical angle
    _startPitch = pitch;

    if (mode === 'aiming') {
        const dir = new THREE.Vector3().copy(cameraTarget).sub(camera.position).normalize();
        _aimPitchOffset = -Math.asin(Math.max(-1, Math.min(1, dir.y))) - pitch;
    }
    _lookBlendStart = _lookBlend;
    _lookBlendEnd = mode === 'aiming' ? 1 : 0;

    _targetMode = mode;
    _transitionProgress = 0;

    isBlocking = mode === 'blocking';
    isAiming = mode === 'aiming';

    if (mode === 'aiming') {
        if (!reticleEl) reticleEl = createReticle();
        reticleEl.style.display = 'block';
    } else if (reticleEl) {
        reticleEl.style.display = 'none';
    }
}

export function getCameraMode(): CameraMode {
    return _currentMode;
}

export function toggleBlock() {
    setCameraMode(_currentMode === 'blocking' ? 'default' : 'blocking');
}

export function toggleAim() {
    setCameraMode(_currentMode === 'aiming' ? 'default' : 'aiming');
}

export function enableActionMode() {
    if (!document.pointerLockElement) renderer.domElement.requestPointerLock();
}

export function disableActionMode() {
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
}

document.addEventListener('pointerlockchange', () => {
    const isLocked = document.pointerLockElement === renderer.domElement;
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

export function getCameraYaw(): number {
    return yaw;
}

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

export function toggleAltMode() {
    altToggled = !altToggled;
}

export function isAltToggled(): boolean {
    return altToggled;
}

// --- Helpers ---
function smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
}

function updateTransition(dt: number) {
    if (_transitionProgress >= 1) return;

    _transitionProgress = Math.min(1, _transitionProgress + dt * TRANSITION_SPEED);
    const t = smoothstep(_transitionProgress);
    const target = MODE_CONFIGS[_targetMode];

    distance = _startDist + (target.distance - _startDist) * t;
    shoulderOffsetX = _startShoulderX + (target.shoulderOffsetX - _startShoulderX) * t;
    shoulderOffsetY = _startShoulderY + (target.shoulderOffsetY - _startShoulderY) * t;

    // Pitch doesn't transition in aim mode — keeps user's vertical angle
    if (_targetMode !== 'aiming') {
        pitch = _startPitch + (target.pitch - _startPitch) * t;
    }

    _lookBlend = _lookBlendStart + (_lookBlendEnd - _lookBlendStart) * t;

    if (_transitionProgress >= 1) {
        _currentMode = _targetMode;
        const snap = MODE_CONFIGS[_targetMode];
        distance = snap.distance;
        shoulderOffsetX = snap.shoulderOffsetX;
        shoulderOffsetY = snap.shoulderOffsetY;
        camFov = snap.fov;
        if (_targetMode !== 'aiming') pitch = snap.pitch;
        _lookBlend = _lookBlendEnd;
    }
}

// --- Main update ---
export function updateCamera(deltaTime: number = 1 / 60) {
    updateTransition(deltaTime);

    // Smooth scroll zoom in default mode
    if (_currentMode === 'default' && _transitionProgress >= 1) {
        distance += (_targetScrollDist - distance) * Math.min(1, deltaTime * 12);
    }

    if (Math.abs(camera.fov - camFov) > 0.01) {
        camera.fov = camFov;
        camera.updateProjectionMatrix();
    }

    const pivot = cameraTarget;
    const sinYaw = Math.sin(yaw);
    const cosYaw = Math.cos(yaw);
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);

    const rightX = cosYaw * shoulderOffsetX;
    const rightZ = -sinYaw * shoulderOffsetX;

    // Camera always orbits around the player
    camera.position.set(
        pivot.x + distance * cosPitch * sinYaw + rightX,
        pivot.y + distance * sinPitch + shoulderOffsetY,
        pivot.z + distance * cosPitch * cosYaw + rightZ
    );

    // Blend: lookAt(pivot) → forward-vector
    const effectivePitch = pitch + _aimPitchOffset;
    const forwardDir = new THREE.Vector3(-Math.sin(yaw), -Math.sin(effectivePitch), -Math.cos(yaw)).normalize();
    const lookTarget = pivot.clone().lerp(
        camera.position.clone().add(forwardDir.multiplyScalar(50)),
        _lookBlend
    );
    camera.lookAt(lookTarget);
}

// --- Mouse events ---
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
    if (actionMode) {
        const sensitivity = 0.002;
        yaw -= e.movementX * sensitivity;
        pitch += e.movementY * sensitivity;
        pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));
        return;
    }

    if (!isRightDragging) return;
    const dx = e.clientX - prevMouse.x;
    const dy = e.clientY - prevMouse.y;
    prevMouse.set(e.clientX, e.clientY);
    const sensitivity = 0.01;
    yaw -= dx * sensitivity;
    pitch += dy * sensitivity;
    pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));
});

renderer.domElement.addEventListener('wheel', (e) => {
    if (_currentMode !== 'default') return;
    _targetScrollDist += e.deltaY * 0.01;
    _targetScrollDist = Math.max(MIN_DIST, Math.min(MAX_DIST, _targetScrollDist));
}, { passive: true });
