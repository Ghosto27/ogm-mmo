import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';
import { WorldObject } from '../schemas/WorldObject';

interface VegetationObject {
    x: number;
    z: number;
    scale: number;
    rotationY: number;
    modelName: string;
    zoneId: string;
    y: number;   // высота террейна
}

const VEGETATION_FILE = path.join(__dirname, '../../data/vegetation.json');
const ZONE_CONFIG_FILE = path.join(__dirname, '../../data/vegetation_zones.json');
const HEIGHTMAP_PATH = path.join(__dirname, '../../public/textures/heightmap.png');
const TERRAIN_WIDTH = 2048;   // должно совпадать с параметрами террейна
const TERRAIN_DEPTH = 2048;
const TERRAIN_MAX_HEIGHT = 200;

export class VegetationSpawner {
    private room: any;
    private heightmapData: number[] | null = null;
    private heightmapWidth = 0;
    private heightmapHeight = 0;

    constructor(room: any) {
        this.room = room;
        this.loadHeightmap();
    }

    private loadHeightmap(): void {
        try {
            const buffer = fs.readFileSync(HEIGHTMAP_PATH);
            const png = PNG.sync.read(buffer);
            this.heightmapWidth = png.width;
            this.heightmapHeight = png.height;
            this.heightmapData = [];
            for (let i = 0; i < png.data.length; i += 4) {
                this.heightmapData.push(png.data[i]); // красный канал
            }
            console.log('[VEGETATION] Heightmap загружен');
        } catch (err) {
            console.error('[VEGETATION] Ошибка загрузки heightmap:', err);
        }
    }

    private getTerrainY(x: number, z: number): number {
        if (!this.heightmapData) return 0;
        const u = (x / TERRAIN_WIDTH) + 0.5;
        const v = (z / TERRAIN_DEPTH) + 0.5;
        if (u < 0 || u > 1 || v < 0 || v > 1) return 0;

        const imgW = this.heightmapWidth;
        const imgH = this.heightmapHeight;
        const px = u * (imgW - 1);
        const py = v * (imgH - 1);

        // Функция для безопасного получения значения пикселя (с clamped краями)
        const getPixel = (col: number, row: number): number => {
            const x = Math.min(Math.max(col, 0), imgW - 1);
            const y = Math.min(Math.max(row, 0), imgH - 1);
            const index = y * imgW + x;
            return this.heightmapData![index];
        };

        // Вычисляем координаты текущего опорного пикселя (левый верхний)
        const x0 = Math.floor(px);
        const y0 = Math.floor(py);
        const dx = px - x0;
        const dy = py - y0;

        // Кубическая интерполяция по одному измерению (с использованием Catmull-Rom сплайна)
        const cubicInterp1D = (p: number, v0: number, v1: number, v2: number, v3: number): number => {
            const p2 = p * p;
            const p3 = p2 * p;
            const a = -0.5 * v0 + 1.5 * v1 - 1.5 * v2 + 0.5 * v3;
            const b = v0 - 2.5 * v1 + 2.0 * v2 - 0.5 * v3;
            const c = -0.5 * v0 + 0.5 * v2;
            const d = v1;
            return a * p3 + b * p2 + c * p + d;
        };

        // Получаем 16 соседних пикселей (4x4)
        const values: number[] = [];
        for (let dy_ = -1; dy_ <= 2; dy_++) {
            for (let dx_ = -1; dx_ <= 2; dx_++) {
                values.push(getPixel(x0 + dx_, y0 + dy_));
            }
        }

        // Сначала интерполируем по строкам (4 строки)
        const rowInterp: number[] = [];
        for (let i = 0; i < 4; i++) {
            const baseIdx = i * 4;
            rowInterp.push(cubicInterp1D(dx, values[baseIdx], values[baseIdx+1], values[baseIdx+2], values[baseIdx+3]));
        }

        // Затем интерполируем по столбцам
        const result = cubicInterp1D(dy, rowInterp[0], rowInterp[1], rowInterp[2], rowInterp[3]);

        return (result / 255) * TERRAIN_MAX_HEIGHT;
    }

    private readonly MIN_OBJECT_DISTANCE = 8.0; // минимальное расстояние между центрами объектов

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
        let accumulatedObjects = [...stored]; // начинаем с тех, что в файле
        for (const zone of zones) {
            const existing = stored.filter(obj => obj.zoneId === zone.id);
            if (existing.length === 0) {
                // Новая зона, генерируем с учётом всех существующих объектов
                const generated = this.generateObjectsForZone(zone, accumulatedObjects);
                stored.push(...generated);
                accumulatedObjects.push(...generated);
            } else {
                // Зона уже существует, проверяем, нужна ли регенерация
                if (this.zoneNeedsRegeneration(zone, existing)) {
                    // Удаляем старые объекты этой зоны из stored
                    stored = stored.filter(obj => obj.zoneId !== zone.id);
                    const generated = this.generateObjectsForZone(zone, stored); // существующие без этой зоны
                    stored.push(...generated);
                }
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
            wo.y = obj.y;
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
                wo.y = obj.y || 0;
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
            const objects = this.generateObjectsForZone(zone, allObjects); // передаём уже созданные объекты
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
            wo.y = obj.y;
            wo.scaleX = obj.scale;
            wo.scaleY = obj.scale;
            wo.scaleZ = obj.scale;
            wo.rotationY = obj.rotationY;
            wo.color = '#ffffff';
            this.room.state.worldObjects.set(wo.id, wo);
        }
    }

