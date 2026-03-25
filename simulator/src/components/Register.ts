import * as t from "io-ts"
import { COLOR_COMPONENT_BORDER, GRID_STEP, TextVAlign, displayValuesFromArray, fillTextVAlign, useCompact } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillUsing, ArrayFillWith, EdgeTrigger, LogicValue, Orientation, Unknown, allBooleans, binaryStringRepr, hexStringRepr, isAllZeros, isHighImpedance, isUnknown, typeOrUndefined, valuesFromBinaryOrHexRepr } from "../utils"
import { ExtractParamDefs, ExtractParams, NodesIn, NodesOut, ParametrizedComponentBase, ReadonlyGroupedNodeArray, Repr, ResolvedParams, defineAbstractParametrizedComponent, defineParametrizedComponent, groupVertical, param, paramBool } from "./Component"
import { Counter } from "./Counter"
import { DrawContext, DrawContextExt, DrawableParent, GraphicsRendering, MenuData, MenuItems } from "./Drawable"
import { FlipflopD, FlipflopDDef } from "./FlipflopD"
import { Flipflop, FlipflopOrLatch, makeTriggerItems } from "./FlipflopOrLatch"
import { NodeOut } from "./Node"
import { type ShiftRegisterDef } from "./ShiftRegister"
import { XRay } from "./XRay"


export const RegisterBaseDef =
    defineAbstractParametrizedComponent({
        button: { imgWidth: 50 },
        repr: {
            bits: typeOrUndefined(t.number),
            showContent: typeOrUndefined(t.boolean),
            trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
            content: typeOrUndefined(t.string),
        },
        valueDefaults: {
            showContent: true,
            trigger: EdgeTrigger.rising,
        },
        params: {
            bits: param(4, [2, 4, 8, 16]),
        },
        validateParams: ({ bits }) => ({
            numBits: bits,
        }),
        size: ({ numBits }) => ({
            gridWidth: 7,
            gridHeight: numBits === 2 ? 11 : Math.max(15, 5 + numBits),
        }),
        makeNodes: ({ numBits, gridHeight }) => {
            const bottomOffset = (gridHeight + 1) / 2
            const clockYOffset = bottomOffset - 2
            const topOffset = -bottomOffset
            const s = S.Components.Generic

            return {
                ins: {
                    Clock: [-5, clockYOffset, "w", s.InputClockDesc, { isClock: true }],
                    Pre: [0, topOffset, "n", s.InputPresetDesc, { prefersSpike: true }],
                    Clr: [0, bottomOffset, "s", s.InputClearDesc, { prefersSpike: true }],
                },
                outs: {
                    Q: groupVertical("e", 5, 0, numBits),
                },
            }
        },
        initialValue: (saved, { numBits }) => {
            let content
            if (saved === undefined || (content = saved.content) === undefined) {
                return ArrayFillWith(false, numBits)
            }
            return valuesFromBinaryOrHexRepr(content, numBits)
        },
    })

export type RegisterBaseRepr = Repr<typeof RegisterBaseDef>
export type RegisterBaseParams = ResolvedParams<typeof RegisterBaseDef>

export abstract class RegisterBase<
    TRepr extends RegisterBaseRepr,
    TParamDefs extends ExtractParamDefs<TRepr> = ExtractParamDefs<TRepr>,
> extends ParametrizedComponentBase<
    TRepr,
    LogicValue[],
    TParamDefs,
    ExtractParams<TRepr>,
    NodesIn<TRepr>,
    NodesOut<TRepr>,
    true, true
