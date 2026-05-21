# Memory Leak / GC Pressure Audit — May 2026

Спустя 10-15 минут игры FPS сильно падает. Причина — избыточные per-frame аллокации и прогрессивный рост кучи из-за утечки в `AnimationStateMachine`.

---

## ✅ Исправлено: Per-frame аллокации (Round 1)

### 1. `client/src/mobPlayer.ts` — `interpolateMobPositions()`

~12 new THREE. объектов (Vector3/Quaternion/Matrix4) на скелет/кадр → 8 module-level temps.

### 2. `client/src/collision.ts` — вся система коллизий

~50 new/clone + spread массива на кадр движения → 12 module temps. Заменены `{normal, pushTo}` объекты-литералы, добавлен пул для динамических коллайдеров.

### 3. `client/src/input.ts` — `getCameraRelativeMovement()`

4 new THREE.Vector3/кадр → 3 module temps.

### 4. `client/src/main.ts` — карта, dynamicEntities, selectedObjects, debug

Объекты-литералы для миникарты (~35/кадр), `push({position, radius})` для коллайдеров, `[localModel]` массив, `[]` пустой массив — всё заменено на пулы мутабельных объектов и переиспользуемые массивы.

### 5. `client/src/cameraControls.ts` — `updateCamera()`

new THREE.Vector3 + 2 .clone() → 3 module temps.

### 6. `client/src/animationUtils.ts` — `updateAnimations()`

`Object.keys(mixers)` → `for (const id in mixers)`.

### 7. `client/src/render/TerrainRenderer.ts` — `getTerrainHeightAt()`

`new THREE.Vector3(x, 500, z)` → `_rayOrigin.set(x, 500, z)`.

---

## ✅ Исправлено: Прогрессивная утечка кучи (Round 2)

### 8. `client/src/animationStateMachine.ts` — `_initSmoothLoop()`

**Первичная причина падения FPS до 0 после 5-7 минут.**

Каждый `transitionTo()` → `_initSmoothLoop()`:
- `primary.getClip()` берёт оригинальный `AnimationClip`
- `clip.clone()` создаёт глубокую копию с **новым UUID**
- `mixer.clipAction(clone)` ищет action по `clipUuid` (UUID объекта, строка 525 Three.js)

Поскольку UUID каждый раз новый, существующий action **никогда не находится**, и каждый вызов создаёт **новый AnimationAction** в `AnimationMixer._actionsByClip` / `_actions`. После ~100 переходов на моба × ~15 мобов → **300MB роста кучи за 30 секунд**, хиты 4GB за ~7 минут, FPS → 0.

**Fix:** добавлен `_smoothClips` кеш `Map<stateName, {clip, action}>`. При повторном `transitionTo` для того же состояния — существующий action переиспользуется. `clip.clone()` вызывается ровно один раз на состояние за всё время жизни FSM.

---

## ⚠️ Остаётся открытым

### 7. `client/src/network.ts:488-500` — реконнект

`room.onLeave` **НЕ чистит**:
- `mobModels`, `lootMeshes`, `worldMeshes`, `terrainMesh`, `npcMeshes`, `vegetation instanceMeshes`

При реконнекте `onStateChange` создаёт дубликаты в сцене.

### 9. `client/src/animationStateMachine.ts:200, 287` — `mixer.addEventListener('finished')`

Если one-shot анимация прервана (другая анимация, удаление модели), слушатель не вызывается и не удаляется. Небольшая утечка слушателей на время жизни FSM.

### 10. `client/src/debug/collisionDebug.ts:16-21` — материал на каждый вызов

Создаёт/диспоузит материал каждый кадр при включённом дебаге коллизий. Не накапливается, но создаёт лишнюю работу.

---

## Ранее исправленная критическая утечка

`main.ts:443-457` — в прошлом `addEventListener` на `renderer.domElement` и `window` были **внутри `loop()`**, что добавляло ~36000 слушателей за 5 минут. Сейчас вынесены в IIFE.
