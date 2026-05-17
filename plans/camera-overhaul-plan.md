# План переработки камеры игрока

## Текущая проблема

**Файл:** [`client/src/cameraControls.ts`](client/src/cameraControls.ts:5-10)

```typescript
let theta = 0;                     // горизонтальный угол
let phi = Math.PI / 4;            // вертикальный угол (от верхней оси Y)
let distance = 5;
const MIN_PHI = 0.1;              // ~5.7 градусов от вертикали
const MAX_PHI = Math.PI / 2.2;    // ~81.8 градусов от вертикали
```

Камера использует **сферические координаты** с pivor-точкой над головой игрока (`cameraTarget.y + 1.4`).

**Почему нельзя поднять камеру выше горизонта:**
- `phi = 0` = камера строго сверху (вид сверху вниз)
- `phi = PI/2` = камера на уровне горизонта
- `phi = PI` = камера строго снизу (вид снизу вверх)
- `MIN_PHI = 0.1` — камера может быть почти сверху (над головой)
- `MAX_PHI = 1.428` — камера может опуститься почти до горизонта, но НЕ ниже

**Фактически:** камера ВСЕГДА находится выше игрока и смотрит на него сверху вниз. Игрок может вращать камеру вокруг вертикальной оси и менять дистанцию, но не может поднять взгляд выше горизонта.

---

## Варианты решения

### Вариант 1: Полноценная орбитальная камера (свободное вращение)

Изменить `MIN_PHI` и `MAX_PHI` на полный диапазон 0..PI, добавить коллизию камеры с землёй.

```typescript
const MIN_PHI = 0.05;    // почти над головой
const MAX_PHI = Math.PI - 0.05;  // почти под ногами
```

**Плюсы:**
- Минимальные изменения кода
- Можно смотреть куда угодно
- Привычно для игроков MMO

**Минусы:**
- Камера проходит сквозь землю
- Неудобно целиться (нет фиксированной позиции за плечом)
- При взгляде вверх игрок закрывает обзор

**Изменяемые файлы:** только [`client/src/cameraControls.ts`](client/src/cameraControls.ts)

---

### Вариант 2: Over-the-Shoulder камера (как в Gears of War / Fortnite)

Камера всегда находится за правым (или левым) плечом игрока, слегка смещена в сторону.

**Ключевые параметры:**
```
Offset:        (0.5, 0.3, 0)  — правое плечо
Distance:      3-5 единиц
Vertical:      -30..+60 градусов от горизонта (полноценный подъём)
```

**Плюсы:**
- Отлично для прицеливания (лук, магия)
- Игрок видит своего персонажа
- Можно смотреть вверх и вниз
- Естественно для action-игр

**Минусы:**
- Нужна обработка коллизий камеры со стенами/землёй
- При движении назад камера может упереться в препятствие
- Больше изменений в коде

**Изменяемые файлы:**
- [`client/src/cameraControls.ts`](client/src/cameraControls.ts) — полная переработка
- [`client/src/main.ts`](client/src/main.ts) — обновление вызова камеры
- [`client/src/input.ts`](client/src/input.ts) — camera-relative movement (возможно)
- [`client/src/interaction.ts`](client/src/interaction.ts) — raycasting для прицеливания

---

### Вариант 3: Гибрид (RuneScape style + Free Look)

Камера по умолчанию изометрическая (сверху), но при зажатии ПКМ или enter-aim-mode переключается в over-the-shoulder.

**Плюсы:**
- Лучшее из двух миров
- Можно играть в классическом RuneScape стиле
- Aim-mode для боя с луком/магией

**Минусы:**
- Сложнее в реализации
- Два режима камеры = больше багов
- Нужен плавный переход между режимами

---

## Рекомендация: Вариант 2 (Over-the-Shoulder)

Для игры с прицеливанием (лук, магия) это оптимальный выбор.

### Архитектура новой камеры

```
       [Camera]
         |
         | distance
         |
    [Shoulder Offset]    ← смещение относительно pivot
         |
         | offset (0.5 right, 0.3 up)
         |
      [Pivot]            ← позиция игрока + высота груди
         |
         | 1.2 units
         |
    [Player Model]
```

### Параметры

```typescript
interface OverShoulderCamera {
    // Позиционирование
    shoulderOffset: THREE.Vector3;   // смещение плеча (x: 0.5, y: 0.3, z: 0)
    distance: number;                // дистанция от плеча (3-5)
    minDistance: number;             // 1.5
    maxDistance: number;             // 8
    
    // Вращение (относительно горизонта)
    pitch: number;                   // вертикальный угол (-30..+60 градусов)
    yaw: number;                     // горизонтальный угол (вокруг игрока)
    minPitch: number;                // -0.5 rad (~-30 deg)
    maxPitch: number;                // 1.0 rad (~+60 deg)
    
    // Режимы
    isAiming: boolean;               // прицеливание
    zoomFactor: number;              // 1.0 = normal, 0.6 = zoom при прицеливании
    
    // Сглаживание
    lerpSpeed: number;               // 5-10 для плавного следования
}
```

### Логика обновления (псевдокод)

