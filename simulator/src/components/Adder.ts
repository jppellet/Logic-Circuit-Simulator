import { COLOR_COMPONENT_BORDER, TextVAlign, fillTextVAlign } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { LogicValue, Unknown, isHighImpedance, isUnknown } from "../utils"
import { ComponentBase, Repr, defineComponent } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuItems } from "./Drawable"
import { GateN, GateNDef } from "./Gate"

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
        const xray = this.parent.editor.newXRay(this)
        const { inputs, outputs, x, y, later } = this.makeXRayNodes(xray, scale)

        const and1 = GateNDef.makeSpawned<GateN>(xray, "and1", later, y(-0.5), "s", { type: "and", bits: 2 })
        const xor1 = GateNDef.makeSpawned<GateN>(xray, "xor1", later, y(-0.5), "s", { type: "xor", bits: 2 })
        const and2 = GateNDef.makeSpawned<GateN>(xray, "and2", x(0), later, "w", { type: "and", bits: 2 })
        const xor2 = GateNDef.makeSpawned<GateN>(xray, "xor2", x(0.2), y(0.7), "w", { type: "xor", bits: 2 })
        const or = GateNDef.makeSpawned<GateN>(xray, "or", x(-.85), later, "w", { type: "or", bits: 2 })

        xray.wire(inputs.B, xor1.inputs.In[0], true)
        xray.wire(inputs.A, and1.inputs.In[1], true)
        xray.wire(inputs.A, xor1.inputs.In[1], "hv", [inputs.A.posX, y(-0.85), true])
        xray.wire(inputs.B, and1.inputs.In[0], "hv", [inputs.B.posX, y(-.95), true])
        xray.wire(or.outputs.Out, outputs.Cout)
        xray.wire(and1.outputs.Out, or.inputs.In[1], "vh")
        xray.wire(and2.outputs.Out, or.inputs.In[0], false)
        xray.wire(xor1.outputs.Out, and2.inputs.In[1], "vh")
        xray.wire(xor1.outputs.Out, xor2.inputs.In[1], "vh", [xor1.outputs.Out.posX, and2.inputs.In[1].posY, true])
        xray.wire(inputs.Cin, xor2.inputs.In[0], "vh", [x(0.9), inputs.Cin.posY])
        xray.wire(inputs.Cin, and2.inputs.In[0], "hv", [x(0.9), and2.inputs.In[0].posY, true])
        xray.wire(xor2.outputs.Out, outputs.S, "hv")

        return xray
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        return this.makeForceOutputsContextMenuItem()
    }


}
AdderDef.impl = Adder
