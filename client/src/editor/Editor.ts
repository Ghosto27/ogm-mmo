import * as THREE from 'three';
import { room } from '../network';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { scene, camera, renderer } from '../scene';
import { setEditorActive, isEditorActive } from './EditorState';
import {
    createEditorUI, showEditorUI,
    updatePropertiesPanel, getScaleFromInputs, getPositionFromInputs,
    setVegetationZones, showVegetationZoneProps,
    getRotationFromInputs
} from './EditorUI';
import { inputState, sprintKey } from '../input';
import { terrainMesh, getTerrainHeightAtFast } from '../render/TerrainRenderer';
import { worldMeshes } from '../render/WorldRenderer';

let transformControls: TransformControls;
let editorObjects: THREE.Object3D[] = [];
let selectedObject: THREE.Object3D | null = null;
let placementMode = false;
let placementType: 'cube' | 'cylinder' | 'model' = 'cube';
let selectedModelName = 'Tree_1';
let vegetationZones: any[] = [];
let zoneDrawing = false;
let zoneStartPoint: THREE.Vector3 | null = null;
let zonePreviewLines: THREE.Line[] = []; // временные линии прямоугольника
let zoneLines: THREE.LineLoop[] = [];
// Кэш загруженных моделей (имя → группа)
const modelTemplates = new Map<string, THREE.Group>();

// ---------- свободная камера (оставлено без изменений) ----------
let freeCameraEnabled = false;
const cameraSpeed = 30;
let yaw = 0, pitch = 0;
let mouseDown = false;
let lastMouseX = 0, lastMouseY = 0;
let mouseDragged = false;

function onMouseDownForEditor(e: MouseEvent) {
    if (!freeCameraEnabled) return;
    if (e.button === 2) {
        mouseDown = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    }
    if (e.button === 0) {
        mouseDragged = false;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    }
}

function onMouseUpForEditor(e: MouseEvent) {
    if (e.button === 2) {
        mouseDown = false;
    }
    if (e.button === 0) {
        mouseDragged = false;
    }
}

function onMouseMoveForEditor(e: MouseEvent) {
    if (mouseDown && (e.buttons & 2) === 2) {
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        const sensitivity = 0.002;
        yaw -= dx * sensitivity;
        pitch -= dy * sensitivity;
        pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
        camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
        mouseDragged = true;
    } else if (mouseDown && (e.buttons & 1) === 1) {
        mouseDragged = true; // перемещение с зажатой ЛКМ тоже считаем драгом
    }
}

function startFreeCamera() {
    freeCameraEnabled = true;
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    yaw = euler.y;
    pitch = euler.x;
    window.addEventListener('mousedown', onMouseDownForEditor);
    window.addEventListener('mouseup', onMouseUpForEditor);
    window.addEventListener('mousemove', onMouseMoveForEditor);
}

function stopFreeCamera() {
    freeCameraEnabled = false;
    mouseDown = false;
    window.removeEventListener('mousedown', onMouseDownForEditor);
    window.removeEventListener('mouseup', onMouseUpForEditor);
    window.removeEventListener('mousemove', onMouseMoveForEditor);
}

function moveCamera(deltaTime: number) {
    if (!freeCameraEnabled) return;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const speed = cameraSpeed * deltaTime * (sprintKey ? 3.0 : 1.0);
    if (inputState.forward) camera.position.addScaledVector(forward, speed);
    if (inputState.backward) camera.position.addScaledVector(forward, -speed);
    if (inputState.right) camera.position.addScaledVector(right, speed);
    if (inputState.left) camera.position.addScaledVector(right, -speed);
}

// ---------- Создание объектов ----------
function createCube(x: number, z: number): THREE.Mesh {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const cube = new THREE.Mesh(geo, mat);
    cube.position.set(x, 0, z);
    cube.userData.baseMinY = -0.5;
    cube.userData.editorMode = true;
    cube.userData.editorType = 'cube';
    const tempBox = new THREE.Box3().setFromObject(cube);
    cube.userData.baseHeight = tempBox.max.y - tempBox.min.y;
    return cube;
}

