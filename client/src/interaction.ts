import * as THREE from 'three';
import { camera } from './scene';
import { localModel, otherPlayers, fsm } from './player';
import { mobModels } from './mobPlayer';
import { room } from './network';
import { setSelectedTarget } from './selection';
import { showTargetUI, hideTargetUI } from './targetUI';
import { } from './render/LootRenderer';
import { showLootUI, hideLootUI } from './ui/LootWindowUI';
import { lootMeshes } from './render/LootRenderer';

console.log('[INTERACTION] Module loaded');

let rightButtonDownTime = 0;
const CLICK_THRESHOLD_MS = 200;

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function getIntersections(event: MouseEvent, targets: THREE.Object3D[]): THREE.Intersection[] {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    return raycaster.intersectObjects(targets, true);
}

// ---------- Обработка нажатия кнопок мыши ----------
window.addEventListener('mousedown', (event) => {
    if (event.button === 2) {
        rightButtonDownTime = Date.now();
    }
});

window.addEventListener('mouseup', (event) => {
    if (event.button === 2) {
        // Правая кнопка: атака (короткий клик)
        const duration = Date.now() - rightButtonDownTime;
        if (duration < CLICK_THRESHOLD_MS) {
            // Сначала проверяем попадание в игроков
            const playerTargets = Object.values(otherPlayers).filter(m => m.visible);
            const playerInters = getIntersections(event, playerTargets);
            if (playerInters.length > 0) {
                const mesh = playerInters[0].object as THREE.Mesh;
                const targetId = mesh.userData.sessionId;
                if (targetId && room && localModel) {
                    const targetModel = otherPlayers[targetId];
                    if (!targetModel) return;
                    const dist = targetModel.position.distanceTo(localModel.position);
                    if (dist <= 4) {
                        room.send("attack", { target: targetId });
                        fsm['local']?.playOneShot('sword_attack', 0.1);
                        console.log(`[ATTACK] Игрок ${targetId} (дист. ${dist.toFixed(2)})`);
                    } else {
                        console.log(`[ATTACK] Игрок далеко (${dist.toFixed(2)})`);
                    }
                }
                return;
            }

            // Затем проверяем мобов
            const mobTargets: THREE.Object3D[] = Object.values(mobModels).filter(m => m.visible);
            const mobInters = getIntersections(event, mobTargets);
            if (mobInters.length > 0) {
                const mesh = mobInters[0].object as THREE.Mesh;
                const mobId = Object.keys(mobModels).find(id => {
                    let found = false;
                    mobModels[id].traverse(child => { if (child === mesh) found = true; });
                    return found;
                });
                if (mobId && room) {
                    room.send("attackMob", { mobId });
                    console.log(`[ATTACK] Моб ${mobId}`);
                }
                return;
            }
        }
    }

    if (event.button === 0) {
        // Левая кнопка: выделение
        const playerTargets = Object.values(otherPlayers).filter(m => m.visible);
        const playerInters = getIntersections(event, playerTargets);
        if (playerInters.length > 0) {
            const mesh = playerInters[0].object as THREE.Mesh;
            const targetId = mesh.userData.sessionId;
            if (targetId && room) {
                const player = room.state?.players.get(targetId);
                if (player) {
                    setSelectedTarget(targetId);
                    showTargetUI(player.name, player.level, player.hp, player.maxHp);
                    console.log('[LCLICK] Выделен игрок', targetId);
                    return;
                }
            }
        }

        const mobTargets: THREE.Object3D[] = Object.values(mobModels).filter(m => m.visible);
        const mobInters = getIntersections(event, mobTargets);
        if (mobInters.length > 0) {
            const mesh = mobInters[0].object as THREE.Mesh;
            const mobId = Object.keys(mobModels).find(id => {
                let found = false;
                mobModels[id].traverse(child => { if (child === mesh) found = true; });
                return found;
            });
            if (mobId && room) {
                const mob = room.state?.mobs.get(mobId);
                if (mob) {
                    setSelectedTarget(mobId);
                    showTargetUI('Волк', mob.level, mob.hp, mob.maxHp);
                    console.log('[LCLICK] Выделен моб', mobId);
                }
                return;
            }
        }

        // Клик по земле – сброс выделения
        setSelectedTarget(null);
        hideTargetUI();
        console.log('[LCLICK] Выделение снято');
    }
});

// В mousedown или keydown (я предлагаю keydown для F)
window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'f') {
        if (!room || !localModel) return;
        // Ищем ближайший мешок на расстоянии < 2.0
        let closestBagId: string | null = null;
        let closestDist = Infinity;
        for (const bagId in lootMeshes) {
            const mesh = lootMeshes[bagId];
            const dist = localModel.position.distanceTo(mesh.position);
            if (dist < 2.0 && dist < closestDist) {
                closestDist = dist;
                closestBagId = bagId;
            }
        }
        if (closestBagId) {
            const bag = room.state.lootBags.get(closestBagId);
            if (bag && bag.items.length > 0) {
                showLootUI(closestBagId, bag.items);
            }
        } else {
            hideLootUI();
        }
    }
});

window.addEventListener('contextmenu', (event) => {
    event.preventDefault();
});