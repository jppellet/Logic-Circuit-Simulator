import { COLOR_COMPONENT_BORDER, TextVAlign, fillTextVAlign } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { LogicValue, Unknown, isHighImpedance, isUnknown } from "../utils"
import { ComponentBase, Repr, defineComponent, shiftWhenVertical } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuItems } from "./Drawable"


export const HalfAdderDef =
    defineComponent("halfadder", true, true, {
        idPrefix: "hadder",
        button: { imgWidth: 50 },
        valueDefaults: {},
        size: () => ({ gridWidth: 4, gridHeight: 6 }),
        makeNodes: ({ isXRay }) => {
            const outX = isXRay ? 3 : 4
            const s = S.Components.Generic
            return {
                ins: {
                    A: [-outX, -2, "w", "A", { hasTriangle: true }],
                    B: [-outX, 2, "w", "B", { hasTriangle: true }],
                },
                outs: {
                    S: [outX, -2, "e", s.OutputSumDesc, { hasTriangle: true }],
                    Cout: [outX, 2, "e", s.OutputCarryDesc, { hasTriangle: true, labelOffset: shiftWhenVertical(4, 0) }],
                },
            }
        },
        initialValue: () => ({ s: false as LogicValue, c: false as LogicValue }),
    })

type HalfAdderRepr = Repr<typeof HalfAdderDef>

export class HalfAdder extends ComponentBase<HalfAdderRepr> {

    public constructor(parent: DrawableParent, saved?: HalfAdderRepr) {
        super(parent, HalfAdderDef.from(parent), saved)
    }

    public toJSON() {
        return this.toJSONBase()
    }

    public override makeTooltip() {
        const s = S.Components.HalfAdder.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc)
        ))
    }

    protected doRecalcValue() {
        const a = this.inputs.A.value
        const b = this.inputs.B.value

        if (isUnknown(a) || isUnknown(b) || isHighImpedance(a) || isHighImpedance(b)) {
            return { s: Unknown, c: Unknown }
        }

        const sum = (+a) + (+b)
        switch (sum) {
            case 0: return { s: false, c: false }
            case 1: return { s: true, c: false }
            case 2: return { s: false, c: true }
            default:
                console.log("ERROR: sum of halfadder is > 2")
                return { s: false, c: false }
        }
    }

    protected override propagateValue(newValue: { s: LogicValue, c: LogicValue }) {
        this.outputs.S.value = newValue.s
        this.outputs.Cout.value = newValue.c
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, {
            drawLabels: () => {
                g.fillStyle = COLOR_COMPONENT_BORDER
                g.font = "26px sans-serif"
                g.textAlign = "center"
                fillTextVAlign(g, TextVAlign.middle, "+", this.posX, this.posY - 2)
            },
        })
    }

    protected override xrayScale() {
        return 0.40
    }

    protected override makeXRay(level: number, scale: number, link: boolean) {
        const { xray, wire, gate } = this.parent.editor.newXRay(this, level, scale)
        const { ins, outs, p } = this.makeXRayNodes(xray, link)

        const xor = gate("xor", "xor", p.x(0.3), p.later)
        const and = gate("and", "and", p.x(0.3), p.later)

        wire(ins.B, and.in[1], true)
        wire(ins.A, xor.in[0], true)
        wire(ins.A, and.in[0], "vh", [p.x(-0.7), ins.A])
        wire(ins.B, xor.in[1], "vh", [p.x(-0.4), ins.B])
        wire(and, outs.Cout, "vh")
        wire(xor, outs.S, "vh")

        return xray
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        return this.makeForceOutputsContextMenuItem()
    }

}
HalfAdderDef.impl = HalfAdder
