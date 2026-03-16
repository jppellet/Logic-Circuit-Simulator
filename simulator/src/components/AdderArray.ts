import * as t from "io-ts"
import { COLOR_COMPONENT_BORDER, GRID_STEP, TextVAlign, fillTextVAlign } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillUsing, ArrayFillWith, LogicValue, typeOrUndefined } from "../utils"
import { Adder, AdderDef } from "./Adder"
import { ALUDef, doALUAdd } from "./ALU"
import { ParametrizedComponentBase, Repr, ResolvedParams, Value, defineParametrizedComponent, groupVertical, param, shiftWhenHorizontal } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuItems } from "./Drawable"
import { XRay } from "./XRay"


export const AdderArrayDef =
    defineParametrizedComponent("adder-array", true, true, {
        variantName: ({ bits }) => `adder-array-${bits}`,
        idPrefix: "adder",
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
        size: (params) => ({
            gridWidth: 4, // constant
            gridHeight: ALUDef.size({ ...params, usesExtendedOpcode: false }).gridHeight, // mimic ALU
        }),
        makeNodes: ({ numBits, gridHeight }) => {
            const inputCenterY = 5 + Math.max(0, (numBits - 8) / 2)
            const coutY = Math.floor(gridHeight / 2) + 1
            const cinY = -coutY

            return {
                ins: {
                    A: groupVertical("w", -3, -inputCenterY, numBits),
                    B: groupVertical("w", -3, inputCenterY, numBits),
                    Cin: [0, cinY, "n"],
                },
                outs: {
                    S: groupVertical("e", 3, 0, numBits),
                    Cout: [-1, coutY, "s", { labelOffset: shiftWhenHorizontal(4, 0) }],
                    V: [1, coutY, "s", { labelOffset: shiftWhenHorizontal(2, 0) }],
                },
            }
        },
        initialValue: (saved, { numBits }) => ({
            s: ArrayFillWith<LogicValue>(false, numBits),
            v: false as LogicValue,
            cout: false as LogicValue,
        }),
    })


export type AdderArrayRepr = Repr<typeof AdderArrayDef>
export type AdderArrayParams = ResolvedParams<typeof AdderArrayDef>
export type AdderArrayValue = Value<typeof AdderArrayDef>

export class AdderArray extends ParametrizedComponentBase<AdderArrayRepr> {

    public readonly numBits: number

    public constructor(parent: DrawableParent, params: AdderArrayParams, saved?: AdderArrayRepr) {
        super(parent, AdderArrayDef.with(params), saved)
        this.numBits = params.numBits
    }

    public toJSON() {
        // TODO check if params can be serialized automatically
        return {
            ...this.toJSONBase(),
            bits: this.numBits === AdderArrayDef.aults.bits ? undefined : this.numBits,
        }
    }

    public override makeTooltip() {
        const s = S.Components.AdderArray.tooltip
        return tooltipContent(s.title.expand({ numBits: this.numBits }), mods(
            div(s.desc), // TODO more info
        ))
    }

    protected doRecalcValue(): AdderArrayValue {
        const a = this.inputValues(this.inputs.A)
        const b = this.inputValues(this.inputs.B)
        const cin = this.inputs.Cin.value
        return doALUAdd(a, b, cin)
    }

