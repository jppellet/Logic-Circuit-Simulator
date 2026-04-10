import * as t from "io-ts"
import { COLOR_BACKGROUND_INVALID, COLOR_COMPONENT_BORDER, colorForLogicValue, drawValueText } from "../drawutils"
import { S } from "../strings"
import { EdgeTrigger, LogicValue, LogicValueRepr, Unknown, toLogicValue, toLogicValueRepr, typeOrUndefined } from "../utils"
import { ComponentBase, InstantiatedComponentDef, NodeInDesc, NodeRec, NodesIn, NodesOut, Repr, defineAbstractComponent } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuData, MenuItems } from "./Drawable"
import { GateN } from "./Gate"
import { XRay } from "./XRay"


export const FlipflopOrLatchDef =
    defineAbstractComponent({
        button: { imgWidth: 50 },
        repr: {
            state: typeOrUndefined(LogicValueRepr),
            showContent: typeOrUndefined(t.boolean),
        },
        valueDefaults: {
            state: false,
            showContent: true,
        },
        size: () => ({ gridWidth: 5, gridHeight: 7 }),
        makeNodes: (nodeDistX: number) => {
            const s = S.Components.Generic
            return {
                outs: {
                    Q: [nodeDistX, -2, "e", s.OutputQDesc],
                    Q̅: [nodeDistX, 2, "e", s.OutputQBarDesc],
                },
            }
        },
        initialValue: (saved, defaults): [LogicValue, LogicValue] => {
            if (saved === undefined) {
                return [false, true]
            }
            const state = saved.state === undefined ? defaults.state : toLogicValue(saved.state)
            return [state, LogicValue.invert(state)]
        },
    })

export const FlipflopOrLatchDefNodeDistX = (isXRay: boolean) => isXRay ? 3 : 4

export const FlipflopOrLatchDefPreClr = {
    Pre: [0, -4, "n", S.Components.Generic.InputPresetDesc, { prefersSpike: true }],
    Clr: [0, +4, "s", S.Components.Generic.InputClearDesc, { prefersSpike: true }],
} as const satisfies NodeRec<NodeInDesc>


export type FlipflopOrLatchRepr = Repr<typeof FlipflopOrLatchDef>
export type FlipflopOrLatchValue = [LogicValue, LogicValue]

export abstract class FlipflopOrLatch<TRepr extends FlipflopOrLatchRepr> extends ComponentBase<
    TRepr,
    FlipflopOrLatchValue,
    NodesIn<TRepr>,
    NodesOut<TRepr>,
    true, true
