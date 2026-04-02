import { GRID_STEP } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { LogicValue } from "../utils"
import { Repr, defineComponent } from "./Component"
import { DrawableParent } from "./Drawable"
import { FlipflopD, FlipflopDDef } from "./FlipflopD"
import { Flipflop, FlipflopBaseDef, FlipflopOrLatchDefNodeDistX } from "./FlipflopOrLatch"
import { Mux, MuxDef } from "./Mux"
import { XRay } from "./XRay"


export const FlipflopJKDef =
    defineComponent("ff-jk", true, true, {
        idPrefix: "ff",
        ...FlipflopBaseDef,
        makeNodes: ({ isXRay }) => {
            const nodeDistX = FlipflopOrLatchDefNodeDistX(isXRay)
            const base = FlipflopBaseDef.makeNodes(0, nodeDistX)
            const s = S.Components.FlipflopJK
            return {
                ins: {
                    ...base.ins,
                    J: [-nodeDistX, -2, "w", s.InputJDesc],
                    K: [-nodeDistX, 2, "w", s.InputKDesc],
                },
                outs: base.outs,
            }
        },
    })

type FlipflopJKRepr = Repr<typeof FlipflopJKDef>

export class FlipflopJK extends Flipflop<FlipflopJKRepr> {

    public constructor(parent: DrawableParent, saved?: FlipflopJKRepr) {
        super(parent, FlipflopJKDef.from(parent), saved)
    }

    public toJSON() {
        return this.toJSONBase()
    }

    public override makeTooltip() {
        const s = S.Components.FlipflopJK.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc) // TODO more info
        ))
    }

    protected doRecalcValueAfterClock(): LogicValue {
        const j = this.inputs.J.value
        const k = this.inputs.K.value
        const q = this.outputs.Q.value

        if (j === true) {
            if (k === true) {
                return LogicValue.invert(q)
            } else {
                return true
            }
        }
        if (k === true) {
            return false
        } else {
            return q
        }
    }

    protected override xrayScale(): number { return 0.35 }

    protected override makeXRay(level: number, scale: number): XRay {
        const { xray, wire, gate } = this.parent.editor.newXRay(this, level, scale)
        const { ins, outs, p } = this.makeXRayNodes(xray)

        const ffd = FlipflopDDef.makeSpawned<FlipflopD>(xray, "ffd", 3 * GRID_STEP, p.later)
        xray.alignComponentOf(ffd.outputs.Q̅, outs.Q̅)

        const allocOut = xray.wires([ffd.outputs.Q, ffd.outputs.Q̅], [outs.Q, outs.Q̅], {
            alloc: { allDifferent: true, order: "bottom-up" },
        })
        wire(ins.Pre, ffd.inputs.Pre, "vh", [ffd.inputs.Pre, p.top + GRID_STEP / 2])
        wire(ins.Clr, ffd.inputs.Clr, "vh", [ffd.inputs.Clr, p.bottom - GRID_STEP / 2])
        wire(ins.Clock, ffd.inputs.Clock, "hv", [p.left + 2, p.bottom - 2 * GRID_STEP])

        const mux = MuxDef.makeSpawned<Mux>(xray, "mux", -1 * GRID_STEP, ins.J.posY + 2 * GRID_STEP, "s", { from: 2, to: 1, bottom: false })
        wire(ins.J, mux.inputs.I[0][0], "hv", [p.left + GRID_STEP, mux.inputs.I[0][0].posY - GRID_STEP])
        wire(mux.outputs.Z[0], ffd.inputs.D, "vh")
        wire(ffd.outputs.Q, mux.inputs.S[0], "vh", [allocOut.at(1), ffd.outputs.Q])

        const notK = gate("notK", "not", p.left + 3 * GRID_STEP, ins.K.posY - 3 * GRID_STEP, "n")
        wire(ins.K, notK, "hv")
        wire(notK, mux.inputs.I[1][0], "vh", [p.left + 2 * GRID_STEP, notK.posY - 4 * GRID_STEP])

        return xray
    }


}
FlipflopJKDef.impl = FlipflopJK
