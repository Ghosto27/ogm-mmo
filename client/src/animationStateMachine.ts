import * as THREE from 'three';

export class AnimationStateMachine {
    public currentStateName: string | null = null;
    public isDead = false;
    public isDying = false;
    public isPlayingOneShot = false;

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
        this._playOneShot('sword_attack', 1.0);
    }

    // ---------- Атака (тяжёлая, заряженная) ----------
    requestHeavyAttack(): void {
        if (this.isDead || this.isDying) return;
        if (this.isPlayingOneShot) return;
        // Slower animation speed = heavier feel
        this._playOneShot('sword_attack', 0.65);
    }

    // ---------- Реакция на урон ----------
    requestHitReaction(): void {
        if (this.isDead || this.isDying) return;
        if (this.isPlayingOneShot) return;
        this._playOneShot('recievehit');
    }

    // ---------- Смерть ----------
    playDeath(onFinished?: () => void): void {
        const action = this.actions['death'];
        if (!action) return;
        this.isDying = true;

        Object.values(this.actions).forEach(a => { if (a && a.loop === THREE.LoopRepeat) a.paused = true; });
        action.reset();
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();

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

    // ---------- Приватный запуск одноразовой анимации ----------
    private _playOneShot(actionName: string, timeScale: number = 1.0): void {
        const action = this.actions[actionName];
        if (!action) return;

        this.isPlayingOneShot = true;

        // Пауза циклических анимаций (сохраняем позу)
        Object.values(this.actions).forEach(a => {
            if (a && a.loop === THREE.LoopRepeat && a.isRunning()) a.paused = true;
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
            // Снимаем с паузы циклические
            Object.values(this.actions).forEach(a => {
                if (a && a.loop === THREE.LoopRepeat) a.paused = false;
            });
            this.isPlayingOneShot = false;
            this._returnToIdle();
        };
        this.mixer.addEventListener('finished', onFinished);
    }

    private _returnToIdle(): void {
        const idleAction = this.actions['idle'];
        if (idleAction) {
            idleAction.reset();
            idleAction.setLoop(THREE.LoopRepeat, Infinity);
            idleAction.play();
            this.currentStateName = 'idle';
        }
    }

    /** Установить скорость воспроизведения (по умолчанию 1.0) */
    public setTimeScale(scale: number) {
        this.mixer.timeScale = scale;
    }
}