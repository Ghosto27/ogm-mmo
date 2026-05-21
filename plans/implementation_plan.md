# Implementation Plan: OGM-MMO Optimization & Refactoring

This plan details the necessary steps to address performance bottlenecks, improve scalability, and refine core mechanics identified during the architectural review. Each step is designed to be a self-contained task for future implementation cycles.

## Phase 1: Server Scalability (Critical)

**Goal:** Optimize entity management in `MyRoom.ts` to handle large numbers of entities without performance degradation.

*   [ ] **Implement Spatial Partitioning (Quadtree):**
    *   Create a new module/system (`server/src/systems/SpatialGrid.ts`) responsible for managing all dynamic entities (Players, Mobs).
    *   Modify `MyRoom.ts` to initialize and use the Quadtree instead of iterating over `this.state.mobs` or `this.state.players` globally in the game loop.
    *   Update the mob update logic (`setInterval` in `MyRoom.ts`) to query only for mobs within a relevant area (e.g., near active players).

## Phase 2: Client Performance & Rendering (High Priority)

**Goal:** Reduce rendering overhead by limiting updates and drawing calls to visible/relevant objects.

*   [ ] **Implement Frustum Culling:**
    *   In `client/src/scene.ts` or a dedicated renderer utility, calculate the camera's view frustum every frame.
    *   Modify renderers (`NPCRenderer.ts`, `WorldRenderer.ts`) to check if an entity's bounding box intersects the frustum before attempting to draw it.
*   [ ] **Implement Proximity/LOD System:**
    *   In `client/src/nameTags.ts` and related UI modules, calculate the distance between the camera and the target entity.
    *   Only render name tags/HP bars if the distance is below a defined threshold (e.g., 50 units). Implement Level of Detail logic: far away = simple tag; close = full HP bar + name tag.

## Phase 3: Network Optimization & Prediction (High Priority)

**Goal:** Improve network efficiency and responsiveness by reducing reliance on constant absolute position updates.

*   [ ] **Refactor Movement Synchronization (Dead Reckoning):**
    *   Modify the client's input handling (`client/src/input.ts` / `client/src/main.ts`) to send only directional inputs (WASD state) and timestamps, not absolute positions.
    *   Update the server message handler for `move` in `MyRoom.ts` to calculate predicted next positions based on velocity vectors received from the client, rather than just accepting raw coordinates.
    *   Implement a mechanism for the server to send periodic "correction" packets when the client's prediction deviates too far from the authoritative state.

## Phase 4: Core Mechanics Refinement (Medium Priority)

**Goal:** Improve robustness and reliability of complex systems.

*   [ ] **Refactor Animation State Machine Callbacks:**
    *   In `client/src/animationUtils.ts`, replace time-based checks for one-shot animation completion with event listeners or callbacks provided by the Three.js `AnimationMixer` when a clip finishes playing.
*   [ ] **Combat Range Validation (Server):**
    *   Review combat handlers in `MyRoom.ts`. While range is checked, consider adding a system to validate line-of-sight (LOS) between attacker and target using raycasting before calculating damage, preventing attacks through solid objects.

## Next Steps:
The next phase of work should focus on implementing the **Spatial Partitioning** system in `MyRoom.ts` as it is the most critical bottleneck for server scalability.