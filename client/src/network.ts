import * as THREE from 'three';
import { Client } from 'colyseus.js';
import { SERVER_URL } from './config';
import {
    localModel, initLocalModel, otherPlayers, hpBars,
    showLocalHpBar, hideLocalHpBar, updateOtherPlayer, removeOtherPlayerVisuals,
    deathAnimating, fsm
} from './player';
import { setTargetPosition } from './animationUtils';
import { updateHpBarSprite } from './utils';
import { getSelectedTarget } from './selection';
import { updateTargetHP, showTargetUI } from './targetUI';
import { mobModels, spawnMob, updateMobState, despawnMob, mobFSM } from './mobPlayer';
import { updatePlayerUI } from './playerUI';
import { createNameTag, attachNameTag } from './nameTags';
import { updateInventoryUI } from './inventoryUI';
import { lootMeshes, updateLootMeshes, spawnLootMesh } from './render/LootRenderer';
import { getCurrentBagId, updateLootSlots, hideLootUI } from './ui/LootWindowUI';
import { updateCharacterPanel } from './characterPanel';
import { setupChatListeners } from './chat/chatNetwork';
import { PlayerSyncManager } from './sync/PlayerSyncManager';
import { showDialog, hideDialog } from './ui/DialogUI';
import { updateNPCMeshes, setNPCProximity } from './render/NPCRenderer';
import { updateQuestList } from './quest/QuestJournalUI';
import { showNotification } from './ui/notificationUI';
import { showFloatingDamage } from './damageNumbers';
import { setQuestDefs, getQuestName } from './quest/questData';
import { updateWorldObjects, worldMeshes } from './render/WorldRenderer';
import { updateResourceNodes, resourceNodesAssetsReady } from './render/ResourceNodeRenderer';
import { updateBankUI, isBankVisible, hideBank } from './ui/BankUI';
import { updateCraftingRecipes, hideCraftingUI, isCraftingVisible } from './ui/CraftingUI';
import { showMerchantUI, hideMerchantUI, isMerchantOpen, updateMerchantItems, updateMerchantGold } from './ui/MerchantUI';
import { refreshProfessions } from './ui/ProfessionsUI';
import { updateTerrain, getTerrainHeightAt, terrainReady, getTerrainHeightAtFast } from './render/TerrainRenderer';
import { addVegetationInstance, finalizeVegetation, isVegetationLoaded } from './render/VegetationRenderer';
import { isEditorActive } from './editor/EditorState';
import { applyVegetationZones, applyMobZones, applyResourceNodes } from './editor/Editor';
import { scene } from './scene';

export const client = new Client(SERVER_URL);
export let room: any = null;
export const interactionState = { currentInteractNpcId: '' };
// Stores pending projectile target positions for skeleton ranged attacks
// Key: mobId, Value: { x, z } — the actual player position when the throw was triggered
export const pendingProjectileTargets: Record<string, { x: number, z: number }> = {};

let reconnectTimer: any = null;
let firstSync = true;
let wasDead = false;
let vegetationLoaded = false;

// Создаём экземпляр менеджера синхронизации (заменяет глобальные переменные)
const syncManager = new PlayerSyncManager();

// Экспортируем lastMoveTimes для main.ts (таймер остановки анимации)
export const lastMoveTimes = {
    get: (sessionId: string) => syncManager.getLastMoveTime(sessionId),
};

