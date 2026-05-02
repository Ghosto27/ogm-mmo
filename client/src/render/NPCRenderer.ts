import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { scene } from '../scene';
import { getTerrainHeightAt } from '../render/TerrainRenderer';

export const npcMeshes: { [npcId: string]: THREE.Mesh } = {};
const npcLabels: { [npcId: string]: CSS2DObject } = {};

export function updateNPCMeshes(npcs: any) {
    for (const id in npcMeshes) {
        if (!npcs || !npcs.has || !npcs.has(id)) {
            scene.remove(npcMeshes[id]);
            delete npcMeshes[id];
            if (npcLabels[id]) {
                scene.remove(npcLabels[id]);
                delete npcLabels[id];
            }
        }
    }

    if (!npcs || !npcs.forEach) return;

    npcs.forEach((npc: any, npcId: string) => {
        if (!npcMeshes[npcId]) {
            const geometry = new THREE.BoxGeometry(1, 1.8, 1);
            const material = new THREE.MeshStandardMaterial({ color: 0xffff00 });
            const cube = new THREE.Mesh(geometry, material);
            const y = getTerrainHeightAt(npc.x, npc.z);
            cube.position.set(npc.x, y + 0.5, npc.z);
            scene.add(cube);
            npcMeshes[npcId] = cube;

            const div = document.createElement('div');
            div.textContent = '[F] Взаимодействовать';
            div.style.color = 'white';
            div.style.fontSize = '10px';
            div.style.background = 'rgba(0,0,0,0.6)';
            div.style.padding = '2px 6px';
            div.style.borderRadius = '4px';
            const label = new CSS2DObject(div);
            label.position.set(0, 1.2, 0);
            label.visible = false;
            cube.add(label);
            npcLabels[npcId] = label;
        } else {
            const y = getTerrainHeightAt(npc.x, npc.z);
            npcMeshes[npcId].position.set(npc.x, y + 1, npc.z);
        }
    });
}

export function setNPCProximity(npcId: string, isNear: boolean) {
    const label = npcLabels[npcId];
    if (label) label.visible = isNear;
}