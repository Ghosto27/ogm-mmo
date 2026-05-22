import { Mob } from "./Mob";
import type { MyRoom } from "./MyRoom";
import { LootBag } from "./schemas/LootBag";
import { Item } from "./models/Item";
import { ItemSlot } from "./models/ItemSlot";
import { itemDatabase } from "./data/items";
import { QuestManager } from "./systems/QuestManager";
import { PlayerPersistence } from "./systems/PlayerPersistence";
import { wolfSpawnZones, skeletonSpawnZones } from "./data/spawnZones";

const RESPAWN_DELAY = 10_000;      // 10 seconds

interface MobConfig {
    hp: number;
    maxHp: number;
    level: number;
    expReward: number;
}

const mobConfigs: { [key: string]: MobConfig } = {
    wolf: {
        hp: 100,
        maxHp: 100,
        level: 1,
        expReward: 50,
    },
    skeleton: {
        hp: 150,
        maxHp: 150,
        level: 3,
        expReward: 80,
    },
};

export class MobSpawner {
    private room: MyRoom;
    private mobCount = 0;

    constructor(room: MyRoom) {
        this.room = room;
    }

    /** Spawn a single mob of given type in the specified zone */
    private spawnOneInZone(zoneIndex: number, mobType: string = 'wolf') {
        const zones = mobType === 'skeleton' ? skeletonSpawnZones : wolfSpawnZones;
        const zone = zones[zoneIndex];
        if (!zone) return;

        const config = mobConfigs[mobType] || mobConfigs.wolf;

        const mob = new Mob();
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * zone.radius;
        mob.x = zone.centerX + Math.cos(angle) * dist;
        mob.z = zone.centerZ + Math.sin(angle) * dist;
        mob.rotationY = Math.random() * Math.PI * 2;
        mob.spawnZoneIndex = zoneIndex;
        mob.mobType = mobType;
        mob.hp = config.hp;
        mob.maxHp = config.maxHp;
        mob.level = config.level;
        mob.expReward = config.expReward;

        const mobId = `mob_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.room.state.mobs.set(mobId, mob);
        this.mobCount++;

        // Play spawn animation for skeletons
        if (mobType === 'skeleton') {
            mob.state = 'spawn';
            const spawnedMobId = mobId;
            setTimeout(() => {
                const currentMob = this.room.state.mobs.get(spawnedMobId);
                if (currentMob && currentMob.hp > 0) {
                    currentMob.state = 'idle';
                }
            }, 1500);
        }

        console.log(`[SPAWN] ${mobType} ${mobId} in zone ${zoneIndex} (${mob.x.toFixed(1)}, ${mob.z.toFixed(1)})`);
    }

    /** Respawn: use the same zone as the dead mob */
    private respawnMob(zoneIndex: number, mobType: string = 'wolf') {
        this.spawnOneInZone(zoneIndex, mobType);
    }

    public onMobDied(mobId: string, killerSessionId?: string) {
        const mob = this.room.state.mobs.get(mobId);
        if (!mob) return;

        mob.state = 'death';
        const spawnZoneIndex = mob.spawnZoneIndex;
        const mobType = mob.mobType || 'wolf';

        if (killerSessionId) {
            const killer = this.room.state.players.get(killerSessionId);
            if (killer) {
                this.room.addExperience(killer, mob.expReward);
                QuestManager.onMobKilled(this.room, killer, mobType);
                PlayerPersistence.savePlayer(killer);
            }
        }

        // Generate loot based on mob type
        const lootItems: { item: Item, quantity: number }[] = [];
        if (mobType === 'skeleton') {
            // Skeletons drop bones and sometimes weapons
            const boneItem = Object.assign(new Item(), itemDatabase["skeleton_bone"]);
            const potion = Object.assign(new Item(), itemDatabase["potion_hp_01"]);
            lootItems.push({ item: potion, quantity: 6 });
            lootItems.push({ item: boneItem, quantity: Math.floor(Math.random() * 3) + 1 });
            if (Math.random() < 0.3) {
                const sword = Object.assign(new Item(), itemDatabase["sword_01"]);
                lootItems.push({ item: sword, quantity: 1 });
            }
        } else {
            // Wolves drop potions and sometimes swords
            const potion = Object.assign(new Item(), itemDatabase["potion_hp_01"]);
            const sword = Object.assign(new Item(), itemDatabase["sword_01"]);
            lootItems.push({ item: potion, quantity: 1 });
            if (Math.random() < 0.2) {
                lootItems.push({ item: sword, quantity: 1 });
            }
        }

        const angle = Math.random() * Math.PI * 2;
        const dist = 1.0 + Math.random() * 2.0;
        const landX = mob.x + Math.cos(angle) * dist;
        const landZ = mob.z + Math.sin(angle) * dist;

        const bagId = `loot_${mobId}_${Date.now()}`;
        const bag = new LootBag(bagId, landX, landZ, mob.x, mob.z, lootItems);
        this.room.state.lootBags.set(bagId, bag);

        const removalTimer = setTimeout(() => {
            this.room.state.mobs.delete(mobId);
            this.mobCount--;
            // Respawn in the same zone with the same type
            if (spawnZoneIndex >= 0) {
                const zones = mobType === 'skeleton' ? skeletonSpawnZones : wolfSpawnZones;
                if (spawnZoneIndex < zones.length) {
                    const respawnTimer = setTimeout(() => this.respawnMob(spawnZoneIndex, mobType), RESPAWN_DELAY);
                    this.room.addTimer(respawnTimer);
                }
            }
        }, 3000);
        this.room.addTimer(removalTimer);
    }

    /** Spawn mobs by zone array (from editor or initial load) */
    public spawnMulti(zones: any[]) {
        for (const zone of zones) {
            const mobType = zone.mobType || 'wolf';
            const config = mobConfigs[mobType] || mobConfigs.wolf;
            for (let i = 0; i < zone.count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.random() * zone.radius;
                const mob = new Mob();
                mob.x = zone.centerX + Math.cos(angle) * dist;
                mob.z = zone.centerZ + Math.sin(angle) * dist;
                mob.spawnZoneIndex = -1;
                mob.mobType = mobType;
                mob.hp = config.hp;
                mob.maxHp = config.maxHp;
                mob.level = config.level;
                mob.expReward = config.expReward;
                const id = `mob_${Date.now()}_${Math.random().toString(36).substr(2,9)}`;
                this.room.state.mobs.set(id, mob);
            }
        }
    }

    /** Spawn initial skeleton mobs from skeletonSpawnZones */
    public spawnInitialSkeletons() {
        skeletonSpawnZones.forEach((zone, index) => {
            for (let i = 0; i < zone.count; i++) {
                this.spawnOneInZone(index, 'skeleton');
            }
        });
    }

    /** Spawn initial wolf mobs from wolfSpawnZones */
    public spawnInitialWolves() {
        wolfSpawnZones.forEach((zone, index) => {
            for (let i = 0; i < zone.count; i++) {
                this.spawnOneInZone(index, 'wolf');
            }
        });
    }

    public respawnAll(zones: any[]) {
        this.room.state.mobs.forEach((mob, id) => this.room.state.mobs.delete(id));
        this.spawnMulti(zones);
    }
}
