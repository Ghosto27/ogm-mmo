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
import { ChatManager } from "./chat/ChatManager";
import { NPC } from "./schemas/NPC";
import { dialogs } from "./data/dialogs";
import { QuestManager } from "./systems/QuestManager";
import { quests } from "./data/quests";
import { WorldObject } from "./schemas/WorldObject";
import { LocationLoader } from "./systems/LocationLoader";
import { WorldTerrain } from "./schemas/WorldTerrain";

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
    @type({ map: "number" }) questProgress = new MapSchema<number>();
    @type("string") currentDialogueNpcId: string = "";
    @type("string") currentDialogueNode: string = "";
    @type("string") sessionId: string = "";
}

class MyRoomState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
    @type({ map: Mob }) mobs = new MapSchema<Mob>();
    @type({ map: LootBag }) lootBags = new MapSchema<LootBag>();
    @type({ map: NPC }) npcs = new MapSchema<NPC>();
    @type({ map: WorldObject }) worldObjects = new MapSchema<WorldObject>();
    @type(WorldTerrain) terrain: WorldTerrain = new WorldTerrain();
}

export class MyRoom extends Room<MyRoomState> {
    allowReconnectionTime = 10;
    maxClients = 100;
    spawner!: MobSpawner;
    private mobInterval?: NodeJS.Timeout;

    onCreate() {
        this.setState(new MyRoomState());

        const resendStartDialogue = (client: Client, player: Player) => {
            const npc = this.state.npcs?.get(player.currentDialogueNpcId);
            if (!npc) return;
            // Логика построения кнопок (точно такая же, как в interactNpc)
            const choices: { text: string; action?: string; questId?: string }[] = [];
            for (const questId of npc.availableQuestIds) {
                const questDef = quests[questId];
                if (!questDef) continue;
                const progress = player.questProgress.get(questId) ?? 0;
                if (!player.questProgress.has(questId)) {
                    choices.push({ text: `Взять: ${questDef.name}`, action: 'giveQuest', questId });
                } else if (progress >= questDef.requiredCount) {
                    choices.push({ text: `Сдать: ${questDef.name} (${progress}/${questDef.requiredCount})`, action: 'completeQuest', questId });
                } else {
                    choices.push({ text: `${questDef.name} (${progress}/${questDef.requiredCount})` });
                }
            }
            if (choices.length === 0) {
                const idle = dialogs["knight_idle"];
                if (idle) {
                    client.send("dialogueUpdate", { text: idle.npcLine, choices: idle.choices.map(c => ({ text: c.text })) });
                }
                return;
            }
            client.send("dialogueUpdate", {
                text: "Приветствую, путник! Чем могу помочь?",
                choices: choices,
            });
        };

        this.onMessage("interactNpc", (client, message) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;
            const npc = this.state.npcs?.get(message.npcId);
            if (!npc) return;
            const dx = player.x - npc.x;
            const dz = player.z - npc.z;
            if (Math.sqrt(dx*dx + dz*dz) > 3) return;

            // Сохраняем ID NPC, чтобы resendStartDialogue мог найти его позже
            player.currentDialogueNpcId = npc.id;

            // Формируем динамические кнопки на основе доступных квестов
            const choices: { text: string; action?: string; questId?: string }[] = [];

            for (const questId of npc.availableQuestIds) {
                const questDef = quests[questId];
                if (!questDef) continue;
                const progress = player.questProgress.get(questId) ?? 0;

                if (!player.questProgress.has(questId)) {
                    // Квест ещё не взят — предлагаем взять
                    choices.push({
                        text: `Взять: ${questDef.name}`,
                        action: 'giveQuest',
                        questId: questId,
                    });
                } else if (progress >= questDef.requiredCount) {
                    // Квест выполнен — предлагаем сдать
                    choices.push({
                        text: `Сдать: ${questDef.name} (${progress}/${questDef.requiredCount})`,
                        action: 'completeQuest',
                        questId: questId,
                    });
                } else {
                    // Квест в процессе — можно показать прогресс без действия
                    choices.push({
                        text: `${questDef.name} (${progress}/${questDef.requiredCount})`,
                    });
                }
            }

            if (choices.length === 0) {
                // Нет доступных действий — показываем idle-диалог
                const idle = dialogs["knight_idle"];
                if (idle) {
                    client.send("dialogueStart", {
                        npcName: npc.name,
                        text: idle.npcLine,
                        choices: idle.choices.map(c => ({ text: c.text })),
                    });
                }
                return;
            }

            // Отправляем стартовый диалог с динамическими кнопками
            client.send("dialogueStart", {
                npcName: npc.name,
                text: "Приветствую, путник! Чем могу помочь?",
                choices: choices,
            });
        });

