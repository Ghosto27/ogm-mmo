import * as THREE from 'three';
import { room } from '../network';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { scene, camera, renderer } from '../scene';
import { setEditorActive, isEditorActive } from './EditorState';
import {
    createEditorUI, showEditorUI,
    updatePropertiesPanel, getScaleFromInputs, getPositionFromInputs,
    setVegetationZones, showVegetationZoneProps,
    getRotationFromInputs, showMobZoneProps, setMobZones,
    showResourceNodeProps, getResourceNodeTypeFromProps,
    getResourcePlacementType, resetResourcePlacementButton
} from './EditorUI';
import { inputState, sprintKey } from '../input';
import { terrainMesh, getTerrainHeightAtFast, getTerrainHeightAt } from '../render/TerrainRenderer';
import { worldMeshes } from '../render/WorldRenderer';
import { createModelClone, getModelBaseSize } from '../utils/modelLoader';
import { getColliderConfig } from '../collisionConfig';
import { pushUIMode, popUIMode } from '../cameraControls';
import { setResourceNodesVisible } from '../render/ResourceNodeRenderer';

let transformControls: TransformControls;
let editorObjects: THREE.Object3D[] = [];
let selectedObjects: THREE.Object3D[] = [];
let placementMode = false;
let placementType: 'cube' | 'cylinder' | 'model' = 'cube';
let selectedModelName = 'Tree_1';
let vegetationZones: any[] = [];
let zoneDrawing = false;
let zoneStartPoint: THREE.Vector3 | null = null;
let zoneLines: THREE.LineLoop[] = [];
let mobZones: any[] = [];
let drawingMobZone = false;
let mobZoneCenter: THREE.Vector3 | null = null;
let mobZonePreview: THREE.Line | null = null;
let mobZoneVisuals: THREE.LineLoop[] = [];
let resourceEditorObjects: THREE.Object3D[] = [];
let resourcePlacementMode = false;

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

function createPrimitive(type: 'cube' | 'cylinder', x: number, z: number): THREE.Mesh {
    const geo = type === 'cube' ? new THREE.BoxGeometry(1, 1, 1) : new THREE.CylinderGeometry(1, 1, 1, 16);
    const mat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0, z);
    mesh.userData.baseMinY = -0.5;
    mesh.userData.editorMode = true;
    mesh.userData.editorType = type;
    const tempBox = new THREE.Box3().setFromObject(mesh);
    mesh.userData.baseHeight = tempBox.max.y - tempBox.min.y;
    return mesh;
}

async function createModelInstance(x: number, z: number): Promise<THREE.Group | null> {
    try {
        const clone = await createModelClone(selectedModelName);
        clone.position.set(x, 0, z);
        const box = new THREE.Box3().setFromObject(clone);
        clone.userData.baseHeight = box.max.y - box.min.y;
        clone.userData.baseMinY = 0;      // модели имеют pivot внизу
        clone.userData.editorMode = true;
        clone.userData.editorType = 'model';
        clone.userData.modelName = selectedModelName;
        return clone;
    } catch (err) {
        console.error(`Ошибка загрузки модели ${selectedModelName}:`, err);
        return null;
    }
}

// ---------- Выделение и редактирование ----------
function attachTransformControls(obj: THREE.Object3D, addToSelection: boolean = false) {
    if (!addToSelection) {
        // Очищаем предыдущее выделение
        deselectAllObjects();
    }

    // Если объект уже выделен – снимаем выделение (при Shift+клик)
    if (addToSelection && selectedObjects.includes(obj)) {
        const idx = selectedObjects.indexOf(obj);
        if (idx !== -1) selectedObjects.splice(idx, 1);
        if (selectedObjects.length === 0) {
            transformControls.detach();
            updatePropertiesPanel(null);
            showResourceNodeProps(null);
        } else {
            // Привязываемся к последнему оставшемуся
            const last = selectedObjects[selectedObjects.length - 1];
            transformControls.attach(last);
            if (last.userData.isResourceNode) {
                updatePropertiesPanel(null);
                showResourceNodeProps(last);
            } else {
                updatePropertiesPanel(last);
                showResourceNodeProps(null);
            }
        }
        return;
    }

    // Добавляем объект (если его ещё нет)
    if (!selectedObjects.includes(obj)) {
        selectedObjects.push(obj);
    }

    // Всегда привязываем TransformControls к последнему выбранному
    transformControls.attach(obj);
    if (obj.userData.isResourceNode) {
        updatePropertiesPanel(null);
        showResourceNodeProps(obj);
    } else {
        updatePropertiesPanel(obj);
        showResourceNodeProps(null);
    }
}

