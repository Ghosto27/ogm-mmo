import * as fs from 'fs';
import * as path from 'path';

const DATA_FILE = path.join(__dirname, '..', 'players.json');

interface PlayerRecord {
    x: number;
    z: number;
    ry: number;
}

let data: { [name: string]: PlayerRecord } = {};

try {
    if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        data = JSON.parse(raw);
        console.log(`[STORAGE] Загружено записей: ${Object.keys(data).length}`);
    }
} catch (err) {
    console.error('[STORAGE] Ошибка загрузки, начинаем с пустого', err);
}

function save() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
        console.error('[STORAGE] Ошибка сохранения', err);
    }
}

export function loadPlayer(name: string): { x: number; z: number; ry: number } | null {
    const record = data[name];
    if (record) {
        return { x: record.x, z: record.z, ry: record.ry || 0 };
    }
    return null;
}

export function savePlayer(name: string, x: number, z: number, ry: number) {
    data[name] = { x, z, ry };
    save();
}