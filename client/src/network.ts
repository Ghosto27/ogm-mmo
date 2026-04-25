import { Client } from 'colyseus.js';
import { SERVER_URL } from './config';
import {
    localModel, initLocalModel, otherPlayers, hpBars,
    showLocalHpBar, hideLocalHpBar, updateOtherPlayer, removeOtherPlayerVisuals,
    deathAnimating, fsm
} from './player';
import { setTargetPosition } from './animationUtils';
import { updateHpBarSprite } from './utils';
import { updatePlayerUI } from './playerUI';
import { getSelectedTarget } from './selection';
import { updateTargetHP } from './targetUI';

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
        if (localModel) {
            room.send("move", { x: localModel.position.x, z: localModel.position.z, r: localModel.rotation.y });
        }
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }

        firstSync = true;
        wasDead = false;

        if (!localModel) initLocalModel(playerName);

        // Принудительно запускаем idle для локального игрока (если FSM уже готов)
        if (fsm['local']) fsm['local'].transitionTo('idle');

        room.onStateChange((state: any) => {
            if (!room || !localModel) return;

            // ---------- Локальный игрок ----------
            const myPlayer = state.players.get(room.sessionId);
            if (myPlayer) {
                const alive = myPlayer.hp > 0;

                // Первичная синхронизация позиции
                if (firstSync && alive) {
                    localModel.position.x = myPlayer.x;
                    localModel.position.z = myPlayer.z;
                    localModel.rotation.y = myPlayer.rotationY ?? 0;
                    firstSync = false;
                    console.log('[SYNC] Позиция восстановлена:', myPlayer.x, myPlayer.z);
                }
                // При первой синхронизации сразу переносим чужие модели на их позиции
                if (firstSync) {
                    state.players.forEach((p: any, sid: string) => {
                        if (sid === room.sessionId) return;
                        const model = otherPlayers[sid];
                        if (model) {
                            model.position.set(p.x, 0, p.z);
                            setTargetPosition(sid, p.x, p.z); // обновляем цель интерполяции
                        }
                    });
                }

                // Возрождение после смерти
                if (alive && wasDead) {
                    deathAnimating['local'] = false;
                    localModel!.visible = true;
                    wasDead = false;
                    localModel!.position.x = myPlayer.x;
                    localModel!.position.z = myPlayer.z;
                    fsm['local']?.transitionTo('idle');
                }

                // Получение урона
                const localOldHp = prevHp[room.sessionId] ?? myPlayer.hp;
                if (myPlayer.hp < localOldHp) {
                    fsm['local']?.playOneShot('recievehit', 0.1);
                }
                prevHp[room.sessionId] = myPlayer.hp;

                // Смерть
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

                // Отображение HP-бара
                if (alive) {
                    showLocalHpBar(myPlayer.x, myPlayer.z, myPlayer.hp, myPlayer.maxHp);
                    updatePlayerUI(myPlayer.hp, myPlayer.maxHp, myPlayer.level);
                } else {
                    hideLocalHpBar();
                }
            }

            // ---------- Другие игроки ----------
            state.players.forEach((player: any, sessionId: string) => {
                if (sessionId === room.sessionId) return;
                console.log(`[STATE] sessionId=${sessionId}, x=${player.x}, z=${player.z}, hp=${player.hp}`);
                console.log(`[NET] Игрок ${sessionId} – x=${player.x}, z=${player.z}, hp=${player.hp}`);

                // Возрождение после смерти (сброс позы)
                if (player.hp > 0 && playerWasDead[sessionId]) {
                    playerWasDead[sessionId] = false;
                    if (otherPlayers[sessionId]) otherPlayers[sessionId].visible = true;
                    if (fsm[sessionId]) fsm[sessionId].transitionTo('idle');
                }

                // Определяем движение
                const prev = prevPositions[sessionId];
                let moving = false;
                if (prev) {
                    const dx = player.x - prev.x;
                    const dz = player.z - prev.z;
                    moving = (dx * dx + dz * dz) > 0.001;
                }
                prevPositions[sessionId] = { x: player.x, z: player.z };
                lastMoveTimes[sessionId] = Date.now();

                // Урон
                const oldHp = prevHp[sessionId] ?? player.hp;
                if (player.hp < oldHp && player.hp > 0) {
                    fsm[sessionId]?.playOneShot('recievehit', 0.1);
                }
                prevHp[sessionId] = player.hp;

                // Если этот игрок — текущая цель, обновляем его HP в панели
                if (sessionId === getSelectedTarget()) {
                    updateTargetHP(player.hp, player.maxHp);
                }

                // Смерть
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

                // Позиция и видимость
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
        });

        // Анимация атаки (сообщение от сервера)
        room.onMessage("attackAnim", (message: { attacker: string }) => {
            if (message.attacker !== room.sessionId) {
                fsm[message.attacker]?.playOneShot('sword_attack', 0.1);
            }
        });

        room.onMessage("playerJoined", (data: { sessionId: string, x: number, z: number }) => {
            if (data.sessionId === room.sessionId) return; // себя пропускаем
            const model = otherPlayers[data.sessionId];
            if (model) {
                model.position.set(data.x, 0, data.z);
                setTargetPosition(data.sessionId, data.x, data.z);
            }
        });

        room.onMessage("initialPosition", (data: { sessionId: string, x: number, z: number, rotationY?: number }) => {
            // Игнорируем сообщения для самого себя
            if (data.sessionId === room.sessionId) return;

            // Если координаты нулевые — ждём реальных данных, не создаём модель
            if (data.x === 0 && data.z === 0) return;

            const model = otherPlayers[data.sessionId];

            if (model) {
                // Модель уже существует – обновляем и показываем
                model.position.set(data.x, 0, data.z);
                setTargetPosition(data.sessionId, data.x, data.z);
                if (typeof data.rotationY === 'number') {
                    model.rotation.y = data.rotationY;
                }
                model.visible = true;
                // Модели ещё нет, но координаты реальные – создаём
                const player = room.state.players.get(data.sessionId);
                if (player) {
                    updateOtherPlayer(data.sessionId, data.x, data.z, player.hp, player.maxHp, true, player.name);
                    // После создания модель точно будет в otherPlayers, применяем поворот
                    const freshModel = otherPlayers[data.sessionId];
                    if (freshModel && typeof data.rotationY === 'number') {
                        freshModel.rotation.y = data.rotationY;
                    }
                }
            }
        });

        // Разрыв соединения
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
    if (!localModel) initLocalModel(playerName);
    join(playerName);
}