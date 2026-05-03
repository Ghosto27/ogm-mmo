import * as fs from 'fs';
import * as path from 'path';
import { WorldObject } from "../schemas/WorldObject";
import { forestZones } from "../data/spawnZones";

const DATA_FILE = path.join(__dirname, '../../data/vegetation.json');

interface StoredVegetation {
    [zoneId: string]: { x: number; z: number; scale: number; rotationY: number; modelName: string }[];
}

export class VegetationSpawner {
    static loadAndSpawn(room: any) {
        let saved: StoredVegetation = {};

        // Загружаем существующие сохранения, если есть
        if (fs.existsSync(DATA_FILE)) {
            try {
                saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
            } catch (e) {
                console.warn('[VEGETATION] Failed to load vegetation data, regenerating...');
                saved = {};
            }
        }

        for (const zone of forestZones) {
            // Если зона ещё не сохранена – генерируем
            if (!saved[zone.id]) {
                saved[zone.id] = [];
                const rng = () => Math.random(); // простой генератор
                for (let i = 0; i < zone.count; i++) {
                    const x = zone.centerX + (rng() - 0.5) * zone.width;
                    const z = zone.centerZ + (rng() - 0.5) * zone.depth;
                    const scale = zone.minScale + rng() * (zone.maxScale - zone.minScale);
                    const rotationY = rng() * Math.PI * 2;
                    const modelName = zone.modelNames[Math.floor(rng() * zone.modelNames.length)];
                    saved[zone.id].push({ x, z, scale, rotationY, modelName });
                }
                console.log(`[VEGETATION] Generated ${zone.count} objects in zone ${zone.id}`);
            }

            // Спавним объекты в комнату
            for (const pos of saved[zone.id]) {
                const wo = new WorldObject();
                wo.id = `${zone.id}_${pos.x.toFixed(2)}_${pos.z.toFixed(2)}`;
                wo.modelName = pos.modelName;
                wo.x = pos.x;
                wo.z = pos.z;
                wo.scaleX = pos.scale;
                wo.scaleY = pos.scale;
                wo.scaleZ = pos.scale;
                wo.rotationY = pos.rotationY;
                wo.color = '#ffffff'; // цвет не важен, модель сама окрашена
                room.state.worldObjects.set(wo.id, wo);
            }
        }

        // Сохраняем (в т.ч. новые зоны)
        fs.writeFileSync(DATA_FILE, JSON.stringify(saved, null, 2));
    }
}