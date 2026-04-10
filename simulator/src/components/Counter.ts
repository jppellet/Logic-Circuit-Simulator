import * as t from "io-ts"
import { COLOR_EMPTY, COLOR_LABEL_OFF, GRID_STEP, TextVAlign, displayValuesFromArray, fillTextVAlign, formatWithRadix, useCompact } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillUsing, ArrayFillWith, EdgeTrigger, LogicValue, Unknown, isUnknown, typeOrNull, typeOrUndefined } from "../utils"
import { ParametrizedComponentBase, Repr, ResolvedParams, defineParametrizedComponent, groupVertical, param } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuData, MenuItems } from "./Drawable"
import { FlipflopDDef } from "./FlipflopD"
import { Flipflop, FlipflopOrLatch, makeTriggerItems } from "./FlipflopOrLatch"
import { HalfAdderDef } from "./HalfAdder"


export const CounterDef =
    defineParametrizedComponent("counter", true, true, {
        variantName: ({ bits }) => `counter-${bits}`,
        idPrefix: "counter",
        button: { imgWidth: 50 },
        repr: {
            bits: typeOrUndefined(t.number),
            count: typeOrUndefined(t.number),
            trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
            displayRadix: typeOrUndefined(typeOrNull(t.number)), // undefined means default, null means no display
        },
        valueDefaults: {
            trigger: EdgeTrigger.rising,
            displayRadix: 10,
        },
        params: {
            bits: param(4, [2, 3, 4, 7, 8, 16]),
        },
        validateParams: ({ bits }) => ({
            numBits: bits,
        }),
        size: ({ numBits }) => ({
            gridWidth: numBits <= 6 ? 5 : numBits <= 8 ? 6 : 7,
            gridHeight: Math.max(11, 1 + (numBits + 1) * (useCompact(numBits) ? 1 : 2)),
        }),
        makeNodes: ({ numBits, gridWidth, gridHeight }) => {
            const s = S.Components.Generic
            const outX = 1 + gridWidth / 2
            const groupQ = groupVertical("e", outX, -1, numBits)
            const lastQY = groupQ[numBits - 1][1]
            const qyDiff = lastQY - groupQ[numBits - 2][1]
            const clockVY = lastQY + qyDiff
            const clearY = (gridHeight + 1) / 2

            return {
                ins: {
                    Clock: [-outX, clockVY, "w", s.InputClockDesc, { isClock: true }],
                    Clr: [0, clearY, "s", s.InputClearDesc, { prefersSpike: true }],
                },
                outs: {
                    Q: groupQ,
                    V: [outX, clockVY, "e", "V (oVerflow)"],
                },
            }
        },
        initialValue: (saved, { numBits }) => {
            if (saved === undefined || saved.count === undefined) {
                return Counter.emptyValue(numBits)
            }
            return [Counter.decimalToNBits(saved.count, numBits), false] as const
        },
    })

export type CounterRepr = Repr<typeof CounterDef>
export type CounterParams = ResolvedParams<typeof CounterDef>

export class Counter extends ParametrizedComponentBase<CounterRepr> {

    public static emptyValue(numBits: number) {
        return [ArrayFillWith<LogicValue>(false, numBits), false as LogicValue] as const
    }

    public static decimalToNBits(value: number, width: number): LogicValue[] {
        const binStr = value.toString(2).padStart(width, "0")
        const asBits = ArrayFillWith(false, width)
        for (let i = 0; i < width; i++) {
            asBits[i] = binStr[width - i - 1] === "1"
        }
        return asBits
    }

    public readonly numBits: number
    private _trigger: EdgeTrigger
    private _lastClock: LogicValue = Unknown
    private _displayRadix: number | undefined

    public constructor(parent: DrawableParent, params: CounterParams, saved?: CounterRepr) {
        super(parent, CounterDef.with(params), saved)

        this.numBits = params.numBits

        this._trigger = saved?.trigger ?? CounterDef.aults.trigger
        this._displayRadix = saved?.displayRadix === undefined ? CounterDef.aults.displayRadix
            : (saved.displayRadix === null ? undefined : saved.displayRadix) // convert null in the repr to undefined
    }

