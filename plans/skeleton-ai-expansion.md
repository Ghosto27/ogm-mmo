# План расширения AI скелетов (Фазы 1-3) — АКТУАЛЬНОЕ СОСТОЯНИЕ

## Обзор

Реализована полная система AI скелетов: реакции на урон (`take_damage`), melee-атаки (slash01/slash02/stab), ranged-атака (throw_projectiles с проекцией кости), и улучшенное патрулирование. Все изменения внедрены и отлажены.

## Фаза 1: Реакции и подход

### 1.1 take_damage при получении урона

**Файл:** `server/src/MyRoom.ts:522-529`

При атаке по скелету:
```typescript
if (mob.mobType === 'skeleton') {
    mob.state = 'take_damage';
} else {
    const hitAnim = Math.random() < 0.5 ? 'idle_hitreact1' : 'idle_hitreact2';
    mob.state = hitAnim;
}
mob.targetId = client.sessionId;
```

На клиенте `take_damage` обрабатывается как one-shot в `mobPlayer.ts:399-410`.

### 1.2 walk_forward фаза подхода

Была запланирована, но в итоговой реализации заменена на `run_forward` для всех дистанций:
- Скелет ВСЕГДА бежит к цели (`run_forward`), нет медленного подхода
- Это сделано для более агрессивного поведения

**Константы (MyRoom.ts:544-549):**
```typescript
const SKELETON_DETECT_RANGE = 18;
const SKELETON_MELEE_RANGE = 3.0;
const SKELETON_RANGED_RANGE = 10;
const SKELETON_RUN_SPEED = 4.0;
const SKELETON_ATTACK_DMG = 15;
const SKELETON_ATTACK_COOLDOWN = 4000;
```

## Фаза 2: Дальняя атака (throw_projectiles)

### 2.1 Включение ranged атаки

`SKELETON_RANGED_RANGE = 10` — при дистанции 3-10 скелет может бросить кость, если ранее атаковал в melee (был в бою).

### 2.2 Логика выбора: melee vs ranged vs бег (ФИНАЛЬНАЯ)

**Логика АКТУАЛЬНАЯ (MyRoom.ts:578-629):**

```
dist <= SKELETON_MELEE_RANGE (3.0):
  → melee атака (slash01/slash02/stab)

wasInCombat && 3 < dist <= 10 && canAttack:
  → throw_projectiles (кость)
  → Урон: 70% от melee
  → Шанс попадания ~60% (на клиенте)

dist > 3 (approach):
  → run_forward (бежит к цели)
  → Коллизии учитываются
```

**Ключевые отличия от плана:**
- `walk_forward` НЕ используется в бою (только в патруле)
- Ranged атака работает ТОЛЬКО в режиме pursuit (если скелет уже атаковал в melee и игрок отбежал)
- Вместо `SKELETON_WALK_RANGE` (12) — сразу бег на любой дистанции
- Нет шага назад перед броском

### 2.3 Визуал проектайла (кость) на клиенте

**Файл:** `client/src/mobs/projectile.ts`

Система проектайлов:
- BoxGeometry (0.1, 0.1, 0.3) — вытянутый кубик (кость)
- Цвет: 0xcccccc
- Начало: позиция скелета (y=1.5)
- Конец: актуальная позиция игрока в момент броска (передаётся с сервера)
- Длительность: 600ms
- Дуга: Math.sin(t * Math.PI) * 0.5
- Кувырок: rotation.x += 0.1

**Accuracy spread (~60% hit chance):**
```typescript
if (Math.random() > accuracy) { // accuracy = 0.6
    const missAngle = Math.random() * Math.PI * 2;
    const missDist = 2 + Math.random() * 1.5;
    actualEndX += Math.cos(missAngle) * missDist;
    actualEndZ += Math.sin(missAngle) * missDist;
}
```

**Передача данных с сервера (MyRoom.ts:609-610):**
```typescript
this.broadcast("mobAttackAnim", { mobId, targetX: target.x, targetZ: target.z });
```

