import { Mob } from "./Mob";
import type { MyRoom } from "./MyRoom";
import { LootBag } from "./schemas/LootBag";
import { Item } from "./models/Item";
import { ItemSlot } from "./models/ItemSlot";
import { itemDatabase } from "./data/items";
import { QuestManager } from "./systems/QuestManager";
import { PlayerPersistence } from "./systems/PlayerPersistence";
import { wolfSpawnZones } from "./data/spawnZones";

const RESPAWN_DELAY = 10_000;      // 10 секунд

export class MobSpawner {
    private room: MyRoom;
    private mobCount = 0;

    constructor(room: MyRoom) {
        this.room = room;
        //this.spawnInitial();
    }

    private spawnInitial() {
        // Спавним волков по зонам
        wolfSpawnZones.forEach((zone, index) => {
            for (let i = 0; i < zone.count; i++) {
                this.spawnOneInZone(index);
            }
        });
    }

    /** Создаёт волка в указанной зоне */
    private spawnOneInZone(zoneIndex: number) {
        const zone = wolfSpawnZones[zoneIndex];
        if (!zone) return;

        const mob = new Mob();
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * zone.radius;
        mob.x = zone.centerX + Math.cos(angle) * dist;
        mob.z = zone.centerZ + Math.sin(angle) * dist;
        mob.rotationY = Math.random() * Math.PI * 2;
        mob.spawnZoneIndex = zoneIndex;   // запоминаем зону

        const mobId = `mob_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.room.state.mobs.set(mobId, mob);
        this.mobCount++;
        console.log(`[SPAWN] Волк ${mobId} появился в зоне ${zoneIndex} (${mob.x.toFixed(1)}, ${mob.z.toFixed(1)})`);
    }

    /** Респавн: используется та же зона, что и у умершего волка */
    private respawnMob(zoneIndex: number) {
        this.spawnOneInZone(zoneIndex);
    }

    public onMobDied(mobId: string, killerSessionId?: string) {
        const mob = this.room.state.mobs.get(mobId);
        if (!mob) return;

        mob.state = 'death';
        const spawnZoneIndex = mob.spawnZoneIndex; // запоминаем зону до удаления

        if (killerSessionId) {
            const killer = this.room.state.players.get(killerSessionId);
            if (killer) {
                this.room.addExperience(killer, mob.expReward);
                QuestManager.onMobKilled(this.room, killer, 'wolf');
                PlayerPersistence.savePlayer(killer);
            }
        }

        // ... создание лута и удаление ...
        const lootItems: { item: Item, quantity: number }[] = [];
        const potion = Object.assign(new Item(), itemDatabase["potion_hp_01"]);
        const sword = Object.assign(new Item(), itemDatabase["sword_01"]);
        lootItems.push({ item: potion, quantity: 1 });
        lootItems.push({ item: sword, quantity: 1 });

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
            // Респавн в той же зоне
            if (spawnZoneIndex >= 0 && spawnZoneIndex < wolfSpawnZones.length) {
                const respawnTimer = setTimeout(() => this.respawnMob(spawnZoneIndex), RESPAWN_DELAY);
                this.room.addTimer(respawnTimer);
            }
        }, 3000);
        this.room.addTimer(removalTimer);
    }

    /** Спавн мобов по массиву зон */
    public spawnMulti(zones: any[]) {
        for (const zone of zones) {
            for (let i = 0; i < zone.count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.random() * zone.radius;
                const mob = new Mob();
                mob.x = zone.centerX + Math.cos(angle) * dist;
                mob.z = zone.centerZ + Math.sin(angle) * dist;
                mob.spawnZoneIndex = -1; // не используется, но пусть будет
                const id = `mob_${Date.now()}_${Math.random().toString(36).substr(2,9)}`;
                this.room.state.mobs.set(id, mob);
            }
        }
    }

    public respawnAll(zones: any[]) {
        this.room.state.mobs.forEach((mob, id) => this.room.state.mobs.delete(id));
        this.spawnMulti(zones);
    }
}
