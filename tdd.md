# Technical Design Document — OGM-MMO

## 1. Общее описание

OGM-MMO — браузерная многопользовательская ролевая игра (MMORPG) в низкополигональном 3D-стиле, вдохновлённая Old School RuneScape. Игроки исследуют открытый мир, сражаются с мобами и друг с другом, развивают персонажа, собирают ресурсы, крафтят предметы, торгуют и общаются в реальном времени.

| Атрибут | Значение |
|---|---|
| Жанр | MMORPG, Action RPG |
| Платформа | Web (браузер, WebGL 2.0+) |
| Целевая аудитория | игроки, знакомые с классическими MMO, любители ретро/low-poly эстетики |
| Режим игры | мультиплеер (до 100 игроков в комнате) |

---

## 2. Технологический стек

### Клиент (браузер)

| Технология | Назначение |
|---|---|
| Three.js | 3D-рендеринг, загрузка моделей (GLTF/GLB), анимации, пост-эффекты |
| Vite | сборка, dev-сервер, HMR |
| TypeScript | основной язык |
| CSS2DRenderer | никнеймы, подсказки над головами (синхронизировано с 3D) |
| Canvas API | миникарта, HP-бары в спрайтах |
| HTML/CSS | UI (инвентарь, панели, диалоги, чат, уведомления, окна профессий/торговли) |

### Сервер (Node.js)

| Технология | Назначение |
|---|---|
| Colyseus | мультиплеерный фреймворк (комнаты, схема-синхронизация, сообщения) |
| @colyseus/schema | описание и синхронизация структур данных |
| Express | CORS, раздача статики |
| ts-node-dev | разработка с hot-reload |

### Хранение данных

JSON-файлы на сервере:
- `players/` — данные игроков (инвентарь, экипировка, прогресс, профессии, gold)
- `resource_nodes.json` — расставленные в редакторе ресурсные ноды
- `vegetation_zones.json` — зоны растительности
- `mob_zones.json` — зоны спавна мобов
- `editor_objects.json` — статические объекты редактора
- `data/shop.json` — ассортимент и цены торговцев

В будущем возможна миграция на SQLite/Supabase.

### Сетевое взаимодействие

WebSocket (через Colyseus) — основной транспорт.

---

## 3. Архитектура клиента

### 3.1 Модульная структура (`client/src/`)

| Модуль | Назначение |
|---|---|
| `main.ts` | Инициализация, главный игровой цикл, обработка ввода/движения |
| `network.ts` | Подключение к Colyseus, обработка `onStateChange`, вызовы UI/анимаций |
| `sync/PlayerSyncManager.ts` | История позиций/HP, определение движения, урона, смерти |
| `player.ts` | Загрузка модели игрока (`player.glb`), создание экземпляров, FSM, HP-бары, теги |
| `mobPlayer.ts` | Загрузка моделей мобов (волки, скелеты), FSM, интерполяция позиций, bone tracking для оружия скелетов, `spawnBoneProjectile` |
| `animationStateMachine.ts` | Конечный автомат анимаций (циклические, одноразовые атаки/смерть) |
| `animationUtils.ts` | Интерполяция позиций игроков, обновление миксеров |
| `materials.ts` | toon-градиент, MeshToonMaterial, общие функции cloneMaterial |
| `postprocessing.ts` | Эффекты: OutlinePass, toon-шейдер (кастомный) |
| `scene.ts` | Создание Three.js-сцены, камеры, рендерера, освещения, ресайз |
| `cameraControls.ts` | Кастомная камера от третьего лица (OrbitControls заменён) |
| `input.ts` | Обработка WASD/стрелок, Shift, кликов, `getMovementInput` |
| `interaction.ts` | Атака по ПКМ, выделение цели по ЛКМ, открытие лута/станций/торговца (F) |
| `selection.ts` | Хранилище выделенной цели |
| `targetUI.ts` | Панель информации о цели |
| `playerUI.ts` | Панель игрока (HP, опыт, уровень, gold) |
| `characterPanel.ts` | Панель персонажа (C) — экипировка, статы. Diff-обновление слотов |
| `inventoryUI.ts` | Окно инвентаря (B), использование предметов, ПКМ-продажа, ПКМ-зелье. Diff-обновление слотов |
| `inventoryDnD.ts` | Drag-and-drop в инвентаре (перемещение, стакинг, сплит), Ctrl+Click, внешние drop-хендлеры |
| `tooltip.ts` | Всплывающие подсказки предметов |
| `damageNumbers.ts` | Всплывающие числа урона/хила (floating damage) |
| `itemColors.ts` | Цвета предметов + `createItemIcon()` (CSS background-image с fallback) |
| `minimap.ts` | Миникарта (canvas) |
| `worldMap.ts` | Большая карта (M) |
| `keyboard.ts` | Нормализация русских/английских клавиш |
| `collision.ts` | Система коллизий (сферы, цилиндры, OBB), слайдинг, ступеньки |
| `collisionConfig.ts` | Конфигурация коллизий (радиусы, смещения) |
| `render/` | Рендереры: WorldRenderer, NPCRenderer, LootRenderer, TerrainRenderer, VegetationRenderer, ResourceNodeRenderer |
| `ui/` | Интерфейс: DialogUI, LootWindowUI, BankUI, MerchantUI, CraftingUI, ProfessionsUI, AdminPanel, notificationUI |
| `mobs/` | Мобы: `projectile.ts` (система проектайлов кости), `skeleton.ts` (загрузка модели скелета + ANIM_MAP + handBone поиск) |
| `quest/` | Квесты: QuestJournalUI, questData |
| `chat/` | Чат: chatUI, chatInput, chatNetwork, speechBubble |
| `editor/` | Редактор карты: Editor.ts, EditorUI.ts, EditorState.ts |
| `debug/` | Отладка: collisionDebug.ts (визуализация коллизий), debugState.ts |
| `utils/modelLoader.ts` | Утилита загрузки и кэширования GLTF-моделей |
| `utils/fpsCounter.ts` | Счётчик FPS |

