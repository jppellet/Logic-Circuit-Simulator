import * as t from "io-ts"
import { GRID_STEP, NodeStyle, drawWaypoint, strokeWireOutlineAndSingleValue } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillWith, LogicValue, Unknown, isHighImpedance, isUnknown, typeOrUndefined } from "../utils"
import { ParametrizedComponentBase, Repr, ResolvedParams, defineParametrizedComponent, groupVertical, param, paramBool } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuItems, PointerOverMode } from "./Drawable"


export const BypassDef =
    defineParametrizedComponent("bypass", true, true, {
        variantName: ({ bits, bottom }) => `bypass-${bits}${bottom ? "b" : ""}`,
        idPrefix: "bypass",
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
            const controlX = -(gridHeight / 2 + 1) * (controlPinsAtBottom ? -1 : 1)
            const controlOrient = controlPinsAtBottom ? "s" : "n"
            return {
                ins: {
                    In: groupVertical("w", -outX, 0, numBits),
                    F: [-1, controlX, controlOrient],
                    V: [1, controlX, controlOrient],
                },
                outs: {
                    Out: groupVertical("e", outX, 0, numBits),
                },
            }
        },
        initialValue: (saved, { numBits }) => ArrayFillWith<LogicValue>(false, numBits),
    })


export type BypassRepr = Repr<typeof BypassDef>
export type BypassParams = ResolvedParams<typeof BypassDef>


export class Bypass extends ParametrizedComponentBase<BypassRepr> {

    public readonly numBits: number
    public readonly controlPinsAtBottom: boolean

    public constructor(parent: DrawableParent, params: BypassParams, saved?: BypassRepr) {
        super(parent, BypassDef.with(params), saved)
        this.numBits = params.numBits
        this.controlPinsAtBottom = params.controlPinsAtBottom
    }

    public toJSON() {
        return {
            ...this.toJSONBase(),
            bits: this.numBits === BypassDef.aults.bits ? undefined : this.numBits,
            bottom: this.controlPinsAtBottom === BypassDef.aults.bottom ? undefined : this.controlPinsAtBottom,
        }
    }

    public override makeTooltip() {
        const s = S.Components.Bypass.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc)
        ))
    }

    protected doRecalcValue(): LogicValue[] {
        const f = this.inputs.F.value
        if (isUnknown(f) || isHighImpedance(f)) {
            return ArrayFillWith(Unknown, this.numBits)
        }

        if (!f) {
            return this.inputValues(this.inputs.In)
        }

        return ArrayFillWith(this.inputs.V.value, this.numBits)
    }

    protected override propagateValue(newValue: LogicValue[]) {
        this.outputValues(this.outputs.Out, newValue)
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, {
            drawInside: ({ top, bottom, left, right }) => {
                const f = this.inputs.F.value
                if (!isUnknown(f) && !isHighImpedance(f)) {
                    const atBottom = this.controlPinsAtBottom
                    const options = this.parent.editor.options
                    const neutral = options.hideWireColors
                    const timeFraction = ctx.drawParams.drawTimeAnimationFraction
                    const valueX = this.inputs.V.posXInParentTransform
                    const v = this.inputs.V.value

                    for (let i = 0; i < this.numBits; i++) {
                        g.beginPath()
                        const in_ = this.inputs.In[i]
                        const toNode = this.outputs.Out[i]
                        const toY = toNode.posYInParentTransform

                        let value: LogicValue
                        if (!f) {
                            // straight wires
                            const fromY = in_.posYInParentTransform
                            g.moveTo(left + 1, fromY)
                            g.lineTo(right - 1, toY)
                            value = in_.value
                        } else {
                            // bypass
                            g.moveTo(valueX, atBottom ? bottom - 1 : top + 1)
                            g.lineTo(valueX, toY)
                            g.lineTo(right - 1, toY)
                            value = v
                        }
                        strokeWireOutlineAndSingleValue(g, value, toNode.color, neutral, timeFraction, 0)
                    }

                    if (f) {
                        for (let i = (atBottom ? 1 : 0); i < this.numBits - (atBottom ? 0 : 1); i++) {
                            drawWaypoint(g, valueX, this.outputs.Out[i].posYInParentTransform, NodeStyle.BRANCH_POINT, v, PointerOverMode.None, neutral, false, false)
                        }
                    }
                }
            },
        })
    }

    protected override xrayScale() {
        return this.numBits >= 8 ? 0.16 : 0.22
    }

    protected override makeXRay(level: number, scale: number, link: boolean) {
        const { xray, wire, gate } = this.parent.editor.newXRay(this, level, scale)
        const { ins, outs, p } = this.makeXRayNodes(xray, link)

        const bits = this.numBits

        const notF = gate("notF", "not", p.later, p.top + 3 * GRID_STEP, "s")
        wire(ins.F, notF, true)

        const andV = gate("andV", "and", notF.posX + 6 * GRID_STEP, p.top + 3 * GRID_STEP, "s")
        wire(ins.V, andV.in[0], "vh")
        wire(ins.F, andV.in[1], "vh")

        const mainOffsetY = notF.outputs.Out.posY + 1 * GRID_STEP
        const mainHeight = p.bottom - mainOffsetY

        const n = (bits - 1) * 2 + 3
        const spacing = mainHeight / n
        const firstAndGateY = mainOffsetY + spacing + 2 * GRID_STEP
        const andGateSpacing = spacing * 2

        const ands = []
        const ors = []
        const andPosX = notF.outputs.Out.posX + GRID_STEP * 3
        for (let i = 0; i < bits; i++) {
            const andIn = gate(`andIn${i}`, "and", andPosX, firstAndGateY + i * andGateSpacing)
            wire(notF, andIn.in[0], "vh")
            ands.push(andIn)

            const or = gate(`or${i}`, "or", andPosX + GRID_STEP * 6, p.later)
            wire(andIn, or.in[1], true)
            wire(andV, or.in[0], "vh")
            ors.push(or)
        }

        xray.wires(ins.In, ands.map(and => and.in[1]), {
            position: { left: p.left + 2, right: ins.F.posX - 2 * GRID_STEP },
        })
        xray.wires(ors.map(or => or.outputs.Out), outs.Out, {
            position: { right: p.right },
        })

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

BypassDef.impl = Bypass
