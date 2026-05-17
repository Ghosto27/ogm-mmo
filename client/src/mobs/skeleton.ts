import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ---------- TEMPLATE STORAGE ----------
export let skeletonTemplate: THREE.Group | null = null;
export let skeletonAnimations: THREE.AnimationClip[] = [];
export let falchionTemplate: THREE.Group | null = null;

// Animation name mapping: Skeleton_idle -> idle, Skeleton_walk_forward -> walk_forward, etc.
export const SKELETON_ANIM_MAP: Record<string, string> = {
    'skeleton_idle': 'idle',
    'skeleton_walk_forward': 'walk_forward',
    'skeleton_run_forward': 'run_forward',
    'skeleton_slash01': 'slash01',
    'skeleton_slash02': 'slash02',
    'skeleton_stab': 'stab',
    'skeleton_throw_projectiles': 'throw_projectiles',
    'skeleton_take_damage': 'take_damage',
    'skeleton_death': 'death',
    'skeleton_scream': 'scream',
    'skeleton_spawn': 'spawn',
    'skeleton_fall': 'fall',
    'skeleton_jump': 'jump',
    'skeleton_revive': 'revive',
    'skeleton_turn_left_90': 'turn_left_90',
    'skeleton_turn_right_90': 'turn_right_90',
    'skeleton_underground': 'underground',
};

export const skeletonModelReady = new Promise<void>((resolve, reject) => {
    const loader = new GLTFLoader();
    let skeletonLoaded = false;
    let falchionLoaded = false;

    const checkReady = () => {
        if (skeletonLoaded && falchionLoaded) {
            resolve();
        }
    };

    // Load skeleton
    loader.load(
        '/models/skeleton.glb',
        (gltf) => {
            skeletonTemplate = gltf.scene;
            (window as any).skeletonTemplate = skeletonTemplate;
            skeletonTemplate.visible = false;
            skeletonTemplate.matrixAutoUpdate = false;
            if (skeletonTemplate.parent) skeletonTemplate.parent.remove(skeletonTemplate);

            skeletonAnimations = gltf.animations;
            skeletonTemplate.scale.set(1, 1, 1);

            skeletonLoaded = true;
            checkReady();
        },
        undefined,
        (err) => {
            console.warn('[SKELETON] Failed to load skeleton.glb:', err);
            skeletonLoaded = true;
            checkReady();
        }
    );

    // Load falchion
    loader.load(
        '/models/falchion.glb',
        (gltf) => {
            falchionTemplate = gltf.scene;
            falchionTemplate.visible = false;
            falchionTemplate.scale.set(1, 1, 1);
            if (falchionTemplate.parent) falchionTemplate.parent.remove(falchionTemplate);

            falchionLoaded = true;
            checkReady();
        },
        undefined,
        (err) => {
            console.warn('[SKELETON] Failed to load falchion.glb:', err);
            falchionLoaded = true;
            checkReady();
        }
    );
});

// ---------- FIND HAND BONE (utility) ----------
export function findHandBone(model: THREE.Object3D): THREE.Bone | null {
    const searchNames = ['handr', 'RightHand', 'hand_r', 'RightHandIndex1', 'Hand_R', 'RightForeArm', 'RightArm'];
    let result: THREE.Bone | null = null;
    model.traverse((child) => {
        if (child instanceof THREE.Bone && searchNames.includes(child.name)) {
            result = child;
        }
    });
    return result;
}