### 3.2 Графический конвейер

- Модели загружаются `GLTFLoader` и клонируются через `SkeletonUtils.clone()` (для игроков) или `modelLoader` (для объектов).
- Материалы — оригинальный MeshStandardMaterial сохраняется для цвета, toon-стиль достигается пост-эффектом (дизеринг цветов).
- Обводка — OutlinePass из `postprocessing.ts`.
- Ландшафт — `PlaneGeometry`, вершины смещаются по heightmap (изображение 2048×2048).
- Анимации — `AnimationMixer` + собственный FSM.
- Проектайлы — `BoxGeometry` + MeshToonMaterial, интерполяция с дугой и кувырком.

### 3.3 Система анимаций — AnimationStateMachine

- **Циклические состояния** (idle, walk, run) — плавный кроссфейд через `transitionTo`.
- **Одноразовые** (sword_attack, death, slash01, slash02, stab, throw_projectiles, take_damage, spawn, turn_left_90, consume и др.) — запускаются через `requestAttack()`, `playOneShot()`, `playDeath()`. После завершения автоматически возвращают в idle.
- **Возрождение** — `revive()` сбрасывает все флаги и запускает idle.
- **Мобы** используют тот же FSM, но без авто-возврата в idle (управляется серверным состоянием).
- One-shot анимации настроены через `setLoop(LoopOnce, 1) + clampWhenFinished = true`.

### 3.4 Система проектайлов (кости)

Файл: `client/src/mobs/projectile.ts`

- Хранилище активных проектайлов (mesh, startPos, endPos, startTime, duration).
- `spawnBoneProjectile(startX, startZ, endX, endZ, accuracy = 0.6)`:
  - При промахе: случайное отклонение 2-3 единицы в случайном направлении
  - Создаёт `BoxGeometry (0.1, 0.1, 0.3)` цвета `0xcccccc`
  - Поворот к цели через `Math.atan2`
- `updateProjectiles(deltaTime)`:
  - Линейная интерполяция `lerpVectors` + дуга `Math.sin(t * PI) * 0.5`
  - Кувырок `rotation.x += 0.1`
  - По завершении: удаление из сцены и `dispose` геометрии/материала

### 3.5 Invisible hitbox для скелетов

Скелеты имеют тонкие кости с большими промежутками, что делает raycast-проверку невозможной. Решение — добавление невидимого `CylinderGeometry (radius 0.5, height 1.8)` с `opacity 0` в `createSkeletonInstance()`.