> {

    protected _showContent: boolean
    protected _isInInvalidState = false

    protected constructor(parent: DrawableParent, SubclassDef: InstantiatedComponentDef<TRepr, FlipflopOrLatchValue>, saved?: TRepr) {
        super(parent, SubclassDef, saved)
        this._showContent = saved?.showContent ?? FlipflopOrLatchDef.aults.showContent
    }

    protected override toJSONBase() {
        const state = this.value[0]
        return {
            ...super.toJSONBase(),
            state: state !== FlipflopOrLatchDef.aults.state ? toLogicValueRepr(state) : undefined,
            showContent: (this._showContent !== FlipflopOrLatchDef.aults.showContent) ? this._showContent : undefined,
        }
    }

    public get storedValue() {
        return this.value[0]
    }

    public set storedValue(val: LogicValue) {
        this.doSetValue([val, LogicValue.invert(val)])
        const xray = this.cachedXRay
        if (xray !== undefined) {
            this.setStoredValueInXRay(xray, val)
        }
    }

    protected override propagateValue(newValue: [LogicValue, LogicValue]) {
        this.outputs.Q.value = newValue[0]
        this.outputs.Q̅.value = newValue[1]
    }

    protected doSetShowContent(showContent: boolean) {
        this._showContent = showContent
        this.requestRedraw({ why: "show content changed" })
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, {
            background: this._isInInvalidState ? COLOR_BACKGROUND_INVALID : undefined,
            drawLabels: () => {
                if (this._showContent && !this.parent.editor.options.hideMemoryContent) {
                    FlipflopOrLatch.drawStoredValue(g, this.value[0], this.posX, this.posY, 26, false)
                }
            },
        })
    }

    public static drawStoredValueFrame(g: GraphicsRendering, x: number, y: number, width: number, height: number, swapHeightWidth: boolean) {
        if (swapHeightWidth) {
            [width, height] = [height, width]
        }
        g.strokeStyle = COLOR_COMPONENT_BORDER
        g.lineWidth = 2
        g.beginPath()
        g.rect(x - width / 2, y - height / 2, width, height)
        g.fill()
        g.stroke()
    }

    public static drawStoredValue(g: GraphicsRendering, value: LogicValue, x: number, y: number, cellHeight: number, swapHeightWidth: boolean) {
        g.fillStyle = colorForLogicValue(value)
        FlipflopOrLatch.drawStoredValueFrame(g, x, y, 20, cellHeight, swapHeightWidth)
        drawValueText(g, value, x, y, { small: cellHeight < 18 })
    }

    protected makeSetShowContentContextMenuItem(): MenuItems {
        const icon = this._showContent ? "check" : "none"
        return [
            ["mid", MenuData.item(icon, S.Components.Generic.contextMenu.ShowContent,
                () => this.doSetShowContent(!this._showContent))],
        ]
    }

    protected override makeXRay(level: number, scale: number, link: boolean) {
        const xray = this.makeXRayForFlipflopOrLatch(level, scale, link)
        this.setStoredValueInXRay(xray, this.storedValue)
        return xray
    }

    protected abstract makeXRayForFlipflopOrLatch(level: number, scale: number, link: boolean): XRay

    protected abstract setStoredValueInXRay(xray: XRay, val: LogicValue): void

}


export const LatchNorQBar = "norQBar"
export const LatchNorQ = "norQ"
export function setStoredValueInXRayForNorLatch(xray: XRay, val: LogicValue) {
    const norQbar = xray.components.get(LatchNorQBar)
    const norQ = xray.components.get(LatchNorQ)
    if (norQbar === undefined || norQ === undefined) {
        console.warn("Cannot set stored value for latch in XRay: missing nor gates")
        return
    }
    const nodeToStabilize = ((val === true ? norQ : norQbar) as GateN).outputs.Out
    nodeToStabilize.value = true as LogicValue
}


// Flip-flop base class

export const FlipflopBaseDef =
    defineAbstractComponent({
        button: FlipflopOrLatchDef.button,
        repr: {
            ...FlipflopOrLatchDef.repr,
            trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
        },
        valueDefaults: {
            ...FlipflopOrLatchDef.valueDefaults,
            trigger: EdgeTrigger.rising,
        },
        size: FlipflopOrLatchDef.size,
        makeNodes: (clockYOffset: number, nodeDistX: number) => {
            const base = FlipflopOrLatchDef.makeNodes(nodeDistX)
            const s = S.Components.Generic
            return {
                ins: {
                    Clock: [-nodeDistX, clockYOffset, "w", s.InputClockDesc, { isClock: true }],
                    ...FlipflopOrLatchDefPreClr,
                },
                outs: base.outs,
            }
        },
        initialValue: FlipflopOrLatchDef.initialValue,
    })

export type FlipflopBaseRepr = Repr<typeof FlipflopBaseDef>

export interface SyncComponent<State> {
    trigger: EdgeTrigger
    value: State
    makeInvalidState(): State
    makeStateFromMainValue(val: LogicValue): State
    makeStateAfterClock(): State
}


export abstract class Flipflop<
    TRepr extends FlipflopBaseRepr,
