import * as THREE from 'three';
import { PLAYER_SPEED, STORAGE_KEY, SPRINT_MULTIPLIER } from './config';
import { scene, camera, renderer } from './scene';
import { getMovementInput, getCameraRelativeMovement, sprintKey } from './input';
import { localModel, otherPlayers, modelReady, fsm, deathAnimating } from './player';
import { room, startConnection, lastMoveTimes } from './network';
import { composer, outlinePass } from './postprocessing';
import { updateAnimations } from './animationUtils';
import { setCameraTarget, updateCamera, getCameraYaw, isRightDragging,
    enableActionMode, disableActionMode, actionMode,
    pushUIMode, popUIMode, uiWindowsOpen, toggleAltMode, isAltToggled,
    toggleAim, isAiming } from './cameraControls';
import { cleanUpScene } from './startupCleanup';
import { createMinimap, updateMinimap } from './minimap';
import { createWorldMap, updateWorldMap, toggleWorldMap } from './worldMap';
import { createPlayerUI } from './playerUI';
import { updateProjectiles, setProjectileScene } from './mobs/projectile';
import { createTargetUI } from './targetUI';
import { updateMobAnimations, interpolateMobPositions, mobModels } from './mobPlayer';
import { renderLabels } from './renderers';
import './interaction';
import { createInventoryUI, toggleInventory } from './inventoryUI';
import { createLootUI } from './ui/LootWindowUI';
import { createBankUI } from './ui/BankUI';
import { createCraftingUI } from './ui/CraftingUI';
import { initMerchantUI } from './ui/MerchantUI';
import { animateLootMeshes } from './render/LootRenderer';
import {createCharacterPanel, toggleCharacterPanel} from './characterPanel';
import { createChatInput, isChatActive } from './chat/chatInput';
import { normalizeKey } from './keyboard';
import { createDialogUI } from './ui/DialogUI';
import { createQuestJournal, toggleQuestJournal } from './quest/QuestJournalUI';
import { createNotificationUI } from './ui/notificationUI';
import { createProfessionsUI, toggleProfessions } from './ui/ProfessionsUI';
import { createAdminPanel, toggleAdminPanel, isAdminVisible } from './ui/AdminPanel';
import { updateFPS } from './utils/fpsCounter';
import { updateInteractionLabels } from './render/InteractionLabels';
import { applyMovementWithCollisions, updateDynamicColliders, getAllColliders, PLAYER_RADIUS, computeGroundHeight, MAX_STEP_HEIGHT } from './collision';
import { updateCollisionDebug } from './debug/collisionDebug';
import { isCollisionDebugVisible } from './debug/debugState';
import { initEditor, updateEditor } from './editor/Editor';
import { updateWaterAnimation } from './render/WaterRenderer';
import { initDragDrop } from './inventoryDnD';
import { isEditorActive } from './editor/EditorState';

let playerName = localStorage.getItem(STORAGE_KEY) || '';

if (!playerName) {
    playerName = prompt('Введите никнейм:') || '';
    if (!playerName) {
        alert('Имя не введено. Обновите страницу, чтобы попробовать снова.');
        throw new Error('Имя не задано');
    }
    localStorage.setItem(STORAGE_KEY, playerName);
}

cleanUpScene();

modelReady.then(() => {
    setProjectileScene(scene);
    startConnection(playerName);
    setTimeout(() => {
        enableActionMode();
    }, 1000);
    createPlayerUI(playerName, 1);
    createTargetUI();
    createMinimap();
    createWorldMap();
    createInventoryUI();
    createLootUI();
    createCharacterPanel();
    createChatInput();
    createDialogUI();
    createQuestJournal();
    createNotificationUI();
    createBankUI();
    createCraftingUI();
    initMerchantUI();
    createProfessionsUI();
    createAdminPanel();
    initEditor();
    initDragDrop();
    setTimeout(() => {
        fsm['local']?.transitionTo('idle');
    }, 500);
});

