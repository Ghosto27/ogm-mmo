# Экономика — план реализации

**Решение принято — готово к реализации.**

## 1. Валюта — отдельное поле `gold` у игрока

- `server/src/schemas/Player.ts` — добавить `@type("number") gold: number = 0`
- `PlayerPersistence.ts` — сохранять/загружать `gold`
- `client/src/ui/` — индикатор золота в HUD (рядом с HP/XP)

## 2. Цены — `server/src/data/shop.json`

Формат:
```json
{
  "copper_ore": { "buyPrice": 5, "sellPrice": 2 },
  "tin_ore": { "buyPrice": 8, "sellPrice": 3 },
  "coal": { "buyPrice": 10, "sellPrice": 4 },
  "iron_ore": { "buyPrice": 15, "sellPrice": 6 }
}
```
- `buyPrice: 0` — нельзя купить (только продажа)
- `sellPrice: 0` — нельзя продать (только покупка)
- Отсутствует в JSON — нельзя ни купить, ни продать

## 3. Торговец NPC

- Кубик, хардкод рядом со спавном (как chest/furnace/anvil)
- Взаимодействие через F (дистанционная проверка, как плавильня/наковальня)
- При F → сервер шлёт `merchantData` → клиент открывает окно торговца

## 4. UI торговца

- При F открывается окно с вкладками:
  - **Покупка**: таблица предметов (иконка, название, кол-во в наличии)
  - **Продажа**: реализуется через ПКМ в инвентаре (см. ниже)
- Кнопка закрытия (Esc / крестик)

## 5. Продажа предметов

- **Одиночный предмет**: ПКМ в инвентаре → отправка `merchantSellItem { slot, quantity: 1 }` → сервер проверяет дистанцию и добавляет золото
- **Стак (>1)**: ПКМ → confirm-окно с ползунком количества + отображением итоговой цены → OK → `merchantSellItem { slot, quantity }`
- **Проверка на сервере**: дистанция до торговца, предмет есть в shop.json, `sellPrice > 0`

## 6. Отображение цены в тултипе

- Только при открытом окне торговца — в тултипе инвентарного слота показывать `Цена продажи: N gold/шт` (для стаков: `N × M = N*M gold`)
- Обычный тултип (описание) когда окно торговца закрыто
- Данные цен клиент получает при открытии торговца (кешируются локально)

## 7. Сетевые сообщения

| Направление | Сообщение | Данные |
|---|---|---|
| C→S | `merchantBuyItem` | `{ itemId, quantity }` |
| C→S | `merchantSellItem` | `{ inventorySlot, quantity }` |
| S→C | `merchantData` | `{ items: { itemId, buyPrice, sellPrice }[] }` |
| S→C | `merchantResult` | `{ success, message? }` |

## 8. Ассортимент (первая версия)

Только ресурсы: руды (copper_ore, tin_ore, iron_ore, coal) и слитки (copper_ingot, tin_ingot, iron_ingot, steel_ingot).
Остальные предметы — не продаются и не покупаются (позже расширим).

## 9. Изменения в файлах

### Сервер
- `Player.ts` — поле `gold`
- `PlayerPersistence.ts` — save/load gold
- `data/shop.json` — цены
- `data/items.ts` — возможно описание для тултипа
- `MyRoom.ts` — хендлеры `merchantBuyItem`, `merchantSellItem`, отправка `merchantData`
- `schemas/Player.ts` — `gold`

### Клиент
- `network.ts` — обработчики `merchantData`, `merchantResult`
- `ui/MerchantUI.ts` — новое окно торговца
- `ui/inventoryUI.ts` — ПКМ-обработка продажи (если окно торговца открыто)
- `render/` — тултип цен продажи
- `scene.ts` или `main.ts` — регистрация хендлера F для торговца
- HUD — индикатор золота
