import { Schema, type } from "@colyseus/schema";

export class PlayerStats extends Schema {
    // Базовые атрибуты
    @type("number") strength: number = 10;      // Сила
    @type("number") dexterity: number = 10;     // Ловкость
    @type("number") intelligence: number = 10;  // Интеллект
    @type("number") vitality: number = 10;      // Живучесть
    @type("number") luck: number = 5;           // Удача

    // Производные параметры (вычисляемые)
    @type("number") attackPower: number = 10;   // Сила атаки
    @type("number") defense: number = 5;        // Защита
    @type("number") critChance: number = 5;     // Шанс критического удара (%)
}