function createCylinder(x: number, z: number): THREE.Mesh {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 16);
    const mat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const cylinder = new THREE.Mesh(geo, mat);
    cylinder.position.set(x, 0, z);
    cylinder.userData.baseMinY = -0.5;
    cylinder.userData.editorMode = true;
    cylinder.userData.editorType = 'cylinder';
    const box = new THREE.Box3().setFromObject(cylinder);
    cylinder.userData.baseHeight = box.max.y - box.min.y;
    return cylinder;
}

async function loadModelTemplate(modelName: string): Promise<THREE.Group> {
    if (modelTemplates.has(modelName)) {
        return modelTemplates.get(modelName)!;
    }
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(`/models/${modelName}.glb`);
    const template = gltf.scene;
    modelTemplates.set(modelName, template);
    return template;
}

async function createModelInstance(x: number, z: number): Promise<THREE.Group | null> {
    try {
        const template = await loadModelTemplate(selectedModelName);
        const clone = template.clone(true);
        clone.position.set(x, 0, z);
        const box = new THREE.Box3().setFromObject(clone);
        clone.userData.baseHeight = box.max.y - box.min.y;
        clone.userData.baseMinY = box.min.y;
        clone.userData.editorMode = true;
        clone.userData.editorType = 'model';
        clone.userData.modelName = selectedModelName;
        return clone;
    } catch (err) {
        console.error(`Ошибка загрузки модели ${selectedModelName}:`, err);
        return null;
    }
}

