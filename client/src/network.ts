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
import { createNameTag, attachNameTag, removeNameTag } from './nameTags';
import { updateInventoryUI } from './inventoryUI';
import { lootMeshes, updateLootMeshes, spawnLootMesh } from './render/LootRenderer';
import { getCurrentBagId, updateLootSlots, hideLootUI } from './ui/LootWindowUI';

export const client = new Client(SERVER_URL);
export let room: any = null;


let reconnectTimer: any = null;
let firstSync = true;
let wasDead = false;

const prevHp: { [sessionId: string]: number } = {};
const prevPositions: { [sessionId: string]: { x: number; z: number } } = {};
const playerWasDead: { [sessionId: string]: boolean } = {};
export const lastMoveTimes: { [sessionId: string]: number } = {};

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

            // ---------- Локальный игрок ----------
            const myPlayer = state.players.get(room.sessionId);
            if (myPlayer) {
                const alive = myPlayer.hp > 0;

                if (firstSync && alive) {
                    localModel.position.x = myPlayer.x;
                    localModel.position.z = myPlayer.z;
                    localModel.rotation.y = myPlayer.rotationY ?? 0;
                    firstSync = false;
                    console.log('[SYNC] Позиция восстановлена:', myPlayer.x, myPlayer.z);
                }

                if (alive && wasDead) {
                    deathAnimating['local'] = false;
                    localModel!.visible = true;
                    wasDead = false;
                    localModel!.position.x = myPlayer.x;
                    localModel!.position.z = myPlayer.z;
                    fsm['local']?.transitionTo('idle');
                }

                const localOldHp = prevHp[room.sessionId] ?? myPlayer.hp;
                if (myPlayer.hp < localOldHp) {
                    fsm['local']?.playOneShot('recievehit', 0.1);
                }
                prevHp[room.sessionId] = myPlayer.hp;

                if (!alive && !wasDead) {
                    fsm['local']?.playOneShot('death', 0.1, () => {
                        console.log('[DEATH] local death callback');
                        if (localModel) localModel.visible = false;
                        deathAnimating['local'] = false;
                    });
                    deathAnimating['local'] = true;
                    wasDead = true;
                    showLocalHpBar(myPlayer.x, myPlayer.z, 0, myPlayer.maxHp);
                    hideLocalHpBar();
                }

                if (alive) {
                    showLocalHpBar(myPlayer.x, myPlayer.z, myPlayer.hp, myPlayer.maxHp);
                    //console.log('[UI] updatePlayerUI', myPlayer.hp, myPlayer.maxHp);
                    updatePlayerUI(myPlayer.hp, myPlayer.maxHp, myPlayer.level, myPlayer.exp, myPlayer.expToLevel);
                    updateInventoryUI(myPlayer.inventory);
                    localModel.visible = true;
                } else {
                    hideLocalHpBar();
                }
            }

            // ---------- Другие игроки ----------
            state.players.forEach((player: any, sessionId: string) => {
                if (sessionId === room.sessionId) return;

                if (player.hp > 0 && playerWasDead[sessionId]) {
                    playerWasDead[sessionId] = false;
                    if (otherPlayers[sessionId]) otherPlayers[sessionId].visible = true;
                    if (fsm[sessionId]) fsm[sessionId].transitionTo('idle');
                }

                const prev = prevPositions[sessionId];
                let moving = false;
                if (prev) {
                    const dx = player.x - prev.x;
                    const dz = player.z - prev.z;
                    moving = (dx * dx + dz * dz) > 0.001;
                }
                prevPositions[sessionId] = { x: player.x, z: player.z };
                lastMoveTimes[sessionId] = Date.now();

                const oldHp = prevHp[sessionId] ?? player.hp;
                if (player.hp < oldHp && player.hp > 0) {
                    fsm[sessionId]?.playOneShot('recievehit', 0.1);
                }
                prevHp[sessionId] = player.hp;

                if (sessionId === getSelectedTarget()) {
                    updateTargetHP(player.hp, player.maxHp);
                }

                if (player.hp <= 0 && !deathAnimating[sessionId]) {
                    deathAnimating[sessionId] = true;
                    playerWasDead[sessionId] = true;
                    if (hpBars[sessionId]) {
                        updateHpBarSprite(hpBars[sessionId], 0, player.maxHp);
                    }
                    fsm[sessionId]?.playOneShot('death', 0.1, () => {
                        setTimeout(() => {
                            if (otherPlayers[sessionId]) otherPlayers[sessionId].visible = false;
                            if (hpBars[sessionId]) hpBars[sessionId].visible = false;
                            deathAnimating[sessionId] = false;
                            console.log(`[DEATH] ${sessionId} model hidden`);
                        }, 500);
                    });
                }

                setTargetPosition(sessionId, player.x, player.z);
                updateOtherPlayer(sessionId, player.x, player.z, player.hp, player.maxHp, player.hp > 0, player.name);
                if (otherPlayers[sessionId]) {
                    otherPlayers[sessionId].rotation.y = player.rotationY ?? 0;
                }

                if (moving && fsm[sessionId]) {
                    fsm[sessionId].transitionTo('walk');
                } else if (!moving && fsm[sessionId] && fsm[sessionId].currentStateName !== 'idle') {
                    fsm[sessionId].transitionTo('idle');
                }
            });

            // Удаление вышедших игроков
            for (const sessionId in otherPlayers) {
                if (!state.players.has(sessionId)) {
                    removeOtherPlayerVisuals(sessionId);
                    delete prevHp[sessionId];
                    delete prevPositions[sessionId];
                    delete lastMoveTimes[sessionId];
                    delete deathAnimating[sessionId];
                    delete playerWasDead[sessionId];
                }
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

            // ---------- Мешки с лутом ----------
            state.lootBags.forEach((bag: any, bagId: string) => {
                updateLootMeshes(state.lootBags);
                // Запускаем анимацию только если модели ещё нет и мешок не пуст
                if (!lootMeshes[bagId] && bag.items.length > 0) {
                    spawnLootMesh(bagId, bag.mobX, bag.mobZ, bag.x, bag.z);
                }
                if (state.lootBags.size > 0 || Object.keys(lootMeshes).length > 0) {
                    //console.log('[NET] lootBags updated, calling updateLootMeshes');
                    //console.log('[NET] lootBags size:', state.lootBags.size);
                    state.lootBags.forEach((bag: any, bagId: string) => {
                        //console.log(`[NET]   ${bagId} items: ${bag.items.length}`);
                    });
                    updateLootMeshes(state.lootBags);
                }
                // Если окно открыто для этого мешка – обновить слоты
                if (getCurrentBagId() === bagId) {
                    if (bag.items.length === 0) {
                        hideLootUI();
                    } else {
                        updateLootSlots(bag.items);
                    }
                }
            });

            // Удаляем мешки, которых больше нет
            for (const bagId in lootMeshes) {
                if (!state.lootBags.has(bagId)) {
                    // updateLootMeshes уже сделает удаление, но также скроем UI
                    if (getCurrentBagId() === bagId) hideLootUI();
                }
            }
        });

        room.onMessage("attackAnim", (message: { attacker: string }) => {
            if (message.attacker !== room.sessionId) {
                fsm[message.attacker]?.playOneShot('sword_attack', 0.1);
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
            const fsm = mobFSM[data.mobId];
            fsm?.playOneShot('attack', 0.1);
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