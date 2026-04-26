import * as THREE from 'three';

export class AnimationStateMachine {
    public currentStateName: string | null = null;
    private mixer: THREE.AnimationMixer;
    private actions: Record<string, THREE.AnimationAction>;

    constructor(mixer: THREE.AnimationMixer, playerActions: Record<string, THREE.AnimationAction>, private id: string = 'unknown') {
        this.mixer = mixer;
        this.actions = playerActions;
    }

    transitionTo(stateName: string, fadeDuration = 0.2): void {
        //console.log(`[FSM ${this.id}] transitionTo("${stateName}") called, current="${this.currentStateName}"`);
        //console.trace(); // покажет, кто вызвал

        if (this.currentStateName === stateName) {
            //console.log(`[FSM ${this.id}] already in "${stateName}", skip`);
            return;
        }

        const targetAction = this.actions[stateName];
        if (!targetAction) {
            console.warn(`[FSM ${this.id}] action "${stateName}" not found`);
            return;
        }

        const currentAction = this.currentStateName ? this.actions[this.currentStateName] : null;
        console.log(`[FSM ${this.id}] currentAction=${!!currentAction}, isRunning=${currentAction?.isRunning()}`);

        targetAction.reset();
        targetAction.setLoop(THREE.LoopRepeat, Infinity);
        targetAction.clampWhenFinished = false;

        if (currentAction && currentAction.isRunning() && currentAction !== targetAction) {
            targetAction.weight = 1;
            targetAction.play();
            currentAction.crossFadeTo(targetAction, fadeDuration, false);
            console.log(`[FSM ${this.id}] crossFadeTo`);
        } else {
            targetAction.play();
            console.log(`[FSM ${this.id}] direct play`);
        }

        this.currentStateName = stateName;
        console.log(`[FSM ${this.id}] state set to "${stateName}"`);
    }

    playOneShot(stateName: string, fadeDuration = 0.1, onFinished?: () => void): void {
        console.log(`[FSM ${this.id}] playOneShot("${stateName}") called, current="${this.currentStateName}"`);

        const action = this.actions[stateName];
        if (!action) {
            console.warn(`[FSM ${this.id}] action "${stateName}" not found`);
            return;
        }
        if (stateName !== 'death' && action.isRunning() && action.loop === THREE.LoopOnce) {
            console.log(`[FSM ${this.id}] "${stateName}" already playing once, skip`);
            return;
        }

        const prevState = this.currentStateName;
        this.currentStateName = null;

        if (stateName === 'death') {
            // Приостанавливаем циклические анимации, чтобы сохранить позу перед падением
            Object.values(this.actions).forEach(a => {
                if (a && a.isRunning() && a.loop === THREE.LoopRepeat) {
                    a.paused = true;
                }
            });
        } else {
            // Для других one-shot полностью останавливаем циклические
            Object.values(this.actions).forEach(a => {
                if (a && a.isRunning() && a.loop === THREE.LoopRepeat) {
                    a.stop();
                }
            });
        }

        action.reset();
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
        console.log(`[FSM ${this.id}] playing "${stateName}", clampWhenFinished=true`);

        const onFinishedLocal = () => {
            console.log(`[FSM ${this.id}] finished "${stateName}"`);
            this.mixer.removeEventListener('finished', onFinishedLocal);

            if (stateName === 'death') {
                action.stop(); // фиксируем последний кадр
                onFinished?.();
            } else {
                console.log(`[FSM ${this.id}] returning to prevState "${prevState}" or idle`);
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
}