import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { AnimationStateMachine } from './animationStateMachine';
import { scene } from './scene';
import { createHpBar, updateHpBarSprite } from './utils';
import { createEnemyToonMaterial, createLocalToonMaterial, cloneMaterial, toonGradientMap } from './materials';
import { getTerrainHeightAt, getTerrainHeightAtFast } from './render/TerrainRenderer';
import { spawnBoneProjectile } from './mobs/projectile';
import { pendingProjectileTargets } from './network';
import {
    skeletonTemplate,
    skeletonAnimations,
    falchionTemplate,
    SKELETON_ANIM_MAP,
    findHandBone,
    skeletonModelReady
} from './mobs/skeleton';
import { room } from './network';
import { localModel } from './player';

// ===== GLOBAL DEBUG FUNCTIONS (available immediately) =====
(function registerDebugHelpers() {
    (window as any)._god = () => {
        if (!room) {
            console.log('[GOD] Not connected to server');
            return;
        }
        (window as any)._godMode = !(window as any)._godMode;
        room.send('setGodMode', { enabled: (window as any)._godMode });
        console.log(`[GOD] ${(window as any)._godMode ? 'ENABLED - you are invulnerable' : 'DISABLED - you can take damage again'}`);
    };
    
    (window as any)._rot = (xDeg: number, yDeg: number, zDeg: number) => {
        const deg2rad = Math.PI / 180;
        const q = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(xDeg * deg2rad, yDeg * deg2rad, zDeg * deg2rad)
        );
        let count = 0;
        for (const mid in mobModels) {
            const m = mobModels[mid];
            if ((m as any)._falchion) {
                (m as any)._falchionOffset = q.clone();
                count++;
            }
        }
        console.log(`[CALIBRATION] Applied to ${count} skeleton(s): Euler(${xDeg}, ${yDeg}, ${zDeg}) deg = (${(xDeg*deg2rad).toFixed(3)}, ${(yDeg*deg2rad).toFixed(3)}, ${(zDeg*deg2rad).toFixed(3)}) rad`);
        console.log(`[CALIBRATION] Quaternion: (${q.x.toFixed(4)}, ${q.y.toFixed(4)}, ${q.z.toFixed(4)}, ${q.w.toFixed(4)})`);
        console.log(`[CALIBRATION] RED=X  GREEN=Y  BLUE=Z  |  Match falchion axis to bone axis`);
    };
    
    (window as any)._pos = (x: number, y: number, z: number) => {
        let count = 0;
        for (const mid in mobModels) {
            const m = mobModels[mid];
            if ((m as any)._falchion) {
                (m as any)._falchionPosOffset = new THREE.Vector3(x, y, z);
                count++;
            }
        }
        console.log(`[CALIBRATION] Position offset applied to ${count} skeleton(s): (${x}, ${y}, ${z}) in bone-local space`);
        console.log(`[CALIBRATION] Axes: RED=X  GREEN=Y  BLUE=Z  |  Use _debug() to see current values`);
    };
    
    (window as any)._debug = () => {
        for (const mid in mobModels) {
            const m = mobModels[mid];
            if ((m as any)._falchion) {
                const f = (m as any)._falchion;
                const off = (m as any)._falchionOffset;
                const posOff = (m as any)._falchionPosOffset;
                const bone = (m as any)._handBone;
                console.log(`[DEBUG ${mid}] falchion.quat: (${f.quaternion.x.toFixed(3)}, ${f.quaternion.y.toFixed(3)}, ${f.quaternion.z.toFixed(3)}, ${f.quaternion.w.toFixed(3)})`);
                console.log(`[DEBUG ${mid}] offset quat: (${off.x.toFixed(3)}, ${off.y.toFixed(3)}, ${off.z.toFixed(3)}, ${off.w.toFixed(3)})`);
                if (posOff) console.log(`[DEBUG ${mid}] pos offset: (${posOff.x.toFixed(3)}, ${posOff.y.toFixed(3)}, ${posOff.z.toFixed(3)})`);
                if (bone) {
                    bone.updateWorldMatrix(true, false);
                    console.log(`[DEBUG ${mid}] bone.worldPos: (${bone.matrixWorld.elements[12].toFixed(2)}, ${bone.matrixWorld.elements[13].toFixed(2)}, ${bone.matrixWorld.elements[14].toFixed(2)})`);
                }
                console.log(`[DEBUG ${mid}] falchion children: ${f.children.length}`);
                return;
            }
        }
        console.log('[DEBUG] No skeleton falchions found');
    };
    
    console.log('[DEBUG] Type _god() to toggle invulnerability');
    console.log('[CALIBRATION] Type _rot(x,y,z) in console - rotate falchion (DEGREES)');
    console.log('[CALIBRATION] Type _pos(x,y,z) in console - position offset in bone-local space');
    console.log('[CALIBRATION] Type _debug() to see current quaternion + position offset values');
    console.log('[CALIBRATION] Examples: _rot(0,180,115)  _pos(0,-0.3,0)  _pos(0.2, -0.4, 0.1)');
})();