function deselectAllObjects() {
    if (transformControls) transformControls.detach();
    selectedObjects = [];
    updatePropertiesPanel(null);
    showResourceNodeProps(null);
}

function deselectObject() {
    deselectAllObjects();
}

function deleteSelectedObjects() {
    if (selectedObjects.length === 0) return;
    for (const obj of selectedObjects) {
        scene.remove(obj);
        const editorIdx = editorObjects.indexOf(obj);
        if (editorIdx !== -1) editorObjects.splice(editorIdx, 1);
        const resourceIdx = resourceEditorObjects.indexOf(obj);
        if (resourceIdx !== -1) resourceEditorObjects.splice(resourceIdx, 1);
    }
    deselectAllObjects();
}

async function onEditorClick(event: MouseEvent) {
    if (drawingMobZone) {
        handleMobZoneClick(event);
        return;
    }
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
                await placeObject(point.x, point.z);
            }
        }
        return;
    }

    if (resourcePlacementMode) {
        if (terrainMesh) {
            const intersects = raycaster.intersectObject(terrainMesh);
            if (intersects.length > 0) {
                const point = intersects[0].point;
                placeResourceNode(point.x, point.z);
            }
        }
        return;
    }

    // Ищем ресурсную ноду под курсором
    const resourceHits = raycaster.intersectObjects(resourceEditorObjects, true);
    if (resourceHits.length > 0) {
        let hit: THREE.Object3D | null = resourceHits[0].object;
        while (hit && !hit.userData?.isResourceNode) {
            hit = hit.parent;
        }
        if (hit && hit.userData?.isResourceNode) {
            attachTransformControls(hit, event.shiftKey);
            return;
        }
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
            const shiftKey = event.shiftKey; // проверяем зажатый Shift
            attachTransformControls(hit, shiftKey);
            return;
        }
    }

    // Мимо – снять выделение
    deselectObject();
}

