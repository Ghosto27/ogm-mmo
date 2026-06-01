# Dungeon / Teleport System — План реализации

## Мотивация

- Нужны отдельные локации (данжи, подземелья), изолированные от основного мира
- Телепорт через Portal-объект при взаимодействии
- Текущий террейн 4096×4096 — подземелье под ним сломает `getTerrainHeightAtFast()` и рейкаст

## Варианты реализации

### A. ✨ Рекомендуемый: Переключение террейна в той же комнате

- Одна Colyseus-комната, один `MyRoom`, один инвентарь/персонаж
- На сервере несколько heightmap PNG: `heightmap_main.png`, `heightmap_dungeon_01.png` и т.д.
- При входе в портал:
  1. Сервер сохраняет текущее состояние террейна (если было изменено)
  2. Меняет `WorldTerrain.heightmapPath` на файл данжа
  3. Splatmap тоже переключается (свой `.raw` для каждой локации)
  4. Клиент перезагружает террейн с SERVER_URL
  5. Игрок телепортируется на спавн данжа
- При выходе — обратно, состояние сохраняется
- `getTerrainHeightAtFast()` и рейкаст продолжают работать корректно

### B. Альтернатива: Отдельные файлы воды и статики

- Каждая локация имеет свой набор:
  - `heightmap_*.png` + `splatmap_*.raw`
  - `water_bodies_*.json`
  - `static_objects_*.json`
  - `resource_nodes_*.json`
  - Спавн-точка (x, y, z)

### C. Сложный вариант: Отдельная Colyseus-комната

- Полная изоляция состояния, но:
  - Нужна пересылка инвентаря между комнатами
  - Другой игрок не увидит, кто в данже
  - Сложнее синхронизация группы

## Файлы

| Файл | Назначение |
|------|-----------|
| `server/data/locations.json` | Конфиг всех локаций: path, spawn, type |
| `server/public/textures/heightmap_dungeon_01.png` | Heightmap данжа |
| `server/public/textures/splatmap_dungeon_01.raw` | Splatmap данжа |
| `client/src/dungeon/Portal.ts` | Portal-объект, trigger zone, UI подсказка |
| `client/src/network.ts` | handlers `switchLocation`, `locationData` |
| `server/src/MyRoom.ts` | Handlers save/load/switch terrain |

## Приоритет

1. ⏳ **Реализация** — базовая смена террейна, 2 локации (main + test_dungeon)
2. **Portal-объект** — статичная модель с trigger zone и UI
3. **Множество локаций** — конфиг locations.json, админка
