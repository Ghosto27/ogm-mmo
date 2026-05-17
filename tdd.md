Technical Design Document — OGM-MMO (актуальная версия)

1. Общее описание
OGM-MMO — браузерная многопользовательская ролевая игра (MMORPG) в низкополигональном 3D-стиле,
вдохновлённая Old School RuneScape. Игроки исследуют открытый мир, сражаются с мобами и друг с другом,
развивают персонажа, собирают добычу и общаются в реальном времени.

Жанр: MMORPG, Action RPG.

Платформа: Web (браузер, WebGL 2.0+).

Целевая аудитория: игроки, знакомые с классическими MMO, любители ретро/low-poly эстетики.

Режим игры: мультиплеер (до 100 игроков в комнате).

2. Технологический стек
Клиент (браузер)
Three.js — 3D-рендеринг, загрузка моделей (GLTF/GLB), анимации, пост-эффекты.

Vite — сборка, dev-сервер, HMR.

TypeScript — основной язык (клиент и сервер).

CSS2DRenderer — никнеймы, подсказки над головами (синхронизировано с 3D).

Canvas API — миникарта, HP-бары в спрайтах.

HTML/CSS — UI (инвентарь, панели персонажа, диалоги, чат, уведомления).

Сервер (Node.js)
Colyseus — мультиплеерный фреймворк (комнаты, схема-синхронизация, сообщения).

@colyseus/schema — описание и синхронизация структур данных.

Express — CORS, раздача статики.

ts-node-dev — разработка с hot-reload.

Хранение данных
JSON-файлы на сервере (позиции, инвентарь, экипировка, прогресс квестов, зоны спавна, объекты редактора).
В будущем возможна миграция на SQLite/Supabase.

Сетевое взаимодействие
WebSocket (через Colyseus) — основной транспорт.

3. Архитектура клиента
3.1 Модульная структура (client/src/)
Все файлы разбиты по функциональности:

Модуль  Назначение
main.ts Инициализация, главный игровой цикл, обработка ввода/движения
network.ts  Подключение к Colyseus, обработка onStateChange, вызовы UI/анимаций
sync/PlayerSyncManager.ts История позиций/HP, определение движения, урона, смерти
player.ts Загрузка модели игрока, создание экземпляров, FSM, HP-бары, теги
mobPlayer.ts  Загрузка моделей мобов (волки, скелеты), FSM, интерполяция позиций,
              bone tracking для оружия скелетов (falchion), spawnBoneProjectile вызов
animationStateMachine.ts  Конечный автомат анимаций (циклические, одноразовые атаки/смерть)
animationUtils.ts Интерполяция позиций игроков, обновление миксеров
materials.ts  toon-градиент, MeshToonMaterial, общие функции cloneMaterial
postprocessing.ts Эффекты: OutlinePass, toon-шейдер (кастомный)
scene.ts  Создание Three.js-сцены, камеры, рендерера, освещения, ресайз
cameraControls.ts Кастомная камера от третьего лица (OrbitControls заменён)
input.ts  Обработка WASD/стрелок, Shift, кликов, getMovementInput
interaction.ts  Атака по ПКМ, выделение цели по ЛКМ, открытие лута (F)
selection.ts  Хранилище выделенной цели
targetUI.ts Панель информации о цели
playerUI.ts Панель игрока (HP, опыт, уровень)
characterPanel.ts Панель персонажа (C) — экипировка, статы
inventoryUI.ts  Окно инвентаря (I), использование предметов
inventoryDnD.ts  Drag-and-drop в инвентаре (перемещение, стакинг, сплит)
tooltip.ts  Всплывающие подсказки предметов
minimap.ts  Миникарта (canvas)
worldMap.ts Большая карта (M)
damageNumbers.ts  Всплывающие числа урона (floating damage)
render/ Рендереры: WorldRenderer, NPCRenderer, LootRenderer, TerrainRenderer, VegetationRenderer
ui/ Интерфейс: DialogUI, LootWindowUI, notificationUI
mobs/  Мобы: projectile.ts (система проектайлов кости), skeleton.ts (загрузка модели скелета + ANIM_MAP + handBone поиск)
quest/  Квесты: QuestJournalUI, questData
chat/ Чат: chatUI, chatInput, chatNetwork, speechBubble
keyboard.ts Нормализация русских/английских клавиш
collision.ts  Система коллизий (сферы, цилиндры, OBB), слайдинг, ступеньки
collisionConfig.ts  Конфигурация коллизий (радиусы, смещения)
editor/ Редактор карты: Editor.ts, EditorUI.ts, EditorState.ts
debug/  Отладка: collisionDebug.ts (визуализация коллизий), debugState.ts
utils/modelLoader.ts  Утилита загрузки и кэширования GLTF-моделей
utils/fpsCounter.ts  Счётчик FPS