    public toJSON() {
        const [__, currentCountOrUnknown] = displayValuesFromArray(this.value[0], false)
        const currentCount = isUnknown(currentCountOrUnknown) ? 0 : currentCountOrUnknown
        const displayRadix = this._displayRadix === undefined ? null : this._displayRadix
        return {
            ...this.toJSONBase(),
            bits: this.numBits === CounterDef.aults.bits ? undefined : this.numBits,
            count: currentCount === 0 ? undefined : currentCount,
            trigger: (this._trigger !== CounterDef.aults.trigger) ? this._trigger : undefined,
            displayRadix: (displayRadix !== CounterDef.aults.displayRadix) ? displayRadix : undefined,
        }
    }

    public get trigger() {
        return this._trigger
    }

    public override makeTooltip() {
        const s = S.Components.Counter.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc) // TODO more info
        ))
    }

    protected doRecalcValue(): readonly [LogicValue[], LogicValue] {
        const clear = this.inputs.Clr.value
        if (clear === true) {
            return Counter.emptyValue(this.numBits)
        }

        const prevClock = this._lastClock
        const clock = this._lastClock = this.inputs.Clock.value
        const activeOverflowValue = this._trigger === EdgeTrigger.rising ? true : false

        if (Flipflop.isClockTrigger(this._trigger, prevClock, clock)) {
            const [__, value] = displayValuesFromArray(this.value[0], false)
            if (isUnknown(value)) {
                return [ArrayFillWith(Unknown, this.numBits), Unknown]
            }
            const newValue = value + 1
            if (newValue >= Math.pow(2, this.numBits)) {
                return [ArrayFillWith(false, this.numBits), activeOverflowValue]
            }

            return [Counter.decimalToNBits(newValue, this.numBits), !activeOverflowValue]

        } else {
            return [this.value[0], !activeOverflowValue]
        }
    }

    protected override propagateValue(newValue: readonly [LogicValue[], LogicValue]) {
        const [counter, overflow] = newValue
        this.outputValues(this.outputs.Q, counter)
        this.outputs.V.value = overflow
    }

    protected doSetTrigger(trigger: EdgeTrigger) {
        this._trigger = trigger
        this.requestRedraw({ why: "trigger changed", invalidateTests: true })
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, (ctx, { width }) => {
            if (this._displayRadix !== undefined) {
                g.font = "bold 20px sans-serif"
                const [__, currentCount] = displayValuesFromArray(this.value[0], false)
                const stringRep = formatWithRadix(currentCount, this._displayRadix, this.numBits, false)
                const labelMargin = 10
                const valueCenter = ctx.rotatePoint(this.posX - labelMargin / 2, this.outputs.Q.group.posYInParentTransform)

                g.fillStyle = COLOR_EMPTY
                const frameWidth = width - labelMargin - 12
                FlipflopOrLatch.drawStoredValueFrame(g, ...valueCenter, frameWidth, 28, false)

                g.fillStyle = COLOR_LABEL_OFF
                g.textAlign = "center"
                fillTextVAlign(g, TextVAlign.middle, stringRep, ...valueCenter)
            }
        })
    }

    private doSetDisplayRadix(displayRadix: number | undefined) {
        this._displayRadix = displayRadix
        this.requestRedraw({ why: "display radix changed" })
    }


    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.Counter.contextMenu
        const makeItemShowRadix = (displayRadix: number | undefined, desc: string) => {
            const icon = this._displayRadix === displayRadix ? "check" : "none"
            const caption = s.DisplayTempl.expand({ desc })
            const action = () => this.doSetDisplayRadix(displayRadix)
            return MenuData.item(icon, caption, action)
        }

        return [
            ...makeTriggerItems(this._trigger, this.doSetTrigger.bind(this)),
            ["mid", MenuData.sep()],
            ["mid", makeItemShowRadix(undefined, s.DisplayNone)],
            ["mid", makeItemShowRadix(10, s.DisplayDecimal)],
            ["mid", makeItemShowRadix(16, s.DisplayHex)],
            ["mid", MenuData.sep()],
            this.makeChangeParamsContextMenuItem("outputs", S.Components.Generic.contextMenu.ParamNumBits, this.numBits, "bits"),
            ...this.makeForceOutputsContextMenuItem(true),
        ]
    }

    protected override xrayScale(): number {
        return useCompact(this.numBits) ? (this.numBits >= 16 ? 0.1 : 0.115) : 0.205
    }

    protected override makeXRay(level: number, scale: number, link: boolean) {
        const { xray, gate, wire } = this.parent.editor.newXRay(this, level, scale)
        const { ins, outs, p } = this.makeXRayNodes(xray, link)

        const bits = this.numBits

        const storedValue = this.value[0]
        const ffds = ArrayFillUsing(i => {
            const ffd = FlipflopDDef.makeSpawned(xray, `ffd${i === bits ? "V" : i}`, 3 * GRID_STEP, (i - bits / 2) * 10 * GRID_STEP)
            ffd.doSetTrigger(this._trigger)
            ffd.storedValue = storedValue[i]
            return ffd
        }, bits + 1)

        const ffdV = ffds.pop()! // the last one is just for overflow
        ffdV.doSetTrigger(EdgeTrigger.falling)
        ffdV.setPosition(-2 * GRID_STEP, ffdV.posY, false)


        const allocOut = xray.wires(ffds.map(ffd => ffd.outputs.Q), outs.Q, {
            position: { right: p.right - 2 },
            bookings: { colsLeft: 4 },
        })
        const allocOutLeft = allocOut.derive({ invertOn: allocOut.numCols })

        for (let i = 0; i < bits; i++) {
            wire(ins.Clr, ffds[i].inputs.Clr, "vh", [[allocOutLeft.at(1), p.bottom - 2]])
        }
        wire(ins.Clr, ffdV.inputs.Clr, "vh", [ffdV.inputs.Clr, p.bottom - 2])

        const adders = ArrayFillUsing(i => {
            const i1 = i + 1
            const adder = HalfAdderDef.makeSpawned(xray, `adder${i1}`, -6 * GRID_STEP, ((i1 - bits / 2) * 10 - 1.5) * GRID_STEP, "s")
            wire(ffds[i1].outputs.Q, adder.inputs.A, "hv", [allocOutLeft.at(0), adder.inputs.A])
            wire(adder.outputs.S, ffds[i1].inputs.D, "hv", [ffds[i1].inputs.D.posX - 1.5 * GRID_STEP, ffds[i1].inputs.D])
            return adder
        }, bits - 1)

        for (let i = 1; i < adders.length; i++) {
            wire(adders[i - 1].outputs.Cout, adders[i].inputs.B)
        }
        wire(adders[adders.length - 1].outputs.Cout, ffdV.inputs.D, "vh")

        // loopback for first ff
        wire(ffds[0].outputs.Q̅, ffds[0].inputs.D, "hv", [allocOutLeft.at(0), ffds[0].posY - 4.5 * GRID_STEP])
        wire(ffds[0].outputs.Q, adders[0].inputs.B, "hv", [allocOutLeft.at(1), ffds[0].posY - 5.5 * GRID_STEP])

        const andV = gate("andV", "and", 5 * GRID_STEP, p.later)
        wire(ffdV.outputs.Q, andV.inputs.In[1], true)
        wire(andV, outs.V, "hv", [allocOut.at(0), outs.V.posY])

        // wire clock
        const clockWaypoint = [ffdV.inputs.Clock, ffdV.posY - 4.5 * GRID_STEP] as const
        for (let i = 0; i < bits; i++) {
            wire(ins.Clock, ffds[i].inputs.Clock, "hv", clockWaypoint)
        }
        wire(ins.Clock, ffdV.inputs.Clock, "hv")
        wire(ins.Clock, andV.inputs.In[0], "hv", [clockWaypoint, p.leftBy(1, andV.inputs.In[0])])

        return xray
    }

}
CounterDef.impl = Counter
