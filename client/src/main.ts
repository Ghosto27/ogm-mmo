import * as THREE from 'three';
import { PLAYER_SPEED, STORAGE_KEY, SPRINT_MULTIPLIER } from './config';
import { scene, camera, renderer } from './scene';
import { getMovementInput, getCameraRelativeMovement, sprintKey } from './input';
import { localModel, otherPlayers, modelReady, fsm, deathAnimating } from './player';
import { room, startConnection, lastMoveTimes } from './network';
import { composer, outlinePass } from './postprocessing';
import { updateAnimations } from './animationUtils';
import { setCameraTarget, updateCamera, isRightDragging,
    enableActionMode, disableActionMode, actionMode,
    pushUIMode, popUIMode, uiWindowsOpen, toggleAltMode, isAltToggled } from './cameraControls';
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
import { animateLootMeshes } from './render/LootRenderer';
import {createCharacterPanel, toggleCharacterPanel} from './characterPanel';
import { createChatInput, isChatActive } from './chat/chatInput';
import { normalizeKey } from './keyboard';
import { createDialogUI } from './ui/DialogUI';
import { createQuestJournal, toggleQuestJournal } from './quest/QuestJournalUI';
import { createNotificationUI } from './ui/notificationUI';
import { updateFPS } from './utils/fpsCounter';
import { applyMovementWithCollisions, updateDynamicColliders, getAllColliders, PLAYER_RADIUS } from './collision';
import { updateCollisionDebug } from './debug/collisionDebug';
import { isCollisionDebugVisible } from './debug/debugState';
import { initEditor, updateEditor } from './editor/Editor';
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
    const deltaTime = (now - lastTime) / 1000;
    lastTime = now;
    let lastDebugVisible = false;

    if (!room || !localModel) return;

    // Инициализация физической позиции при первом кадре
    if (playerPhysicalPos.lengthSq() === 0) {
        playerPhysicalPos.copy(localModel.position);
    }

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

                // В Action Mode персонаж всегда смотрит туда же, куда и камера
        if (actionMode && localModel && _moveVec.length() > 0) {
            camera.getWorldDirection(_cameraForward);
            _cameraForward.y = 0;
            _cameraForward.normalize();
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
            camera.getWorldDirection(_cameraForward);
            _cameraForward.y = 0;
            _cameraForward.normalize();
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

        if (isMoving) {
            const speedMultiplier = sprintKey ? SPRINT_MULTIPLIER : 1.0;
            const delta = PLAYER_SPEED * 0.016 * speedMultiplier;

            // Динамические коллайдеры (другие игроки и мобы)
            const dynamicEntities: { position: THREE.Vector3; radius: number }[] = [];

            for (const id in otherPlayers) {
                const model = otherPlayers[id];
                if (model && model.visible && id !== room.sessionId) {
                    dynamicEntities.push({
                        position: model.position.clone(),
                        radius: 0.5,
                    });
                }
            }

            for (const mobId in mobModels) {
                const mob = mobModels[mobId];
                if (mob && mob.visible) {
                    dynamicEntities.push({
                        position: mob.position.clone(),
                        radius: 0.6,
                    });
                }
            }

            updateDynamicColliders(dynamicEntities);

            _rawDelta.set(_moveVec.x * delta, 0, _moveVec.z * delta);
            _currentPos.copy(playerPhysicalPos);
            const newPos = applyMovementWithCollisions(_currentPos, _rawDelta);
            playerPhysicalPos.copy(newPos);
            localModel.position.copy(newPos).y -= PLAYER_RADIUS - 0.15;   // визуальное опускание

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
                const newState = getMovementAnimationName(_moveVec, localModel!, sprintKey);
                if (newState !== 'idle') {
                    fsm['local']?.transitionTo(newState);
                } else {
                    fsm['local']?.transitionTo('idle');
                }
            }
        } else {
            if (!deathAnimating['local']) {
                fsm['local']?.transitionTo('idle');
            }
        }
    }

    // Камера следует за игроком
    if (localModel) {
        _box.setFromObject(localModel);
        _box.getCenter(_center);
        _center.y += 1.4;
        setCameraTarget(_center.x, _center.y, _center.z);
    }
    updateCamera();

    // Миникарта и большая карта
    if (localModel) {
        const othersForMap: { x: number; z: number; rotationY: number; visible: boolean }[] = [];
        for (const id in otherPlayers) {
            const model = otherPlayers[id];
            if (model) {
                othersForMap.push({
                    x: model.position.x,
                    z: model.position.z,
                    rotationY: model.rotation.y,
                    visible: model.visible,
                });
            }
        }

        const mobsForMap: { x: number; z: number; visible: boolean }[] = [];
        for (const mobId in mobModels) {
            const mobModel = mobModels[mobId];
            if (mobModel) {
                mobsForMap.push({
                    x: mobModel.position.x,
                    z: mobModel.position.z,
                    visible: mobModel.visible,
                });
            }
        }

        const npcsForMap: { x: number; z: number; visible: boolean }[] = [];
        if (room.state.npcs) {
            room.state.npcs.forEach((npc: { x: number; z: number }) => {
                npcsForMap.push({ x: npc.x, z: npc.z, visible: true });
            });
        }

        updateMinimap(localModel.position.x, localModel.position.z, localModel.rotation.y, othersForMap, mobsForMap, npcsForMap);
        updateWorldMap(localModel.position.x, localModel.position.z, localModel.rotation.y, othersForMap, mobsForMap, npcsForMap);
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
    const selectedObjects: THREE.Object3D[] = [localModel];
    for (const id in otherPlayers) {
        const model = otherPlayers[id];
        if (model && model.visible) selectedObjects.push(model);
    }
    outlinePass.selectedObjects = selectedObjects;

    // Обновление анимаций и позиций
    updateAnimations(deltaTime);
    updateMobAnimations(deltaTime);
    interpolateMobPositions(deltaTime);
    updateProjectiles(deltaTime);
    animateLootMeshes();

    // Отладка коллизий
    updateCollisionDebug(
        isCollisionDebugVisible() ? getAllColliders() : [],
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

loop();