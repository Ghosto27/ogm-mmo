// EditorUI.ts (исправленная версия)
import * as THREE from 'three';

let panel: HTMLDivElement;
let staticPanel: HTMLElement;
let vegetationPanel: HTMLElement;
let propertiesPanel: HTMLElement;

// --- Статические элементы ---
let inputScaleX: HTMLInputElement;
let inputScaleY: HTMLInputElement;
let inputScaleZ: HTMLInputElement;
let labelScaleX: HTMLLabelElement;
let labelScaleZ: HTMLLabelElement;
let inputPosX: HTMLInputElement;
let inputPosY: HTMLInputElement;
let inputPosZ: HTMLInputElement;
let btnSnap: HTMLButtonElement;
let inputRotX: HTMLInputElement;
let inputRotY: HTMLInputElement;
let inputRotZ: HTMLInputElement;

// --- Элементы зон ---
let selectVegetationZone: HTMLSelectElement;
let vegetationZoneProps: HTMLElement;
let inpZoneId: HTMLInputElement;
let inpZoneType: HTMLSelectElement;
let inpZoneModels: HTMLInputElement;
let inpZoneCount: HTMLInputElement;
let inpZoneMinScale: HTMLInputElement;
let inpZoneMaxScale: HTMLInputElement;
let btnNewVegetationZone: HTMLButtonElement;
let btnSaveVegetationZones: HTMLButtonElement;
let btnDeleteVegetationZone: HTMLButtonElement;
let mobsPanel: HTMLElement;
let resourcesPanel: HTMLElement;
let selectMobZone: HTMLSelectElement;
let mobZoneProps: HTMLElement;
let inpMobZoneId: HTMLInputElement;
let inpMobZoneCount: HTMLInputElement;
let inpMobZoneRadius: HTMLInputElement;
let btnNewMobZone: HTMLButtonElement;
let btnSaveMobZones: HTMLButtonElement;
let btnDeleteMobZone: HTMLButtonElement;

// --- Элементы ресурсных нод ---
let selectResourceType: HTMLSelectElement;
let inpResourceX: HTMLInputElement;
let inpResourceZ: HTMLInputElement;
let resourceProps: HTMLElement;
let resourcePlacementActive = false;

// Переменные для режима размещения (нужны только для UI)
let placementType = 'cube';
let placementMode = false;

let editorCallbacks: any = {};

// Текущая вкладка и данные зон
let currentTab: 'static' | 'vegetation' | 'mobs' | 'resources' = 'static';
let vegetationZones: any[] = [];

// --- Колбэки (будут назначены из Editor.ts) ---
let onPlacementToggle: (type: string) => void;
let onSaveStatic: () => void;
let onDeleteStatic: () => void;
let onPropertiesChanged: () => void;
let onSnapToGround: () => void;
let onModelChanged: (name: string) => void;
let onNewVegetationZone: () => void;
let onSaveVegetationZones: () => void;
let onDeleteVegetationZone: () => void;
let onVegetationZoneSelected: (index: number) => void;
let onNewMobZone: () => void;
let onSaveMobZones: () => void;
let onDeleteMobZone: () => void;
let onMobZoneSelected: (index: number) => void;
let onPlaceResourceNode: (type: string) => void;
let onSaveResourceNodes: () => void;
let onDeleteResourceNode: () => void;
let inpZoneWidth: HTMLInputElement;
let inpZoneDepth: HTMLInputElement;
let btnGenerateVegetationZone: HTMLButtonElement;

