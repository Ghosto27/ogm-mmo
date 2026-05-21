# Memory Leak / GC Pressure Audit — May 2026

Спустя 10-15 минут игры FPS сильно падает. Причина — избыточные per-frame аллокации, нагружающие GC.

---

## Critical (каждый кадр, много аллокаций)

### 1. `client/src/mobPlayer.ts:574-603` — `interpolateMobPositions()`

~12 новых THREE объектов (Vector3, Quaternion, Matrix4) на каждый скелет, каждый кадр.
10 скелетов → 120 объектов/кадр. Это главный источник GC-давления.

```ts
// строки 574-589: на каждый bone каждого skeleton
new THREE.Vector3()           // 574
new THREE.Quaternion()        // 575
new THREE.Vector3()           // 576
new THREE.Vector3()           // 581
new THREE.Quaternion()        // 582
new THREE.Vector3()           // 583
new THREE.Matrix4().copy()    // 587
.clone()                      // 588
.clone().invert().multiply()  // 589
.clone().applyQuaternion()    // 602
.clone().invert().multiply()  // 603
```

Fix: переиспользовать temp Vector3/Quaternion/Matrix4 на уровне модуля.

### 2. `client/src/collision.ts:84-86, 100-220` — коллизия

Каждый кадр движения — десятки `.clone()` + `new Vector3/Matrix4`.
Цикл до 3 итераций.

```ts
// applyMovementWithCollisions (84-86)
rawDelta.clone().divideScalar(steps)  // 84
currentPos.clone()                    // 86

// applySingleStep (102-216) — множится на iterations × steps
currentPos.clone().add(delta)         // 102
delta.clone()                         // 103
[...colliders, ...dynamicColliders]   // 109 — spread нового массива
new THREE.Vector3().subVectors(...)   // 118
col.center.clone()                    // 119
new THREE.Vector3(1, 0, 0)           // 135
new THREE.Matrix4().copy()...        // 153
и т.д.
```

Fix: переиспользовать temp Vector3/Matrix4, избегать spread массивов.

---

## Medium (каждый кадр)

### 3. `client/src/input.ts:61-73` — `getCameraRelativeMovement()`

3-4 `new THREE.Vector3` каждый кадр при движении.

```ts
new THREE.Vector3(0, 0, 0)          // 61 — idle
new THREE.Vector3(-sinYaw, 0, ...)  // 69 — forward
new THREE.Vector3(cosYaw, 0, ...)   // 71 — right
new THREE.Vector3()                  // 73 — moveResult
```

Fix: pre-allocated temp vectors.

### 4. `client/src/main.ts:302-322` — `dynamicEntities` массив

Создаётся каждый кадр при движении:

```ts
const dynamicEntities: {position: Vector3, radius: number}[] = []
```

Потом заполняется `.clone()` позиций других игроков и мобов.
Можно переиспользовать массив.

### 5. `client/src/main.ts:371-401` — массивы для карты

`othersForMap`, `mobsForMap`, `npcsForMap` создаются каждый кадр безусловно, даже когда карта скрыта.

```ts
const othersForMap = Object.values(otherPlayers)...  // 371
const mobsForMap = Object.values(mobModels)...        // 384
const npcsForMap = Object.values(npcMeshes)...        // 396
```

Fix: создавать массивы только когда карта/миникарта открыты, или переиспользовать.

### 6. `client/src/cameraControls.ts:283-284` — `updateCamera()`

```ts
new THREE.Vector3(...)              // 283
pivot.clone().lerp(camera.position.clone().add(...))  // 284 — 2 клона
```

Fix: pre-allocated temp vectors.

---

## Medium (редкие, но накапливаются)

### 7. `client/src/network.ts:488-500` — реконнект

`room.onLeave` чистит `otherPlayers` audio, но **НЕ чистит**:
- `mobModels`
- `lootMeshes`
- `worldMeshes`
- `terrainMesh`
- `npcMeshes`
- `vegetation instanceMeshes`

При реконнекте `onStateChange` создаёт дубликаты в сцене.

### 8. `client/src/animationStateMachine.ts:113-114` — `clip.clone()` без кэша

При каждом `transitionTo()` с именем состояния — новый `AnimationClip`. Можно закэшировать.

---

## Low (малые)

### 9. `client/src/animationStateMachine.ts:200, 287` — `mixer.addEventListener('finished')`

Если one-shot анимация прервана (другая анимация, удаление модели), слушатель не вызывается и не удаляется.

### 10. `client/src/debug/collisionDebug.ts:16-21` — материал на каждый вызов

Создаёт/диспоузит материал каждый кадр (но не накапливается — диспоузит старый).

---

## Ранее исправленная критическая утечка

`main.ts:443-457` — в прошлом `addEventListener` на `renderer.domElement` и `window` были **внутри `loop()`**, что добавляло ~36000 слушателей за 5 минут. Сейчас вынесены в IIFE.

---

## Приоритет исправления

1. mobPlayer.ts (critical — самое дорогое)
2. collision.ts (critical — много аллокаций при движении)
3. input.ts (medium — каждый кадр)
4. cameraControls.ts / main.ts arrays (medium)
5. network.ts cleanup (medium — редкий сценарий, но потеря объектов)
