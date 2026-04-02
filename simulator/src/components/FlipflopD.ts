import { GRID_STEP } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { EdgeTrigger, LogicValue } from "../utils"
import { Repr, defineComponent } from "./Component"
import { DrawableParent } from "./Drawable"
import { Flipflop, FlipflopBaseDef, FlipflopOrLatchDefNodeDistX } from "./FlipflopOrLatch"
import { LatchDDef } from "./LatchD"
import { XRay } from "./XRay"


export const FlipflopDDef =
    defineComponent("ff-d", true, true, {
        idPrefix: "ff",
        ...FlipflopBaseDef,
        makeNodes: ({ isXRay }) => {
            const nodeDistX = FlipflopOrLatchDefNodeDistX(isXRay)
            const base = FlipflopBaseDef.makeNodes(2, nodeDistX)
            const s = S.Components.Generic
            return {
                ins: {
                    ...base.ins,
                    D: [-nodeDistX, -2, "w", s.InputDataDesc],
                },
                outs: base.outs,
            }
        },
    })

type FlipflopDRepr = Repr<typeof FlipflopDDef>

export class FlipflopD extends Flipflop<FlipflopDRepr> {

    public constructor(parent: DrawableParent, saved?: FlipflopDRepr) {
        super(parent, FlipflopDDef.from(parent), saved)
    }

    public toJSON() {
        return this.toJSONBase()
    }

    public override makeTooltip() {
        const s = S.Components.FlipflopD.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc) // TODO more info
        ))
    }

    protected doRecalcValueAfterClock(): LogicValue {
        return LogicValue.filterHighZ(this.inputs.D.value)
    }

    protected override xrayScale(): number { return 0.3 }

    protected override makeXRay(level: number, scale: number): XRay {
        const { xray, gate, wire } = this.parent.editor.newXRay(this, level, scale)
        const { ins, outs, p } = this.makeXRayNodes(xray)

        const master = LatchDDef.makeSpawned(xray, "master", p.right - 10 * GRID_STEP, p.later)
        const slave = LatchDDef.makeSpawned(xray, "slave", p.right - 3 * GRID_STEP, p.later)

        wire(slave.outputs.Q, outs.Q, false)
        wire(master.outputs.Q, slave.inputs.D, false)
        wire(slave.outputs.Q̅, outs.Q̅, "vh")
        wire(ins.Pre, slave.inputs.Pre, "vh", [slave.inputs.Pre, p.top + GRID_STEP])
        wire(ins.Clr, slave.inputs.Clr, "vh", [slave.inputs.Clr, p.bottom - GRID_STEP])
        wire(ins.D, master.inputs.D)

        const isFallingTrigger = this.trigger === EdgeTrigger.falling

        if (isFallingTrigger) {
            const notClockSlave = gate("notClockSlave", "not", p.left + 5.5 * GRID_STEP, p.later)
            wire(ins.Clock, notClockSlave, true)
            wire(ins.Clock, master.inputs.E, "hv")
            wire(notClockSlave, slave.inputs.E, "hv")

        } else {
            const notClock = gate("notClock", "not", p.left + 2 * GRID_STEP, p.later)
            wire(ins.Clock, notClock, true)
            const notClockSlave = gate("notClockSlave", "not", p.left + 8 * GRID_STEP, p.later)
            wire(notClock, notClockSlave, true)

            const notOutWireY = (notClock.posY + master.posY) / 2
            wire(notClock, master.inputs.E, "hv", [notClock.outputs.Out.posX + GRID_STEP, notOutWireY])
            wire(notClockSlave, slave.inputs.E, "hv", [notClockSlave.outputs.Out.posX + GRID_STEP, notOutWireY])
        }

        return xray
    }

}
FlipflopDDef.impl = FlipflopD

