import { Client } from 'colyseus.js';
import { SERVER_URL } from './config';
import {
    localModel, initLocalModel, otherPlayers, hpBars,
    showLocalHpBar, hideLocalHpBar, updateOtherPlayer, removeOtherPlayerVisuals,
    deathAnimating, fsm
} from './player';
import { setTargetPosition } from './animationUtils';

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

        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }

        firstSync = true;
        wasDead = false;

        if (!localModel) initLocalModel();

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
                    firstSync = false;
                    console.log('[SYNC] Позиция восстановлена:', myPlayer.x, myPlayer.z);
                }

                // Возрождение после смерти
                if (alive && wasDead) {
                    deathAnimating['local'] = false;
                    localModel!.visible = true;
                    wasDead = false;
                    localModel!.position.x = myPlayer.x;
                    localModel!.position.z = myPlayer.z;
                    fsm['local']?.resetToIdle();   // ← теперь полностью сбрасываем позу
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
                    hideLocalHpBar();
                }

                // Отображение HP-бара
                if (alive) {
                    showLocalHpBar(myPlayer.x, myPlayer.z, myPlayer.hp, myPlayer.maxHp);
                } else {
                    hideLocalHpBar();
                }
            } else {
                localModel.visible = false;
                hideLocalHpBar();
            }

            // ---------- Другие игроки ----------
            state.players.forEach((player: any, sessionId: string) => {
                if (sessionId === room.sessionId) return;

                // Возрождение после смерти (сброс позы)
                if (player.hp > 0 && playerWasDead[sessionId]) {
                    playerWasDead[sessionId] = false;
                    if (otherPlayers[sessionId]) otherPlayers[sessionId].visible = true;
                    if (fsm[sessionId]) fsm[sessionId].resetToIdle();
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

                // Смерть
                if (player.hp <= 0 && !deathAnimating[sessionId]) {
                    deathAnimating[sessionId] = true;
                    playerWasDead[sessionId] = true;
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
                updateOtherPlayer(sessionId, player.x, player.z, player.hp, player.maxHp, player.hp > 0);

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
    if (!localModel) initLocalModel();
    join(playerName);
}