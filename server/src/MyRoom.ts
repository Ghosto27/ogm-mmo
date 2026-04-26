import { Room, Client } from "colyseus";
import { Schema, MapSchema, type } from "@colyseus/schema";
import { loadPlayer, savePlayer } from "./storage";
import { Mob } from "./Mob";
import { MobSpawner } from "./MobSpawner";
import { Inventory } from "./models/Inventory";
import { itemDatabase } from "./data/items";
import { Item } from "./models/Item";
import { LootBag } from "./schemas/LootBag";
import { PlayerStats } from "./models/PlayerStats";
import { EquipmentSystem } from "./systems/EquipmentSystem";
import { PlayerPersistence } from "./systems/PlayerPersistence";
import { ItemSlot } from "./models/ItemSlot";

export class Player extends Schema {
    @type("number") x: number = 0;
    @type("number") z: number = 0;
    @type("number") rotationY: number = 0;
    @type("string") name: string = "";
    @type("number") hp: number = 100;
    @type("number") maxHp: number = 100;
    @type("number") level: number = 1;
    @type("number") exp: number = 0;
    @type("number") expToLevel: number = 100;
    @type(Inventory) inventory: Inventory = new Inventory();
    @type(PlayerStats) stats: PlayerStats = new PlayerStats();
    @type({ map: Item }) equipment = new MapSchema<Item>();
    
}

