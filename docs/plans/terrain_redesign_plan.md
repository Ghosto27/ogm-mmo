# Terrain Redesign — План реализации

## Проблемы текущей системы

- **Heightmap редактируется как PNG** — нужно вымерять пиксели, перезагружать сервер
- **Текстуры по высоте** — grass только в низинах, cliff/rock по градиенту, нельзя покрасить вручную
- **Нет воды** — ни рек, ни озёр
- **Нет дорог** — нельзя проложить тропу/тракт

---

## Архитектура

```
Mesh vertices (129×129) ──редактор──→ raw heights [Uint8, 16KB]
          ↓                              ↓
   видно сразу в игре              JSON → сервер → pngjs → 4096×4096 PNG
                                                        ↓
                                              express.static('public')
                                                        ↓
                                              клиент загружает с сервера
```

- **heightmap.png** (4096×4096) — единственный файл, заменяется целиком при Save
- **129×129 вершин** — меш (128 segments), редактируем напрямую
- **Сохранение:** читаем Y вершин → Uint8Array → JSON → сервер → pngjs scale 129→4096 → `server/public/textures/heightmap.png`
- **Клиент** загружает heightmap с Colyseus-сервера (SERVER_URL + path), не с Vite
- **maxPayload** WebSocket: 10MB (дефолт 4KB не хватало даже для 16К чисел)

---

## Фаза 1 ✅ — Редактор рельефа (F10) — РЕАЛИЗОВАНО

### 1.1 Механизм редактирования

- Редактирование напрямую по вершинам `geometry.attributes.position.array` (129×129).
- Рейкаст мыши в террейн → worldX, worldZ → находим вершины в радиусе кисти.
- **Зажатие ЛКМ** → `setInterval` 50ms применяет кисть; мусорные вызовы из `mousemove` убраны.
- `vertexHeightBuffer` (Float32Array, 129×129) синхронизирован с мешем.
- После каждого штриха: `position.needsUpdate = true`, `computeVertexNormals()`.

### 1.2 Инструменты кисти

| Инструмент | Действие |
|---|---|
| Raise | Поднять вершины в радиусе с falloff |
| Lower | Опустить вершины в радиусе с falloff |
| Flatten | Выровнять до высоты ЦЕНТРА кисти |
| Smooth | Усреднить с соседями (3×3 окно) |

Параметры: Radius (1–40), Strength (0.01–1.0), Falloff (Gaussian / Linear / Flat).  
Колёсико мыши = радиус кисти.

### 1.3 Сохранение (Save)

1. `exportRawHeights()` → Uint8Array (129×129)
2. Отправка: `room.send('saveHeightmapRaw', { heights: [...], segments: 128, maxHeight: 200 })`
3. Сервер: pngjs создаёт PNG 4096×4096 (nearest-neighbor scale 129→4096)
4. Сохраняет в `server/public/textures/heightmap.png`
5. Обновляет `WorldTerrain.heightmapPath` с `?t=timestamp` → schema sync
6. Все клиенты перезагружают террейн с сервера

**Важно:** координаты загрузки и сохранения согласованы:
- Save: `sx = Math.floor(dx/4096 * 129)` — пиксели 0..31 → col 0, 32..63 → col 1
- Load: `px = Math.min(Math.floor(col/128 * 4096), 4095)` — col 1 → px=32 ✓

### 1.4 UI вкладки «🌍 Ландшафт»

- Выбор инструмента: Raise / Lower / Flatten / Smooth
- Слайдеры: Radius (1–40), Strength
- Выпадающий список: Falloff type
- Кнопка «📍 Забрать высоту» (pick height)
- Кнопка «💾 Сохранить ландшафт»
- Превью кисти: **LineLoop** (48 сегментов, семплирует vertexHeightBuffer) — кольцо ложится на рельеф
- Хинты: ЛКМ=raise, Shift+ЛКМ=lower, колесо=радиус

### 1.5 Файлы (изменённые/новые)

| Файл | Изменения |
|---|---|
| `client/src/editor/TerrainEditor.ts` | **Новый** — состояние кисти, превью (LineLoop), raycast, sampleHeight() |
| `client/src/render/TerrainRenderer.ts` | `vertexHeightBuffer`, `applyBrush()`, `exportRawHeights()`, загрузка с SERVER_URL, фикс координат (width vs width-1) |
| `client/src/editor/Editor.ts` | Вкладка «🌍 Ландшафт», mouse handlers (interval), pick height, save, shiftHeld |
| `client/src/editor/EditorUI.ts` | HTML панель с инструментами (radius max 40) |
| `server/src/index.ts` | `express.static('public')`, `maxPayload: 10MB` в attach |
| `server/src/MyRoom.ts` | Handler `saveHeightmapRaw` → pngjs → PNG 2048×2048 |

