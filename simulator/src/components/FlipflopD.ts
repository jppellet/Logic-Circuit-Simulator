import { GRID_STEP } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { EdgeTrigger, HighImpedance, LogicValue, Unknown } from "../utils"
import { Repr, defineComponent } from "./Component"
import { DrawableParent, MenuData, MenuItems } from "./Drawable"
import { Flipflop, FlipflopBaseDef, FlipflopOrLatchDefNodeDistX } from "./FlipflopOrLatch"
import { LatchDDef } from "./LatchD"
import { MuxDef } from "./Mux"
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

    protected override makeFlipFlopSpecificContextMenuItems(): MenuItems {
        const s = S.Components.LatchSR.contextMenu

        const switchEnablePinMenuItem =
            MenuData.item("none", s.WithEnable, () => {
                const replacement = FlipflopDWithEnableDef.make(this.parent)
                // TODO restore stored value
                this.replaceWithComponent(replacement)
            })

        return [
            ["mid", switchEnablePinMenuItem],
        ]
    }

    protected override xrayScale(): number { return 0.3 }

    protected override makeXRayForFlipflopOrLatch(level: number, scale: number, link: boolean) {
        const { xray, gate, wire } = this.parent.editor.newXRay(this, level, scale)
        const { ins, outs, p } = this.makeXRayNodes(xray, link)

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

    protected override setStoredValueInXRay(xray: XRay, val: LogicValue): void {
        xray.setStoredValueOfFlipflopOrLatch("slave", val)
        xray.setStoredValueOfFlipflopOrLatch("master", val)
    }

}
FlipflopDDef.impl = FlipflopD


export const FlipflopDWithEnableDef =
    defineComponent("ff-d-en", true, true, {
        idPrefix: "ff",
        ...FlipflopBaseDef,
        makeNodes: ({ isXRay }) => {
            const nodeDistX = FlipflopOrLatchDefNodeDistX(isXRay)
            const base = FlipflopBaseDef.makeNodes(2, nodeDistX)
            const s = S.Components.Generic
            return {
                ins: {
                    ...base.ins,
                    E: [-nodeDistX, 0, "w", s.InputEnableDesc],
                    D: [-nodeDistX, -2, "w", s.InputDataDesc],
                },
                outs: base.outs,
            }
        },
    })

type FlipflopDWithEnableRepr = Repr<typeof FlipflopDWithEnableDef>

export class FlipflopDWithEnable extends Flipflop<FlipflopDWithEnableRepr> {

    public constructor(parent: DrawableParent, saved?: FlipflopDWithEnableRepr) {
        super(parent, FlipflopDWithEnableDef.from(parent), saved)
    }

    public toJSON() {
        return this.toJSONBase()
    }

    public override makeTooltip() {
        const s = S.Components.FlipflopDWithEnable.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc) // TODO more info
        ))
    }

    protected doRecalcValueAfterClock(): LogicValue {
        const e = this.inputs.E.value
        if (e === Unknown || e === HighImpedance) {
            return Unknown
        }
        if (e === false) {
            return this.storedValue
        }
        return LogicValue.filterHighZ(this.inputs.D.value)
    }

    protected override makeFlipFlopSpecificContextMenuItems(): MenuItems {
        const s = S.Components.LatchSR.contextMenu

        const switchEnablePinMenuItem =
            MenuData.item("check", s.WithEnable, () => {
                const replacement = FlipflopDDef.make(this.parent)
                // TODO restore stored value
                this.replaceWithComponent(replacement)
            })

        return [
            ["mid", switchEnablePinMenuItem],
        ]
    }

    protected override xrayScale(): number { return 0.35 }

    protected override makeXRayForFlipflopOrLatch(level: number, scale: number, link: boolean) {
        const { xray, wire } = this.parent.editor.newXRay(this, level, scale)
        const { ins, outs, p } = this.makeXRayNodes(xray, link)

        const ffd = FlipflopDDef.makeSpawned(xray, "ffd", GRID_STEP, p.later)
        xray.alignComponentOf(ffd.outputs.Q̅, outs.Q̅)

        const allocOut = xray.wires([ffd.outputs.Q, ffd.outputs.Q̅], [outs.Q, outs.Q̅], {
            alloc: { allDifferent: true, order: "bottom-up" },
        })
        wire(ins.Pre, ffd.inputs.Pre, "vh", [ffd.inputs.Pre, p.top + GRID_STEP / 2])
        wire(ins.Clr, ffd.inputs.Clr, "vh", [ffd.inputs.Clr, p.bottom - GRID_STEP / 2])
        wire(ins.Clock, ffd.inputs.Clock, "hv", [ffd.inputs.Clock.posX - GRID_STEP, ffd.inputs.Clock])

        const mux = MuxDef.makeSpawned(xray, "mux", -2.5 * GRID_STEP, ins.D.posY + 3 * GRID_STEP, "s", { from: 2, to: 1, bottom: true })
        wire(mux.outputs.Z[0], ffd.inputs.D, "vh")
        wire(ins.E, mux.inputs.S[0], "hv")
        wire(ins.D, mux.inputs.I[1][0], "hv")
        wire(ffd.outputs.Q, mux.inputs.I[0][0], "vh", [allocOut.at(1), ffd.outputs.Q])

        return xray
    }

    protected override setStoredValueInXRay(xray: XRay, val: LogicValue): void {
        xray.setStoredValueOfFlipflopOrLatch("ffd", val)
    }

}
FlipflopDWithEnableDef.impl = FlipflopDWithEnable