### 3.6 Иконки предметов

Файл: `client/src/itemColors.ts`

Функция `createItemIcon(container, itemId, itemName)`:
- Пытается загрузить `background-image: url(/icons/<itemId>.png)` через `new Image()`.
- При успешной загрузке — отображает картинку.
- При отсутствии файла — цветной квадрат с первой буквой названия.
- Использует CSS `background-image` вместо `<img>` для предотвращения мерцания при ререндерах.

Иконки хранятся в `client/public/icons/`.

### 3.7 Diff-обновление UI слотов

Инвентарь, банк и экипировка отслеживают `lastSlotIds[i] = { id, qty }` и перерисовывают слот только при изменении содержимого. Устраняет мерцание при синхронизации 60fps.

---

## 4. Архитектура сервера

### 4.1 Комната (MyRoom.ts)

Состояние (`MyRoomState`) содержит карты (`MapSchema`): `players`, `mobs`, `lootBags`, `npcs`, `worldObjects`, `terrain`.

**Обработчики сообщений:**
- Движение: `move`
- Бой: `attack`, `attackMob`
- Инвентарь: `useItem`, `equipItem`, `unequipItem`, `equipItemToSlot`, `unequipToSlot`, `moveItem`, `splitItem`, `dropItem`, `lootItem`, `salvageItem`
- Взаимодействие: `interactNpc`, `dialogueChoice`, `interactStation` (furnace/anvil), `interactMerchant`
- Торговля: `getMerchantData`, `merchantBuyItem`, `merchantSellItem`
- Профессии: `gatherNode`
- Админка: `adminAddItem`, `adminAddXp`, `getAdminItemList`
- Редактор: `editorSave`, `editorSaveVegetationZones`, `editorSaveMobZones`, `editorSaveResourceNodes`, `getVegetationZones`, `getMobZones`, `getResourceNodes`, `editorRegenerateVegetationChunk`, `setGodMode`
- Чат: `chatMessage`

Игровой цикл мобов — `setInterval` 250 мс, обновляет позиции и состояния мобов с учётом коллизий.

**Сообщения сервер → клиент:**
- `attackAnim`, `mobAttackAnim`, `damageResult`, `attackResult`, `gatherResult`, `useItemResult`
- `dialogueStart`, `questProgress`, `questComplete`
- `merchantData`, `adminItemList`, `stationData`
- `chatMessage`, `notification`

### 4.2 AI скелетов

Трёхфазная система:
1. **MELEE** (dist ≤ 3.0): атака slash01 (40%) / slash02 (30%) / stab (30%), урон 15, кулдаун 4 сек
2. **RANGED** (dist 3-10, был в бою): throw_projectiles, урон 10 (70% от melee), кулдаун 2.8 сек
3. **APPROACH** (dist > 3): run_forward, скорость 4.0, коллизии через `applyMobMovementWithCollisions`

Определение "wasInCombat": если `mob.lastAttackTime` существует и прошло < 10 секунд.

### 4.3 Патрулирование

Цикл idle/walk через `idleTimer` (тики по 250 мс):
- **Idle фаза:** 16 тиков (~4 сек), моб стоит на месте (state = 'idle')
- **Walk фаза:** 8 тиков (~2 сек), движение в случайном направлении (walk_forward)
- **Полный цикл:** 24 тика (~6 сек)
- Плавный поворот `diff * 0.2` (без turn_left_90/right_90, которые ломали патруль)
- Волки используют idle_2/idle_2_headlow для разнообразия

### 4.4 Серверные схемы (`server/src/schemas/`)

| Схема | Описание |
|---|---|
| `NPC` | имя, позиция, доступные квесты |
| `WorldObject` | статические объекты (здания, деревья, камни, декорации) |
| `WorldTerrain` | параметры ландшафта |
| `ResourceNode` | рудная жила (id, nodeId, x, z, rotationY, state, respawnTimeMs) |
| `LootBag` | лут после смерти моба (items с item и quantity) |

### 4.5 Модели данных (`server/src/models/`)

| Модель | Описание |
|---|---|
| `Item` | база предметов (id, name, type, category, stats, requirements, maxStack, icon) |
| `ItemSlot` | слот предмета (item, quantity, bonusStats) |
| `Inventory` | экипировка и сумка. Поддержка maxStack для стакинга |
| `PlayerStats` | базовые и производные характеристики |
| `PlayerData` | полные данные игрока для сохранения (включая gold и professionEntries) |
| `ProfessionEntry` | уровень и опыт профессии |

