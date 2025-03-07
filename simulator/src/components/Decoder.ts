import * as t from "io-ts"
import { COLOR_COMPONENT_BORDER, TextVAlign, displayValuesFromArray, fillTextVAlign } from "../drawutils"
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
