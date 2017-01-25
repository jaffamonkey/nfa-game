import React, { PropTypes } from 'react';
import { connect } from 'react-redux';
import { batchActions } from 'redux-batched-actions';
import storeShape from 'react-redux/src/utils/storeShape';

import {
    FPS, KEY_W, KEY_S, KEY_A, KEY_D, KEY_E, KEY_SHIFT, KEY_Q,
    XBOX_BUTTON_X, XBOX_BUTTON_BACK,
    XBOX_STICK_LEFT_AXIS_X, XBOX_STICK_LEFT_AXIS_Y, XBOX_STICK_RIGHT_AXIS_X, XBOX_STICK_RIGHT_AXIS_Y, XBOX_TRIGGER_RIGHT_AXIS,
    CONTROL_STATE,
    PLAYER_SPEED, RUNNING_COEFF, BROAD_CELL_SIZE,
    STICK_VALUE_THRESHOLD,
    HAND_LENGTH, DOOR_OPEN, DOOR_CLOSE, DOOR_OPENING, DOOR_CLOSING, DOOR_OPEN_TIME, SWITCHER_TYPE, HINT_SHOW_TIME,
    ENEMY_STATE, ENEMY_SPEED, ENEMY_SPEED_RUNNING, ENEMY_ATTACK_DISTANCE, ENEMY_ATTACK_DISTANCE_VISIBLE,
    ENEMY_VIEW_ANGLE_RAD, ENEMY_TARGET_REACH_THRESHOLD, ENEMY_CHANGE_TARGET_TIME, ENEMY_KILL_DISTANCE
} from '../constants/constants';

import {
    HINT_GOAL,
    HINT_MOVE_KEYBOARD,
    HINT_RUN_KEYBOARD,
    HINT_INTERACT_KEYBOAD,
    HINT_MOVE_GAMEPAD,
    HINT_RUN_GAMEPAD,
    HINT_INTERACT_GAMEPAD,
    HINT_FIRST_SWITCHER,
    HINT_DOOR
} from '../constants/hints';

import DelayedActions from '../lib/DelayedActions';
import { getVisibleObjects, getPointPosition, convertDegreeToRad, vectorsAdd3D } from '../lib/utils';

import Loop from '../lib/loop';
import level from '../level';
import Collision from '../lib/collision';
import * as actionCreators from '../actionCreators';

const EPSILON = 0.1;

class GameLoop extends React.Component {
    static propTypes = {
        onWin: PropTypes.func.isRequired,
        onLoose: PropTypes.func.isRequired,
        onExit: PropTypes.func.isRequired
    };
    static contextTypes = {
        store: storeShape.isRequired,
        controls: PropTypes.object.isRequired
    };

    constructor(...args) {
        super(...args);

        this.delayedActions = new DelayedActions();

        this.loop = new Loop(this.loopCallback.bind(this), FPS);

        this.shownHints = {};
    }

    componentDidMount() {
        const gamepadIndex = this.context.store.getState().gamepad.state;
        let gamepadSnapshot;
        if (gamepadIndex !== -1) {
            gamepadSnapshot = navigator.getGamepads()[gamepadIndex];
        }
        if (gamepadSnapshot) {
            this.delayedActions.pushAction({
                action: this.showHints([HINT_GOAL, HINT_MOVE_GAMEPAD], true),
                delay: 0
            });
            this.delayedActions.pushAction({
                action: this.showHints([HINT_RUN_GAMEPAD], true, HINT_SHOW_TIME),
                delay: HINT_SHOW_TIME
            });
        } else {
            this.delayedActions.pushAction({
                action: this.showHints([HINT_GOAL, HINT_MOVE_KEYBOARD], true),
                delay: 0
            });
            this.delayedActions.pushAction({
                action: this.showHints([HINT_RUN_KEYBOARD], true, HINT_SHOW_TIME),
                delay: HINT_SHOW_TIME
            });
        }
        this.loop.start();
    }

    componentWillUnmount() {
        this.loop.stop();
        this.delayedActions.clear();
        this.shownHints = {};
    }

    render() {
        return React.Children.only(this.props.children);
    }

