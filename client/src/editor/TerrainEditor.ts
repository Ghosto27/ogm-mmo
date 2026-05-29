import * as THREE from 'three';
import { scene } from '../scene';
import { camera } from '../scene';
import { getVertexHeightBuffer, getTerrainSegments, terrainWidth, terrainDepth } from '../render/TerrainRenderer';

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

let brushPreview: THREE.Mesh | null = null;
let isTerrainMode = false;
const _tmpVec = new THREE.Vector3();

/** Быстрый замер высоты из vertexHeightBuffer */
function sampleHeight(x: number, z: number): number {
    const buf = getVertexHeightBuffer();
    const segments = getTerrainSegments();
    if (!buf || !segments) return 0;
    const halfW = terrainWidth / 2;
    const halfD = terrainDepth / 2;
    const u = Math.max(0, Math.min(1, (x + halfW) / terrainWidth));
    const v = Math.max(0, Math.min(1, (z + halfD) / terrainDepth));
    const col = Math.floor(u * segments);
    const row = Math.floor(v * segments);
    const fracX = u * segments - col;
    const fracY = v * segments - row;
    const stride = segments + 1;
    const c1 = Math.min(segments, col + 1);
    const r1 = Math.min(segments, row + 1);
    const h00 = buf[row * stride + col];
    const h10 = buf[row * stride + c1];
    const h01 = buf[r1 * stride + col];
    const h11 = buf[r1 * stride + c1];
    return h00 * (1 - fracX) * (1 - fracY)
         + h10 * fracX * (1 - fracY)
         + h01 * (1 - fracX) * fracY
         + h11 * fracX * fracY;
}

/** Подгоняет вершины кольца под рельеф */
function conformRingToTerrain(mesh: THREE.Mesh) {
    const pos = mesh.geometry.attributes.position;
    const arr = pos.array as Float32Array;
    mesh.updateMatrixWorld(true);
    for (let i = 0; i < arr.length; i += 3) {
        _tmpVec.set(arr[i], arr[i + 1], arr[i + 2]);
        mesh.localToWorld(_tmpVec);
        _tmpVec.y = sampleHeight(_tmpVec.x, _tmpVec.z) + 0.15;
        mesh.worldToLocal(_tmpVec);
        arr[i] = _tmpVec.x;
        arr[i + 1] = _tmpVec.y;
        arr[i + 2] = _tmpVec.z;
    }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
}

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

export function createBrushPreview(): THREE.Mesh {
    if (!brushPreview) {
        const geo = new THREE.RingGeometry(0.88, 1.0, 48);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.5,
            depthTest: false,
        });
        brushPreview = new THREE.Mesh(geo, mat);
        brushPreview.rotation.x = -Math.PI / 2;
        brushPreview.visible = false;
        scene.add(brushPreview);
    }
    return brushPreview;
}

export function showBrushPreview(worldX: number, worldZ: number) {
    const preview = createBrushPreview();
    preview.position.set(worldX, 0, worldZ);
    preview.scale.set(brushState.radius, brushState.radius, brushState.radius);
    conformRingToTerrain(preview);
    preview.visible = isTerrainMode;
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
        brushPreview.position.set(worldX, 0, worldZ);
        brushPreview.scale.set(brushState.radius, brushState.radius, brushState.radius);
        conformRingToTerrain(brushPreview);
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
    }
}

// Raycast terrain from mouse
export function raycastTerrain(clientX: number, clientY: number, terrainMesh: THREE.Mesh | null): THREE.Vector3 | null {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    if (terrainMesh) {
        const intersects = raycaster.intersectObject(terrainMesh);
        if (intersects.length > 0) {
            return intersects[0].point;
        }
    }

    // Fallback: точка далеко по лучу, спроецированная на XZ
    const target = new THREE.Vector3();
    target.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, 1000);
    target.y = 0;
    return target;
}

export function isEditorMouseEvent(target: EventTarget | null): boolean {
    if (!target) return false;
    const el = target as HTMLElement;
    return !!el.closest('#editor-panel');
}
