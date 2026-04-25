import { Room, Client } from "colyseus";
import { Schema, MapSchema, type } from "@colyseus/schema";
import { loadPlayer, savePlayer } from "./storage";

class Player extends Schema {
    @type("number") x: number = 0;
    @type("number") z: number = 0;
    @type("string") name: string = "";
    @type("number") hp: number = 100;
    @type("number") maxHp: number = 100;
}

class MyRoomState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
}

export class MyRoom extends Room<MyRoomState> {
    allowReconnectionTime = 10;
    maxClients = 100;

    onCreate() {
        this.setState(new MyRoomState());

        this.onMessage("move", (client, message) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.hp <= 0) return;
            if (message && typeof message.x === "number" && typeof message.z === "number") {
                player.x = message.x;
                player.z = message.z;
            }
        });

        this.onMessage("attack", (client, message) => {
            const attacker = this.state.players.get(client.sessionId);
            if (!attacker || attacker.hp <= 0) return;

            const targetId = message.target;
            const target = this.state.players.get(targetId);
            if (!target || target.hp <= 0) return;

            const dx = attacker.x - target.x;
            const dz = attacker.z - target.z;
            if (Math.sqrt(dx*dx + dz*dz) > 2.5) return;

            target.hp -= 10;
            console.log(`[ATTACK] ${attacker.name} -> ${target.name} (HP: ${target.hp})`);

            // Рассылаем анимацию атаки всем клиентам
            this.broadcast("attackAnim", { attacker: client.sessionId });

            if (target.hp <= 0) {
                console.log(`[DEATH] ${target.name} погиб. Возрождение через 5 сек.`);
                // Запускаем таймер возрождения
                const deadName = target.name;
                setTimeout(() => {
                    // Проверяем, что игрок всё ещё мёртв и находится в состоянии
                    const deadPlayer = this.state.players.get(targetId);
                    if (deadPlayer && deadPlayer.hp <= 0) {
                        deadPlayer.hp = deadPlayer.maxHp;
                        // Всегда телепортируем в центр для теста (позже можно вернуть сохранённую позицию)
                        deadPlayer.x = 0;
                        deadPlayer.z = 0;
                        console.log(`[RESPAWN] ${deadName} возрождён в центре`);
                    }
                }, 5000);
            }
        });

        console.log("Комната 'world' создана");
    }

    onJoin(client: Client, options: { name: string }) {
        const name = options.name || "Гость";
        const player = new Player();
        player.name = name;
        player.hp = player.maxHp = 100;

        const saved = loadPlayer(name);
        if (saved) {
            player.x = saved.x;
            player.z = saved.z;
            console.log(`[JOIN] ${name} восстановлен на (${saved.x}, ${saved.z})`);
        }
        this.state.players.set(client.sessionId, player);
    }

    onLeave(client: Client) {
        const player = this.state.players.get(client.sessionId);
        if (player) {
            savePlayer(player.name, player.x, player.z);
            console.log(`[LEAVE] ${player.name} сохранён.`);
        }
        this.state.players.delete(client.sessionId);
    }
}