        this.onMessage("dialogueChoice", (client, message) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;
            const { npcId, action, questId, choiceIndex } = message;
            const npc = this.state.npcs?.get(npcId);
            if (!npc) return;

            // Приоритет: динамические действия (взять/сдать квест)
            if (action === 'giveQuest' && questId) {
                const questDef = quests[questId];
                if (!questDef) return;
                player.currentDialogueNode = questDef.startDialogue;
                const dialogue = dialogs[questDef.startDialogue];
                if (dialogue) {
                    client.send("dialogueUpdate", {
                        text: dialogue.npcLine,
                        choices: dialogue.choices.map(c => ({ text: c.text })),
                    });
                }
                return;
            }

            //Динамический блок
            if (action === 'completeQuest' && questId) {
                if (QuestManager.completeQuest(this, player, questId)) {
                    PlayerPersistence.savePlayer(player);
                    const questDef = quests[questId];
                    if (questDef) {
                        player.currentDialogueNode = questDef.completeDialogue;
                        const completeDialogue = dialogs[questDef.completeDialogue];
                        if (completeDialogue) {
                            client.send("dialogueUpdate", {
                                text: completeDialogue.npcLine,
                                choices: completeDialogue.choices.map(c => ({ text: c.text })),
                            });
                        }
                    }
                    // Проверяем, есть ли ещё выполненные квесты у этого NPC, и предлагаем сдать следующий
                    for (const qId of npc.availableQuestIds) {
                        const def = quests[qId];
                        if (!def) continue;
                        const prog = player.questProgress.get(qId) ?? 0;
                        if (prog >= def.requiredCount) {
                            client.send("dialogueUpdate", {
                                text: `У вас есть выполненный квест: ${def.name}. Сдать?`,
                                choices: [
                                    { text: `Сдать: ${def.name}`, action: 'completeQuest', questId: qId },
                                    { text: "Позже", action: undefined }
                                ]
                            });
                            return;
                        }
                    }
                    // Если больше выполненных квестов нет – закрываем диалог
                    client.send("dialogueEnd", {});
                }
                return;
            }

            // Обычный статический диалог (по индексу)
            if (choiceIndex !== undefined && player.currentDialogueNode) {
                const currentDialogue = dialogs[player.currentDialogueNode];
                if (!currentDialogue || choiceIndex >= currentDialogue.choices.length) {
                    client.send("dialogueEnd", {});
                    return;
                }
                const choice = currentDialogue.choices[choiceIndex];

                // Обработка последствий (если есть) – для совместимости
                if (choice.consequences) {
                    for (const con of choice.consequences) {
                        if (con.type === 'giveQuest' && con.questId) {
                            QuestManager.giveQuest(player, con.questId);
                            PlayerPersistence.savePlayer(player);
                        } else if (con.type === 'completeQuest' && con.questId) {
                            if (QuestManager.completeQuest(this, player, con.questId)) {
                                //client.send("questCompleted", { questId: con.questId, name: quests[con.questId]?.name, rewardXp: quests[con.questId]?.rewardXp });
                            }
                        }
                    }
                }

                const nextId = choice.nextId;
                if (nextId) {
                    player.currentDialogueNode = nextId;
                    const nextDialogue = dialogs[nextId];
                    if (nextDialogue) {
                        client.send("dialogueUpdate", {
                            text: nextDialogue.npcLine,
                            choices: nextDialogue.choices.map(c => ({ text: c.text })),
                        });
                    }
                } else {
                    // Диалог завершён, перестраиваем стартовый экран NPC
                    resendStartDialogue(client, player);
                }
            }
        });

        this.onMessage("chatMessage", (client, message) => {
            ChatManager.sendMessage(this, client, message);
        });

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
                        PlayerPersistence.savePlayer(deadPlayer);
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
        LocationLoader.load(this, "village");

        const terrain = new WorldTerrain();
        terrain.heightmapPath = "/textures/heightmap.png";
        terrain.width = 100;
        terrain.depth = 100;
        terrain.segments = 128;
        terrain.maxHeight = 5; // подбери под свою картинку
        this.state.terrain = terrain;

        // Создаём тестового NPC – рыцаря
        const knight = new NPC();
        knight.id = "knight_01";
        knight.name = "Рыцарь";
        knight.x = 0;
        knight.z = -25;
        knight.availableQuestIds.push("kill_5_wolves", "kill_10_wolves");
        this.state.npcs.set(knight.id, knight);
        console.log(`[NPC] Рыцарь появился на (${knight.x}, ${knight.z})`);


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

            const hitAnim = Math.random() < 0.5 ? 'idle_hitreact1' : 'idle_hitreact2';
            mob.state = hitAnim;   // клиент подхватит через updateMobState
            mob.targetId = client.sessionId;

            if (mob.hp <= 0) {
                this.spawner.onMobDied(mobId, client.sessionId);
            }
        });

        // Игровой цикл мобов (каждые 250 мс)
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

                    // Определяем тип движения в зависимости от расстояния
                    if (dist > 4.0) {
                        mob.state = 'gallop';   // 🐺 быстрый бег при большом расстоянии
                    } else {
                        mob.state = 'walk';     // обычное преследование
                    }

                    // 🔥 Прыжок при резком сближении (gallop_jump)
                    if (dist <= 5 && dist > 4 && mob.state !== 'gallop_jump') {
                        mob.state = 'gallop_jump';
                    }

                    // Атака при достаточном приближении
                    if (dist <= 3.0 && target.hp > 0) {
                        mob.state = 'attack';
                        if (!mob.lastAttackTime || Date.now() - mob.lastAttackTime > 1500) {
                            target.hp -= 10;
                            mob.lastAttackTime = Date.now();
                            this.broadcast("mobAttackAnim", { mobId });

                            // Проверка смерти игрока от моба
                            if (target.hp <= 0) {
                                console.log(`[DEATH] ${target.name} убит волком. Возрождение через 5 сек.`);
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
                                            PlayerPersistence.savePlayer(deadPlayer);
                                            this.state.players.set(sid, deadPlayer);
                                            console.log(`[RESPAWN] ${deadPlayer.name} возрождён в центре`);
                                        }
                                    }, 5000);
                                }
                            }
                        }
                    } else {
                        // Движение к игроку с учётом состояния (gallop/walk)
                        const speed = mob.state === 'gallop' ? 4.0 : 2.5;
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
                    mob.idleTimer -= 1;
                    if (mob.idleTimer <= 0) {
                        // Выбираем новое направление и длительность движения (1.5–4 секунды)
                        mob.patrolAngle = Math.random() * Math.PI * 2;
                        mob.idleTimer = 1.5 + Math.random() * 2.5;
                    }
                    if (mob.idleTimer > 0.6) { // первую часть времени двигаемся
                        mob.state = 'walk';
                        mob.x += Math.cos(mob.patrolAngle) * 1.2 * 0.5;
                        mob.z += Math.sin(mob.patrolAngle) * 1.2 * 0.5;
                        let diff = mob.patrolAngle - mob.rotationY;
                        while (diff > Math.PI) diff -= 2 * Math.PI;
                        while (diff < -Math.PI) diff += 2 * Math.PI;
                        mob.rotationY += diff * 0.2;
                    } else {
                        // Разнообразный отдых: случайный выбор между idle, idle_2 и idle_2_headlow
                        const r = Math.random();
                        if (r < 0.3) {
                            mob.state = 'idle_2';
                        } else if (r < 0.6) {
                            mob.state = 'idle_2_headlow';
                        } else {
                            mob.state = 'idle';
                        }
                        mob.rotationY += (Math.random() - 0.5) * 0.1;
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
            } else {
                PlayerPersistence.savePlayer(player);
            }
        });

        this.onMessage("unequipItem", (client, message) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;

            const { slot } = message;
            const success = EquipmentSystem.unequipItem(player, slot);
            if (!success) {
                console.log(`[UNEQUIP] Не удалось снять предмет из слота ${slot}`);
            } else {
                PlayerPersistence.savePlayer(player);
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
        player.sessionId = client.sessionId;
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

                // Восстанавливаем прогресс квестов (только если savedData не null)
                if (savedData && savedData.quests) {
                    player.questProgress.clear();
                    for (const [questId, progress] of Object.entries(savedData.quests)) {
                        player.questProgress.set(questId, progress as number);
                    }
                }

                EquipmentSystem.recalculateStats(player);
                if (player.hp <= 0) {
                    player.hp = player.maxHp;
                    player.x = 0;   // на точку респауна
                    player.z = 0;
                    console.log(`[SERVER] Игрок ${name} вошёл мёртвым, возрождаем принудительно`);
                } else if (player.hp > player.maxHp) {
                    player.hp = player.maxHp;
                }
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
        //setTimeout(() => {
            this.state.players.set(client.sessionId, player);
            this.broadcast("initialPosition", {
                sessionId: client.sessionId,
                x: player.x,
                z: player.z,
                rotationY: player.rotationY
            });
            // Отправляем определения всех квестов
            client.send("initQuests", {
                quests: Object.fromEntries(
                    Object.entries(quests).map(([id, def]) => [id, { name: def.name, description: def.description }])
                )
            });
            console.log(`[SERVER] Игрок ${name} добавлен в стейт с x=${player.x}, z=${player.z}`);
            PlayerPersistence.savePlayer(player);   // <-- сохраняем уже полностью загруженного игрока
        //}, 20);
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
        // Сохраняем прогресс после получения опыта
        PlayerPersistence.savePlayer(player);
    }
}