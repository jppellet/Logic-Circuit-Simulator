import * as t from "io-ts"
import { COLOR_COMPONENT_BORDER, colorForLogicValue } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillWith, HighImpedance, LogicValue, Unknown, isHighImpedance, isUnknown, typeOrUndefined } from "../utils"
import { ParametrizedComponentBase, Repr, ResolvedParams, defineParametrizedComponent, groupVertical, param, paramBool } from "./Component"
import { ControlledInverterDef } from "./ControlledInverter"
import { DrawContext, DrawableParent, GraphicsRendering, MenuItems } from "./Drawable"


export const TristateBufferArrayDef =
    defineParametrizedComponent("tristate-array", true, true, {
        variantName: ({ bits, bottom }) => `tristate-array-${bits}${bottom ? "b" : ""}`,
        idPrefix: "tristate",
        button: { imgWidth: 50 },
        repr: {
            bits: typeOrUndefined(t.number),
            bottom: typeOrUndefined(t.boolean),
        },
        valueDefaults: {},
        params: {
            bits: param(4, [2, 4, 8, 16]),
            bottom: paramBool(),
        },
        validateParams: ({ bits, bottom }) => ({
            numBits: bits,
            controlPinsAtBottom: bottom,
        }),
        size: ControlledInverterDef.size,
        makeNodes: ({ numBits, controlPinsAtBottom, gridHeight }) => ({
            ins: {
                In: groupVertical("w", -3, 0, numBits),
                E: [0,
                    -(gridHeight / 2 + 1) * (controlPinsAtBottom ? -1 : 1),
                    controlPinsAtBottom ? "s" : "n",
                    "E (Enable)",
                ],
            },
            outs: {
                Out: groupVertical("e", 3, 0, numBits),
            },
        }),
        initialValue: (saved, { numBits }) => ArrayFillWith<LogicValue>(HighImpedance, numBits),
    })


export type TristateBufferArrayRepr = Repr<typeof TristateBufferArrayDef>
export type TristateBufferArrayParams = ResolvedParams<typeof TristateBufferArrayDef>

export class TristateBufferArray extends ParametrizedComponentBase<TristateBufferArrayRepr> {

    public readonly numBits: number
    public readonly controlPinsAtBottom: boolean

    public constructor(parent: DrawableParent, params: TristateBufferArrayParams, saved?: TristateBufferArrayRepr) {
        super(parent, TristateBufferArrayDef.with(params), saved)
        this.numBits = params.numBits
        this.controlPinsAtBottom = params.controlPinsAtBottom
    }

    public toJSON() {
        return {
            ...this.toJSONBase(),
            bits: this.numBits === TristateBufferArrayDef.aults.bits ? undefined : this.numBits,
            bottom: this.controlPinsAtBottom === TristateBufferArrayDef.aults.bottom ? undefined : this.controlPinsAtBottom,
        }
    }

    public override makeTooltip() {
        const s = S.Components.TristateBufferArray.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc)
        ))
    }

    protected doRecalcValue(): LogicValue[] {
        const enable = this.inputs.E.value

        if (isUnknown(enable) || isHighImpedance(enable)) {
            return ArrayFillWith(Unknown, this.numBits)
        }

        if (!enable) {
            return ArrayFillWith(HighImpedance, this.numBits)
        }

        return this.inputValues(this.inputs.In)
    }

    protected override propagateValue(newValue: LogicValue[]) {
        this.outputValues(this.outputs.Out, newValue)
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, {
            skipLabels: true,
            drawInside: ({ top, bottom, left, right }) => {
                const enable = this.inputs.E.value

                g.lineWidth = 2
                g.strokeStyle = colorForLogicValue(enable)
                g.beginPath()
                if (this.controlPinsAtBottom) {
                    g.moveTo(this.posX, bottom)
                    g.lineTo(this.posX, this.posY + 4)
                } else {
                    g.moveTo(this.posX, top)
                    g.lineTo(this.posX, this.posY - 4)
                }
                g.stroke()

                g.strokeStyle = COLOR_COMPONENT_BORDER
                g.beginPath()
                g.moveTo(left + 12, this.posY - 8)
                g.lineTo(right - 13, this.posY)
                g.lineTo(left + 12, this.posY + 8)
                g.closePath()
                g.stroke()
            },
        })
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.Generic.contextMenu
        return [
            this.makeChangeParamsContextMenuItem("inputs", s.ParamNumBits, this.numBits, "bits"),
            this.makeChangeBooleanParamsContextMenuItem(s.ParamControlBitAtBottom, this.controlPinsAtBottom, "bottom"),
            ...this.makeForceOutputsContextMenuItem(true),
        ]
    }

}
TristateBufferArrayDef.impl = TristateBufferArray
