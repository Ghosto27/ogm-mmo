// EditorUI.ts (исправленный)
import * as THREE from 'three';

let panel: HTMLDivElement;
let propertiesPanel: HTMLElement; // изменено на HTMLElement, чтобы избежать ошибки с align

let inputScaleX: HTMLInputElement;
let inputScaleY: HTMLInputElement;
let inputScaleZ: HTMLInputElement;
let labelScaleX: HTMLLabelElement;
let labelScaleZ: HTMLLabelElement;
let inputPosX: HTMLInputElement;
let inputPosY: HTMLInputElement;
let inputPosZ: HTMLInputElement;
let btnSnap: HTMLButtonElement;

let placementType: string = 'cube';
let placementMode = false;

export function createEditorUI(
    onAddCube: () => void,
    onSave: () => void,
    onDelete: () => void,
    onPropertiesChanged: () => void,
    onPlacementToggle: (type: string) => void,
    onModelChanged: (modelName: string) => void,
    onSnapToGround: () => void
) {
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
        </div>
        <div style="margin-top:8px;font-size:12px;color:#aaa;">
            💡 Кликните по земле, чтобы разместить объект.<br>
            Выделите объект мышкой для редактирования.<br>
            F10 – выход из редактора.
        </div>
    `;
    document.body.appendChild(panel);

    // Предотвращаем всплытие событий мыши от панели к canvas
    panel.addEventListener('mousedown', (e) => e.stopPropagation());
    panel.addEventListener('mouseup', (e) => e.stopPropagation());
    panel.addEventListener('click', (e) => e.stopPropagation());

    // Получаем элементы с корректным приведением типов
    propertiesPanel = document.getElementById('properties-section')!;
    inputScaleX = document.getElementById('inp-sx') as HTMLInputElement;
    inputScaleY = document.getElementById('inp-sy') as HTMLInputElement;
    inputScaleZ = document.getElementById('inp-sz') as HTMLInputElement;
    labelScaleX = document.getElementById('label-sx') as HTMLLabelElement;
    labelScaleZ = document.getElementById('label-sz') as HTMLLabelElement;
    inputPosX = document.getElementById('inp-x') as HTMLInputElement;
    inputPosY = document.getElementById('inp-y') as HTMLInputElement;
    inputPosZ = document.getElementById('inp-z') as HTMLInputElement;
    btnSnap = document.getElementById('btn-snap') as HTMLButtonElement;

    // Обработчики
    document.querySelectorAll('input[name="type"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            placementType = (e.target as HTMLInputElement).value;
            updatePlacementButtonState();
        });
    });

    document.getElementById('btn-place')!.onclick = () => {
        placementMode = !placementMode;
        updatePlacementButtonState();
        if (typeof onPlacementToggle === 'function') {
            onPlacementToggle(placementMode ? placementType : '');
        }
    };

    document.getElementById('btn-delete')!.onclick = onDelete;
    document.getElementById('btn-save')!.onclick = onSave;
    btnSnap.onclick = () => onSnapToGround();

    inputScaleX.addEventListener('input', () => onPropertiesChanged());
    inputScaleY.addEventListener('input', () => onPropertiesChanged());
    inputScaleZ.addEventListener('input', () => onPropertiesChanged());
    inputPosX.addEventListener('input', () => onPropertiesChanged());
    inputPosZ.addEventListener('input', () => onPropertiesChanged());
    inputPosY.addEventListener('input', () => onPropertiesChanged());

    // Обработка смены модели
    const selectModel = document.getElementById('select-model') as HTMLSelectElement;
    selectModel.addEventListener('change', () => {
        onModelChanged(selectModel.value);
    });
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