import * as THREE from 'three';
import { scene, camera } from './scene';
import { localModel, otherPlayers, fsm } from './player';
import { mobModels } from './mobPlayer';
import { room, interactionState } from './network';
import { setSelectedTarget } from './selection';
import { showTargetUI, hideTargetUI } from './targetUI';
import { showLootUI, hideLootUI } from './ui/LootWindowUI';
import { lootMeshes } from './render/LootRenderer';
import { npcMeshes } from './render/NPCRenderer';
import { hideDialog } from './ui/DialogUI';
import { getAllInstancedMeshes } from './render/VegetationRenderer';
import { getTerrainHeightAtFast } from './render/TerrainRenderer';
import { toggleCollisionDebug } from './debug/debugState';
import { isEditorActive } from './editor/EditorState';
import { worldMeshes } from './render/WorldRenderer';
import { actionMode } from './cameraControls';
import { sprintKey } from './input';

console.log('[INTERACTION] Module loaded');

let rightButtonDownTime = 0;
let leftButtonDownTime = 0;
const CLICK_THRESHOLD_MS = 200;
const HEAVY_ATTACK_THRESHOLD_MS = 300; // hold longer than this = heavy attack

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function getIntersections(event: MouseEvent, targets: THREE.Object3D[]): THREE.Intersection[] {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    return raycaster.intersectObjects(targets, true);
}

function tryAttack(
    event: MouseEvent,
    targets: THREE.Object3D[],
    getTargetId: (obj: THREE.Object3D) => string | null,
    attackCommand: string,
    range: number
) {
    const intersects = getIntersections(event, targets);
    if (intersects.length === 0) return false;

    const hitObj = intersects[0].object;
    const targetId = getTargetId(hitObj);
    if (!targetId || !room || !localModel) return false;

    const targetModel = targets.find(t => {
        let found = false;
        t.traverse(child => { if (child === hitObj) found = true; });
        return found;
    });
    if (!targetModel) return false;

    const dist = localModel.position.distanceTo(targetModel.position);
    if (dist > range) {
        console.log(`[ATTACK] Цель далеко (${dist.toFixed(2)})`);
        return false;
    }

    room.send(attackCommand, { target: targetId, mobId: targetId });
    fsm['local']?.requestAttack();
    console.log(`[ATTACK] Атака ${attackCommand} на ${targetId} (дист. ${dist.toFixed(2)})`);
}

/**
 * Raycast from screen center (0,0) to find target under crosshair in Action Mode.
 * Checks players first, then mobs.
 */
function getActionModeTarget(): { type: 'player' | 'mob'; id: string } | null {
    // In Action Mode with Pointer Lock, crosshair is at screen center
    mouse.x = 0;
    mouse.y = 0;
    raycaster.setFromCamera(mouse, camera);

    // Check players first
    const playerTargets = Object.values(otherPlayers).filter(m => m.visible);
    const playerIntersects = raycaster.intersectObjects(playerTargets, true);
    if (playerIntersects.length > 0) {
        const mesh = playerIntersects[0].object;
        const targetId = mesh.userData?.sessionId;
        if (targetId && targetId !== room?.sessionId) {
            return { type: 'player', id: targetId };
        }
    }

    // Check mobs
    const mobTargets: THREE.Object3D[] = Object.values(mobModels).filter(m => m.visible);
    const mobIntersects = raycaster.intersectObjects(mobTargets, true);
    if (mobIntersects.length > 0) {
        const mesh = mobIntersects[0].object;
        const mobId = Object.keys(mobModels).find(id => {
            let found = false;
            mobModels[id].traverse(child => { if (child === mesh) found = true; });
            return found;
        });
        if (mobId) {
            return { type: 'mob', id: mobId };
        }
    }

    return null;
}

// ---------- Обработка нажатия кнопок мыши ----------
window.addEventListener('mousedown', (event) => {
    if (isEditorActive()) return;
    if (event.button === 0) {
        leftButtonDownTime = Date.now();
    }
    if (event.button === 2) {
        rightButtonDownTime = Date.now();
    }
});

