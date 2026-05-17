# Three.js Заметки для разработки (OGM-MMO Project)

На основе `skills/threejs-builder/SKILL.md` и практического опыта из проекта OGM-MMO.

---

## 1. Scene Graph Mental Model

Three.js — это иерархическое дерево объектов (scene graph), где трансформации родителя влияют на детей.

**Ключевые принципы:**
- Всё, что добавлено в `scene`, рендерится
- Используй `Group` для группировки объектов (иерархические трансформации)
- Анимация = изменение position/rotation/scale во времени

## 2. Координатная система (CRITICAL)

**Three.js использует правую систему координат:**
```
      +Y (up)
       |
       |
       |_______ +X (right)
      /
     /
    +Z (toward camera/viewer)
```

| Ось | Направление | Использование |
|-----|-------------|---------------|
| +X | Вправо | Strafe right |
| -X | Влево | Strafe left |
| +Y | Вверх | Jump, height |
| -Y | Вниз | Fall, gravity |
| +Z | К камере | Approach |
| -Z | От камеры | **GLTF модели по умолчанию смотрят в -Z** |

### GLTF Model Orientation

GLTF из Blender/Maya смотрит в **-Z**. Чтобы развернуть:
```typescript
// GLTF смотрит в -Z. Для поворота к камере (+Z):
model.rotation.y = Math.PI;  // 180°

// Для поворота вправо (+X):
model.rotation.y = -Math.PI / 2;

// Для поворота влево (-X):
model.rotation.y = Math.PI / 2;
```

### Camera-Relative Movement (GAME CRITICAL)

**НЕЛЬЗЯ** использовать мировые оси для движения, если камера под углом:

```typescript
// ❌ НЕПРАВИЛЬНО - движение по мировым осям
if (keyW) player.position.z -= speed;

// ✓ ПРАВИЛЬНО - camera-relative movement
const forward = new THREE.Vector3();
camera.getWorldDirection(forward);
forward.y = 0;
forward.normalize();

const right = new THREE.Vector3();
right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

const velocity = new THREE.Vector3();
if (input.up) velocity.add(forward);
if (input.right) velocity.add(right);
// ... etc
```

## 3. Загрузка GLTF моделей

Паттерн для загрузки с кэшированием (как в `skeleton.ts`):

```typescript
const loader = new GLTFLoader();

export const modelReady = new Promise<void>((resolve, reject) => {
    loader.load(
        '/models/model.glb',
        (gltf) => {
            template = gltf.scene;
            template.visible = false; // прячем шаблон
            template.matrixAutoUpdate = false;
            if (template.parent) template.parent.remove(template);
            animations = gltf.animations;
            resolve();
        },
        undefined,
        (err) => {
            console.warn('[MODEL] Failed:', err);
            // Всё равно resolve, чтобы не блокировать игру
            resolve();
        }
    );
});
```

### Клонирование экземпляров (SKELETON BONE TRACKING)

Для моделей со скилетной анимацией:
```typescript
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
const instance = clone(template);
```

Для моделей без скилетной анимации (статика):
```typescript
const instance = template.clone(true); // deep clone
```

## 4. Animation System

### AnimationMixer + FSM (как в OGM-MMO)

```typescript
const mixer = new THREE.AnimationMixer(model);
const actions: Record<string, THREE.AnimationAction | null> = {};

animations.forEach((clip) => {
    const action = mixer.clipAction(clip, model);
    actions[clip.name.toLowerCase()] = action;
});

// One-shot анимации (атаки, смерть):
const oneShots = ['death', 'attack', 'slash01'];
for (const name of oneShots) {
    const action = actions[name];
    if (action) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
    }
}

// Запуск idle по умолчанию
if (actions['idle']) {
    actions['idle']!.play();
}

// Обновление каждый кадр:
mixer.update(deltaTime);
```

### Animation Name Mapping (для скелетов)

Если имена анимаций в GLTF отличаются от желаемых:
```typescript
const ANIM_MAP: Record<string, string> = {
    'skeleton_idle': 'idle',
    'skeleton_walk_forward': 'walk_forward',
    // ...
};

animations.forEach((clip) => {
    const loweredName = clip.name.toLowerCase();
    const mappedName = ANIM_MAP[loweredName] || loweredName;
    const action = mixer.clipAction(clip, model);
    actions[loweredName] = action;
    if (mappedName !== loweredName) {
        actions[mappedName] = action; // доступ по обоим именам
    }
});
```

## 5. Bone Tracking (Attachment Weapon)

Как привязать оружие к кости скелета (каждый кадр):

```typescript
// В createSkeletonInstance:
const handBone = findHandBone(model);
const falchion = falchionTemplate.clone(true);
falchion.visible = true;
model.add(falchion);

(model as any)._falchion = falchion;
(model as any)._handBone = handBone;

// В animation loop (interpolateMobPositions):
model.updateWorldMatrix(true, false);
handBone.updateWorldMatrix(true, false);

const boneWorldPos = new THREE.Vector3();
const boneWorldQuat = new THREE.Quaternion();
handBone.matrixWorld.decompose(boneWorldPos, boneWorldQuat, boneWorldScale);

// Конвертация мировых координат в локальные для модели:
const modelWorldMatrixInv = new THREE.Matrix4().copy(model.matrixWorld).invert();
const localPos = boneWorldPos.clone().applyMatrix4(modelWorldMatrixInv);
const localQuat = modelWorldQuat.clone().invert().multiply(boneWorldQuat);

// Применение калибровочного оффсета:
localQuat.multiply(offsetQuat);

// Position offset в bone-local space:
localPos.add(posOffset.clone().applyQuaternion(boneToModelQuat));

falchion.position.copy(localPos);
falchion.quaternion.copy(localQuat);
```

## 6. Materials

