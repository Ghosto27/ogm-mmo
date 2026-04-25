import * as THREE from 'three';
import { PLAYER_SPEED, STORAGE_KEY } from './config';
import { scene, camera, renderer } from './scene';
import { getMovementInput, getCameraRelativeMovement } from './input'; // Импорт новой функции
import { localModel, otherPlayers, modelReady, fsm } from './player';
import { room, startConnection, lastMoveTimes } from './network';
import { composer, outlinePass } from './postprocessing';
import { setCameraTarget, updateCamera, isRightDragging } from './cameraControls'; // Импорт флага ПКМ
import { cleanUpScene } from './startupCleanup';
import { updateAnimations } from './animationUtils';
import './interaction';
import { renderLabels } from './renderers';

let playerName = localStorage.getItem(STORAGE_KEY) || '';
if (!playerName) {
    playerName = prompt('Введите никнейм:') || '';
    if (!playerName) throw new Error('Имя не задано');
    localStorage.setItem(STORAGE_KEY, playerName);
}

(window as any).fsm = fsm;   // теперь можно обращаться в консоли

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
        let moveVec: THREE.Vector3;
        if (isRightDragging) {
            moveVec = getCameraRelativeMovement(camera);
        } else {
            const raw = getMovementInput();
            moveVec = new THREE.Vector3(0, 0, 0);
            if (raw.x !== 0 || raw.z !== 0) {
                // Вычисляем локальные направления модели
                const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(localModel!.quaternion);
                forward.y = 0;
                forward.normalize();

                const up = new THREE.Vector3(0, 1, 0);
                const right = new THREE.Vector3().crossVectors(up, forward).normalize();

                moveVec.add(forward.multiplyScalar(-raw.z)); // W/S: вперёд/назад
                moveVec.add(right.multiplyScalar(raw.x*-1));    // A/D: влево/вправо
            }
        }

        const isMoving = moveVec.lengthSq() > 0;
        if (isMoving) {
            const delta = PLAYER_SPEED * 0.016;
            localModel.position.x += moveVec.x * delta;
            localModel.position.z += moveVec.z * delta;

            // 🔁 Разворот только при зажатой ПКМ
            if (isRightDragging) {
                const targetAngle = Math.atan2(moveVec.x, moveVec.z);
                const rotationSpeed = 10.0;
                const currentAngle = localModel.rotation.y;
                let angleDiff = targetAngle - currentAngle;
                while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
                localModel.rotation.y += angleDiff * Math.min(1, rotationSpeed * deltaTime);
            }

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
    renderLabels(scene, camera);
}

loop();