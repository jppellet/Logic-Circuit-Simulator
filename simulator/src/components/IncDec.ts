import * as t from "io-ts"
import { COLOR_COMPONENT_BORDER, GRID_STEP, TextVAlign, fillTextVAlign } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillUsing, ArrayFillWith, HighImpedance, LogicValue, Unknown, typeOrUndefined } from "../utils"
import { Adder, AdderDef } from "./Adder"
import { doALUAdd, doALUSub } from "./ALU"
import { ParametrizedComponentBase, Repr, ResolvedParams, defineParametrizedComponent, groupVertical, param } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuItems } from "./Drawable"
import { HalfAdder, HalfAdderDef } from "./HalfAdder"
import { Input, InputDef } from "./Input"
import { XRay } from "./XRay"


export const IncDecDef =
    defineParametrizedComponent("incdec", true, true, {
        variantName: ({ bits }) => `incdec-${bits}`,
        idPrefix: "incdec",
        button: { imgWidth: 50 },
        repr: {
            bits: typeOrUndefined(t.number),
        },
        valueDefaults: {},
        params: {
            bits: param(4, [2, 4, 8, 16]),
        },
        validateParams: ({ bits }) => ({
            numBits: bits,
        }),
        size: ({ numBits }) => {
            return {
                gridWidth: 4,
                gridHeight: numBits < 8 ? 9 : numBits + 1,
            }
        },
        makeNodes: ({ numBits, gridWidth, gridHeight }) => {
            return {
                ins: {
                    In: groupVertical("w", -1 - gridWidth / 2, 0, numBits),
                    Dec: [0, -gridHeight / 2 - 1, "n", { labelName: "I̅n̅c̅Dec", labelOffset: e => e === "e" ? [0, 2] : undefined }],
                },
                outs: {
                    Out: groupVertical("e", gridWidth / 2 + 1, 0, numBits),
                    Cout: [0, gridHeight / 2 + 1, "s"],
                },
            }
        },
        initialValue: (saved, { numBits }) => [ArrayFillWith<LogicValue>(false, numBits), false as LogicValue],
    })

export type IncDecRepr = Repr<typeof IncDecDef>
export type IncDecParams = ResolvedParams<typeof IncDecDef>

export class IncDec extends ParametrizedComponentBase<IncDecRepr> {

    public readonly numBits: number

    public constructor(parent: DrawableParent, params: IncDecParams, saved?: IncDecRepr) {
        super(parent, IncDecDef.with(params), saved)

        this.numBits = params.numBits
    }

    public toJSON() {
        return {
            ...this.toJSONBase(),
            bits: this.numBits === IncDecDef.aults.bits ? undefined : this.numBits,
        }
    }

    public override makeTooltip() {
        const s = S.Components.Counter.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc)
        ))
    }

    protected doRecalcValue(): [LogicValue[], LogicValue] {
        const dec = this.inputs.Dec.value
        if (dec === Unknown || dec === HighImpedance) {
            return [ArrayFillWith(Unknown, this.numBits), Unknown]
        }

        const ins = this.inputValues(this.inputs.In)
        const { s, cout } = !dec
            ? doALUAdd(ins, ArrayFillWith(false, this.numBits), true)
            : doALUSub(ins, ArrayFillWith(false, this.numBits), true)
        return [s, cout]
    }

    protected override propagateValue(newValue: [LogicValue[], LogicValue]) {
        const [s, cout] = newValue
        this.outputValues(this.outputs.Out, s)
        this.outputs.Cout.value = cout
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, {
            drawLabels: (ctx) => {
                ctx.inNonTransformedFrame(() => {
                    const dec = this.inputs.Dec.value
                    const title = dec === HighImpedance || dec === Unknown ? "?" : dec ? "–1" : "+1"
                    g.font = "bold 20px sans-serif"
                    g.fillStyle = COLOR_COMPONENT_BORDER
                    g.textAlign = "center"
                    fillTextVAlign(g, TextVAlign.middle, title, this.posX + 2, this.posY)
                })
            },
            xrayScale: this.numBits >= 8 ? 0.12 : 0.21,
        })
    }

    protected override makeXRay(level: number, scale: number): XRay | undefined {
        const bits = this.numBits
        const { xray, wire, gate } = this.parent.editor.newXRay(this, level, scale)
        const { ins, outs, x, y, later } = this.makeXRayNodes<IncDec>(xray)

        const xorCout = gate("xorCout", "xor", 0, y.bottom - 2.5 * GRID_STEP, "s")
        wire(xorCout, outs.Cout)

        const adderShiftY = -3 * GRID_STEP
        const adderSpacingY = 8 * GRID_STEP
        const headAdder = HalfAdderDef.makeSpawned<HalfAdder>(xray, "headAdder", 0, adderShiftY + (- (bits - 1) / 2) * adderSpacingY)
        const const1 = InputDef.makeSpawned<Input>(xray, `const1`, headAdder.inputs.A.posX - 1 * GRID_STEP, later)
        const1.setValue([true])
        const1.doSetIsConstant(true)
        wire(const1.outputs.Out[0], headAdder.inputs.A, false)

        const tailAdders = ArrayFillUsing(i =>
            AdderDef.makeSpawned<Adder>(xray, `tailAdders${i}`, 0, adderShiftY + (i + 1 - (bits - 1) / 2) * adderSpacingY), bits - 1)

        const adders = [headAdder, ...tailAdders]
        const allocIn = xray.wires(ins.In, adders.map(adder => adder.inputs.B), { colsRight: 1 })
        xray.wires(adders.map(adder => adder.outputs.S), outs.Out, { colsLeft: 1 })

        const adderInAX = allocIn.colXAt(0)
        wire(headAdder.outputs.C, tailAdders[0].inputs.Cin, "hv", [headAdder.outputs.C.posX, headAdder.outputs.C.posY + 1.75 * GRID_STEP])
        for (let i = 0; i < bits - 1; i++) {
            wire(ins.Dec, tailAdders[i].inputs.A, "vh", [adderInAX, y.top + GRID_STEP])
            if (i > 0) {
                wire(tailAdders[i - 1].outputs.Cout, tailAdders[i].inputs.Cin)
            }
        }

        wire(tailAdders[bits - 2].outputs.Cout, xorCout.in[0], "hv")
        wire(ins.Dec, xorCout.in[1], "vh", [
            [adderInAX, y.top + GRID_STEP],
            [xorCout.in[1].posX, tailAdders[bits - 2].outputs.Cout.posY + GRID_STEP],
        ])

        return xray
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        return [
            ...this.makeForceOutputsContextMenuItem(true),
        ]
    }

}
IncDecDef.impl = IncDec
