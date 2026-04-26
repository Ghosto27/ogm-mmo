import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { AnimationStateMachine } from './animationStateMachine';
import { scene } from './scene';
import { createHpBar, updateHpBarSprite } from './utils';
import { createLocalToonMaterial, createEnemyToonMaterial } from './materials';
import { createNameTag, attachNameTag, removeNameTag } from './nameTags';

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
export const fsm: { [id: string]: AnimationStateMachine } = {};

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
    const model = clone(modelTemplate) as unknown as THREE.Group;
    model.visible = true;
    model.matrixAutoUpdate = true;
    model.rotation.set(0, Math.PI, 0);

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
    const id = sessionId || 'local';
    mixers[id] = mixer;
    actions[id] = {};

    defaultAnimations.forEach((clip) => {
        const action = mixer.clipAction(clip, model);
        actions[id][clip.name.toLowerCase()] = action;
    });

    // Создаём FSM
    const filteredActions: Record<string, THREE.AnimationAction> = {};
    for (const key in actions[id]) {
        const act = actions[id][key];
        if (act) filteredActions[key] = act;
    }
    fsm[id] = new AnimationStateMachine(mixer, filteredActions, id);
    if (!actions[id]['idle']?.isRunning()) {
        fsm[id].transitionTo('idle');
    }

    return model;
}

// ---------- ЛОКАЛЬНЫЙ ИГРОК ----------
export let localModel: THREE.Group | null = null;

export function initLocalModel(playerName?: string): THREE.Group {
    if (localModel) {
        console.warn('[PLAYER] localModel уже создана');
        return localModel;
    }
    console.log('[PLAYER] Создаём локальную модель...');
    localModel = createModelInstance();
    if (localModel) {
        scene.add(localModel);
        localModel.visible = true;

        // Принудительно создаём тег с именем из localStorage или переданным
        const displayName = playerName || localStorage.getItem('ogm_playerName') || 'Герой';
        const existingTag = localModel.getObjectByName('nameTag');
        if (!existingTag) {
            const tag = createNameTag(displayName);
            attachNameTag(localModel, tag);
            console.log('[PLAYER] Тег создан для', displayName);
        } else {
            console.log('[PLAYER] Тег уже существует');
        }

        console.log('[PLAYER] Локальная модель создана, visible=', localModel.visible);
    } else {
        console.error('[PLAYER] Не удалось создать локальную модель');
    }
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
    x: number, z: number, hp: number, maxHp: number, alive: boolean,
    name?: string
) {
    if (alive) {
        if (!otherPlayers[sessionId]) {
            otherPlayers[sessionId] = createOtherPlayerModel(sessionId);
            if (name) {
                const tag = createNameTag(name);
                attachNameTag(otherPlayers[sessionId], tag);
            }
            // Показываем модель только если координаты уже не нулевые
            otherPlayers[sessionId].visible = !(x === 0 && z === 0);
            // Сразу устанавливаем позицию
            otherPlayers[sessionId].position.set(x, 0, z);
        } else {
            // Если модель была невидимой, а теперь координаты стали ненулевыми – показываем
            if (otherPlayers[sessionId].visible === false && (x !== 0 || z !== 0)) {
                otherPlayers[sessionId].visible = true;
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
        removeNameTag(otherPlayers[sessionId]); // чистим тег
        scene.remove(otherPlayers[sessionId]);
        delete otherPlayers[sessionId];
        console.log(`[CLEANUP] Удалён игрок ${sessionId}`);
    }
    if (hpBars[sessionId]) {
        scene.remove(hpBars[sessionId]);
        delete hpBars[sessionId];
    }
    if (mixers[sessionId]) delete mixers[sessionId];
    if (actions[sessionId]) delete actions[sessionId];
    if (deathAnimating[sessionId]) delete deathAnimating[sessionId];
    if (fsm[sessionId]) delete fsm[sessionId];
}