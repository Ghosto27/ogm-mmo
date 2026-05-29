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
- ЛКМ + drag = raise, Shift+ЛКМ + drag = lower.
- `vertexHeightBuffer` (Float32Array, 129×129) синхронизирован с мешем.
- После каждого штриха: `position.needsUpdate = true`, `computeVertexNormals()`.

### 1.2 Инструменты кисти

| Инструмент | Действие |
|---|---|
| Raise | Поднять вершины в радиусе с falloff |
| Lower | Опустить вершины в радиусе с falloff |
| Flatten | Выровнять до целевой высоты (pick height по клику) |
| Smooth | Усреднить с соседями (3×3 окно) |

Параметры: Radius (1–20), Strength (0.01–1.0), Falloff (Gaussian / Linear / Flat).  
Колёсико мыши = радиус кисти.

### 1.3 Сохранение (Save)

1. `exportRawHeights()` → Uint8Array (129×129)
2. Отправка: `room.send('saveHeightmapRaw', { heights: [...], segments: 128, maxHeight: 200 })`
3. Сервер: pngjs создаёт PNG 2048×2048 (nearest-neighbor scale 129→2048)
4. Сохраняет в `server/public/textures/heightmap.png`
5. Обновляет `WorldTerrain.heightmapPath` с `?t=timestamp` → schema sync
6. Все клиенты перезагружают террейн с сервера

### 1.4 UI вкладки «🌍 Ландшафт»

- Выбор инструмента: Raise / Lower / Flatten / Smooth
- Слайдеры: Radius, Strength
- Выпадающий список: Falloff type
- Кнопка «📍 Забрать высоту» (pick height)
- Кнопка «💾 Сохранить ландшафт»
- Превью кисти (белое кольцо) на террейне
- Хинты: ЛКМ=raise, Shift+ЛКМ=lower, колесо=радиус

### 1.5 Файлы (изменённые/новые)

| Файл | Изменения |
|---|---|
| `client/src/editor/TerrainEditor.ts` | **Новый** — состояние кисти, превью, raycast |
| `client/src/render/TerrainRenderer.ts` | `vertexHeightBuffer`, `applyBrush()`, `exportRawHeights()`, загрузка с SERVER_URL |
| `client/src/editor/Editor.ts` | Вкладка «🌍 Ландшафт», mouse handlers, pick height, save |
| `client/src/editor/EditorUI.ts` | HTML панель с инструментами |
| `server/src/index.ts` | `express.static('public')`, `maxPayload: 10MB` в attach |
| `server/src/MyRoom.ts` | Handler `saveHeightmapRaw` → pngjs → PNG 2048×2048 |

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
