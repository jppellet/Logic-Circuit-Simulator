import { COLOR_COMPONENT_BORDER, TextVAlign, fillTextVAlign } from "../drawutils"
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
        size: () => ({ gridWidth: 7, gridHeight: 5 }),
        makeNodes: () => {
            const s = S.Components.Generic
            return {
                ins: {
                    A: [-2, -4, "n", "A", { hasTriangle: true }],
                    B: [2, -4, "n", "B", { hasTriangle: true }],
                    Cin: [5, 0, "e", s.InputCarryInDesc, { hasTriangle: true }],
                },
                outs: {
                    S: [0, 4, "s", s.OutputSumDesc, { hasTriangle: true }],
                    Cout: [-5, 0, "w", s.OutputCarryOutDesc, { hasTriangle: true }],
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
            xrayScale: 0.25,
        })
    }

    protected override makeXRay(scale: number) {
        const { xray, wire, gate } = this.parent.editor.newXRay(this)
        const { ins, outs, x, y, later } = this.makeXRayNodes<Adder>(xray, scale)

        const and1 = gate("and1", "and", later, y(-0.5), "s")
        const xor1 = gate("xor1", "xor", later, y(-0.5), "s")
        const and2 = gate("and2", "and", x(0), later, "w")
        const xor2 = gate("xor2", "xor", x(0.2), y(0.7), "w")
        const or = gate("or", "or", x(-.85), later, "w")

        wire(ins.B, xor1.in[0], true)
        wire(ins.A, and1.in[1], true)
        wire(ins.A, xor1.in[1], "hv", [ins.A.posX, y(-0.85), true])
        wire(ins.B, and1.in[0], "hv", [ins.B.posX, y(-.95), true])
        wire(or, outs.Cout)
        wire(and1, or.in[1], "vh")
        wire(and2, or.in[0], false)
        wire(xor1, and2.in[1], "vh")
        wire(xor1, xor2.in[1], "vh", [xor1.outputs.Out.posX, and2.in[1].posY, true])
        wire(ins.Cin, xor2.in[0], "vh", [x(0.9), ins.Cin.posY])
        wire(ins.Cin, and2.in[0], "hv", [x(0.9), and2.in[0].posY, true])
        wire(xor2, outs.S, "hv")

        return xray
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        return this.makeForceOutputsContextMenuItem()
    }


}
AdderDef.impl = Adder