### 4.6 Системы (`server/src/systems/`)

| Система | Описание |
|---|---|
| `EquipmentSystem` | надевание/снятие предметов, расчёт бонусов (strength, vitality, agility, intelligence). `applyBonuses()` с мультипликатором 1/-1. `recalculateStats()` пересчитывает все характеристики |
| `QuestManager` | выдача, прогресс, завершение квестов |
| `MobSpawner` | создание мобов в зонах спавна. Спавн-анимация для скелетов (1500ms). Respawn 10 сек. Лут: скелеты — кости + potion + 30% шанс sword; волки — potion + 20% шанс sword |
| `ResourceSpawner` | загрузка/сохранение `resource_nodes.json`, обновление состояний и респавн жил каждые 5 сек |
| `PlayerPersistence` | сохранение/загрузка игроков. `buildItemFromTemplate()` — восстановление предметов из itemDatabase. Вычисляемые поля (maxHp, expToLevel, attackPower и т.д.) не сохраняются |
| `LocationLoader` | загрузка статических объектов деревни |
| `VegetationSpawner` | генерация растительности по зонам |
| `ServerCollision` | проверка коллизий игроков и мобов с объектами деревни |

### 4.7 База данных предметов (`server/src/data/items.ts`)

`itemDatabase` — объект, где ключ = id предмета, значение = экземпляр `Item`. Категории:
- `_ore` — руды (iron_ore, copper_ore, tin_ore, coal_ore, gold_ore)
- `_bar` — слитки (iron_bar, copper_bar, tin_bar, steel_bar, gold_bar)
- `_sword` — оружие и броня (sword_01..05, helmet_01, chest_01, legs_01, boots_01)
- `potion` — зелья (potion_hp_01..05)
- `_loot` — лут (skeleton_bone, wolf_fang, wolf_pelt)

5 зелий здоровья:

| id | Heal | MaxStack |
|---|---|---|
| `potion_hp_01` | 50 HP | 10 |
| `potion_hp_02` | 120 HP | 10 |
| `potion_hp_03` | 250 HP | 5 |
| `potion_hp_04` | 500 HP | 5 |
| `potion_hp_05` | 1000 HP | 3 |

### 4.8 Редактор карты

- **Статические объекты** — размещение кубов, цилиндров и моделей, сохранение в `editor_objects.json`.
- **Зоны растительности** — рисование прямоугольных зон, сохранение в `vegetation_zones.json`.
- **Зоны мобов** — рисование круговых зон, сохранение в `mob_zones.json`.
- **Ресурсные ноды** — вкладка "⛏ Ресурсы", размещение рудных жил, `rotationY`, сохранение в `resource_nodes.json`.
- Все изменения применяются мгновенно без перезапуска сервера.

### 4.9 Административная панель (F10 → админка)

- **Список предметов** — динамическая загрузка с сервера (`getAdminItemList`), группировка `<optgroup>` по категориям (Руда/Слитки/Снаряжение/Расходники/Лут/Прочее).
- **Выдача предметов** — выбор предмета + количество.
- **XP** — выбор профессии (mining/blacksmithing/character) + количество. Character использует `addExperience()` для положительного и прямое уменьшение `player.exp` для отрицательного.

---

## 5. Сетевая модель (Colyseus)

- **Авторитетный сервер** — вся логика боя, квестов, инвентаря, крафта, торговли выполняется на сервере.
- Клиенты отправляют действия (`move`, `attack`, `attackMob`, `gatherNode`, `merchantBuyItem`, `salvageItem` и т.д.), сервер изменяет состояние и автоматически синхронизирует его через `MapSchema`.
- Для мгновенных событий используются обычные сообщения (`attackAnim`, `mobAttackAnim`, `dialogueStart`, `questProgress`, `attackResult`, `gatherResult`, `useItemResult`).
- `mobAttackAnim` для скелетов передаёт `targetX`/`targetZ` — позицию игрока в момент броска для точного прицеливания проектайла.
- Проверка коллизий на сервере (игроки и мобы не проходят сквозь стены).
- Y-координата игроков синхронизируется, что позволяет видеть подъём на лестницах и пандусах.

