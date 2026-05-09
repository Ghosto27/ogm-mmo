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

// Переменные для режима размещения (нужны только для UI)
let placementType = 'cube';
let placementMode = false;

let editorCallbacks: any = {};

// Текущая вкладка и данные зон
let currentTab: 'static' | 'vegetation' = 'static';
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

function switchTab(tab: 'static' | 'vegetation') {
    currentTab = tab;
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${tab}`)!.classList.add('active');
    staticPanel.style.display = tab === 'static' ? 'block' : 'none';
    vegetationPanel.style.display = tab === 'vegetation' ? 'block' : 'none';
    if (tab === 'vegetation' && editorCallbacks.onTabVegetationSelected) {
        editorCallbacks.onTabVegetationSelected();
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
                <option value="Tree_2">Tree_2</option>
                <option value="Tree_3">Tree_3</option>
                <option value="Rock_1">Rock_1</option>
                <option value="Rock_2">Rock_2</option>
                <option value="Rock_3">Rock_3</option>
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
                <div style="margin-top:4px;">
                    <button id="btn-delete-vegetation-zone">🗑️ Удалить зону</button>
                </div>
            </div>
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

    // Обработчики вкладок
    document.getElementById('tab-static')!.onclick = () => switchTab('static');
    document.getElementById('tab-vegetation')!.onclick = () => switchTab('vegetation');

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

    // Подписка на изменение свойств зоны
    inpZoneId.addEventListener('input', updateCurrentZone);
    inpZoneType.addEventListener('change', updateCurrentZone);
    inpZoneModels.addEventListener('input', updateCurrentZone);
    inpZoneCount.addEventListener('input', updateCurrentZone);
    inpZoneMinScale.addEventListener('input', updateCurrentZone);
    inpZoneMaxScale.addEventListener('input', updateCurrentZone);

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
    // Обновляем только редактируемые свойства, сохраняя геометрию
    zone.id = inputs.id;
    zone.objectType = inputs.objectType;
    zone.modelNames = inputs.modelNames;
    zone.count = inputs.count;
    zone.minScale = inputs.minScale;
    zone.maxScale = inputs.maxScale;
    // геометрические поля centerX, centerZ, width, depth не трогаем
}

export function getRotationFromInputs(): { x: number; y: number; z: number } {
    const degToRad = Math.PI / 180;
    return {
        x: (parseFloat(inputRotX.value) || 0) * degToRad,
        y: (parseFloat(inputRotY.value) || 0) * degToRad,
        z: (parseFloat(inputRotZ.value) || 0) * degToRad,
    };
}