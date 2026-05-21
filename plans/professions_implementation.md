# Профессии (Mining + Blacksmithing) — Итог

## Фаза 1 — Schema + Данные (фундамент)

### 1.1 Новые Schema

- `server/src/models/ProfessionEntry.ts` — `{ level, xp, xpToNext }` с методом `addXp()`
- `server/src/models/ProfessionsData.ts` — контейнер `{ mining, blacksmithing }`
- Добавлено в `Player` в `MyRoom.ts`: `@type(ProfessionsData) professions`

### 1.2 ResourceNode Schema

- `server/src/schemas/ResourceNode.ts` — `{ id, type, x, z, y, state, respawnAt }`
- Геттеры: `minMiningLevel`, `baseXpReward`, `respawnTimeMs`
- Добавлено в `MyRoomState`: `@type({ map: ResourceNode }) resourceNodes`

### 1.3 Bank

- `Inventory` в `Player` с 40 слотами: `@type(Inventory) bank = new Inventory(40)`
- `Inventory.ts` — добавлен параметр `maxSlots` в конструктор

### 1.4 Новые предметы (`server/src/data/items.ts`)

**Руда (stack 20):** copper_ore, tin_ore, iron_ore, coal
**Слитки (stack 10):** copper_bar, tin_bar, bronze_bar, iron_bar
**Оружие:** bronze_sword (+5 str), iron_sword (+12 str)
**Броня:** bronze_helmet (+3 def), iron_helmet (+6 def)

### 1.5 PlayerPersistence

- Сохранение/загрузка `professions` и `bank`

---

## Фаза 2 — Mining

### 2.1 ResourceSpawner (`server/src/systems/ResourceSpawner.ts`)

- 8 тестовых жил рядом со спавном (хардкод, позже замена на file-based)
- Загрузка heightmap для Y-позиции (как VegetationSpawner)
- Таймер респавна (каждые 5 секунд): `depleted → active`
- Вызов `markNodeDepleted()` при сборе

### 2.2 ResourceNodeRenderer (`client/src/render/ResourceNodeRenderer.ts`)

- Примитивы: copper → красный цилиндр, tin → серебряный, coal → чёрный куб, iron → серый цилиндр
- Depleted: `opacity: 0.3`, invisible

### 2.3 Сбор по F

- `interaction.ts`: поиск ближайшей `resourceNodeMeshes[nodeId]`, при F → `gatherResource`
- `MyRoom.ts` — `gatherResource` handler: дистанция, уровень, дроп, XP, деактивация ноды
- Количество дропа: 1 + бонус за перерос уровня (+1 за 5 уровней, +1 за 10)

---

## Фаза 3 — Bank

### 3.1 BankUI (`client/src/ui/BankUI.ts`)

- 40 слотов (8×5), золотая рамка
- Открывается по F у сундука
- Drag & Drop с инвентарём (`inventoryDnD.ts`: добавлен `'bank'` source/target type)
- Shift+Click split через `splitDialog.ts`

### 3.2 Серверные хендлеры

- `depositItem` — инвентарь → банк (стакание/обмен)
- `withdrawItem` — банк → инвентарь
- `moveBankItem` — банк → банк
- `splitBankItem` — разделение стака в банке

### 3.3 Объект в мире

- Сундук (`chest_01`) на координатах отредактированных пользователем
- Примитив: BoxGeometry, коричневый, `userData.isChest = true`

---

## Фаза 4 — Blacksmithing

### 4.1 Станции

- Furnace (красный цилиндр) — `userData.isFurnace`
- Anvil (серый цилиндр) — `userData.isAnvil`

### 4.2 Рецепты (`server/src/data/recipes.ts`)

**Furnace:**
| Рецепт | Lvl | Вход | Выход | XP |
|--------|-----|------|-------|----|
| Copper Bar | 1 | 3 ore | 1 bar | 25 |
| Tin Bar | 3 | 3 ore | 1 bar | 25 |
| Bronze Bar | 5 | 2 copper_bar + 1 tin_bar | 3 bronze_bar | 40 |
| Iron Bar | 10 | 3 iron_ore + 1 coal | 1 iron_bar | 50 |