    /** Генерирует объекты для одной зоны */
    private generateObjectsForZone(zone: any, existingObjects: VegetationObject[] = []): VegetationObject[] {
        const objects: VegetationObject[] = [];
        const maxAttempts = 50;
        const rng = () => Math.random();
        const MIN_DIST = 2.0;

        for (let i = 0; i < zone.count; i++) {
            let placed = false;
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const x = zone.centerX + (rng() - 0.5) * zone.width;
                const z = zone.centerZ + (rng() - 0.5) * zone.depth;
                const scale = zone.minScale + rng() * (zone.maxScale - zone.minScale);
                const rotationY = rng() * Math.PI * 2;
                const modelName = zone.modelNames[Math.floor(rng() * zone.modelNames.length)];
                const y = this.getTerrainY(x, z);

                // Проверка минимальной дистанции
                let tooClose = false;
                for (const obj of objects) {
                    const dx = x - obj.x;
                    const dz = z - obj.z;
                    if (Math.sqrt(dx*dx + dz*dz) < MIN_DIST) { tooClose = true; break; }
                }
                if (tooClose) continue;
                for (const obj of existingObjects) {
                    const dx = x - obj.x;
                    const dz = z - obj.z;
                    if (Math.sqrt(dx*dx + dz*dz) < MIN_DIST) { tooClose = true; break; }
                }
                if (tooClose) continue;

                objects.push({ x, z, scale, rotationY, modelName, zoneId: zone.id, y });
                placed = true;
                break;
            }
            if (!placed) {
                console.warn(`[VEGETATION] Не удалось разместить объект #${i+1} в зоне "${zone.id}"`);
            }
        }
        console.log(`[VEGETATION] Зона "${zone.id}": размещено ${objects.length}/${zone.count} объектов`);
        return objects;
    }

    public async regenerateSingleZoneFromClient(zoneId: string, objects: any[]): Promise<void> {
        try {
            let stored: VegetationObject[] = [];
            if (fs.existsSync(VEGETATION_FILE)) {
                const raw = fs.readFileSync(VEGETATION_FILE, 'utf-8');
                stored = JSON.parse(raw);
            }

            // Удаляем старые объекты этой зоны из файла
            stored = stored.filter(obj => obj.zoneId !== zoneId);

            // Добавляем новые объекты в файл
            const generated: VegetationObject[] = objects.map(obj => ({
                x: obj.x,
                z: obj.z,
                y: obj.y,
                scale: obj.scale,
                rotationY: obj.rotationY,
                modelName: obj.modelName,
                zoneId: zoneId,
            }));
            stored.push(...generated);
            fs.writeFileSync(VEGETATION_FILE, JSON.stringify(stored, null, 2));

            // Удаляем старые объекты этой зоны из стейта (одним разом – это мало данных)
            const toRemove: string[] = [];
            this.room.state.worldObjects.forEach((_: any, id: string) => {
                if (id.startsWith(`vegezone_${zoneId}_`)) toRemove.push(id);
            });
            toRemove.forEach(id => this.room.state.worldObjects.delete(id));

            // Добавляем новые объекты порциями, чтобы избежать Max payload
            const BATCH_SIZE = 40;  // меньше лимита (75)
            const DELAY_MS = 30;    // задержка между батчами

            for (let i = 0; i < generated.length; i += BATCH_SIZE) {
                const batch = generated.slice(i, i + BATCH_SIZE);
                // Вставка порции
                for (const obj of batch) {
                    const wo = new WorldObject();
                    wo.id = `vegezone_${zoneId}_${obj.x.toFixed(1)}_${obj.z.toFixed(1)}`;
                    wo.modelName = obj.modelName;
                    wo.x = obj.x;
                    wo.y = obj.y;
                    wo.z = obj.z;
                    wo.scaleX = obj.scale;
                    wo.scaleY = obj.scale;
                    wo.scaleZ = obj.scale;
                    wo.rotationY = obj.rotationY;
                    wo.color = '#ffffff';
                    this.room.state.worldObjects.set(wo.id, wo);
                }

                if (i + BATCH_SIZE < generated.length) {
                    await new Promise(resolve => setTimeout(resolve, DELAY_MS));
                }
            }

            console.log(`[VEGETATION] Зона "${zoneId}" обновлена (всего ${generated.length} объектов, порциями)`);
        } catch (err) {
            console.error('[VEGETATION] Ошибка в regenerateSingleZoneFromClient:', err);
            throw err;
        }
    }
}