    loopCallback(frameRateCoefficient) {
        const actions = this.delayedActions.getActualActions();

        const newState = {};
        const currentStore = this.context.store.getState();

        // check exit
        if (
            this.context.controls.keyPressed[KEY_Q][0] === CONTROL_STATE.FIRST_TIME_DOWN ||
            this.context.controls.gamepadButtons[XBOX_BUTTON_BACK][0] === CONTROL_STATE.FIRST_TIME_DOWN
        ) {
            this.props.onExit();
            return;
        }

        let gamepadSnapshot;
        if (currentStore.gamepad.state !== -1) {
            gamepadSnapshot = navigator.getGamepads()[currentStore.gamepad.state];
        }

        // get new view angle
        // try gamepad
        if (gamepadSnapshot) {
            const currentViewAngle = currentStore.viewAngle;
            const x = GameLoop.filterStickValue(gamepadSnapshot.axes[XBOX_STICK_RIGHT_AXIS_X]);
            const y = GameLoop.filterStickValue(gamepadSnapshot.axes[XBOX_STICK_RIGHT_AXIS_Y]);
            if (x || y) {
                const newViewAngle = [
                    (currentViewAngle[0] + x * currentStore.settings.stickSensitivity) % 360,
                    Math.min(Math.max(currentViewAngle[1] - y * currentStore.settings.stickSensitivity, -90), 90),
                    0
                ];
                actions.push(actionCreators.player.updateViewAngle(newViewAngle));
                newState.viewAngle = newViewAngle;
            }
        }

        // try mouse
        const pointerDelta = currentStore.pointerDelta;
        if (pointerDelta.x || pointerDelta.y) {
            const currentViewAngle = newState.viewAngle || currentStore.viewAngle;
            const newViewAngle = [
                (currentViewAngle[0] - pointerDelta.x * currentStore.settings.mouseSensitivity) % 360,
                Math.min(Math.max(
                    currentViewAngle[1] + pointerDelta.y * currentStore.settings.mouseSensitivity, -90
                ), 90),
                0
            ];
            actions.push(actionCreators.player.updateViewAngle(newViewAngle));
            actions.push(actionCreators.game.resetPointerDelta());
            newState.viewAngle = newViewAngle;
        }

        // get player position shift
        let angleShift = [];
        let step = 0;
        let isRunning = false;

        // try gamepad
        if (gamepadSnapshot) {
            const x = GameLoop.filterStickValue(gamepadSnapshot.axes[XBOX_STICK_LEFT_AXIS_X]);
            // convert -0 to 0 by adding 0
            const z = -GameLoop.filterStickValue(gamepadSnapshot.axes[XBOX_STICK_LEFT_AXIS_Y]) + 0;
            if (x || z) {
                if (gamepadSnapshot.axes[XBOX_TRIGGER_RIGHT_AXIS] >= 0.5) {
                    isRunning = true;
                }
                step = Math.sqrt(x ** 2 + z ** 2);
                if (z >= 0) {
                    angleShift.push(Math.atan(x / z));
                } else {
                    angleShift.push(Math.atan(x / z) + Math.PI);
                }
            }
        }

        const keyPressed = this.context.controls.keyPressed;
        if (keyPressed[KEY_W][0] !== CONTROL_STATE.UNUSED) {
            angleShift.push(0);
            step = Math.max(step, 1);
        }
        if (keyPressed[KEY_S][0] !== CONTROL_STATE.UNUSED) {
            angleShift.push(Math.PI);
            step = Math.max(step, 1);
        }
        if (keyPressed[KEY_D][0] !== CONTROL_STATE.UNUSED) {
            angleShift.push(Math.PI / 2);
            step = Math.max(step, 1);
        }
        if (keyPressed[KEY_A][0] !== CONTROL_STATE.UNUSED) {
            // hack for angles sum
            if (keyPressed[KEY_W][0] !== CONTROL_STATE.UNUSED) {
                angleShift.push(-Math.PI / 2);
            } else {
                angleShift.push(3 * Math.PI / 2);
            }
            step = Math.max(step, 1);
        }
        if (keyPressed[KEY_SHIFT][0] !== CONTROL_STATE.UNUSED) {
            isRunning = true;
        }

        // get new player state
        if (angleShift.length) {
            if (isRunning) {
                actions.push(actionCreators.player.run());
            } else {
                actions.push(actionCreators.player.walk());
            }
        } else {
            actions.push(actionCreators.player.stop());
        }

        // get new player position
        if (angleShift.length) {
            let angleShiftSum = 0;
            for (let i = 0; i < angleShift.length; i++) {
                angleShiftSum = angleShiftSum + angleShift[i];
            }
            angleShiftSum = angleShiftSum / angleShift.length;

            angleShiftSum = angleShiftSum + convertDegreeToRad(currentStore.viewAngle[0]);

            step = step * frameRateCoefficient * (isRunning ? RUNNING_COEFF : 1) * PLAYER_SPEED;
            const shift = GameLoop.getShift2d(angleShiftSum, step);
            const newPos = vectorsAdd3D(currentStore.pos, shift);
            const objects = currentStore.objects;
            const collisions = Collision.getCollisions([currentStore.pos, newPos], objects, BROAD_CELL_SIZE);
            // get last collision result as new player position
            const newPosAfterCollisions = collisions[collisions.length - 1].newPos;
            actions.push(actionCreators.player.updatePosition(newPosAfterCollisions));
            newState.pos = newPosAfterCollisions;
        }

        if (newState.pos) {
            // if out of bounds - win
            for (let i = 0; i < 3; i++) {
                if (level.boundaries[i]) {
                    if (newState.pos[i] < 0 || newState.pos[i] > level.boundaries[i]) {
                        this.props.onWin();
                        return;
                    }
                }
            }

            // render only visible objects
            const { addVisibleObjects, removeVisibleObjects } = getVisibleObjects(newState.pos, currentStore.objects);
            if (Object.keys(addVisibleObjects).length || Object.keys(removeVisibleObjects).length) {
                actions.push(actionCreators.objects.setVisible({ addVisibleObjects, removeVisibleObjects }));
            }
        }

        // find interactive object which we can reach with a hand
        let reachableObject;
        if (newState.pos || newState.viewAngle) {
            const playerPosition = newState.pos || currentStore.pos;
            const viewAngle = newState.viewAngle || currentStore.viewAngle;
            const collisionView = Collision.getCollisionView([
                playerPosition,
                getPointPosition({ pos: playerPosition, distance: HAND_LENGTH, angle: viewAngle })
            ], currentStore.objects, BROAD_CELL_SIZE);
            if (collisionView && collisionView.obj.isInteractive) {
                reachableObject = collisionView.obj;
                if (!reachableObject.isReachable) {
                    actions.push(actionCreators.objects.setReachable({ ...reachableObject }));
                    actions.push(this.showHints([
                        gamepadSnapshot ? HINT_INTERACT_GAMEPAD : HINT_INTERACT_KEYBOAD
                    ], false));
                    actions.push(this.showHints([HINT_FIRST_SWITCHER], true));
                }
            } else {
                actions.push(actionCreators.objects.setReachable(null));
            }
        } else {
            reachableObject = currentStore.objects.find(obj => obj.isReachable);
        }

        // perform interaction if key is pressed
        if (
            reachableObject &&
            (
                keyPressed[KEY_E][0] === CONTROL_STATE.FIRST_TIME_DOWN ||
                this.context.controls.gamepadButtons[XBOX_BUTTON_X][0] === CONTROL_STATE.FIRST_TIME_DOWN
            )
        ) {
            if (reachableObject.type === SWITCHER_TYPE) {
                const door = currentStore.doorsState[reachableObject.props.id];
                if (![DOOR_OPENING, DOOR_CLOSING].includes(door)) {
                    actions.push(
                        actionCreators.doorsState[door === DOOR_OPEN ? 'setClosing' : 'setOpening'](reachableObject.props.id)
                    );
                    this.delayedActions.pushAction({
                        action: actionCreators.doorsState[door === DOOR_OPEN ? 'setClose' : 'setOpen'](reachableObject.props.id),
                        delay: DOOR_OPEN_TIME
                    });
                    if (door === DOOR_CLOSE) {
                        this.delayedActions.pushAction({
                            action: this.showHints([HINT_DOOR], false, DOOR_OPEN_TIME),
                            delay: DOOR_OPEN_TIME
                        });
                    }
                }
            }
        }

        // enemy
        if (currentStore.enemy.state !== ENEMY_STATE.LIMBO) {
            const playerPosition = newState.pos || currentStore.pos;
            const distanceToPlayer = GameLoop.getDistance2d(currentStore.enemy.position, playerPosition);
            const directionToPlayer = GameLoop.getDirection2d(currentStore.enemy.position, playerPosition);
            const canSeeEachOther = Collision.getCollisionView(
                [currentStore.enemy.position, playerPosition],
                currentStore.objects,
                BROAD_CELL_SIZE
            ) === null;
            actions.push(actionCreators.enemy.setVisibility(canSeeEachOther));
            if (
                canSeeEachOther &&
                (
                    // if player is too close
                    distanceToPlayer < ENEMY_ATTACK_DISTANCE ||
                    // if player id close and in sight
                    distanceToPlayer < ENEMY_ATTACK_DISTANCE_VISIBLE &&
                        Math.abs(directionToPlayer - currentStore.enemy.direction) < ENEMY_VIEW_ANGLE_RAD / 2
                )
            ) {
                // if enemy is not already attacking
                if ([ENEMY_STATE.WANDER, ENEMY_STATE.STOP].includes(currentStore.enemy.state)) {
                    actions.push(actionCreators.enemy.setState(ENEMY_STATE.ATTACK));
                }
            } else if (currentStore.enemy.state === ENEMY_STATE.ATTACK) {
                actions.push(actionCreators.enemy.setState(ENEMY_STATE.WANDER));
                const newTarget = Collision.getRandomFreeCell({
                    pos: currentStore.enemy.position,
                    objects: currentStore.objects,
                    broadCellSize: BROAD_CELL_SIZE,
                    boundaries: level.boundaries
                });
                actions.push(actionCreators.enemy.setTarget(newTarget));
                actions.push(actionCreators.enemy.setDirection(GameLoop.getDirection2d(
                    currentStore.enemy.position, newTarget
                )));
            }
            if (currentStore.enemy.state === ENEMY_STATE.WANDER) {
                let directionToTarget;
                // if enemy reached it's current target
                if (
                    GameLoop.getDistance2d(
                        currentStore.enemy.position,
                        currentStore.enemy.target
                    ) < ENEMY_TARGET_REACH_THRESHOLD
                ) {
                    const newTarget = Collision.getRandomFreeCell({
                        pos: currentStore.enemy.position,
                        objects: currentStore.objects,
                        broadCellSize: BROAD_CELL_SIZE,
                        boundaries: level.boundaries
                    });
                    directionToTarget = GameLoop.getDirection2d(
                        currentStore.enemy.position, newTarget
                    );
                    actions.push(actionCreators.enemy.setTarget(newTarget));
                    // stop for a while if direction has changed
                    if (!GameLoop.floatsEqual(directionToTarget, currentStore.enemy.direction)) {
                        actions.push(actionCreators.enemy.setState(ENEMY_STATE.STOP));
                        actions.push(actionCreators.enemy.setDirection(directionToTarget));
                        this.delayedActions.pushAction({
                            action: actionCreators.enemy.setState(ENEMY_STATE.WANDER),
                            delay: ENEMY_CHANGE_TARGET_TIME
                        });
                    }
                }
                if (!directionToTarget) {
                    directionToTarget = GameLoop.getDirection2d(
                        currentStore.enemy.position, currentStore.enemy.target
                    );
                }
                actions.push(actionCreators.enemy.setDirection(directionToTarget));
                actions.push(actionCreators.enemy.setPosition(
                    vectorsAdd3D(
                        currentStore.enemy.position,
                        GameLoop.getShift2d(directionToTarget, ENEMY_SPEED * frameRateCoefficient)
                    )
                ));
            } else if (currentStore.enemy.state === ENEMY_STATE.ATTACK) {
                if (distanceToPlayer < ENEMY_KILL_DISTANCE) {
                    this.props.onLoose();
                    return;
                } else {
                    actions.push(actionCreators.enemy.setDirection(directionToPlayer));
                    actions.push(actionCreators.enemy.setPosition(
                        vectorsAdd3D(
                            currentStore.enemy.position,
                            GameLoop.getShift2d(directionToPlayer, ENEMY_SPEED_RUNNING * frameRateCoefficient)
                        )
                    ));
                }
            }
        }

        if (actions.length) {
            this.props.dispatch(batchActions(actions));
        }
    }

