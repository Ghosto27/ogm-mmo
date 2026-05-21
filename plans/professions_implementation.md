# План реализации: Профессии (Mining + Blacksmithing)

## Фаза 1 — Schema + Данные (фундамент)

### 1.1 Новые Schema (server/src/models/)

Создать `ProfessionEntry.ts`:
```
class ProfessionEntry extends Schema {
    @type("number") level: number = 1
    @type("number") xp: number = 0
    @type("number") xpToNext: number = 100
}
```

Создать `ProfessionsData.ts`:
```
class ProfessionsData extends Schema {
    @type(ProfessionEntry) mining = new ProfessionEntry()
    @type(ProfessionEntry) blacksmithing = new ProfessionEntry()
}
```

Добавить в `Player.ts`:
```
@type(ProfessionsData) professions = new ProfessionsData()
```

### 1.2 ResourceNode Schema (server/src/schemas/)

Создать `ResourceNode.ts`:
```
class ResourceNode extends Schema {
    @type("string") id: string
    @type("string") type: string       // "copper_ore", "iron_ore", "tin_ore", "coal"
    @type("number") x: number
    @type("number") z: number
    @type("number") y: number
    @type("string") state: string      // "active" | "depleted"
    @type("number") respawnAt: number  // timestamp
}
```

Добавить в `MyRoomState`:
```
@type({ map: ResourceNode }) resourceNodes = new MapSchema<ResourceNode>()
```

### 1.3 Bank Schema (server/src/schemas/)

Создать `StorageChest.ts`:
```
class StorageChest extends Schema {
    @type("string") id: string
    @type("number") x: number
    @type("number") z: number
    @type(Inventory) inventory = new Inventory()  // переиспользуем, 40 слотов
}
```

Временно хранить bank как `Inventory` внутри `Player`:
```
@type(Inventory) bank = new Inventory()  // maxSlots: 40
```

Inventory доработать — сделать `maxSlots` параметром конструктора.

### 1.4 Новые предметы (server/src/data/items.ts)

Добавить:
```
- copper_ore     // stack 20
- tin_ore        // stack 20
- iron_ore       // stack 20
- coal           // stack 20
- copper_bar     // stack 10
- tin_bar        // stack 10
- bronze_bar     // stack 10
- iron_bar       // stack 10
- bronze_sword   // slot: weapon, bonuses: { strength: 3 }
- iron_sword     // slot: weapon, bonuses: { strength: 8 }
- bronze_helmet  // slot: head, bonuses: { defense: 2 }
- iron_helmet    // slot: head, bonuses: { defense: 5 }
```

### 1.5 PlayerPersistence (server/src/systems/PlayerPersistence.ts)

Добавить сохранение/загрузку:
- `player.professions` — вложенный объект `{ mining: {level, xp, xpToNext}, blacksmithing: {...} }`
- `player.bank` — массив ItemSlot[] (как inventory)

---

## Фаза 2 — Mining: спавн и сбор руд

### 2.1 ResourceSpawner (server/src/systems/ResourceSpawner.ts)

Новый класс, паттерн как у `VegetationSpawner`:
- `initialize()` — загружает `resource_nodes.json` (или читает WorldObject с modelName `ore_*`)
- `loadFromFile()` / `saveToFile()` — persistence
- `getRespawnTime(type)` — 60-300s в зависимости от типа руды
- `update(deltaTime)` — проверяет `respawnAt`, переключает `depleted → active`

Файл данных: `server/data/resource_nodes.json`
```json
[
  { "id": "ore_copper_1", "type": "copper_ore", "x": 15.5, "z": 42.3, "y": 0 },
  { "id": "ore_iron_1", "type": "iron_ore", "x": 120.7, "z": -35.2, "y": 0 }
]
```

Y вычисляется через `getTerrainY(x, z)` при загрузке.

### 2.2 Связь с редактором

**Вариант А (стартовый):** хардкод 4-5 точек рядом со спавном для теста.

**Вариант Б (после теста):** в редакторе — новая кнопка "Place Ore Node", клик по террейну → отправляет `editorPlaceOreNode { type, x, z }`. Сервер сохраняет в `resource_nodes.json`.

Реализовать вариант А сначала, вариант Б когда механика отлажена.

### 2.3 Клиент: визуал примитивов (client/src/render/WorldRenderer.ts)

В `createPrimitive()` добавить обработку `ore_*`:
```
"ore_copper"  → CylinderGeometry(0.8, 1.2, 0.6), color: #b87333
"ore_iron"    → CylinderGeometry(0.8, 1.2, 0.6), color: #808080
"ore_tin"     → CylinderGeometry(0.8, 1.2, 0.6), color: #c0c0c0
"ore_coal"    → BoxGeometry(0.8, 0.6, 0.8),      color: #222222
```

Когда нода `depleted` → менять opacity на 0.3.

