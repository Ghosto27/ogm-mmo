import * as THREE from 'three';
import { camera } from './scene';
import { localModel, otherPlayers, fsm } from './player';
import { room } from './network';
console.log('[INTERACTION] Module loaded');

// Служебные переменные для различения клика и удержания ПКМ
let rightButtonDownTime = 0;
const CLICK_THRESHOLD_MS = 200; // если короче – считаем кликом, иначе вращение камеры

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// ---------- Вспомогательная функция поиска пересечений ----------
function getIntersections(event: MouseEvent): THREE.Intersection[] {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const interactiveObjects: THREE.Object3D[] = [];
    for (const sessionId in otherPlayers) {
        const model = otherPlayers[sessionId];
        if (model && model.visible) {
            interactiveObjects.push(model);
        }
    }
    return raycaster.intersectObjects(interactiveObjects, true);
}

// ---------- Обработка нажатия кнопок мыши ----------
window.addEventListener('mousedown', (event) => {
    if (event.button === 2) { // ПКМ
        rightButtonDownTime = Date.now();
    }
});

window.addEventListener('mouseup', (event) => {
    if (event.button === 2) { // ПКМ
        const duration = Date.now() - rightButtonDownTime;
        if (duration < CLICK_THRESHOLD_MS) {
            const intersections = getIntersections(event);
            if (intersections.length > 0) {
                const clickedMesh = intersections[0].object as THREE.Mesh;
                const targetId = clickedMesh.userData.sessionId;
                if (targetId && room && localModel) {  // <-- проверяем localModel
                    const targetModel = otherPlayers[targetId];
                    if (!targetModel) return;

                    const localPos = localModel.position;
                    const targetPos = targetModel.position;
                    const dist = Math.sqrt(
                        (localPos.x - targetPos.x) ** 2 + (localPos.z - targetPos.z) ** 2
                    );
                    const ATTACK_RANGE = 2.5;
                    if (dist <= ATTACK_RANGE) {
                        room.send("attack", { target: targetId });
                        fsm['local']?.playOneShot('sword_attack', 0.1);
                        console.log(`[ATTACK] Атака на ${targetId} (дистанция ${dist.toFixed(2)})`);
                    } else {
                        console.log(`[ATTACK] Цель слишком далеко (${dist.toFixed(2)} > ${ATTACK_RANGE})`);
                    }
                }
            }
        }
    }

    if (event.button === 0) { // ЛКМ
        const intersections = getIntersections(event);
        if (intersections.length > 0) {
            console.log('[LCLICK] Выделена цель:', intersections[0].object);
        } else {
            console.log('[LCLICK] Выделение снято');
        }
    }
});

// Запрещаем стандартное контекстное меню на всей странице
window.addEventListener('contextmenu', (event) => {
    event.preventDefault();
});