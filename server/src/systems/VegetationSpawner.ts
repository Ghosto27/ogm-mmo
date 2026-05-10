import * as fs from 'fs';
import * as path from 'path';
import { WorldObject } from '../schemas/WorldObject';

interface VegetationObject {
    x: number;
    z: number;
    scale: number;
    rotationY: number;
    modelName: string;
    zoneId: string;         // ID зоны, породившей объект
}

const VEGETATION_FILE = path.join(__dirname, '../../data/vegetation.json');
const ZONE_CONFIG_FILE = path.join(__dirname, '../../data/vegetation_zones.json');

export class VegetationSpawner {
    private room: any;

    constructor(room: any) {
        this.room = room;
    }

    /** Выполняется один раз при старте сервера */
    initialize(): void {
        if (fs.existsSync(VEGETATION_FILE)) {
            // Файл уже есть – просто загружаем
            this.loadVegetationFromFile();
            console.log('[VEGETATION] Загружена сохранённая растительность');
        } else {
            // Первый запуск – генерируем по зонам и сохраняем
            this.generateAndSaveVegetation();
            console.log('[VEGETATION] Первичная генерация завершена');
        }
    }

    /** Вызывается редактором при сохранении зон */
    applyUpdatedZones(zones: any[]): void {
        // 1. Загружаем существующий файл (если есть)
        let stored: VegetationObject[] = [];
        if (fs.existsSync(VEGETATION_FILE)) {
            try {
                stored = JSON.parse(fs.readFileSync(VEGETATION_FILE, 'utf-8'));
            } catch (e) {
                console.error('[VEGETATION] Ошибка чтения vegetation.json, начинаем с чистого');
                stored = [];
            }
        }

        // 2. IDs всех зон, которые сейчас существуют
        const zoneIds = new Set(zones.map((z: any) => z.id));

        // 3. Удаляем объекты, чья зона исчезла
        stored = stored.filter(obj => zoneIds.has(obj.zoneId));

        // 4. Для каждой зоны проверяем, нужно ли перегенерировать
        for (const zone of zones) {
            const existingObjects = stored.filter(obj => obj.zoneId === zone.id);

            // Проверяем, изменились ли параметры, влияющие на генерацию
            const needsRegeneration = this.zoneNeedsRegeneration(zone, existingObjects);

            if (needsRegeneration) {
                // Удаляем старые объекты этой зоны
                stored = stored.filter(obj => obj.zoneId !== zone.id);
                // Генерируем новые
                const generated = this.generateObjectsForZone(zone);
                stored.push(...generated);
                console.log(`[VEGETATION] Зона "${zone.id}" перегенерирована (${generated.length} объектов)`);
            }
        }

        // 5. Сохраняем обновлённый файл
        fs.writeFileSync(VEGETATION_FILE, JSON.stringify(stored, null, 2));

        // 6. Обновляем мир в комнате: удаляем все vegezone_ объекты и добавляем новые
        const toRemove: string[] = [];
        this.room.state.worldObjects.forEach((_: any, id: string) => {
            if (id.startsWith('vegezone_')) toRemove.push(id);
        });
        toRemove.forEach((id: string) => this.room.state.worldObjects.delete(id));

        for (const obj of stored) {
            const wo = new WorldObject();
            wo.id = `vegezone_${obj.zoneId}_${obj.x.toFixed(1)}_${obj.z.toFixed(1)}`;
            wo.modelName = obj.modelName;
            wo.x = obj.x;
            wo.z = obj.z;
            wo.scaleX = obj.scale;
            wo.scaleY = obj.scale;
            wo.scaleZ = obj.scale;
            wo.rotationY = obj.rotationY;
            wo.color = '#ffffff';
            this.room.state.worldObjects.set(wo.id, wo);
        }

        console.log(`[VEGETATION] Зоны обновлены, объектов в мире: ${stored.length}`);
    }

    /** Определяет, нужно ли перегенерировать зону на основе её текущих параметров */
    private zoneNeedsRegeneration(zone: any, existingObjects: VegetationObject[]): boolean {
        if (existingObjects.length === 0) return true; // ещё не сгенерирована

        // Сравниваем количество
        if (existingObjects.length !== zone.count) return true;

        // Проверяем, что модели из старого набора еще допустимы в новом списке
        const newModelNames = new Set(zone.modelNames);
        for (const obj of existingObjects) {
            if (!newModelNames.has(obj.modelName)) return true;
        }

        // Можно также сравнить minScale/maxScale, проверив несколько объектов
        // Простая эвристика: если хотя бы один объект имеет масштаб вне текущего диапазона
        for (const obj of existingObjects) {
            if (obj.scale < zone.minScale || obj.scale > zone.maxScale) return true;
        }

        return false;
    }

    /** Загрузка растительности из файла в стейт */
    private loadVegetationFromFile(): void {
        try {
            const stored: VegetationObject[] = JSON.parse(fs.readFileSync(VEGETATION_FILE, 'utf-8'));
            for (const obj of stored) {
                const wo = new WorldObject();
                wo.id = `vegezone_${obj.zoneId}_${obj.x.toFixed(1)}_${obj.z.toFixed(1)}`;
                wo.modelName = obj.modelName;
                wo.x = obj.x;
                wo.z = obj.z;
                wo.scaleX = obj.scale;
                wo.scaleY = obj.scale;
                wo.scaleZ = obj.scale;
                wo.rotationY = obj.rotationY;
                wo.color = '#ffffff';
                this.room.state.worldObjects.set(wo.id, wo);
            }
        } catch (err) {
            console.error('[VEGETATION] Ошибка загрузки vegetation.json:', err);
        }
    }