---

## 6. Игровые механики

### 6.1 Бой

- Атака по ПКМ (игрок) или ЛКМ (моб). Проверка дистанции на клиенте и сервере.
- Типы атак: normal, heavy (зависит от holdDuration), shift (25% крит).
- Урон зависит от `attackPower` атакующего и `defense` цели (+ модификаторы от типа атаки).
- Смерть запускает анимацию, труп скрывается через 3 сек.
- Возрождение через 5 сек в центре (0,0) с полным HP.

### 6.2 Инвентарь и экипировка

- 20 слотов инвентаря.
- Экипировка (C) — 7 слотов (helmet, chest, legs, boots, weapon, offhand, ring).
- Экипировка влияет на характеристики (strength, vitality, agility, intelligence, dexterity, luck).
- **Required Level:** попытка надеть предмет выше уровня → уведомление «Требуется уровень N».
- **Ctrl+ЛКМ:** быстрый перенос между инвентарём и банком (когда оба окна открыты).
- **Shift+ЛКМ:** разделение стака (split).
- Зелья используются по **ПКМ**, проверка `item.id?.startsWith('potion_hp')`. Сервер отправляет `useItemResult`, клиент показывает зелёное всплывающее число через `showFloatingDamage()`.
- **Drag-and-drop:** `moveItem` (стакинг одинаковых предметов), `splitItem` (разделение стака). Внешние drop-хендлеры через `registerDropHandler()`.

### 6.3 Банк

- 40 слотов, отдельное хранилище.
- Доступ через сундук в мире (20, -35).
- Shift+Click — перемещение предмета между инвентарём и банком (и обратно).
- Ctrl+Click — быстрый перенос (когда оба окна открыты).

### 6.4 Торговец

- NPC `merchant_01` (15, -35), зелёный куб.
- F → окно торговца (вкладки Покупка/Продажа).
- **Покупка:** список предметов с ценами, цена за единицу и за стак (`x{maxStack}`). Кнопка «Купить стак» только для стакаемых предметов.
- **Продажа:** ПКМ по предмету в инвентаре → confirm-диалог с ползунком для стаков.
- Индикатор gold в HUD.
- Авто-закрытие при расстоянии > 4.

### 6.5 Профессии

#### Mining
- Сбор руды из ресурсных нод (F рядом с жилой).
- Повышает уровень mining, XP растёт с каждым уровнем.
- Рецепты требуют определённый уровень mining.

#### Blacksmithing
- **Плавка (Furnace, 5, -35):** руда → слитки.
- **Ковка (Anvil, 10, -35):** слитки → оружие/броня.
- **Salvage (разбор, Anvil):** возврат 20-30% ресурсов от стоимости крафта + 30% XP. Рецепты в `recipes.ts`.
- Шанс успеха: базовый (85-100%) + 2.5% за уровень сверх требования, cap 100%.
- Бонус-шанс на доп выход: `bonusChance × (1 + 0.25 × (level − reqLevel))`, cap 50%.

### 6.6 Ресурсные ноды

- Отдельные объекты в мире, расставленные через редактор (F10 → ⛏ Ресурсы).
- **Модель:** `ores.gltf` (2 меша: Iron_Ore, Iron_Rock) + 5 PBR-текстур (512×512) в `textures/ores/`. Все типы руд — клоны с перекраской материала.
- **Респавн:** случайный таймер per node, обновляется каждые 5 сек через `ResourceSpawner`.
- **Посадка:** через `getTerrainHeightAt` (более точная, чем `getTerrainHeightAtFast`).

### 6.7 Скелеты

| Атрибут | Значение |
|---|---|
| Модель | skeleton.glb + falchion.glb (bone tracking к RightHand с калибровкой `rot(0,180,115) + pos(-0.1,0,0.09)`) |
| Анимации | idle, walk_forward, run_forward, slash01, slash02, stab, throw_projectiles, take_damage, death, scream, spawn, fall, jump, revive, turn_left_90, turn_right_90, underground |
| HP | 150 |
| Уровень | 3 |
| Награда | 80 exp |
| Урон | 15 |
| Лут | кости (1-3), potion_hp_01 (6), 30% шанс sword_01 |
| Кулдаун атаки | 4 сек (melee), 2.8 сек (ranged) |

