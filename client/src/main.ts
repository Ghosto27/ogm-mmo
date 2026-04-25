import * as THREE from 'three';
import { PLAYER_SPEED, STORAGE_KEY } from './config';
import { scene, camera, renderer } from './scene';
import { getMovementInput } from './input';
import { localModel, otherPlayers, modelReady, fsm } from './player';
import { room, startConnection, lastMoveTimes } from './network';
import { composer, outlinePass } from './postprocessing';
import { updateAnimations } from './animation';
import { setCameraTarget, updateCamera } from './cameraControls';
import { cleanUpScene } from './startupCleanup';
import './interaction';

let playerName = localStorage.getItem(STORAGE_KEY) || '';
if (!playerName) {
    playerName = prompt('Введите никнейм:') || '';
    if (!playerName) throw new Error('Имя не задано');
    localStorage.setItem(STORAGE_KEY, playerName);
}

cleanUpScene();

modelReady.then(() => {
    startConnection(playerName);
    // Запускаем idle сразу после создания модели
    setTimeout(() => {
        fsm['local']?.transitionTo('idle');
    }, 500);
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
        const input = getMovementInput();
        const isMoving = input.x !== 0 || input.z !== 0;
        if (isMoving) {
            const delta = PLAYER_SPEED * 0.016;
            localModel.position.x += input.x * delta;
            localModel.position.z += input.z * delta;
            const nowSend = Date.now();
            if (nowSend - lastSend > 50) {
                try {
                    room.send("move", { x: localModel.position.x, z: localModel.position.z });
                    lastSend = nowSend;
                } catch (e) {}
            }
            fsm['local']?.transitionTo('walk')
        } else {
            fsm['local']?.transitionTo('idle')
        }
    }

    if (localModel) {
        const box = new THREE.Box3().setFromObject(localModel);
        const center = new THREE.Vector3();
        box.getCenter(center);
        setCameraTarget(center.x, center.y, center.z);
    }
    updateCamera();

    const IDLE_TIMEOUT = 500;
    for (const sessionId in otherPlayers) {
        const lastMove = lastMoveTimes[sessionId] || 0;
        if (Date.now() - lastMove > IDLE_TIMEOUT) {
            fsm[sessionId]?.transitionTo('idle')
        }
    }

    const selectedObjects: THREE.Object3D[] = [localModel];
    for (const id in otherPlayers) {
        const model = otherPlayers[id];
        if (model && model.visible) selectedObjects.push(model);
    }
    outlinePass.selectedObjects = selectedObjects;

    updateAnimations(deltaTime);
    composer.render();
}

loop();