### 2.4 Синхронизация ResourceNode с клиентом (client/src/network.ts)

- `onStateChange`: обрабатывать `state.resourceNodes`
- `addResourceNode(node)` / `updateResourceNode(node)` / `removeResourceNode(id)`
- Для каждой ноды: создать/обновить `worldMesh` через `WorldRenderer`

### 2.5 gatherResource хендлер (server/src/MyRoom.ts)

Новое сообщение `gatherResource { nodeId }`:
1. Проверить дистанцию ≤ 4
2. Проверить `node.state === "active"`
3. Проверить `player.professions.mining.level >= minLevel(node.type)`
4. Сгенерировать дроп: `itemId = node.type`, `quantity = 1 + bonus(miningLevel)`
5. `inventory.addItem(copper_ore, quantity)`
6. Начислить XP: `baseXP + Math.floor(baseXP * 0.1 * (miningLevel - requiredLevel))`
7. `node.state = "depleted"`, `node.respawnAt = now + respawnTime`
8. Ответ: `gatherResult { nodeId, itemId, quantity, xpGained }`
9. Отправить обновление всем клиентам (field change → Colyseus делает авто)

### 2.6 Клиент: взаимодействие с нодой (client/src/interaction.ts)

- В `handleInteraction()` (клавиша F): добавить проверку на ResourceNode
- Raycast определяет тип объекта: если `resourceNode` → отправляем `gatherResource`
- В `mode === "action"` (pointer lock): клик по ноде → gather

### 2.7 Уведомления (client/src/ui/notificationUI.ts)

Использовать существующую систему:
```
showNotification("+3 Copper Ore", "#b87333")
showNotification("+25 Mining XP", "#ffff00")
```

---

## Фаза 3 — Storage (Bank/Ящик)

### 3.1 Bank UI (client/src/ui/BankUI.ts)

Новое окно:
- 40 слотов (5×8), сетка как в инвентаре
- Заголовок "Bank"
- Открывается по F у банковского ящика
- Drag & Drop между инвентарём и банком
- Shift+click: быстрый transfer

### 3.2 depositItem / withdrawItem (server/src/MyRoom.ts)

Сообщения:
- `depositItem { fromSlotIndex, toBankSlotIndex, quantity }` — из инвентаря в банк
- `withdrawItem { fromBankSlotIndex, toSlotIndex, quantity }` — из банка в инвентарь

Валидация: банк и инвентарь — одинаковые `Inventory` Schema, можно переиспользовать `moveItem` логику с разными контейнерами.

### 3.3 Объект в мире

Банковский ящик/сундук — `WorldObject` с `modelName: "chest"`:
- Поставить через редактор рядом со спавном (или в здании)
- При F: проверка `modelName === "chest"` или отдельный `type` в WorldObject
- Открывает BankUI

Можно добавить поле `interactionType` в `WorldObject`:
```
"interactionType": "chest" | "furnace" | "anvil" | "none"
```

---

## Фаза 4 — Blacksmithing: станции и крафт

### 4.1 Объекты станций (WorldObject в редакторе)

Поставить в мире:
- `modelName: "furnace"`, `interactionType: "furnace"` — печь для плавки
- `modelName: "anvil"`, `interactionType: "anvil"` — наковальня для ковки

Примитивы на клиенте:
```
"furnace" → BoxGeometry(2, 2, 2), color: #8B4513
"anvil"   → CylinderGeometry(1, 1.5, 1), color: #444444
```

### 4.2 Crafting UI (client/src/ui/CraftingUI.ts)

Новое окно:
- Заголовок "Smelting" или "Smithing" в зависимости от станции
- Список рецептов (доступные — яркие, недоступные — серые)
- У каждого рецепта: иконки ингредиентов → стрелка → иконка результата
- Кнопка "Craft" (сколько раз можно сделать)
- Обновляется при открытии инвентаря (проверка количества предметов)

### 4.3 craftRecipe хендлер (server/src/MyRoom.ts)

Новое сообщение `craftRecipe { recipeId }`:
1. Проверить дистанцию до станции ≤ 4
2. Проверить тип станции совпадает с рецептом
3. Проверить `professions.blacksmithing.level >= recipe.requiredLevel`
4. Проверить наличие всех ингредиентов в инвентаре (с количеством)
5. Списать ингредиенты: `inventory.removeItem()` для каждого
6. Создать результат: `inventory.addItem(outputItem, outputQuantity)`
7. Начислить XP
8. Ответ: `craftResult { recipeId, outputItem, quantity, xpGained }`
9. Если в инвентаре нет места → ошибка, ничего не списывать

### 4.4 Recipe definitions (server/src/data/recipes.ts)