async function placeObject(worldX: number, worldZ: number): Promise<void> {
    const y = getTerrainHeightAtFast(worldX, worldZ);
    let obj: THREE.Object3D | null = null;
    if (placementType === 'cube' || placementType === 'cylinder') {
        obj = createPrimitive(placementType, worldX, worldZ);
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

const RESOURCE_NODE_COLORS: Record<string, string> = {
    copper_ore: "#d4875a",
    tin_ore: "#c8c8c8",
    iron_ore: "#b0a090",
    coal: "#444444",
};

function createResourceNodePlaceholder(type: string, x: number, z: number): THREE.Mesh {
    const geo = new THREE.BoxGeometry(1, 0.5, 1);
    const color = RESOURCE_NODE_COLORS[type] || '#888888';
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15 });
    const mesh = new THREE.Mesh(geo, mat);
    const y = getTerrainHeightAtFast(x, z);
    mesh.position.set(x, y + 0.25, z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.userData.isResourceNode = true;
    mesh.userData.oreType = type;
    mesh.userData.editorId = 'resnode_' + crypto.randomUUID();
    mesh.userData.baseMinY = 0.25;
    return mesh;
}

function placeResourceNode(x: number, z: number) {
    const type = getResourcePlacementType();
    if (!type) return;
    const mesh = createResourceNodePlaceholder(type, x, z);
    scene.add(mesh);
    resourceEditorObjects.push(mesh);
    attachTransformControls(mesh);
}

// Функции-обработчики для UI
function onDeleteAction() {
    deleteSelectedObjects();
}

function onPropertiesChanged() {
    if (selectedObjects.length === 0) return;

    const first = selectedObjects[0];
    if (first.userData.isResourceNode) {
        // Resource node: update type
        const newType = getResourceNodeTypeFromProps();
        first.userData.oreType = newType;
        const color = RESOURCE_NODE_COLORS[newType] || '#888888';
        const mat = (first as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (mat) {
            mat.color.set(color);
            mat.emissive.set(color);
        }
        showResourceNodeProps(first);
        return;
    }

    const pos = getPositionFromInputs();
    const scl = getScaleFromInputs();
    const rot = getRotationFromInputs();

    // Запоминаем старые значения первого объекта (для расчёта смещения)
    const oldPos = first.position.clone();
    const oldScale = first.scale.clone();
    const oldRot = first.rotation.clone();

    // Вычисляем дельты
    const deltaPos = new THREE.Vector3().subVectors(pos, oldPos);
    const deltaScale = new THREE.Vector3().subVectors(scl, oldScale);
    // Для поворота проще установить одинаковый поворот для всех? Или тоже дельту.
    // Пока сделаем одинаковый поворот, т.к. вращать группу с разными initial сложно.
    const newRot = rot;

    for (const obj of selectedObjects) {
        obj.position.add(deltaPos);
        obj.scale.add(deltaScale);
        obj.rotation.set(newRot.x, newRot.y, newRot.z);
    }

    // Обновляем панель для первого объекта
    updatePropertiesPanel(first);
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

function onResourceNodePlacementToggle(type: string) {
    resourcePlacementMode = !!type;
    if (!type) {
        resetResourcePlacementButton();
    }
}

function onDeleteResourceNode() {
    deleteSelectedObjects();
}

function onSaveResourceNodes() {
    const nodes = resourceEditorObjects.map(obj => ({
        id: obj.userData.editorId || 'resnode_' + crypto.randomUUID(),
        type: obj.userData.oreType || 'copper_ore',
        x: obj.position.x,
        z: obj.position.z,
        rotationY: obj.rotation.y,
    }));

    nodes.forEach(n => console.log(`[RESOURCE-SAVE] id=${n.id}, type=${n.type}, x=${n.x}, z=${n.z}, rot=${n.rotationY.toFixed(3)}`));

    if (room) {
        room.send('editorSaveResourceNodes', { nodes });
        console.log('[EDITOR] Ресурсные ноды сохранены');
    }
}

function requestResourceNodes() {
    if (!room) return;
    room.send('getResourceNodes');
    console.log('[EDITOR] Запрошены ресурсные ноды с сервера');
}

function requestVegetationZones() {
    if (!room) return;
    room.send('getVegetationZones');
    console.log('[EDITOR] Запрошены зоны с сервера');
}

function onGenerateSelectedZone() {
    const select = document.getElementById('select-vegetation-zone') as HTMLSelectElement;
    if (!select) return;
    const idx = parseInt(select.value);
    if (isNaN(idx) || idx < 0 || idx >= vegetationZones.length) return;
    const zone = vegetationZones[idx];
    if (!zone) return;

    const maxAttempts = 50;
    const rng = () => Math.random();
    const objects: any[] = [];
    // Хранилище размещённых объектов: позиция + радиус
    const placedObjects: { x: number; z: number; radius: number }[] = [];
    const GAP = 0.3; // минимальный зазор между краями объектов

    for (let i = 0; i < zone.count; i++) {
        let placed = false;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const x = zone.centerX + (rng() - 0.5) * zone.width;
            const z = zone.centerZ + (rng() - 0.5) * zone.depth;
            const scale = zone.minScale + rng() * (zone.maxScale - zone.minScale);
            const rotationY = rng() * Math.PI * 2;
            const modelName = zone.modelNames[Math.floor(rng() * zone.modelNames.length)];

            const baseRadius = getModelBaseSize(modelName) / 2;   // половина максимального измерения
            const instanceRadius = baseRadius * scale;

            // Проверка минимальной дистанции с учётом размеров
            let tooClose = false;
            for (const placed of placedObjects) {
                const dx = x - placed.x;
                const dz = z - placed.z;
                const minDist = instanceRadius + placed.radius + GAP;
                if (dx * dx + dz * dz < minDist * minDist) {
                    tooClose = true;
                    break;
                }
            }
            if (tooClose) continue;

            // Точный рейкаст для получения высоты (клиентский рейкаст)
            const y = getTerrainHeightAt(x, z) - 0.1; // лёгкое утапливание

            objects.push({
                x, z, y, scale, rotationY, modelName,
            });
            placedObjects.push({ x, z, radius: instanceRadius });
            placed = true;
            break;
        }
        if (!placed) {
            console.warn(`[EDITOR] Не удалось разместить объект #${i + 1} в зоне "${zone.id}"`);
        }
    }

    // Отправляем чанками (по 50) на сервер
    const CHUNK_SIZE = 50;
    const totalChunks = Math.ceil(objects.length / CHUNK_SIZE);
    for (let i = 0; i < totalChunks; i++) {
        const chunk = objects.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        room.send('editorRegenerateVegetationChunk', {
            zoneId: zone.id,
            chunkIndex: i,
            totalChunks: totalChunks,
            objects: chunk,
        });
    }
    console.log(`[EDITOR] Отправлено ${objects.length} объектов для зоны "${zone.id}"`);
}

// ---------- Экспортные функции ----------
export function initEditor() {
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
        onNewMobZone: startDrawingMobZone,
        onSaveMobZones: saveMobZones,
        onDeleteMobZone: deleteSelectedMobZone,
        onMobZoneSelected: (index) => {
            showMobZoneProps(index);
            highlightMobZone(index);
        },
        onTabMobsSelected: () => requestMobZones(),
        onZoneGeometryChanged: (index) => { updateZoneRect(index); },
        onMobZoneGeometryChanged: (index) => { updateMobZoneCircle(index); },
        onGenerateVegetationZone: onGenerateSelectedZone,
        onPlaceResourceNode: onResourceNodePlacementToggle,
        onSaveResourceNodes: onSaveResourceNodes,
        onDeleteResourceNode: onDeleteResourceNode,
        onTabResourcesSelected: () => { requestResourceNodes(); },
    });

    // TransformControls
    transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.addEventListener('change', () => {
        if (selectedObjects.length > 0) {
            const last = selectedObjects[selectedObjects.length - 1];
            if (last.userData.isResourceNode) {
                showResourceNodeProps(last);
            } else {
                updatePropertiesPanel(last);
            }
        }
    });

    // Обработчики мыши
    window.addEventListener('mousedown', onMouseDownForEditor);
    window.addEventListener('mouseup', onMouseUpForEditor);
    window.addEventListener('mousemove', onMouseMoveForEditor);
    window.addEventListener('click', onEditorClick);

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' && isEditorActive()) {
            deleteSelectedObjects();
        }
    });

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
            resourcePlacementMode = false;
            resetResourcePlacementButton();
            deselectObject();
        }
    });

    console.log('[EDITOR] Редактор инициализирован');
}