class MyRoomState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
    @type({ map: Mob }) mobs = new MapSchema<Mob>();
    @type({ map: LootBag }) lootBags = new MapSchema<LootBag>();
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

            const damage = Math.max(1, Math.floor(attacker.stats.attackPower - target.stats.defense * 0.3));
            target.hp -= damage;
            console.log(`[ATTACK] ${attacker.name} -> ${target.name} на ${damage} урона (AP: ${attacker.stats.attackPower}, Def: ${target.stats.defense})`);
            this.addExperience(attacker, 10);

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
                        console.log(`[DEBUG] Попытка возродить ${deadTargetId}, deadPlayer =`, deadPlayer);
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

            const damage = Math.max(1, Math.floor(attacker.stats.attackPower * 0.5));
            mob.hp -= damage;
            console.log(`[ATTACK] ${attacker.name} ударил волка ${mobId} на ${damage} урона (AP: ${attacker.stats.attackPower})`);

            mob.state = 'walk';
            mob.targetId = client.sessionId;

            if (mob.hp <= 0) {
                this.spawner.onMobDied(mobId, client.sessionId);
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
                     if (dist <= 3.0 && target.hp > 0) {
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
                    // Случайное блуждание с паузами
                    mob.idleTimer -= 0.25; // интервал 250 мс, за 1 сек проходят 4 тика
                    if (mob.idleTimer <= 0) {
                        // Выбираем новое направление и длительность движения (1.5–4 секунды)
                        mob.patrolAngle = Math.random() * Math.PI * 2;
                        mob.idleTimer = 1.5 + Math.random() * 2.5;
                    }
                    if (mob.idleTimer > 0.8) { // первую часть времени двигаемся
                        mob.state = 'walk';
                        mob.x += Math.cos(mob.patrolAngle) * 1.2 * 0.5;
                        mob.z += Math.sin(mob.patrolAngle) * 1.2 * 0.5;
                        let diff = mob.patrolAngle - mob.rotationY;
                        while (diff > Math.PI) diff -= 2 * Math.PI;
                        while (diff < -Math.PI) diff += 2 * Math.PI;
                        mob.rotationY += (Math.random() - 0.5) * 0.1; 
                    } else {
                        mob.state = 'idle'; // стоим на месте
                    }
                }
            });
        }, 250);

        this.onMessage("lootItem", (client, message) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;

            const { bagId, slotIndex } = message;
            const bag = this.state.lootBags.get(bagId);
            if (!bag) return;

            const slot = bag.items[slotIndex];
            if (!slot || slot.quantity <= 0) return;

            // Переносим в инвентарь игрока
            const success = player.inventory.addItem(slot.item!, slot.quantity);
            if (success) {
                bag.items.splice(slotIndex, 1);
                console.log(`[LOOT] ${player.name} забрал предмет из ${bagId}, осталось слотов: ${bag.items.length}`);
                // Вместо удаления мешка — очищаем массив, чтобы клиент сразу увидел пустой лут
                if (bag.items.length === 0) {
                    bag.items.clear(); // очистка синхронизируется автоматически
                    console.log(`[LOOT] Мешок ${bagId} опустел (items cleared)`);
                }
            }
        });

        this.onMessage("useItem", (client, message) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.hp <= 0) return;

            const { slotIndex } = message;
            const slot = player.inventory.slots[slotIndex];
            if (!slot || !slot.item) return;

            // Пока обрабатываем только зелье здоровья
            if (slot.item.id === 'potion_hp_01') {
                const healAmount = 50;
                player.hp = Math.min(player.maxHp, player.hp + healAmount);
                
                // Уменьшаем количество
                slot.quantity -= 1;
                if (slot.quantity <= 0) {
                    slot.item = null;
                    slot.quantity = 0;
                }
            }
        });

        this.onMessage("equipItem", (client, message) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.hp <= 0) return;

            const { slotIndex } = message;
            const slot = player.inventory.slots[slotIndex];
            if (!slot || !slot.item) return;

            const item = slot.item;
            if (!item.slot) return; // не экипировка

            const success = EquipmentSystem.equipItem(player, item, slotIndex);
            if (!success) {
                // можно отправить клиенту сообщение об ошибке, но пока просто логируем
                console.log(`[EQUIP] Не удалось надеть ${item.name}`);
            }
        });

        this.onMessage("unequipItem", (client, message) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;

            const { slot } = message;
            const success = EquipmentSystem.unequipItem(player, slot);
            if (!success) {
                console.log(`[UNEQUIP] Не удалось снять предмет из слота ${slot}`);
            }
        });

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

        try {
            // Восстанавливаем позицию из старого хранилища (координаты)
            const saved = loadPlayer(name);
            if (saved) {
                player.x = saved.x;
                player.z = saved.z;
                player.rotationY = saved.ry;
            }

            // Загружаем полное сохранение (инвентарь, экипировка, статы, опыт, HP)
            const savedData = PlayerPersistence.loadPlayer(name);
            if (savedData) {
                player.level = savedData.level;
                player.exp = savedData.exp;
                player.expToLevel = savedData.expToLevel;
                player.hp = savedData.hp;

                player.stats.strength = savedData.stats.strength;
                player.stats.dexterity = savedData.stats.dexterity;
                player.stats.intelligence = savedData.stats.intelligence;
                player.stats.vitality = savedData.stats.vitality;
                player.stats.luck = savedData.stats.luck;
                player.stats.attackPower = savedData.stats.attackPower;
                player.stats.defense = savedData.stats.defense;
                player.stats.critChance = savedData.stats.critChance;

                player.inventory.slots.clear();
                savedData.inventory.forEach(slot => {
                    player.inventory.slots.push(slot.cloneSlot());
                });

                player.equipment.clear();
                savedData.equipment.forEach((item, slot) => {
                    player.equipment.set(slot, item.cloneItem());
                });

                EquipmentSystem.recalculateStats(player);
                if (player.hp > player.maxHp) player.hp = player.maxHp;
            } else {
                // Нет сохранения – выдаём стартовые предметы
                const potion = itemDatabase["potion_hp_01"];
                const sword = itemDatabase["sword_01"];
                player.inventory.addItem(Object.assign(new Item(), potion), 3);
                player.inventory.addItem(Object.assign(new Item(), sword), 1);
                EquipmentSystem.recalculateStats(player);
            }
        } catch (err) {
            console.error(`[ERROR] Ошибка загрузки сохранения для ${name}:`, err);
            // Выдаём стартовые предметы при любой ошибке
            const potion = itemDatabase["potion_hp_01"];
            const sword = itemDatabase["sword_01"];
            player.inventory.addItem(Object.assign(new Item(), potion), 3);
            player.inventory.addItem(Object.assign(new Item(), sword), 1);
            EquipmentSystem.recalculateStats(player);
        }

        // Добавляем игрока в комнату
        setTimeout(() => {
            this.state.players.set(client.sessionId, player);
            this.broadcast("initialPosition", {
                sessionId: client.sessionId,
                x: player.x,
                z: player.z,
                rotationY: player.rotationY
            });
            console.log(`[SERVER] Игрок ${name} добавлен в стейт с x=${player.x}, z=${player.z}`);
        }, 20);
    }

    onLeave(client: Client) {
        const player = this.state.players.get(client.sessionId);
        if (player) {
            savePlayer(player.name, player.x, player.z, player.rotationY);
            PlayerPersistence.savePlayer(player);
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