**Anvil:**
| Рецепт | Lvl | Вход | Выход | XP |
|--------|-----|------|-------|----|
| Bronze Sword | 5 | 4 bronze_bar | bronze_sword | 60 |
| Bronze Helmet | 7 | 3 bronze_bar | bronze_helmet | 55 |
| Iron Sword | 15 | 6 iron_bar + 2 coal | iron_sword | 100 |
| Iron Helmet | 12 | 4 iron_bar + 1 coal | iron_helmet | 80 |

### 4.3 CraftingUI (`client/src/ui/CraftingUI.ts`)

- Открывается по F у станции
- Сервер возвращает рецепты с `canCraft`, `hasLevel`, `hasIngredients`
- После `craftResult` — авто-обновление списка
- Кнопка Craft неактивна если нет ресурсов или уровня

### 4.4 craftRecipe handler

- Валидация: дистанция до станции (4), уровень, ингредиенты
- Списание со всех слотов инвентаря (поиск по id)
- BonusChance: double output (iron_bar 10%, bronze_bar 5%, iron items 5%)
- Проверка свободного места в инвентаре

---

## Фаза 5 — UI профессий

### 5.1 ProfessionsUI (`client/src/ui/ProfessionsUI.ts`)

- Открытие по **K**
- Mining + Blacksmithing: уровень, XP bar
- Авто-обновление при любом изменении данных игрока

---

## Дополнительно (в процессе реализации)

### Split Dialog (`client/src/ui/splitDialog.ts`)

- Вынесен в общий файл, используется и inventoryUI, и BankUI
- `showSplitDialog(name, maxQty, onConfirm)`

### Interaction Labels (`client/src/render/InteractionLabels.ts`)

- CSS2D-подписи `[F] Банк`, `[F] Плавильня`, `[F] Кузница`
- Показываются при приближении (< 3 юнитов)
- Обновляются каждый кадр через `updateInteractionLabels()`

### Auto-Close UI

- Банк закрывается при отдалении от сундука > 4 юнитов
- Крафт закрывается при отдалении от станции > 4 юнитов
- Проверка в `network.ts` `onStateChange`

---

## Итоговые хоткеи

| Клавиша | Окно |
|---------|------|
| B | Инвентарь |
| C | Экипировка |
| K | Профессии |
| F | Взаимодействие (NPC, сундук, станция, руда) |

## Файловая структура (изменённые/новые файлы)

**Сервер:**
- `server/src/models/ProfessionEntry.ts` — новый
- `server/src/models/ProfessionsData.ts` — новый
- `server/src/models/Inventory.ts` — изменён (maxSlots)
- `server/src/schemas/ResourceNode.ts` — новый
- `server/src/data/items.ts` — 12 новых предметов
- `server/src/data/recipes.ts` — новый (8 рецептов)
- `server/src/systems/PlayerPersistence.ts` — professions + bank
- `server/src/systems/ResourceSpawner.ts` — новый
- `server/src/MyRoom.ts` — professions, bank, resourceNodes, gather, craft, bank handlers

**Клиент:**
- `client/src/render/ResourceNodeRenderer.ts` — новый
- `client/src/render/WorldRenderer.ts` — chest/furnace/anvil примитивы
- `client/src/render/InteractionLabels.ts` — новый
- `client/src/ui/BankUI.ts` — новый
- `client/src/ui/CraftingUI.ts` — новый
- `client/src/ui/ProfessionsUI.ts` — новый
- `client/src/ui/splitDialog.ts` — новый
- `client/src/network.ts` — resourceNodes, gatherResult, stationRecipes, craftResult, bank update
- `client/src/interaction.ts` — F для руды, банка, станций
- `client/src/inventoryUI.ts` — split через shared dialog
- `client/src/inventoryDnD.ts` — bank source/target type
- `client/src/main.ts` — init UI, hotkey K, interactionLabels
