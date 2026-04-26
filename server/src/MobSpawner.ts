import { Mob } from "./Mob";
import type { MyRoom } from "./MyRoom";
import { LootBag } from "./schemas/LootBag";
import { Item } from "./models/Item";
import { ItemSlot } from "./models/ItemSlot";
import { itemDatabase } from "./data/items";
 

const MAX_MOBS = 1;
const SPAWN_RADIUS = 30; // от центра
const RESPAWN_DELAY = 10_000; // 10 секунд

export class MobSpawner {
    private room: MyRoom;
    private mobCount = 0;

    constructor(room: MyRoom) {
        this.room = room;
        this.spawnInitial();
    }

    private spawnInitial() {
        for (let i = 0; i < MAX_MOBS; i++) {
            this.spawnOne();
        }
    }

    private spawnOne() {
        const mob = new Mob();
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * SPAWN_RADIUS;
        mob.x = Math.cos(angle) * dist;
        mob.z = Math.sin(angle) * dist;
        mob.rotationY = Math.random() * Math.PI * 2;

        const mobId = `mob_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.room.state.mobs.set(mobId, mob);
        this.mobCount++;
        console.log(`[SPAWN] Волк ${mobId} появился на (${mob.x.toFixed(1)}, ${mob.z.toFixed(1)})`);

        this.scheduleRespawn(mobId);
    }

    private scheduleRespawn(mobId: string) {
        // Через RESPAWN_DELAY после смерти моб возродится (но удалять пока не будем — это делается при смерти)
        // На самом деле респаун лучше запускать при удалении моба, но пока упростим: каждые 10 секунд проверяем,
        // есть ли мёртвый моб с таким id и если да – воскрешаем.
        // Но для первого раза оставим просто создание нового моба при старте, а смерть и респаун будут в FSM.
    }

    public onMobDied(mobId: string, killerSessionId?: string) {
        const mob = this.room.state.mobs.get(mobId);
        if (!mob) return;

        // Опыт только убийце (если передан)
        if (killerSessionId) {
            const killer = this.room.state.players.get(killerSessionId);
            if (killer) {
                this.room.addExperience(killer, mob.expReward);
            }
        }

        // Создание мешка с лутом (без изменений)
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

        // Удаляем мешок через 60 секунд, только если он не был опустошён
        /* const deleteTimer = setTimeout(() => {
            if (this.room.state.lootBags.has(bagId) && (this.room.state.lootBags.get(bagId)?.items.length ?? 0) > 0) {
                this.room.state.lootBags.delete(bagId);
            }
        }, 60000); */

        // Удаление моба и респаун
        setTimeout(() => {
            this.room.state.mobs.delete(mobId);
            this.mobCount--;
            setTimeout(() => this.spawnOne(), 10000);
        }, 5000);
    }
}