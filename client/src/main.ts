import * as THREE from 'three';
import { PLAYER_SPEED, STORAGE_KEY } from './config';
import { scene, camera, renderer } from './scene';
import { getMovementInput, getCameraRelativeMovement } from './input';
import { localModel, otherPlayers, modelReady, fsm } from './player';
import { room, startConnection, lastMoveTimes } from './network';
import { composer, outlinePass } from './postprocessing';
import { updateAnimations } from './animationUtils';
import { setCameraTarget, updateCamera, isRightDragging } from './cameraControls';
import { cleanUpScene } from './startupCleanup';
import { createMinimap, updateMinimap } from './minimap';
import { createWorldMap, updateWorldMap, toggleWorldMap } from './worldMap';
import { createPlayerUI, updatePlayerUI } from './playerUI';
import { createTargetUI } from './targetUI';
import { updateMobAnimations, interpolateMobPositions } from './mobPlayer';
import { renderLabels } from './renderers';
import './interaction';
import { createInventoryUI, toggleInventory, updateInventoryUI } from './inventoryUI';
import { createLootUI } from './ui/LootWindowUI';
import { animateLootMeshes } from './render/LootRenderer';

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
    setTimeout(() => {
        fsm['local']?.transitionTo('idle');
    }, 500);
});

window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'm' || e.key.toLowerCase() === 'ь') {
        if (document.activeElement === document.body) {
            toggleWorldMap();
        }
    }
    if (e.key.toLowerCase() === 'i' || e.key.toLowerCase() === 'ш') {
        if (document.activeElement === document.body) {
            toggleInventory();
        }
    }
});


setTimeout(() => renderer.domElement.focus({ preventScroll: true }), 100);

let lastSend = 0;
let lastTime = performance.now();

function loop() {
    requestAnimationFrame(loop);

    const now = performance.now();
    const deltaTime = (now - lastTime) / 1000;
    lastTime = now;

    if (!room || !localModel) return;

    const myPlayer = room.state?.players?.get(room.sessionId);
    const alive = myPlayer && myPlayer.hp > 0;

    if (alive) {
        let moveVec: THREE.Vector3;
        if (isRightDragging) {
            moveVec = getCameraRelativeMovement(camera);
            // Разворот модели по направлению движения (только при зажатой ПКМ)
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
            const raw = getMovementInput();
            moveVec = new THREE.Vector3(0, 0, 0);
            if (raw.x !== 0 || raw.z !== 0) {
                const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(localModel!.quaternion);
                forward.y = 0; forward.normalize();
                const right = new THREE.Vector3(1, 0, 0).applyQuaternion(localModel!.quaternion);
                right.y = 0; right.normalize();

                moveVec.add(forward.multiplyScalar(-raw.z));
                moveVec.add(right.multiplyScalar(raw.x));
                moveVec.normalize();
            }
        }

        const isMoving = moveVec.lengthSq() > 0;
        if (isMoving) {
            const delta = PLAYER_SPEED * 0.016;
            localModel.position.x += moveVec.x * delta;
            localModel.position.z += moveVec.z * delta;

            const nowSend = Date.now();
            if (nowSend - lastSend > 50) {
                try {
                    room.send("move", { x: localModel.position.x, z: localModel.position.z, r: localModel.rotation.y });
                    lastSend = nowSend;
                } catch (e) {}
            }
            fsm['local']?.transitionTo('walk');
        } else {
            fsm['local']?.transitionTo('idle');
        }
    }

    if (localModel) {
        const box = new THREE.Box3().setFromObject(localModel);
        const center = new THREE.Vector3();
        box.getCenter(center);
        setCameraTarget(center.x, center.y, center.z);
    }
    updateCamera();

    // Миникарта
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
        updateMinimap(localModel.position.x, localModel.position.z, localModel.rotation.y, othersForMap);
        updateWorldMap(localModel.position.x, localModel.position.z, localModel.rotation.y, othersForMap);
    }

    const IDLE_TIMEOUT = 200;
    for (const sessionId in otherPlayers) {
        const lastMove = lastMoveTimes[sessionId] || 0;
        if (Date.now() - lastMove > IDLE_TIMEOUT) {
            fsm[sessionId]?.transitionTo('idle');
        }
    }

    const selectedObjects: THREE.Object3D[] = [localModel];
    for (const id in otherPlayers) {
        const model = otherPlayers[id];
        if (model && model.visible) selectedObjects.push(model);
    }
    outlinePass.selectedObjects = selectedObjects;

    updateAnimations(deltaTime);
    updateMobAnimations(deltaTime);
    interpolateMobPositions(deltaTime);
    animateLootMeshes();
    
    composer.render();
    renderLabels(scene, camera);
}

loop();