3.2 Графический конвейер
Модели загружаются GLTFLoader и клонируются через SkeletonUtils.clone() (для игроков) или modelLoader (для объектов).

Материалы — оригинальный MeshStandardMaterial сохраняется для цвета, а toon-стиль достигается пост-эффектом (дизеринг цветов).

Обводка — OutlinePass из postprocessing.

Ландшафт — PlaneGeometry, вершины смещаются по heightmap (изображение 2048x2048 или 256x256).

Анимации — AnimationMixer + собственный FSM (см. п. 3.3).

Проектайлы — BoxGeometry + MeshToonMaterial, интерполяция с дугой и кувырком (см. projectile.ts).

3.3 Система анимаций — AnimationStateMachine
Циклические состояния (idle, walk, run) — плавный кроссфейд через transitionTo.

Одноразовые (sword_attack, death, slash01, slash02, stab, throw_projectiles, take_damage, spawn, turn_left_90 и др.) — запускаются через requestAttack(), playOneShot(), playDeath().
После завершения автоматически возвращают в idle.

Возрождение — revive() сбрасывает все флаги и запускает idle.

Мобы используют тот же FSM, но без авто-возврата в idle (управляется серверным состоянием).

One-shot анимации настроены через setLoop(LoopOnce, 1) + clampWhenFinished = true.

3.4 Система проектайлов (кости)
Файл: client/src/mobs/projectile.ts

Хранилище активных проектайлов (mesh, startPos, endPos, startTime, duration).
spawnBoneProjectile(startX, startZ, endX, endZ, accuracy = 0.6):
  - При промахе: случайное отклонение 2-3 единицы в случайном направлении
  - Создаёт BoxGeometry (0.1, 0.1, 0.3) цвета 0xcccccc
  - Поворот к цели через Math.atan2
  - Добавляет в сцену и activeProjectiles
updateProjectiles(deltaTime):
  - Линейная интерполяция lerpVectors + дуга Math.sin(t * PI) * 0.5
  - Кувырок rotation.x += 0.1
  - По завершении: удаление из сцены и dispose геометрии/материала

3.5 Invisible hitbox для скелетов
Скелеты имеют тонкие кости с большими промежутками, что делает raycast-проверку
клика/атаки невозможной. Решение — добавление невидимого CylinderGeometry (radius 0.5, height 1.8)
с opacity 0 в createSkeletonInstance() (mobPlayer.ts:267-277).

4. Архитектура сервера
4.1 Комната (MyRoom.ts)
Состояние (MyRoomState) содержит карты (MapSchema):
players, mobs, lootBags, npcs, worldObjects, terrain.

Обработчики сообщений: move, attack, attackMob, interactNpc, dialogueChoice,
chatMessage, useItem, equipItem, unequipItem, lootItem, moveItem, dropItem,
equipItemToSlot, unequipToSlot, splitItem,
editorSave, editorSaveVegetationZones, editorSaveMobZones,
getVegetationZones, getMobZones, editorRegenerateVegetationChunk, setGodMode.

Игровой цикл мобов — setInterval 250 мс, обновляет позиции и состояния мобов с учётом коллизий.

4.2 AI скелетов (MyRoom.ts:578-629)
Трёхфазная система:
1. MELEE (dist <= 3.0): атака slash01 (40%) / slash02 (30%) / stab (30%), урон 15, кулдаун 4 сек
2. RANGED pursuit (dist 3-10, был в бою): throw_projectiles, урон 10 (70% от melee), кулдаун 2.8 сек
3. APPROACH (dist > 3): run_forward, скорость 4.0, коллизии через applyMobMovementWithCollisions

