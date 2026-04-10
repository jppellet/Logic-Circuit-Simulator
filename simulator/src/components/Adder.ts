import { COLOR_COMPONENT_BORDER, GRID_STEP, TextVAlign, fillTextVAlign } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { LogicValue, Unknown, isHighImpedance, isUnknown } from "../utils"
import { ComponentBase, Repr, defineComponent } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuItems } from "./Drawable"

export const AdderDef =
    defineComponent("adder", true, true, {
        idPrefix: "adder",
        button: { imgWidth: 50 },
        valueDefaults: {},
        size: () => ({ gridWidth: 5, gridHeight: 7 }),
        makeNodes: ({ isXRay }) => {
            const s = S.Components.Generic
            const yDist = isXRay ? 4 : 5
            const xDist = isXRay ? 3.5 : 4
            return {
                ins: {
                    A: [-xDist, -2, "w", "A", { hasTriangle: true }],
                    B: [-xDist, 2, "w", "B", { hasTriangle: true }],
                    Cin: [0, -yDist, "n", s.InputCarryInDesc, { hasTriangle: true }],
                },
                outs: {
                    S: [xDist, 0, "e", s.OutputSumDesc, { hasTriangle: true }],
                    Cout: [0, yDist, "s", s.OutputCarryOutDesc, { hasTriangle: !isXRay }],
                },
            }
        },
        initialValue: () => ({ s: false as LogicValue, cout: false as LogicValue }),
    })

type AdderRepr = Repr<typeof AdderDef>

export class Adder extends ComponentBase<AdderRepr> {

    public constructor(parent: DrawableParent, saved?: AdderRepr) {
        super(parent, AdderDef.from(parent), saved)
    }

    public toJSON() {
        return this.toJSONBase()
    }

    public override makeTooltip() {
        const s = S.Components.Adder.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc),
        ))
    }

    protected doRecalcValue() {
        const a = this.inputs.A.value
        const b = this.inputs.B.value
        const cIn = this.inputs.Cin.value

        if (isUnknown(a) || isUnknown(b) || isUnknown(cIn) || isHighImpedance(a) || isHighImpedance(b) || isHighImpedance(cIn)) {
            return { s: Unknown, cout: Unknown }
        }

        const sum = (+a) + (+b) + (+cIn)
        switch (sum) {
            case 0: return { s: false, cout: false }
            case 1: return { s: true, cout: false }
            case 2: return { s: false, cout: true }
            case 3: return { s: true, cout: true }
            default:
                console.log("ERROR: sum of adder is > 3")
                return { s: false, cout: false }
        }
    }

    protected override propagateValue(newValue: { s: LogicValue, cout: LogicValue }) {
        this.outputs.S.value = newValue.s
        this.outputs.Cout.value = newValue.cout
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, {
            drawLabels: () => {
                g.fillStyle = COLOR_COMPONENT_BORDER
                g.font = "bold 30px sans-serif"
                g.textAlign = "center"
                fillTextVAlign(g, TextVAlign.middle, "+", this.posX, this.posY - 2)
            },
        })
    }

    protected override xrayScale() {
        return 0.25
    }

    protected override makeXRay(level: number, scale: number, link: boolean) {
        const { xray, wire, gate } = this.parent.editor.newXRay(this, level, scale)
        const { ins, outs, p } = this.makeXRayNodes(xray, link)

        const and1 = gate("and1", "and", p.x(-0.5), p.later)
        const xor1 = gate("xor1", "xor", p.x(-0.5), p.later)
        const and2 = gate("and2", "and", p.later, p.y(0), "s")
        const xor2 = gate("xor2", "xor", p.x(0.7), p.y(-0.2), "s")
        const or = gate("or", "or", p.later, p.bottom - 2.5 * GRID_STEP, "s")

        wire(ins.A, xor1.in[0], true)
        wire(ins.B, and1.in[1], true)
        wire(ins.B, xor1.in[1], "vh", [p.x(-0.85), ins.B])
        wire(ins.A, and1.in[0], "vh", [p.x(-.95), ins.A])
        wire(or, outs.Cout)
        wire(and1, or.in[1], "hv")
        wire(and2, or.in[0], false)
        wire(xor1, and2.in[1], "hv")
        wire(xor1, xor2.in[1], "hv", [and2.in[1], xor1])
        wire(ins.Cin, xor2.in[0], "hv", [ins.Cin, p.y(-0.9)])
        wire(ins.Cin, and2.in[0], "vh", [and2.in[0], p.y(-0.9)])
        wire(xor2, outs.S, "vh")

        return xray
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        return this.makeForceOutputsContextMenuItem()
    }


}
AdderDef.impl = Adder
