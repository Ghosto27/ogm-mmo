import { Room, Client } from "colyseus";
import * as fs from 'fs';
import * as path from 'path';
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
import { ChatManager } from "./chat/ChatManager";
import { NPC } from "./schemas/NPC";
import { dialogs } from "./data/dialogs";
import { QuestManager } from "./systems/QuestManager";
import { quests } from "./data/quests";
import { WorldObject } from "./schemas/WorldObject";
import { LocationLoader } from "./systems/LocationLoader";
import { WorldTerrain } from "./schemas/WorldTerrain";
import { VegetationSpawner } from "./systems/VegetationSpawner";
import { initServerColliders, applyMobMovementWithCollisions, isPlayerPositionBlocked } from './collision/ServerCollision';
import { ProfessionsData } from "./models/ProfessionsData";
import { ResourceNode } from "./schemas/ResourceNode";
import { ResourceSpawner } from "./systems/ResourceSpawner";
import { recipes, Recipe, computeSuccessChance, computeBonusChance, findRecipeByResult, MIN_SALVAGE_RATE, MAX_SALVAGE_RATE } from "./data/recipes";

export class Player extends Schema {
    @type("number") x: number = 0;
    @type("number") z: number = 0;
    @type("number") y: number = 0;
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
    @type(ProfessionsData) professions: ProfessionsData = new ProfessionsData();
    @type(Inventory) bank: Inventory = new Inventory(40);
    @type("string") currentDialogueNpcId: string = "";
    @type("string") currentDialogueNode: string = "";
    @type("string") sessionId: string = "";
    // Admin/debug flag (not synced to client)
    godMode: boolean = false;
}

class MyRoomState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
    @type({ map: Mob }) mobs = new MapSchema<Mob>();
    @type({ map: LootBag }) lootBags = new MapSchema<LootBag>();
    @type({ map: NPC }) npcs = new MapSchema<NPC>();
    @type({ map: WorldObject }) worldObjects = new MapSchema<WorldObject>();
    @type({ map: ResourceNode }) resourceNodes = new MapSchema<ResourceNode>();
    @type(WorldTerrain) terrain: WorldTerrain = new WorldTerrain();
}

export class MyRoom extends Room<MyRoomState> {
    allowReconnectionTime = 10;
    maxClients = 100;
    spawner!: MobSpawner;
    private timers: NodeJS.Timeout[] = [];
    vegetationSpawner!: VegetationSpawner;
    resourceSpawner!: ResourceSpawner;
    private chunkBuffer = new Map<string, { totalChunks: number; chunks: any[][] }>();

    public addTimer(timer: NodeJS.Timeout) {
        this.timers.push(timer);
    }

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

            const newX = message.x;
            const newZ = message.z;
            const newY = message.y ?? player.y;
            if (typeof newX !== "number" || typeof newZ !== "number") return;