const lastMobPositions: { [mobId: string]: THREE.Vector3 } = {};
const mobTargetAngles: { [mobId: string]: number } = {};
const MOB_ANGLE_INTERPOLATION = 4.0; // rotation interpolation speed

export function setMobTargetAngle(mobId: string, angle: number) {
    mobTargetAngles[mobId] = angle;
}

// ---------- WOLF TEMPLATE ----------
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
            wolfTemplate.scale.set(1, 1, 1);

            wolfTemplate!.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    const material = child.material as THREE.MeshStandardMaterial;
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
export const mobDeathAnimating: { [mobId: string]: boolean } = {};

const mobTargetPositions: { [mobId: string]: THREE.Vector3 } = {};
const mobTargetRotations: { [mobId: string]: number } = {};
const MOB_INTERPOLATION_SPEED = 10.0;
const HP_BAR_DISTANCE = 30;

// ---------- ФУНКЦИЯ СОЗДАНИЯ ЭКЗЕМПЛЯРА МОБА ----------
function createWolfInstance(mobId: string): THREE.Group {
    if (!wolfTemplate) throw new Error('Шаблон волка ещё не загружен');
    const model = clone(wolfTemplate) as unknown as THREE.Group;
    model.scale.set(0.5, 0.5, 0.5);
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

    /* model.updateMatrixWorld();
    const box = new THREE.Box3().setFromObject(model);
    const finalHeight = box.max.y - box.min.y;
    console.log(`[PLAYER] WOLF Final visible height: ${finalHeight.toFixed(3)} units`); */

    // Миксер и FSM
    const mixer = new THREE.AnimationMixer(model);
    const actions: Record<string, THREE.AnimationAction | null> = {};
    wolfAnimations.forEach((clip) => {
        const action = mixer.clipAction(clip, model);
        actions[clip.name.toLowerCase()] = action;
    });

    // Устанавливаем loop для одноразовых анимаций
    const oneShotActions = ['attack', 'death', 'idle_hitreact1', 'idle_hitreact2', 'gallop_jump'];
    for (const name of oneShotActions) {
        const action = actions[name];
        if (action) {
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
        }
    }

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
    hpBar.position.set(0, 2.5, 0);
    model.add(hpBar);
    mobHpBars[mobId] = hpBar;

    scene.add(model);
    return model;
}

