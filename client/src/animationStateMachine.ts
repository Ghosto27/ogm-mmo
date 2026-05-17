import * as THREE from 'three';

export class AnimationStateMachine {
    public currentStateName: string | null = null;
    public isDead = false;
    public isDying = false;
    public isPlayingOneShot = false;
    private stateBeforeOneShot: string = 'idle';

    private mixer: THREE.AnimationMixer;
    private actions: Record<string, THREE.AnimationAction>;

    constructor(mixer: THREE.AnimationMixer, playerActions: Record<string, THREE.AnimationAction>, public id: string = 'unknown') {
        this.mixer = mixer;
        this.actions = playerActions;
    }

    // ---------- Разрешённые циклические переходы ----------
    transitionTo(stateName: string, fadeDuration = 0.2): void {
        if (this.isDead || this.isDying) return;
        if (this.isPlayingOneShot) return;
        if (this.currentStateName === stateName) return;

        const action = this.actions[stateName];
        if (!action || action.loop !== THREE.LoopRepeat) return;

        const currentAction = this.currentStateName ? this.actions[this.currentStateName] : null;

        action.reset();
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;

        if (currentAction && currentAction.isRunning() && currentAction !== action) {
            action.weight = 1;
            action.play();
            currentAction.crossFadeTo(action, fadeDuration, false);
        } else {
            action.play();
        }

        this.currentStateName = stateName;
    }

    // ---------- Атака (обычная) ----------
    requestAttack(): void {
        if (this.isDead || this.isDying) return;
        if (this.isPlayingOneShot) return;
        this.playOneShot('sword_attack', 1.0);
    }

    // ---------- Атака (тяжёлая, заряженная) ----------
    requestHeavyAttack(): void {
        if (this.isDead || this.isDying) return;
        if (this.isPlayingOneShot) return;
        // Slower animation speed = heavier feel
        this.playOneShot('sword_attack', 0.65);
    }

    // ---------- Реакция на урон ----------
    requestHitReaction(): void {
        if (this.isDead || this.isDying) return;
        if (this.isPlayingOneShot) return;
        this.playOneShot('recievehit');
    }

    // ---------- Смерть ----------
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

        const action = this.actions['death'];
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

    // ---------- Возрождение ----------
    revive(): void {
        this.isDead = false;
        this.isDying = false;
        this.isPlayingOneShot = false;
        Object.values(this.actions).forEach(a => { a.enabled = true; a.stop(); });
        this._returnToIdle();   // Прямой вызов без проверок
    }

    // ---------- Публичный запуск одноразовой анимации ----------
    public playOneShot(actionName: string, timeScale: number = 1.0): void {
        const action = this.actions[actionName];
        if (!action) return;

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

        action.reset();
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.timeScale = timeScale;
        action.play();
        this.currentStateName = actionName;

        const onFinished = () => {
            this.mixer.removeEventListener('finished', onFinished);
            action.stop();
            action.timeScale = 1.0; // Reset timeScale

            if (this.isDying || this.isDead) {
                // Death is in progress; don't resume loopers or return to idle.
                // The death animation continues playing on its own.
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
            this.isPlayingOneShot = false;
            this._returnToIdle();
        };
        this.mixer.addEventListener('finished', onFinished);
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