import { Room, Client } from "colyseus";
import { Schema, MapSchema, type } from "@colyseus/schema";
import { loadPlayer, savePlayer } from "./storage";
import { Mob } from "./Mob";
import { MobSpawner } from "./MobSpawner";

class Player extends Schema {
    @type("number") x: number = 0;
    @type("number") z: number = 0;
    @type("number") rotationY: number = 0;
    @type("string") name: string = "";
    @type("number") hp: number = 100;
    @type("number") maxHp: number = 100;
    @type("number") level: number = 1;
    @type("number") exp: number = 0;
    @type("number") expToLevel: number = 100;
    
}

class MyRoomState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
    @type({ map: Mob }) mobs = new MapSchema<Mob>();
}

export class MyRoom extends Room<MyRoomState> {
    allowReconnectionTime = 10;
    maxClients = 100;
    spawner!: MobSpawner;
    private mobInterval?: NodeJS.Timeout;

    onCreate() {
        this.setState(new MyRoomState());

        this.onMessage("move", (client, message) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.hp <= 0) return;
            if (message && typeof message.x === "number" && typeof message.z === "number") {
                player.x = message.x;
                player.z = message.z;
                if (typeof message.r === "number") {
                    player.rotationY = message.r;
                }
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
            if (Math.sqrt(dx*dx + dz*dz) > 4) return;

            target.hp -= 10;
            this.addExperience(attacker, 10);
            console.log(`[ATTACK] ${attacker.name} -> ${target.name} (HP: ${target.hp})`);

            // Рассылаем анимацию атаки всем клиентам
            this.broadcast("attackAnim", { attacker: client.sessionId });
            console.log(`[DEBUG] target.hp = ${target.hp}, target.name = ${target.name}`);
            if (target.hp <= 0) {
                console.log(`[DEATH] ${target.name} погиб. Возрождение через 5 сек.`);
                // Запускаем таймер возрождения
                const deadTargetId = targetId;
                setTimeout(() => {
                    
                    
                    const deadPlayer = this.state.players.get(deadTargetId);
                    if (deadPlayer && deadPlayer.hp <= 0) {
                        deadPlayer.hp = deadPlayer.maxHp;
                        deadPlayer.x = 0;
                        deadPlayer.z = 0;
                        // Принудительно обновляем состояние, чтобы клиенты увидели изменения
                        this.state.players.set(deadTargetId, deadPlayer);
                        console.log(`[RESPAWN] ${deadPlayer.name} возрождён в центре`);
                        //console.log(`[DEBUG] Попытка возродить ${deadTargetId}, deadPlayer =`, deadPlayer);
                    }
                }, 5000);
                //console.log(`[DEBUG] Таймер возрождения запущен для ${deadTargetId}`);
            }
        });

        this.spawner = new MobSpawner(this);

        this.onMessage("attackMob", (client, message) => {
            const attacker = this.state.players.get(client.sessionId);
            if (!attacker || attacker.hp <= 0) return;

            const mobId = message.mobId;
            const mob = this.state.mobs.get(mobId);
            if (!mob || mob.hp <= 0) return;

            const dx = attacker.x - mob.x;
            const dz = attacker.z - mob.z;
            if (Math.sqrt(dx*dx + dz*dz) > 4) return;

            mob.hp -= 10;
            mob.state = 'walk'; // заставляем идти к атакующему
            mob.targetId = client.sessionId;
            //console.log(`[ATTACK] ${attacker.name} ударил волка ${mobId} (HP: ${mob.hp})`);

            if (mob.hp <= 0) {
                this.spawner.onMobDied(mobId);
            }
        });

