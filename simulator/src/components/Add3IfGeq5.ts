import { COLOR_COMPONENT_BORDER, GRID_STEP, TextVAlign, displayValuesFromArray, fillTextVAlign } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillUsing, ArrayFillWith, FixedArrayFillWith, LogicValue, Unknown, isUnknown } from "../utils"
import { ComponentBase, Repr, defineComponent, groupVertical } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering } from "./Drawable"
import { HalfAdderDef } from "./HalfAdder"

export const Add3IfGeq5Def =
    defineComponent("add3ifgeq5", true, true, {
        idPrefix: "add3ifgeq5",
        button: { imgWidth: 50 },
        valueDefaults: {},
        size: () => ({ gridWidth: 4, gridHeight: 7.5 }),
        makeNodes: () => {
            return {
                ins: {
                    In: groupVertical("w", -2.5, 0, 4),
                },
                outs: {
                    Out: groupVertical("e", 2.5, 0, 4),
                },
            }
        },
        initialValue: () => ArrayFillWith(false as LogicValue, 4),
    })

type Add3IfGeq5Repr = Repr<typeof Add3IfGeq5Def>

/**
 * Used to implement 8+ bit BCD conversion, see https://electronics.stackexchange.com/questions/440910/k-maps-for-forming-8bit-binary-to-8bit-bcd-digital-circuit/441405#441405
 */
export class Add3IfGeq5 extends ComponentBase<Add3IfGeq5Repr> {

    public constructor(parent: DrawableParent, saved?: Add3IfGeq5Repr) {
        super(parent, Add3IfGeq5Def.from(parent), saved)
    }

    public toJSON() {
        return this.toJSONBase()
    }

    public override makeTooltip() {
        const s = S.Components.Add3IfGeq5.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc),
        ))
    }

    protected doRecalcValue() {
        const [__, value] = displayValuesFromArray(this.inputValues(this.inputs.In), false)

        if (isUnknown(value)) {
            return FixedArrayFillWith(Unknown, 4)
        }

        const result = value >= 5 ? (value + 3) % 16 : value
        return ArrayFillUsing(i => (result >> i) & 1 ? true as LogicValue : false as LogicValue, 4)
    }

    protected override propagateValue(newValue: LogicValue[]) {
        this.outputValues(this.outputs.Out, newValue)
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, {
            drawLabels: () => {
                g.fillStyle = COLOR_COMPONENT_BORDER
                g.textAlign = "center"
                g.font = "bold 26px sans-serif"
                fillTextVAlign(g, TextVAlign.middle, "+3", this.posX, this.posY - 10)
                g.font = "16px sans-serif"
                fillTextVAlign(g, TextVAlign.middle, "If≥5", this.posX, this.posY + 12)
            },
        })
    }

    protected override xrayScale() {
        return 0.15
    }

    protected override makeXRay(level: number, scale: number, link: boolean) {
        const { xray, wire, gate } = this.parent.editor.newXRay(this, level, scale)
        const { ins, outs, p } = this.makeXRayNodes(xray, link)

        const allocLeft = xray.newPositionAlloc(p.left + 2, GRID_STEP, 2)

        const or1 = gate(`or1`, "or", p.later, p.later)
        wire(ins.In[1], or1.in[1], true)
        wire(ins.In[0], or1.in[0], "hv", [allocLeft.at(0), or1.in[0]])
        xray.alignXAfter(allocLeft, or1.in[0])

        const and1 = gate(`and1`, "and", or1, p.later)
        wire(ins.In[2], and1.in[1], true)
        wire(or1, and1.in[0], "vh", p.downBy(2, or1.in[1]))

        const or2 = gate(`or2`, "or", and1, p.later)
        wire(ins.In[3], or2.in[1], true)
        wire(and1, or2.in[0], "vh", p.movedBy(-1, 2, and1.in[1]))

        const xor1 = gate(`xor1`, "xor", or1.posX + 9 * GRID_STEP, p.later)
        wire(ins.In[0], xor1.in[0], true)
        wire(or2, xor1.in[1], "hv", p.leftBy(2, xor1.in[1]))

        const and2 = gate(`and2`, "and", xor1, or1)
        wire(xor1, and2.in[0], "vh", p.movedBy(-1, 2, xor1.in[1]))
        wire(or2, and2.in[1], "hv", p.leftBy(2, and2.in[1]))

        const xor2 = gate(`xor2`, "xor", xor1, (ins.In[1].posY + ins.In[2].posY) / 2 - 0.5 * GRID_STEP)
        wire(and2, xor2.in[1], "vh", p.movedBy(-1, 2, and2.in[1]))
        wire(ins.In[1], xor2.in[0], "hv", [[allocLeft.at(0), (ins.In[1].posY + ins.In[2].posY) / 2], p.leftBy(3, xor2.in[0])])

        const andN1 = gate(`andN1`, "rnimply", xor2, and1)
        wire(and2, andN1.in[1], "vh", p.movedBy(-1, 2, and2.in[1]))
        wire(ins.In[1], andN1.in[0], "hv", [[allocLeft.at(0), (ins.In[1].posY + ins.In[2].posY) / 2], p.leftBy(3, andN1.in[0])])

        const xor3 = gate(`xor3`, "xor", andN1, p.later)
        wire(or2, xor3.in[1], true)
        wire(andN1, xor3.in[0], "vh", p.movedBy(-1, 2, andN1.in[1]))

        const adder = HalfAdderDef.makeSpawned(xray, "adder", xor1.posX + 6.5 * GRID_STEP, 5 * GRID_STEP)
        wire(ins.In[2], adder.inputs.A, "hv", [allocLeft.at(0), adder.inputs.A])
        wire(xor3, adder.inputs.B, "vh", p.rightBy(1, xor3.outputs.Out))

        const xor4 = gate(`xor4`, "xor", adder.posX + 1.5 * GRID_STEP, p.later)
        wire(xor4, outs.Out[3], false)
        wire(adder.outputs.Cout, xor4.in[0], "vh", [xor4.in[0].posX - GRID_STEP, adder.outputs.Cout.posY + 3 * GRID_STEP])
        wire(ins.In[3], xor4.in[1], "hv", [[allocLeft.at(0), xor4.in[1].posY + GRID_STEP], p.leftBy(1, xor4.in[1])])

        wire(xor1, outs.Out[0], "vh")
        wire(xor2, outs.Out[1], "vh", p.rightBy(1, xor2.outputs.Out))
        wire(adder.outputs.S, outs.Out[2], "vh", p.rightBy(1, adder.outputs.S))

        return xray
    }

}
Add3IfGeq5Def.impl = Add3IfGeq5
