import * as t from "io-ts"
import { COLOR_COMPONENT_BORDER, COLOR_UNKNOWN, GRID_STEP, circle, colorForLogicValue, useCompact } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillWith, LogicValue, Unknown, isHighImpedance, isUnknown, typeOrUndefined } from "../utils"
import { ParametrizedComponentBase, Repr, ResolvedParams, defineParametrizedComponent, groupVertical, param, paramBool } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuItems } from "./Drawable"


export const ControlledInverterDef =
    defineParametrizedComponent("cnot-array", true, true, {
        variantName: ({ bits, bottom }) => `cnot-array-${bits}${bottom ? "b" : ""}`,
        idPrefix: "cnot",
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
        size: ({ numBits }) => ({
            gridWidth: 4,
            gridHeight: 8 + Math.max(0, numBits - 8),
        }),
        makeNodes: ({ numBits, controlPinsAtBottom, gridHeight, isXRay }) => {
            const outX = isXRay ? 2.5 : 3
            return {
                ins: {
                    In: groupVertical("w", -outX, 0, numBits),
                    S: [0,
                        -(gridHeight / 2 + 1) * (controlPinsAtBottom ? -1 : 1),
                        controlPinsAtBottom ? "s" : "n",
                    ],
                },
                outs: {
                    Out: groupVertical("e", outX, 0, numBits),
                },
            }
        },
        initialValue: (saved, { numBits }) => ArrayFillWith<LogicValue>(false, numBits),
    })


export type ControlledInverterRepr = Repr<typeof ControlledInverterDef>
export type ControlledInverterParams = ResolvedParams<typeof ControlledInverterDef>


export class ControlledInverter extends ParametrizedComponentBase<ControlledInverterRepr> {

    public readonly numBits: number
    public readonly controlPinsAtBottom: boolean

    public constructor(parent: DrawableParent, params: ControlledInverterParams, saved?: ControlledInverterRepr) {
        super(parent, ControlledInverterDef.with(params), saved)
        this.numBits = params.numBits
        this.controlPinsAtBottom = params.controlPinsAtBottom
    }

    public toJSON() {
        return {
            ...this.toJSONBase(),
            bits: this.numBits === ControlledInverterDef.aults.bits ? undefined : this.numBits,
            bottom: this.controlPinsAtBottom === ControlledInverterDef.aults.bottom ? undefined : this.controlPinsAtBottom,
        }
    }

    public override makeTooltip() {
        const s = S.Components.ControlledInverter.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc)
        ))
    }

    protected doRecalcValue(): LogicValue[] {
        const input = this.inputValues(this.inputs.In)
        const switch_ = this.inputs.S.value

        if (isUnknown(switch_) || isHighImpedance(switch_)) {
            return ArrayFillWith(Unknown, this.numBits)
        }

        if (!switch_) {
            return input
        }

        return input.map(LogicValue.invert)
    }

    protected override propagateValue(newValue: LogicValue[]) {
        this.outputValues(this.outputs.Out, newValue)
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, {
            skipLabels: true,
            drawInside: ({ top, bottom, left, right }) => {
                const invert = this.inputs.S.value

                g.lineWidth = 2
                g.strokeStyle = colorForLogicValue(invert)
                g.beginPath()
                if (this.controlPinsAtBottom) {
                    g.moveTo(this.posX, bottom)
                    g.lineTo(this.posX, this.posY + 4)
                } else {
                    g.moveTo(this.posX, top)
                    g.lineTo(this.posX, this.posY - 4)
                }
                g.stroke()

                g.strokeStyle = invert === true ? COLOR_COMPONENT_BORDER : COLOR_UNKNOWN
                g.beginPath()
                g.moveTo(left + 12, this.posY - 8)
                g.lineTo(right - 13, this.posY)
                g.lineTo(left + 12, this.posY + 8)
                g.closePath()
                g.stroke()
                g.beginPath()
                circle(g, right - 10, this.posY, 5)
                g.stroke()
            },
        })
    }

    protected override xrayScale() {
        return useCompact(this.numBits) ? 0.18 : 0.36
    }

    protected override makeXRay(level: number, scale: number, link: boolean) {
        const { xray, wire, gate } = this.parent.editor.newXRay(this, level, scale)
        const { ins, outs, p } = this.makeXRayNodes(xray, link)

        const bits = this.numBits

        const xIn = p.x(-0.95)
        const xorInDist = (useCompact(bits) ? 2 : 1) * GRID_STEP
        const xorInTop = bits < 4 ? p.y(-0.7)
            : p.top - (useCompact(bits) ? 1.5 : 1) / scale
        for (let i = bits - 1; i >= 0; i--) {
            const xor = gate(`xor${i}`, "xor", 0, p.later)
            wire(xor, outs.Out[i], false)
            wire(ins.In[i], xor.in[1], "hv", [xIn, xor.in[1]])
            wire(ins.S, xor.in[0], "hv", [
                [0, xorInTop],
                [xor.in[0].posX - xorInDist, xor.in[0]],
            ])
        }

        return xray
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

ControlledInverterDef.impl = ControlledInverter