> extends FlipflopOrLatch<TRepr> implements SyncComponent<[LogicValue, LogicValue]> {

    protected _lastClock: LogicValue = Unknown
    protected _trigger: EdgeTrigger

    protected constructor(parent: DrawableParent, SubclassDef: InstantiatedComponentDef<TRepr, FlipflopOrLatchValue>, saved?: TRepr) {
        super(parent, SubclassDef, saved)
        this._trigger = saved?.trigger ?? FlipflopBaseDef.aults.trigger
    }

    protected override toJSONBase() {
        return {
            ...super.toJSONBase(),
            trigger: (this._trigger !== FlipflopBaseDef.aults.trigger) ? this._trigger : undefined,
        }
    }

    public get trigger() {
        return this._trigger
    }

    public static doRecalcValueForSyncComponent<State>(comp: SyncComponent<State>, prevClock: LogicValue, clock: LogicValue, preset: LogicValue, clear: LogicValue): { isInInvalidState: boolean, newState: State } {
        // handle set and reset signals
        if (preset === true) {
            if (clear === true) {
                return { isInInvalidState: true, newState: comp.makeInvalidState() }
            } else {
                // preset is true, clear is false, set output to 1
                return { isInInvalidState: false, newState: comp.makeStateFromMainValue(true) }
            }
        }
        if (clear === true) {
            // clear is true, preset is false, set output to 0
            return { isInInvalidState: false, newState: comp.makeStateFromMainValue(false) }
        }

        // handle normal operation
        if (!Flipflop.isClockTrigger(comp.trigger, prevClock, clock)) {
            return { isInInvalidState: false, newState: comp.value }
        } else {
            return { isInInvalidState: false, newState: comp.makeStateAfterClock() }
        }
    }

    public static isClockTrigger(trigger: EdgeTrigger, prevClock: LogicValue, clock: LogicValue): boolean {
        return (trigger === EdgeTrigger.rising && prevClock === false && clock === true)
            || (trigger === EdgeTrigger.falling && prevClock === true && clock === false)
    }

    protected doRecalcValue(): [LogicValue, LogicValue] {
        const prevClock = this._lastClock
        const clock = this._lastClock = this.inputs.Clock.value
        const { isInInvalidState, newState } =
            Flipflop.doRecalcValueForSyncComponent(this, prevClock, clock,
                this.inputs.Pre.value,
                this.inputs.Clr.value)
        this._isInInvalidState = isInInvalidState
        return newState
    }

    public makeInvalidState(): [LogicValue, LogicValue] {
        return [false, false]
    }

    public makeStateFromMainValue(val: LogicValue): [LogicValue, LogicValue] {
        return [val, LogicValue.invert(val)]
    }

    public makeStateAfterClock(): [LogicValue, LogicValue] {
        return this.makeStateFromMainValue(LogicValue.filterHighZ(this.doRecalcValueAfterClock()))
    }

    protected abstract doRecalcValueAfterClock(): LogicValue

    public doSetTrigger(trigger: EdgeTrigger) {
        this._trigger = trigger
        this.requestRedraw({ why: "trigger changed", invalidateTests: true })
        this.invalidateXRay()
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        return [
            ...makeTriggerItems(this._trigger, this.doSetTrigger.bind(this)),
            ["mid", MenuData.sep()],
            ...this.makeSetShowContentContextMenuItem(),
            ...this.makeFlipFlopSpecificContextMenuItems(),
            ...this.makeForceOutputsContextMenuItem(true),
        ]
    }

    protected makeFlipFlopSpecificContextMenuItems(): MenuItems {
        return []
    }

}


export function makeTriggerItems(currentTrigger: EdgeTrigger, handler: (trigger: EdgeTrigger) => void): MenuItems {
    const s = S.Components.Generic.contextMenu

    const makeTriggerItem = (trigger: EdgeTrigger, desc: string) => {
        const isCurrent = currentTrigger === trigger
        const icon = isCurrent ? "check" : "none"
        const caption = s.TriggerOn + " " + desc
        const action = isCurrent ? () => undefined :
            () => handler(trigger)
        return MenuData.item(icon, caption, action)
    }

    return [
        ["mid", makeTriggerItem(EdgeTrigger.rising, s.TriggerRisingEdge)],
        ["mid", makeTriggerItem(EdgeTrigger.falling, s.TriggerFallingEdge)],
    ]
}
