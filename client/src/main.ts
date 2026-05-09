import * as THREE from 'three';
import { PLAYER_SPEED, STORAGE_KEY, SPRINT_MULTIPLIER } from './config';
import { scene, camera, renderer } from './scene';
import { getMovementInput, getCameraRelativeMovement, sprintKey } from './input';
import { localModel, otherPlayers, modelReady, fsm, deathAnimating } from './player';
import { room, startConnection, lastMoveTimes } from './network';
import { composer, outlinePass } from './postprocessing';
import { updateAnimations } from './animationUtils';
import { setCameraTarget, updateCamera, isRightDragging } from './cameraControls';
import { cleanUpScene } from './startupCleanup';
import { createMinimap, updateMinimap } from './minimap';
import { createWorldMap, updateWorldMap, toggleWorldMap } from './worldMap';
import { createPlayerUI } from './playerUI';
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
    startConnection(playerName);
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

function loop() {
    updateFPS();
    requestAnimationFrame(loop);

    const now = performance.now();
    const deltaTime = (now - lastTime) / 1000;
    lastTime = now;

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
        if (isCollisionDebugVisible()) {
            updateCollisionDebug(getAllColliders(), localModel.position, 20);
        } else {
            // Если отладка была включена и её выключили, очищаем
            updateCollisionDebug([], localModel.position, 20);
        }
        composer.render();
        renderLabels(scene, camera);
        return; // прерываем выполнение игровой логики
    }

    // =================== ИГРОВОЙ РЕЖИМ ===================
    const myPlayer = room.state?.players?.get(room.sessionId);
    const alive = myPlayer && myPlayer.hp > 0;

    if (alive) {
        let moveVec: THREE.Vector3;

        if (isRightDragging) {
            moveVec = getCameraRelativeMovement(camera);
            if (moveVec.lengthSq() > 0) {
                const targetAngle = Math.atan2(moveVec.x, moveVec.z);
                const rotationSpeed = 10.0;
                const currentAngle = localModel.rotation.y;
                let angleDiff = targetAngle - currentAngle;
                while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
                localModel.rotation.y += angleDiff * Math.min(1, rotationSpeed * deltaTime);
            }
        } else {
            if (isChatActive()) {
                moveVec = new THREE.Vector3(0, 0, 0);
            } else {
                const raw = getMovementInput();
                moveVec = new THREE.Vector3(0, 0, 0);
                if (raw.x !== 0 || raw.z !== 0) {
                    const forward = new THREE.Vector3(0, 0, 1)
                        .applyQuaternion(localModel!.quaternion);
                    forward.y = 0; forward.normalize();
                    const right = new THREE.Vector3(1, 0, 0)
                        .applyQuaternion(localModel!.quaternion);
                    right.y = 0; right.normalize();

                    moveVec.add(forward.multiplyScalar(-raw.z));
                    moveVec.add(right.multiplyScalar(raw.x));
                    moveVec.normalize();
                }
            }
        }

        const isMoving = moveVec.lengthSq() > 0;

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

            const rawDelta = new THREE.Vector3(moveVec.x * delta, 0, moveVec.z * delta);
            const currentPos = playerPhysicalPos.clone();
            const newPos = applyMovementWithCollisions(currentPos, rawDelta);
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
                fsm['local']?.transitionTo(sprintKey ? 'run' : 'walk');
            }
        } else {
            if (!deathAnimating['local']) {
                fsm['local']?.transitionTo('idle');
            }
        }
    }

    // Камера следует за игроком
    if (localModel) {
        const box = new THREE.Box3().setFromObject(localModel);
        const center = new THREE.Vector3();
        box.getCenter(center);
        center.y += 1.4;
        setCameraTarget(center.x, center.y, center.z);
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

loop();