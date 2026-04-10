import * as t from "io-ts"
import { COLOR_COMPONENT_BORDER, GRID_STEP, TextVAlign, displayValuesFromArray, fillTextVAlign } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillWith, LogicValue, Unknown, isUnknown, typeOrUndefined } from "../utils"
import { ParametrizedComponentBase, Repr, ResolvedParams, defineParametrizedComponent, groupVertical, param } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuData, MenuItems } from "./Drawable"


export const DecoderDef =
    defineParametrizedComponent("dec", true, true, {
        variantName: ({ bits }) => `dec-${bits}`,
        idPrefix: "dec",
        button: { imgWidth: 50 },
        repr: {
            bits: typeOrUndefined(t.number),
        },
        valueDefaults: {},
        params: {
            bits: param(2, [2, 3, 4, 5]),
        },
        validateParams: ({ bits }) => ({
            numFrom: bits,
            numTo: 2 ** bits,
        }),
        size: ({ numTo }) => ({
            gridWidth: 4,
            gridHeight: Math.max(8, 1 + numTo),
        }),
        makeNodes: ({ numFrom, numTo }) => ({
            ins: {
                In: groupVertical("w", -3, 0, numFrom),
            },
            outs: {
                Out: groupVertical("e", 3, 0, numTo),
            },
        }),
        initialValue: (saved, { numTo }) => ArrayFillWith<LogicValue>(false, numTo),
    })

export type DecoderRepr = Repr<typeof DecoderDef>
export type DecoderParams = ResolvedParams<typeof DecoderDef>

export class Decoder extends ParametrizedComponentBase<DecoderRepr> {

    public readonly numFrom: number
    public readonly numTo: number

    public constructor(parent: DrawableParent, params: DecoderParams, saved?: DecoderRepr) {
        super(parent, DecoderDef.with(params), saved)
        this.numFrom = params.numFrom
        this.numTo = params.numTo
    }

    public toJSON() {
        return {
            ...this.toJSONBase(),
            bits: this.numFrom === DecoderDef.aults.bits ? undefined : this.numFrom,
        }
    }

    public override makeTooltip() {
        const s = S.Components.Decoder.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc.expand({ numFrom: this.numFrom, numTo: this.numTo, n: this.currentAddr() }))
        ))
    }

    public currentAddr() {
        const addrArr = this.inputValues(this.inputs.In)
        return displayValuesFromArray(addrArr, false)[1]
    }

    protected doRecalcValue(): LogicValue[] {
        const addr = this.currentAddr()
        if (isUnknown(addr)) {
            return ArrayFillWith<LogicValue>(Unknown, this.numTo)
        }

        const output = ArrayFillWith<LogicValue>(false, this.numTo)
        output[addr] = true
        return output
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, {
            skipLabels: true,
            drawLabels: () => {
                g.font = `bold 14px sans-serif`
                g.fillStyle = COLOR_COMPONENT_BORDER
                g.textAlign = "center"
                fillTextVAlign(g, TextVAlign.middle, "Dec.", this.posX, this.posY)
            },
        })
    }

    protected override xrayScale() {
        return [0.25, 0.18, 0.10, 0.10][this.numFrom - 2]
    }

    protected override makeXRay(level: number, scale: number, link: boolean) {
        const numBits = this.numFrom
        if (numBits > 5) {
            return
        }

        const { xray, wire, gate } = this.parent.editor.newXRay(this, level, scale)
        const { ins, outs, p } = this.makeXRayNodes(xray, link)

        const addSpace = numBits > 3 ? 20 : 0
        const xPosNot = p.left + 3 * GRID_STEP + addSpace
        const xPosAnd = p.right - 2 * GRID_STEP - addSpace
        const xPosWireBranchLeftmost = xPosNot + 3.5 * GRID_STEP + addSpace
        const xPosWireBranchRightmost = xPosAnd - 3 * GRID_STEP - addSpace
        const wireStep = (xPosWireBranchRightmost - xPosWireBranchLeftmost) / (2 * numBits - 1)

        const inNots = ins.In.map((in_, i) => {
            const not = gate(`not${i}`, "not", xPosNot, p.later)
            wire(in_, not, true)
            not.setPosition(not.posX, not.posY - 3.3 * GRID_STEP, false) // grid factor set to mostly avoid touching other wires visually
            return not
        })

        outs.Out.forEach((out, i) => {
            const and = gate(`and${i}`, "and", xPosAnd, p.later, "e", numBits)
            wire(and, out, false)

            for (let j = 0; j < numBits; j++) {
                const invert = (i & (1 << j)) === 0
                const sourceNode = invert ? inNots[j].outputs.Out : ins.In[j]
                const targetNode = and.inputs.In[j]
                const colIndex = (Number(!invert) * numBits + j) // first all 0s, then all 1s
                const xPosBranch = xPosWireBranchLeftmost + colIndex * wireStep
                wire(sourceNode, targetNode, "hv", [xPosBranch, targetNode])
            }
        })

        return xray
    }

    protected override propagateValue(newValue: LogicValue[]) {
        this.outputValues(this.outputs.Out, newValue)
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.Generic.contextMenu
        return [
            this.makeChangeParamsContextMenuItem("outputs", s.ParamNumBits, this.numFrom, "bits"),
            ["mid", MenuData.sep()],
            ...this.makeForceOutputsContextMenuItem(),
        ]
    }

}
DecoderDef.impl = Decoder