> {

    public readonly numBits: number
    protected _showContent: boolean
    protected _trigger: EdgeTrigger
    protected _isInInvalidState = false
    protected _lastClock: LogicValue = Unknown

    protected constructor(parent: DrawableParent, SubclassDef: typeof RegisterDef | typeof ShiftRegisterDef, params: RegisterBaseParams, saved?: TRepr) {
        super(parent, SubclassDef.with(params as any) as any /* TODO */, saved)

        this.numBits = params.numBits

        this._showContent = saved?.showContent ?? RegisterDef.aults.showContent
        this._trigger = saved?.trigger ?? RegisterDef.aults.trigger
    }

    protected override toJSONBase() {
        return {
            bits: this.numBits === RegisterDef.aults.bits ? undefined : this.numBits,
            ...super.toJSONBase(),
            showContent: (this._showContent !== RegisterDef.aults.showContent) ? this._showContent : undefined,
            trigger: (this._trigger !== RegisterDef.aults.trigger) ? this._trigger : undefined,
            content: this.contentRepr(true),
        }
    }

    public contentRepr<AllowUndefined extends boolean>(undefinedIfTrivial: AllowUndefined)
        : string | (AllowUndefined extends false ? never : undefined) {
        const content = this.value
        const hexWidth = Math.ceil(this.numBits / 4)
        const repr = allBooleans(content) ? hexStringRepr(content, hexWidth) : binaryStringRepr(content)
        return undefinedIfTrivial && isAllZeros(repr) ? undefined as any : repr
    }

    public get trigger() {
        return this._trigger
    }

    protected doRecalcValue(): LogicValue[] {
        const prevClock = this._lastClock
        const clock = this._lastClock = this.inputs.Clock.value
        const { isInInvalidState, newState } =
            Flipflop.doRecalcValueForSyncComponent(this, prevClock, clock,
                this.inputs.Pre.value,
                this.inputs.Clr.value)
        this._isInInvalidState = isInInvalidState
        return newState
    }

    public makeInvalidState(): LogicValue[] {
        return ArrayFillWith(false, this.numBits)
    }

    public makeStateFromMainValue(val: LogicValue): LogicValue[] {
        return ArrayFillWith(val, this.numBits)
    }

    public abstract makeStateAfterClock(): LogicValue[]

    protected override propagateValue(newValue: LogicValue[]) {
        this.outputValues(this.outputs.Q, newValue)
    }

    protected doSetShowContent(showContent: boolean) {
        this._showContent = showContent
        this.requestRedraw({ why: "show content changed" })
    }

    public doSetTrigger(trigger: EdgeTrigger) {
        this._trigger = trigger
        this.requestRedraw({ why: "trigger changed", invalidateTests: true })
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, {
            drawLabels: (ctx) => {
                if (this._showContent && !this.parent.editor.options.hideMemoryContent) {
                    RegisterBase.drawStoredValues(g, ctx, this.outputs.Q, this.posX, Orientation.isVertical(this.orient))
                } else {
                    this.doDrawGenericCaption(g)
                }
            },
            xrayScale: this.xrayScale,
        })
    }

    protected get xrayScale(): number | undefined { return undefined }

    public static drawStoredValues(g: GraphicsRendering, ctx: DrawContextExt, outputs: ReadonlyGroupedNodeArray<NodeOut>, posX: number, swapHeightWidth: boolean) {
        const cellHeight = useCompact(outputs.length) ? GRID_STEP : 2 * GRID_STEP
        for (const output of outputs) {
            FlipflopOrLatch.drawStoredValue(g, output.value, ...ctx.rotatePoint(posX, output.posYInParentTransform), cellHeight, swapHeightWidth)
        }
    }

    protected abstract doDrawGenericCaption(g: GraphicsRendering): void

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.Generic.contextMenu
        const icon = this._showContent ? "check" : "none"
        const toggleShowContentItem = MenuData.item(icon, s.ShowContent,
            () => this.doSetShowContent(!this._showContent))

        return [
            this.makeChangeParamsContextMenuItem("outputs", s.ParamNumBits, this.numBits, "bits"),
            ...this.makeRegisterSpecificContextMenuItems(),
            ["mid", MenuData.sep()],
            ...makeTriggerItems(this._trigger, this.doSetTrigger.bind(this)),
            ["mid", MenuData.sep()],
            ["mid", toggleShowContentItem],
            ...this.makeForceOutputsContextMenuItem(true),
        ]
    }

    protected makeRegisterSpecificContextMenuItems(): MenuItems {
        return []
    }

}

export const RegisterDef =
    defineParametrizedComponent("reg", true, true, {
        variantName: ({ bits }) => `reg-${bits}`,
        idPrefix: "reg",
        ...RegisterBaseDef,
        repr: {
            ...RegisterBaseDef.repr,
            inc: typeOrUndefined(t.boolean),
            saturating: typeOrUndefined(t.boolean),
        },
        valueDefaults: {
            ...RegisterBaseDef.valueDefaults,
            saturating: false,
        },
        params: {
            bits: RegisterBaseDef.params.bits,
            inc: paramBool(),
        },
        validateParams: ({ bits, inc }) => ({
            numBits: bits,
            hasIncDec: inc,
        }),
        makeNodes: (params, defaults) => {
            const base = RegisterBaseDef.makeNodes(params, defaults)
            const baseClear = base.ins.Clr
            const bottomOffset = base.ins.Clr[1]
            return {
                ins: {
                    ...base.ins,
                    D: groupVertical("w", -5, 0, params.numBits),
                    ...(!params.hasIncDec ? {} : {
                        Clr: [2, bottomOffset, "s", baseClear[3], baseClear[4]], // move Clr to the right
                        Inc: [-2, bottomOffset, "s"],
                        Dec: [0, bottomOffset, "s"],
                    }),
                },
                outs: base.outs,
            }
        },
    })

export type RegisterRepr = Repr<typeof RegisterDef>
export type RegisterParams = ResolvedParams<typeof RegisterDef>

export class Register extends RegisterBase<RegisterRepr> {

    public readonly hasIncDec: boolean
    private _saturating: boolean

    public constructor(parent: DrawableParent, params: RegisterParams, saved?: RegisterRepr) {
        super(parent, RegisterDef, params, saved)
        this.hasIncDec = params.hasIncDec

        this._saturating = this.hasIncDec && (saved?.saturating ?? RegisterDef.aults.saturating)
    }

    public toJSON() {
        return {
            ...this.toJSONBase(),
            inc: this.hasIncDec === RegisterDef.aults.inc ? undefined : this.hasIncDec,
            saturating: this._saturating === RegisterDef.aults.saturating ? undefined : this._saturating,
        }
    }