// ---------- SKELETON INSTANCE ----------
function createSkeletonInstance(mobId: string): THREE.Group {
    if (!skeletonTemplate) throw new Error('Skeleton template not loaded');

    const model = clone(skeletonTemplate) as unknown as THREE.Group;
    model.scale.set(1, 1, 1);
    model.visible = true;
    model.matrixAutoUpdate = true;
    model.rotation.set(0, Math.PI, 0);

    // Apply toon material to all meshes - preserve ALL original material properties
    model.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) {
            const orig = child.material as THREE.MeshStandardMaterial;
            const newMat = new THREE.MeshToonMaterial({
                color: orig.color,
                gradientMap: toonGradientMap,
                map: orig.map || null,
            });

            newMat.transparent = orig.transparent ?? false;
            newMat.alphaTest = orig.alphaTest ?? 0;
            newMat.side = orig.side ?? THREE.FrontSide;
            newMat.vertexColors = orig.vertexColors ?? false;
            newMat.wireframe = orig.wireframe ?? false;
            newMat.emissive = orig.emissive ? orig.emissive.clone() : new THREE.Color(0x222222);
            newMat.emissiveIntensity = orig.emissiveIntensity ?? 0.15;
            newMat.opacity = orig.opacity ?? 1;

            child.material = newMat;
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    // Add invisible hitbox for raycasting (skeleton has thin bone meshes with gaps between them)
    // Standard Three.js raycaster checks object.visible - this mesh is visible but renders with zero opacity
    const hitboxGeom = new THREE.CylinderGeometry(0.5, 0.5, 1.8, 8);
    const hitboxMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const hitbox = new THREE.Mesh(hitboxGeom, hitboxMat);
    hitbox.position.set(0, 0.9, 0); // center of skeleton body
    hitbox.userData.isHitbox = true;
    model.add(hitbox);

    // Attach falchion: direct child of model with per-frame bone position tracking
    const handBone = findHandBone(model);
    
    if (falchionTemplate) {
        const falchion = falchionTemplate.clone(true);
        // IMPORTANT: Template has visible=false, cloned mesh inherits it!
        falchion.visible = true;
        // Initial position - will be updated each frame via bone tracking
        falchion.position.set(0.8, 1.3, 0.0);
        falchion.rotation.set(0, 0, 0);
        falchion.scale.set(1, 1, 1);
        model.add(falchion);
        
        // Store for per-frame bone tracking updates
        (model as any)._falchion = falchion;
        (model as any)._handBone = handBone;
        // Calibrated offset: _rot(0, 180, 115) aligns falchion blade with skeleton's forward direction
        (model as any)._falchionOffset = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 115 * Math.PI / 180));
        // Calibrated position offset: _pos(-0.1, 0.00, 0.09) moves falchion from wrist to palm in bone-local space
        (model as any)._falchionPosOffset = new THREE.Vector3(-0.1, 0.00, 0.09);
        
        
        //console.log(`[SKELETON ${mobId}] Falchion ready. Calibrate via _rot(x,y,z) in console. handBone: ${handBone?.name || 'null'}`);
    } else {
        console.log(`[SKELETON ${mobId}] Falchion template not loaded`);
    }

    // Mixer and FSM
    const mixer = new THREE.AnimationMixer(model);
    const actions: Record<string, THREE.AnimationAction | null> = {};

    skeletonAnimations.forEach((clip) => {
        const loweredName = clip.name.toLowerCase();
        const mappedName = SKELETON_ANIM_MAP[loweredName] || loweredName;
        const action = mixer.clipAction(clip, model);
        // Store under both original lowered and mapped name for flexibility
        actions[loweredName] = action;
        if (mappedName !== loweredName) {
            actions[mappedName] = action;
        }
    });

    // Setup one-shot animations
    const oneShotActions = [
        'death', 'slash01', 'slash02', 'stab', 'throw_projectiles',
        'take_damage', 'scream', 'spawn', 'fall', 'jump',
        'turn_left_90', 'turn_right_90', 'underground'
    ];
    for (const name of oneShotActions) {
        const action = actions[name];
        if (action) {
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
        }
    }

    mobMixers[mobId] = mixer;
    mobActions[mobId] = actions;

    // Create FSM
    const fsm = new AnimationStateMachine(mixer, actions as Record<string, THREE.AnimationAction>, mobId);
    mobFSM[mobId] = fsm;

    // Start idle by default
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

    // HP bar (slightly higher than wolf)
    const hpBar = createHpBar();
    hpBar.position.set(0, 2.0, 0);
    model.add(hpBar);
    mobHpBars[mobId] = hpBar;

    scene.add(model);
    return model;
}

// ---------- PUBLIC FUNCTIONS ----------
export function setMobTargetPosition(mobId: string, x: number, z: number) {
    if (!mobTargetPositions[mobId]) {
        mobTargetPositions[mobId] = new THREE.Vector3(x, 0, z);
    } else {
        mobTargetPositions[mobId].set(x, 0, z);
    }
}

