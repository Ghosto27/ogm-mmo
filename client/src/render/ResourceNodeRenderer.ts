import * as THREE from 'three';
import { scene } from '../scene';
import { getTerrainHeightAtFast } from './TerrainRenderer';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const ORE_CONFIG: Record<string, { oreColor: string; rockColor: string; scale: number }> = {
    "copper_ore": { oreColor: "#d4875a", rockColor: "#8a7a6a", scale: 0.6 },
    "tin_ore":    { oreColor: "#c8c8c8", rockColor: "#7a7a7a", scale: 0.6 },
    "iron_ore":   { oreColor: "#b0a090", rockColor: "#6a6a6a", scale: 0.7 },
    "coal":       { oreColor: "#444444", rockColor: "#555555", scale: 0.5 },
};

export const resourceNodeMeshes: { [id: string]: THREE.Object3D } = {};

let modelLoaded = false;
let modelGroup: THREE.Group | null = null;
let baseMaterial: THREE.MeshStandardMaterial | null = null;

async function initAssets(): Promise<void> {
    if (modelLoaded) return;

    const texLoader = new THREE.TextureLoader();
    const baseDir = '/textures/ores/';

    baseMaterial = new THREE.MeshStandardMaterial({
        map: texLoader.load(baseDir + 'DefaultMaterial_albedo.jpg'),
        normalMap: texLoader.load(baseDir + 'DefaultMaterial_normal.png'),
        metalnessMap: texLoader.load(baseDir + 'DefaultMaterial_metallic.jpg'),
        roughnessMap: texLoader.load(baseDir + 'DefaultMaterial_roughness.jpg'),
        aoMap: texLoader.load(baseDir + 'DefaultMaterial_AO.jpg'),
    });

    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync('/models/ores.gltf');
    modelGroup = gltf.scene;
    modelLoaded = true;
}

const initPromise = initAssets();

export function updateResourceNodes(resourceNodes: any): void {
    if (!resourceNodes || !resourceNodes.forEach) return;
    if (!modelLoaded || !modelGroup || !baseMaterial) return;

    for (const id in resourceNodeMeshes) {
        if (!resourceNodes.has(id)) {
            scene.remove(resourceNodeMeshes[id]);
            delete resourceNodeMeshes[id];
        }
    }

    resourceNodes.forEach((node: any, nodeId: string) => {
        const config = ORE_CONFIG[node.type];
        if (!config) return;

        if (resourceNodeMeshes[nodeId]) {
            const group = resourceNodeMeshes[nodeId] as THREE.Group;
            const isActive = node.state === "active";
            group.visible = isActive;
            group.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.material.transparent = true;
                    child.material.opacity = isActive ? 1.0 : 0.3;
                }
            });
            return;
        }

        const group = modelGroup!.clone(true);

        group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                const mat = baseMaterial!.clone();
                const isRock = child.name.includes('Rock');
                mat.color = new THREE.Color(isRock ? config.rockColor : config.oreColor);
                mat.transparent = true;
                child.material = mat;
            }
        });

        group.userData.isResourceNode = true;
        group.userData.nodeType = node.type;

        const groundY = getTerrainHeightAtFast(node.x, node.z);
        group.position.set(node.x, groundY + config.scale * 0.3, node.z);

        scene.add(group);
        resourceNodeMeshes[nodeId] = group;
    });
}

export function clearResourceNodes(): void {
    for (const id in resourceNodeMeshes) {
        scene.remove(resourceNodeMeshes[id]);
        delete resourceNodeMeshes[id];
    }
}
