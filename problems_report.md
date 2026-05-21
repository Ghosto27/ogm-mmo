# Architectural Review Report for OGM-MMO

Based on the provided Technical Design Document (tdd.md), the current codebase structure, and best practices from Three.js development and MMORPG server design, this report outlines key findings, potential issues, and recommendations across four major areas: Architecture/Performance, Client (Three.js/WebGL), Server (Colyseus/Backend), and Game Mechanics/Logic.

## 1. Overall Architecture & WebGL Performance (TDD vs Best Practices)

The architecture is soundly divided into client-side rendering/input and server-side authoritative state management, which aligns with modern MMORPG design principles.

### Fixed: Memory Leaks (Two Rounds)

**Round 1 — Per-frame GC pressure:** rendering loop had severe per-frame allocations. Fixed across 7 modules:

| File | Fix |
|---|---|
| `mobPlayer.ts` | ~12 new/clone per skeleton/frame → 8 module temps |
| `collision.ts` | ~50 new/clone + spread array per movement frame → 12 temps + pools |
| `input.ts` | 4 new Vector3/frame → 3 temps |
| `main.ts` | map objects (~35/frame), dynamic entities, selectedObjects, debug array — all pooled |
| `cameraControls.ts` | new Vector3 + 2 clone → 3 temps |
| `animationUtils.ts` | `Object.keys(mixers)` → `for...in` |
| `TerrainRenderer.ts` | `new Vector3` → `_rayOrigin.set()` |

**Round 2 — Progressive heap leak (AnimationStateMachine):** each `transitionTo()` → `_initSmoothLoop()` cloned the clip, but Three.js `clipAction()` looks up by UUID, not name. Each clone had a new UUID → a **new AnimationAction** accumulated in the mixer every time. After ~100 transitions/mob × 15 mobs, heap grew **300MB/30s**, hitting 4GB limit in ~7 minutes. Fixed with `_smoothClips` cache — one `{clip, action}` per state per FSM lifetime.

All details in `memory-leak-audit.md`.

### Fixed: Mob HP Bar Distance Culling

Mob HP bars (`THREE.Sprite`) now only render within 30 units of the local player (`mobPlayer.ts`).

### Fixed: Animation-Blocking for Actions

- Item usage (right-click potion): blocked during one-shot animation via `isPlayingOneShot` check (`inventoryUI.ts`)
- Attacks: blocked during one-shot animation in both cursor mode (`tryAttack()`) and action mode (`interaction.ts`)

### Fixed: Loot Bag Schema Race

`network.ts` and `LootRenderer.ts` now guard against undefined `bag.items` from Colyseus MapSchema during sync.

### Remaining Client Issues

*   **Frustum Culling & LOD:** Name tags, HP bars, and complex meshes still render for all entities regardless of camera visibility. Implement proximity radius or frustum checks.
*   **Name Tags:** `client/src/nameTags.ts` via CSS2DRenderer — ensure text updates don't trigger DOM recalculations.
*   **Animation Completion:** `animationUtils.ts` uses manual time checks (`elapsed >= duration`) instead of `AnimationMixer` event listeners — brittle for variable-length animations.

*   **Network Synchronization Overhead:** The current system relies on sending `move` messages frequently (`client/src/main.ts`, lines 153-160). While necessary, continuous updates for all players can saturate bandwidth and server resources.
    **Recommendation:** Implement **Dead Reckoning with Interpolation**. Instead of constantly sending absolute positions, the client should predict movement based on velocity vectors received from the server. The server should only send corrections or state changes (e.g., "Player X changed direction," "Player Y hit obstacle").

## 2. Client Implementation Review (Three.js/WebGL)

The implementation shows a strong grasp of Three.js fundamentals, especially regarding coordinate systems and animation.

*   **Coordinate System Handling:** The `input.ts` file correctly implements camera-relative movement (`getCameraRelativeMovement`), which is critical for a good game feel and adheres to the principles outlined in `skills/threejs-builder/SKILL.md`.
*   **Animation State Machine (FSM):** The use of `AnimationStateMachine` is excellent practice, ensuring controlled transitions between states like 'idle', 'walk', and 'attack'.
    *   **Known Issue:** `requestConsume()`, `requestChestOpen()`, `requestLand()` use `force=true`, which ignores `isPlayingOneShot` guard. Consider switching to `force=false` for consistency.