export function spawnMob(mobId: string, x: number, z: number, hp: number, maxHp: number, rotationY?: number, mobType: string = 'wolf', state?: string) {
    if (mobModels[mobId]) return;

    let model: THREE.Group;
    if (mobType === 'skeleton') {
        model = createSkeletonInstance(mobId);
    } else {
        model = createWolfInstance(mobId);
    }

    const y = getTerrainHeightAtFast(x, z);
    model.position.set(x, y + 0.1, z);
    if (rotationY !== undefined) {
        model.rotation.y = rotationY;
        setMobTargetAngle(mobId, rotationY);
    }
    mobModels[mobId] = model;

    updateHpBarSprite(mobHpBars[mobId], hp, maxHp);
    setMobTargetPosition(mobId, x, z);

    // Apply initial state if provided (e.g., 'spawn' for skeleton respawn)
    if (state) {
        const fsm = mobFSM[mobId];
        if (fsm) {
            const lowerState = state.toLowerCase();
            const knownOneShot = [
                'attack', 'death', 'idle_hitreact1', 'idle_hitreact2', 'gallop_jump',
                'slash01', 'slash02', 'stab', 'throw_projectiles', 'take_damage',
                'scream', 'spawn', 'fall', 'jump', 'revive',
                'turn_left_90', 'turn_right_90', 'underground'
            ];
            if (knownOneShot.includes(lowerState)) {
                fsm.playOneShot(lowerState);
            } else {
                fsm.transitionTo(lowerState);
            }
        }
    }
}

export function updateMobState(mobId: string, x: number, z: number, hp: number, maxHp: number, state: string, rotationY?: number) {
    const model = mobModels[mobId];
    if (!model) return;
    
    // Save previous position for rotation calculation
    if (!lastMobPositions[mobId]) {
        lastMobPositions[mobId] = new THREE.Vector3(model.position.x, 0, model.position.z);
    } else {
        lastMobPositions[mobId].set(model.position.x, 0, model.position.z);
    }
    
    setMobTargetPosition(mobId, x, z);
    updateHpBarSprite(mobHpBars[mobId], hp, maxHp);
    
    // Store server rotation as target for smooth interpolation (avoids snapping)
    // Server uses atan2(dz, dx) convention (angle 0 = +X), convert to Three.js atan2(dx, dz) (angle 0 = +Z)
    if (rotationY !== undefined) {
        // Server uses atan2(dz, dx) convention (angle 0 = +X), convert to Three.js atan2(dx, dz) (angle 0 = +Z)
        // threeAngle = PI/2 - serverAngle
        mobTargetRotations[mobId] = Math.PI / 2 - rotationY;
    }

    const fsm = mobFSM[mobId];
    if (!fsm) return;

    const lowerState = state.toLowerCase();

    // Ignore non-death anims if death is playing
    if (mobDeathAnimating[mobId] && lowerState !== 'death') {
        return;
    }

    // Determine if this state is a one-shot animation
    const action = fsm['actions'] ? (fsm as any).actions[lowerState] : null;
    const isOneShotAction = action && action.loop === THREE.LoopOnce;

    // Known one-shot animation names (wolf + skeleton)
    const knownOneShotStates = [
        'attack', 'death', 'idle_hitreact1', 'idle_hitreact2', 'gallop_jump',
        'slash01', 'slash02', 'stab', 'throw_projectiles', 'take_damage',
        'scream', 'spawn', 'fall', 'jump', 'revive',
        'turn_left_90', 'turn_right_90', 'underground'
    ];

    if (knownOneShotStates.includes(lowerState) || isOneShotAction) {
        if (lowerState === 'death') {
            if (!mobDeathAnimating[mobId]) {
                mobDeathAnimating[mobId] = true;
                fsm.playDeath();
            }
        } else {
            if (fsm.currentStateName !== lowerState) {
                fsm.playOneShot(lowerState);
                // Spawn bone projectile for skeleton ranged attack
                if (lowerState === 'throw_projectiles') {
                    const model = mobModels[mobId];
                    if (model && (model as any)._falchion) {
                        // Use actual target position sent from server (player position at throw time)
                        // Fallback: aim in the direction skeleton is facing if no pending target
                        const pending = pendingProjectileTargets[mobId];
                        let targetX: number;
                        let targetZ: number;
                        if (pending) {
                            targetX = pending.x;
                            targetZ = pending.z;
                            delete pendingProjectileTargets[mobId];
                        } else {
                            // Fallback: launch in facing direction
                            const angle = model.rotation.y;
                            targetX = x + Math.sin(angle) * 10;
                            targetZ = z + Math.cos(angle) * 10;
                        }
                        // ~60% accuracy: bone has 60% chance to hit exact target, otherwise random spread
                        spawnBoneProjectile(x, z, targetX, targetZ, 0.6);
                    }
                }
            }
        }
    } else {
        // Cyclic animations (idle, walk, gallop, walk_forward, run_forward, etc.)
        if (mobDeathAnimating[mobId]) return;
        if (fsm.currentStateName !== lowerState) {
            fsm.transitionTo(lowerState);
        }
    }
}

