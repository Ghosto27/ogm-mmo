import * as THREE from 'three';
import { scene } from '../scene';

export interface WaterBody {
    id: string;
    x: number;
    z: number;
    y: number;
    width: number;
    depth: number;
    rotationY: number;
}

let waterMeshes: THREE.Mesh[] = [];
let clock: THREE.Clock | null = null;

const vertexShader = `
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const fragmentShader = `
    uniform float uTime;
    varying vec2 vUv;
    varying vec3 vWorldPosition;

    void main() {
        vec2 uv = vUv * 4.0;
        float speed = uTime * 0.15;
        float wave1 = sin(uv.x * 3.0 + uv.y * 2.0 + speed) * 0.5 + 0.5;
        float wave2 = sin(uv.x * 5.0 - uv.y * 4.0 + speed * 1.3) * 0.5 + 0.5;
        float foam = sin(vWorldPosition.x * 0.05 + vWorldPosition.z * 0.05 + uTime * 0.5) * 0.5 + 0.5;
        float wave = wave1 * 0.6 + wave2 * 0.4;
        vec3 deep = vec3(0.02, 0.12, 0.25);
        vec3 shallow = vec3(0.1, 0.4, 0.55);
        vec3 color = mix(deep, shallow, wave);
        float alpha = 0.55 + wave * 0.15;
        gl_FragColor = vec4(color, alpha);
    }
`;

export function initWaterRenderer() {
    clock = new THREE.Clock();
}

export function getWaterMeshes(): THREE.Mesh[] {
    return waterMeshes;
}

export function spawnWaterBody(data: WaterBody): THREE.Mesh {
    if (!clock) initWaterRenderer();
    const geo = new THREE.PlaneGeometry(data.width, data.depth);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader,
        fragmentShader,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(data.x, data.y, data.z);
    mesh.rotation.y = data.rotationY || 0;
    mesh.userData.waterBodyId = data.id;
    mesh.renderOrder = 1;
    scene.add(mesh);
    waterMeshes.push(mesh);
    return mesh;
}

export function removeWaterBody(id: string) {
    const idx = waterMeshes.findIndex(m => m.userData.waterBodyId === id);
    if (idx === -1) return;
    const mesh = waterMeshes[idx];
    scene.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    waterMeshes.splice(idx, 1);
}

export function clearAllWater() {
    for (const mesh of waterMeshes) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
    }
    waterMeshes = [];
}

export function updateWaterAnimation(delta: number) {
    if (!clock) return;
    const t = clock.getElapsedTime();
    for (const mesh of waterMeshes) {
        const mat = mesh.material as THREE.ShaderMaterial;
        if (mat.uniforms) {
            mat.uniforms.uTime.value = t;
        }
    }
}

export function getWaterBodyById(id: string): THREE.Mesh | undefined {
    return waterMeshes.find(m => m.userData.waterBodyId === id);
}
