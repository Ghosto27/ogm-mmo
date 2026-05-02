# Architectural Review Report for OGM-MMO

Based on the provided Technical Design Document (tdd.md), the current codebase structure, and best practices from Three.js development and MMORPG server design, this report outlines key findings, potential issues, and recommendations across four major areas: Architecture/Performance, Client (Three.js/WebGL), Server (Colyseus/Backend), and Game Mechanics/Logic.

## 1. Overall Architecture & WebGL Performance (TDD vs Best Practices)

The architecture is soundly divided into client-side rendering/input and server-side authoritative state management, which aligns with modern MMORPG design principles. However, several areas require optimization for scalability and performance:

*   **Client-Side Rendering Loop:** The current use of `renderer.setAnimationLoop` (as recommended by the skill) is correct. However, the rendering loop (`client/src/main.ts`) performs multiple expensive operations every frame:
    1.  Updating all player positions via interpolation (`animationUtils.ts`).
    2.  Rendering name tags and HP bars for *all* players/mobs (potentially hundreds).
    3.  Running the `OutlinePass` on potentially dozens of objects.
    4.  Calling `renderLabels()` (CSS2DRenderer) which is a separate rendering pass.
    **Recommendation:** Implement **Frustum Culling and LOD (Level of Detail)**. Only render/update name tags, HP bars, and complex meshes for entities visible to the camera or within a defined proximity radius.

*   **Network Synchronization Overhead:** The current system relies on sending `move` messages frequently (`client/src/main.ts`, lines 153-160). While necessary, continuous updates for all players can saturate bandwidth and server resources.
    **Recommendation:** Implement **Dead Reckoning with Interpolation**. Instead of constantly sending absolute positions, the client should predict movement based on velocity vectors received from the server. The server should only send corrections or state changes (e.g., "Player X changed direction," "Player Y hit obstacle").

## 2. Client Implementation Review (Three.js/WebGL)

The implementation shows a strong grasp of Three.js fundamentals, especially regarding coordinate systems and animation.

*   **Coordinate System Handling:** The `input.ts` file correctly implements camera-relative movement (`getCameraRelativeMovement`), which is critical for a good game feel and adheres to the principles outlined in `skills/threejs-builder/SKILL.md`.
*   **Animation State Machine (FSM):** The use of `AnimationStateMachine` is excellent practice, ensuring controlled transitions between states like 'idle', 'walk', and 'attack'.
    *   **Potential Bug:** In `client/src/animationUtils.ts`, the logic for checking if a one-shot animation has finished (`elapsed >= duration`) relies on manual state management (`fsmObj.isPlayingOneShot`). This is brittle. A better pattern would be to use an event listener or callback provided by the AnimationMixer when the clip finishes, rather than relying on time checks in the main loop.
*   **Rendering Passes:** The separation of rendering concerns (WorldRenderer, NPCRenderer, etc.) and the use of `CSS2DRenderer` for UI elements is clean.
    *   **Potential Inefficiency:** Name tags (`client/src/nameTags.ts`) are attached to 3D objects but rendered via a separate DOM renderer. Ensure that name tag updates (e.g., changing text) do not trigger expensive recalculations or re-attachments in the main loop.

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

*   **Combat Flow:** The combat sequence is solid: Client sends `attack` -> Server validates range/target -> Server calculates damage and updates state -> Server broadcasts animation event (`mobAttackAnim`). This flow is correct for an authoritative server model.
*   **Inventory/Equipment:** The separation of concerns between `Inventory`, `ItemSlot`, and `EquipmentSystem` is excellent. The logic for equipping items and recalculating stats upon change is correctly placed in the server's message handlers, ensuring data integrity.
*   **Dialogue System:** The dynamic dialogue system (`interactNpc`/`dialogueChoice`) handles quest progression well by linking actions to state changes (e.g., `giveQuest`, `completeQuest`).

## Summary of Key Action Items (Prioritized)

1.  **Server Performance (Critical):** Replace the global iteration over all mobs in `MyRoom.ts` with a spatial partitioning system (Quadtree).
2.  **Client Performance (High):** Implement Frustum Culling and proximity checks for rendering/updating non-local entities (name tags, HP bars) to reduce draw calls and CPU load.
3.  **Animation Reliability (Medium):** Refactor the one-shot animation completion check in `animationUtils.ts` to use AnimationMixer callbacks instead of time comparisons.