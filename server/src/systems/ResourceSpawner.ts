import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';
import { ResourceNode } from '../schemas/ResourceNode';

const DATA_FILE = path.join(__dirname, '../../data/resource_nodes.json');
const HEIGHTMAP_PATH = path.join(__dirname, '../../public/textures/heightmap.png');
const TERRAIN_WIDTH = 2048;
const TERRAIN_DEPTH = 2048;
const TERRAIN_MAX_HEIGHT = 200;

// Хардкод-позиции для теста (рядом со спавном)
const TEST_NODES = [
    { id: "test_ore_1", type: "copper_ore", x: 12, z: 15 },
    { id: "test_ore_2", type: "copper_ore", x: 18, z: 10 },
    { id: "test_ore_3", type: "copper_ore", x: 22, z: 22 },
    { id: "test_ore_4", type: "tin_ore", x: 30, z: 18 },
    { id: "test_ore_5", type: "tin_ore", x: 35, z: 25 },
    { id: "test_ore_6", type: "coal", x: 28, z: 35 },
    { id: "test_ore_7", type: "iron_ore", x: 50, z: 40 },
    { id: "test_ore_8", type: "iron_ore", x: 55, z: 48 },
];

export class ResourceSpawner {
    private room: any;
    private heightmapData: number[] | null = null;
    private heightmapWidth = 0;
    private heightmapHeight = 0;
    private respawnTimer: NodeJS.Timeout | null = null;

    constructor(room: any) {
        this.room = room;
    }

    initialize(): void {
        this.loadHeightmap();

        // Пробуем загрузить из файла, иначе — тестовые позиции
        let nodesData = this.loadFromFile();
        if (!nodesData) {
            nodesData = TEST_NODES;
            this.saveToFile(nodesData);
        }

        for (const data of nodesData) {
            const node = new ResourceNode();
            node.id = data.id;
            node.type = data.type;
            node.x = data.x;
            node.z = data.z;
            node.y = this.getTerrainY(data.x, data.z);
            node.state = "active";
            node.respawnAt = 0;
            this.room.state.resourceNodes.set(node.id, node);
        }
        console.log(`[RESOURCE] Загружено ${nodesData.length} рудных жил`);

        // Таймер проверки респавна (каждые 5 секунд)
        this.respawnTimer = setInterval(() => this.updateRespawns(), 5000);
        this.room.addTimer(this.respawnTimer);
    }

    private loadHeightmap(): void {
        try {
            const buffer = fs.readFileSync(HEIGHTMAP_PATH);
            const png = PNG.sync.read(buffer);
            this.heightmapWidth = png.width;
            this.heightmapHeight = png.height;
            this.heightmapData = [];
            for (let i = 0; i < png.data.length; i += 4) {
                this.heightmapData.push(png.data[i]);
            }
        } catch (err) {
            console.error('[RESOURCE] Ошибка загрузки heightmap:', err);
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

        const getPixel = (col: number, row: number): number => {
            const xc = Math.min(Math.max(col, 0), imgW - 1);
            const yc = Math.min(Math.max(row, 0), imgH - 1);
            const index = yc * imgW + xc;
            return this.heightmapData![index];
        };

        const x0 = Math.floor(px);
        const y0 = Math.floor(py);
        const dx = px - x0;
        const dy = py - y0;

        const cubicInterp1D = (p: number, v0: number, v1: number, v2: number, v3: number): number => {
            const p2 = p * p;
            const p3 = p2 * p;
            const a = -0.5 * v0 + 1.5 * v1 - 1.5 * v2 + 0.5 * v3;
            const b = v0 - 2.5 * v1 + 2.0 * v2 - 0.5 * v3;
            const c = -0.5 * v0 + 0.5 * v2;
            const d = v1;
            return a * p3 + b * p2 + c * p + d;
        };

        const values: number[] = [];
        for (let dy_ = -1; dy_ <= 2; dy_++) {
            for (let dx_ = -1; dx_ <= 2; dx_++) {
                values.push(getPixel(x0 + dx_, y0 + dy_));
            }
        }

        const rowInterp: number[] = [];
        for (let i = 0; i < 4; i++) {
            const baseIdx = i * 4;
            rowInterp.push(cubicInterp1D(dx, values[baseIdx], values[baseIdx+1], values[baseIdx+2], values[baseIdx+3]));
        }

        const result = cubicInterp1D(dy, rowInterp[0], rowInterp[1], rowInterp[2], rowInterp[3]);
        return (result / 255) * TERRAIN_MAX_HEIGHT;
    }

    private updateRespawns(): void {
        const now = Date.now();
        this.room.state.resourceNodes.forEach((node: ResourceNode) => {
            if (node.state === "depleted" && node.respawnAt > 0 && now >= node.respawnAt) {
                node.state = "active";
                node.respawnAt = 0;
                console.log(`[RESOURCE] Жила ${node.id} (${node.type}) восстановлена`);
            }
        });
    }

    markNodeDepleted(node: ResourceNode): void {
        node.state = "depleted";
        node.respawnAt = Date.now() + node.respawnTimeMs;
    }

    private loadFromFile(): any[] | null {
        try {
            if (fs.existsSync(DATA_FILE)) {
                const raw = fs.readFileSync(DATA_FILE, 'utf-8');
                return JSON.parse(raw);
            }
        } catch (err) {
            console.error('[RESOURCE] Ошибка загрузки:', err);
        }
        return null;
    }

    private saveToFile(data: any[]): void {
        try {
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        } catch (err) {
            console.error('[RESOURCE] Ошибка сохранения:', err);
        }
    }
}
