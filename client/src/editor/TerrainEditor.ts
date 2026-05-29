import * as THREE from 'three';
import { scene } from '../scene';
import { camera } from '../scene';
import { terrainWidth, terrainDepth, getVertexHeightBuffer, getTerrainSegments } from '../render/TerrainRenderer';

export type TerrainTool = 'raise' | 'lower' | 'flatten' | 'smooth';
export type BrushFalloff = 'gaussian' | 'linear' | 'flat';

export interface BrushState {
    active: boolean;
    tool: TerrainTool;
    radius: number;
    strength: number;
    falloff: BrushFalloff;
    targetHeight: number;
    worldX: number;
    worldZ: number;
}

let brushState: BrushState = {
    active: false,
    tool: 'raise',
    radius: 5,
    strength: 0.5,
    falloff: 'gaussian',
    targetHeight: 0,
    worldX: 0,
    worldZ: 0,
};

const BRUSH_PREVIEW_SEGMENTS = 48;

/** Быстрый замер высоты из vertexHeightBuffer */
function sampleHeight(x: number, z: number): number {
    const buf = getVertexHeightBuffer();
    const segments = getTerrainSegments();
    if (!buf || !segments) return 0;

    const halfW = terrainWidth / 2;
    const halfD = terrainDepth / 2;
    const u = (x + halfW) / terrainWidth;
    const v = (z + halfD) / terrainDepth;

    const ui = Math.max(0, Math.min(segments, u * segments));
    const vi = Math.max(0, Math.min(segments, v * segments));

    const col = Math.floor(ui);
    const row = Math.floor(vi);
    const fracX = ui - col;
    const fracY = vi - row;
    const stride = segments + 1;

    const c0 = Math.min(segments, col + 1);
    const r0 = Math.min(segments, row + 1);

    const h00 = buf[row * stride + col];
    const h10 = buf[row * stride + c0];
    const h01 = buf[r0 * stride + col];
    const h11 = buf[r0 * stride + c0];

    return h00 * (1 - fracX) * (1 - fracY)
         + h10 * fracX * (1 - fracY)
         + h01 * (1 - fracX) * fracY
         + h11 * fracX * fracY;
}

let brushPreview: THREE.Line | null = null;
let brushPreviewPositions: Float32Array | null = null;
let isTerrainMode = false;

// Кастомные события для editor integration
export let onApplyBrush: ((x: number, z: number, state: BrushState) => void) | null = null;

export function setOnApplyBrush(cb: typeof onApplyBrush) {
    onApplyBrush = cb;
}

export function isTerrainActive() { return isTerrainMode; }
export function setTerrainActive(v: boolean) { isTerrainMode = v; }
export function getBrushState() { return brushState; }

export function updateBrushParams(params: Partial<BrushState>) {
    Object.assign(brushState, params);
}

export function createBrushPreview(): THREE.Line {
    if (!brushPreview) {
        const count = BRUSH_PREVIEW_SEGMENTS;
        brushPreviewPositions = new Float32Array(count * 3);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(brushPreviewPositions, 3));
        const mat = new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.8,
            depthTest: true,
        });
        brushPreview = new THREE.LineLoop(geo, mat);
        brushPreview.visible = false;
        scene.add(brushPreview);
    }
    return brushPreview;
}

function updateBrushPreviewRing(centerX: number, centerZ: number, radius: number) {
    const preview = createBrushPreview();
    if (!brushPreviewPositions) return;
    const count = BRUSH_PREVIEW_SEGMENTS;
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * radius;
        const z = centerZ + Math.sin(angle) * radius;
        const y = sampleHeight(x, z);
        brushPreviewPositions[i * 3] = x;
        brushPreviewPositions[i * 3 + 1] = y + 0.1;
        brushPreviewPositions[i * 3 + 2] = z;
    }
    preview.geometry.attributes.position.needsUpdate = true;
}

export function showBrushPreview(worldX: number, worldZ: number) {
    createBrushPreview();
    updateBrushPreviewRing(worldX, worldZ, brushState.radius);
    brushPreview!.visible = isTerrainMode;
    brushState.worldX = worldX;
    brushState.worldZ = worldZ;
}

export function hideBrushPreview() {
    if (brushPreview) {
        brushPreview.visible = false;
    }
}

export function updateBrushPreviewPosition(worldX: number, worldZ: number) {
    if (brushPreview && brushPreview.visible) {
        updateBrushPreviewRing(worldX, worldZ, brushState.radius);
        brushState.worldX = worldX;
        brushState.worldZ = worldZ;
    }
}

export function cleanupBrushPreview() {
    if (brushPreview) {
        scene.remove(brushPreview);
        brushPreview.geometry.dispose();
        (brushPreview.material as THREE.Material).dispose();
        brushPreview = null;
        brushPreviewPositions = null;
    }
}

// Raycast terrain from mouse
export function raycastTerrain(clientX: number, clientY: number, terrainMesh: THREE.Mesh | null): THREE.Vector3 | null {
    if (!terrainMesh) return null;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(terrainMesh);
    if (intersects.length > 0) {
        return intersects[0].point;
    }
    return null;
}

export function isEditorMouseEvent(target: EventTarget | null): boolean {
    if (!target) return false;
    const el = target as HTMLElement;
    return !!el.closest('#editor-panel');
}
