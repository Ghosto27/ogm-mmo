import * as THREE from 'three';
import { scene } from '../scene';
import { getTerrainHeightAtFast } from './TerrainRenderer';

const NODE_CONFIG: Record<string, { color: string; geometry: 'cylinder' | 'box'; scale: number }> = {
    "copper_ore": { color: "#b87333", geometry: "cylinder", scale: 0.6 },
    "tin_ore":    { color: "#c0c0c0", geometry: "cylinder", scale: 0.6 },
    "iron_ore":   { color: "#808080", geometry: "cylinder", scale: 0.7 },
    "coal":       { color: "#222222", geometry: "box",      scale: 0.5 },
};

export const resourceNodeMeshes: { [id: string]: THREE.Object3D } = {};

export function updateResourceNodes(resourceNodes: any): void {
    if (!resourceNodes || !resourceNodes.forEach) return;

    // Удаляем ноды, которых больше нет
    for (const id in resourceNodeMeshes) {
        if (!resourceNodes.has(id)) {
            scene.remove(resourceNodeMeshes[id]);
            delete resourceNodeMeshes[id];
        }
    }

    resourceNodes.forEach((node: any, nodeId: string) => {
        const config = NODE_CONFIG[node.type];
        if (!config) return;

        if (resourceNodeMeshes[nodeId]) {
            const mesh = resourceNodeMeshes[nodeId];
            const isActive = node.state === "active";
            mesh.visible = isActive;
            if (mesh instanceof THREE.Mesh) {
                (mesh.material as THREE.MeshStandardMaterial).opacity = isActive ? 1.0 : 0.3;
                (mesh.material as THREE.MeshStandardMaterial).transparent = true;
            }
            return;
        }

        const geometry = config.geometry === 'box'
            ? new THREE.BoxGeometry(config.scale, config.scale * 0.6, config.scale)
            : new THREE.CylinderGeometry(config.scale * 0.6, config.scale, config.scale * 0.6, 8);

        const material = new THREE.MeshStandardMaterial({
            color: config.color,
            transparent: true,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.isResourceNode = true;
        mesh.userData.nodeType = node.type;

        const groundY = getTerrainHeightAtFast(node.x, node.z);
        mesh.position.set(node.x, groundY + config.scale * 0.3, node.z);

        scene.add(mesh);
        resourceNodeMeshes[nodeId] = mesh;
    });
}

export function clearResourceNodes(): void {
    for (const id in resourceNodeMeshes) {
        scene.remove(resourceNodeMeshes[id]);
        delete resourceNodeMeshes[id];
    }
}