window.addEventListener('mouseup', (event) => {
    if (isEditorActive()) return;

    // ---------- ACTION MODE (боевой) ----------
    if (actionMode) {
        if (event.button === 0) {
            if (!room || !localModel) return;

            const holdDuration = Date.now() - leftButtonDownTime;

            // Determine attack type by hold duration and modifier keys
            let attackType: string;
            if (sprintKey) {
                attackType = 'shift';       // Shift + LMB = power strike
            } else if (holdDuration > HEAVY_ATTACK_THRESHOLD_MS) {
                attackType = 'heavy';       // hold > 300ms = charged heavy attack
            } else {
                attackType = 'normal';      // quick tap = normal attack
            }

            // Raycast target from screen center (where crosshair points)
            const target = getActionModeTarget();

            if (target) {
                const targetModel = target.type === 'player'
                    ? otherPlayers[target.id]
                    : mobModels[target.id];

                if (targetModel) {
                    const dist = localModel.position.distanceTo(targetModel.position);
                    if (dist <= 4) {
                        const command = target.type === 'player' ? 'attack' : 'attackMob';
                        room.send(command, {
                            target: target.id,
                            mobId: target.id,
                            attackType: attackType,
                            holdDuration: holdDuration
                        });

                        // Play appropriate animation
                        if (attackType === 'heavy') {
                            fsm['local']?.requestHeavyAttack();
                        } else {
                            fsm['local']?.requestAttack();
                        }
                        console.log(`[ACTION ATTACK] ${attackType} on ${target.type} ${target.id} (hold: ${holdDuration}ms)`);
                        return;
                    }
                }
            }

            // No valid target found or out of range — swing in air (normal attack animation)
            room.send("attack", { target: '', attackType: 'normal', holdDuration: 0 });
            fsm['local']?.requestAttack();
            console.log(`[ACTION ATTACK] normal swing (no target)`);
            return;
        }
        // ПКМ в action‑режиме – будет использована для блока / сильной атаки, пока оставляем заготовку
        if (event.button === 2) {
            // TODO: блок или заряженная атака
            return;
        }
    }

    // ---------- CURSOR MODE (обычный) ----------
    if (event.button === 2) {
        const duration = Date.now() - rightButtonDownTime;
        if (duration < CLICK_THRESHOLD_MS) {
            // Атака по игрокам
            const playerTargets = Object.values(otherPlayers).filter(m => m.visible);
            if (tryAttack(event, playerTargets, (obj) => obj.userData?.sessionId || null, 'attack', 4)) return;

            // Атака по мобам
            const mobTargets: THREE.Object3D[] = Object.values(mobModels).filter(m => m.visible);
            const getMobId = (obj: THREE.Object3D) => {
                for (const id in mobModels) {
                    let found = false;
                    mobModels[id].traverse(child => { if (child === obj) found = true; });
                    if (found) return id;
                }
                return null;
            };
            if (tryAttack(event, mobTargets, getMobId, 'attackMob', 4)) return;
        }
    }

    if (event.button === 0) {
        if (isEditorActive()) return;

        // Левая кнопка: выделение (только в Cursor‑режиме)
        if (actionMode) return;   // дополнительная подстраховка

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

        // Собираем все статические объекты в один массив
        const staticTargets: THREE.Object3D[] = [];
        const vegMeshes = getAllInstancedMeshes();
        vegMeshes.forEach(m => staticTargets.push(m));
        for (const id in worldMeshes) {
            if (id.startsWith('editor_') || id.startsWith('vegezone_')) {
                staticTargets.push(worldMeshes[id]);
            }
        }

        // Общий raycast по всем статическим объектам
        if (staticTargets.length > 0) {
            const lMouse = new THREE.Vector2();
            lMouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            lMouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            raycaster.setFromCamera(lMouse, camera);
            
            const staticIntersections = raycaster.intersectObjects(staticTargets, true);
            if (staticIntersections.length > 0) {
                const nearest = staticIntersections[0];
                const point = nearest.point;
                let obj: THREE.Object3D | null = nearest.object;
                while (obj && !obj.userData?.modelName) {
                    obj = obj.parent;
                }
                let modelName = 'unknown';
                if (obj) {
                    modelName = obj.userData.modelName || 'unknown';
                }

                console.group(`[STATIC-CLICK]`);
                console.log('Model:', modelName);
                console.log('Position:', point.x.toFixed(1), point.y.toFixed(2), point.z.toFixed(1));
                const groundY = getTerrainHeightAtFast(point.x, point.z);
                console.log('Terrain height:', groundY.toFixed(2));
                console.log('Delta (modelY - terrain):', (point.y - groundY).toFixed(2));

                const sphere = new THREE.Mesh(
                    new THREE.SphereGeometry(0.3, 8, 8),
                    new THREE.MeshBasicMaterial({ color: 0xff0000 })
                );
                sphere.position.set(point.x, groundY, point.z);
                scene.add(sphere);
                setTimeout(() => scene.remove(sphere), 5000);

                console.groupEnd();
                return;
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
                    const mobType = mob.mobType || 'wolf';
                    const displayName = mobType === 'skeleton' ? 'Skeleton' : 'Wolf';
                    showTargetUI(displayName, mob.level, mob.hp, mob.maxHp);
                    console.log('[LCLICK] Выделен моб', mobId);
                }
                return;
            }
        }

        setSelectedTarget(null);
        hideTargetUI();
        console.log('[LCLICK] Выделение снято');
    }
});

// В mousedown или keydown (я предлагаю keydown для F)
window.addEventListener('keydown', (e) => {
    if (isEditorActive()) return;
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

window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'p') {
        toggleCollisionDebug();
    }
});