---

## Параметры террейна

| Параметр | Значение |
|---|---|
| Segments | 128 |
| Вершин | 129 × 129 = 16641 |
| Размер мира | 4096 × 4096 |
| MaxHeight | 200 |
| Heightmap PNG | 4096 × 4096, grayscale (базовый серый 128 → ~100м) |
| Splatmap | DataTexture 512×512 RGBA, raw binary |

## Масштабирование (увеличение детализации)

Текущие параметры: segments=128 (129×129 вершин), heightmap=4096×4096.

### Уровни

| Segments | Вершин | Размер массива | PNG | Пропускная способность на пиксель |
|----------|--------|----------------|-----|-----------------------------------|
| 128 (тек.) | 16641 | ~16 KB | 4096×4096 | ~31.8 px/vertex |
| 256 | 66049 | ~66 KB | 8192×8192 | ~32 px/vertex |

### Что менять для каждого уровня

**Простое (только размер PNG):**
- `server/src/MyRoom.ts` — `const dstSize = 4096` → нужный размер
- Начальный `heightmap.png` — заменить файлом нужного размера

**Среднее (segments):**
- Схемы сервера: `WorldTerrain.segments` (дефолт)
- `client/src/render/TerrainRenderer.ts` — заменить хардкод `segments: 128` в `onSaveTerrain()`
- `exportRawHeights()` автоматически подстраивается под размер буфера
- Все циклы по `vertexHeightBuffer` уже используют `getTerrainSegments()`
- **maxPayload** — 66 KB для 256, 263 KB для 512 — текущих 10MB хватит

**Сложное (необходимые рефакторинги):**
- `WorldTerrain.width` / `WorldTerrain.depth` — увеличены до 4096×4096
- `PlaneGeometry(terrain.width, terrain.depth, segments, segments)` — размер мира остаётся, меняется только сетка
- `getTerrainHeightAtFast()` — билинейная интерполяция, адаптируется автоматически
- `resource_nodes.json` — позиции объектов не зависят от сегментации

### Тормозные места при увеличении

- **Mesh:** больше вершин → больше времени на `computeVertexNormals()`, больше памяти GPU
- **Сохранение:** 66KB JSON для 256 — ок; 263KB для 512 — ок
- **WebSocket:** на 512 сегментах ~263KB за сообщение — влезает
- **Raycast:** 260K треугольников — three.js справляется, но медленнее
- **Brush apply:** цикл по всем вершинам (O(N)) — для 512 ~260K итераций за раз, может лагать при 50ms интервале

---

## Фаза 2 ✅ — Splatmap (покраска текстур) — РЕАЛИЗОВАНО

### 2.1 Шейдер

- Замена height-based (grass/cliff/rock по высоте) на splatmap-based
- Splatmap: `DataTexture` 512×512, RGBA (R=grass, G=dirt (cliff.jpg), B=rock, A=sand)
- `flipY = false` (PlaneGeometry UV v=0 при Z=+halfD)
- Текстуры: `grass.jpg`, `cliff.jpg`, `rock.jpg`, `sand.jpg` из `client/public/textures/`

```glsl
vec4 splat = texture2D(splatMap, vUv);
float total = splat.r + splat.g + splat.b + splat.a;
if (total < 0.001) { gl_FragColor = vec4(0.15, 0.25, 0.1, 1.0); return; }
vec4 color = texture2D(tex0, vUv * tiling) * splat.r
           + texture2D(tex1, vUv * tiling) * splat.g
           + texture2D(tex2, vUv * tiling) * splat.b
           + texture2D(tex3, vUv * tiling) * splat.a;
gl_FragColor = vec4(color.rgb / total, 1.0);
```

### 2.2 Инструмент покраски

- Кисть: рейкаст → worldX/worldZ → UV → DataTexture pixel (cx,cy)
- **Покраска (ЛКМ):** +addVal к каналу, −addVal/3 с остальных (falloff)
- **Стирание (Shift+ЛКМ):** −addVal из канала, +actualDelta в R (трава), плавный переход
- Инструмент в выпадающем списке: Raise / Lower / Flatten / Smooth / **Paint**
- Селектор канала: Трава (R) / Земля (G) / Камень (B) / Песок (A) — показывается при Paint
- Превью кисти: RingGeometry, цвет под канал (зелёный/коричневый/серый/бежевый)
- Fallback при total=0: тёмно-зелёный (0.15, 0.25, 0.1)