function join(playerName: string) {
    console.log('[JOIN] Игрок:', playerName);
    client.joinOrCreate('world', { name: playerName }).then(roomInstance => {
        room = roomInstance;
        console.log('[JOIN] Успех, sessionId:', room.sessionId);
        
        // Гарантированно создаём локальную модель, если её ещё нет
        if (!localModel) {
            const storedName = localStorage.getItem('ogm_playerName') || 'Герой';
            initLocalModel(storedName);
            console.log('[NET] localModel принудительно создана с ником', storedName);
        }
        // Явно показываем модель (на случай, если она была скрыта)
        if (localModel) {
            localModel.visible = true;
            const existingTag = localModel.getObjectByName('nameTag');
            if (!existingTag) {
                const tag = createNameTag(localStorage.getItem('ogm_playerName') || 'Герой');
                attachNameTag(localModel, tag);
                console.log('[NET] Тег создан принудительно');
            }
            // Отправляем начальное состояние, раз уж модель готова
            //room.send("move", { x: localModel.position.x, z: localModel.position.z, r: localModel.rotation.y });
        }
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }

        firstSync = true;
        wasDead = false;

        if (!localModel) initLocalModel();

        if (fsm['local']) fsm['local'].transitionTo('idle');
        
        room.onStateChange((state: any) => {
            if (!room || !localModel) return;

            // Подключаем чат (комната уже готова)
            setupChatListeners(room);
            

            // Получаем структурированный результат от менеджера синхронизации
            const syncResult = syncManager.processStateChange(state, room.sessionId);

            // ---------- Локальный игрок ----------
            const local = syncResult.localPlayer;
            
            if (local) {
                if (firstSync && local.alive) {
                    if (!localModel) return;
                    localModel.position.x = local.x;
                    localModel.position.z = local.z;
                    localModel.rotation.y = local.rotationY;
                    firstSync = false;
                    console.log('[SYNC] Позиция восстановлена:', local.x, local.z);
                    // Ждём готовности ландшафта, затем применяем высоту
                    terrainReady.then(() => {
                        if (localModel) { // дополнительная проверка внутри коллбека
                            const y = getTerrainHeightAt(local.x, local.z);
                            localModel.position.y = y + 0.1;
                        }
                    });
                }

                if (local.resurrected) {
                    // Снимаем блокирующие флаги вручную перед вызовом revive
                    if (fsm['local']) {
                        fsm['local'].isDying = false;
                        fsm['local'].isDead = false;
                        fsm['local'].isPlayingOneShot = false;
                    }
                    fsm['local']?.revive();
                    deathAnimating['local'] = false;
                    localModel!.visible = true;
                    wasDead = false;
                    console.log(`[RESPAWN] localPlayer x=${local.x} z=${local.z}`);

                    terrainReady.then(() => {
                        const spawnX = local.x ?? 0;
                        const spawnZ = local.z ?? 0;
                        const y = getTerrainHeightAt(spawnX, spawnZ);
                        localModel!.position.set(spawnX, y + 0.1, spawnZ);
                    });

                    // Всегда используем серверные координаты (обычно 0,0)
                    setTimeout(() => {
                        const spawnX = local.x ?? 0;
                        const spawnZ = local.z ?? 0;
                        const y = getTerrainHeightAt(spawnX, spawnZ);
                        localModel!.position.set(spawnX, y + 0.1, spawnZ);
                    }, 500);
                }

                if (local.tookDamage) {
                    //fsm['local']?.playOneShot('recievehit', 0.1);
                }

                if (local.died) {
                    if (deathAnimating['local']) return;
                    fsm['local']?.playDeath(() => {
                        setTimeout(() => {
                            if (localModel) localModel.visible = false;
                            deathAnimating['local'] = false;
                            if (fsm['local']) {
                                fsm['local'].isDead = false;
                                fsm['local'].isDying = false;
                            }
                            console.log('[DEATH] Труп скрыт');
                        }, 2000);
                    });
                    deathAnimating['local'] = true;
                    wasDead = true;
                    showLocalHpBar(local.x, local.z, 0, local.maxHp);
                    hideLocalHpBar();
                }

                if (local.alive) {
                    showLocalHpBar(local.x, local.z, local.hp, local.maxHp);
                    // Получаем актуального myPlayer для доступа к level, exp, expToLevel, inventory
                    const myPlayer = state.players.get(room.sessionId);
                    if (myPlayer) {
                        updatePlayerUI(local.hp, local.maxHp, myPlayer.level, myPlayer.exp, myPlayer.expToLevel, myPlayer.gold);
                        if (isMerchantOpen()) updateMerchantGold(myPlayer.gold);
                        updateCharacterPanel(myPlayer);
                        updateInventoryUI(myPlayer.inventory);
                        updateBankUI(myPlayer.bank);
                        refreshProfessions();
                        // Квесты
                        const questEntries = Array.from(myPlayer.questProgress.entries()) as [string, number][];
                        const questsObj = Object.fromEntries(questEntries);
                        updateQuestList(questsObj);
                        
                    }
                    localModel.visible = true;
                } else {
                    hideLocalHpBar();
                }
            }

            // ---------- Другие игроки ----------
            for (const remote of syncResult.remotePlayers) {
                if (remote.resurrected) {
                    if (fsm[remote.sessionId]) {
                        fsm[remote.sessionId].isDying = false;
                        fsm[remote.sessionId].isDead = false;
                    }
                    fsm[remote.sessionId]?.revive();
                    const model = otherPlayers[remote.sessionId];
                    if (model) {
                        model.visible = true;
                        const initY = state.players.get(remote.sessionId)?.y ?? 0;
                        model.position.set(remote.x, initY, remote.z);
                        setTargetPosition(remote.sessionId, remote.x, remote.z, initY);
                    }
                }

                if (remote.tookDamage) {
                    fsm[remote.sessionId]?.transitionTo('recievehit');
                }

                if (remote.sessionId === getSelectedTarget()) {
                    updateTargetHP(remote.hp, remote.maxHp);
                }

                if (remote.died) {
                    if (deathAnimating[remote.sessionId]) return;
                    deathAnimating[remote.sessionId] = true;
                    if (hpBars[remote.sessionId]) {
                        updateHpBarSprite(hpBars[remote.sessionId], 0, remote.maxHp);
                    }
                    fsm[remote.sessionId]?.playDeath(() => {
                        setTimeout(() => {
                            if (otherPlayers[remote.sessionId]) otherPlayers[remote.sessionId].visible = false;
                            if (hpBars[remote.sessionId]) hpBars[remote.sessionId].visible = false;
                            deathAnimating[remote.sessionId] = false;
                            if (fsm[remote.sessionId]) {
                                fsm[remote.sessionId].isDead = false;
                                fsm[remote.sessionId].isDying = false;
                            }
                            console.log(`[DEATH] ${remote.sessionId} model hidden`);
                        }, 500);
                    });
                }

                // Получаем Y из серверного состояния для этого игрока
                const remotePlayerState = state.players.get(remote.sessionId);
                const remoteY = remotePlayerState ? (remotePlayerState.y ?? 0) : 0;

                updateOtherPlayer(remote.sessionId, remote.x, remote.z, remote.hp, remote.maxHp, remote.alive, remote.name, remoteY);

                // Для подстраховки сразу обновляем Y модели (если она уже существует)
                if (otherPlayers[remote.sessionId]) {
                    otherPlayers[remote.sessionId].position.y = remoteY;
                }
                // Обновляем цель интерполяции, только если координаты не нулевые (чтобы не улететь в центр)
                if (!(otherPlayers[remote.sessionId] && remote.x === 0 && remote.z === 0)) {
                    setTargetPosition(remote.sessionId, remote.x, remote.z, remoteY);
                    if (otherPlayers[remote.sessionId]) {
                        otherPlayers[remote.sessionId].position.y = remoteY;
                    }
                }
                //console.log(`[NET] updateOtherPlayer called for ${remote.sessionId}, x=${remote.x}, z=${remote.z}`);
                if (otherPlayers[remote.sessionId]) {
                    otherPlayers[remote.sessionId].rotation.y = remote.rotationY;
                }

                if (remote.alive) {
                    if (remote.isMoving && fsm[remote.sessionId]) {
                        fsm[remote.sessionId].transitionTo('walk');
                    } else if (!remote.isMoving && fsm[remote.sessionId] && fsm[remote.sessionId].currentStateName !== 'idle') {
                        fsm[remote.sessionId].transitionTo('idle');
                    }
                }
            }

            // Очистка вышедших игроков
            for (const sessionId of syncResult.needCleanup) {
                removeOtherPlayerVisuals(sessionId);
                syncManager.cleanup(sessionId);
                delete deathAnimating[sessionId];
            }

            // ---------- Мобы ----------
            state.mobs.forEach((mob: any, mobId: string) => {
                const mobType = mob.mobType || 'wolf';
                if (!mobModels[mobId]) {
                    spawnMob(mobId, mob.x, mob.z, mob.hp, mob.maxHp, mob.rotationY, mobType, mob.state);
                } else {
                    updateMobState(mobId, mob.x, mob.z, mob.hp, mob.maxHp, mob.state, mob.rotationY);
                }
                if (mobId === getSelectedTarget()) {
                    const displayName = mobType === 'skeleton' ? 'Skeleton' : 'Wolf';
                    showTargetUI(displayName, mob.level, mob.hp, mob.maxHp);
                }
            });

            for (const mobId in mobModels) {
                if (!state.mobs.has(mobId)) {
                    despawnMob(mobId);
                }
            }

            // ---------- NPC ----------
            state.npcs.forEach((npc: any, npcId: string) => {
                updateNPCMeshes(state.npcs);
                const player = state.players.get(room.sessionId);
                if (player) {
                    const dist = Math.sqrt((player.x - npc.x)**2 + (player.z - npc.z)**2);
                    setNPCProximity(npcId, dist < 3);
                }
            
                // Если окно диалога открыто для этого NPC, и игрок отошёл дальше 3 единиц – закрываем
                if (interactionState.currentInteractNpcId === npcId) {
                    const player = state.players.get(room.sessionId);
                    if (player) {
                        const dist = Math.sqrt((player.x - npc.x)**2 + (player.z - npc.z)**2);
                        if (dist > 3) {
                            hideDialog();
                            interactionState.currentInteractNpcId = '';
                        }
                    }
                }
            });

            // Авто-закрытие банка при отдалении
            if (isBankVisible()) {
                const player = state.players.get(room.sessionId);
                if (player) {
                    const chestObj = state.worldObjects?.get('chest_01');
                    if (chestObj) {
                        const dist = Math.sqrt((player.x - chestObj.x)**2 + (player.z - chestObj.z)**2);
                        if (dist > 4) hideBank();
                    }
                }
            }

            // Авто-закрытие крафта при отдалении от станции
            if (isCraftingVisible()) {
                const player = state.players.get(room.sessionId);
                if (player) {
                    const stationIds = ['furnace_01', 'anvil_01'];
                    let tooFar = true;
                    for (const sid of stationIds) {
                        const obj = state.worldObjects?.get(sid);
                        if (obj) {
                            const dist = Math.sqrt((player.x - obj.x)**2 + (player.z - obj.z)**2);
                            if (dist <= 4) { tooFar = false; break; }
                        }
                    }
                    if (tooFar) hideCraftingUI();
                }
            }

            // Авто-закрытие торговца при отдалении
            if (isMerchantOpen()) {
                const player = state.players.get(room.sessionId);
                if (player) {
                    const obj = state.worldObjects?.get('merchant_01');
                    if (!obj) hideMerchantUI();
                    else {
                        const dist = Math.sqrt((player.x - obj.x)**2 + (player.z - obj.z)**2);
                        if (dist > 4) hideMerchantUI();
                    }
                }
            }

            // ---------- Мешки с лутом ----------
            state.lootBags.forEach((bag: any, bagId: string) => {
                if (!bag || !bag.items) return;
                if (!lootMeshes[bagId] && bag.items.length > 0) {
                    spawnLootMesh(bagId, bag.mobX, bag.mobZ, bag.x, bag.z);
                }
                if (getCurrentBagId() === bagId) {
                    if (bag.items.length === 0) {
                        hideLootUI();
                    } else {
                        updateLootSlots(bag.items);
                    }
                }
            });

            // Обновление визуала всех мешков (удаление пустых/неактуальных)
            updateLootMeshes(state.lootBags);

            // Закрываем окно лута, если отошли от мешка или он опустел
            const lootBagId = getCurrentBagId();
            if (lootBagId) {
                const bag = state.lootBags.get(lootBagId);
                const player = state.players.get(room.sessionId);
                if (bag && player && bag.items) {
                    if (bag.items.length === 0) {
                        hideLootUI();
                    } else {
                        const dist = Math.sqrt((player.x - bag.x) ** 2 + (player.z - bag.z) ** 2);
                        if (dist > 3.0) {
                            hideLootUI();
                        }
                    }
                } else {
                    hideLootUI();
                }
            }

            // ------ Растительность (только один раз) ------
            if (!isVegetationLoaded()) {
            terrainReady.then(() => {
                const vegetPromises: Promise<void>[] = [];
                state.worldObjects.forEach((obj: any, objId: string) => {
                    if (objId.startsWith('pine_') || objId.startsWith('rocky_')) {
                        if (!obj) return;
                        vegetPromises.push(addVegetationInstance(obj));
                    }
                });
                Promise.all(vegetPromises).then(() => {
                    finalizeVegetation();
                });
            });
        }
            // 2. Всегда обновляем мир – и editor_, и vegezone_, и всё остальное
            updateWorldObjects(state.worldObjects);

            // ------ Ландшафт ------
            if (state.terrain) updateTerrain(state.terrain);

            // ------ Resource Nodes (рудные жилы) ------
            if (state.resourceNodes) {
                Promise.all([terrainReady, resourceNodesAssetsReady]).then(() => {
                    updateResourceNodes(state.resourceNodes);
                });
            }

            
        });

        room.onMessage("attackAnim", (message: { attacker: string }) => {
            if (message.attacker !== room.sessionId) {
                fsm[message.attacker]?.requestAttack();
            }
        });

        room.onMessage("attackResult", (data: {
            targetName: string;
            damage: number;
            attackType: string;
            isCrit: boolean;
            targetX: number;
            targetZ: number;
        }) => {
            // Show floating damage number at target position
            const pos = new THREE.Vector3(data.targetX, 0, data.targetZ);
            showFloatingDamage(pos, data.damage, data.isCrit);

            // Show notification with damage details
            let attackLabel = 'Normal';
            if (data.attackType === 'heavy') attackLabel = 'Heavy';
            else if (data.attackType === 'shift') attackLabel = 'Power Strike';

            const critText = data.isCrit ? ' CRIT!' : '';
            showNotification(`${data.targetName}: -${data.damage}${critText} (${attackLabel})`, 2000);
        });

        room.onMessage("useItemResult", (data: { healAmount: number }) => {
            if (localModel) {
                const pos = localModel.position.clone();
                showFloatingDamage(pos, data.healAmount, false, true);
            }
        });

        room.onMessage("gatherResult", (data: { nodeId: string, itemId: string, quantity: number, xpGained: number, profession: string }) => {
            const itemNames: Record<string, string> = {
                "copper_ore": "Медная руда",
                "tin_ore": "Оловянная руда",
                "iron_ore": "Железная руда",
                "coal": "Уголь",
            };
            const name = itemNames[data.itemId] || data.itemId;
            showNotification(`+${data.quantity} ${name}`, 2000);
            showNotification(`+${data.xpGained} Mining XP`, 2000);
        });

        room.onMessage("stationRecipes", (data: { stationType: string, recipes: any[] }) => {
            updateCraftingRecipes(data.recipes);
        });

        room.onMessage("craftResult", (data: { recipeId: string, stationType: string, success: boolean, successChance: number, outputItem: any, quantity: number, xpGained: number }) => {
            if (data.success) {
                showNotification(`Создано: ${data.outputItem?.name || data.recipeId} x${data.quantity}`, 2000);
                showNotification(`+${data.xpGained} Blacksmithing XP`, 2000);
            } else {
                showNotification(`Крафт не удался (шанс ${Math.round((data.successChance || 0) * 100)}%)`, 2000);
            }
            if (data.stationType && room) {
                room.send('getStationRecipes', { stationType: data.stationType });
            }
        });

        room.onMessage("salvageResult", (data: { itemName: string, returnedItems: { itemId: string, name: string, quantity: number }[], salvageXp: number }) => {
            const parts = data.returnedItems.map(i => `${i.name} x${i.quantity}`);
            showNotification(`Разобрал ${data.itemName}: ${parts.join(', ')}`, 4000);
            showNotification(`+${data.salvageXp} Blacksmithing XP`, 2000);
        });

        room.onMessage("merchantData", (data: { items: { itemId: string; buyPrice: number; sellPrice: number; maxStack: number; name: string }[] }) => {
            updateMerchantItems(data.items);
        });

        room.onMessage("merchantResult", (data: { success: boolean; message?: string }) => {
            showNotification(data.message || (data.success ? 'Успешно' : 'Ошибка'), 2000);
        });

        room.onMessage("adminXpResult", (data: { profession: string, level: number, xp: number, xpToNext: number }) => {
            const resultEl = document.getElementById('admin-xp-result');
            if (resultEl) {
                resultEl.textContent = `${data.profession}: Lvl ${data.level}, XP ${data.xp}/${data.xpToNext}`;
            }
        });

        room.onMessage("adminItemResult", (data: { itemId: string, name: string, quantity: number }) => {
            const resultEl = document.getElementById('admin-item-result');
            if (resultEl) {
                resultEl.textContent = `+${data.quantity} ${data.name}`;
            }
        });

        room.onMessage("adminItemList", (data: { items: { id: string; name: string }[] }) => {
            const adminItems = (window as any).__adminItems;
            if (adminItems) adminItems(data.items);
        });

        room.onMessage("notification", (data: { text: string, color?: string }) => {
            showNotification(data.text, 3000);
        });

        room.onMessage("initialPosition", (data: { sessionId: string, x: number, z: number, rotationY?: number }) => {
            if (data.sessionId === room.sessionId) return;
            if (data.x === 0 && data.z === 0) return;

            const model = otherPlayers[data.sessionId];
            if (model) {
                model.position.set(data.x, 0, data.z);
                setTargetPosition(data.sessionId, data.x, data.z);
                if (typeof data.rotationY === 'number') {
                    model.rotation.y = data.rotationY;
                }
                model.visible = true;
            }
        });

        room.onMessage("mobAttackAnim", (data: { mobId: string, targetX?: number, targetZ?: number }) => {
            // For wolves: play 'attack' one-shot (handled via mobAttackAnim as immediate feedback)
            // For skeletons: attack animations (slash01, slash02, stab, throw_projectiles) are
            // handled via state sync → updateMobState, so we don't override with generic 'attack'
            const model = mobModels[data.mobId];
            if (model && (model as any)._falchion) {
                // Skeleton - store target position for projectile aiming
                if (typeof data.targetX === 'number' && typeof data.targetZ === 'number') {
                    pendingProjectileTargets[data.mobId] = { x: data.targetX, z: data.targetZ };
                }
                return;
            }
            const f = mobFSM[data.mobId];
            f?.playOneShot('attack');
        });

        room.onMessage("dialogueStart", (data: { npcName: string; text: string; choices: { text: string }[] }) => {
            console.log('[NET] dialogueStart', { npcId: interactionState.currentInteractNpcId, data });
            showDialog(interactionState.currentInteractNpcId, data.npcName, data.text, data.choices);
        });

        room.onMessage("dialogueUpdate", (data: { text: string; choices: { text: string }[] }) => {
            // Используем текущий npcId, который запомнили при interact
            showDialog(interactionState.currentInteractNpcId, "NPC", data.text, data.choices);
        });

        room.onMessage("dialogueEnd", () => {
            hideDialog();
        });

        room.onMessage("questProgress", (data: { questId: string; current: number; required: number }) => {
            //console.log(`[QUEST] Прогресс квеста ${data.questId}: ${data.current}/${data.required}`);
            // Пока просто покажем всплывающее уведомление
            showNotification(`${getQuestName(data.questId)}: ${data.current}/${data.required}`);
        });

        room.onMessage("questCompleted", (data: { questId: string; name: string; rewardXp: number }) => {
            //console.log(`[QUEST] Квест "${data.name}" завершён! +${data.rewardXp} XP`);
            showNotification(`Квест "${getQuestName(data.questId)}" завершён! +${data.rewardXp} XP`);
        });

        room.onMessage("initQuests", (data: { quests: Record<string, { name: string; description: string }> }) => {
            //console.log('[QUESTS] Received quest definitions:', data.quests);
            setQuestDefs(data.quests);
        });

        room.onMessage('vegetationZoneRegenerated', (data: { zoneId: string }) => {
            const prefix = `vegezone_${data.zoneId}_`;
            // Удаляем старые меши
            for (const id in worldMeshes) {
                if (id.startsWith(prefix)) {
                    scene.remove(worldMeshes[id]);
                    delete worldMeshes[id];
                    console.log(`[VEG] Удалён меш ${id}`);
                }
            }
            // Обновляем мир
            if (room && room.state) {
                updateWorldObjects(room.state.worldObjects);
                // После обновления выведем все объекты этой зоны из стейта
                console.group(`[VEG-DEBUG] Объекты зоны ${data.zoneId} в стейте после обновления:`);
                room.state.worldObjects.forEach((wo: any, id: string) => {
                    if (id.startsWith(prefix)) {
                        console.log(`id=${id}, x=${wo.x}, z=${wo.z}, model=${wo.modelName}`);
                    }
                });
                console.groupEnd();
            }
        });

        room.onLeave((code: number) => {
            console.warn(`[ROOM] Соединение закрыто (код ${code}). Переподключаемся...`);
            for (const id of Object.keys(otherPlayers)) {
                removeOtherPlayerVisuals(id);
            }
            room = null;
            firstSync = true;
            if (!reconnectTimer) {
                reconnectTimer = setTimeout(() => {
                    reconnectTimer = null;
                    join(playerName);
                }, 2000);
            }
        });

        room.onMessage("positionCorrection", (message: { x: number; z: number }) => {
            if (localModel) {
                const oldPos = { x: localModel.position.x, z: localModel.position.z };
                const dx = message.x - oldPos.x;
                const dz = message.z - oldPos.z;
                console.warn(`[POS] positionCorrection: (${oldPos.x.toFixed(2)},${oldPos.z.toFixed(2)}) → (${message.x.toFixed(2)},${message.z.toFixed(2)}), delta=(${dx.toFixed(2)},${dz.toFixed(2)})`);
                localModel.position.x = message.x;
                localModel.position.z = message.z;
                const terrainY = getTerrainHeightAtFast(message.x, message.z);
                localModel.position.y = terrainY + 0.1;
            }
        });

        // Подписка на получение зон растительности от сервера
        room.onMessage('vegetationZonesData', (data: { zones: any[] }) => {
            const zones = data.zones || [];
            // Отправляем зоны в редактор (динамический импорт, чтобы избежать циклической зависимости)
            if (applyVegetationZones) {
                applyVegetationZones(zones);
            }
        });

        room.onMessage('mobZonesData', (data: { zones: any[] }) => {
            const zones = data.zones || [];
            import('./editor/Editor').then((editor) => {
                if (editor.applyMobZones) {
                    editor.applyMobZones(zones);
                }
            });
        });

        room.onMessage('resourceNodesData', (data: { nodes: { id: string; type: string; x: number; z: number; rotationY?: number }[] }) => {
            if (applyResourceNodes) {
                applyResourceNodes(data.nodes || []);
            }
        });
    }).catch(err => {
        console.error('[JOIN] Ошибка:', err);
        localStorage.removeItem('ogm_playerName');
        alert('Сервер недоступен. Запустите сервер.');
    });
}

export function startConnection(playerName: string) {
    if (!localModel) initLocalModel();
    join(playerName);
}