// Глобальное положение мыши для raycasting
let lastMouseScreen = new THREE.Vector2();
window.addEventListener('mousemove', (e) => {
    lastMouseScreen.x = (e.clientX / window.innerWidth) * 2 - 1;
    lastMouseScreen.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

// ---------- Выделение и редактирование ----------
function attachTransformControls(obj: THREE.Object3D) {
    if (selectedObject) transformControls.detach();
    transformControls.attach(obj);
    selectedObject = obj;
    updatePropertiesPanel(obj); // обновите сигнатуру в EditorUI (см. далее)
}

function deselectObject() {
    if (selectedObject) {
        transformControls.detach();
        selectedObject = null;
        updatePropertiesPanel(null);
    }
}

function deleteSelectedObject() {
    if (!selectedObject) return;
    scene.remove(selectedObject);
    const idx = editorObjects.indexOf(selectedObject);
    if (idx !== -1) editorObjects.splice(idx, 1);
    deselectObject();
}

async function onEditorClick(event: MouseEvent) {
    if (!freeCameraEnabled) return;
    if (event.button !== 0) return;
    if (mouseDragged) return;
    if (zoneDrawing) { handleZoneClick(event); return; }

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    if (placementMode) {
        if (terrainMesh) {
            const intersects = raycaster.intersectObject(terrainMesh);
            if (intersects.length > 0) {
                const point = intersects[0].point;
                await placeObject(point.x, point.z);   // <-- главное изменение
            }
        }
        return;
    }

    // Ищем объект редактора под курсором
    const editorHits = raycaster.intersectObjects(editorObjects, true);
    if (editorHits.length > 0) {
        // Ищем первый объект с меткой редактора
        let hit: THREE.Object3D | null = editorHits[0].object;
        while (hit && !hit.userData?.editorMode) {
            hit = hit.parent;
        }
        if (hit && hit.userData?.editorMode) {
            attachTransformControls(hit);
            return;
        }
    }

    // Мимо – снять выделение
    deselectObject();
}

async function placeObject(worldX: number, worldZ: number): Promise<void> {
    const y = getTerrainHeightAtFast(worldX, worldZ);
    let obj: THREE.Object3D | null = null;
    if (placementType === 'cube') {
        obj = createCube(worldX, worldZ);
    } else if (placementType === 'cylinder') {
        obj = createCylinder(worldX, worldZ);
    } else if (placementType === 'model') {
        obj = await createModelInstance(worldX, worldZ);
    }
    if (!obj) return;
    obj.position.y = y + (obj.scale?.y ?? 1) / 2;  // если модель не имеет scale, предполагаем 1

    // Вычисляем базовую высоту, если ещё нет
    if (!obj.userData.baseHeight) {
        const box = new THREE.Box3().setFromObject(obj);
        obj.userData.baseHeight = box.max.y - box.min.y;
    }
    snapToGround(obj);
    scene.add(obj);
    editorObjects.push(obj);
    attachTransformControls(obj);
}

// Функции-обработчики для UI
function onDeleteAction() {
    deleteSelectedObject();
}

function onPropertiesChanged() {
    if (!selectedObject) return;
    const pos = getPositionFromInputs();
    const scl = getScaleFromInputs();
    const rot = getRotationFromInputs();
    //console.log(`[EDITOR-PANEL] uuid=${selectedObject.uuid}, oldPos=(${selectedObject.position.x.toFixed(1)},${selectedObject.position.y.toFixed(1)},${selectedObject.position.z.toFixed(1)}), newPos=(${pos.x.toFixed(1)},${pos.y.toFixed(1)},${pos.z.toFixed(1)})`);
    selectedObject.position.set(pos.x, pos.y, pos.z);
    selectedObject.scale.set(scl.x, scl.y, scl.z);
    selectedObject.rotation.set(rot.x, rot.y, rot.z);
    transformControls.update(0);
}

function onPlacementToggle(type: string) {
    if (type) {
        placementType = type as 'cube' | 'cylinder' | 'model';
        placementMode = true;
    } else {
        placementMode = false;
    }
}

// ---------- Экспортные функции ----------
export function initEditor() {
    // Подписываемся на получение зон с сервера (должно быть до первого запроса)


    createEditorUI({
        onSaveStatic: onSaveAction,
        onDeleteStatic: onDeleteAction,
        onPropertiesChanged: onPropertiesChanged,
        onPlacementToggle: onPlacementToggle,
        onSnapToGround: onSnapToGroundAction,
        onModelChanged: (modelName) => { selectedModelName = modelName; },
        onNewVegetationZone: startDrawingZone,
        onSaveVegetationZones: saveVegetationZones,
        onDeleteVegetationZone: deleteSelectedZone,
        onVegetationZoneSelected: (index) => {
            showVegetationZoneProps(index);
            highlightZone(index);
        },
        onTabVegetationSelected: () => { requestVegetationZones(); },
    });

    function requestVegetationZones() {
        if (!room) return;
        room.send('getVegetationZones');
        console.log('[EDITOR] Запрошены зоны с сервера');
    }

    // TransformControls
    transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.addEventListener('change', () => {
        if (selectedObject) {
            //console.log(`[EDITOR-GIZMO] uuid=${selectedObject.uuid}, newPos=(${selectedObject.position.x.toFixed(1)},${selectedObject.position.y.toFixed(1)},${selectedObject.position.z.toFixed(1)})`);
            updatePropertiesPanel(selectedObject);
        }
    });

    // Обработчики мыши
    window.addEventListener('mousedown', onMouseDownForEditor);
    window.addEventListener('mouseup', onMouseUpForEditor);
    window.addEventListener('mousemove', onMouseMoveForEditor);
    window.addEventListener('click', onEditorClick);

    window.addEventListener('keydown', async (e) => {
        if (e.key === 'F10') {
            e.preventDefault();
            if (isEditorActive()) {
                exitEditorMode();
            } else {
                await enterEditorMode();
            }
        }
        // Escape сбрасывает выделение и режим размещения
        if (e.key === 'Escape' && isEditorActive()) {
            placementMode = false;
            deselectObject();
        }
    });

    console.log('[EDITOR] Редактор инициализирован');
}

async function enterEditorMode() {
    setEditorActive(true);
    showEditorUI(true);

    // --- Очистка мусора: удаляем объекты, которые не являются актуальными оригиналами из worldMeshes ---
    const toRemove: THREE.Object3D[] = [];
    scene.traverse((child) => {
        if (child.userData && (child.userData.editorMode || child.userData.editorId)) {
            // Является ли этот объект одним из редакторских оригиналов из worldMeshes?
            const isOriginal = Object.values(worldMeshes).some(mesh => mesh === child);
            if (!isOriginal) {
                // Это мусорный клон или забытый объект
                toRemove.push(child);
            }
        }
    });
    toRemove.forEach(obj => {
        //console.log(`[EDITOR] Удалён мусорный объект: uuid=${obj.uuid}, pos=(${obj.position.x.toFixed(1)},${obj.position.y.toFixed(1)},${obj.position.z.toFixed(1)})`);
        scene.remove(obj);
    });
    // ---

    editorObjects = [];
    for (const id in worldMeshes) {
        if (!id.startsWith('editor_')) continue;
        const mesh = worldMeshes[id];
        mesh.userData.editorId = id;
        editorObjects.push(mesh);
        //console.log(`[EDITOR-LOAD] id=${id}, mesh.uuid=${mesh.uuid}, pos=(${mesh.position.x.toFixed(1)},${mesh.position.y.toFixed(1)},${mesh.position.z.toFixed(1)})`);
    }
    // Восстанавливаем editorType для моделей (если не был установлен ранее)
    for (const obj of editorObjects) {
        if (!obj.userData.editorType && obj.userData.modelName) {
            obj.userData.editorType = 'model';
        }
    }
    // Устанавливаем baseMinY для snap к земле
    for (const obj of editorObjects) {
        if (obj.userData.baseMinY === undefined) {
            if (obj.userData.editorType === 'cube' || obj.userData.editorType === 'cylinder') {
                obj.userData.baseMinY = -0.5;
            } else {
                obj.userData.baseMinY = 0;  // модели (pivot внизу)
            }
        }
    }

    if (editorObjects.length > 0) {
        attachTransformControls(editorObjects[0]);
        updatePropertiesPanel(editorObjects[0]);
    }

    startFreeCamera();
    console.log(`[EDITOR] Загружено ${editorObjects.length} объектов`);
}

function exitEditorMode() {
    setEditorActive(false);
    showEditorUI(false);
    stopFreeCamera();
    deselectObject();
    placementMode = false;
    clearZoneVisuals();
    vegetationZones = [];

    editorObjects = [];
    console.log('[EDITOR] Выход из редактора');
}

export function updateEditor(deltaTime: number) {
    if (isEditorActive() && freeCameraEnabled) {
        moveCamera(deltaTime);
    }
}

function onSaveAction() {
    for (const obj of editorObjects) {
        if (!obj.userData.editorId) {
            obj.userData.editorId = 'editor_' + crypto.randomUUID();
        }
    }

    const objects = editorObjects.map(obj => ({
        id: obj.userData.editorId,
        modelName: obj.userData.editorType === 'model' ? obj.userData.modelName : obj.userData.editorType,
        x: obj.position.x,
        y: obj.position.y,
        z: obj.position.z,
        scaleX: obj.scale.x,
        scaleY: obj.scale.y,
        scaleZ: obj.scale.z,
        rotationY: obj.rotation.y,
        rotationX: obj.rotation.x,
        rotationZ: obj.rotation.z,
        color: '#' + ((obj as any).material?.color?.getHexString?.() || 'ffffff'),
    }));

    // Лог перед отправкой
    objects.forEach(o => console.log(`[EDITOR-SAVE] id=${o.id}, x=${o.x.toFixed(1)}, z=${o.z.toFixed(1)}`));

    if (room) {
        room.send('editorSave', { objects });
        console.log('[EDITOR] Сохранение отправлено');
    }
}

function snapToGround(obj: THREE.Object3D) {
    if (obj.userData.baseMinY === undefined) return;
    const terrainY = getTerrainHeightAtFast(obj.position.x, obj.position.z);
    obj.position.y = terrainY - obj.userData.baseMinY * obj.scale.y;
}

function onSnapToGroundAction() {
    if (selectedObject) {
        snapToGround(selectedObject);
        updatePropertiesPanel(selectedObject);
    }
}

// === Логика зон растительности ===

function startDrawingZone() {
    zoneDrawing = true;
    zoneStartPoint = null;
    // Убираем старый превью
    clearZonePreview();
    console.log('[EDITOR] Начало рисования зоны. Кликните по террейну для установки центра.');
}

function clearZonePreview() {
    zonePreviewLines.forEach(line => scene.remove(line));
    zonePreviewLines = [];
}

function handleZoneClick(event: MouseEvent) {
    if (!terrainMesh) return;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(terrainMesh);
    if (intersects.length === 0) return;
    const point = intersects[0].point;

    if (!zoneStartPoint) {
        zoneStartPoint = point.clone();
        // Показываем точку или маркер (опционально)
    } else {
        // Завершаем прямоугольник: zoneStartPoint -> point
        const centerX = (zoneStartPoint.x + point.x) / 2;
        const centerZ = (zoneStartPoint.z + point.z) / 2;
        const width = Math.abs(point.x - zoneStartPoint.x);
        const depth = Math.abs(point.z - zoneStartPoint.z);

        const newZone = {
            id: `custom_zone_${Date.now()}`,
            centerX, centerZ, width, depth,
            objectType: 'tree',      // по умолчанию, потом можно изменить в панели
            modelNames: ['Tree_1'],  // по умолчанию
            count: 10,
            minScale: 1,
            maxScale: 3
        };
        vegetationZones.push(newZone);
        setVegetationZones(vegetationZones);
        drawZoneRect(newZone);
        highlightZone(vegetationZones.length - 1);
        zoneDrawing = false;
        console.log('[EDITOR] Зона создана:', newZone);
    }
}

function saveVegetationZones() {
    if (room) {
        room.send('editorSaveVegetationZones', { zones: vegetationZones });
        console.log('[EDITOR] Зоны сохранены:', vegetationZones);
    }
}

function deleteSelectedZone() {
    const select = document.getElementById('select-vegetation-zone') as HTMLSelectElement;
    const idx = parseInt(select.value);
    if (isNaN(idx) || idx < 0 || idx >= vegetationZones.length) return;
    vegetationZones.splice(idx, 1);
    setVegetationZones(vegetationZones);
    // Удаляем соответствующую линию
    scene.remove(zoneLines[idx]);
    zoneLines[idx].geometry.dispose();
    (zoneLines[idx].material as THREE.Material).dispose();
    zoneLines.splice(idx, 1);
}

function drawZoneRect(zone: any) {
    const { centerX, centerZ, width, depth } = zone;
    const halfW = width / 2;
    const halfD = depth / 2;
    const y = getTerrainHeightAtFast(centerX, centerZ) + 0.5; // чуть над землёй

    const points = [
        new THREE.Vector3(centerX - halfW, y, centerZ - halfD),
        new THREE.Vector3(centerX + halfW, y, centerZ - halfD),
        new THREE.Vector3(centerX + halfW, y, centerZ + halfD),
        new THREE.Vector3(centerX - halfW, y, centerZ + halfD),
    ];

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    const lineLoop = new THREE.LineLoop(geometry, material);
    scene.add(lineLoop);
    zoneLines.push(lineLoop);
}

function clearZoneVisuals() {
    for (const line of zoneLines) {
        scene.remove(line);
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
    }
    zoneLines = [];
}

/** Принимает массив зон от сервера и отображает их в редакторе */
export function applyVegetationZones(zones: any[]) {
    vegetationZones = zones;
    setVegetationZones(vegetationZones);   // обновляет выпадающий список
    clearZoneVisuals();                    // удаляет старые линии
    for (const zone of vegetationZones) {
        drawZoneRect(zone);                // рисует новые прямоугольники
    }
    if (vegetationZones.length > 0) {
        highlightZone(0); // выделить первую
    }
    console.log('[EDITOR] Зоны обновлены:', vegetationZones.length);
}

function highlightZone(selectedIndex: number) {
    for (let i = 0; i < zoneLines.length; i++) {
        const line = zoneLines[i];
        if (line && line.material) {
            (line.material as THREE.LineBasicMaterial).color.set(
                i === selectedIndex ? 0x0000ff : 0x00ff00
            );
        }
    }
}