export function despawnMob(mobId: string) {
    delete mobDeathAnimating[mobId];
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
    delete mobTargetRotations[mobId];
}

export function updateMobAnimations(deltaTime: number) {
    // Update all skeletal mixers
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
            const targetY = getTerrainHeightAtFast(model.position.x, model.position.z) + 0.1;
            const lerpFactor = 0.2; // скорость сглаживания (0..1)
            model.position.y += (targetY - model.position.y) * lerpFactor;

            // Rotation: use server rotation when stationary, movement direction when moving
            const prevPos = lastMobPositions[mobId];
            const targetRot = mobTargetRotations[mobId];
            if (prevPos) {
                const dx = targetPos.x - prevPos.x;
                const dz = targetPos.z - prevPos.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist > 0.01) {
                    // Moving: rotate toward movement direction
                    const targetAngle = Math.atan2(dx, dz);
                    const currentAngle = model.rotation.y;
                    let diff = targetAngle - currentAngle;
                    while (diff > Math.PI) diff -= 2 * Math.PI;
                    while (diff < -Math.PI) diff += 2 * Math.PI;
                    model.rotation.y += diff * Math.min(1, MOB_ANGLE_INTERPOLATION * deltaTime);
                } else if (targetRot !== undefined) {
                    // Stationary: smoothly interpolate toward server rotation (for attacking in place)
                    const currentAngle = model.rotation.y;
                    let diff = targetRot - currentAngle;
                    while (diff > Math.PI) diff -= 2 * Math.PI;
                    while (diff < -Math.PI) diff += 2 * Math.PI;
                    model.rotation.y += diff * Math.min(1, MOB_ANGLE_INTERPOLATION * deltaTime);
                }
            }
        }

        // Distance-based HP bar visibility
        const hpBar = mobHpBars[mobId];
        if (hpBar) {
            if (localModel) {
                const dx = localModel.position.x - model.position.x;
                const dz = localModel.position.z - model.position.z;
                hpBar.visible = dx * dx + dz * dz <= HP_BAR_DISTANCE * HP_BAR_DISTANCE;
            } else {
                hpBar.visible = true;
            }
        }

        // Per-frame bone tracking for skeleton weapon (falchion)
        const falchion = (model as any)._falchion;
        const handBone = (model as any)._handBone;
        if (falchion && handBone) {
            // Force bone matrix update from GPU skinning domain
            model.updateWorldMatrix(true, false);
            handBone.updateWorldMatrix(true, false);
            
            // Get animated world position/rotation of the hand bone
            const boneWorldPos = new THREE.Vector3();
            const boneWorldQuat = new THREE.Quaternion();
            const boneWorldScale = new THREE.Vector3();
            handBone.matrixWorld.decompose(boneWorldPos, boneWorldQuat, boneWorldScale);
            
            // Apply to falchion in local space of the model
            // Convert world position to model-local position
            const modelWorldPos = new THREE.Vector3();
            const modelWorldQuat = new THREE.Quaternion();
            const modelWorldScale = new THREE.Vector3();
            model.matrixWorld.decompose(modelWorldPos, modelWorldQuat, modelWorldScale);
            
            // Invert model world transform to get local bone position
            const modelWorldMatrixInv = new THREE.Matrix4().copy(model.matrixWorld).invert();
            const localPos = boneWorldPos.clone().applyMatrix4(modelWorldMatrixInv);
            const localQuat = modelWorldQuat.clone().invert().multiply(boneWorldQuat);
            
            // Apply local rotation offset to align falchion blade with hand orientation
            // Falchion GLB model's default blade direction differs from bone's forward axis
            const offsetQuat = (model as any)._falchionOffset;
            if (offsetQuat) {
                localQuat.multiply(offsetQuat);
            }
            
            // Apply position offset in bone-local space (e.g., move from wrist to palm)
            // Convert bone-local offset to model-local space via bone-to-model quaternion
            const posOffset = (model as any)._falchionPosOffset;
            if (posOffset) {
                const boneToModelQuat = modelWorldQuat.clone().invert().multiply(boneWorldQuat);
                localPos.add(posOffset.clone().applyQuaternion(boneToModelQuat));
            }
            
            falchion.position.copy(localPos);
            falchion.quaternion.copy(localQuat);
        }
    }
}