    public override makeTooltip() {
        const s = S.Components.Register.tooltip

        return tooltipContent(s.title, mods(
            div(s.desc.expand({ numBits: this.numBits })) // TODO more info
        ))
    }

    public makeStateAfterClock(): LogicValue[] {
        const inc = this.inputs.Inc?.value ?? false
        const dec = this.inputs.Dec?.value ?? false
        if (isUnknown(inc) || isUnknown(dec) || isHighImpedance(inc) || isHighImpedance(dec)) {
            return ArrayFillWith(false, this.numBits)
        }
        if (inc || dec) {
            if (inc && dec) {
                // no change
                return this.value
            }

            // inc or dec
            const [__, val] = displayValuesFromArray(this.value, false)
            if (isUnknown(val)) {
                return ArrayFillWith(Unknown, this.numBits)
            }

            let newVal: number
            if (inc) {
                // increment
                newVal = val + 1
                if (newVal >= 2 ** this.numBits) {
                    if (this._saturating) {
                        return ArrayFillWith(true, this.numBits)
                    }
                    return ArrayFillWith(false, this.numBits)
                }
            } else {
                // decrement
                newVal = val - 1
                if (newVal < 0) {
                    if (this._saturating) {
                        return ArrayFillWith(false, this.numBits)
                    }
                    return ArrayFillWith(true, this.numBits)
                }
            }
            return Counter.decimalToNBits(newVal, this.numBits)
        }

        // else, just a regular load from D
        return this.inputValues(this.inputs.D).map(LogicValue.filterHighZ)
    }

    protected override doDrawGenericCaption(g: GraphicsRendering) {
        g.font = `bold 15px sans-serif`
        g.fillStyle = COLOR_COMPONENT_BORDER
        g.textAlign = "center"
        fillTextVAlign(g, TextVAlign.middle, "Reg.", this.posX, this.posY - 8)
        g.font = `11px sans-serif`
        fillTextVAlign(g, TextVAlign.middle, `${this.numBits} bits`, this.posX, this.posY + 10)
    }

    protected override get xrayScale(): number {
        return this.numBits >= 16 ? 0.125 : this.numBits >= 8 ? 0.185 : this.numBits >= 4 ? 0.35 : 0.5
    }

    protected override makeXRay(level: number, scale: number): XRay | undefined {
        if (this.hasIncDec) {
            // can't do that... yet?
            return undefined
        }

        const bits = this.numBits
        const { xray, wire } = this.parent.editor.newXRay(this, level, scale)
        const { ins, outs } = this.makeXRayNodes<Register>(xray)

        const edgeTrigger = this.trigger
        const ffds = ArrayFillUsing(i => {
            const ffd = FlipflopDDef.makeSpawned<FlipflopD>(xray, `ffd${i}`, 0, (i - (bits - 1) / 2) * 10 * GRID_STEP)
            ffd.doSetTrigger(edgeTrigger)
            return ffd
        }, bits)

        const inputAlloc = xray.wires(ins.D, ffds.map(ffd => ffd.inputs.D), { colsRight: 4 })
        const outputAlloc = xray.wires(ffds.map(ffd => ffd.outputs.Q), outs.Q, { colsLeft: 2 })

        const clockLineX = inputAlloc.colXAt(2)
        const presetLineX = inputAlloc.colXAt(0)
        const clearLineX = outputAlloc.colXAt(-1)

        // clock
        for (let i = 0; i < bits; i++) {
            wire(ins.Clock, ffds[i].inputs.Clock, "hv", [clockLineX, ffds[i].inputs.Clock.posY])
        }

        // preset
        wire(ins.Pre, ffds[0].inputs.Pre)
        for (let i = 1; i < bits; i++) {
            wire(ins.Pre, ffds[i].inputs.Pre, "vh", [presetLineX, ffds[0].inputs.Pre.posY])
        }

        // clear
        for (let i = 0; i < bits - 1; i++) {
            wire(ins.Clr, ffds[i].inputs.Clr, "vh", [clearLineX, ffds[bits - 1].inputs.Clr.posY])
        }
        wire(ins.Clr, ffds[bits - 1].inputs.Clr)

        return xray
    }


    private doSetSaturating(saturating: boolean) {
        this._saturating = saturating
        this.requestRedraw({ why: "saturating changed", invalidateTests: true })
    }

    protected override makeRegisterSpecificContextMenuItems(): MenuItems {
        const s = S.Components.Register.contextMenu

        const toggleSaturatingItem: MenuItems = !this.hasIncDec ? [] : [
            ["mid", MenuData.item(
                this._saturating ? "check" : "none",
                s.Saturating,
                () => this.doSetSaturating(!this._saturating)
            )],
        ]

        return [
            this.makeChangeBooleanParamsContextMenuItem(s.ParamHasIncDec, this.hasIncDec, "inc"),
            ...toggleSaturatingItem,
        ]
    }

}
RegisterDef.impl = Register
