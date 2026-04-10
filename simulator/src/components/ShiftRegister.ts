import { COLOR_COMPONENT_BORDER, GRID_STEP, TextVAlign, fillTextVAlign } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { LogicValue, Unknown, isHighImpedance, isUnknown } from "../utils"
import { Repr, ResolvedParams, defineParametrizedComponent } from "./Component"
import { DrawableParent, GraphicsRendering } from "./Drawable"
import { FlipflopD, FlipflopDDef } from "./FlipflopD"
import { Mux, MuxDef } from "./Mux"
import { RegisterBase, RegisterBaseDef } from "./Register"
import { WaypointSpecCompact } from "./XRay"

export const ShiftRegisterDef =
    defineParametrizedComponent("shift-reg", true, true, {
        variantName: ({ bits }) => `shift-reg-${bits}`,
        idPrefix: "reg",
        ...RegisterBaseDef,
        makeNodes: (params, defaults) => {
            const base = RegisterBaseDef.makeNodes(params, defaults)
            const lrYOffset = base.ins.Clock[1] - 2
            return {
                ins: {
                    ...base.ins,
                    D: [-5, 0, "w"],
                    L̅R: [-5, lrYOffset, "w"],
                },
                outs: base.outs,
            }
        },
    })

export type ShiftRegisterRepr = Repr<typeof ShiftRegisterDef>
export type ShiftRegisterParams = ResolvedParams<typeof ShiftRegisterDef>

export class ShiftRegister extends RegisterBase<ShiftRegisterRepr> {

    public constructor(parent: DrawableParent, params: ShiftRegisterParams, saved?: ShiftRegisterRepr) {
        super(parent, ShiftRegisterDef, params, saved)
    }

    public toJSON() {
        return this.toJSONBase()
    }

    public override makeTooltip() {
        const s = S.Components.ShiftRegister.tooltip

        // TODO add explanation of shift register direction
        return tooltipContent(s.title, mods(
            div(s.desc.expand({ numBits: this.numBits })) // TODO more info egenrically from register
        ))
    }

    public makeStateAfterClock(): LogicValue[] {
        const dirIsRight = this.inputs.L̅R.value
        if (isUnknown(dirIsRight) || isHighImpedance(dirIsRight)) {
            return this.makeStateFromMainValue(Unknown)
        }
        const d = LogicValue.filterHighZ(this.inputs.D.value)
        const current = this.value
        const next = dirIsRight ? [...current.slice(1), d] : [d, ...current.slice(0, -1)]
        return next
    }

    protected override doDrawGenericCaption(g: GraphicsRendering) {
        g.font = `bold 13px sans-serif`
        g.fillStyle = COLOR_COMPONENT_BORDER
        g.textAlign = "center"
        fillTextVAlign(g, TextVAlign.middle, "Shift R.", this.posX, this.posY - 8)
        g.font = `11px sans-serif`
        fillTextVAlign(g, TextVAlign.middle, `${this.numBits} bits`, this.posX, this.posY + 10)
    }

    protected override xrayScale(): number {
        return this.numBits >= 16 ? 0.105 : this.numBits >= 8 ? 0.15 : 0.3
    }

    protected override makeXRay(level: number, scale: number, link: boolean) {
        const bits = this.numBits
        const edgeTrigger = this.trigger
        const { xray, wire } = this.parent.editor.newXRay(this, level, scale)
        const { ins, outs, p } = this.makeXRayNodes(xray, link)

        const ffds: FlipflopD[] = []
        const muxes: Mux[] = []

        const storedValue = this.value
        for (let i = 0; i < bits; i++) {
            const ffd = FlipflopDDef.makeSpawned(xray, `ffd${i}`, 2 * GRID_STEP, (i - (bits - 1) / 2) * 12 * GRID_STEP)
            ffd.doSetTrigger(edgeTrigger)
            ffd.storedValue = storedValue[i]
            ffds.push(ffd)

            const mux = MuxDef.makeSpawned(xray, `mux${i}`, p.left + 5 * GRID_STEP, p.later, "e", { from: 2, to: 1, bottom: true })
            wire(mux.outputs.Z[0], ffd.inputs.D, false)
            muxes.push(mux)

        }

        // D to top and bottom muxes
        wire(ins.D, muxes[0].inputs.I[0][0], "vh", [p.left + 2 * GRID_STEP, ins.D])
        wire(ins.D, muxes[bits - 1].inputs.I[1][0], "vh", [p.left + 2 * GRID_STEP, ins.D])

        // LR to all muxes
        for (let i = 0; i < bits; i++) {
            wire(ins.L̅R, muxes[i].inputs.S[0], "vh", [p.left + 1 * GRID_STEP, ins.L̅R])
        }

        const allocOut = xray.wires(ffds.map(ffd => ffd.outputs.Q), outs.Q, {
            bookings: { colsLeft: 3 },
        })

        // loop FFs and muxes together
        for (let i = 0; i < bits; i++) {
            if (i > 0) {
                // first mux input from previous FF
                const muxIn = muxes[i].inputs.I[0][0]
                wire(ffds[i - 1].outputs.Q, muxIn, "hv", [
                    [allocOut.at(-2), ffds[i - 1].posY + 6 * GRID_STEP],
                    p.rightBy(1, muxIn),
                ])
            }
            if (i < bits - 1) {
                // second mux input from next FF
                const muxIn = muxes[i].inputs.I[1][0]
                wire(ffds[i + 1].outputs.Q, muxIn, "hv", [
                    [allocOut.at(-3), ffds[i + 1].posY - 7 * GRID_STEP],
                    p.rightBy(1, muxIn),
                ])
            }
        }

        // clock
        const clockLineX = ffds[0].inputs.Clock.posX - 2 * GRID_STEP
        const lastMuxBottomY = muxes[bits - 1].inputs.S[0].posY + 2 * GRID_STEP
        const initialWaypoints: WaypointSpecCompact[] = lastMuxBottomY > ins.Clock.posY ? [[p.left + 2, lastMuxBottomY]] : []
        for (let i = 0; i < bits; i++) {
            wire(ins.Clock, ffds[i].inputs.Clock, "hv", [
                ...initialWaypoints,
                [clockLineX, ffds[i].inputs.Clock],
            ])
        }

        // preset
        const presetLineX = ffds[0].inputs.Clock.posX - 1 * GRID_STEP
        for (let i = 0; i < bits; i++) {
            wire(ins.Pre, ffds[i].inputs.Pre, "vh", [presetLineX, p.top + GRID_STEP])
        }

        // clear
        const clearLineX = allocOut.at(-1)
        for (let i = 0; i < bits; i++) {
            wire(ins.Clr, ffds[i].inputs.Clr, "vh", [clearLineX, p.bottom - GRID_STEP])
        }

        return xray
    }

}
ShiftRegisterDef.impl = ShiftRegister