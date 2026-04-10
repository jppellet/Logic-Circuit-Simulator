import * as t from "io-ts"
import { COLOR_COMPONENT_BORDER, GRID_STEP, TextVAlign, fillTextVAlign } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillUsing, ArrayFillWith, HighImpedance, LogicValue, Unknown, typeOrUndefined } from "../utils"
import { AdderDef } from "./Adder"
import { doALUAdd, doALUSub } from "./ALU"
import { ParametrizedComponentBase, Repr, ResolvedParams, defineParametrizedComponent, groupVertical, param } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuItems } from "./Drawable"


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
        })
    }

    protected override xrayScale() {
        return this.numBits >= 8 ? 0.12 : 0.21
    }

    protected override makeXRay(level: number, scale: number, link: boolean) {
        const bits = this.numBits
        const { xray, wire, gate } = this.parent.editor.newXRay(this, level, scale)
        const { ins, outs, p } = this.makeXRayNodes(xray, link)

        const xorCout = gate("xorCout", "xor", 0, p.bottom - 2.5 * GRID_STEP, "s")
        wire(xorCout, outs.Cout)

        const adderShiftY = -3 * GRID_STEP
        const adderSpacingY = 8 * GRID_STEP

        const not = gate("not", "not", 0, adderShiftY + (- (bits - 1) / 2) * adderSpacingY)

        const tailAdders = ArrayFillUsing(i =>
            AdderDef.makeSpawned(xray, `tailAdders${i}`, 0, adderShiftY + (i + 1 - (bits - 1) / 2) * adderSpacingY), bits - 1)

        const allocIn = xray.wires(ins.In,
            [not.inputs.In[0], ...tailAdders.map(adder => adder.inputs.B)], {
            bookings: { colsRight: 1 },
        })
        xray.wires([not.outputs.Out, ...tailAdders.map(adder => adder.outputs.S)], outs.Out, {
            bookings: { colsLeft: 1 },
        })

        const adderInAX = allocIn.at(0)
        wire(ins.In[0], tailAdders[0].inputs.Cin, "hv", [[allocIn.at(1), not], [not.inputs.In[0].posX - GRID_STEP, tailAdders[0].inputs.Cin.posY - GRID_STEP]])
        for (let i = 0; i < bits - 1; i++) {
            wire(ins.Dec, tailAdders[i].inputs.A, "vh", [adderInAX, p.top + GRID_STEP])
            if (i > 0) {
                wire(tailAdders[i - 1].outputs.Cout, tailAdders[i].inputs.Cin)
            }
        }

        wire(tailAdders[bits - 2].outputs.Cout, xorCout.in[0], "hv")
        wire(ins.Dec, xorCout.in[1], "vh", [
            [adderInAX, p.top + GRID_STEP],
            [xorCout.in[1], tailAdders[bits - 2].outputs.Cout.posY + GRID_STEP],
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
