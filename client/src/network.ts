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
import { createPlayerUI, updatePlayerUI } from './playerUI';
import { createNameTag, attachNameTag } from './nameTags';
import { updateInventoryUI } from './inventoryUI';
import { lootMeshes, updateLootMeshes, spawnLootMesh } from './render/LootRenderer';
import { getCurrentBagId, updateLootSlots, hideLootUI } from './ui/LootWindowUI';
import { updateCharacterPanel } from './characterPanel';
import { setupChatListeners } from './chat/chatNetwork';
import { PlayerSyncManager } from './sync/PlayerSyncManager';
import type { LocalPlayerUpdate, RemotePlayerUpdate } from './sync/PlayerSyncManager';
import { showDialog, hideDialog } from './ui/DialogUI';
import { updateNPCMeshes, setNPCProximity, npcMeshes } from './render/NPCRenderer';
import { createQuestJournal, toggleQuestJournal, updateQuestList } from './quest/QuestJournalUI';
import { showNotification } from './ui/notificationUI'; 
import { setQuestDefs, getQuestName } from './quest/questData';
import { updateWorldObjects } from './render/WorldRenderer';
import { updateTerrain, getTerrainHeightAt, terrainReady } from './render/TerrainRenderer';

export const client = new Client(SERVER_URL);
export let room: any = null;
export const interactionState = { currentInteractNpcId: '' };

let reconnectTimer: any = null;
let firstSync = true;
let wasDead = false;

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
            room.send("move", { x: localModel.position.x, z: localModel.position.z, r: localModel.rotation.y });
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
                            localModel.position.y = y + 0.5;
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
                        localModel!.position.set(spawnX, y + 0.5, spawnZ);
                    });

                    // Всегда используем серверные координаты (обычно 0,0)
                    setTimeout(() => {
                        const spawnX = local.x ?? 0;
                        const spawnZ = local.z ?? 0;
                        const y = getTerrainHeightAt(spawnX, spawnZ);
                        localModel!.position.set(spawnX, y + 0.5, spawnZ);
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
                        updatePlayerUI(local.hp, local.maxHp, myPlayer.level, myPlayer.exp, myPlayer.expToLevel);
                        updateCharacterPanel(myPlayer);
                        updateInventoryUI(myPlayer.inventory);
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
                        model.position.set(remote.x, 0, remote.z);
                        setTargetPosition(remote.sessionId, remote.x, remote.z);
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

                updateOtherPlayer(remote.sessionId, remote.x, remote.z, remote.hp, remote.maxHp, remote.alive, remote.name);
                // Обновляем цель интерполяции, только если координаты не нулевые (чтобы не улететь в центр)
                if (!(otherPlayers[remote.sessionId] && remote.x === 0 && remote.z === 0)) {
                    setTargetPosition(remote.sessionId, remote.x, remote.z);
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
                if (!mobModels[mobId]) {
                    spawnMob(mobId, mob.x, mob.z, mob.hp, mob.maxHp, mob.rotationY);
                } else {
                    updateMobState(mobId, mob.x, mob.z, mob.hp, mob.maxHp, mob.state);
                }
                if (mobId === getSelectedTarget()) {
                    showTargetUI('Волк', mob.level, mob.hp, mob.maxHp);
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

            // ---------- Мешки с лутом ----------
            state.lootBags.forEach((bag: any, bagId: string) => {
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

            // Закрываем окно лута, если отошли от мешка
            const lootBagId = getCurrentBagId();
            if (lootBagId) {
                const bag = state.lootBags.get(lootBagId);
                const player = state.players.get(room.sessionId);
                if (bag && player && bag.items) {
                    const dist = Math.sqrt((player.x - bag.x) ** 2 + (player.z - bag.z) ** 2);
                    //console.log('[LOOT] distance to bag', dist); // временный лог
                    if (dist > 3.0) {
                        hideLootUI();
                    }
                } else {
                    hideLootUI();
                }
            }

            // ---------- Мировые объекты ----------
            if (state.worldObjects) {
                updateWorldObjects(state.worldObjects);
            }
            if (state.terrain) {
                updateTerrain(state.terrain);
            }
        });

        room.onMessage("attackAnim", (message: { attacker: string }) => {
            if (message.attacker !== room.sessionId) {
                fsm[message.attacker]?.requestAttack();
            }
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

        room.onMessage("mobAttackAnim", (data: { mobId: string }) => {
            const f = mobFSM[data.mobId];
            f?.transitionTo('attack');
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