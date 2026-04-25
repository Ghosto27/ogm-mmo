import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { AnimationStateMachine } from './animationStateMachine';
import { scene } from './scene';
import { createHpBar, updateHpBarSprite } from './utils';
import { createEnemyToonMaterial } from './materials';

// ---------- ХРАНЕНИЕ ШАБЛОНА МОДЕЛИ ----------
let wolfTemplate: THREE.Group | null = null;
let wolfAnimations: THREE.AnimationClip[] = [];

export const wolfModelReady = new Promise<void>((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
        '/models/Wolf.gltf',
        (gltf) => {
            wolfTemplate = gltf.scene;
            wolfTemplate.visible = false;
            wolfTemplate.matrixAutoUpdate = false;
            if (wolfTemplate.parent) wolfTemplate.parent.remove(wolfTemplate);

            wolfAnimations = gltf.animations;
            wolfTemplate.scale.set(0.8, 0.8, 0.8);
            console.log('[MOB] Шаблон волка загружен. Анимаций:', wolfAnimations.length);
            resolve();
        },
        undefined,
        reject
    );
});

// ---------- ХРАНИЛИЩА МОБОВ ----------
export const mobModels: { [mobId: string]: THREE.Group } = {};
export const mobMixers: { [mobId: string]: THREE.AnimationMixer } = {};
export const mobActions: { [mobId: string]: Record<string, THREE.AnimationAction | null> } = {};
export const mobFSM: { [mobId: string]: AnimationStateMachine } = {};
export const mobHpBars: { [mobId: string]: THREE.Sprite } = {};

// ---------- ФУНКЦИЯ СОЗДАНИЯ ЭКЗЕМПЛЯРА МОБА ----------
function createWolfInstance(mobId: string): THREE.Group {
    if (!wolfTemplate) throw new Error('Шаблон волка ещё не загружен');

    const model = clone(wolfTemplate) as unknown as THREE.Group;
    model.visible = true;
    model.matrixAutoUpdate = true;

    // Заменяем материал на toon-совместимый
    model.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) {
            const orig = child.material as THREE.MeshStandardMaterial;
            const map = orig.map ?? null;
            const newMat = createEnemyToonMaterial(map); // можно другой цвет
            newMat.transparent = orig.transparent;
            newMat.alphaTest = orig.alphaTest;
            newMat.side = orig.side;
            newMat.depthWrite = orig.depthWrite;
            newMat.depthTest = orig.depthTest;
            newMat.vertexColors = orig.vertexColors;
            child.material = newMat;
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    // Миксер и FSM
    const mixer = new THREE.AnimationMixer(model);
    const actions: Record<string, THREE.AnimationAction | null> = {};
    wolfAnimations.forEach((clip) => {
        const action = mixer.clipAction(clip, model);
        actions[clip.name.toLowerCase()] = action;
    });

    mobMixers[mobId] = mixer;
    mobActions[mobId] = actions;

    // Создаём FSM для моба (пока без передачи управления, просто для анимаций)
    const fsm = new AnimationStateMachine(mixer, actions as Record<string, THREE.AnimationAction>, mobId);
    mobFSM[mobId] = fsm;

    // Запускаем idle по умолчанию
    if (actions['idle']) {
        actions['idle']!.play();
        fsm.currentStateName = 'idle';
    } else {
        const firstKey = Object.keys(actions)[0];
        if (firstKey && actions[firstKey]) {
            actions[firstKey]!.play();
            fsm.currentStateName = firstKey;
        }
    }

    // HP-бар
    const hpBar = createHpBar();
    hpBar.position.set(0, 2.0, 0);
    model.add(hpBar);
    mobHpBars[mobId] = hpBar;

    scene.add(model);
    return model;
}

// ---------- ПУБЛИЧНЫЕ ФУНКЦИИ ----------
export function spawnMob(mobId: string, x: number, z: number, hp: number, maxHp: number) {
    if (mobModels[mobId]) return; // уже существует

    const model = createWolfInstance(mobId);
    model.position.set(x, 0, z);
    mobModels[mobId] = model;

    // Обновляем HP-бар
    updateHpBarSprite(mobHpBars[mobId], hp, maxHp);
}

export function updateMobState(mobId: string, x: number, z: number, hp: number, maxHp: number, state: string) {
    const model = mobModels[mobId];
    if (!model) return;

    model.position.set(x, 0, z);
    updateHpBarSprite(mobHpBars[mobId], hp, maxHp);

    const fsm = mobFSM[mobId];
    if (fsm) {
        const lowerState = state.toLowerCase();
        if (lowerState === 'attack' || lowerState === 'death') {
            // Одноразовые анимации: запускаем, если ещё не проигрывается
            if (fsm.currentStateName !== lowerState) {
                fsm.playOneShot(lowerState, 0.1);
            }
        } else {
            // Циклические (idle, walk) – плавный переход
            fsm.transitionTo(lowerState);
        }
    }
}

export function despawnMob(mobId: string) {
    const model = mobModels[mobId];
    if (model) {
        scene.remove(model);
        delete mobModels[mobId];
    }
    if (mobHpBars[mobId]) {
        // HP-бар был добавлен как child модели, удалится вместе с моделью
        delete mobHpBars[mobId];
    }
    if (mobMixers[mobId]) delete mobMixers[mobId];
    if (mobActions[mobId]) delete mobActions[mobId];
    if (mobFSM[mobId]) delete mobFSM[mobId];
}

export function updateMobAnimations(deltaTime: number) {
    for (const id in mobMixers) {
        mobMixers[id].update(deltaTime);
    }
}