### Toon-shading (как в OGM-MMO)

```typescript
const gradientMap = createGradientMap(); // CanvasTexture с 3-5 ступенями

const material = new THREE.MeshToonMaterial({
    color: orig.color,
    gradientMap: gradientMap,
    map: null,
});

// Всегда сохраняй оригинальные свойства:
material.transparent = orig.transparent ?? false;
material.alphaTest = orig.alphaTest ?? 0;
material.side = orig.side ?? THREE.FrontSide;
material.vertexColors = orig.vertexColors ?? false;
material.emissive = orig.emissive ? orig.emissive.clone() : new THREE.Color(0x222222);
material.emissiveIntensity = orig.emissiveIntensity ?? 0.15;
```

## 7. Система проектайлов

Паттерн для создания летящих объектов (как кость скелета):

```typescript
interface Projectile {
    mesh: THREE.Mesh;
    startPos: THREE.Vector3;
    endPos: THREE.Vector3;
    startTime: number;
    duration: number;
}

const activeProjectiles: Projectile[] = [];

// Спавн:
const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.3);
const material = new THREE.MeshToonMaterial({ color: 0xcccccc });
const mesh = new THREE.Mesh(geometry, material);
mesh.position.set(startX, 1.5, startZ);
const angle = Math.atan2(endZ - startZ, endX - startX);
mesh.rotation.set(0, 0, angle);
scene.add(mesh);

// Анимация (каждый кадр):
const elapsed = now - p.startTime;
const t = Math.min(elapsed / p.duration, 1.0);
p.mesh.position.lerpVectors(p.startPos, p.endPos, t);
p.mesh.position.y += Math.sin(t * Math.PI) * 0.5; // дуга
p.mesh.rotation.x += 0.1; // кувырок

// Удаление:
scene.remove(p.mesh);
p.mesh.geometry.dispose();
(p.mesh.material as THREE.Material).dispose();
```

## 8. Invisible Hitbox для Raycast

Когда у модели тонкие меши (кости скелета), стандартный raycaster не работает:

```typescript
const hitboxGeom = new THREE.CylinderGeometry(0.5, 0.5, 1.8, 8);
const hitboxMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide
});
const hitbox = new THREE.Mesh(hitboxGeom, hitboxMat);
hitbox.position.set(0, 0.9, 0);
hitbox.userData.isHitbox = true;
model.add(hitbox);
```

**ВАЖНО:** Mesh с opacity 0 НЕ является невидимым для raycaster (в отличие от object.visible = false).

## 9. Производительность

### Memory Leak Prevention (CRITICAL)

**НЕ добавляй event listeners в loop()!**

```typescript
// ❌ НЕПРАВИЛЬНО — каждый кадр добавляется listener:
function loop() {
    renderer.domElement.addEventListener('click', handler); // ~36k listeners за 5 минут!
}

// ✓ ПРАВИЛЬНО — один раз при инициализации:
(function initOnce() {
    renderer.domElement.addEventListener('click', handler);
})();
```

### Dispose ресурсов

При удалении объектов из сцены:
```typescript
scene.remove(mesh);
mesh.geometry.dispose();
if (Array.isArray(mesh.material)) {
    mesh.material.forEach(m => m.dispose());
} else {
    mesh.material.dispose();
}
```

### Pixel Ratio Cap
```typescript
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// Без этого 4K/5K экраны убьют FPS
```

## 10. Освещение

Минимальный набор для игры:
```typescript
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1);
sunLight.position.set(5, 10, 7);
scene.add(sunLight);

// Для теней:
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
sunLight.castShadow = true;
mesh.castShadow = true;
mesh.receiveShadow = true;
```

## 11. Утилиты

### Interpolation (lerp) для плавного движения:
```typescript
// Позиция:
model.position.x += (targetX - model.position.x) * Math.min(1, speed * deltaTime);

// Вращение (угол с учётом перехода через 2PI):
let diff = targetAngle - currentAngle;
while (diff > Math.PI) diff -= 2 * Math.PI;
while (diff < -Math.PI) diff += 2 * Math.PI;
model.rotation.y += diff * Math.min(1, lerpSpeed * deltaTime);
```

### Terrain height (heightmap):
```typescript
const y = getTerrainHeightAtFast(x, z); // интерполяция по карте высот
model.position.set(x, y + 0.1, z); // +0.1 чтобы не провалиться в землю
```

## 12. Анти-паттерны (из SKILL.md)

| ❌ Проблема | ✅ Решение |
|-------------|-----------|
| Создание новых геометрий в loop() | Создай один раз, трансформируй |
| Слишком много сегментов | SphereGeometry(1, 32, 16) достаточно |
| Нет pixelRatio cap | Math.min(devicePixelRatio, 2) |
| Всё в одной функции | Раздели: createScene, createLights, createMeshes |
| Hardcoded значения | Константы в CONFIG = {} |
| requestAnimationFrame вместо setAnimationLoop | Используй renderer.setAnimationLoop() |
| Забыл scene.add(object) | Объект не появится, молча |

## 13. Полезные сниппеты

### Raycaster для кликов:
```typescript
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
raycaster.setFromCamera(mouse, camera);
const intersects = raycaster.intersectObjects(targets);
```

### CSS2DRenderer для UI-меток (name tags):
```typescript
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.pointerEvents = 'none';
document.body.appendChild(labelRenderer.domElement);

const label = new CSS2DObject(divElement);
model.add(label); // привязано к 3D-объекту

// Рендер:
labelRenderer.render(scene, camera);
```

### Outline (выделение объектов):
```typescript
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const outlinePass = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), scene, camera);
composer.addPass(outlinePass);

// Какие объекты подсвечивать:
outlinePass.selectedObjects = [mesh1, mesh2];

// В loop:
composer.render();
```
