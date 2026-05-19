import * as THREE from 'three';

export class AnimationStateMachine {
    public currentStateName: string | null = null;
    public isDead = false;
    public isDying = false;
    public isPlayingOneShot = false;
    private stateBeforeOneShot: string = 'idle';

    private mixer: THREE.AnimationMixer;
    private actions: Record<string, THREE.AnimationAction>;

    // Smooth loop: for each looping action, we keep a "clone" action that plays in parallel.
    // When the primary action is near its end, we cross-fade to the clone (started at time 0).
    // Then swap roles.
    private _loopClones: Map<string, { primary: THREE.AnimationAction; secondary: THREE.AnimationAction; fading: boolean }> = new Map();

    constructor(mixer: THREE.AnimationMixer, playerActions: Record<string, THREE.AnimationAction>, public id: string = 'unknown') {
        this.mixer = mixer;
        this.actions = playerActions;
    }

    // ---------- Smooth loop: call once per frame AFTER mixer.update() ----------
    // Cross-fades between two instances of the same clip at the loop boundary
    // to avoid the visible seam from LoopRepeat's hard time wrap.
    public updateLoops(): void {
        if (!this.currentStateName || this.isPlayingOneShot || this.isDying || this.isDead) return;

        const entry = this._loopClones.get(this.currentStateName);
        if (!entry) return;

        const { primary, secondary } = entry;
        const clip = primary.getClip();
        const duration = clip.duration;

        // Check if primary is in its last 15% of duration
        const time = primary.time;
        const nearEnd = time > duration * 0.85;
        const pastEnd = time >= duration;

        if (nearEnd && !entry.fading) {
            // Start cross-fade: secondary fades in (from time 0), primary fades out
            entry.fading = true;
            secondary.reset();
            secondary.setLoop(THREE.LoopRepeat, Infinity);
            secondary.clampWhenFinished = false;
            secondary.weight = 0;
            secondary.play();
            primary.crossFadeTo(secondary, 0.15, false);
        } else if (pastEnd && entry.fading) {
            // Cross-fade should be complete. Swap primary/secondary roles.
            // The old primary is now at weight 0 (or stopped), secondary is at weight 1.
            // Reset primary for next cycle.
            primary.reset();
            primary.setLoop(THREE.LoopRepeat, Infinity);
            primary.clampWhenFinished = false;
            primary.weight = 0;
            primary.stop();

            // Swap: old secondary becomes new primary
            this._loopClones.set(this.currentStateName, {
                primary: secondary,
                secondary: primary,
                fading: false,
            });
        }
    }

    // ---------- Разрешённые циклические переходы ----------
    transitionTo(stateName: string, fadeDuration = 0.2): void {
        if (this.isDead || this.isDying) return;
        if (this.isPlayingOneShot) return;
        if (this.currentStateName === stateName) return;

        const action = this.actions[stateName];
        if (!action || action.loop !== THREE.LoopRepeat) return;

        const currentAction = this.currentStateName ? this.actions[this.currentStateName] : null;

        // Log transitions for the local player (to detect oscillation between walk states)
        if (this.id === 'local') {
            //console.log(`[FSM:local] transitionTo '${this.currentStateName}' → '${stateName}', currentActionTime=${currentAction?.time?.toFixed(3) ?? 'N/A'}`);
        }

        action.reset();
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;

        // Create a clone action for smooth loop cross-fade at the loop boundary
        this._initSmoothLoop(stateName, action);

        if (currentAction && currentAction.isRunning() && currentAction !== action) {
            action.weight = 1;
            action.play();
            currentAction.crossFadeTo(action, fadeDuration, false);
        } else {
            action.play();
        }

        this.currentStateName = stateName;
    }

    // Create a secondary (clone) action for smooth looping
    private _initSmoothLoop(stateName: string, primary: THREE.AnimationAction): void {
        // Clean up old loop entry if any
        const oldEntry = this._loopClones.get(stateName);
        if (oldEntry) {
            oldEntry.secondary.stop();
            oldEntry.secondary.weight = 0;
        }

        // Clone the clip with a unique name so mixer.clipAction creates a new action
        const clip = primary.getClip();
        const clone = clip.clone();
        clone.name = clip.name + '__smooth';
        const secondary = this.mixer.clipAction(clone, undefined);
        secondary.setLoop(THREE.LoopRepeat, Infinity);
        secondary.clampWhenFinished = false;
        secondary.weight = 0;
        secondary.stop();

        this._loopClones.set(stateName, { primary, secondary, fading: false });
    }

    // ---------- Хелпер для one-shot действий (убирает дублирование guard-логики) ----------
    private _requestOneShot(actionName: string, timeScale: number = 1.0, force: boolean = false): boolean {
        if (this.isDead || this.isDying) {
            console.warn(`[FSM:${this.id}] _requestOneShot('${actionName}') blocked: dead/dying`);
            return false;
        }
        if (!force && this.isPlayingOneShot) {
            console.warn(`[FSM:${this.id}] _requestOneShot('${actionName}') blocked: isPlayingOneShot=true`);
            return false;
        }
        if (force) {
            this.isPlayingOneShot = false;
        }
        const ok = this.playOneShot(actionName, timeScale);
        if (!ok) {
            console.warn(`[FSM:${this.id}] _requestOneShot('${actionName}') failed: action not found`);
        }
        return true;
    }

    // ---------- Атака (обычная) ----------
    requestAttack(): void { this._requestOneShot('sword_attack', 1.0); }

