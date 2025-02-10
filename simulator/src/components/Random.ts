import * as t from "io-ts"
import { COLOR_COMPONENT_INNER_LABELS, displayValuesFromArray, drawLabel, useCompact } from "../drawutils"
import { tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillUsing, ArrayFillWith, EdgeTrigger, LogicValue, Unknown, typeOrUndefined } from "../utils"
import { ComponentName, ComponentNameRepr, ParametrizedComponentBase, Repr, ResolvedParams, defineParametrizedComponent, groupVertical, param } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuData, MenuItems, Orientation } from "./Drawable"
import { Flipflop, FlipflopOrLatch } from "./FlipflopOrLatch"
import { RegisterBase } from "./Register"


export const RandomDef =
    defineParametrizedComponent("rand", true, true, {
        variantName: ({ bits }) => `rand-${bits}`,
        idPrefix: "rand",
        button: { imgWidth: 32 },
        repr: {
            bits: typeOrUndefined(t.number),
            prob1: typeOrUndefined(t.number),
            showProb: typeOrUndefined(t.boolean),
            trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
            name: ComponentNameRepr,
        },
        valueDefaults: {
            prob1: 0.5,
            showProb: false,
            trigger: EdgeTrigger.rising,
        },
        params: {
            bits: param(1, [1, 2, 3, 4, 7, 8, 16]),
        },
        validateParams: ({ bits }) => ({
            numBits: bits,
        }),
        size: ({ numBits }) => ({
            gridWidth: 4,
            gridHeight: 4 + (useCompact(numBits) ? numBits / 2 : numBits) * 2,
        }),
        makeNodes: ({ numBits, gridHeight }) => {
            const s = S.Components.Generic
            const clockY = gridHeight / 2 - 1
            return {
                ins: {
                    Clock: [-3, clockY, "w", s.InputClockDesc, { isClock: true }],
                },
                outs: {
                    Out: groupVertical("e", 3, 0, numBits),
                },
            }
        },
        initialValue: (saved, { numBits }) => ArrayFillWith<LogicValue>(false, numBits),
    })

export type RandomRepr = Repr<typeof RandomDef>
export type RandomParams = ResolvedParams<typeof RandomDef>


export class Random extends ParametrizedComponentBase<RandomRepr> {

    public readonly numBits: number
    private _prob1: number
    private _showProb: boolean
    private _lastClock: LogicValue = Unknown
    private _trigger: EdgeTrigger
    private _name: ComponentName

    public constructor(parent: DrawableParent, params: RandomParams, saved?: RandomRepr) {
        super(parent, RandomDef.with(params), saved)

        this.numBits = params.numBits

        this._prob1 = saved?.prob1 !== undefined
            ? Math.max(0, Math.min(1, saved.prob1)) : RandomDef.aults.prob1
        this._showProb = saved?.showProb ?? RandomDef.aults.showProb
        this._trigger = saved?.trigger ?? RandomDef.aults.trigger
        this._name = saved?.name ?? undefined
    }

    public override toJSON() {
        return {
            ...super.toJSONBase(),
            bits: this.numBits === RandomDef.aults.bits ? undefined : this.numBits,
            name: this._name,
            prob1: (this._prob1 !== RandomDef.aults.prob1) ? this._prob1 : undefined,
            showProb: (this._showProb !== RandomDef.aults.showProb) ? this._showProb : undefined,
            trigger: (this._trigger !== RandomDef.aults.trigger) ? this._trigger : undefined,
        }
    }

    public override get allowsForcedOutputs() {
        return false
    }

    public override makeTooltip() {
        const s = S.Components.Random.tooltip
        return tooltipContent(s.title,
            s.desc[0] + this._prob1 + s.desc[1]
        )
    }

    protected doRecalcValue(): LogicValue[] {
        const prevClock = this._lastClock
        const clock = this._lastClock = this.inputs.Clock.value
        if (!Flipflop.isClockTrigger(this._trigger, prevClock, clock)) {
            // no change
            return this.value
        }
        const randBool = () => {
            return Math.random() < this._prob1
        }
        return ArrayFillUsing(randBool, this.numBits)
    }

    protected override propagateValue(newValue: LogicValue[]) {
        this.outputValues(this.outputs.Out, newValue)
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        const outputValues = this.value

        this.doDrawDefault(g, ctx, {
            componentName: [this._name, false, () => displayValuesFromArray(outputValues, false)[1]],
            skipLabels: true,
            drawLabels: (ctx, { top }) => {
                if (this.numBits === 1) {
                    const output = this.outputs.Out[0]
                    FlipflopOrLatch.drawStoredValue(g, output.value, ...ctx.rotatePoint(this.posX, output.posYInParentTransform), 26, false)
                } else {
                    RegisterBase.drawStoredValues(g, ctx, this.outputs.Out, this.posX, Orientation.isVertical(this.orient))
                }

                if (this._showProb) {
                    const isVertical = Orientation.isVertical(this.orient)

                    g.fillStyle = COLOR_COMPONENT_INNER_LABELS
                    g.font = "9px sans-serif"
                    const probTextLastPart = String(Math.round(this._prob1 * 100) / 100).substring(1)
                    const probTextParts = ["P(1)", "=", probTextLastPart]
                    if (isVertical) {
                        let currentOffset = -10
                        let offset = Math.abs(currentOffset)
                        if (this.orient === "s") {
                            currentOffset = -currentOffset
                            offset = -offset
                        }
                        for (const part of probTextParts) {
                            drawLabel(ctx, this.orient, part, "n", this.posX - currentOffset, top - 1, undefined)
                            currentOffset += offset
                        }
                    } else {
                        const probText = probTextParts.join(" ")
                        drawLabel(ctx, this.orient, probText, "n", this.posX, top, undefined)
                    }
                }
            },
        })
    }

    private doSetName(name: ComponentName) {
        this._name = name
        this.requestRedraw({ why: "name changed" })
    }

    private doSetShowProb(showProb: boolean) {
        this._showProb = showProb
        this.requestRedraw({ why: "show probability changed" })
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.Random.contextMenu
        const icon = this._showProb ? "check" : "none"
        const toggleShowProbItem = MenuData.item(icon, s.ShowProb,
            () => this.doSetShowProb(!this._showProb))

        return [
            ["mid", toggleShowProbItem],
            ["mid", MenuData.sep()],
            this.makeChangeParamsContextMenuItem("inputs", S.Components.Generic.contextMenu.ParamNumBits, this.numBits, "bits"),
            ["mid", MenuData.sep()],
            ["mid", this.makeSetNameContextMenuItem(this._name, this.doSetName.bind(this))],
        ]
    }


    public override keyDown(e: KeyboardEvent): void {
        if (e.key === "Enter" && !e.altKey) {
            this.runSetNameDialog(this._name, this.doSetName.bind(this))
        } else {
            super.keyDown(e)
        }
    }

}
RandomDef.impl = Random