*   **Rendering Passes:** The separation of rendering concerns (WorldRenderer, NPCRenderer, etc.) and the use of `CSS2DRenderer` for UI elements is clean.

## 3. Server Implementation Review (Colyseus/Backend)

The server logic is robust and handles core MMORPG features like persistence, combat, and state synchronization well.

*   **Concurrency & Data Consistency:**
    *   **Combat Logic:** The damage calculation (`Math.max(1, Math.floor(attacker.stats.attackPower - target.stats.defense * 0.3))`) is simple but functional. However, the server must be absolutely authoritative on all combat outcomes to prevent client-side cheating (e.g., bypassing range checks). The current implementation correctly handles this by performing damage calculation and state changes on the server (`MyRoom.ts`, lines 280-281`).
    *   **State Management:** Using `MapSchema` for players, mobs, etc., is appropriate for Colyseus's synchronization model.
    *   **Persistence (Critical):** The `PlayerPersistence.savePlayer` function saves the entire state (`player.inventory`, `player.equipment`, `player.questProgress`). This is comprehensive but potentially slow if the data structure grows very large. **Recommendation:** Consider asynchronous saving or batching save operations, especially for non-critical data like chat history or temporary location markers.

*   **Scalability Bottlenecks (Mob Spawning):**
    *   The `setInterval` loop in `MyRoom.ts` runs every 250ms and iterates over *all* mobs (`this.state.mobs.forEach`). As the number of entities increases, this single synchronous loop will become a major performance bottleneck on the server CPU.
    **Recommendation:** Implement **Spatial Partitioning (e.g., Quadtree or Grid System)** for entity management. Instead of iterating over all mobs, only iterate over mobs within the bounding box of active players or in designated "active zones."

## 4. Game Mechanics & Logic Gaps

*   **Combat Flow:** The combat sequence is solid: Client sends `attack` → Server validates range/target → Server calculates damage and updates state → Server broadcasts animation event (`mobAttackAnim`). This flow is correct for an authoritative server model.
*   **Inventory/Equipment:** The separation of concerns between `Inventory`, `ItemSlot`, and `EquipmentSystem` is excellent. The logic for equipping items and recalculating stats upon change is correctly placed in the server's message handlers, ensuring data integrity.
*   **Dialogue System:** The dynamic dialogue system (`interactNpc`/`dialogueChoice`) handles quest progression well by linking actions to state changes (e.g., `giveQuest`, `completeQuest`).

## Summary of Key Action Items (Prioritized)

### Fixed (May 2026)
1. **Per-frame GC pressure** — eliminated all allocations/frame across 7 modules
2. **AnimationStateMachine heap leak** — `clip.clone()` UUID mismatch → `_smoothClips` cache
3. **HP bar distance culling** — mob HP bars hidden beyond 30 units
4. **Animation-blocking** — attacks and item usage blocked during one-shot animations
5. **Loot bag crash** — guarded against undefined `bag.items` during Colyseus sync
6. **Camera mode switching** — smooth transition fixes (pitch offset, jerky entry)
7. **Second round GC fixes** — map pools, collider pools, `Object.keys`, `{normal,pushTo}` literals, terrain Vector3

### Remaining
1. **Server Performance (Critical):** Replace global mob iteration in `MyRoom.ts` with spatial partitioning (Quadtree).
2. **Client Performance (High):** Implement Frustum Culling and proximity checks for name tags, HP bars, and entity updates.
3. **Reconnect cleanup (Medium):** `network.ts:onLeave` doesn't clear mobs/world meshes/vegetation — duplicates on reconnect.
4. **Animation Reliability (Medium):** Refactor one-shot completion in `animationUtils.ts` to use `AnimationMixer` callbacks instead of time comparisons.
5. **Animation Consistency (Low):** Change `requestConsume()`/`requestChestOpen()`/`requestLand()` to use `force=false` for consistent one-shot blocking.