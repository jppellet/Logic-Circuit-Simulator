import { COLOR_COMPONENT_BORDER, TextVAlign, fillTextVAlign } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { LogicValue, Unknown, isHighImpedance, isUnknown } from "../utils"
import { ComponentBase, Repr, defineComponent } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuItems } from "./Drawable"
import { GateN, GateNDef } from "./Gate"
import { type XRay } from "./XRay"


export const HalfAdderDef =
    defineComponent("halfadder", true, true, {
        idPrefix: "hadder",
        button: { imgWidth: 50 },
        valueDefaults: {},
        size: () => ({ gridWidth: 4, gridHeight: 6 }),
        makeNodes: () => {
            const s = S.Components.Generic
            return {
                ins: {
                    A: [-4, -2, "w", "A", { hasTriangle: true }],
                    B: [-4, 2, "w", "B", { hasTriangle: true }],
                },
                outs: {
                    S: [4, -2, "e", s.OutputSumDesc, { hasTriangle: true }],
                    C: [4, 2, "e", s.OutputCarryDesc, { hasTriangle: true }],
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
        this.outputs.C.value = newValue.c
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, {
            drawLabels: () => {
                g.fillStyle = COLOR_COMPONENT_BORDER
                g.font = "26px sans-serif"
                g.textAlign = "center"
                fillTextVAlign(g, TextVAlign.middle, "+", this.posX, this.posY - 2)
            },
            xrayScale: 0.40,
        })
    }

    protected override makeXRay(scale: number): XRay {
        const xray = this.parent.editor.newXRay(this)
        const { inputs, outputs } = this.makeXRayNodes(xray, scale)

        const xor = GateNDef.makeSpawned<GateN>(xray, 15, -40, "e", { type: "xor", bits: 2 })
        const and = GateNDef.makeSpawned<GateN>(xray, 15, 40, "e", { type: "and", bits: 2 })

        xray.wire(inputs.B, and.inputs.In[1])
        xray.wire(inputs.A, xor.inputs.In[0])
        xray.wire(inputs.A, and.inputs.In[0], { via: [-35, -50, true], style: "vh" })
        xray.wire(inputs.B, xor.inputs.In[1], { via: [-20, 50, true], style: "vh" })
        xray.wire(and.outputs.Out, outputs.C, { style: "vh" })
        xray.wire(xor.outputs.Out, outputs.S, { style: "vh" })

        return xray
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        return this.makeForceOutputsContextMenuItem()
    }

}
HalfAdderDef.impl = HalfAdder
