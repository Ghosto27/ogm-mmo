import * as THREE from 'three';

export class AnimationStateMachine {
    public currentStateName: string | null = null;
    public isDead = false;
    public isDying = false; // новый флаг взамен disabled
    private mixer: THREE.AnimationMixer;
    private actions: Record<string, THREE.AnimationAction>;

    constructor(mixer: THREE.AnimationMixer, playerActions: Record<string, THREE.AnimationAction>, public id: string = 'unknown') {
        this.mixer = mixer;
        this.actions = playerActions;
    }

    transitionTo(stateName: string, fadeDuration = 0.2): void {
        if (this.isDead || this.isDying) {
            //console.log(`[FSM ${this.id}] Blocked – dead or dying`);
            return;
        }

        if (this.currentStateName === stateName) return;

        const targetAction = this.actions[stateName];
        if (!targetAction) {
            console.warn(`[FSM ${this.id}] action "${stateName}" not found`);
            return;
        }

        const currentAction = this.currentStateName ? this.actions[this.currentStateName] : null;
        //console.log(`[FSM ${this.id}] currentAction=${!!currentAction}, isRunning=${currentAction?.isRunning()}`);

        targetAction.reset();
        targetAction.setLoop(THREE.LoopRepeat, Infinity);
        targetAction.clampWhenFinished = false;

        if (currentAction && currentAction.isRunning() && currentAction !== targetAction) {
            targetAction.weight = 1;
            targetAction.play();
            currentAction.crossFadeTo(targetAction, fadeDuration, false);
            //console.log(`[FSM ${this.id}] crossFadeTo`);
        } else {
            targetAction.play();
            //console.log(`[FSM ${this.id}] direct play`);
        }

        this.currentStateName = stateName;
        //console.log(`[FSM ${this.id}] state set to "${stateName}"`);
    }

    playOneShot(stateName: string, fadeDuration = 0.1, onFinished?: () => void): void {
        const action = this.actions[stateName];
        if (!action) {
            console.warn(`[FSM ${this.id}] action "${stateName}" not found`);
            return;
        }

        // Если мы уже умираем, разрешаем только повторный вызов смерти
        if (this.isDying && stateName !== 'death') {
            console.log(`[FSM ${this.id}] Ignoring "${stateName}" – already dying`);
            return;
        }

        // Для смерти: входим в режим умирания и останавливаем ВСЕ старые анимации
        if (stateName === 'death') {
            this.isDying = true;
            // Останавливаем все активные анимации (кроме, возможно, самой смерти)
            Object.values(this.actions).forEach(a => {
                if (a && a !== action) {
                    a.stop(); // сбрасываем позу
                    a.enabled = false; // предотвращаем вызов колбэков
                }
            });
        } else {
            // Для других one-shot: если уже проигрывается, не прерываем
            if (action.isRunning() && action.loop === THREE.LoopOnce) {
                console.log(`[FSM ${this.id}] "${stateName}" already playing once, skip`);
                return;
            }
            // Останавливаем циклические анимации
            Object.values(this.actions).forEach(a => {
                if (a && a.isRunning() && a.loop === THREE.LoopRepeat) {
                    a.stop();
                }
            });
        }

        const prevState = this.currentStateName;
        this.currentStateName = null;

        action.reset();
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
        console.log(`[FSM ${this.id}] playing "${stateName}", clampWhenFinished=true`);

        const onFinishedLocal = () => {
            //console.log(`[FSM ${this.id}] finished "${stateName}"`);
            this.mixer.removeEventListener('finished', onFinishedLocal);

            if (stateName === 'death') {
                // Модель останется в последнем кадре, не вызываем transitionTo
                this.isDead = true;
                onFinished?.();
            } else {
                // Возвращаемся к предыдущему циклическому состоянию
                if (prevState) {
                    this.transitionTo(prevState, 0.3);
                } else {
                    this.transitionTo('idle', 0.3);
                }
                onFinished?.();
            }
        };
        this.mixer.addEventListener('finished', onFinishedLocal);
    }

    revive() {
        this.isDead = false;
        this.isDying = false;
        // Сбрасываем все действия, чтобы они снова стали доступны
        Object.values(this.actions).forEach(a => {
            a.enabled = true;
            a.stop(); // гарантированно возвращаем rest-позу
        });
        this.transitionTo('idle');
        console.log(`[FSM ${this.id}] Revived and in idle`);
    }
}