            // --- 1. Проверка максимальной дистанции (защита от телепорта) ---
            const MAX_STEP = 5; // максимум 5 юнитов за пакет (с учётом возможного лага)
            const dx = newX - player.x;
            const dz = newZ - player.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > MAX_STEP) {
                // Слишком большой скачок — вероятно читерство, отвергаем и корректируем
                client.send("positionCorrection", { x: player.x, z: player.z });
                return;
            }

            // --- 2. Проверка коллизий с объектами деревни ---
            if (isPlayerPositionBlocked(newX, newZ)) {
                // Позиция внутри препятствия — отвергаем и отправляем текущую
                client.send("positionCorrection", { x: player.x, z: player.z });
                return;
            }

            // --- 3. Всё ок — применяем движение ---
            player.x = newX;
            player.z = newZ;
            player.y = newY;
            if (typeof message.r === "number") {
                player.rotationY = message.r;
            }
        });

        this.onMessage("attack", (client, message) => {
            const attacker = this.state.players.get(client.sessionId);
            if (!attacker || attacker.hp <= 0) return;

            const targetId = message.target;
            // If no target (swing in air), just broadcast animation
            if (!targetId || targetId === '') {
                this.broadcast("attackAnim", { attacker: client.sessionId });
                return;
            }

            const target = this.state.players.get(targetId);
            if (!target || target.hp <= 0) return;

            const dx = attacker.x - target.x;
            const dz = attacker.z - target.z;
            if (Math.sqrt(dx*dx + dz*dz) > 4) return;

            const attackType: string = message.attackType || 'normal';
            const holdDuration: number = message.holdDuration || 0;

            // Calculate damage multiplier based on attack type
            let damageMultiplier = 1.0;
            let isCrit = false;

            switch (attackType) {
                case 'heavy':
                    // Scale damage with hold duration (max 1.5x at 1000ms hold)
                    damageMultiplier = 1.0 + Math.min(holdDuration, 1000) / 2000 * 0.5;
                    break;
                case 'shift':
                    // Power strike: 1.2x damage + bonus crit chance
                    damageMultiplier = 1.2;
                    isCrit = Math.random() < 0.25; // 25% crit chance (default is 0%)
                    break;
                default:
                    damageMultiplier = 1.0;
                    break;
            }

            let baseDamage = Math.max(1, Math.floor(attacker.stats.attackPower - target.stats.defense * 0.3));
            let damage = Math.floor(baseDamage * damageMultiplier);
            if (isCrit) {
                damage = Math.floor(damage * 1.5); // crit = 1.5x extra
                console.log(`[CRIT] ${attacker.name} критически ударил ${target.name}!`);
            }
            target.hp -= damage;
            console.log(`[ATTACK] ${attacker.name} -> ${target.name} на ${damage} урона (${attackType}, AP: ${attacker.stats.attackPower}, Def: ${target.stats.defense})`);

            // Send damage feedback to the attacker
            client.send("attackResult", {
                targetName: target.name,
                damage: damage,
                attackType: attackType,
                isCrit: isCrit,
                targetX: target.x,
                targetZ: target.z
            });

            this.addExperience(attacker, attackType === 'heavy' ? 15 : 10);

            // Рассылаем анимацию атаки всем клиентам
            this.broadcast("attackAnim", { attacker: client.sessionId });
            console.log(`[DEBUG] target.hp = ${target.hp}, target.name = ${target.name}`);
            if (target.hp <= 0) {
                console.log(`[DEATH] ${target.name} погиб. Возрождение через 5 сек.`);
                // Запускаем таймер возрождения
                const deadTargetId = targetId;
                const respawnTimer = setTimeout(() => {
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
                this.addTimer(respawnTimer);
                //console.log(`[DEBUG] Таймер возрождения запущен для ${deadTargetId}`);
            }
        });

        this.spawner = new MobSpawner(this);
        //LocationLoader.load(this, "village");
        const vegetationSpawner = new VegetationSpawner(this);
        vegetationSpawner.initialize();
        this.vegetationSpawner = vegetationSpawner;

        const resourceSpawner = new ResourceSpawner(this);
        resourceSpawner.initialize();
        this.resourceSpawner = resourceSpawner;

        try {
            const fs = require('fs');
            const path = require('path');
            const filePath = path.join(__dirname, '../data/editor_objects.json');
            if (fs.existsSync(filePath)) {
                const raw = fs.readFileSync(filePath, 'utf-8');
                const data = JSON.parse(raw);
                for (const obj of data) {
                    const wo = new WorldObject();
                    wo.id = obj.id || 'editor_' + Date.now().toString();
                    wo.modelName = obj.modelName || 'cube';      // ← защита от undefined
                    wo.x = obj.x || 0;
                    wo.y = obj.y || 0;
                    wo.z = obj.z || 0;
                    wo.scaleX = obj.scaleX || 1;
                    wo.scaleY = obj.scaleY || 1;
                    wo.scaleZ = obj.scaleZ || 1;
                    wo.rotationY = obj.rotationY || 0;
                    wo.rotationX = obj.rotationX || 0;
                    wo.rotationZ = obj.rotationZ || 0;
                    wo.color = (obj.color || '#ffffff').startsWith('#') ? obj.color : '#' + obj.color;
                    this.state.worldObjects.set(wo.id, wo);
                }
                console.log(`[EDITOR] Загружено ${data.length} объектов из editor_objects.json`);
            }
        } catch (err) {
            console.error('[EDITOR] Ошибка загрузки editor_objects.json:', err);
        }

        // Загружаем зоны мобов (используем уже объявленные fs и path)
        try {
            const mobFilePath = path.join(__dirname, '../data/mob_zones.json');
            if (fs.existsSync(mobFilePath)) {
                const zones = JSON.parse(fs.readFileSync(mobFilePath, 'utf-8'));
                this.spawner.spawnMulti(zones);
                console.log(`[MOB] Загружено ${zones.length} зон мобов из mob_zones.json`);
            }
        } catch (err) {
            console.error('[MOB] Ошибка загрузки mob_zones.json:', err);
        }

        // Spawn initial skeletons from spawnZones
        this.spawner.spawnInitialSkeletons();
        console.log('[MOB] Скелеты загружены из skeletonSpawnZones');

        const terrain = new WorldTerrain();
        terrain.heightmapPath = "/textures/heightmap.png";
        terrain.width = 2048;
        terrain.depth = 2048;
        terrain.segments = 128;
        terrain.maxHeight = 200; // подбери под свою картинку
        this.state.terrain = terrain;

        // Создаём тестового NPC – рыцаря
        const knight = new NPC();
        knight.id = "knight_01";
        knight.name = "Рыцарь";
        knight.x = 0;
        knight.z = -25;
        knight.y = 2;
        knight.availableQuestIds.push("kill_5_wolves", "kill_10_wolves");
        this.state.npcs.set(knight.id, knight);
        console.log(`[NPC] Рыцарь появился на (${knight.x}, ${knight.z})`);

        // Создаём банковский сундук
        const chest = new WorldObject();
        chest.id = "chest_01";
        chest.modelName = "chest";
        chest.x = 20;
        chest.z = -35;
        chest.y = 0;
        chest.scaleX = 1.5;
        chest.scaleY = 1;
        chest.scaleZ = 1.5;
        chest.color = "#8B4513";
        this.state.worldObjects.set(chest.id, chest);
        console.log(`[CHEST] Сундук появился на (${chest.x}, ${chest.z})`);

        // Создаём станции крафта
        const furnace = new WorldObject();
        furnace.id = "furnace_01";
        furnace.modelName = "furnace";
        furnace.x = 5;
        furnace.z = -35;
        furnace.y = 0;
        furnace.scaleX = 2;
        furnace.scaleY = 1.5;
        furnace.scaleZ = 2;
        furnace.color = "#8B0000";
        this.state.worldObjects.set(furnace.id, furnace);
        console.log(`[FURNACE] Печь появилась на (${furnace.x}, ${furnace.z})`);

        const anvil = new WorldObject();
        anvil.id = "anvil_01";
        anvil.modelName = "anvil";
        anvil.x = 10;
        anvil.z = -35;
        anvil.y = 0;
        anvil.scaleX = 1;
        anvil.scaleY = 0.8;
        anvil.scaleZ = 1;
        anvil.color = "#444444";
        this.state.worldObjects.set(anvil.id, anvil);
        console.log(`[ANVIL] Наковальня появилась на (${anvil.x}, ${anvil.z})`);


        // ===== DEBUG: God mode toggle =====
        this.onMessage("setGodMode", (client, message: { enabled: boolean }) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                player.godMode = message.enabled;
                console.log(`[GOD] ${player.name} godMode = ${message.enabled}`);
            }
        });

        this.onMessage("gatherResource", (client, message: { nodeId: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.hp <= 0) return;

            const node = this.state.resourceNodes.get(message.nodeId);
            if (!node) return;

            // Проверка дистанции
            const dx = player.x - node.x;
            const dz = player.z - node.z;
            if (Math.sqrt(dx*dx + dz*dz) > 4) return;

            // Проверка состояния
            if (node.state !== "active") return;

            // Проверка уровня профессии
            const miningLevel = player.professions.mining.level;
            if (miningLevel < node.minMiningLevel) return;

            // Генерируем предмет
            const item = itemDatabase[node.type];
            if (!item) return;

            const bonusChance = Math.min(0.5, (miningLevel - node.minMiningLevel) * 0.03);
            const bonus = Math.random() < bonusChance ? 1 : 0;
            const quantity = 1 + bonus;
            const success = player.inventory.addItem(Object.assign(new Item(), item), quantity);
            if (!success) {
                client.send("notification", { text: "Инвентарь полон!", color: "#ff4444" });
                return;
            }

            // XP
            const baseXp = node.baseXpReward;
            const levelBonus = Math.floor(baseXp * 0.1 * Math.max(0, miningLevel - node.minMiningLevel));
            const totalXp = baseXp + levelBonus;
            player.professions.mining.addXp(totalXp);

            // Деактивируем ноду
            this.resourceSpawner.markNodeDepleted(node);

            console.log(`[GATHER] ${player.name} добыл ${item.name} x${quantity} (Mining lvl ${miningLevel}, +${totalXp} XP)`);
            PlayerPersistence.savePlayer(player);

            client.send("gatherResult", {
                nodeId: node.id,
                itemId: node.type,
                quantity: quantity,
                xpGained: totalXp,
                profession: "mining",
            });
        });

        // ---------- Admin handlers ----------

        this.onMessage("adminAddXp", (client, message: { profession: string, amount: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.hp <= 0) return;

            const prof = player.professions as any;
            const entry = prof[message.profession];
            if (!entry || typeof entry.addXp !== 'function') return;

            entry.addXp(message.amount);
            PlayerPersistence.savePlayer(player);

            client.send("adminXpResult", {
                profession: message.profession,
                level: entry.level,
                xp: entry.xp,
                xpToNext: entry.xpToNext,
            });
        });

        this.onMessage("adminAddItem", (client, message: { itemId: string, quantity: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.hp <= 0) return;

            const template = itemDatabase[message.itemId];
            if (!template) return;

            const item = Object.assign(new Item(), template);
            const success = player.inventory.addItem(item, message.quantity);
            if (!success) {
                client.send("notification", { text: "Инвентарь полон!", color: "#ff4444" });
                return;
            }

            PlayerPersistence.savePlayer(player);
            client.send("adminItemResult", {
                itemId: message.itemId,
                name: template.name,
                quantity: message.quantity,
            });
        });

        // ---------- Crafting handlers ----------

        this.onMessage("getStationRecipes", (client, message: { stationType: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;

            const { stationType } = message;
            const stationRecipes = recipes.filter(r => r.stationType === stationType);

            // Вычисляем доступность каждого рецепта
            const bsLevel = player.professions.blacksmithing.level;
            const result = stationRecipes.map(r => {
                const hasLevel = bsLevel >= r.requiredLevel;
                const hasIngredients: Record<string, boolean> = {};
                let allIngredientsMet = true;

                for (const inp of r.inputs) {
                    let totalQty = 0;
                    for (const slot of player.inventory.slots) {
                        if (slot.item && slot.item.id === inp.itemId) {
                            totalQty += slot.quantity;
                        }
                    }
                    hasIngredients[inp.itemId] = totalQty >= inp.quantity;
                    if (totalQty < inp.quantity) allIngredientsMet = false;
                }

                const actualSuccessChance = computeSuccessChance(r.baseSuccessChance, bsLevel, r.requiredLevel);
                const actualBonusChance = computeBonusChance(r.bonusChance, bsLevel, r.requiredLevel);

                return {
                    id: r.id,
                    name: r.name,
                    stationType: r.stationType,
                    requiredLevel: r.requiredLevel,
                    xpReward: r.xpReward,
                    inputs: r.inputs,
                    output: r.output,
                    bonusChance: r.bonusChance,
                    hasLevel,
                    hasIngredients,
                    canCraft: hasLevel && allIngredientsMet,
                    successChance: actualSuccessChance,
                    bonusChanceActual: actualBonusChance,
                };
            });

            client.send("stationRecipes", { stationType, recipes: result });
        });

        this.onMessage("craftRecipe", (client, message: { stationType: string, recipeId: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.hp <= 0) return;

            const recipe = recipes.find(r => r.id === message.recipeId);
            if (!recipe) return;

            // Проверка дистанции до станции
            let stationFound = false;
            this.state.worldObjects.forEach((wo: any) => {
                const isTarget = (recipe.stationType === 'furnace' && wo.modelName === 'furnace') ||
                                 (recipe.stationType === 'anvil' && wo.modelName === 'anvil');
                if (isTarget) {
                    const dx = player.x - wo.x;
                    const dz = player.z - wo.z;
                    if (Math.sqrt(dx*dx + dz*dz) <= 4) stationFound = true;
                }
            });
            if (!stationFound) return;

            // Проверка уровня профессии
            if (player.professions.blacksmithing.level < recipe.requiredLevel) return;

            // Проверка и списание ингредиентов
            for (const inp of recipe.inputs) {
                let remaining = inp.quantity;
                for (let i = 0; i < player.inventory.slots.length && remaining > 0; i++) {
                    const slot = player.inventory.slots[i];
                    if (slot.item && slot.item.id === inp.itemId) {
                        const toRemove = Math.min(slot.quantity, remaining);
                        player.inventory.removeItem(i, toRemove);
                        remaining -= toRemove;
                    }
                }
                if (remaining > 0) return; // не хватило — откат
            }

            // Проверка успеха крафта
            const bsLevel = player.professions.blacksmithing.level;
            const successChance = computeSuccessChance(recipe.baseSuccessChance, bsLevel, recipe.requiredLevel);
            const craftSucceeded = Math.random() < successChance;

            if (!craftSucceeded) {
                console.log(`[CRAFT] ${player.name} НЕУДАЧА: ${recipe.name} (шанс ${Math.round(successChance*100)}%)`);
                PlayerPersistence.savePlayer(player);
                client.send("craftResult", {
                    recipeId: recipe.id,
                    stationType: recipe.stationType,
                    success: false,
                    successChance,
                    outputItem: null,
                    quantity: 0,
                    xpGained: 0,
                });
                return;
            }

            // Создание результата
            const outputItem = itemDatabase[recipe.output.itemId];
            if (!outputItem) return;

            const baseQuantity = recipe.output.quantity;
            const actualBonusChance = computeBonusChance(recipe.bonusChance, bsLevel, recipe.requiredLevel);
            const bonusRoll = Math.random() < actualBonusChance ? 1 : 0;
            const totalQuantity = baseQuantity + bonusRoll;

            const success = player.inventory.addItem(Object.assign(new Item(), outputItem), totalQuantity);
            if (!success) {
                client.send("notification", { text: "Инвентарь полон!" });
                return;
            }

            // XP
            player.professions.blacksmithing.addXp(recipe.xpReward);

            console.log(`[CRAFT] ${player.name} создал ${outputItem.name} x${totalQuantity} (BS lvl ${bsLevel}, сшанс ${Math.round(successChance*100)}%, бонус ${Math.round(actualBonusChance*100)}%)`);
            PlayerPersistence.savePlayer(player);

            client.send("craftResult", {
                recipeId: recipe.id,
                stationType: recipe.stationType,
                success: true,
                successChance,
                outputItem: outputItem.toJSON(),
                quantity: totalQuantity,
                xpGained: recipe.xpReward,
            });
        });

        this.onMessage("attackMob", (client, message) => {
            const attacker = this.state.players.get(client.sessionId);
            if (!attacker || attacker.hp <= 0) return;

            const mobId = message.mobId;
            const mob = this.state.mobs.get(mobId);
            if (!mob || mob.hp <= 0) return;

            const dx = attacker.x - mob.x;
            const dz = attacker.z - mob.z;
            if (Math.sqrt(dx*dx + dz*dz) > 4) return;

            const attackType: string = message.attackType || 'normal';
            const holdDuration: number = message.holdDuration || 0;

            // Calculate damage multiplier based on attack type
            let damageMultiplier = 1.0;
            let isCrit = false;

            switch (attackType) {
                case 'heavy':
                    damageMultiplier = 1.0 + Math.min(holdDuration, 1000) / 2000 * 0.5;
                    break;
                case 'shift':
                    damageMultiplier = 1.2;
                    isCrit = Math.random() < 0.25;
                    break;
                default:
                    damageMultiplier = 1.0;
                    break;
            }

            let baseDamage = Math.max(1, Math.floor(attacker.stats.attackPower * 0.5));
            let damage = Math.floor(baseDamage * damageMultiplier);
            if (isCrit) {
                damage = Math.floor(damage * 1.5);
                console.log(`[CRIT] ${attacker.name} критически ударил волка ${mobId}!`);
            }
            mob.hp -= damage;
            console.log(`[ATTACK] ${attacker.name} ударил волка ${mobId} на ${damage} урона (${attackType}, AP: ${attacker.stats.attackPower})`);

            // Send damage feedback to the attacker
            const mobDisplayName = mob.mobType === 'skeleton' ? 'Скелет' : 'Волк';
            client.send("attackResult", {
                targetName: mobDisplayName,
                damage: damage,
                attackType: attackType,
                isCrit: isCrit,
                targetX: mob.x,
                targetZ: mob.z
            });

            // Skeleton uses its own take_damage animation
            if (mob.mobType === 'skeleton') {
                mob.state = 'take_damage';
            } else {
                const hitAnim = Math.random() < 0.5 ? 'idle_hitreact1' : 'idle_hitreact2';
                mob.state = hitAnim;
            }
            mob.targetId = client.sessionId;

            if (mob.hp <= 0) {
                this.spawner.onMobDied(mobId, client.sessionId);
            }
        });

        // Игровой цикл мобов (каждые 250 мс)
        const intervalTimer = setInterval(() => {
            this.state.mobs.forEach((mob, mobId) => {
                if (mob.hp <= 0) return;

                const isSkeleton = mob.mobType === 'skeleton';

                // Skeleton-specific stats
                const SKELETON_DETECT_RANGE = 18;
                const SKELETON_MELEE_RANGE = 3.0;
                const SKELETON_RANGED_RANGE = 10;
                const SKELETON_RUN_SPEED = 4.0;
                const SKELETON_ATTACK_DMG = 15;
                const SKELETON_ATTACK_COOLDOWN = 4000;

                const WOLF_DETECT_RANGE = 12;
                const WOLF_ATTACK_RANGE = 3.0;
                const WOLF_WALK_SPEED = 2.5;
                const WOLF_RUN_SPEED = 4.0;
                const WOLF_ATTACK_DMG = 10;
                const WOLF_ATTACK_COOLDOWN = 1500;

                const detectRange = isSkeleton ? SKELETON_DETECT_RANGE : WOLF_DETECT_RANGE;

                // Find closest living player
                let closestPlayer: Player | null = null;
                let closestDist = detectRange;
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

                    if (isSkeleton) {
                        // === SKELETON AI ===
                        const canAttack = target.hp > 0 && !target.godMode;
                        // Was already in combat (has attacked before, within last 10s)
                        const wasInCombat = !!mob.lastAttackTime && (Date.now() - mob.lastAttackTime < 10000);

                        // 1. MELEE - target within striking distance
                        if (dist <= SKELETON_MELEE_RANGE && canAttack) {
                            // Rotate to face the target
                            const targetAngle = Math.atan2(target.z - mob.z, target.x - mob.x);
                            let diff = targetAngle - mob.rotationY;
                            while (diff > Math.PI) diff -= 2 * Math.PI;
                            while (diff < -Math.PI) diff += 2 * Math.PI;
                            mob.rotationY += diff * 0.5;

                            mob.state = 'idle';
                            if (!mob.lastAttackTime || Date.now() - mob.lastAttackTime > SKELETON_ATTACK_COOLDOWN) {
                                const attackVariant = Math.random();
                                if (attackVariant < 0.4) {
                                    mob.state = 'slash01';
                                } else if (attackVariant < 0.7) {
                                    mob.state = 'slash02';
                                } else {
                                    mob.state = 'stab';
                                }
                                target.hp -= SKELETON_ATTACK_DMG;
                                mob.lastAttackTime = Date.now();
                                this.broadcast("mobAttackAnim", { mobId });
                            }
                        }
                        // 2. PURSUIT RANGED - was fighting in melee, now player is fleeing
                        // Skeleton throws bone at the running player (pursuit scenario)
                        else if (wasInCombat && dist > SKELETON_MELEE_RANGE && dist <= SKELETON_RANGED_RANGE && canAttack) {
                            // Rotate to face the target
                            const targetAngle = Math.atan2(target.z - mob.z, target.x - mob.x);
                            let diff = targetAngle - mob.rotationY;
                            while (diff > Math.PI) diff -= 2 * Math.PI;
                            while (diff < -Math.PI) diff += 2 * Math.PI;
                            mob.rotationY += diff * 0.5;

                            mob.state = 'idle';
                            if (!mob.lastAttackTime || Date.now() - mob.lastAttackTime > SKELETON_ATTACK_COOLDOWN * 0.7) {
                                mob.state = 'throw_projectiles';
                                target.hp -= Math.floor(SKELETON_ATTACK_DMG * 0.7);
                                mob.lastAttackTime = Date.now();
                                // Broadcast target position so client can aim projectile at actual player location
                                this.broadcast("mobAttackAnim", { mobId, targetX: target.x, targetZ: target.z });
                            }
                        }
                        // 3. APPROACH - always RUN towards target
                        else {
                            mob.state = 'run_forward';
                            const step = Math.min(SKELETON_RUN_SPEED * 0.25, dist);
                            const desiredDX = (dx / dist) * step;
                            const desiredDZ = (dz / dist) * step;

                            const newPos = applyMobMovementWithCollisions(mob.x, mob.z, desiredDX, desiredDZ, 0.5);
                            mob.x = newPos.x;
                            mob.z = newPos.z;

                            const targetAngle = Math.atan2(target.z - mob.z, target.x - mob.x);
                            let diff = targetAngle - mob.rotationY;
                            while (diff > Math.PI) diff -= 2 * Math.PI;
                            while (diff < -Math.PI) diff += 2 * Math.PI;
                            mob.rotationY += diff * 0.25;
                        }
                    } else {
                        // === WOLF AI (original) ===
                        if (dist > 4.0) {
                            mob.state = 'gallop';
                        } else {
                            mob.state = 'walk';
                        }

                        if (dist <= 5 && dist > 4 && mob.state !== 'gallop_jump') {
                            mob.state = 'gallop_jump';
                        }

                        if (dist <= WOLF_ATTACK_RANGE && target.hp > 0 && !target.godMode) {
                            // Rotate to face the target
                            const wolfTargetAngle = Math.atan2(target.z - mob.z, target.x - mob.x);
                            let wolfDiff = wolfTargetAngle - mob.rotationY;
                            while (wolfDiff > Math.PI) wolfDiff -= 2 * Math.PI;
                            while (wolfDiff < -Math.PI) wolfDiff += 2 * Math.PI;
                            mob.rotationY += wolfDiff * 0.5;

                            mob.state = 'attack';
                            if (!mob.lastAttackTime || Date.now() - mob.lastAttackTime > WOLF_ATTACK_COOLDOWN) {
                                target.hp -= WOLF_ATTACK_DMG;
                                mob.lastAttackTime = Date.now();
                                this.broadcast("mobAttackAnim", { mobId });
                            }
                        } else {
                            const speed = mob.state === 'gallop' ? WOLF_RUN_SPEED : WOLF_WALK_SPEED;
                            const step = Math.min(speed * 0.25, dist);
                            const desiredDX = (dx / dist) * step;
                            const desiredDZ = (dz / dist) * step;

                            const newPos = applyMobMovementWithCollisions(mob.x, mob.z, desiredDX, desiredDZ, 0.6);
                            mob.x = newPos.x;
                            mob.z = newPos.z;

                            const targetAngle = Math.atan2(target.z - mob.z, target.x - mob.x);
                            let diff = targetAngle - mob.rotationY;
                            while (diff > Math.PI) diff -= 2 * Math.PI;
                            while (diff < -Math.PI) diff += 2 * Math.PI;
                            mob.rotationY += diff * 0.3;
                        }
                    }

                    // Check player death from mob attack
                    if (target.hp <= 0) {
                        const mobName = isSkeleton ? 'скелетом' : 'волком';
                        console.log(`[DEATH] ${target.name} убит ${mobName}. Возрождение через 5 сек.`);
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
                } else {
                    // No player detected — patrol
                    // Patrol state machine using idleTimer as a countdown in ticks (250ms each)
                    // Cycle: first IDLE phase (standing), then WALK phase (moving), then reset
                    const PATROL_IDLE_DURATION = 16;  // ~4 seconds standing (16 * 250ms)
                    const PATROL_WALK_DURATION = 8;   // ~2 seconds walking (8 * 250ms)
                    const PATROL_CYCLE = PATROL_IDLE_DURATION + PATROL_WALK_DURATION; // 24 ticks = 6s total

                    mob.idleTimer -= 1;
                    if (mob.idleTimer <= 0) {
                        // Start a new patrol cycle
                        mob.patrolAngle = Math.random() * Math.PI * 2;
                        mob.idleTimer = PATROL_CYCLE;
                    }

                    if (mob.idleTimer > PATROL_IDLE_DURATION) {
                        // WALK phase (last PATROL_WALK_DURATION ticks of the cycle)
                        const patrolSpeed = isSkeleton ? 0.8 : 1.2;
                        mob.state = isSkeleton ? 'walk_forward' : 'walk';
                        const desiredDX = Math.cos(mob.patrolAngle) * patrolSpeed * 0.5;
                        const desiredDZ = Math.sin(mob.patrolAngle) * patrolSpeed * 0.5;

                        const oldX = mob.x;
                        const oldZ = mob.z;
                        const newPos = applyMobMovementWithCollisions(mob.x, mob.z, desiredDX, desiredDZ, isSkeleton ? 0.5 : 0.6);
                        mob.x = newPos.x;
                        mob.z = newPos.z;

                        const moved = (newPos.x !== oldX || newPos.z !== oldZ);
                        if (moved) {
                            let diff = mob.patrolAngle - mob.rotationY;
                            while (diff > Math.PI) diff -= 2 * Math.PI;
                            while (diff < -Math.PI) diff += 2 * Math.PI;
                            mob.rotationY += diff * 0.2;
                        }
                    } else {
                        // IDLE phase (first PATROL_IDLE_DURATION ticks of the cycle)
                        if (isSkeleton) {
                            mob.state = 'idle';
                        } else {
                            const r = Math.random();
                            if (r < 0.3) {
                                mob.state = 'idle_2';
                            } else if (r < 0.6) {
                                mob.state = 'idle_2_headlow';
                            } else {
                                mob.state = 'idle';
                            }
                        }
                        mob.rotationY += (Math.random() - 0.5) * 0.1;
                    }
                }
            });
        }, 250);
        this.addTimer(intervalTimer);

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
            if (!item.slot) return;

            if (item.requiredLevel > player.level) {
                client.send("notification", { text: `Требуется уровень ${item.requiredLevel}`, color: "#ff4444" });
                return;
            }

            const success = EquipmentSystem.equipItem(player, item, slotIndex);
            if (!success) {
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

        // ---------- Drag & Drop handlers ----------

        this.onMessage("moveItem", (client, message: { fromSlotIndex: number, toSlotIndex: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.hp <= 0) return;
            const { fromSlotIndex, toSlotIndex } = message;
            if (fromSlotIndex === toSlotIndex) return;
            if (fromSlotIndex < 0 || fromSlotIndex >= player.inventory.slots.length) return;
            if (toSlotIndex < 0 || toSlotIndex >= player.inventory.slots.length) return;
            const fromSlot = player.inventory.slots[fromSlotIndex];
            const toSlot = player.inventory.slots[toSlotIndex];
            if (!fromSlot.item) return;
            // If same item type, try to stack first
            if (toSlot.item && fromSlot.item && toSlot.item.id === fromSlot.item.id) {
                const maxStack = toSlot.item.maxStack;
                const canAdd = maxStack - toSlot.quantity;
                if (canAdd > 0) {
                    const toMove = Math.min(fromSlot.quantity, canAdd);
                    toSlot.quantity += toMove;
                    fromSlot.quantity -= toMove;
                    if (fromSlot.quantity <= 0) {
                        fromSlot.item = null;
                        fromSlot.quantity = 0;
                    }
                    PlayerPersistence.savePlayer(player);
                    return;
                }
            }
            // Otherwise swap items between slots
            const tempItem = toSlot.item;
            const tempQty = toSlot.quantity;
            toSlot.item = fromSlot.item;
            toSlot.quantity = fromSlot.quantity;
            fromSlot.item = tempItem;
            fromSlot.quantity = tempQty;
            PlayerPersistence.savePlayer(player);
        });

        this.onMessage("dropItem", (client, message: { slotIndex: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.hp <= 0) return;
            const { slotIndex } = message;
            const slot = player.inventory.slots[slotIndex];
            if (!slot || !slot.item) return;
            const item = slot.item.cloneItem();
            const quantity = slot.quantity;
            // Remove from inventory
            player.inventory.removeItem(slotIndex, quantity);
            // Create loot bag at player position
            const bagId = `loot_drop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            const bag = new LootBag(bagId, player.x, player.z, player.x, player.z, [{ item, quantity }]);
            this.state.lootBags.set(bagId, bag);
            // Cleanup bag after 30 seconds
            setTimeout(() => {
                this.state.lootBags.delete(bagId);
            }, 30000);
            PlayerPersistence.savePlayer(player);
        });

        this.onMessage("equipItemToSlot", (client, message: { slotIndex: number, targetSlot: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.hp <= 0) return;
            const { slotIndex, targetSlot } = message;
            const slot = player.inventory.slots[slotIndex];
            if (!slot || !slot.item) return;
            const item = slot.item;
            if (item.slot !== targetSlot) return;
            if (item.requiredLevel > player.level) {
                client.send("notification", { text: `Требуется уровень ${item.requiredLevel}`, color: "#ff4444" });
                return;
            }
            const success = EquipmentSystem.equipItem(player, item, slotIndex);
            if (success) PlayerPersistence.savePlayer(player);
        });

        this.onMessage("unequipToSlot", (client, message: { slot: string, toSlotIndex: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.hp <= 0) return;
            const { slot, toSlotIndex } = message;
            const item = player.equipment.get(slot);
            if (!item) return;
            const destSlot = player.inventory.slots[toSlotIndex];
            if (!destSlot) return;
            // If destination has same item, stack instead
            if (destSlot.item && destSlot.item.id === item.id) {
                const maxStack = destSlot.item.maxStack;
                const canAdd = maxStack - destSlot.quantity;
                if (canAdd > 0) {
                    EquipmentSystem.applyBonuses(player.stats, item.bonuses, -1);
                    player.equipment.delete(slot);
                    destSlot.quantity = Math.min(destSlot.quantity + 1, maxStack);
                    EquipmentSystem.recalculateStats(player);
                    PlayerPersistence.savePlayer(player);
                    return;
                }
            }
            // Must be empty if different item
            if (destSlot.item) return;
            // Manually unequip: remove bonuses, delete from equipment, place in target slot
            EquipmentSystem.applyBonuses(player.stats, item.bonuses, -1);
            player.equipment.delete(slot);
            destSlot.item = item;
            destSlot.quantity = 1;
            EquipmentSystem.recalculateStats(player);
            PlayerPersistence.savePlayer(player);
        });

        this.onMessage("splitItem", (client, message: { fromSlotIndex: number, quantity: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.hp <= 0) return;
            const { fromSlotIndex, quantity } = message;
            if (fromSlotIndex < 0 || fromSlotIndex >= player.inventory.slots.length) return;
            const fromSlot = player.inventory.slots[fromSlotIndex];
            if (!fromSlot || !fromSlot.item) return;
            if (fromSlot.quantity <= quantity || quantity <= 0) return; // must leave at least 1
            // Find first empty slot
            for (let i = 0; i < player.inventory.slots.length; i++) {
                if (i === fromSlotIndex) continue;
                const slot = player.inventory.slots[i];
                if (!slot.item) {
                    slot.item = fromSlot.item.cloneItem();
                    slot.quantity = quantity;
                    fromSlot.quantity -= quantity;
                    PlayerPersistence.savePlayer(player);
                    return;
                }
            }
        });

        this.onMessage("splitBankItem", (client, message: { fromBankSlotIndex: number, quantity: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.hp <= 0) return;
            const { fromBankSlotIndex, quantity } = message;
            if (fromBankSlotIndex < 0 || fromBankSlotIndex >= player.bank.slots.length) return;
            const fromSlot = player.bank.slots[fromBankSlotIndex];
            if (!fromSlot || !fromSlot.item) return;
            if (fromSlot.quantity <= quantity || quantity <= 0) return;
            for (let i = 0; i < player.bank.slots.length; i++) {
                if (i === fromBankSlotIndex) continue;
                const slot = player.bank.slots[i];
                if (!slot.item) {
                    slot.item = fromSlot.item.cloneItem();
                    slot.quantity = quantity;
                    fromSlot.quantity -= quantity;
                    PlayerPersistence.savePlayer(player);
                    return;
                }
            }
        });

        // ---------- Bank handlers ----------

        this.onMessage("depositItem", (client, message: { fromSlotIndex: number, toBankSlotIndex: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.hp <= 0) return;
            const { fromSlotIndex, toBankSlotIndex } = message;
            if (fromSlotIndex < 0 || fromSlotIndex >= player.inventory.slots.length) return;
            if (toBankSlotIndex < 0 || toBankSlotIndex >= player.bank.slots.length) return;

            const fromSlot = player.inventory.slots[fromSlotIndex];
            if (!fromSlot || !fromSlot.item) return;

            const toSlot = player.bank.slots[toBankSlotIndex];

            // Если в банке тот же предмет — стакаем
            if (toSlot.item && toSlot.item.id === fromSlot.item.id) {
                const canAdd = toSlot.item.maxStack - toSlot.quantity;
                if (canAdd > 0) {
                    const toMove = Math.min(fromSlot.quantity, canAdd);
                    toSlot.quantity += toMove;
                    fromSlot.quantity -= toMove;
                    if (fromSlot.quantity <= 0) { fromSlot.item = null; fromSlot.quantity = 0; }
                    PlayerPersistence.savePlayer(player);
                    return;
                }
            }

            // Если слот банка пуст — кладём
            if (!toSlot.item) {
                toSlot.item = fromSlot.item;
                toSlot.quantity = fromSlot.quantity;
                fromSlot.item = null;
                fromSlot.quantity = 0;
                PlayerPersistence.savePlayer(player);
                return;
            }

            // Если занят другим предметом — меняем местами
            const tempItem = toSlot.item;
            const tempQty = toSlot.quantity;
            toSlot.item = fromSlot.item;
            toSlot.quantity = fromSlot.quantity;
            fromSlot.item = tempItem;
            fromSlot.quantity = tempQty;
            PlayerPersistence.savePlayer(player);
        });

        this.onMessage("withdrawItem", (client, message: { fromBankSlotIndex: number, toSlotIndex: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.hp <= 0) return;
            const { fromBankSlotIndex, toSlotIndex } = message;
            if (fromBankSlotIndex < 0 || fromBankSlotIndex >= player.bank.slots.length) return;
            if (toSlotIndex < 0 || toSlotIndex >= player.inventory.slots.length) return;

            const fromSlot = player.bank.slots[fromBankSlotIndex];
            if (!fromSlot || !fromSlot.item) return;

            const toSlot = player.inventory.slots[toSlotIndex];

            // Стакаем с тем же предметом в инвентаре
            if (toSlot.item && toSlot.item.id === fromSlot.item.id) {
                const canAdd = toSlot.item.maxStack - toSlot.quantity;
                if (canAdd > 0) {
                    const toMove = Math.min(fromSlot.quantity, canAdd);
                    toSlot.quantity += toMove;
                    fromSlot.quantity -= toMove;
                    if (fromSlot.quantity <= 0) { fromSlot.item = null; fromSlot.quantity = 0; }
                    PlayerPersistence.savePlayer(player);
                    return;
                }
            }

            // Пустой слот инвентаря
            if (!toSlot.item) {
                toSlot.item = fromSlot.item;
                toSlot.quantity = fromSlot.quantity;
                fromSlot.item = null;
                fromSlot.quantity = 0;
                PlayerPersistence.savePlayer(player);
                return;
            }

            // Обмен
            const tempItem = toSlot.item;
            const tempQty = toSlot.quantity;
            toSlot.item = fromSlot.item;
            toSlot.quantity = fromSlot.quantity;
            fromSlot.item = tempItem;
            fromSlot.quantity = tempQty;
            PlayerPersistence.savePlayer(player);
        });

        this.onMessage("moveBankItem", (client, message: { fromBankSlotIndex: number, toBankSlotIndex: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.hp <= 0) return;
            const { fromBankSlotIndex, toBankSlotIndex } = message;
            if (fromBankSlotIndex === toBankSlotIndex) return;
            if (fromBankSlotIndex < 0 || fromBankSlotIndex >= player.bank.slots.length) return;
            if (toBankSlotIndex < 0 || toBankSlotIndex >= player.bank.slots.length) return;

            const fromSlot = player.bank.slots[fromBankSlotIndex];
            const toSlot = player.bank.slots[toBankSlotIndex];
            if (!fromSlot.item) return;

            if (toSlot.item && toSlot.item.id === fromSlot.item.id) {
                const canAdd = toSlot.item.maxStack - toSlot.quantity;
                if (canAdd > 0) {
                    const toMove = Math.min(fromSlot.quantity, canAdd);
                    toSlot.quantity += toMove;
                    fromSlot.quantity -= toMove;
                    if (fromSlot.quantity <= 0) { fromSlot.item = null; fromSlot.quantity = 0; }
                    PlayerPersistence.savePlayer(player);
                    return;
                }
            }

            const tempItem = toSlot.item;
            const tempQty = toSlot.quantity;
            toSlot.item = fromSlot.item;
            toSlot.quantity = fromSlot.quantity;
            fromSlot.item = tempItem;
            fromSlot.quantity = tempQty;
            PlayerPersistence.savePlayer(player);
        });

        this.onMessage("quickTransfer", (client, message: { fromType: string, slotIndex: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.hp <= 0) return;

            const { fromType, slotIndex } = message;

            if (fromType === 'inventory') {
                const fromSlot = player.inventory.slots[slotIndex];
                if (!fromSlot || !fromSlot.item) return;

                // Find best bank slot (stack first, then empty)
                const target = player.bank;
                let bestIdx = -1;
                for (let i = 0; i < target.slots.length; i++) {
                    const s = target.slots[i];
                    if (s.item && s.item.id === fromSlot.item.id && s.quantity < s.item.maxStack) {
                        const toMove = Math.min(fromSlot.quantity, s.item.maxStack - s.quantity);
                        s.quantity += toMove;
                        fromSlot.quantity -= toMove;
                        if (fromSlot.quantity <= 0) { fromSlot.item = null; fromSlot.quantity = 0; }
                        PlayerPersistence.savePlayer(player);
                        return;
                    }
                    if (!s.item && bestIdx < 0) bestIdx = i;
                }
                if (bestIdx >= 0) {
                    const toSlot = target.slots[bestIdx];
                    toSlot.item = fromSlot.item;
                    toSlot.quantity = fromSlot.quantity;
                    fromSlot.item = null;
                    fromSlot.quantity = 0;
                    PlayerPersistence.savePlayer(player);
                    return;
                }
                client.send("notification", { text: "Банк полон!", color: "#ff4444" });
                return;
            }

            if (fromType === 'bank') {
                const fromSlot = player.bank.slots[slotIndex];
                if (!fromSlot || !fromSlot.item) return;

                const target = player.inventory;
                let bestIdx = -1;
                for (let i = 0; i < target.slots.length; i++) {
                    const s = target.slots[i];
                    if (s.item && s.item.id === fromSlot.item.id && s.quantity < s.item.maxStack) {
                        const toMove = Math.min(fromSlot.quantity, s.item.maxStack - s.quantity);
                        s.quantity += toMove;
                        fromSlot.quantity -= toMove;
                        if (fromSlot.quantity <= 0) { fromSlot.item = null; fromSlot.quantity = 0; }
                        PlayerPersistence.savePlayer(player);
                        return;
                    }
                    if (!s.item && bestIdx < 0) bestIdx = i;
                }
                if (bestIdx >= 0) {
                    const toSlot = target.slots[bestIdx];
                    toSlot.item = fromSlot.item;
                    toSlot.quantity = fromSlot.quantity;
                    fromSlot.item = null;
                    fromSlot.quantity = 0;
                    PlayerPersistence.savePlayer(player);
                    return;
                }
                client.send("notification", { text: "Инвентарь полон!", color: "#ff4444" });
                return;
            }
        });

        // ---------- Salvage (разбор предметов) ----------

        this.onMessage("salvageItem", (client, message: { slotIndex: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.hp <= 0) return;

            // Проверка дистанции до наковальни
            let nearAnvil = false;
            this.state.worldObjects.forEach((wo: any) => {
                if (wo.modelName === 'anvil') {
                    const dx = player.x - wo.x;
                    const dz = player.z - wo.z;
                    if (Math.sqrt(dx*dx + dz*dz) <= 4) nearAnvil = true;
                }
            });
            if (!nearAnvil) return;

            const slot = player.inventory.slots[message.slotIndex];
            if (!slot || !slot.item) return;

            const itemName = slot.item.name;
            const recipe = findRecipeByResult(slot.item.id);
            if (!recipe) {
                client.send("notification", { text: "Этот предмет нельзя разобрать", color: "#ffaa00" });
                return;
            }

            // Удаляем предмет из инвентаря
            const qtyToRemove = slot.quantity;
            player.inventory.removeItem(message.slotIndex, qtyToRemove);

            // Возврат 20-30% от стоимости крафта
            const rate = MIN_SALVAGE_RATE + Math.random() * (MAX_SALVAGE_RATE - MIN_SALVAGE_RATE);
            const returnedItems: { itemId: string; name: string; quantity: number }[] = [];

            for (const inp of recipe.inputs) {
                const template = itemDatabase[inp.itemId];
                if (!template) continue;
                const returnedQty = Math.max(1, Math.round(inp.quantity * rate));
                const item = Object.assign(new Item(), template);
                player.inventory.addItem(item, returnedQty);
                returnedItems.push({ itemId: inp.itemId, name: template.name, quantity: returnedQty });
            }

            // XP
            const salvageXp = Math.floor(recipe.xpReward * 0.3);
            player.professions.blacksmithing.addXp(salvageXp);

            console.log(`[SALVAGE] ${player.name} разобрал ${itemName} x${qtyToRemove}, получил ${returnedItems.map(i => `${i.name} x${i.quantity}`).join(', ')} (+${salvageXp} XP)`);
            PlayerPersistence.savePlayer(player);

            client.send("salvageResult", {
                itemName,
                returnedItems,
                salvageXp,
            });
        });

        this.onMessage("editorSave", (client, message: { objects: any[] }) => {
            console.log(`[SERVER-EDITOR] Получено объектов: ${message.objects.length}`);
            message.objects.forEach(o => console.log(`  id=${o.id}, x=${o.x}, z=${o.z}`));
            const fs = require('fs');
            const path = require('path');
            const filePath = path.join(__dirname, '../data/editor_objects.json');
            fs.writeFileSync(filePath, JSON.stringify(message.objects, null, 2));

            // Удаляем все editor_-объекты из стейта
            for (const id of this.state.worldObjects.keys()) {
                if (id.startsWith('editor_')) this.state.worldObjects.delete(id);
            }
            for (const obj of message.objects) {
                const wo = new WorldObject();
                wo.id = obj.id;
                wo.modelName = obj.modelName || 'cube';
                wo.x = obj.x || 0;
                wo.y = obj.y || 0;
                wo.z = obj.z || 0;
                wo.scaleX = obj.scaleX || 1;
                wo.scaleY = obj.scaleY || 1;
                wo.scaleZ = obj.scaleZ || 1;
                wo.rotationY = obj.rotationY || 0;
                wo.rotationX = obj.rotationX || 0;
                wo.rotationZ = obj.rotationZ || 0;
                wo.color = (obj.color || '#ffffff').startsWith('#') ? obj.color : '#' + obj.color;
                this.state.worldObjects.set(wo.id, wo);
            }
            console.log(`[EDITOR] Сохранено ${message.objects.length} объектов`);
        });
        
        this.onMessage("getVegetationZones", (client) => {
            try {
                const fs = require('fs');
                const path = require('path');
                const filePath = path.join(__dirname, '../data/vegetation_zones.json');
                if (fs.existsSync(filePath)) {
                    const zones = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                    client.send('vegetationZonesData', { zones });
                } else {
                    client.send('vegetationZonesData', { zones: [] });
                }
            } catch (err) {
                client.send('vegetationZonesData', { zones: [] });
            }
        });

        this.onMessage("getMobZones", (client) => {
            try {
                const filePath = path.join(__dirname, '../data/mob_zones.json');
                if (fs.existsSync(filePath)) {
                    const zones = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                    client.send('mobZonesData', { zones });
                } else {
                    client.send('mobZonesData', { zones: [] });
                }
            } catch (err) {
                client.send('mobZonesData', { zones: [] });
            }
        });

        this.onMessage("editorSaveMobZones", (client, message: { zones: any[] }) => {
            const mobFilePath = path.join(__dirname, '../data/mob_zones.json');
            fs.writeFileSync(mobFilePath, JSON.stringify(message.zones, null, 2));
            console.log(`[EDITOR] Сохранено ${message.zones.length} моб-зон`);

            this.spawner.respawnAll(message.zones);
        });

        // Обработчик сохранения ВСЕХ зон (кнопка «Сохранить»)
        this.onMessage("editorSaveVegetationZones", (client, message: { zones: any[] }) => {
            const fs = require('fs');
            const path = require('path');
            const filePath = path.join(__dirname, '../data/vegetation_zones.json');
            fs.writeFileSync(filePath, JSON.stringify(message.zones, null, 2));
            console.log(`[EDITOR] Сохранено ${message.zones.length} зон растительности`);
            if (this.vegetationSpawner) {
                this.vegetationSpawner.applyUpdatedZones(message.zones);
            }
        });

        this.onMessage("editorRegenerateVegetationChunk", (client, message: {
            zoneId: string;
            chunkIndex: number;
            totalChunks: number;
            objects: any[];
        }) => {
            const { zoneId, chunkIndex, totalChunks, objects } = message;

            // Создаём буфер для зоны, если ещё нет
            if (!this.chunkBuffer.has(zoneId)) {
                this.chunkBuffer.set(zoneId, { totalChunks, chunks: new Array(totalChunks).fill(undefined) });
            }
            const buffer = this.chunkBuffer.get(zoneId)!;

            // Сохраняем чанк
            buffer.chunks[chunkIndex] = objects;

            // Проверяем, все ли чанки получены
            if (buffer.chunks.every(c => c !== undefined)) {
                // Собираем полный массив
                const allObjects = buffer.chunks.flat();
                // Применяем одним вызовом
                if (this.vegetationSpawner) {
                    this.vegetationSpawner.regenerateSingleZoneFromClient(zoneId, allObjects);
                }
                // Удаляем отработанный буфер
                this.chunkBuffer.delete(zoneId);
                console.log(`[EDITOR] Зона "${zoneId}" обновлена (всего ${allObjects.length} объектов)`);
            }
        });

        this.onMessage("getResourceNodes", (client) => {
            const nodes: { id: string; type: string; x: number; z: number; rotationY: number }[] = [];
            this.state.resourceNodes.forEach((node, id) => {
                nodes.push({ id, type: node.type, x: node.x, z: node.z, rotationY: node.rotationY });
            });
            client.send('resourceNodesData', { nodes });
        });

        this.onMessage("editorSaveResourceNodes", (client, message: { nodes: { id: string; type: string; x: number; z: number; rotationY?: number }[] }) => {
            console.log(`[EDITOR] Сохранение ${message.nodes.length} рудных жил`);
            if (this.resourceSpawner) {
                this.resourceSpawner.replaceAllNodes(message.nodes);
            }
        });

        console.log("Комната 'world' создана");
        
    }

    onDispose() {
        for (const timer of this.timers) {
            clearTimeout(timer);
            clearInterval(timer);
        }
        this.timers = [];
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
                player.expToLevel = Math.floor(100 * Math.pow(1.5, player.level - 1));
                player.hp = savedData.hp;

                player.stats.strength = savedData.stats.strength;
                player.stats.dexterity = savedData.stats.dexterity;
                player.stats.intelligence = savedData.stats.intelligence;
                player.stats.vitality = savedData.stats.vitality;
                player.stats.luck = savedData.stats.luck;

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

                // Восстанавливаем профессии
                if (savedData && savedData.professions) {
                    player.professions = ProfessionsData.fromJSON(savedData.professions);
                }

                // Восстанавливаем банк
                if (savedData && savedData.bank) {
                    player.bank.slots.clear();
                    savedData.bank.forEach(slot => {
                        player.bank.slots.push(slot.cloneSlot());
                    });
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
            player.expToLevel = Math.floor(player.expToLevel * 1.5);

            console.log(`[LEVEL UP] ${player.name} теперь ${player.level} уровня!`);
            // Можно отправить отдельное сообщение клиенту для спецэффекта
            // this.broadcast("levelUp", { sessionId: client.sessionId, level: player.level });
        }
        EquipmentSystem.recalculateStats(player);
        // Сохраняем прогресс после получения опыта
        PlayerPersistence.savePlayer(player);
    }
}