### 6.8 Проектайлы (кость)

| Атрибут | Значение |
|---|---|
| Визуал | BoxGeometry (0.1 × 0.1 × 0.3), цвет 0xcccccc |
| Траектория | lerp + дуга Math.sin(t × π) × 0.5 + кувырок rotation.x += 0.1 |
| Точность | 60% шанс попадания, промах = отклонение 2-3 ед. |
| Длительность | 600 мс, после dispose |
| Спавн | на клиенте при получении `mobAttackAnim` |

### 6.9 Волки

| Атрибут | Значение |
|---|---|
| Модель | Wolf.gltf (оригинальные анимации) |
| Анимации | idle, walk, gallop, gallop_jump, attack, death, idle_hitreact1, idle_hitreact2 |
| HP | 100 |
| Уровень | 1 |
| Награда | 50 exp |
| Урон | 10 |
| Лут | potion_hp_01 (1), 20% шанс sword_01 |
| Дистанция детекта | 12 ед. |
| Атака | dist ≤ 3, кулдаун 1.5 сек |
| Скорость | walk 2.5 / gallop 4.0 |

### 6.10 Квесты

- Выдаются NPC через диалоговую систему.
- Прогресс убийства мобов засчитывается автоматически.
- Награда — опыт.
- Окно квестов (J).

### 6.11 Ландшафт и мир

- Рельеф на основе heightmap (2048×2048).
- Все объекты привязаны к рельефу через `getTerrainHeightAtFast` (интерполяция по карте высот).
- Динамические коллизии с OBB, слайдинг, поддержка ступенек.

### 6.12 Коллизии

| Тип | Коллайдер |
|---|---|
| Игрок | сфера, radius 0.4 |
| Другие игроки | сфера, radius 0.5 |
| Мобы | сфера, radius 0.6 |
| Статические объекты | OBB, цилиндры или сферы |

Слайдинг вдоль стен, step climbing для небольших препятствий.
Визуализация коллизий (клавиша P) для отладки.

---

## 7. Сохранение и загрузка игрока

- **Формат:** в файле только id предмета, количество и кастомные бонусы (если отличаются от шаблона). Характеристики предметов берутся из `itemDatabase` на сервере через `buildItemFromTemplate()`.
- **Вычисляемые поля не сохраняются:** `maxHp`, `expToLevel`, `attackPower`, `defense`, `critChance`, `xpToNext` восстанавливаются по формулам при загрузке.
- **Формулы:**
  - `expToLevel = floor(100 × 1.5^(level-1))`
  - `profession.xpToNext = floor(100 × level^1.5)`
  - `maxHp = 100 + level × 10 + vitality × 5`
  - `attackPower = strength × 2`
  - `defense = floor(vitality × 0.5)`
  - `critChance = min(50, dexterity × 0.5 + luck × 0.2)`
- **Gold** — отдельное поле у игрока (не предмет в инвентаре).
- **Unknown Item:** если предмета нет в `itemDatabase`, создаётся заглушка с id и именем "Unknown Item".

---

## 8. Соглашения и паттерны

- **Язык:** TypeScript (strict: true).
- **Масштаб:** 1 единица Three.js = 1 метр. Рост игрока ~1.8 м, волка ~1.2 м, скелета ~1.8 м.
- **Стиль кода:** Модули ES6, экспорты по именам.
- **FSM:** Один экземпляр AnimationStateMachine на каждого игрока/моба; управляется через методы, а не прямые вызовы.
- **UI:** HTML/CSS поверх canvas; CSS2DRenderer для меток в 3D.
- **Сохранения:** Игрок сохраняется при выходе, смерти, получении опыта, экипировке.

---

## 9. Точки расширения (на будущее)

- Звуки — подключение THREE.AudioListener
- Торговля между игроками — безопасный обмен через комнату
- Новые профессии — Woodcutting, Foraging, Alchemy
- База данных — замена JSON на SQLite/Supabase
- Инстансы (подземелья) — отдельные комнаты для групп
- Качество крафта — бонусы в зависимости от уровня
- Групповое копирование/вставка в редакторе
- LOD-система для растительности
- Система частиц (спецэффекты)
- Spatial partitioning для серверного AI
