import * as THREE from 'three';

export class AnimationStateMachine {
    public currentStateName: string | null = null;
    public isDead = false;
    public isDying = false;
    private mixer: THREE.AnimationMixer;
    private actions: Record<string, THREE.AnimationAction>;
    public isPlayingOneShot = false;

    constructor(mixer: THREE.AnimationMixer, playerActions: Record<string, THREE.AnimationAction>, public id: string = 'unknown') {
        this.mixer = mixer;
        this.actions = playerActions;
    }

    // ---------- переход в циклическое состояние ----------
    transitionTo(stateName: string, fadeDuration = 0.2, autoReturn = true): void {
        console.log(`[FSM ${this.id}] transitionTo("${stateName}") CALLED, isPlayingOneShot=${this.isPlayingOneShot}, current="${this.currentStateName}"`);
        if (this.isDead || this.isDying) return;
        if (this.currentStateName === stateName) return;

        const targetAction = this.actions[stateName];
        if (!targetAction) {
            console.warn(`[FSM ${this.id}] action "${stateName}" not found`);
            return;
        }

        // ----- Циклическая анимация (idle / walk / run) -----
        if (targetAction.loop === THREE.LoopRepeat && stateName !== 'death') {
            if (this.isPlayingOneShot) return;   // не прерываем одноразовую

            const currentAction = this.currentStateName ? this.actions[this.currentStateName] : null;

            targetAction.reset();
            targetAction.setLoop(THREE.LoopRepeat, Infinity);
            targetAction.clampWhenFinished = false;

            if (currentAction && currentAction.isRunning() && currentAction !== targetAction) {
                targetAction.weight = 1;
                targetAction.play();
                currentAction.crossFadeTo(targetAction, fadeDuration, false);
            } else {
                targetAction.play();
            }

            this.currentStateName = stateName;
            return;
        }

        // ----- Одноразовая анимация -----
        if (this.isPlayingOneShot) return;   // не даём запустить новую, пока не завершилась предыдущая

        this.isPlayingOneShot = true;

        // Приостанавливаем циклические анимации
        Object.values(this.actions).forEach(a => {
            if (a && a.isRunning() && a.loop === THREE.LoopRepeat) {
                a.paused = true;
            }
        });

        // Сбрасываем вес других одноразовых анимаций
        Object.values(this.actions).forEach(a => {
            if (a && a.loop === THREE.LoopOnce && a !== targetAction) {
                a.weight = 0;
                a.stop();
            }
        });

        targetAction.reset();
        targetAction.setLoop(THREE.LoopOnce, 1);
        targetAction.clampWhenFinished = true;
        targetAction.play();
        this.currentStateName = stateName;

        const onFinished = () => {
            console.log(`[FSM ${this.id}] one‑shot "${stateName}" finished event fired`);
            this.mixer.removeEventListener('finished', onFinished);
            targetAction.weight = 0;
            targetAction.stop();
            // Восстанавливаем циклические
            Object.values(this.actions).forEach(a => {
                if (a && a.loop === THREE.LoopRepeat) a.paused = false;
            });
            this.isPlayingOneShot = false;

            if (autoReturn && stateName !== 'death') {
                this.resetToIdle();
            }
        };
        this.mixer.addEventListener('finished', onFinished);
    }

    // ---------- смерть ----------
    playDeath(onFinished?: () => void) {
        const action = this.actions['death'];
        if (!action) return;
        this.isDying = true;
        Object.values(this.actions).forEach(a => {
            if (a && a.loop === THREE.LoopRepeat) a.paused = true;
        });
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

    // ---------- возрождение ----------
    revive() {
        this.isDead = false;
        this.isDying = false;
        Object.values(this.actions).forEach(a => {
            a.enabled = true;
            a.stop();
        });
        this.transitionTo('idle');
    }

    resetToIdle() {
        Object.values(this.actions).forEach(a => a?.stop());
        const idleAction = this.actions['idle'];
        if (idleAction) {
            idleAction.reset().play();
            this.currentStateName = 'idle';
        }
    }
}