        // Игровой цикл мобов (каждые 500 мс)
        this.mobInterval = setInterval(() => {
            this.state.mobs.forEach((mob, mobId) => {
                if (mob.hp <= 0) return;

                // Ищем ближайшего живого игрока в радиусе 12
                let closestPlayer: Player | null = null;
                let closestDist = 12;
                this.state.players.forEach((player: Player) => {
                    if (player.hp <= 0) return;
                    const d = Math.sqrt((mob.x - player.x) ** 2 + (mob.z - player.z) ** 2);
                    if (d < closestDist) {
                        closestDist = d;
                        closestPlayer = player;
                    }
                });

                if (closestPlayer) {
                    const target: Player = closestPlayer;
                    const dx = target.x - mob.x;
                    const dz = target.z - mob.z;
                    const dist = Math.sqrt(dx * dx + dz * dz);

                    // Если игрок вплотную (радиус атаки 2.0) – стоим на месте и кусаем
                     if (dist <= 3.0) {
                        mob.state = 'attack';
                        if (!mob.lastAttackTime || Date.now() - mob.lastAttackTime > 1500) {
                            target.hp -= 10;
                            mob.lastAttackTime = Date.now();
                            this.broadcast("mobAttackAnim", { mobId });

                            // Проверка смерти игрока от моба
                            if (target.hp <= 0) {
                                console.log(`[DEATH] ${target.name} убит волком. Возрождение через 5 сек.`);
                                // Ищем sessionId цели
                                let deadSessionId: string | null = null;
                                this.state.players.forEach((player, sid) => {
                                    if (player === target) deadSessionId = sid;
                                });
                                if (deadSessionId) {
                                    const sid = deadSessionId;
                                    setTimeout(() => {
                                        const deadPlayer = this.state.players.get(sid);
                                        if (deadPlayer && deadPlayer.hp <= 0) {
                                            deadPlayer.hp = deadPlayer.maxHp;
                                            deadPlayer.x = 0;
                                            deadPlayer.z = 0;
                                            this.state.players.set(sid, deadPlayer);
                                            console.log(`[RESPAWN] ${deadPlayer.name} возрождён в центре`);
                                        }
                                    }, 5000);
                                }
                            }
                        }
                    } else {
                        // Движение к игроку
                        mob.state = 'walk';
                        const speed = 2.5;
                        const step = Math.min(speed * 0.25, dist);
                        mob.x += (dx / dist) * step;
                        mob.z += (dz / dist) * step;
                        const targetAngle = Math.atan2(target.z - mob.z, target.x - mob.x);
                        let diff = targetAngle - mob.rotationY;
                        while (diff > Math.PI) diff -= 2 * Math.PI;
                        while (diff < -Math.PI) diff += 2 * Math.PI;
                        mob.rotationY += diff * 0.3;
                    }
                } else {
                    // Нет игроков поблизости – случайное блуждание с небольшой скоростью
                    mob.state = 'walk';
                    mob.x += (Math.random() - 0.5) * 1.0;
                    mob.z += (Math.random() - 0.5) * 1.0;
                    // Очень плавный случайный поворот
                    mob.rotationY += (Math.random() - 0.5) * 0.1;
                }
            });
        }, 250);

        console.log("Комната 'world' создана");
    }

    onDispose() {
        if (this.mobInterval) {
            clearInterval(this.mobInterval);
            this.mobInterval = undefined;
        }
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
            player.rotationY = saved.ry;
        }

        // Небольшая задержка, чтобы координаты точно были готовы
        setTimeout(() => {
            this.state.players.set(client.sessionId, player);
            this.broadcast("initialPosition", {
                sessionId: client.sessionId,
                x: player.x,
                z: player.z,
                rotationY: player.rotationY   // берём текущее значение (по умолчанию 0)
            });
            console.log(`[SERVER] Игрок ${name} добавлен в стейт с x=${player.x}, z=${player.z}`);
        }, 20);
    }

    onLeave(client: Client) {
        const player = this.state.players.get(client.sessionId);
        if (player) {
            savePlayer(player.name, player.x, player.z, player.rotationY);
            console.log(`[LEAVE] ${player.name} сохранён.`);
        }
        this.state.players.delete(client.sessionId);
    }

    public addExperience(player: Player, amount: number) {
        player.exp += amount;
        console.log(`[EXP] ${player.name} получил ${amount} опыта (${player.exp}/${player.expToLevel})`);

        // Повышаем уровень, пока достаточно опыта
        while (player.exp >= player.expToLevel) {
            player.exp -= player.expToLevel;
            player.level += 1;
            // Увеличиваем ёмкость опыта для следующего уровня (простая формула)
            player.expToLevel = Math.floor(player.expToLevel * 1.5);
            // Увеличиваем максимальное HP
            player.maxHp += 10;
            player.hp = player.maxHp;   // полное восстановление при левелапе

            console.log(`[LEVEL UP] ${player.name} теперь ${player.level} уровня!`);
            // Можно отправить отдельное сообщение клиенту для спецэффекта
            // this.broadcast("levelUp", { sessionId: client.sessionId, level: player.level });
        }
    }
}