Определение "wasInCombat": если mob.lastAttackTime существует и прошло < 10 секунд.

4.3 Патрулирование (MyRoom.ts:690-740)
Цикл idle/walk через idleTimer (тики по 250мс):
- idle фаза: 16 тиков (~4 сек), скелет стоит на месте (state = 'idle')
- walk фаза: 8 тиков (~2 сек), движение в случайном направлении (walk_forward)
- Полный цикл: 24 тика (~6 сек)
- Плавный поворот diff * 0.2 (без turn_left_90/right_90, которые ломали патруль)
- Волки используют idle_2/idle_2_headlow для разнообразия

4.4 Серверные схемы (в server/src/schemas/)
NPC — имя, позиция, доступные квесты.

WorldObject — статические объекты (здания, деревья, камни, декорации).

WorldTerrain — параметры ландшафта.

LootBag — лут после смерти моба (содержит items с item и quantity).

4.5 Модели данных (server/src/models/)
Item, ItemSlot, Inventory — экипировка и сумка. Поддержка maxStack для стакинга.

PlayerStats — базовые и производные характеристики.

PlayerData — полные данные игрока для сохранения.

4.6 Системы (server/src/systems/)
EquipmentSystem — надевание/снятие предметов, расчёт бонусов (strength, vitality, agility, intelligence).
  applyBonuses() с мультипликатором 1/-1 для добавления/удаления бонусов.
  recalculateStats() пересчитывает все характеристики из базовых + бонусы.

QuestManager — выдача, прогресс, завершение квестов.

MobSpawner — создание мобов в зонах спавна (wolfSpawnZones, skeletonSpawnZones).
  Поддержка spawn-анимации для скелетов (setTimeout 1500ms → idle).
  Respawn через 10 секунд после смерти в той же зоне.
  Разный лут: скелеты — кости + potion + 30% шанс sword; волки — potion + 20% шанс sword.

LocationLoader — загрузка статических объектов деревни (может быть отключена).

PlayerPersistence — сохранение/загрузка данных игрока в JSON (при выходе, смерти, получении опыта, экипировке).

VegetationSpawner — генерация растительности по зонам (может быть отключена).

ServerCollision — проверка коллизий игроков и мобов с объектами деревни.

4.7 Редактор карты
Статические объекты — размещение кубов, цилиндров и моделей с сохранением в editor_objects.json.

Зоны растительности — рисование прямоугольных зон, сохранение в vegetation_zones.json.

Зоны мобов — рисование круговых зон, сохранение в mob_zones.json.

Все изменения применяются мгновенно без перезапуска сервера.

5. Сетевая модель (Colyseus)
Авторитетный сервер — вся логика боя, квестов, инвентаря выполняется на сервере.

Клиенты отправляют действия (move, attack, attackMob), сервер изменяет состояние и автоматически синхронизирует его через MapSchema.

Для мгновенных событий используются обычные сообщения (attackAnim, mobAttackAnim, dialogueStart, questProgress, attackResult).

mobAttackAnim для скелетов передаёт targetX/targetZ — позицию игрока в момент броска, для точного прицеливания проектайла.

Добавлена проверка коллизий на сервере (игроки и мобы не проходят сквозь стены).

Y-координата игроков синхронизируется, что позволяет видеть подъём на лестницах и пандусах.

6. Игровые механики
6.1 Бой
Атака по ПКМ (игрок) или ЛКМ (моб). Проверка дистанции на клиенте и сервере.

Типы атак: normal, heavy (зависит от holdDuration), shift (25% крит).

Урон зависит от attackPower атакующего и defense цели (+ модификаторы от типа атаки).

Смерть запускает анимацию, труп скрывается через 3 сек.

Возрождение через 5 сек в центре (0,0) с полным HP.

6.2 Инвентарь и экипировка
Экипировка влияет на характеристики (сила, живучесть и т.д.).

Зелья используются по ПКМ, мгновенно восстанавливают HP.

Drag-and-drop: moveItem (стакинг одинаковых предметов), splitItem (разделение стака).

