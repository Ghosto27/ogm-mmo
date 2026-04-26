import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { AnimationStateMachine } from './animationStateMachine';
import { scene } from './scene';
import { createHpBar, updateHpBarSprite } from './utils';
import { createEnemyToonMaterial, createLocalToonMaterial, cloneMaterial, toonGradientMap } from './materials';

const lastMobPositions: { [mobId: string]: THREE.Vector3 } = {};
const mobTargetAngles: { [mobId: string]: number } = {};
const MOB_ANGLE_INTERPOLATION = 4.0; // скорость поворота

export function setMobTargetAngle(mobId: string, angle: number) {
    mobTargetAngles[mobId] = angle;
}

// ---------- ХРАНЕНИЕ ШАБЛОНА МОДЕЛИ ----------
let wolfTemplate: THREE.Group | null = null;
let wolfAnimations: THREE.AnimationClip[] = [];

export const wolfModelReady = new Promise<void>((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
        '/models/Wolf.gltf',
        (gltf) => {
            wolfTemplate = gltf.scene;
            (window as any).wolfTemplate = wolfTemplate;
            wolfTemplate.visible = false;
            wolfTemplate.matrixAutoUpdate = false;
            if (wolfTemplate.parent) wolfTemplate.parent.remove(wolfTemplate);

            wolfAnimations = gltf.animations;
            wolfTemplate.scale.set(0.8, 0.8, 0.8);
            //console.log('[MOB] Шаблон волка загружен. Анимаций:', wolfAnimations.length);
            //console.log('[MOB] Проверка текстур шаблона волка:');
            wolfTemplate!.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    const material = child.material as THREE.MeshStandardMaterial;
                    //console.log(`[MOB] Меш: ${child.name}, map: ${!!material.map}, emissiveMap: ${!!material.emissiveMap}, emissive: ${!!material.emissive}`);
                }
            });
            

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

const mobTargetPositions: { [mobId: string]: THREE.Vector3 } = {};
const MOB_INTERPOLATION_SPEED = 10.0;

// ---------- ФУНКЦИЯ СОЗДАНИЯ ЭКЗЕМПЛЯРА МОБА ----------
function createWolfInstance(mobId: string): THREE.Group {
    if (!wolfTemplate) throw new Error('Шаблон волка ещё не загружен');

    const model = clone(wolfTemplate) as unknown as THREE.Group;
    model.visible = true;
    model.matrixAutoUpdate = true;
    model.rotation.set(0, Math.PI, 0);

    // Заменяем материал на toon-совместимый
    model.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) {
            const orig = child.material as THREE.MeshStandardMaterial;
            const newMat = new THREE.MeshToonMaterial({
                color: orig.color,              // родной цвет меша (например, серый)
                gradientMap: toonGradientMap,  // toon-тени
                map: null,                     // текстуры нет
            });

            newMat.transparent = orig.transparent;
            newMat.alphaTest = orig.alphaTest;
            newMat.side = orig.side;
            newMat.vertexColors = orig.vertexColors;
            newMat.wireframe = orig.wireframe;
            newMat.emissive = new THREE.Color(0x222222); // лёгкая подсветка
            newMat.emissiveIntensity = 0.2;

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

    // Создаём FSM для моба
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
export function setMobTargetPosition(mobId: string, x: number, z: number) {
    if (!mobTargetPositions[mobId]) {
        mobTargetPositions[mobId] = new THREE.Vector3(x, 0, z);
    } else {
        mobTargetPositions[mobId].set(x, 0, z);
    }
}

export function spawnMob(mobId: string, x: number, z: number, hp: number, maxHp: number, rotationY?: number) {
    if (mobModels[mobId]) return;

    const model = createWolfInstance(mobId);
    model.position.set(x, 0, z);
    if (rotationY !== undefined) {
        model.rotation.y = rotationY;
        setMobTargetAngle(mobId, rotationY);
    }
    mobModels[mobId] = model;

    updateHpBarSprite(mobHpBars[mobId], hp, maxHp);
    setMobTargetPosition(mobId, x, z);
}

// Измените updateMobState: сохраняем предыдущую позицию
export function updateMobState(mobId: string, x: number, z: number, hp: number, maxHp: number, state: string) {
    const model = mobModels[mobId];
    if (!model) return;
    
    // Сохраняем предыдущую позицию для вычисления направления
    if (!lastMobPositions[mobId]) {
        lastMobPositions[mobId] = new THREE.Vector3(model.position.x, 0, model.position.z);
    } else {
        lastMobPositions[mobId].set(model.position.x, 0, model.position.z);
    }
    
    setMobTargetPosition(mobId, x, z);
    updateHpBarSprite(mobHpBars[mobId], hp, maxHp);
    
    const fsm = mobFSM[mobId];
    if (fsm) {
        const lowerState = state.toLowerCase();
        if (lowerState === 'attack' || lowerState === 'death') {
            if (fsm.currentStateName !== lowerState) {
                fsm.playOneShot(lowerState, 0.1);
            }
        } else {
            if (fsm.currentStateName !== lowerState) {
                fsm.transitionTo(lowerState);
            }
        }
    }
}

export function despawnMob(mobId: string) {
    const model = mobModels[mobId];
    if (model) {
        scene.remove(model);
        delete mobModels[mobId];
    }
    if (mobHpBars[mobId]) delete mobHpBars[mobId];
    if (mobMixers[mobId]) delete mobMixers[mobId];
    if (mobActions[mobId]) delete mobActions[mobId];
    if (mobFSM[mobId]) delete mobFSM[mobId];
    delete mobTargetPositions[mobId];
}

export function updateMobAnimations(deltaTime: number) {
    for (const id in mobMixers) {
        mobMixers[id].update(deltaTime);
    }
}

export function interpolateMobPositions(deltaTime: number) {
    for (const mobId in mobModels) {
        const model = mobModels[mobId];
        if (!model) continue;

        // Позиция (плавное движение к цели)
        const targetPos = mobTargetPositions[mobId];
        if (targetPos) {
            const t = Math.min(MOB_INTERPOLATION_SPEED * deltaTime, 1.0);
            model.position.x += (targetPos.x - model.position.x) * t;
            model.position.z += (targetPos.z - model.position.z) * t;

            // Вычисляем угол движения по разнице между целевой и предыдущей позицией
            const prevPos = lastMobPositions[mobId];
            if (prevPos) {
                const dx = targetPos.x - prevPos.x;
                const dz = targetPos.z - prevPos.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist > 0.01) {
                    const targetAngle = Math.atan2(dx, dz);
                    const currentAngle = model.rotation.y;
                    let diff = targetAngle - currentAngle;
                    while (diff > Math.PI) diff -= 2 * Math.PI;
                    while (diff < -Math.PI) diff += 2 * Math.PI;
                    model.rotation.y += diff * Math.min(1, MOB_ANGLE_INTERPOLATION * deltaTime);
                }
            }
        }
    }
}