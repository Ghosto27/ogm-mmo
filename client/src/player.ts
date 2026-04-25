import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { scene } from './scene';
import { createHpBar, updateHpBarSprite } from './utils';
import { createLocalToonMaterial, createEnemyToonMaterial } from './materials';
import { AnimationStateMachine } from './animationStateMachine';

export const fsm: { [id: string]: AnimationStateMachine } = {};

// ---------- ШАБЛОН ----------
let modelTemplate: THREE.Group | null = null;
let defaultAnimations: THREE.AnimationClip[] = [];

export const modelReady = new Promise<void>((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
        '/models/Warrior.gltf',
        (gltf) => {
            modelTemplate = gltf.scene;
            modelTemplate.visible = false;
            modelTemplate.matrixAutoUpdate = false;
            if (modelTemplate.parent) modelTemplate.parent.remove(modelTemplate);
            defaultAnimations = gltf.animations;
            modelTemplate.scale.set(0.8, 0.8, 0.8);
            console.log('[MODEL] Шаблон Warrior загружен. Анимаций:', defaultAnimations.length);
            resolve();
        },
        undefined,
        reject
    );
});

// ---------- ХРАНИЛИЩА ----------
export const mixers: { [id: string]: THREE.AnimationMixer } = {};
export const actions: { [id: string]: Record<string, THREE.AnimationAction | null> } = {};
export const deathAnimating: { [id: string]: boolean } = {};
export const currentLoopAnim: { [id: string]: string | null } = {};

// ---------- КЛОНИРОВАНИЕ МАТЕРИАЛА ----------
function cloneMaterial(original: THREE.MeshStandardMaterial, sessionId?: string): THREE.MeshToonMaterial {
    const map = original.map ?? null;
    const newMat = sessionId ? createEnemyToonMaterial(map) : createLocalToonMaterial(map);
    (newMat as any).alphaMap = original.alphaMap ?? null;
    (newMat as any).emissiveMap = original.emissiveMap ?? null;
    (newMat as any).aoMap = original.aoMap ?? null;
    (newMat as any).normalMap = original.normalMap ?? null;
    newMat.transparent = original.transparent;
    newMat.alphaTest = original.alphaTest;
    newMat.side = original.side;
    newMat.depthWrite = original.depthWrite;
    newMat.depthTest = original.depthTest;
    newMat.opacity = original.opacity;
    newMat.vertexColors = original.vertexColors;
    newMat.wireframe = original.wireframe;
    newMat.emissive = original.emissive;
    newMat.emissiveIntensity = original.emissiveIntensity;
    return newMat;
}

// ---------- СОЗДАНИЕ ЭКЗЕМПЛЯРА ИГРОКА ----------
function createModelInstance(sessionId?: string): THREE.Group {
    if (!modelTemplate) throw new Error('Шаблон ещё не загружен');
    const model = clone(modelTemplate) as THREE.Group;
    model.visible = true;
    model.matrixAutoUpdate = true;
    model.rotation.set(0, Math.PI, 0); // разворот модели

    model.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) {
            const orig = child.material as THREE.MeshStandardMaterial;
            const newMat = cloneMaterial(orig, sessionId);
            child.material = newMat;
            child.castShadow = true;
            child.receiveShadow = true;
            if (sessionId) child.userData.sessionId = sessionId;
        }
    });

    const mixer = new THREE.AnimationMixer(model);
    const id = sessionId || 'local';   // <-- перенесли сюда
    mixers[id] = mixer;
    actions[id] = {};

    defaultAnimations.forEach((clip) => {
        const action = mixer.clipAction(clip, model);
        actions[id][clip.name.toLowerCase()] = action;
    });

    if (fsm[id]) {
        fsm[id].transitionTo('idle');  // FSM сам установит currentStateName
    }

    // Создаём FSM, отфильтровывая null из actions
    const filteredActions: Record<string, THREE.AnimationAction> = {};
    for (const key in actions[id]) {
        const act = actions[id][key];
        if (act) filteredActions[key] = act;
    }
    // В функции createModelInstance, после создания fsm[id]:
    fsm[id] = new AnimationStateMachine(mixer, filteredActions, id);
    //console.log(`[FSM] created for ${id}, starting idle`);
    // Запускаем idle, если он ещё не активен (защита от повторного запуска)
    if (!actions[id]['idle']?.isRunning()) {
        fsm[id].transitionTo('idle');
    }

    return model;
}

// ---------- ЛОКАЛЬНЫЙ ИГРОК ----------
export let localModel: THREE.Group | null = null;

export function initLocalModel(): THREE.Group {
    localModel = createModelInstance();
    scene.add(localModel);
    return localModel!;
}

// ---------- ДРУГИЕ ИГРОКИ ----------
export const otherPlayers: { [sessionId: string]: THREE.Group } = {};
export const hpBars: { [sessionId: string]: THREE.Sprite } = {};

export function createOtherPlayerModel(sessionId: string): THREE.Group {
    const model = createModelInstance(sessionId);
    scene.add(model);
    return model;
}

// ---------- HP-БАРЫ ----------
export let localHpBar: THREE.Sprite | null = null;

export function showLocalHpBar(x: number, z: number, hp: number, maxHp: number) {
    if (!localHpBar) {
        localHpBar = createHpBar();
        scene.add(localHpBar);
    }
    updateHpBarSprite(localHpBar, hp, maxHp);
}

export function hideLocalHpBar() {
    if (localHpBar) {
        scene.remove(localHpBar);
        localHpBar = null;
    }
}

export function updateOtherPlayer(
    sessionId: string,
    x: number, z: number, hp: number, maxHp: number, alive: boolean
) {
    if (alive) {
        if (!otherPlayers[sessionId]) {
            otherPlayers[sessionId] = createOtherPlayerModel(sessionId);
            // Запускаем Idle для нового игрока
            if (fsm[sessionId]) {
                fsm[sessionId].transitionTo('idle');
            }
        }
        otherPlayers[sessionId].visible = true;

        if (!hpBars[sessionId]) {
            hpBars[sessionId] = createHpBar();
            scene.add(hpBars[sessionId]);
        }
        hpBars[sessionId].visible = true;
        updateHpBarSprite(hpBars[sessionId], hp, maxHp);
    } else {
        if (!deathAnimating[sessionId]) {
            if (otherPlayers[sessionId]) otherPlayers[sessionId].visible = false;
            if (hpBars[sessionId]) hpBars[sessionId].visible = false;
        }
    }
}

export function removeOtherPlayerVisuals(sessionId: string) {
    if (deathAnimating[sessionId]) return; // ждём окончания анимации смерти
    if (otherPlayers[sessionId]) {
        scene.remove(otherPlayers[sessionId]);
        delete otherPlayers[sessionId];
    }
    if (hpBars[sessionId]) {
        scene.remove(hpBars[sessionId]);
        delete hpBars[sessionId];
    }
    if (mixers[sessionId]) delete mixers[sessionId];
    if (actions[sessionId]) delete actions[sessionId];
    if (deathAnimating[sessionId]) delete deathAnimating[sessionId];
    if (currentLoopAnim[sessionId]) delete currentLoopAnim[sessionId];
}