    showHints(hints, once, delay = 0) {
        const rawHints = hints
            .filter(hint => {
                if (once && this.shownHints[hint]) {
                    return false;
                }
                this.shownHints[hint] = true;
                return true;
            });
        if (rawHints.length) {
            this.delayedActions.pushAction({
                action: actionCreators.hints.removeHints(rawHints),
                delay: HINT_SHOW_TIME + delay
            });
        }
        return actionCreators.hints.addHints(rawHints);
    }

    static filterStickValue(value) {
        return Math.abs(value) >= STICK_VALUE_THRESHOLD ? value : 0;
    }

    static getDistance2d(p1, p2) {
        return Math.sqrt((p1[0] - p2[0]) ** 2 + (p1[2] - p2[2]) ** 2);
    }

    static getDirection2d(p1, p2) {
        const xShift = p2[0] - p1[0];
        let zShift = p2[2] - p1[2];
        if (!xShift && !zShift) {
            return 0;
        }
        if (zShift) {
            zShift = -zShift;
        }
        let direction;
        if (zShift >= 0) {
            direction = Math.atan(xShift / zShift);
        } else {
            direction = Math.atan(xShift / zShift) + Math.PI;
        }
        if (direction < 0) {
            direction = direction + Math.PI * 2;
        }
        return direction;
    }

    static getShift2d(direction, distance) {
        return [
            distance * Math.sin(direction),
            0,
            -distance * Math.cos(direction)
        ];
    }

    static floatsEqual(f1, f2) {
        return Math.abs(f1 - f2) < EPSILON;
    }
}

export default connect()(GameLoop);
