import { Mob } from "./Mob";
import { MyRoom } from "./MyRoom";

const MAX_MOBS = 3;
const SPAWN_RADIUS = 15; // от центра
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

    public onMobDied(mobId: string) {
        const mob = this.room.state.mobs.get(mobId);
        if (!mob) return;
        mob.state = "dead";
        // Даём опыт всем игрокам в комнате (заглушка)
        this.room.state.players.forEach((player, sessionId) => {
            (this.room as any).addExperience(player, mob.expReward);
        });
        // Удаляем через 5 секунд
        setTimeout(() => {
            this.room.state.mobs.delete(mobId);
            this.mobCount--;
            // Респаун нового волка через RESPAWN_DELAY
            setTimeout(() => {
                this.spawnOne();
            }, RESPAWN_DELAY);
        }, 5000);
    }
}