**На клиенте (mobPlayer.ts:460-481):**
- При `lowerState === 'throw_projectiles'` читает `pendingProjectileTargets[mobId]`
- Спавнит кость через `spawnBoneProjectile(x, z, targetX, targetZ, 0.6)`

**Переключение сцены (main.ts:52):**
```typescript
setProjectileScene(scene);
```
Вызывается после готовности модели.

## Фаза 3: Улучшение патрулирования

### 3.1 turn_left_90 / turn_right_90 при поворотах

**АКТУАЛЬНО (MyRoom.ts:718-724):**
```typescript
if (moved) {
    let diff = mob.patrolAngle - mob.rotationY;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    mob.rotationY += diff * 0.2;
}
```
**ВАЖНО:** В финальной версии `turn_left_90`/`turn_right_90` НЕ используются в патруле, т.к. ломали плавность поворота. Вместо них — плавная интерполяция `diff * 0.2`.

Анимации `turn_left_90`/`turn_right_90` доступны и загружены, но в бою также не используются.

### 3.2 spawn анимация при появлении

**Реализовано (MobSpawner.ts:68-78):**
```typescript
if (mobType === 'skeleton') {
    mob.state = 'spawn';
    setTimeout(() => {
        const currentMob = this.room.state.mobs.get(spawnedMobId);
        if (currentMob && currentMob.hp > 0) {
            currentMob.state = 'idle';
        }
    }, 1500); // длительность spawn анимации
}
```

### 3.3 idleTimer для разнообразия

**АКТУАЛЬНО (MyRoom.ts:694-740):**
```
PATROL_IDLE_DURATION = 16  // ~4 секунды стоять (16 * 250мс)
PATROL_WALK_DURATION = 8   // ~2 секунды идти (8 * 250мс)
PATROL_CYCLE = 24          // ~6 секунд полный цикл
```

- Во время idle: скелет стоит на месте (`idle`), поворачивается случайно
- Во время walk: `walk_forward` для скелетов, `walk` для волков
- scream удалён из патруля

## Изменяемые файлы (ФИНАЛЬНЫЙ СПИСОК)

| Файл | Изменения |
|------|-----------|
| `server/src/MyRoom.ts` | take_damage, skeleton AI (melee/ranged/approach), patrol система |
| `server/src/MobSpawner.ts` | spawn анимация при появлении скелета |
| `client/src/mobs/projectile.ts` | НОВЫЙ: система проектайлов с accuracy spread |
| `client/src/mobs/skeleton.ts` | Изначально: загрузка модели + ANIM_MAP |
| `client/src/mobPlayer.ts` | Импорт spawnBoneProjectile, invisible hitbox, falchion bone tracking |
| `client/src/main.ts` | updateProjectiles в loop(), setProjectileScene |
| `client/src/network.ts` | pendingProjectileTargets, обработка targetX/targetZ |

## Исправления после первоначальной реализации

| # | Проблема | Решение |
|---|----------|---------|
| 1 | Patrol turn анимации ломали патруль | Заменены на плавную интерполяцию diff * 0.2 |
| 2 | Projectile летел в wrong direction (sin/cos swap) | Исправлен расчёт направления: Math.atan2(endZ-startZ, endX-startX) |
| 3 | scream в патруле | Удалён, только idle |
| 4 | idleTimer слишком мал | Увеличен до ~4 секунд |
| 5 | Projectile целился в статическую цель | Добавлена передача targetX/targetZ в mobAttackAnim |
| 6 | "Walk" при подходе | Заменён на run_forward всегда (нет walk фазы) |
| 7 | Точность 100% | Добавлен accuracy spread ~60% |
| 8 | Player не может попасть по скелету | Добавлен invisible hitbox (CylinderGeometry 0.5x1.8) |
| 9 | Crash loot window + lock action mode | Добавлена проверка null для item, синхронизация action mode |
| 10 | Memory leak (event listeners) | Перенесены из loop() в module-level IIFE |