```typescript
function updateCamera(deltaTime: number) {
    // 1. Получаем pivot = позиция игрока + высота груди
    const pivot = playerPosition.clone().add(new THREE.Vector3(0, 1.2, 0));
    
    // 2. Вычисляем идеальную позицию камеры в мировых координатах
    //    Сначала поворот yaw вокруг вертикальной оси (оси Y)
    const horizontalDir = new THREE.Vector3(
        Math.sin(yaw),
        0,
        Math.cos(yaw)
    ).normalize();
    
    //    Затем подъём по pitch
    const cameraDir = new THREE.Vector3(
        horizontalDir.x * Math.cos(pitch),
        Math.sin(pitch),
        horizontalDir.z * Math.cos(pitch)
    ).normalize();
    
    //    3. Смещение вправо (shoulder offset) — перпендикулярно направлению камеры
    const rightDir = new THREE.Vector3().crossVectors(cameraDir, UP).normalize();
    const shoulderPos = pivot.clone().add(rightDir.clone().multiplyScalar(0.5));
    
    //    4. Финальная позиция камеры
    const idealPos = shoulderPos.clone().add(cameraDir.clone().multiplyScalar(distance));
    
    //    5. Коллизия камеры с terrain и объектами (raycast от pivot к idealPos)
    //    Если есть препятствие — приблизить камеру
    
    //    6. Сглаживание (lerp текущей позиции к idealPos)
    camera.position.lerp(idealPos, Math.min(1, lerpSpeed * deltaTime));
    camera.lookAt(pivot);
}
```

### Обработка коллизий камеры

**Проблема:** камера может проходить сквозь terrain, стены, деревья.

**Решение:** Raycast от pivot (плеча) к idealPos. Если raycast находит препятствие — сократить distance до точки пересечения.

```typescript
// Используем Raycaster или простой terrain height check
const raycaster = new THREE.Raycaster(shoulderPos, cameraDir.clone().negate());
const intersects = raycaster.intersectObjects(collisionMeshes);
if (intersects.length > 0) {
    const hitDistance = intersects[0].distance;
    if (hitDistance < distance) {
        camera.position.copy(shoulderPos).add(cameraDir.clone().multiplyScalar(hitDistance - 0.3));
    }
}
```

### Aim Mode (для лука/магии в будущем)

При активации лука или магии:

```
1. Камера приближается (distance *= 0.6)
2. Показывается перекрестие (crosshair)
3. Движение мыши вращает камеру (pitch/yaw)
4. Player model поворачивается в направлении камеры
5. ЛКМ = выстрел/каст в направлении перекрестия
```

---

## План изменений по файлам

### Файл 1: [`client/src/cameraControls.ts`](client/src/cameraControls.ts)
**Действие:** Полная переработка
- Замена spherical coordinates на over-the-shoulder
- Добавление `pitch`, `yaw`, `shoulderOffset`
- Camera collision detection
- Aim mode support (флаги, zoom)
- Сглаживание (lerp)

### Файл 2: [`client/src/main.ts`](client/src/main.ts)
**Действие:** Обновление вызова камеры
- В секции "Камера следует за игроком" (строки 350-356):
  - Убрать `_box.setFromObject` / `_box.getCenter`
  - Передавать только позицию игрока + высоту
  - Вызывать `updateCamera(deltaTime)` для lerp

### Файл 3: [`client/src/input.ts`](client/src/input.ts)
**Действие:** Минимальные изменения
- `getCameraRelativeMovement` должна использовать новую камеру (уже работает через `camera.getWorldDirection`)

### Файл 4: [`client/src/interaction.ts`](client/src/interaction.ts)
**Действие:** Обновление raycast для атаки/клика
- При aim-mode: raycast из центра экрана (crosshair direction)
- При normal-mode: существующая логика

### Файл 5: [`client/src/scene.ts`](client/src/scene.ts)
**Действие:** Возможно изменить FOV
- Добавить поддержку zoom (изменение FOV для aim-mode)

---

## Последовательность внедрения

| Шаг | Что сделать | Файлы | Риски |
|-----|-------------|-------|-------|
| 1 | Переписать cameraControls.ts на over-the-shoulder | cameraControls.ts | Нужно протестировать все углы |
| 2 | Обновить main.ts (вызов updateCamera с deltaTime) | main.ts | Ломается движение при ошибке |
| 3 | Добавить сглаживание (lerp) | cameraControls.ts | Может вызывать укачивание |
| 4 | Добавить коллизию камеры | cameraControls.ts + collidable meshes | Сложность определения стен |
| 5 | Обновить input.ts для aim-mode | input.ts | Мало изменений |
| 6 | Обновить interaction.ts для raycast из камеры | interaction.ts | Критично для атак |
| 7 | Тестирование: движение, атака, прицеливание | - | - |

---

## Вопросы для обсуждения

1. **С какой стороны плечо?** Правое (стандарт) или левое/настраиваемое?
2. **Анимация поворота игрока?** Должен ли игрок автоматически поворачиваться лицом в сторону камеры при движении (как сейчас) или независимо (как в шутерах)?
3. **Чувствительность мыши?** Оставить как есть или изменить для новой системы углов?
4. **Нужен ли отдельный Aim Mode** или камера всегда в over-the-shoulder?
5. **Дистанция по умолчанию?** Сейчас 5, для over-the-shoulder может быть 3-4.