document.addEventListener('keydown', (e) => {
    if (isEditorActive()) return;
    const key = normalizeKey(e.key);
    if (isChatActive()) {
        // Если чат активен, не обрабатываем клавиши меню и не даём повторно фокусироваться по T
        if (key === 't') {
            e.preventDefault(); // на всякий случай
        }
        return;
    }
    if (key === 't') {
        if (document.activeElement === document.body) {
            const chatInput = document.getElementById('chat-input');
            if (chatInput) {
                chatInput.focus();
                e.preventDefault();
            }
        }
    }
    if (key === 'm') { toggleWorldMap(); }
    if (key === 'b') { toggleInventory(); }
    if (key === 'c') { toggleCharacterPanel(); }
    if (key === 'j') {
        if (document.activeElement === document.body) {
            toggleQuestJournal();
        }
    }
    if (key === 'k') { toggleProfessions(); }
    if (key === 'o') { toggleAdminPanel(); }
});

setTimeout(() => renderer.domElement.focus({ preventScroll: true }), 100);

let lastSend = 0;
let lastTime = performance.now();
const playerPhysicalPos = new THREE.Vector3();
const _moveVec = new THREE.Vector3();
const _rawDelta = new THREE.Vector3();
const _currentPos = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _box = new THREE.Box3();
const _center = new THREE.Vector3();
const _cameraForward = new THREE.Vector3();
const _tempVec = new THREE.Vector3(); // reusable temp for dynamic entity positions

// Reusable arrays (cleared and repopulated each frame, avoids per-frame GC pressure)
const _dynamicEntities: { position: THREE.Vector3; radius: number }[] = [];
const _dynamicEntityObjs: { position: THREE.Vector3; radius: number }[] = [];
let _dynamicEntityCount = 0;
const _mapOthers: { x: number; z: number; rotationY: number; visible: boolean }[] = [];
const _mapMobs: { x: number; z: number; visible: boolean }[] = [];
const _mapNpcs: { x: number; z: number; visible: boolean }[] = [];
let _mapOthersCount = 0;
let _mapMobsCount = 0;
let _mapNpcsCount = 0;
const _selectedObjects: THREE.Object3D[] = [];
const _emptyColliders: any[] = [];
const GRAVITY = -15;
let verticalVelocity = 0;
let isFalling = false;
let _wasFalling = false;

window.addEventListener('keydown', (e) => {
    // Блокируем горячие клавиши браузера при Alt+WASD (на всякий случай)
    if (e.altKey && (e.key === 'w' || e.key === 'a' || e.key === 's' || e.key === 'd')) {
        e.preventDefault();
        e.stopImmediatePropagation();
    }
    // Переключение режима по Alt (только нажатие, не удержание)
    if (e.key === 'Alt') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.repeat) return;

        toggleAltMode();
        if (isAltToggled()) {
            disableActionMode();   // Cursor Mode
        } else {
            if (uiWindowsOpen === 0) {
                enableActionMode();    // Action Mode
            }
        }
    }
});

function getMovementAnimationName(moveVec: THREE.Vector3, model: THREE.Group, sprint: boolean): string {
    const EPS = 0.01;
    
    if (moveVec.length() < EPS) return 'idle';

    const moveAngle = Math.atan2(moveVec.x, moveVec.z);
    const modelAngle = model.rotation.y;

    let angleDiff = moveAngle - modelAngle;
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    const degrees = angleDiff * (180 / Math.PI);

    if (degrees >= -22.5 && degrees < 22.5) {
        return sprint ? 'run' : 'walk_fwd';
    } else if (degrees >= 22.5 && degrees < 67.5) {
        return 'walk_fwd_left';
    } else if (degrees >= 67.5 && degrees < 112.5) {
        return 'walk_left';
    } else if (degrees >= 112.5 && degrees < 157.5) {
        return 'walk_bwd_left';
    } else if (degrees >= 157.5 || degrees < -157.5) {
        return 'walk_bwd';
    } else if (degrees >= -157.5 && degrees < -112.5) {
        return 'walk_bwd_right';
    } else if (degrees >= -112.5 && degrees < -67.5) {
        return 'walk_right';
    } else if (degrees >= -67.5 && degrees < -22.5) {
        return 'walk_fwd_right';
    }
    return 'walk_fwd'; // fallback
}

