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
   видно сразу в игре              JSON → сервер → pngjs → 2048×2048 PNG
                                                       ↓
                                             express.static('public')
                                                       ↓
                                             клиент загружает с сервера
```

- **heightmap.png** (2048×2048) — единственный файл, заменяется целиком при Save
- **129×129 вершин** — меш (128 segments), редактируем напрямую
- **Сохранение:** читаем Y вершин → Uint8Array → JSON → сервер → pngjs scale 129→2048 → `server/public/textures/heightmap.png`
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
3. Сервер: pngjs создаёт PNG 2048×2048 (nearest-neighbor scale 129→2048)
4. Сохраняет в `server/public/textures/heightmap.png`
5. Обновляет `WorldTerrain.heightmapPath` с `?t=timestamp` → schema sync
6. Все клиенты перезагружают террейн с сервера

**Важно:** координаты загрузки и сохранения согласованы:
- Save: `sx = Math.floor(dx/2048 * 129)` — пиксели 0..15 → col 0, 16..31 → col 1
- Load: `px = Math.min(Math.floor(col/128 * 2048), 2047)` — col 1 → px=16 ✓  
  (а не `Math.floor(col/128 * 2047)` → px=15, как было до фикса)

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

## Масштабирование (увеличение детализации)

Текущие параметры: segments=128 (129×129 вершин), heightmap=2048×2048.

### Уровни

| Segments | Вершин | Размер массива | PNG | Пропускная способность на пиксель |
|----------|--------|----------------|-----|-----------------------------------|
| 128 (тек.) | 16641 | ~16 KB | 2048×2048 | ~15.9 px/vertex |
| 256 | 66049 | ~66 KB | 4096×4096 | ~16 px/vertex |
| 512 | 263169 | ~263 KB | 8192×8192 | ~16 px/vertex |

### Что менять для каждого уровня

**Простое (только размер PNG):**
- `server/src/MyRoom.ts:1824` — `const dstSize = 2048` → нужный размер
- Начальный `heightmap.png` — заменить файлом нужного размера

**Среднее (segments):**
- Схемы сервера: `WorldTerrain.segments` (дефолт)
- `client/src/render/TerrainRenderer.ts` — заменить хардкод `segments: 128` в `onSaveTerrain()`
- `exportRawHeights()` автоматически подстраивается под размер буфера
- Все циклы по `vertexHeightBuffer` уже используют `getTerrainSegments()`
- **maxPayload** — 66 KB для 256, 263 KB для 512 — текущих 10MB хватит

**Сложное (необходимые рефакторинги):**
- `WorldTerrain.width` / `WorldTerrain.depth` — могут потребовать изменения размера мира (сейчас 2048×2048)
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

## Фаза 2 — Splatmap (покраска текстур)

### 2.1 Шейдер

- Заменить height-based (grass/cliff/rock по высоте) на splatmap-based
- Splatmap: `CanvasTexture` 129×129, RGBA (R=grass, G=dirt, B=rock, A=sand)
- Текстуры уже есть в client/public/textures/: `grass.jpg`, `cliff.jpg`, `rock.jpg`

```glsl
vec4 splat = texture2D(splatMap, vUv);
gl_FragColor = texture2D(tex0, vUv * tiling) * splat.r
             + texture2D(tex1, vUv * tiling) * splat.g
             + texture2D(tex2, vUv * tiling) * splat.b
             + texture2D(tex3, vUv * tiling) * splat.a;
```

### 2.2 Инструмент покраски

- Кисть: рейкаст → UV → круг в splatmap canvas цветом канала
- Shift+ЛКМ = стирание
- Save: PNG на сервер

### 2.3 Инициализация

- Проверить `splatmap.png` на сервере
- Если нет — инициализировать R=255 (вся трава)

---

## Фаза 3 — Вода

- Инструмент «Водоём»: клик + растянуть прямоугольник
- `three/addons/objects/Water.js` для reflective воды
- Сохранение: `water_bodies.json`

---

## Фаза 4 — Дороги

- Сплайновые дороги (CatmullRomCurve3) с авто-флаттернингом
- Сохранение: `roads.json`

---

## Параметры террейна

| Параметр | Значение |
|---|---|
| Segments | 128 |
| Вершин | 129 × 129 = 16641 |
| Размер мира | 2048 × 2048 |
| MaxHeight | 200 |
| Heightmap PNG | 2048 × 2048, grayscale |

---

## Приоритет

1. ✅ **Фаза 1** — Raise/Lower/Smooth/Flatten в F10 + Save → **готово**
2. ⏳ **Фаза 2** — Splatmap-шейдер + покраска текстур
3. **Фаза 3** — Вода
4. **Фаза 4** — Дороги
5. **Масштабирование** — увеличение segments/PNG по мере необходимости