6.3 Квесты
Выдаются NPC через диалоговую систему.

Прогресс убийства мобов засчитывается автоматически.

Награда — опыт.

6.4 Ландшафт и мир
Рельеф на основе heightmap (2048x2048, maxHeight задаёт масштаб высот).

Все объекты привязаны к рельефу через getTerrainHeightAtFast (интерполяция по карте высот).

Динамические коллизии с OBB, слайдинг, поддержка ступенек.

6.5 Коллизии
Игрок использует сферический коллайдер (radius = 0.4).

Статические объекты представлены OBB, цилиндрами или сферами.

Слайдинг вдоль стен, step climbing для небольших препятствий.

Dynamic colliders: другие игроки (radius 0.5) и мобы (radius 0.6).

Визуализация коллизий (включается клавишей P) для отладки.

6.6 Редактор карты (внутриигровой)
Переключение режима: клавиша F10.

Свободная камера, TransformControls, панель свойств.

Групповое выделение (Shift+клик), удаление, привязка к земле.

Сохранение/загрузка через сервер.

6.7 Мобы: скелеты
Модель: skeleton.glb + falchion.glb (оружие, привязано к кости RightHand через bone tracking).

Анимации (маппинг Skeleton_xxx → xxx): idle, walk_forward, run_forward, slash01, slash02, stab,
throw_projectiles, take_damage, death, scream, spawn, fall, jump, revive,
turn_left_90, turn_right_90, underground.

Falchion bone tracking: каждый кадр вычисляется мировое положение кости RightHand,
конвертируется в локальное пространство модели, применяется calibrated offset
(_rot(0, 180, 115) + _pos(-0.1, 0.00, 0.09)).

Характеристики: HP 150, уровень 3, награда 80 exp, урон 15.

Лут: кости (1-3шт), potion_hp_01 (6шт), 30% шанс sword_01.

6.8 Проектайлы (кость)
Визуал: вытянутый бокс (0.1 x 0.1 x 0.3) серого цвета.

Траектория: линейная интерполяция + дуга (Math.sin(t * PI) * 0.5) + кувырок (rotation.x += 0.1).

Точность: 60% шанс попасть в цель, при промахе — отклонение 2-3 единицы.

Длительность: 600ms, после чего удаляется из сцены с dispose геометрии/материала.

Спавн: при throw_projectiles на клиенте (mobPlayer.ts), с использованием позиции цели от сервера.

6.9 Мобы: волки
Модель: Wolf.gltf (оригинальные анимации).

Анимации: idle, walk, gallop, gallop_jump, attack, death, idle_hitreact1, idle_hitreact2.

AI: детект 12 единиц, атака при dist <= 3, скорость walk 2.5 / gallop 4.0, кулдаун 1.5 сек, урон 10.

Характеристики: HP 100, уровень 1, награда 50 exp.

Лут: potion_hp_01 (1шт), 20% шанс sword_01.

7. Соглашения и паттерны
Язык: TypeScript (strict: true).

Масштаб: 1 единица Three.js = 1 метр. Рост игрока ~1.8 м, волка ~1.2 м, скелета ~1.8 м.

Стиль кода: Модули ES6, экспорты по именам.

FSM: Один экземпляр AnimationStateMachine на каждого игрока/моба; управляется через методы, а не прямые вызовы.

UI: HTML/CSS поверх canvas; CSS2DRenderer для меток в 3D.

Сохранения: Игрок сохраняется при выходе, смерти, получении опыта, экипировке.

8. Точки расширения (на будущее)
Звуки — подключение THREE.AudioListener.

Новые мобы/боссы — добавление схем и FSM-состояний. Скелеты уже имеют архитектуру для расширения.

Торговля между игроками — безопасный обмен через комнату.

Профессии — крафт, сбор ресурсов.

База данных — замена JSON на SQLite/Supabase для надёжности.

Инстансы (подземелья) — отдельные комнаты для групп.

Групповое копирование/вставка в редакторе.

LOD-система для растительности.

Улучшенная система частиц (спецэффекты).

Точность проектайлов — возможность улучшить/изменить через параметр accuracy.

Spatial partitioning для серверного AI (замена глобального forEach по всем мобам).
