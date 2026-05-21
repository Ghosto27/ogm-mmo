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

const CONFIGS: Record<CameraMode, CameraConfig> = {
    default:  { distance: 3.5, shoulderOffsetX: 0.0, shoulderOffsetY: 1.3, pitch: -0.4, fov: 50 },
    aiming:   { distance: 2.5, shoulderOffsetX: 0.5, shoulderOffsetY: 0.9, pitch: -0.4, fov: 50 },
    blocking: { distance: 3.5, shoulderOffsetX: 0.0, shoulderOffsetY: 0.5, pitch: -0.2, fov: 50 },
};

const TRANSITION_SPEED = 5;
const PITCH_MIN = -0.8;
const PITCH_MAX = 0.8;
const DIST_MIN = 1.5;
const DIST_MAX = 10;

// --- Live camera parameters ---
let camTarget = new THREE.Vector3();
let yaw = 0;
let pitch = -0.4;
let distance = 3.5;
let shoulderX = 0.0;
let shoulderY = 1.3;
let fov = 50;

// --- Mode & transition state ---
let curMode: CameraMode = 'default';
let tgtMode: CameraMode = 'default';
let transT = 1;

// Transition start snapshot
let sDist = 3.5;
let sShX = 0.0;
let sShY = 1.3;
let sPitch = -0.4;
let sFov = 50;

// Look blend 0 = lookAt(pivot), 1 = forward-vector
// NOTE: with shoulderX != 0 in aim config, forward-vector cannot point at player.
// Horizontal error ~12° at yaw=0 (acos(dist*cosPitch / hypot(dist*cosPitch, shX))).
// Fixes: use lookAt(pivot) instead, or set shoulderX=0 in aiming config.
let lookBlend = 0;
let lookBlendA = 0;
let lookBlendB = 0;

// Pitch offset — forward-vector -> player aim direction
let pitchOff = 0;
let pitchOffA = 0;
let pitchOffB = 0;

// Smooth scroll zoom
let scrollTarget = 3.5;

// Pre-aim saved state (restored on exit)
let savedPitch = -0.4;
let savedShX = 0.0;
let savedShY = 1.3;
let savedScroll = 3.5;

// --- Exports ---
export let actionMode = false;
export let isRightDragging = false;
let prevMouse = new THREE.Vector2();
export let uiWindowsOpen = 0;
let altToggled = false;
export let isBlocking = false;
export let isAiming = false;
let reticleEl: HTMLElement | null = null;

// --- Utility ---
function smoothstep(v: number): number {
    return v * v * (3 - 2 * v);
}

/** Compute pitch offset so forward-vector points at pivot from (dist, pitch, shY) */
function calcPitchOffset(dist: number, p: number, shY: number): number {
    const num = dist * Math.sin(p) + shY;
    const denom = dist * Math.cos(p);
    return Math.asin(Math.max(-1, Math.min(1, num / denom))) - p;
}

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

// --- Mode switching ---
export function setCameraMode(mode: CameraMode) {
    if (mode === tgtMode && transT >= 1) return;

    sDist = distance;
    sShX = shoulderX;
    sShY = shoulderY;
    sFov = fov;
    sPitch = pitch;
    pitchOffA = calcPitchOffset(sDist, sPitch, sShY);
    lookBlendA = lookBlend;
    lookBlendB = mode === 'aiming' ? 1 : 0;

    if (mode === 'aiming') {
        savedPitch = pitch;
        savedShX = shoulderX;
        savedShY = shoulderY;
        savedScroll = scrollTarget;

        const c = CONFIGS.aiming;
        pitchOffB = calcPitchOffset(c.distance, sPitch, c.shoulderOffsetY);
    } else if (tgtMode === 'aiming' && mode === 'default') {
        pitchOffB = calcPitchOffset(savedScroll, savedPitch, savedShY);
    } else {
        const c = CONFIGS[mode];
        pitchOffB = calcPitchOffset(c.distance, c.pitch, c.shoulderOffsetY);
    }

    tgtMode = mode;
    transT = 0;

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
    return curMode;
}

export function toggleBlock() {
    setCameraMode(curMode === 'blocking' ? 'default' : 'blocking');
}

export function toggleAim() {
    setCameraMode(curMode === 'aiming' ? 'default' : 'aiming');
}

// --- Pointer lock ---
export function enableActionMode() {
    if (!document.pointerLockElement) renderer.domElement.requestPointerLock();
}

export function disableActionMode() {
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
}

