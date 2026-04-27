import * as THREE from 'three';
import { camera } from './scene';
import { localModel, otherPlayers, fsm } from './player';
import { mobModels } from './mobPlayer';
import { room, interactionState } from './network';
import { setSelectedTarget } from './selection';
import { showTargetUI, hideTargetUI } from './targetUI';
import { } from './render/LootRenderer';
import { showLootUI, hideLootUI } from './ui/LootWindowUI';
import { lootMeshes } from './render/LootRenderer';
import { npcMeshes } from './render/NPCRenderer';
import { hideDialog } from './ui/DialogUI';

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
                if (mobId && room && localModel) {
                    const mobModel = mobModels[mobId];
                    if (mobModel) {
                        const dist = mobModel.position.distanceTo(localModel.position);
                        const ATTACK_RANGE = 4;   // можно изменить на нужную дистанцию
                        if (dist <= ATTACK_RANGE) {
                            room.send("attackMob", { mobId });
                            fsm['local']?.playOneShot('sword_attack', 0.1);
                            console.log(`[ATTACK] Атака на моба ${mobId} (дист. ${dist.toFixed(2)})`);
                        } else {
                            console.log(`[ATTACK] Моб далеко (${dist.toFixed(2)})`);
                        }
                    }
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
    if (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'а') {
        if (!room || !localModel) return;

        // Ищем ближайшего NPC (приоритет)
        let closestNpcId: string | null = null;
        let closestNpcDist = Infinity;
        for (const npcId in npcMeshes) {
            const mesh = npcMeshes[npcId];
            const dist = localModel.position.distanceTo(mesh.position);
            if (dist < 3.0 && dist < closestNpcDist) {
                closestNpcDist = dist;
                closestNpcId = npcId;
            }
        }

        // Ищем ближайший мешок с лутом
        let closestBagId: string | null = null;
        let closestBagDist = Infinity;
        for (const bagId in lootMeshes) {
            const mesh = lootMeshes[bagId];
            const dist = localModel.position.distanceTo(mesh.position);
            if (dist < 2.0 && dist < closestBagDist) {
                closestBagDist = dist;
                closestBagId = bagId;
            }
        }

        console.log('[INTERACTION] F pressed', { closestNpcId, closestBagId });

        if (closestNpcId) {
            interactionState.currentInteractNpcId = closestNpcId;
            console.log('[INTERACTION] Set currentInteractNpcId =', closestNpcId);
            room.send('interactNpc', { npcId: closestNpcId });
        } else if (closestBagId) {
            const bag = room.state.lootBags.get(closestBagId);
            if (bag && bag.items.length > 0) {
                showLootUI(closestBagId, bag.items);
            }
        } else {
            hideLootUI();
            hideDialog();
            interactionState.currentInteractNpcId = '';
        }
    }
});

window.addEventListener('contextmenu', (event) => {
    event.preventDefault();
});