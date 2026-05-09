import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { scene, camera } from './scene';
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
import { getAllInstancedMeshes } from './render/VegetationRenderer';
import { getTerrainHeightAtFast, getTerrainHeightAt } from './render/TerrainRenderer';
import { toggleCollisionDebug } from './debug/debugState';
import { isEditorActive } from './editor/EditorState';
import { worldMeshes } from './render/WorldRenderer';

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
    if (isEditorActive()) return;
    if (event.button === 2) {
        rightButtonDownTime = Date.now();
    }
});

window.addEventListener('mouseup', (event) => {
    if (isEditorActive()) return;
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
                        fsm['local']?.requestAttack();
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
                            fsm['local']?.requestAttack();
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
        if (isEditorActive()) return;
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

                // Собираем все статические объекты в один массив
        const staticTargets: THREE.Object3D[] = [];

        // InstancedMesh растительности
        const vegMeshes = getAllInstancedMeshes();
        vegMeshes.forEach(m => staticTargets.push(m));

        // Объекты из worldMeshes (editor_ и vegezone_)
        for (const id in worldMeshes) {
            if (id.startsWith('editor_') || id.startsWith('vegezone_')) {
                staticTargets.push(worldMeshes[id]);
            }
        }

        // Общий raycast по всем статическим объектам
        if (staticTargets.length > 0) {
            // Уже используем глобальный raycaster и mouse, установленные ранее? 
            // Нет, мы ещё не обновили raycaster для этого клика. Надо сделать это.
            // Обновим raycaster для левого клика
            const lMouse = new THREE.Vector2();
            lMouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            lMouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            raycaster.setFromCamera(lMouse, camera);
            
            const staticIntersections = raycaster.intersectObjects(staticTargets, true);
            if (staticIntersections.length > 0) {
                const nearest = staticIntersections[0];
                const point = nearest.point;
                const obj = nearest.object;

                let modelName = 'unknown';
                if (obj.userData && obj.userData.modelName) {
                    modelName = obj.userData.modelName;
                } else if (obj instanceof THREE.InstancedMesh) {
                    modelName = obj.userData.modelName || 'instance';
                }

                console.group(`[STATIC-CLICK]`);
                console.log('Model:', modelName);
                console.log('Position:', point.x.toFixed(1), point.y.toFixed(2), point.z.toFixed(1));
                const groundY = getTerrainHeightAtFast(point.x, point.z);
                console.log('Terrain height:', groundY.toFixed(2));
                console.log('Delta (modelY - terrain):', (point.y - groundY).toFixed(2));

                // Красная сфера для визуального маркера
                const sphere = new THREE.Mesh(
                    new THREE.SphereGeometry(0.3, 8, 8),
                    new THREE.MeshBasicMaterial({ color: 0xff0000 })
                );
                sphere.position.set(point.x, groundY, point.z);
                scene.add(sphere);
                setTimeout(() => scene.remove(sphere), 5000);

                console.groupEnd();
                return; // обработали клик, выходим
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
    if (isEditorActive()) return;
    if (e.key.toLowerCase() === 'h' && localModel && room) {
        const pos = localModel.position;
        const x = pos.x, z = pos.z;

        const fastH = getTerrainHeightAtFast(x, z);
        const preciseH = getTerrainHeightAt(x, z);
        const modelY = localModel.position.y;

        console.group(`[DEBUG HEIGHT] at (${x.toFixed(1)}, ${z.toFixed(1)})`);
        console.log('Player Y:', modelY.toFixed(2));
        console.log('Fast (interpolated):', fastH.toFixed(2));
        console.log('Precise (raycast):', preciseH.toFixed(2));
        console.groupEnd();

        // Визуальный маркер (красная сфера на земле)
        const markerGeo = new THREE.SphereGeometry(0.5, 8, 8);
        const markerMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const marker = new THREE.Mesh(markerGeo, markerMat);
        marker.position.set(x, preciseH, z);
        scene.add(marker);
        console.log('[DEBUG] Red sphere placed at terrain height. It will disappear after 5 seconds.');
        setTimeout(() => scene.remove(marker), 5000);
    }
});

// ВРЕМЕННЫЙ ТЕСТОВЫЙ КОД: спавн камня по клавише K
window.addEventListener('keydown', (e) => {
    if (isEditorActive()) return;
    if (e.key.toLowerCase() === 'k' && localModel && room) {
        const x = localModel.position.x;
        const z = localModel.position.z;

        // Загружаем модель Rock_1.glb (или любую другую)
        const loader = new GLTFLoader();
        loader.load('/models/Tree_1.glb', (gltf) => {
            const template = gltf.scene.children[0] as THREE.Mesh;
            if (!template) return;

            // Измеряем высоту модели (для информации)
            const box = new THREE.Box3().setFromObject(template);
            const modelHeight = box.max.y - box.min.y;

            // Создаём экземпляр (не в InstancedMesh)
            const rock = template.clone() as THREE.Mesh;
            rock.material = template.material;
            rock.geometry = template.geometry;
            rock.castShadow = true;
            rock.receiveShadow = true;

            // Получаем высоту поверхности
            const rawY = getTerrainHeightAtFast(x, z);
            // rawY может быть 0, если ландшафт не загружен, поэтому ставим на маленькую высоту
            const surfaceY = rawY > 0 ? rawY : 0.5;

            // Ставим камень без коррекции (как сейчас работает VegetationRenderer)
            rock.position.set(x, surfaceY, z);
            scene.add(rock);

            // Логируем
            console.group(`[SPAWN ROCK] at (${x.toFixed(1)}, ${z.toFixed(1)})`);
            console.log('rawY from getTerrainHeightAtFast:', rawY.toFixed(2));
            console.log('modelHeight:', modelHeight.toFixed(2));
            console.log('rock.position.y:', rock.position.y.toFixed(2));
            console.log('box.min.y (relative):', box.min.y.toFixed(2), '(if <0, model center above ground)');
            console.log('Red sphere at surfaceY:', surfaceY.toFixed(2));
            console.groupEnd();

            // Красная сфера на поверхности для сравнения
            const sphereGeo = new THREE.SphereGeometry(0.3, 8, 8);
            const sphereMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const sphere = new THREE.Mesh(sphereGeo, sphereMat);
            sphere.position.set(x, surfaceY, z);
            scene.add(sphere);

            // Удалим камень и сферу через 10 секунд, чтобы не засорять сцену
            setTimeout(() => {
                scene.remove(rock);
                scene.remove(sphere);
                console.log('Test rock and sphere removed.');
            }, 10000);
        }, undefined, (err) => {
            console.error('Failed to load rock model:', err);
        });
    }
});

window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'p') {
        toggleCollisionDebug();
    }
});