Файл с рецептами:
```typescript
export interface Recipe {
    id: string
    name: string
    stationType: "furnace" | "anvil"
    profession: "blacksmithing"
    requiredLevel: number
    xpReward: number
    inputs: Array<{ itemId: string; quantity: number }>
    output: { itemId: string; quantity: number }
    bonusChance: number  // 0-1, шанс двойного выхода
}

export const recipes: Recipe[] = [
    // Smelting (Furnace)
    { id: "smelt_copper", name: "Copper Bar", stationType: "furnace", profession: "blacksmithing", requiredLevel: 1, xpReward: 25, inputs: [{ itemId: "copper_ore", quantity: 3 }], output: { itemId: "copper_bar", quantity: 1 }, bonusChance: 0 },
    { id: "smelt_tin", name: "Tin Bar", stationType: "furnace", profession: "blacksmithing", requiredLevel: 3, xpReward: 25, inputs: [{ itemId: "tin_ore", quantity: 3 }], output: { itemId: "tin_bar", quantity: 1 }, bonusChance: 0 },
    { id: "smelt_iron", name: "Iron Bar", stationType: "furnace", profession: "blacksmithing", requiredLevel: 10, xpReward: 50, inputs: [{ itemId: "iron_ore", quantity: 3 }, { itemId: "coal", quantity: 1 }], output: { itemId: "iron_bar", quantity: 1 }, bonusChance: 0.1 },
    { id: "smelt_bronze", name: "Bronze Bar", stationType: "furnace", profession: "blacksmithing", requiredLevel: 5, xpReward: 40, inputs: [{ itemId: "copper_bar", quantity: 2 }, { itemId: "tin_bar", quantity: 1 }], output: { itemId: "bronze_bar", quantity: 3 }, bonusChance: 0.05 },

    // Smithing (Anvil)
    { id: "craft_bronze_sword", name: "Bronze Sword", stationType: "anvil", profession: "blacksmithing", requiredLevel: 5, xpReward: 60, inputs: [{ itemId: "bronze_bar", quantity: 4 }], output: { itemId: "bronze_sword", quantity: 1 }, bonusChance: 0 },
    { id: "craft_bronze_helmet", name: "Bronze Helmet", stationType: "anvil", profession: "blacksmithing", requiredLevel: 7, xpReward: 55, inputs: [{ itemId: "bronze_bar", quantity: 3 }], output: { itemId: "bronze_helmet", quantity: 1 }, bonusChance: 0 },
    { id: "craft_iron_sword", name: "Iron Sword", stationType: "anvil", profession: "blacksmithing", requiredLevel: 15, xpReward: 100, inputs: [{ itemId: "iron_bar", quantity: 6 }, { itemId: "coal", quantity: 2 }], output: { itemId: "iron_sword", quantity: 1 }, bonusChance: 0.05 },
    { id: "craft_iron_helmet", name: "Iron Helmet", stationType: "anvil", profession: "blacksmithing", requiredLevel: 12, xpReward: 80, inputs: [{ itemId: "iron_bar", quantity: 4 }, { itemId: "coal", quantity: 1 }], output: { itemId: "iron_helmet", quantity: 1 }, bonusChance: 0.05 },
]
```

### 4.5 Crafting UI: запрос рецептов

Сообщение `getCraftingRecipes { stationType }`:
- Сервер возвращает все рецепты для этого типа станции + статус доступности (есть ли уровень + ингредиенты)
- Или, проще: клиент знает все рецепты (из констант), а сервер только валидирует при `craftRecipe`

Для прототипа: рецепты захардкожены на клиенте, `craftRecipe` валидируется сервером.

---

## Фаза 5 — UI профессий

### 5.1 Professions UI (client/src/ui/ProfessionsUI.ts)

Новое окно:
- Список профессий (Mining, Blacksmithing)
- У каждой: иконка, название, уровень, XP bar
- Кнопка закрытия / Esc
- Открытие по хоткею (например, 'K') или кнопка в HUD

### 5.2 XP bar в HUD

Добавить в `playerUI.ts`:
- Под HP/Exp bar — маленькие бары профессий (по желанию, не обязательно)
- Или: в Professions UI только

### 5.3 Интеграция

Все UI окна следуют паттерну `pushUIMode()` / `popUIMode()` (как инвентарь).

---

## Порядок реализации

```
Фаза 1 — Schema, предметы, persistence    [сейчас]
Фаза 2 — Mining (спавн, сбор, XP)        [после фазы 1]
Фаза 3 — Storage (банк, UI)              [параллельно с фазой 2]
Фаза 4 — Blacksmithing (станции, крафт)  [после фаз 2+3]
Фаза 5 — UI доведение                    [после всего]
```

Первый коммит: Фаза 1 целиком.
Второй коммит: Фаза 2 (рабочий сбор руды с XP, примитивы в мире).
Третий коммит: Фаза 3 (банк).
Четвёртый коммит: Фаза 4 (крафт на станциях).
Пятый коммит: Фаза 5 (UI окна, полировка).