async function enterEditorMode() {
    setEditorActive(true);
    showEditorUI(true);
    pushUIMode();

    // Скрываем реальные ресурсные ноды (редактор покажет свои placeholder'ы)
    setResourceNodesVisible(false);

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
    selectedObjects = [];
    startFreeCamera();

    // Загружаем ресурсные ноды для редактора
    resourceEditorObjects = [];
    requestResourceNodes();

    console.log(`[EDITOR] Загружено ${editorObjects.length} объектов`);
}

function exitEditorMode() {
    setEditorActive(false);
    showEditorUI(false);
    stopFreeCamera();
    deselectObject();
    popUIMode();
    placementMode = false;
    resourcePlacementMode = false;
    
    // Показываем реальные ресурсные ноды
    setResourceNodesVisible(true);

    // Очистка визуализаций зон растительности
    clearZoneVisuals();
    vegetationZones = [];
    
    // Очистка визуализаций моб-зон
    for (const line of mobZoneVisuals) {
        scene.remove(line);
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
    }
    mobZoneVisuals = [];
    mobZones = [];
    drawingMobZone = false;
    mobZoneCenter = null;
    
    // Очистка placeholder'ов ресурсных нод
    for (const obj of resourceEditorObjects) {
        scene.remove(obj);
    }
    resourceEditorObjects = [];
    
    editorObjects = [];
    selectedObjects = [];
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
    for (const obj of selectedObjects) {
        snapToGround(obj);
    }
    if (selectedObjects.length > 0) {
        updatePropertiesPanel(selectedObjects[0]);
    }
}