### 2.3 Сохранение (Save)

- **Save Splatmap:** сырые байты Uint8Array (512×512×4 = ~1MB) через `room.send('saveSplatmap', { data: [...] })`
- Сервер: `Buffer.from(message.data)` → `server/public/textures/splatmap.raw` (raw binary, не PNG!)
- Загрузка: `fetch(SERVER_URL + '/textures/splatmap.raw')` → `arrayBuffer` → `Uint8Array` → `splatData`
- При отсутствии файла — инициализация R=255 (трава)

### 2.4 UI вкладки «🌍 Ландшафт» (изменения)

- Добавлен инструмент **Paint (Покраска)**
- Селектор канала (показывается при выборе Paint)
- Кнопка «🎨 Сохранить сплатмап»
- Хинт: Shift+ЛКМ = стирание (Paint)
- Кнопка «📍 Забрать высоту» удалена

### 2.5 Файлы (изменённые/новые)

| Файл | Изменения |
|---|---|
| `client/src/render/TerrainRenderer.ts` | Splatmap DataTexture, init/load/save/paint shader, `applyPaintBrush()`, `exportSplatmapRaw()` |
| `client/src/editor/TerrainEditor.ts` | `paint` в TerrainTool, `paintChannel` в BrushState, цвет превью под канал |
| `client/src/editor/EditorUI.ts` | Paint в дропдауне, селектор канала, кнопка Save Splatmap |
| `client/src/editor/Editor.ts` | Paint-браш в интервале, `onSaveSplatmap()` (raw), `onPaintChannelChanged` |
| `server/src/MyRoom.ts` | Handler `saveSplatmap` → raw binary → `splatmap.raw` |

---

## Фаза 3 ✅ — Вода (прямоугольные водоёмы) — РЕАЛИЗОВАНО

### 3.1 Водоём

- `PlaneGeometry(width, depth)` с кастомным ShaderMaterial (синий полупрозрачный, UV-анимация)
- Позиция XZ, высота Y (по умолчанию высота террейна в центре), rotationY
- Меш добавляется в сцену отдельно, вне editor mode (виден всегда)
- При входе/выходе из редактора — не удаляется (в отличие от ресурсных нод)

### 3.2 Инструмент в редакторе

- Отдельная вкладка «💧 Вода» (рядом с Ландшафтом)
- Клик-драг как у зон растительности: первый клик — центр, второй — размер
- После создания водоёма — можно выделить и редактировать через TransformControls (передвинуть, повернуть, изменить размер)
- Кнопка «💾 Сохранить водоёмы»
- Загрузка `water_bodies.json` при входе в редактор

### 3.3 Сохранение

- `water_bodies.json` на сервере
- Хандлеры: `saveWaterBodies`, `getWaterBodies`
- При загрузке комнаты — инициализация из файла

### 3.4 Файлы (новые/изменённые)

| Файл | Изменения |
|---|---|
| `client/src/render/WaterRenderer.ts` | **Новый** — WaterMesh (ShaderMaterial с UV-анимацией), управление списком водоёмов |
| `client/src/editor/EditorUI.ts` | Вкладка «💧 Вода», кнопки Save, select |
| `client/src/editor/Editor.ts` | Логика рисования водоёма, вызовы save/load |
| `client/src/network.ts` | `room.onMessage("waterBodiesData", ...)` |
| `server/src/MyRoom.ts` | Handlers `saveWaterBodies`, `getWaterBodies` + init из `water_bodies.json` |

---

## Приоритет

1. ✅ **Фаза 1** — Raise/Lower/Smooth/Flatten в F2 + Save → **готово**
2. ✅ **Фаза 2** — Splatmap-шейдер + покраска текстур (Paint tool) → **готово**
3. ✅ **Фаза 3** — Вода (прямоугольные водоёмы) → **готово**
4. **Фаза 4** — Дороги
5. **Дополнительно** — Мир увеличен до 4096×4096, базовая высота ~100м, статика вынесена в `static_objects.json`, новая цветовая схема миникарты (синий для впадин, зелёный для нормы, серый для вершин)
