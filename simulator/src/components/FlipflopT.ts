import { GRID_STEP } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { LogicValue, Unknown, isHighImpedance, isUnknown } from "../utils"
import { Repr, defineComponent } from "./Component"
import { DrawableParent } from "./Drawable"
import { FlipflopDDef } from "./FlipflopD"
import { Flipflop, FlipflopBaseDef, FlipflopOrLatchDefNodeDistX } from "./FlipflopOrLatch"
import { MuxDef } from "./Mux"
import { XRay } from "./XRay"


export const FlipflopTDef =
    defineComponent("ff-t", true, true, {
        idPrefix: "ff",
        ...FlipflopBaseDef,
        makeNodes: ({ isXRay }) => {
            const nodeDistX = FlipflopOrLatchDefNodeDistX(isXRay)
            const base = FlipflopBaseDef.makeNodes(2, nodeDistX)
            const s = S.Components.FlipflopT
            return {
                ins: {
                    ...base.ins,
                    T: [-nodeDistX, -2, "w", s.InputTDesc],
                },
                outs: base.outs,
            }
        },
    })

type FlipflopTRepr = Repr<typeof FlipflopTDef>

export class FlipflopT extends Flipflop<FlipflopTRepr> {

    public constructor(parent: DrawableParent, saved?: FlipflopTRepr) {
        super(parent, FlipflopTDef.from(parent), saved)
    }

    public toJSON() {
        return this.toJSONBase()
    }

    public override makeTooltip() {
        const s = S.Components.FlipflopT.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc) // TODO more info
        ))
    }

    protected doRecalcValueAfterClock(): LogicValue {
        const t = this.inputs.T.value
        if (isUnknown(t) || isHighImpedance(t)) {
            return Unknown
        }
        const current = this.storedValue
        return t ? LogicValue.invert(current) : current
    }

    protected override xrayScale(): number { return 0.35 }

    protected override makeXRayForFlipflopOrLatch(level: number, scale: number, link: boolean) {
        const { xray, wire } = this.parent.editor.newXRay(this, level, scale)
        const { ins, outs, p } = this.makeXRayNodes(xray, link)

        const ffd = FlipflopDDef.makeSpawned(xray, "ffd", GRID_STEP, p.later)
        xray.alignComponentOf(ffd.outputs.Q̅, outs.Q̅)
        ffd.doSetTrigger(this.trigger)

        const allocOut = xray.wires([ffd.outputs.Q, ffd.outputs.Q̅], [outs.Q, outs.Q̅], {
            alloc: { allDifferent: true, order: "bottom-up" },
        })
        wire(ins.Pre, ffd.inputs.Pre, "vh", [ffd.inputs.Pre, p.top + GRID_STEP / 2])
        wire(ins.Clr, ffd.inputs.Clr, "vh", [ffd.inputs.Clr, p.bottom - GRID_STEP / 2])
        wire(ins.Clock, ffd.inputs.Clock, "hv", [ffd.inputs.Clock.posX - GRID_STEP, ffd.inputs.Clock])

        const mux = MuxDef.makeSpawned(xray, "mux", -2.5 * GRID_STEP, ins.T.posY + 2 * GRID_STEP, "s", { from: 2, to: 1, bottom: true })
        wire(mux.outputs.Z[0], ffd.inputs.D, "vh")
        wire(ins.T, mux.inputs.S[0], "hv")
        wire(ffd.outputs.Q, mux.inputs.I[0][0], "vh", [allocOut.at(1), ffd.outputs.Q])
        wire(ffd.outputs.Q̅, mux.inputs.I[1][0], "vh", [[allocOut.at(0), ffd.outputs.Q̅], [mux.inputs.I[1][0], mux.inputs.I[1][0].posY - GRID_STEP]])

        return xray
    }

    protected override setStoredValueInXRay(xray: XRay, val: LogicValue): void {
        xray.setStoredValueOfFlipflopOrLatch("ffd", val)
    }

}
FlipflopTDef.impl = FlipflopT