// === Логика зон растительности ===

function startDrawingZone() {
    zoneDrawing = true;
    zoneStartPoint = null;
    // Убираем старый превью
    console.log('[EDITOR] Начало рисования зоны. Кликните по террейну для установки центра.');
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
            objectType: 'tree',
            modelNames: ['Tree_1'],
            count: 10,
            minScale: 1,
            maxScale: 3
        };
        vegetationZones.push(newZone);
        setVegetationZones(vegetationZones);
        highlightZone(vegetationZones.length - 1);
        zoneDrawing = false;
        const newLine = drawZoneRect(newZone);
        zoneLines.push(newLine);
        console.log('[EDITOR] Зона создана:', newZone);
    }
}

function saveVegetationZones() {
    if (room) {
        room.send('editorSaveVegetationZones', { zones: vegetationZones });
        console.log('[EDITOR] Зоны сохранены, запрашиваем обновлённые зоны...');
        // Даём серверу немного времени на обработку, затем запрашиваем зоны заново
        setTimeout(() => {
            requestVegetationZones();
        }, 500);
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

function drawZoneRect(zone: any): THREE.LineLoop {
    const { centerX, centerZ, width, depth } = zone;
    const halfW = width / 2;
    const halfD = depth / 2;
    const y = getTerrainHeightAtFast(centerX, centerZ) + 0.5;

    const points = [
        new THREE.Vector3(centerX - halfW, y, centerZ - halfD),
        new THREE.Vector3(centerX + halfW, y, centerZ - halfD),
        new THREE.Vector3(centerX + halfW, y, centerZ + halfD),
        new THREE.Vector3(centerX - halfW, y, centerZ + halfD),
    ];

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    const lineLoop = new THREE.LineLoop(geometry, material);
    scene.add(lineLoop);   // сразу добавляем в сцену, но не в массив
    return lineLoop;
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
        const line = drawZoneRect(zone);
        zoneLines.push(line);
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

function drawMobZoneCircle(centerX: number, centerZ: number, radius: number): THREE.LineLoop {
    const segments = 64;
    const points = [];
    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * radius;
        const z = centerZ + Math.sin(angle) * radius;
        const y = getTerrainHeightAtFast(x, z) + 0.5;
        points.push(new THREE.Vector3(x, y, z));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0xff0000 });
    const line = new THREE.LineLoop(geo, mat);
    scene.add(line);
    return line;
}

function updateMobZoneCircle(index: number) {
    if (index < 0 || index >= mobZones.length) return;
    const zone = mobZones[index];
    if (!zone) return;

    // Удаляем старую линию
    const oldLine = mobZoneVisuals[index];
    if (oldLine) {
        scene.remove(oldLine);
        oldLine.geometry.dispose();
        (oldLine.material as THREE.Material).dispose();
    }

    // Создаём новую линию
    const newLine = drawMobZoneCircle(zone.centerX, zone.centerZ, zone.radius);
    // Вставляем на то же место в массиве
    mobZoneVisuals[index] = newLine;

    // Подсвечиваем, если она была выделена
    highlightMobZone(index);
}

function handleMobZoneClick(event: MouseEvent) {
    if (!terrainMesh) return;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(terrainMesh);
    if (intersects.length === 0) return;
    const point = intersects[0].point;

    if (!mobZoneCenter) {
        mobZoneCenter = point.clone();
    } else {
        const radius = point.distanceTo(mobZoneCenter);
        const newZone = {
            id: `mob_zone_${Date.now()}`,
            centerX: mobZoneCenter.x,
            centerZ: mobZoneCenter.z,
            radius,
            count: 5,
        };
        mobZones.push(newZone);
        setMobZones(mobZones);
        const newLine = drawMobZoneCircle(newZone.centerX, newZone.centerZ, newZone.radius);
        mobZoneVisuals.push(newLine);
        drawingMobZone = false;
        mobZoneCenter = null;
    }
}

function saveMobZones() {
    if (room) {
        room.send('editorSaveMobZones', { zones: mobZones });
    }
}

function deleteSelectedMobZone() {
    const select = document.getElementById('select-mob-zone') as HTMLSelectElement;
    if (!select) return;
    const idx = parseInt(select.value);
    if (isNaN(idx) || idx < 0 || idx >= mobZones.length) return;
    
    // Удаляем визуализацию круга
    const line = mobZoneVisuals[idx];
    if (line) {
        scene.remove(line);
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
        mobZoneVisuals.splice(idx, 1);
    }
    
    mobZones.splice(idx, 1);
    setMobZones(mobZones);
    mobZoneCenter = null;
    drawingMobZone = false;
}

function requestMobZones() { room.send('getMobZones'); }

function startDrawingMobZone() {
    drawingMobZone = true;
    mobZoneCenter = null;
    console.log('[EDITOR] Начало рисования моб-зоны. Кликните для установки центра.');
}

function highlightMobZone(index: number) {
    for (let i = 0; i < mobZoneVisuals.length; i++) {
        const line = mobZoneVisuals[i];
        if (line && line.material) {
            (line.material as THREE.LineBasicMaterial).color.set(
                i === index ? 0x0000ff : 0xff0000
            );
        }
    }
}

export function applyResourceNodes(nodes: { id: string; type: string; x: number; z: number; rotationY?: number }[]) {
    // Очищаем старые placeholder'ы
    for (const obj of resourceEditorObjects) {
        scene.remove(obj);
    }
    resourceEditorObjects = [];

    for (const node of nodes) {
        const mesh = createResourceNodePlaceholder(node.type, node.x, node.z);
        mesh.userData.editorId = node.id;
        mesh.rotation.y = node.rotationY || 0;
        scene.add(mesh);
        resourceEditorObjects.push(mesh);
    }
    console.log(`[EDITOR] Загружено ${nodes.length} ресурсных нод`);
}

export function applyMobZones(zones: any[]) {
    // Очищаем старые визуализации
    for (const line of mobZoneVisuals) {
        scene.remove(line);
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
    }
    mobZoneVisuals = [];
    mobZones = zones;
    // Рисуем новые круги
    for (const z of zones) {
        const line = drawMobZoneCircle(z.centerX, z.centerZ, z.radius);
        mobZoneVisuals.push(line);
    }
    setMobZones(zones);
    console.log('[EDITOR] Моб-зоны загружены:', zones.length);
}

function updateZoneRect(index: number) {
    if (index < 0 || index >= vegetationZones.length) return;
    const zone = vegetationZones[index];
    if (!zone) return;

    // Удаляем старую линию (и из сцены, и из массива)
    const oldLine = zoneLines[index];
    if (oldLine) {
        scene.remove(oldLine);
        oldLine.geometry.dispose();
        (oldLine.material as THREE.Material).dispose();
    }

    // Создаём новую линию
    const newLine = drawZoneRect(zone);
    // Вставляем её на то же место в массиве
    zoneLines[index] = newLine;

    // Восстанавливаем подсветку (если она была)
    highlightZone(index);
}