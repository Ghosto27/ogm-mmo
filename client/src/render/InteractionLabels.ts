import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

const labels: { [id: string]: CSS2DObject } = {};

export function addInteractionLabel(id: string, mesh: THREE.Object3D, text: string): void {
    if (labels[id]) return;
    const div = document.createElement('div');
    div.textContent = text;
    div.style.color = 'white';
    div.style.fontSize = '11px';
    div.style.fontWeight = 'bold';
    div.style.background = 'rgba(0,0,0,0.7)';
    div.style.padding = '3px 8px';
    div.style.borderRadius = '4px';
    div.style.border = '1px solid rgba(255,255,255,0.3)';
    div.style.fontFamily = 'Arial, sans-serif';
    div.style.pointerEvents = 'none';
    div.style.whiteSpace = 'nowrap';
    const label = new CSS2DObject(div);
    label.position.set(0, 1.2, 0);
    label.visible = false;
    mesh.add(label);
    labels[id] = label;
}

export function updateInteractionLabels(playerPos: THREE.Vector3, threshold: number = 3.0): void {
    for (const id in labels) {
        const label = labels[id];
        const dist = label.parent
            ? playerPos.distanceTo((label.parent as THREE.Object3D).position)
            : Infinity;
        label.visible = dist < threshold;
    }
}

export function removeInteractionLabel(id: string): void {
    const label = labels[id];
    if (label) {
        if (label.parent) label.parent.remove(label);
        delete labels[id];
    }
}

export function clearInteractionLabels(): void {
    for (const id in labels) removeInteractionLabel(id);
}