function loop() {
    updateFPS();
    requestAnimationFrame(loop);

    const now = performance.now();
    const frameDuration = now - lastTime;
    const deltaTime = frameDuration / 1000;
    lastTime = now;

    // Log long frames (>50ms) which may cause stutter
    if (frameDuration > 50) {
        //console.warn(`[PERF] Long frame: ${frameDuration.toFixed(1)}ms, alive=${!!(room?.state?.players?.get(room.sessionId)?.hp > 0)}`);
    }

    let lastDebugVisible = false;

    if (!room || !localModel) return;

    // Инициализация физической позиции при первом кадре
    if (playerPhysicalPos.lengthSq() === 0) {
        playerPhysicalPos.copy(localModel.position);
    }

    // Анимация воды (всегда)
    updateWaterAnimation(deltaTime);

    // =================== РЕЖИМ РЕДАКТОРА ===================
    if (isEditorActive()) {
        // Обновляем TransformControls (они используют камеру)
        updateEditor(deltaTime)

        // Рендер сцены (без обновления анимаций игрока и мобов)
        const debugVisible = isCollisionDebugVisible();
        if (debugVisible) {
            updateCollisionDebug(getAllColliders(), localModel.position, 20);
        } else if (lastDebugVisible && !debugVisible) {
            // однократная очистка при выключении
            updateCollisionDebug([], localModel.position, 20);
        }
        lastDebugVisible = debugVisible;
        composer.render();
        renderLabels(scene, camera);
        return; // прерываем выполнение игровой логики
    }

    // =================== ИГРОВОЙ РЕЖИМ ===================
    const myPlayer = room.state?.players?.get(room.sessionId);
    const alive = myPlayer && myPlayer.hp > 0;

    // Sync physical position with model position if there's a big discrepancy
    // (e.g. after respawn at 0,0 or positionCorrection from server).
    // Without this, playerPhysicalPos retains the old death location, causing
    // movement to be computed from the wrong origin, which then triggers
    // positionCorrection loops (teleporting back and forth).
    if (localModel) {
        const physToModelDist = playerPhysicalPos.distanceTo(localModel.position);
        if (physToModelDist > 1.0) {
            playerPhysicalPos.copy(localModel.position);
        }
    }

    if (alive) {
        if (actionMode) {
            // Action Mode: движение всегда относительно камеры
            _moveVec.copy(getCameraRelativeMovement(camera));
        } else if (isRightDragging) {
            _moveVec.copy(getCameraRelativeMovement(camera));
        } else {
            if (isChatActive()) {
                _moveVec.set(0, 0, 0);
            } else {
                const raw = getMovementInput();
                if (raw.x !== 0 || raw.z !== 0) {
                    _forward.set(0, 0, 1).applyQuaternion(localModel!.quaternion);
                    _forward.y = 0; _forward.normalize();
                    _right.set(1, 0, 0).applyQuaternion(localModel!.quaternion);
                    _right.y = 0; _right.normalize();

                    _moveVec.set(0, 0, 0)
                        .addScaledVector(_forward, -raw.z)
                        .addScaledVector(_right, raw.x)
                        .normalize();
                } else {
                    _moveVec.set(0, 0, 0);
                }
            }
        }

        // Block movement and rotation during one-shot animations (attack, hit reaction, etc.)
        if (fsm['local']?.isPlayingOneShot) {
            _moveVec.set(0, 0, 0);
        }

                // В Action Mode персонаж всегда смотрит туда же, куда и камера
        if (actionMode && localModel && _moveVec.length() > 0) {
            const yaw = getCameraYaw();
            _cameraForward.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
            if (_cameraForward.length() > 0.01) {
                const targetAngle = Math.atan2(_cameraForward.x, _cameraForward.z);
                const currentAngle = localModel.rotation.y;
                let diff = targetAngle - currentAngle;
                while (diff > Math.PI) diff -= 2 * Math.PI;
                while (diff < -Math.PI) diff += 2 * Math.PI;
                localModel.rotation.y += diff * Math.min(1, 10 * deltaTime);
            }
        }

        // При зажатой ПКМ в Cursor-режиме – поворот к камере ТОЛЬКО ВО ВРЕМЯ ДВИЖЕНИЯ
        if (isRightDragging && localModel && _moveVec.length() > 0) {
            const yaw = getCameraYaw();
            _cameraForward.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
            if (_cameraForward.length() > 0.01) {
                const targetAngle = Math.atan2(_cameraForward.x, _cameraForward.z);
                const currentAngle = localModel.rotation.y;
                let diff = targetAngle - currentAngle;
                while (diff > Math.PI) diff -= 2 * Math.PI;
                while (diff < -Math.PI) diff += 2 * Math.PI;
                localModel.rotation.y += diff * Math.min(1, 10 * deltaTime);
            }
        }

        const isMoving = _moveVec.lengthSq() > 0;
        const speedMultiplier = sprintKey ? SPRINT_MULTIPLIER : 1.0;
        const delta = PLAYER_SPEED * 0.016 * speedMultiplier;

        if (isMoving) {
            // Динамические коллайдеры (другие игроки и мобы)
            _dynamicEntities.length = 0;
            _dynamicEntityCount = 0;

            for (const id in otherPlayers) {
                const model = otherPlayers[id];
                if (model && model.visible && id !== room.sessionId) {
                    let ent: { position: THREE.Vector3; radius: number };
                    if (_dynamicEntityCount < _dynamicEntityObjs.length) {
                        ent = _dynamicEntityObjs[_dynamicEntityCount];
                        ent.position = model.position;
                        ent.radius = 0.5;
                    } else {
                        ent = { position: model.position, radius: 0.5 };
                        _dynamicEntityObjs.push(ent);
                    }
                    _dynamicEntities.push(ent);
                    _dynamicEntityCount++;
                }
            }

            for (const mobId in mobModels) {
                const mob = mobModels[mobId];
                if (mob && mob.visible) {
                    let ent: { position: THREE.Vector3; radius: number };
                    if (_dynamicEntityCount < _dynamicEntityObjs.length) {
                        ent = _dynamicEntityObjs[_dynamicEntityCount];
                        ent.position = mob.position;
                        ent.radius = 0.6;
                    } else {
                        ent = { position: mob.position, radius: 0.6 };
                        _dynamicEntityObjs.push(ent);
                    }
                    _dynamicEntities.push(ent);
                    _dynamicEntityCount++;
                }
            }

            updateDynamicColliders(_dynamicEntities);
        }

        // ---- Movement + gravity (всегда, чтобы падение работало и без ходьбы) ----
        _rawDelta.set(_moveVec.x * delta, 0, _moveVec.z * delta);
        _currentPos.copy(playerPhysicalPos);
        const newPos = applyMovementWithCollisions(_currentPos, _rawDelta, 0.2, false);
        playerPhysicalPos.copy(newPos);

        const groundY = computeGroundHeight(playerPhysicalPos);
        const feetY = playerPhysicalPos.y - PLAYER_RADIUS;

        if (feetY <= groundY + MAX_STEP_HEIGHT) {
            playerPhysicalPos.y = groundY + PLAYER_RADIUS;
            verticalVelocity = 0;
            isFalling = false;
        } else {
            isFalling = true;
            verticalVelocity += GRAVITY * deltaTime;
            playerPhysicalPos.y += verticalVelocity * deltaTime;

            const landingGroundY = computeGroundHeight(playerPhysicalPos);
            if (landingGroundY > -Infinity && playerPhysicalPos.y - PLAYER_RADIUS <= landingGroundY) {
                playerPhysicalPos.y = landingGroundY + PLAYER_RADIUS;
                verticalVelocity = 0;
                isFalling = false;
            }
        }

        localModel.position.copy(playerPhysicalPos).y -= PLAYER_RADIUS - 0.15;

        const nowSend = Date.now();
        if (nowSend - lastSend > 50) {
            try {
                room.send("move", {
                    x: localModel.position.x,
                    z: localModel.position.z,
                    y: localModel.position.y,
                    r: localModel.rotation.y
                });
                lastSend = nowSend;
            } catch (e) {}
        }

        if (!deathAnimating['local']) {
            if (isFalling) {
                fsm['local']?.transitionToFallLoop();
            } else if (_wasFalling && !isFalling) {
                fsm['local']?.requestLand();
            } else if (isMoving) {
                const newState = getMovementAnimationName(_moveVec, localModel!, sprintKey);
                fsm['local']?.transitionTo(newState);
            } else {
                fsm['local']?.transitionTo('idle');
            }
        }
        _wasFalling = isFalling;

        updateInteractionLabels(playerPhysicalPos);
    }

    // Камера следует за игроком
    if (localModel) {
        _box.setFromObject(localModel);
        _box.getCenter(_center);
        _center.y += 1.4;
        setCameraTarget(_center.x, _center.y, _center.z);
    }
    updateCamera(deltaTime);

    // Миникарта и большая карта
    if (localModel) {
        _mapOthersCount = 0;
        _mapMobsCount = 0;
        _mapNpcsCount = 0;

        for (const id in otherPlayers) {
            const model = otherPlayers[id];
            if (model) {
                let entry: { x: number; z: number; rotationY: number; visible: boolean };
                if (_mapOthersCount < _mapOthers.length) {
                    entry = _mapOthers[_mapOthersCount];
                } else {
                    entry = { x: 0, z: 0, rotationY: 0, visible: false };
                    _mapOthers.push(entry);
                }
                entry.x = model.position.x;
                entry.z = model.position.z;
                entry.rotationY = model.rotation.y;
                entry.visible = model.visible;
                _mapOthersCount++;
            }
        }
        _mapOthers.length = _mapOthersCount;

        for (const mobId in mobModels) {
            const mobModel = mobModels[mobId];
            if (mobModel) {
                let entry: { x: number; z: number; visible: boolean };
                if (_mapMobsCount < _mapMobs.length) {
                    entry = _mapMobs[_mapMobsCount];
                } else {
                    entry = { x: 0, z: 0, visible: false };
                    _mapMobs.push(entry);
                }
                entry.x = mobModel.position.x;
                entry.z = mobModel.position.z;
                entry.visible = mobModel.visible;
                _mapMobsCount++;
            }
        }
        _mapMobs.length = _mapMobsCount;

        if (room.state.npcs) {
            room.state.npcs.forEach((npc: { x: number; z: number }) => {
                let entry: { x: number; z: number; visible: boolean };
                if (_mapNpcsCount < _mapNpcs.length) {
                    entry = _mapNpcs[_mapNpcsCount];
                } else {
                    entry = { x: 0, z: 0, visible: false };
                    _mapNpcs.push(entry);
                }
                entry.x = npc.x;
                entry.z = npc.z;
                _mapNpcsCount++;
            });
        }
        _mapNpcs.length = _mapNpcsCount;

        updateMinimap(localModel.position.x, localModel.position.z, localModel.rotation.y, _mapOthers, _mapMobs, _mapNpcs);
        updateWorldMap(localModel.position.x, localModel.position.z, localModel.rotation.y, _mapOthers, _mapMobs, _mapNpcs);
    }

    // Idle-анимация для других игроков
    const IDLE_TIMEOUT = 200;
    for (const sessionId in otherPlayers) {
        const lastMove = lastMoveTimes.get(sessionId) || 0;
        if (Date.now() - lastMove > IDLE_TIMEOUT && !deathAnimating[sessionId]) {
            fsm[sessionId]?.transitionTo('idle');
        }
    }

    // Outline выбранных объектов
    _selectedObjects.length = 0;
    _selectedObjects.push(localModel);
    for (const id in otherPlayers) {
        const model = otherPlayers[id];
        if (model && model.visible) _selectedObjects.push(model);
    }
    outlinePass.selectedObjects = _selectedObjects;

    // Обновление анимаций и позиций
    updateAnimations(deltaTime);
    updateMobAnimations(deltaTime);
    interpolateMobPositions(deltaTime);
    updateProjectiles(deltaTime);
    animateLootMeshes();

    // Отладка коллизий
    updateCollisionDebug(
        isCollisionDebugVisible() ? getAllColliders() : _emptyColliders,
        localModel.position,
        30
    );

    // Рендер
    composer.render();
    renderLabels(scene, camera);
}

// Add pointer lock request listeners ONCE at module level (not every frame!)
// This was a critical memory leak — adding listeners inside loop() accumulated
// ~36,000 listeners in 5 minutes, causing severe FPS degradation during movement.
(function initPointerLockListeners() {
    renderer.domElement.addEventListener('click', () => {
        if (!document.pointerLockElement && uiWindowsOpen === 0 && !isAltToggled()) {
            enableActionMode();
        }
    });
    window.addEventListener('keydown', () => {
        if (!document.pointerLockElement && uiWindowsOpen === 0 && !isAltToggled()) {
            enableActionMode();
        }
    });
})();

// Periodic heap usage logging (every 2 minutes)
setInterval(() => {
    const mem = (performance as any).memory;
    if (mem) {
        const usedMB = Math.round(mem.usedJSHeapSize / 1048576);
        const totalMB = Math.round(mem.jsHeapSizeLimit / 1048576);
        if (usedMB > 1000) console.warn(`[MEM] ${usedMB}MB / ${totalMB}MB`);
        else console.log(`[MEM] ${usedMB}MB / ${totalMB}MB`);
    }
}, 120000);

loop();