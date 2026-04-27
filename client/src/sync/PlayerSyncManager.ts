// client/src/sync/PlayerSyncManager.ts

export interface LocalPlayerUpdate {
    alive: boolean;
    resurrected: boolean;
    tookDamage: boolean;
    died: boolean;
    isMoving: boolean;
    hp: number;
    maxHp: number;
    x: number;
    z: number;
    rotationY: number;
}

export interface RemotePlayerUpdate {
    sessionId: string;
    alive: boolean;
    resurrected: boolean;
    tookDamage: boolean;
    died: boolean;
    isMoving: boolean;
    hp: number;
    maxHp: number;
    x: number;
    z: number;
    rotationY: number;
    name: string;
}

export interface SyncResult {
    localPlayer: LocalPlayerUpdate | null;
    remotePlayers: RemotePlayerUpdate[];
    needCleanup: string[];
}

export class PlayerSyncManager {
    private prevHp = new Map<string, number>();
    private prevPositions = new Map<string, { x: number; z: number }>();
    private playerWasDead = new Map<string, boolean>();
    private lastMoveTimes = new Map<string, number>();

    /**
     * Основной метод, который нужно вызывать из room.onStateChange.
     * Принимает сырое состояние комнаты и sessionId текущего игрока.
     * Возвращает структуру SyncResult с уже готовыми данными для обновления UI и анимаций.
     */
    processStateChange(state: any, localSessionId: string): SyncResult {
        const result: SyncResult = {
            localPlayer: null,
            remotePlayers: [],
            needCleanup: [],
        };

        // 1. Локальный игрок
        const myPlayer = state.players.get(localSessionId);
        if (myPlayer) {
            result.localPlayer = this.processLocalPlayer(myPlayer, localSessionId);
        }

        // 2. Удалённые игроки
        state.players.forEach((player: any, sessionId: string) => {
            if (sessionId === localSessionId) return;
            const remote = this.processRemotePlayer(sessionId, player);
            if (remote) result.remotePlayers.push(remote);
        });

        // 3. Игроки, удалённые из стейта (вышедшие)
        for (const sessionId of this.prevHp.keys()) {
            if (!state.players.has(sessionId)) {
                result.needCleanup.push(sessionId);
            }
        }

        return result;
    }

    /**
     * Очищает внутренние данные по sessionId.
     * Вызывается при удалении игрока (выход или длительное отсутствие).
     */
    cleanup(sessionId: string): void {
        this.prevHp.delete(sessionId);
        this.prevPositions.delete(sessionId);
        this.playerWasDead.delete(sessionId);
        this.lastMoveTimes.delete(sessionId);
    }

    /**
     * Возвращает время последнего движения для указанного игрока.
     * Используется в main.ts для таймера остановки анимации.
     */
    getLastMoveTime(sessionId: string): number {
        return this.lastMoveTimes.get(sessionId) ?? 0;
    }

    // ----- Приватные методы -----

    private processLocalPlayer(player: any, sessionId: string): LocalPlayerUpdate {
        const alive = player.hp > 0;
        const prevHp = this.prevHp.get(sessionId) ?? player.hp;
        const tookDamage = player.hp < prevHp && alive;
        const wasDead = this.playerWasDead.get(sessionId) ?? false;
        const resurrected = alive && wasDead;
        const died = !alive && !wasDead;

        // Определяем движение для локального игрока (не используется в network.ts,
        // но оставлено для полноты; движение локального игрока рассчитывается в main.ts)
        const isMoving = false;

        // Обновляем историю
        this.prevHp.set(sessionId, player.hp);
        this.prevPositions.set(sessionId, { x: player.x, z: player.z });
        if (died) {
            this.playerWasDead.set(sessionId, true);
        } else if (resurrected) {
            this.playerWasDead.set(sessionId, false);
        }

        return {
            alive,
            resurrected,
            tookDamage,
            died,
            isMoving,
            hp: player.hp,
            maxHp: player.maxHp,
            x: player.x,
            z: player.z,
            rotationY: player.rotationY ?? 0,
        };
    }

    private processRemotePlayer(sessionId: string, player: any): RemotePlayerUpdate {
        const alive = player.hp > 0;
        const prevHp = this.prevHp.get(sessionId) ?? player.hp;
        const tookDamage = player.hp < prevHp && alive;
        const wasDead = this.playerWasDead.get(sessionId) ?? false;
        const resurrected = alive && wasDead;
        const died = player.hp <= 0 && !this.playerWasDead.get(sessionId);

        // Определяем движение
        const prevPos = this.prevPositions.get(sessionId);
        let isMoving = false;
        if (prevPos) {
            const dx = player.x - prevPos.x;
            const dz = player.z - prevPos.z;
            isMoving = (dx * dx + dz * dz) > 0.001;
        }

        // Обновляем историю
        this.prevHp.set(sessionId, player.hp);
        this.prevPositions.set(sessionId, { x: player.x, z: player.z });
        this.lastMoveTimes.set(sessionId, Date.now());
        if (died) {
            this.playerWasDead.set(sessionId, true);
        } else if (resurrected) {
            this.playerWasDead.set(sessionId, false);
        }

        return {
            sessionId,
            alive,
            resurrected,
            tookDamage,
            died,
            isMoving,
            hp: player.hp,
            maxHp: player.maxHp,
            x: player.x,
            z: player.z,
            rotationY: player.rotationY ?? 0,
            name: player.name ?? 'Unknown',
        };
    }
}