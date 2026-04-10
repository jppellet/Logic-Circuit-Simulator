import { COLOR_COMPONENT_BORDER, GRID_STEP, TextVAlign, fillTextVAlign } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { LogicValue, Unknown, isHighImpedance, isUnknown } from "../utils"
import { ComponentBase, Repr, defineComponent } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuItems } from "./Drawable"

export const ComparatorDef =
    defineComponent("comp", true, true, {
        idPrefix: "comp",
        button: { imgWidth: 50 },
        valueDefaults: {},
        size: () => ({ gridWidth: 5, gridHeight: 7 }),
        makeNodes: () => ({
            ins: {
                A: [-4, -2, "w", "A", { hasTriangle: true }],
                B: [-4, 2, "w", "B", { hasTriangle: true }],
                E: [0, 5, "s", "E", { hasTriangle: true }],
            },
            outs: {
                G: [4, 0, "e", ">", { hasTriangle: true, labelName: ">" }],
                Eq: [0, -5, "n", "=", { hasTriangle: true, labelName: "=" }],
            },
        }),
        initialValue: () => ({
            g: false as LogicValue,
            eq: false as LogicValue,
        }),
    })

type ComparatorRepr = Repr<typeof ComparatorDef>

export class Comparator extends ComponentBase<ComparatorRepr> {

    public constructor(parent: DrawableParent, saved?: ComparatorRepr) {
        super(parent, ComparatorDef.from(parent), saved)
    }

    public toJSON() {
        return this.toJSONBase()
    }

    public override makeTooltip() {
        const s = S.Components.Comparator.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc),
        ))
    }

    protected doRecalcValue() {
        const a = this.inputs.A.value
        const b = this.inputs.B.value
        const e = this.inputs.E.value

        if (isUnknown(a) || isUnknown(b) || isUnknown(e) || isHighImpedance(a) || isHighImpedance(b) || isHighImpedance(e)) {
            return { g: Unknown, eq: Unknown }
        }

        if ((+e) === 0) {
            return { g: false, eq: false }
        }

        const g = ((+a) > (+b))
        const eq = ((+a) === (+b))

        return { g, eq }
    }

    protected override propagateValue(newValue: { g: LogicValue, eq: LogicValue }) {
        this.outputs.G.value = newValue.g
        this.outputs.Eq.value = newValue.eq
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, {
            drawLabels: () => {
                g.fillStyle = COLOR_COMPONENT_BORDER
                g.font = "bold 11px sans-serif"
                g.textAlign = "center"
                fillTextVAlign(g, TextVAlign.middle, "CMP", this.posX, this.posY)
            },
        })
    }

    protected override xrayScale() {
        return 0.25
    }

    protected override makeXRay(level: number, scale: number, link: boolean) {
        const { xray, gate, wire } = this.parent.editor.newXRay(this, level, scale)
        const { ins, outs, p } = this.makeXRayNodes(xray, link)

        const andEq = gate("andEq", "and", p.later, p.top + 2.5 * GRID_STEP, "n")
        const andG = gate("andG", "and", p.right - 2.5 * GRID_STEP, p.later, "e", 3)
        const xnor = gate("xnor", "xnor", p.left + 4.5 * GRID_STEP, p.later)
        const notB = gate("notB", "not", p.left + 4.5 * GRID_STEP, p.later)

        wire(andEq, outs.Eq, false)
        wire(andG, outs.G, false)

        wire(notB, andG.in[1], false)

        wire(ins.B, xnor.in[1], true)
        wire(ins.A, andG.in[0], "vh", [-3 * GRID_STEP, ins.A])
        wire(ins.A, xnor.in[0], "vh", [p.left + 1.25 * GRID_STEP, ins.A])
        wire(ins.B, notB, "vh", [p.left + GRID_STEP / 2, ins.B])

        wire(xnor, andEq.in[0], "hv")
        wire(ins.E, andG.in[2], "vh", [andEq.in[1], andG.in[2]])
        wire(ins.E, andEq.in[1], "vh", [andEq.in[1], andG.in[2]])

        return xray
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        return this.makeForceOutputsContextMenuItem()
    }

}
ComparatorDef.impl = Comparator
