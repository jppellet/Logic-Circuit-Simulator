import * as t from "io-ts"
import { COLOR_COMPONENT_BORDER, GRID_STEP, TextVAlign, fillTextVAlign } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillUsing, ArrayFillWith, LogicValue, typeOrUndefined } from "../utils"
import { Adder, AdderDef } from "./Adder"
import { ALUDef, doALUAdd } from "./ALU"
import { Component, ParametrizedComponentBase, Repr, ResolvedParams, Value, defineParametrizedComponent, groupVertical, param, shiftWhenHorizontal } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuItems } from "./Drawable"
import { NodeIn, NodeOut } from "./Node"
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
        makeNodes: ({ numBits, gridHeight, isXRay }) => {
            const inputCenterY = 5 + Math.max(0, (numBits - 8) / 2)
            const coutY = Math.floor(gridHeight / 2) + 1
            const outX = isXRay ? 2.5 : 3

            return {
                ins: {
                    A: groupVertical("w", -outX, -inputCenterY, numBits),
                    B: groupVertical("w", -outX, inputCenterY, numBits),
                    Cin: [0, -coutY, "n"],
                },
                outs: {
                    S: groupVertical("e", outX, 0, numBits),
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
            xrayScale: getXRayArrayScale(this.numBits),
        })
    }

    protected override makeXRay(scale: number): XRay | undefined {
        const bits = this.numBits

        const { xray, wire, gate } = this.parent.editor.newXRay(this)
        const { ins, outs, x, y, later } = this.makeXRayNodes<AdderArray>(xray, scale)

        const [addersX, adders] = xrayWireAndLayoutAsArray<Adder>(
            xray, bits, ins, outs, x, 3.5,
            (i, x, y) => AdderDef.makeSpawned(xray, `adder${i}`, x, y),
            comp => comp.inputs.A,
            comp => comp.inputs.B,
            comp => comp.outputs.S,
        )

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


export function xrayWireAndLayoutAsArray<C extends Component>(
    xray: XRay,
    bits: number,
    ins: { A: NodeOut[]; B: NodeOut[] },
    outs: { S: NodeIn[] },
    x: ((f: number) => number) & { left: number, right: number },
    compNodeGridDist: number,
    makeComp: (i: number, x: number, y: number) => C,
    getCompInputTop: (c: C) => NodeIn,
    getCompInputBottom: (c: C) => NodeIn,
    getCompOutput: (c: C) => NodeOut,
): [number, C[]] {

    const vGridStepSpacing = bits < 16 ? 11 : 12
    const yFirstComp = -(bits - 1) / 2 * vGridStepSpacing
    const compX = bits <= 2 ? 0
        : bits <= 4 ? GRID_STEP / 2
            : bits <= 8 ? GRID_STEP
                : 3.5 * GRID_STEP

    // output line coords
    const numOutLines = bits / 2
    const outLineLeft = numOutLines === 1 ? x.right - GRID_STEP / 2
        : compX + compNodeGridDist * GRID_STEP
    const outLineSpacing = (x.right - outLineLeft) / numOutLines

    const comps = ArrayFillUsing(i => {
        const y = (yFirstComp + i * vGridStepSpacing) * GRID_STEP
        const comp = makeComp(i, compX, y)

        // output line
        const outLineIndex = Math.floor(Math.abs(i - ((bits - 1) / 2)))
        const outLineX = outLineLeft + outLineIndex * outLineSpacing
        const compOutput = getCompOutput(comp)
        xray.wire(compOutput, outs.S[i], "vh", [outLineX, compOutput.posY])
        return comp
    }, bits)

    // input line coords
    const inLineRight = compX - compNodeGridDist * GRID_STEP
    const numLeftLines = bits + bits / 2 // half are never in visual conflict
    const inLineSpacing = (inLineRight - x(-.95)) / (numLeftLines - 1)

    // first, connect the non-visually-conflicting inputs (the "outer" ones)
    const lastIndex = bits - 1
    for (let i = 0; i < bits / 2; i++) {
        const outLineX = inLineRight - i * inLineSpacing
        xray.wire(ins.A[i], getCompInputTop(comps[i]), "vh", [outLineX, ins.A[i].posY])
        xray.wire(ins.B[lastIndex - i], getCompInputBottom(comps[lastIndex - i]), "vh", [outLineX, ins.B[lastIndex - i].posY])
    }
    // then connect the visually-conflicting inputs for the top half
    for (let i = 0; i < bits / 2; i++) {
        const inLineIndex = numLeftLines - 1 - 2 * i
        const outLineX = inLineRight - inLineIndex * inLineSpacing
        xray.wire(ins.B[i], getCompInputBottom(comps[i]), "vh", [outLineX, ins.B[i].posY])
    }
    // then bottom half
    for (let i = bits / 2; i < bits; i++) {
        const inLineIndex = bits / 2 + (i - bits / 2) * 2
        const outLineX = inLineRight - inLineIndex * inLineSpacing
        xray.wire(ins.A[i], getCompInputTop(comps[i]), "vh", [outLineX, ins.A[i].posY])
    }

    return [compX, comps]
}

export function getXRayArrayScale(bits: number) {
    return [0.32, 0.3, 0.20, 0.15][Math.log2(bits) - 1]
}
