import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { AnimationStateMachine } from './animationStateMachine';
import { scene } from './scene';
import { createHpBar, updateHpBarSprite } from './utils';
import { createLocalToonMaterial, createEnemyToonMaterial, cloneMaterial } from './materials';
import { createNameTag, attachNameTag, removeNameTag } from './nameTags';

// ---------- ШАБЛОН ----------
let modelTemplate: THREE.Group | null = null;
let defaultAnimations: THREE.AnimationClip[] = [];

export const modelReady = new Promise<void>((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
        '/models/player.glb',
        (gltf) => {
            modelTemplate = gltf.scene;
            (window as any).playerTemplate = modelTemplate;
            modelTemplate.visible = false;
            modelTemplate.matrixAutoUpdate = false;
            if (modelTemplate.parent) modelTemplate.parent.remove(modelTemplate);
            defaultAnimations = gltf.animations;
            //modelTemplate.scale.set(1, 1, 1);
            console.log('[MODEL] Шаблон Player загружен. Анимаций:', defaultAnimations.length);
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

(window as any).actions = actions;

// ---------- СОЗДАНИЕ ЭКЗЕМПЛЯРА ИГРОКА ----------
function createModelInstance(sessionId?: string): THREE.Group {
    if (!modelTemplate) throw new Error('Шаблон ещё не загружен');
    const model = clone(modelTemplate) as unknown as THREE.Group;
    model.visible = true;
    model.matrixAutoUpdate = true;
    //model.rotation.set(0, Math.PI, 0);
    model.scale.set(1.5, 1.5, 1.5);

    model.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) {
            const orig = child.material as THREE.MeshStandardMaterial;
            //const newMat = cloneMaterial(orig, sessionId);
            //child.material = newMat;
            //console.log(`[MAT] ${child.name}: vertexColors orig=${orig.vertexColors}, new=${(child.material as any).vertexColors}`);
            child.castShadow = true;
            child.receiveShadow = true;
            if (sessionId) child.userData.sessionId = sessionId;
        }
    });

    const mixer = new THREE.AnimationMixer(model);
    const id = sessionId || 'local';
    mixers[id] = mixer;
    actions[id] = {};

    const nameMapping: Record<string, string> = {
        'mm_idle': 'idle',
        'mf_walk_fwd': 'walk',
        'mf_run_fwd': 'run',
        'mm_death01': 'death',
        'mm_punch01': 'sword_attack',
        // позже добавим hit react и т.д.
    };

    defaultAnimations.forEach((clip) => {
        const action = mixer.clipAction(clip, model);
        const rawName = clip.name.toLowerCase();
        const mappedName = nameMapping[rawName] || rawName; // если нет в маппинге – оставляем оригинальное имя
        actions[id][mappedName] = action;
    });

    // Устанавливаем loop для одноразовых анимаций
    const oneShotActions = ['sword_attack', 'death', 'recievehit'];
    for (const name of oneShotActions) {
        const action = actions[id][name];
        if (action) {
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
        }
    }

    // Создаём FSM
    const filteredActions: Record<string, THREE.AnimationAction> = {};
    for (const key in actions[id]) {
        const act = actions[id][key];
        if (act) filteredActions[key] = act;
    }
    
    //console.log('[PLAYER] Available animations:', Object.keys(actions[id]));
    fsm[id] = new AnimationStateMachine(mixer, filteredActions, id);
    if (!actions[id]['idle']?.isRunning()) {
        fsm[id].transitionTo('idle');
    }
    
    (window as any).fsm = fsm;

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
            (window as any).localModel = localModel; 

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
            console.log(`[OTHER] create model for ${sessionId}, x=${x}, z=${z}`);
            if (x === 0 && z === 0) return;
            otherPlayers[sessionId] = createOtherPlayerModel(sessionId);
            if (name) {
                const tag = createNameTag(name);
                attachNameTag(otherPlayers[sessionId], tag);
            }
            // Сразу ставим модель на место, а не в (0,0)
            otherPlayers[sessionId].position.set(x, 0, z);
            // Не показываем модель, пока координаты не станут ненулевыми
            otherPlayers[sessionId].visible = true;
        } else {
            // Если модель была невидимой, а теперь координаты стали ненулевыми – показываем
            if (x === 0 && z === 0) return;
            if (otherPlayers[sessionId].visible === false && (x !== 0 || z !== 0)) {
                otherPlayers[sessionId].visible = true;
                otherPlayers[sessionId].position.set(x, 0, z);
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
export function resetModelFsms() {
    // Удаляем все существующие FSM (для локального и чужих игроков)
    for (const id in fsm) {
        // Останавливаем все действия, чтобы сбросить состояние
        const playerFsm = fsm[id];
        if (playerFsm) {
            const curActions = actions[id];
            if (curActions) {
                Object.values(curActions).forEach(a => a?.stop());
            }
            delete fsm[id];
        }
    }
    // Очищаем хранилище actions (если нужно, но actions живут вместе с FSM)
    // Если у вас actions[id] привязаны к FSM, их можно не трогать.
}