document.addEventListener('pointerlockchange', () => {
    const isLocked = document.pointerLockElement === renderer.domElement;
    actionMode = isLocked;
    document.body.style.cursor = isLocked ? 'none' : 'default';
});

// --- Camera target ---
export function setCameraTarget(x: number, y: number, z: number) {
    camTarget.set(x, y, z);
}

export function getCameraYaw(): number {
    return yaw;
}

// --- UI mode stack ---
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

// --- Transition update ---
function updateTransition(dt: number) {
    if (transT >= 1) return;

    transT = Math.min(1, transT + dt * TRANSITION_SPEED);
    const u = smoothstep(transT);

    const restoreSaved = tgtMode === 'default' && curMode === 'aiming';
    const cfg = restoreSaved
        ? { distance: savedScroll, shoulderOffsetX: savedShX, shoulderOffsetY: savedShY, pitch: savedPitch, fov: 50 }
        : CONFIGS[tgtMode];

    distance = sDist + (cfg.distance - sDist) * u;
    shoulderX = sShX + (cfg.shoulderOffsetX - sShX) * u;
    shoulderY = sShY + (cfg.shoulderOffsetY - sShY) * u;
    if (tgtMode !== 'aiming') pitch = sPitch + (cfg.pitch - sPitch) * u;
    fov = sFov + (cfg.fov - sFov) * u;
    lookBlend = lookBlendA + (lookBlendB - lookBlendA) * u;
    pitchOff = pitchOffA + (pitchOffB - pitchOffA) * u;

    if (transT >= 1) {
        curMode = tgtMode;
        if (restoreSaved) {
            distance = savedScroll;
            scrollTarget = savedScroll;
            shoulderX = savedShX;
            shoulderY = savedShY;
            pitch = savedPitch;
        } else {
            const snap = CONFIGS[tgtMode];
            distance = snap.distance;
            shoulderX = snap.shoulderOffsetX;
            shoulderY = snap.shoulderOffsetY;
            if (tgtMode !== 'aiming') pitch = snap.pitch;
        }
        fov = cfg.fov;
        lookBlend = lookBlendB;
        pitchOff = pitchOffB;
    }
}

// Reusable temp vectors for updateCamera (one-time allocation, no GC pressure)
const _fwd = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _lookFrom = new THREE.Vector3();

// --- Main update ---
export function updateCamera(deltaTime: number = 1 / 60) {
    updateTransition(deltaTime);

    if (curMode === 'default' && transT >= 1) {
        distance += (scrollTarget - distance) * Math.min(1, deltaTime * 10);
    }

    if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
    }

    const pivot = camTarget;
    const sinYaw = Math.sin(yaw);
    const cosYaw = Math.cos(yaw);
    const sinPitch = Math.sin(pitch);
    const cosPitch = Math.cos(pitch);

    const rx = cosYaw * shoulderX;
    const rz = -sinYaw * shoulderX;

    camera.position.set(
        pivot.x + distance * cosPitch * sinYaw + rx,
        pivot.y + distance * sinPitch + shoulderY,
        pivot.z + distance * cosPitch * cosYaw + rz
    );

    const effPitch = pitch + pitchOff;
    _fwd.set(-Math.sin(yaw), -Math.sin(effPitch), -Math.cos(yaw)).normalize();
    _lookTarget.copy(camera.position).addScaledVector(_fwd, 50);
    _lookFrom.copy(pivot).lerp(_lookTarget, lookBlend);
    camera.lookAt(_lookFrom);
}

// --- Mouse events ---
window.addEventListener('mousedown', (e) => {
    if (e.button === 2) {
        isRightDragging = true;
        prevMouse.set(e.clientX, e.clientY);
    }
});

window.addEventListener('mouseup', (e) => {
    if (e.button === 2) isRightDragging = false;
});

window.addEventListener('mousemove', (e) => {
    if (actionMode) {
        yaw -= e.movementX * 0.002;
        pitch += e.movementY * 0.002;
        pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch));
        return;
    }
    if (!isRightDragging) return;
    const dx = e.clientX - prevMouse.x;
    const dy = e.clientY - prevMouse.y;
    prevMouse.set(e.clientX, e.clientY);
    yaw -= dx * 0.01;
    pitch += dy * 0.01;
    pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch));
});

renderer.domElement.addEventListener('wheel', (e) => {
    if (curMode !== 'default') return;
    scrollTarget += e.deltaY * 0.01;
    scrollTarget = Math.max(DIST_MIN, Math.min(DIST_MAX, scrollTarget));
}, { passive: true });