    // ---------- Атака (тяжёлая, заряженная) ----------
    requestHeavyAttack(): void { this._requestOneShot('sword_attack', 0.65); }

    // ---------- Реакция на урон ----------
    requestHitReaction(): void { this._requestOneShot('recievehit'); }

    // ---------- Подбор лута / открытие сундука (force — проигрывается даже если идёт другая one-shot) ----------
    requestChestOpen(): void { this._requestOneShot('chest_open', 1.0, true); }

    // ---------- Использование предмета (зелье/еда) (force) ----------
    requestConsume(): void { this._requestOneShot('consume', 1.0, true); }

    // ---------- Приземление после падения (force) ----------
    requestLand(): void { this._requestOneShot('land', 1.0, true); }

    // ---------- Смерть (случайный выбор анимации) ----------
    playDeath(onFinished?: () => void): void {
        if (this.isDead || this.isDying) return;
        this.isDying = true;

        // Stop any currently playing one-shot (LoopOnce) action immediately,
        // so it doesn't blend with the death animation.
        this.isPlayingOneShot = false;

        // FULLY STOP all looping actions — they must NOT contribute to the blended pose.
        // Using weight=0 is not enough because the mixer still evaluates them.
        Object.values(this.actions).forEach(a => {
            if (a && a.loop === THREE.LoopRepeat && a.isRunning()) a.stop();
        });
        // Also stop all smooth loop clones
        this._loopClones.forEach(entry => {
            entry.primary.stop();
            entry.secondary.stop();
        });

        // Random death: pick between 'death' and 'death_02'
        const deathKeys = ['death', 'death_02'];
        const deathKey = deathKeys[Math.floor(Math.random() * deathKeys.length)];
        const action = this.actions[deathKey] || this.actions['death'];
        if (!action) return;

        action.reset();
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
        this.currentStateName = 'death';

        const onFinishedLocal = () => {
            this.mixer.removeEventListener('finished', onFinishedLocal);
            this.isDead = true;
            onFinished?.();
        };
        this.mixer.addEventListener('finished', onFinishedLocal);
    }

    // ---------- Переход в анимацию падения (лоопер) ----------
    transitionToFallLoop(): void {
        if (this.isDead || this.isDying) return;
        if (this.isPlayingOneShot) return;
        this.transitionTo('fall_loop');
    }

    // ---------- Возрождение ----------
    revive(): void {
        this.isDead = false;
        this.isDying = false;
        this.isPlayingOneShot = false;
        Object.values(this.actions).forEach(a => { a.enabled = true; a.stop(); });
        this._returnToIdle();   // Прямой вызов без проверок
    }

    // ---------- Публичный запуск одноразовой анимации ----------
    public playOneShot(actionName: string, timeScale: number = 1.0): boolean {
        const action = this.actions[actionName];
        if (!action) return false;

        this.isPlayingOneShot = true;
        this.stateBeforeOneShot = this.currentStateName || 'idle';

        // Zero out weight of all looping actions so they don't blend with the one-shot.
        // 'paused' alone is not enough — paused actions still have weight=1 and affect the pose.
        Object.values(this.actions).forEach(a => {
            if (a && a.loop === THREE.LoopRepeat && a.isRunning()) {
                a.weight = 0;
                a.paused = true;
            }
        });
        // Also pause smooth loop clones
        this._loopClones.forEach(entry => {
            if (entry.primary.isRunning()) {
                entry.primary.weight = 0;
                entry.primary.paused = true;
            }
            if (entry.secondary.isRunning()) {
                entry.secondary.weight = 0;
                entry.secondary.paused = true;
            }
        });

        action.reset();
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.timeScale = timeScale;
        action.play();
        this.currentStateName = actionName;

        const onFinished = () => {
            this.mixer.removeEventListener('finished', onFinished);
            action.stop();
            action.timeScale = 1.0;

            // If another one-shot has taken over (e.g. consume forced during attack),
            // clean up this old action without interfering
            if (this.currentStateName !== actionName) {
                return;
            }

            if (this.isDying || this.isDead) {
                this.isPlayingOneShot = false;
                return;
            }

            // Restore weight and resume looping animations, then return to idle
            Object.values(this.actions).forEach(a => {
                if (a && a.loop === THREE.LoopRepeat) {
                    a.weight = 1;
                    a.paused = false;
                }
            });
            // Restore smooth loop clones
            this._loopClones.forEach(entry => {
                entry.primary.weight = 1;
                entry.primary.paused = false;
                entry.secondary.weight = 0;
                entry.secondary.paused = false;
            });
            this.isPlayingOneShot = false;
            this._returnToIdle();
        };
        this.mixer.addEventListener('finished', onFinished);
        return true;
    }

    private _returnToIdle(): void {
        const idleAction = this.actions['idle'];
        if (!idleAction) return;

        // Stop the previous looping action that was resumed from pause
        const prevAction = this.stateBeforeOneShot ? this.actions[this.stateBeforeOneShot] : null;
        if (prevAction && prevAction !== idleAction && prevAction.isRunning()) {
            prevAction.stop();
        }

        idleAction.reset();
        idleAction.setLoop(THREE.LoopRepeat, Infinity);
        idleAction.play();
        this.currentStateName = 'idle';
    }

    /** Установить скорость воспроизведения (по умолчанию 1.0) */
    public setTimeScale(scale: number) {
        this.mixer.timeScale = scale;
    }
}