function switchTab(tab: 'static' | 'vegetation' | 'mobs' | 'resources') {
    currentTab = tab;
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${tab}`)!.classList.add('active');
    staticPanel.style.display = tab === 'static' ? 'block' : 'none';
    vegetationPanel.style.display = tab === 'vegetation' ? 'block' : 'none';
    mobsPanel.style.display = tab === 'mobs' ? 'block' : 'none';
    resourcesPanel.style.display = tab === 'resources' ? 'block' : 'none';
    if (tab === 'vegetation' && editorCallbacks.onTabVegetationSelected) {
        editorCallbacks.onTabVegetationSelected();
    }
    if (tab === 'mobs' && editorCallbacks.onTabMobsSelected) {
        editorCallbacks.onTabMobsSelected();
    }
    if (tab === 'resources' && editorCallbacks.onTabResourcesSelected) {
        editorCallbacks.onTabResourcesSelected();
    }
}

export function createEditorUI(
    callbacks: {
        onSaveStatic: () => void;
        onDeleteStatic: () => void;
        onPropertiesChanged: () => void;
        onPlacementToggle: (type: string) => void;
        onSnapToGround: () => void;
        onModelChanged: (name: string) => void;
        onNewVegetationZone: () => void;
        onSaveVegetationZones: () => void;
        onDeleteVegetationZone: () => void;
        onVegetationZoneSelected: (index: number) => void;
        onTabVegetationSelected?: () => void;
        onNewMobZone: () => void;
        onSaveMobZones: () => void;
        onDeleteMobZone: () => void;
        onMobZoneSelected: (index: number) => void;
        onTabMobsSelected?: () => void;
        onPlaceResourceNode?: (type: string) => void;
        onSaveResourceNodes?: () => void;
        onDeleteResourceNode?: () => void;
        onTabResourcesSelected?: () => void;
        onZoneGeometryChanged?: (index: number) => void;
        onMobZoneGeometryChanged?: (index: number) => void;
        onGenerateVegetationZone?: () => void;
    }
) {
    editorCallbacks = callbacks;
    // Сохраняем колбэки
    onSaveStatic = callbacks.onSaveStatic;
    onDeleteStatic = callbacks.onDeleteStatic;
    onPropertiesChanged = callbacks.onPropertiesChanged;
    onPlacementToggle = callbacks.onPlacementToggle;
    onSnapToGround = callbacks.onSnapToGround;
    onModelChanged = callbacks.onModelChanged;
    onNewVegetationZone = callbacks.onNewVegetationZone;
    onSaveVegetationZones = callbacks.onSaveVegetationZones;
    onDeleteVegetationZone = callbacks.onDeleteVegetationZone;
    onVegetationZoneSelected = callbacks.onVegetationZoneSelected;
    onNewMobZone = callbacks.onNewMobZone;
    onSaveMobZones = callbacks.onSaveMobZones;
    onDeleteMobZone = callbacks.onDeleteMobZone;
    onMobZoneSelected = callbacks.onMobZoneSelected;
    onPlaceResourceNode = callbacks.onPlaceResourceNode || (() => {});
    onSaveResourceNodes = callbacks.onSaveResourceNodes || (() => {});
    onDeleteResourceNode = callbacks.onDeleteResourceNode || (() => {});

    // Создаём панель
    panel = document.createElement('div');
    panel.id = 'editor-panel';
    panel.style.cssText = `
        position: absolute; top: 10px; left: 10px; width: 280px;
        background: rgba(30,30,30,0.9); border: 1px solid #555;
        border-radius: 8px; color: white; font-family: Arial, sans-serif;
        z-index: 2000; padding: 12px; display: none; pointer-events: auto;
    `;
    panel.innerHTML = `
        <div style="font-size:16px;margin-bottom:8px;">🛠️ Редактор карты</div>
        <div style="display:flex; gap:4px; margin-bottom:8px;">
            <button id="tab-static" class="tab-btn active">🏠 Статика</button>
            <button id="tab-vegetation" class="tab-btn">🌿 Зоны</button>
            <button id="tab-mobs" class="tab-btn">🐺 Мобы</button>
            <button id="tab-resources" class="tab-btn">⛏ Ресурсы</button>
        </div>

        <!-- Панель статических объектов -->
        <div id="static-panel" style="display:block;">
            <div style="margin-bottom:8px;">
                <label style="margin-right:5px;"><input type="radio" name="type" value="cube" checked>Куб</label>
                <label style="margin-right:5px;"><input type="radio" name="type" value="cylinder">Цилиндр</label>
                <label><input type="radio" name="type" value="model">Модель</label>
            </div>
            <select id="select-model" style="margin:4px 0;padding:4px;width:100%;">
                <option value="Tree_1">Tree_1</option>
                <option value="Tree_10">Tree_10</option>
                <option value="Tree_11">Tree_11</option>
                <option value="Tree_12">Tree_12</option>
                <option value="Tree_13">Tree_13</option>
                <option value="Tree_14">Tree_14</option>
                <option value="Tree_17">Tree_17</option>
                <option value="Tree_18">Tree_18</option>
                <option value="Tree_19">Tree_19</option>
                <option value="Bush_1">Bush_1</option>
                <option value="Bush_2">Bush_2</option>
                <option value="Bush_3">Bush_3</option>
                <option value="Log_1">Log_1</option>
                <option value="Log_2">Log_2</option>
                <option value="Log_3">Log_3</option>
                <option value="Log_4">Log_4</option>
                <option value="Log_5">Log_5</option>
                <option value="Rock_1">Rock_1</option>
                <option value="Rock_2">Rock_2</option>
                <option value="Rock_3">Rock_3</option>
                <option value="Rock_4">Rock_4</option>
                <option value="Rock_5">Rock_5</option>
                <option value="Rock_6">Rock_6</option>
                <option value="Rock_7">Rock_7</option>
                <option value="Rock_8">Rock_8</option>
                <option value="Rock_9">Rock_9</option>
                <option value="Rock_10">Rock_10</option>
                <option value="Plant_1">Plant_1</option>
                <option value="Plant_2">Plant_2</option>
                <option value="Plant_3">Plant_3</option>
                <option value="Plant_4">Plant_4</option>
                <option value="Plant_5">Plant_5</option>
                <option value="Plant_6">Plant_6</option>
                <option value="Plant_7">Plant_7</option>
                <option value="Plant_8">Plant_8</option>
                <option value="Plant_9">Plant_9</option>
                <option value="Plant_10">Plant_10</option>
                <option value="Plant_11">Plant_11</option>
                <option value="Plant_12">Plant_12</option>
                <option value="Plant_13">Plant_13</option>
                <option value="Plant_14">Plant_14</option>
                <option value="Plant_15">Plant_15</option>
                <option value="Plant_16">Plant_16</option>
                <option value="skeleton">skeleton</option>
            </select>
            <button id="btn-place" style="margin:4px 0;padding:6px 12px;width:100%;">📌 Разместить объект</button>
            <button id="btn-delete" style="margin:4px 0;padding:6px 12px;width:100%;">🗑️ Удалить выбранный</button>
            <button id="btn-snap" style="margin:4px 0;padding:6px 12px;width:100%;">📍 Land</button>
            <button id="btn-save" style="margin:4px 0;padding:6px 12px;width:100%;">💾 Сохранить</button>
            <hr>
            <div id="properties-section" style="display:none;">
                <div style="font-weight:bold;">Свойства объекта</div>
                <div style="display:flex; gap:4px; margin-top:4px;">
                    <div><label style="font-size:12px;">X</label><input id="inp-x" type="number" step="0.1" style="width:100%;"></div>
                    <div><label style="font-size:12px;">Y</label><input id="inp-y" type="number" step="0.1" style="width:100%;"></div>
                    <div><label style="font-size:12px;">Z</label><input id="inp-z" type="number" step="0.1" style="width:100%;"></div>
                </div>
                <div style="display:flex; gap:4px; margin-top:4px;">
                    <div><label id="label-sx" style="font-size:12px;">Ширина (X)</label><input id="inp-sx" type="number" step="0.1" style="width:100%;"></div>
                    <div><label style="font-size:12px;">Высота (Y)</label><input id="inp-sy" type="number" step="0.1" style="width:100%;"></div>
                    <div><label id="label-sz" style="font-size:12px;">Длина (Z)</label><input id="inp-sz" type="number" step="0.1" style="width:100%;"></div>
                </div>
                <div style="display:flex; gap:4px; margin-top:4px;">
                    <div><label style="font-size:12px;">Пов X</label><input id="inp-rotx" type="number" step="0.1" style="width:100%;"></div>
                    <div><label style="font-size:12px;">Пов Y</label><input id="inp-roty" type="number" step="0.1" style="width:100%;"></div>
                    <div><label style="font-size:12px;">Пов Z</label><input id="inp-rotz" type="number" step="0.1" style="width:100%;"></div>
                </div>
            </div>
        </div>

        <!-- Панель зон растительности -->
        <div id="vegetation-panel" style="display:none;">
            <div style="margin-bottom:4px;">
                <button id="btn-new-vegetation-zone">➕ Новая зона</button>
                <button id="btn-save-vegetation-zones" style="margin-left:4px;">💾 Сохранить зоны</button>
                <button id="btn-generate-vegetation-zone" style="margin-left:4px;">🔄 Генерировать</button>
            </div>
            <select id="select-vegetation-zone" style="width:100%; margin:4px 0;"></select>
            <div id="vegetation-zone-props" style="display:none; margin-top:4px;">
                <label>ID зоны</label><input id="inp-zone-id" type="text" style="width:100%;">
                <label>Тип</label>
                <select id="inp-zone-type">
                    <option value="tree">Деревья</option>
                    <option value="rock">Камни</option>
                </select>
                <label>Модели (через запятую)</label><input id="inp-zone-models" type="text" style="width:100%;" placeholder="Tree_1,Tree_2">
                <label>Количество</label><input id="inp-zone-count" type="number" min="1" value="10" style="width:100%;">
                <label>Мин. масштаб</label><input id="inp-zone-minScale" type="number" step="0.1" value="1" style="width:100%;">
                <label>Макс. масштаб</label><input id="inp-zone-maxScale" type="number" step="0.1" value="3" style="width:100%;">
                <label>Ширина</label><input id="inp-zone-width" type="number" step="1" value="100" style="width:100%;">
                <label>Глубина</label><input id="inp-zone-depth" type="number" step="1" value="100" style="width:100%;">
                <div style="margin-top:4px;">
                    <button id="btn-delete-vegetation-zone">🗑️ Удалить зону</button>
                </div>
            </div>
        </div>
        <div id="mobs-panel" style="display:none;">
            <div style="margin-bottom:4px;">
                <button id="btn-new-mob-zone">➕ Новая зона</button>
                <button id="btn-save-mob-zones" style="margin-left:4px;">💾 Сохранить</button>
            </div>
            <select id="select-mob-zone" style="width:100%; margin:4px 0;"></select>
            <div id="mob-zone-props" style="display:none; margin-top:4px;">
                <label>ID зоны</label><input id="inp-mob-zone-id" type="text" style="width:100%;">
                <label>Количество</label><input id="inp-mob-zone-count" type="number" min="1" value="5" style="width:100%;">
                <label>Радиус</label><input id="inp-mob-zone-radius" type="number" min="1" value="50" style="width:100%;">
                <div style="margin-top:4px;">
                    <button id="btn-delete-mob-zone">🗑️ Удалить</button>
                </div>
            </div>
        </div>

        <!-- Панель ресурсных нод -->
        <div id="resources-panel" style="display:none;">
            <div style="margin-bottom:8px;">
                <label style="font-size:13px;">Тип руды:</label>
                <select id="select-resource-type" style="width:100%;margin:4px 0;padding:4px;">
                    <option value="copper_ore">Медная руда</option>
                    <option value="tin_ore">Оловянная руда</option>
                    <option value="iron_ore">Железная руда</option>
                    <option value="coal">Уголь</option>
                </select>
            </div>
            <button id="btn-place-resource" style="margin:4px 0;padding:6px 12px;width:100%;">📌 Разместить руду</button>
            <div id="resource-props" style="display:none; margin-top:4px;">
                <div style="font-weight:bold;">Свойства рудной жилы</div>
                <label style="font-size:12px;">Тип</label>
                <select id="inp-resource-type" style="width:100%;margin:2px 0;">
                    <option value="copper_ore">Медная руда</option>
                    <option value="tin_ore">Оловянная руда</option>
                    <option value="iron_ore">Железная руда</option>
                    <option value="coal">Уголь</option>
                </select>
                <div style="display:flex; gap:4px; margin-top:4px;">
                    <div style="flex:1;"><label style="font-size:12px;">X</label><input id="inp-resource-x" type="number" step="0.1" readonly style="width:100%;"></div>
                    <div style="flex:1;"><label style="font-size:12px;">Z</label><input id="inp-resource-z" type="number" step="0.1" readonly style="width:100%;"></div>
                </div>
            </div>
            <button id="btn-delete-resource" style="margin:4px 0;padding:6px 12px;width:100%;">🗑️ Удалить выбранную</button>
            <button id="btn-save-resources" style="margin:4px 0;padding:6px 12px;width:100%;">💾 Сохранить руды</button>
        </div>
    `;

    document.body.appendChild(panel);

    // Предотвращаем всплытие событий
    panel.addEventListener('mousedown', (e) => e.stopPropagation());
    panel.addEventListener('mouseup', (e) => e.stopPropagation());
    panel.addEventListener('click', (e) => e.stopPropagation());

    // Получаем статические элементы
    staticPanel = document.getElementById('static-panel')!;
    vegetationPanel = document.getElementById('vegetation-panel')!;
    propertiesPanel = document.getElementById('properties-section')!;
    vegetationZoneProps = document.getElementById('vegetation-zone-props')!;

    inputScaleX = document.getElementById('inp-sx') as HTMLInputElement;
    inputScaleY = document.getElementById('inp-sy') as HTMLInputElement;
    inputScaleZ = document.getElementById('inp-sz') as HTMLInputElement;
    labelScaleX = document.getElementById('label-sx') as HTMLLabelElement;
    labelScaleZ = document.getElementById('label-sz') as HTMLLabelElement;
    inputPosX = document.getElementById('inp-x') as HTMLInputElement;
    inputPosY = document.getElementById('inp-y') as HTMLInputElement;
    inputPosZ = document.getElementById('inp-z') as HTMLInputElement;
    btnSnap = document.getElementById('btn-snap') as HTMLButtonElement;
    inputRotX = document.getElementById('inp-rotx') as HTMLInputElement;
    inputRotY = document.getElementById('inp-roty') as HTMLInputElement;
    inputRotZ = document.getElementById('inp-rotz') as HTMLInputElement;

    // Элементы зон
    selectVegetationZone = document.getElementById('select-vegetation-zone') as HTMLSelectElement;
    inpZoneId = document.getElementById('inp-zone-id') as HTMLInputElement;
    inpZoneType = document.getElementById('inp-zone-type') as HTMLSelectElement;
    inpZoneModels = document.getElementById('inp-zone-models') as HTMLInputElement;
    inpZoneCount = document.getElementById('inp-zone-count') as HTMLInputElement;
    inpZoneMinScale = document.getElementById('inp-zone-minScale') as HTMLInputElement;
    inpZoneMaxScale = document.getElementById('inp-zone-maxScale') as HTMLInputElement;
    btnNewVegetationZone = document.getElementById('btn-new-vegetation-zone') as HTMLButtonElement;
    btnSaveVegetationZones = document.getElementById('btn-save-vegetation-zones') as HTMLButtonElement;
    btnDeleteVegetationZone = document.getElementById('btn-delete-vegetation-zone') as HTMLButtonElement;
    inpZoneWidth = document.getElementById('inp-zone-width') as HTMLInputElement;
    inpZoneDepth = document.getElementById('inp-zone-depth') as HTMLInputElement;
    btnGenerateVegetationZone = document.getElementById('btn-generate-vegetation-zone') as HTMLButtonElement;
    btnGenerateVegetationZone.onclick = () => editorCallbacks.onGenerateVegetationZone?.();

    // Элементы ресурсных нод
    resourcesPanel = document.getElementById('resources-panel')!;
    selectResourceType = document.getElementById('select-resource-type') as HTMLSelectElement;
    resourceProps = document.getElementById('resource-props')!;
    inpResourceX = document.getElementById('inp-resource-x') as HTMLInputElement;
    inpResourceZ = document.getElementById('inp-resource-z') as HTMLInputElement;

    // Элементы моб-зон
    mobsPanel = document.getElementById('mobs-panel')!;
    selectMobZone = document.getElementById('select-mob-zone') as HTMLSelectElement;
    mobZoneProps = document.getElementById('mob-zone-props')!;
    inpMobZoneId = document.getElementById('inp-mob-zone-id') as HTMLInputElement;
    inpMobZoneCount = document.getElementById('inp-mob-zone-count') as HTMLInputElement;
    inpMobZoneRadius = document.getElementById('inp-mob-zone-radius') as HTMLInputElement;
    btnNewMobZone = document.getElementById('btn-new-mob-zone') as HTMLButtonElement;
    btnSaveMobZones = document.getElementById('btn-save-mob-zones') as HTMLButtonElement;
    btnDeleteMobZone = document.getElementById('btn-delete-mob-zone') as HTMLButtonElement;

    // Обработчики вкладок
    document.getElementById('tab-static')!.onclick = () => switchTab('static');
    document.getElementById('tab-vegetation')!.onclick = () => switchTab('vegetation');
    document.getElementById('tab-mobs')!.onclick = () => switchTab('mobs');
    document.getElementById('tab-resources')!.onclick = () => switchTab('resources');

    btnNewMobZone.onclick = () => editorCallbacks.onNewMobZone?.();
    btnSaveMobZones.onclick = () => editorCallbacks.onSaveMobZones?.();
    btnDeleteMobZone.onclick = () => editorCallbacks.onDeleteMobZone?.();

    // Ресурсные ноды
    document.getElementById('btn-place-resource')!.onclick = () => {
        const type = selectResourceType.value;
        resourcePlacementActive = !resourcePlacementActive;
        const btn = document.getElementById('btn-place-resource')!;
        if (resourcePlacementActive) {
            btn.textContent = `⏹ Стоп (${selectResourceType.options[selectResourceType.selectedIndex].text})`;
            btn.style.background = '#aa3333';
        } else {
            btn.textContent = '📌 Разместить руду';
            btn.style.background = '';
        }
        editorCallbacks.onPlaceResourceNode?.(resourcePlacementActive ? type : '');
    };
    document.getElementById('btn-delete-resource')!.onclick = () => editorCallbacks.onDeleteResourceNode?.();
    document.getElementById('btn-save-resources')!.onclick = () => editorCallbacks.onSaveResourceNodes?.();
    document.getElementById('inp-resource-type')!.addEventListener('change', () => {
        editorCallbacks.onPropertiesChanged?.();
    });
    selectMobZone.onchange = () => {
        const idx = parseInt(selectMobZone.value);
        if (!isNaN(idx)) {
            currentMobZoneIndex = idx;
            editorCallbacks.onMobZoneSelected?.(idx);
        }
    };

    // Статические обработчики
    document.getElementById('btn-delete')!.onclick = onDeleteStatic;
    document.getElementById('btn-save')!.onclick = onSaveStatic;
    btnSnap.onclick = () => onSnapToGround();

    inputScaleX.addEventListener('input', () => onPropertiesChanged());
    inputScaleY.addEventListener('input', () => onPropertiesChanged());
    inputScaleZ.addEventListener('input', () => onPropertiesChanged());
    inputPosX.addEventListener('input', () => onPropertiesChanged());
    inputPosZ.addEventListener('input', () => onPropertiesChanged());
    inputPosY.addEventListener('input', () => onPropertiesChanged());
    inputRotX.addEventListener('input', () => onPropertiesChanged());
    inputRotY.addEventListener('input', () => onPropertiesChanged());
    inputRotZ.addEventListener('input', () => onPropertiesChanged());

    inpZoneWidth.addEventListener('input', updateCurrentZone);
    inpZoneDepth.addEventListener('input', updateCurrentZone);

    // Подписка на изменение свойств зоны
    inpZoneId.addEventListener('input', updateCurrentZone);
    inpZoneType.addEventListener('change', updateCurrentZone);
    inpZoneModels.addEventListener('input', updateCurrentZone);
    inpZoneCount.addEventListener('input', updateCurrentZone);
    inpZoneMinScale.addEventListener('input', updateCurrentZone);
    inpZoneMaxScale.addEventListener('input', updateCurrentZone);
    inpMobZoneId.addEventListener('input', updateMobZoneFromInputs);
    inpMobZoneCount.addEventListener('input', updateMobZoneFromInputs);
    inpMobZoneRadius.addEventListener('input', updateMobZoneFromInputs);

    // Обработчики зон
    btnNewVegetationZone.onclick = () => onNewVegetationZone();
    btnSaveVegetationZones.onclick = () => onSaveVegetationZones();
    btnDeleteVegetationZone.onclick = () => onDeleteVegetationZone();
    selectVegetationZone.onchange = () => {
        const idx = parseInt(selectVegetationZone.value);
        if (!isNaN(idx)) onVegetationZoneSelected(idx);
    };

    // Обработчик выбора модели
    const selectModel = document.getElementById('select-model') as HTMLSelectElement;
    selectModel.addEventListener('change', () => {
        onModelChanged(selectModel.value);
    });

    // Обработчик переключения типа размещаемого объекта
    document.querySelectorAll('input[name="type"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            placementType = (e.target as HTMLInputElement).value;
            updatePlacementButtonState();
        });
    });

    // Обработчик кнопки размещения
    document.getElementById('btn-place')!.onclick = () => {
        placementMode = !placementMode;
        updatePlacementButtonState();
        if (typeof onPlacementToggle === 'function') {
            onPlacementToggle(placementMode ? placementType : '');
        }
    };
}

function updatePlacementButtonState() {
    const btn = document.getElementById('btn-place')!;
    if (placementMode) {
        btn.textContent = `⏹ Стоп (${placementType})`;
        btn.style.background = '#aa3333';
    } else {
        btn.textContent = `📌 Разместить объект (${placementType})`;
        btn.style.background = '';
    }
}

// --- Функции для зон (экспортируемые) ---

export function setVegetationZones(zones: any[]) {
    vegetationZones = zones;
    if (!selectVegetationZone) return;
    selectVegetationZone.innerHTML = zones.map((z, i) => `<option value="${i}">${z.id}</option>`).join('');
    if (zones.length > 0) {
        selectVegetationZone.selectedIndex = 0;
        showVegetationZoneProps(0);
    } else {
        vegetationZoneProps.style.display = 'none';
    }
}

export function getVegetationZones(): any[] {
    return vegetationZones;
}

export function showVegetationZoneProps(index: number) {
    const zone = vegetationZones[index];
    if (!zone) return;
    vegetationZoneProps.style.display = 'block';
    inpZoneId.value = zone.id;
    inpZoneType.value = zone.objectType;
    inpZoneModels.value = zone.modelNames.join(',');
    inpZoneCount.value = zone.count;
    inpZoneMinScale.value = zone.minScale;
    inpZoneMaxScale.value = zone.maxScale;
    inpZoneWidth.value = zone.width;
    inpZoneDepth.value = zone.depth;
}

export function getVegetationZoneFromInputs(): any {
    return {
        id: inpZoneId.value.trim(),
        objectType: inpZoneType.value as 'tree' | 'rock',
        modelNames: inpZoneModels.value.split(',').map(s => s.trim()).filter(s => s),
        count: parseInt(inpZoneCount.value) || 0,
        minScale: parseFloat(inpZoneMinScale.value) || 1,
        maxScale: parseFloat(inpZoneMaxScale.value) || 1,
    };
}

export function showEditorUI(visible: boolean) {
    if (panel) panel.style.display = visible ? 'block' : 'none';
}

export function updatePropertiesPanel(obj: THREE.Object3D | null) {
    if (!obj) {
        propertiesPanel.style.display = 'none';
        return;
    }
    propertiesPanel.style.display = 'block';
    const isCylinder = obj.userData.editorType === 'cylinder';
    labelScaleX.textContent = isCylinder ? 'Радиус (XZ)' : 'Ширина (X)';
    labelScaleZ.textContent = isCylinder ? 'Радиус (XZ)' : 'Длина (Z)';
    inputPosX.value = obj.position.x.toFixed(2);
    inputPosY.value = obj.position.y.toFixed(2);
    inputPosZ.value = obj.position.z.toFixed(2);
    inputScaleX.value = obj.scale.x.toFixed(2);
    inputScaleY.value = obj.scale.y.toFixed(2);
    inputScaleZ.value = obj.scale.z.toFixed(2);
    const rot = obj.rotation;
    inputRotX.value = THREE.MathUtils.radToDeg(rot.x).toFixed(1);
    inputRotY.value = THREE.MathUtils.radToDeg(rot.y).toFixed(1);
    inputRotZ.value = THREE.MathUtils.radToDeg(rot.z).toFixed(1);
}

export function getScaleFromInputs(): { x: number; y: number; z: number } {
    return {
        x: parseFloat(inputScaleX.value) || 1,
        y: parseFloat(inputScaleY.value) || 1,
        z: parseFloat(inputScaleZ.value) || 1,
    };
}

export function getPositionFromInputs(): { x: number; y: number; z: number } {
    return {
        x: parseFloat(inputPosX.value) || 0,
        y: parseFloat(inputPosY.value) || 0,
        z: parseFloat(inputPosZ.value) || 0,
    };
}

function updateCurrentZone() {
    const idx = parseInt(selectVegetationZone.value);
    if (isNaN(idx)) return;
    const zone = vegetationZones[idx];
    if (!zone) return;
    const inputs = getVegetationZoneFromInputs();
    zone.id = inputs.id;
    zone.objectType = inputs.objectType;
    zone.modelNames = inputs.modelNames;
    zone.count = inputs.count;
    zone.minScale = inputs.minScale;
    zone.maxScale = inputs.maxScale;
    zone.width = parseFloat(inpZoneWidth.value) || 100;
    zone.depth = parseFloat(inpZoneDepth.value) || 100;
    
    // Обновим визуальный прямоугольник сразу
    if (editorCallbacks.onZoneGeometryChanged) {
        editorCallbacks.onZoneGeometryChanged(idx);
    }
}

export function getRotationFromInputs(): { x: number; y: number; z: number } {
    const degToRad = Math.PI / 180;
    return {
        x: (parseFloat(inputRotX.value) || 0) * degToRad,
        y: (parseFloat(inputRotY.value) || 0) * degToRad,
        z: (parseFloat(inputRotZ.value) || 0) * degToRad,
    };
}

export let mobZones: any[] = [];
let currentMobZoneIndex = -1;

export function setMobZones(zones: any[]) {
    mobZones = zones;
    const previousIndex = currentMobZoneIndex;
    selectMobZone.innerHTML = zones.map((z, i) => `<option value="${i}">${z.id}</option>`).join('');
    mobZoneProps.style.display = zones.length > 0 ? 'block' : 'none';
    if (zones.length > 0) {
        const newIndex = previousIndex >= 0 && previousIndex < zones.length ? previousIndex : 0;
        selectMobZone.selectedIndex = newIndex;
        currentMobZoneIndex = newIndex;
        showMobZoneProps(newIndex);
    } else {
        currentMobZoneIndex = -1;
    }
}

export function showMobZoneProps(index: number) {
    currentMobZoneIndex = index;
    const z = mobZones[index];
    if (!z) return;
    inpMobZoneId.value = z.id;
    inpMobZoneCount.value = z.count;
    inpMobZoneRadius.value = z.radius;
}

export function getMobZoneFromInputs() {
    return {
        id: inpMobZoneId.value.trim(),
        count: parseInt(inpMobZoneCount.value) || 0,
        radius: parseFloat(inpMobZoneRadius.value) || 50,
    };
}

function updateMobZoneFromInputs() {
    if (currentMobZoneIndex < 0 || currentMobZoneIndex >= mobZones.length) return;
    const zone = mobZones[currentMobZoneIndex];
    if (!zone) return;
    zone.id = inpMobZoneId.value.trim();
    zone.count = parseInt(inpMobZoneCount.value) || 0;
    zone.radius = parseFloat(inpMobZoneRadius.value) || 50;
    if (editorCallbacks.onMobZoneGeometryChanged) {
        editorCallbacks.onMobZoneGeometryChanged(currentMobZoneIndex);
    }
    // Обновляем отображение в выпадающем списке (если ID изменился)
    const option = selectMobZone.options[currentMobZoneIndex];
    if (option) option.text = zone.id;
}

// --- Функции для ресурсных нод ---

export function showResourceNodeProps(obj: THREE.Object3D | null) {
    if (!obj || !obj.userData.isResourceNode) {
        resourceProps.style.display = 'none';
        return;
    }
    resourceProps.style.display = 'block';
    const typeSelect = document.getElementById('inp-resource-type') as HTMLSelectElement;
    typeSelect.value = obj.userData.oreType || 'copper_ore';
    inpResourceX.value = obj.position.x.toFixed(2);
    inpResourceZ.value = obj.position.z.toFixed(2);
}

export function getResourceNodeTypeFromProps(): string {
    const sel = document.getElementById('inp-resource-type') as HTMLSelectElement;
    return sel ? sel.value : 'copper_ore';
}

export function getResourcePlacementType(): string {
    return selectResourceType ? selectResourceType.value : 'copper_ore';
}

export function resetResourcePlacementButton() {
    resourcePlacementActive = false;
    const btn = document.getElementById('btn-place-resource')!;
    if (btn) {
        btn.textContent = '📌 Разместить руду';
        btn.style.background = '';
    }
}