    protected override propagateValue(newValue: AdderArrayValue) {
        this.outputValues(this.outputs.S, newValue.s)
        this.outputs.Cout.value = newValue.cout
        this.outputs.V.value = newValue.v
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, {
            drawLabels: (ctx) => {
                g.font = `bold 25px sans-serif`
                g.fillStyle = COLOR_COMPONENT_BORDER
                g.textAlign = "center"
                fillTextVAlign(g, TextVAlign.middle, "+", ...ctx.rotatePoint(this.posX - 4, this.posY - 2))
            },
            xrayScale: [0.32, 0.3, 0.20, 0.15][Math.log2(this.numBits) - 1],
        })
    }

    protected override makeXRay(scale: number): XRay | undefined {
        const bits = this.numBits

        const { xray, wire, gate } = this.parent.editor.newXRay(this)
        const { ins, outs, x, y, later } = this.makeXRayNodes<AdderArray>(xray, scale)

        const vGridStepSpacing = bits < 16 ? 11 : 12
        const yFirstAdder = -(bits - 1) / 2 * vGridStepSpacing
        const addersX = bits <= 2 ? 0
            : bits <= 4 ? GRID_STEP / 2
                : bits <= 8 ? GRID_STEP
                    : 3.5 * GRID_STEP

        // output line coords
        const numOutLines = bits / 2
        const outLineLeft = numOutLines === 1 ? x.right - GRID_STEP / 2 : addersX + 3.5 * GRID_STEP
        const outLineSpacing = (x.right - outLineLeft) / numOutLines

        const adders = ArrayFillUsing(i => {
            const y = (yFirstAdder + i * vGridStepSpacing) * GRID_STEP
            const adder = AdderDef.makeSpawned<Adder>(xray, `adder${i}`, addersX, y)
            // output line
            const outLineIndex = Math.floor(Math.abs(i - ((bits - 1) / 2)))
            const outLineX = outLineLeft + outLineIndex * outLineSpacing
            wire(adder.outputs.S, outs.S[i], "vh", [outLineX, adder.outputs.S.posY])
            return adder
        }, bits)

        // input line coords
        const inLineRight = addersX - 3.5 * GRID_STEP
        const numLeftLines = bits + bits / 2 // half are never in visual conflict
        const inLineSpacing = (inLineRight - x(-.95)) / (numLeftLines - 1)

        // first, connect the non-visually-conflicting inputs (the "outer" ones)
        const lastIndex = bits - 1
        for (let i = 0; i < bits / 2; i++) {
            const outLineX = inLineRight - i * inLineSpacing
            wire(ins.A[i], adders[i].inputs.A, "vh", [outLineX, ins.A[i].posY])
            wire(ins.B[lastIndex - i], adders[lastIndex - i].inputs.B, "vh", [outLineX, ins.B[lastIndex - i].posY])
        }
        // then connect the visually-conflicting inputs for the top half
        for (let i = 0; i < bits / 2; i++) {
            const inLineIndex = numLeftLines - 1 - 2 * i
            const outLineX = inLineRight - inLineIndex * inLineSpacing
            wire(ins.B[i], adders[i].inputs.B, "vh", [outLineX, ins.B[i].posY])
        }
        // then bottom half
        for (let i = bits / 2; i < bits; i++) {
            const inLineIndex = bits / 2 + (i - bits / 2) * 2
            const outLineX = inLineRight - inLineIndex * inLineSpacing
            wire(ins.A[i], adders[i].inputs.A, "vh", [outLineX, ins.A[i].posY])
        }

        wire(ins.Cin, adders[0].inputs.Cin, "vh", [addersX, y.top + GRID_STEP])
        for (let i = 1; i < bits; i++) {
            wire(adders[i - 1].outputs.Cout, adders[i].inputs.Cin)
        }

        const lastCout = adders[bits - 1].outputs.Cout
        const lastCoutY = lastCout.posY
        const lastButOneCout = adders[bits - 2].outputs.Cout
        const lastButOneCoutY = lastButOneCout.posY
        wire(lastCout, outs.Cout, "hv", [addersX, y.bottom - GRID_STEP])

        const xorV = gate("xorV", "xor", later, y.bottom - 3 * GRID_STEP, "s")

        wire(xorV, outs.V, false)
        wire(lastCout, xorV.in[1], "hv", [addersX, lastCoutY + (xorV.in[1].posY - lastCoutY) / 2, true])
        wire(lastButOneCout, xorV.in[0], "hv", [addersX, lastButOneCoutY + (adders[bits - 1].inputs.Cin.posY - lastButOneCoutY) / 2, true])


        return xray
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        return [
            this.makeChangeParamsContextMenuItem("inputs", S.Components.Generic.contextMenu.ParamNumBits, this.numBits, "bits"),
            ...this.makeForceOutputsContextMenuItem(true),
        ]
    }

}
AdderArrayDef.impl = AdderArray