    /** Первичная генерация: читаем зоны, генерируем, сохраняем */
    private generateAndSaveVegetation(): void {
        let zones: any[] = [];
        if (fs.existsSync(ZONE_CONFIG_FILE)) {
            try {
                zones = JSON.parse(fs.readFileSync(ZONE_CONFIG_FILE, 'utf-8'));
            } catch (e) {
                console.warn('[VEGETATION] Не удалось прочитать vegetation_zones.json, генерация пропущена');
                return;
            }
        }

        const allObjects: VegetationObject[] = [];
        for (const zone of zones) {
            const objects = this.generateObjectsForZone(zone);
            allObjects.push(...objects);
        }

        fs.writeFileSync(VEGETATION_FILE, JSON.stringify(allObjects, null, 2));

        // Добавляем в стейт
        for (const obj of allObjects) {
            const wo = new WorldObject();
            wo.id = `vegezone_${obj.zoneId}_${obj.x.toFixed(1)}_${obj.z.toFixed(1)}`;
            wo.modelName = obj.modelName;
            wo.x = obj.x;
            wo.z = obj.z;
            wo.scaleX = obj.scale;
            wo.scaleY = obj.scale;
            wo.scaleZ = obj.scale;
            wo.rotationY = obj.rotationY;
            wo.color = '#ffffff';
            this.room.state.worldObjects.set(wo.id, wo);
        }
    }

    /** Генерирует объекты для одной зоны */
    private generateObjectsForZone(zone: any): VegetationObject[] {
        const objects: VegetationObject[] = [];
        const rng = () => Math.random();
        for (let i = 0; i < zone.count; i++) {
            const x = zone.centerX + (rng() - 0.5) * zone.width;
            const z = zone.centerZ + (rng() - 0.5) * zone.depth;
            const scale = zone.minScale + rng() * (zone.maxScale - zone.minScale);
            const rotationY = rng() * Math.PI * 2;
            const modelName = zone.modelNames[Math.floor(rng() * zone.modelNames.length)];
            objects.push({
                x, z, scale, rotationY, modelName,
                zoneId: zone.id,
            });
        }
        return objects;
    }

    /** Перегенерирует одну зону (удаляет старые объекты, создаёт новые) */
    public regenerateSingleZone(zone: any): void {
        try {
            console.log(`[VEGETATION] Начало генерации зоны "${zone.id}" с параметрами:`, JSON.stringify(zone));
            let stored: VegetationObject[] = [];
            if (fs.existsSync(VEGETATION_FILE)) {
                const raw = fs.readFileSync(VEGETATION_FILE, 'utf-8');
                stored = JSON.parse(raw);
                console.log(`[VEGETATION] Текущий файл содержит ${stored.length} объектов`);
            } else {
                console.log(`[VEGETATION] Файл ${VEGETATION_FILE} не найден, создаём новый`);
            }

            // Удаляем объекты этой зоны
            const beforeCount = stored.length;
            stored = stored.filter(obj => obj.zoneId !== zone.id);
            console.log(`[VEGETATION] Удалено ${beforeCount - stored.length} старых объектов зоны "${zone.id}"`);

            // Генерируем новые
            const generated = this.generateObjectsForZone(zone);
            console.log(`[VEGETATION] Создано ${generated.length} новых объектов`);
            stored.push(...generated);

            // Сохраняем файл
            fs.writeFileSync(VEGETATION_FILE, JSON.stringify(stored, null, 2));
            console.log(`[VEGETATION] Файл ${VEGETATION_FILE} обновлён`);

            // Обновляем стейт
            const toRemove: string[] = [];
            this.room.state.worldObjects.forEach((_: any, id: string) => {
                if (id.startsWith(`vegezone_${zone.id}_`)) toRemove.push(id);
            });
            toRemove.forEach((id: string) => this.room.state.worldObjects.delete(id));
            console.log(`[VEGETATION] Удалено ${toRemove.length} объектов из мира`);

            for (const obj of generated) {
                console.log(`[VEG-REGEN] Создаётся объект в мире: zoneId=${zone.id}, x=${obj.x.toFixed(2)}, z=${obj.z.toFixed(2)}, model=${obj.modelName}`);
                const wo = new WorldObject();
                wo.id = `vegezone_${zone.id}_${obj.x.toFixed(1)}_${obj.z.toFixed(1)}`;
                wo.modelName = obj.modelName;
                wo.x = obj.x;
                wo.z = obj.z;
                wo.scaleX = obj.scale;
                wo.scaleY = obj.scale;
                wo.scaleZ = obj.scale;
                wo.rotationY = obj.rotationY;
                wo.color = '#ffffff';
                this.room.state.worldObjects.set(wo.id, wo);
            }

            console.log(`[VEGETATION] Зона "${zone.id}" успешно перегенерирована`);
        } catch (err) {
            console.error('[VEGETATION] Ошибка в regenerateSingleZone:', err);
            throw err; // всё равно пробрасываем, чтобы увидеть ошибку на клиенте
        }
    }
}