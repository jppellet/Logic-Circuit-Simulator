import { GRID_STEP } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { LogicValue } from "../utils"
import { Repr, defineComponent } from "./Component"
import { DrawableParent, MenuData, MenuItems } from "./Drawable"
import { FlipflopOrLatch, FlipflopOrLatchDef, FlipflopOrLatchDefNodeDistX } from "./FlipflopOrLatch"
import { LatchSRGatedDef } from "./LatchSRGated"
import { type XRay } from "./XRay"


export const LatchSRDef =
    defineComponent("latch-sr", true, true, {
        idPrefix: "latch",
        ...FlipflopOrLatchDef,
        makeNodes: ({ isXRay }) => {
            const nodeDistX = FlipflopOrLatchDefNodeDistX(isXRay)
            const base = FlipflopOrLatchDef.makeNodes(nodeDistX)
            const s = S.Components.Generic
            return {
                ins: {
                    S: [-nodeDistX, -2, "w", s.InputSetDesc, { prefersSpike: true }],
                    R: [-nodeDistX, 2, "w", s.InputResetDesc, { prefersSpike: true }],
                },
                outs: base.outs,
            }
        },
    })

type LatchSRRepr = Repr<typeof LatchSRDef>

export class LatchSR extends FlipflopOrLatch<LatchSRRepr> {

    public constructor(parent: DrawableParent, saved?: LatchSRRepr) {
        super(parent, LatchSRDef.from(parent), saved)
    }

    public toJSON() {
        return this.toJSONBase()
    }

    public override makeTooltip() {
        const s = S.Components.LatchSR.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc) // TODO more info
        ))
    }

    protected doRecalcValue(): [LogicValue, LogicValue] {
        const s = this.inputs.S.value
        const r = this.inputs.R.value

        // assume this state is valid
        this._isInInvalidState = false

        // handle set and reset signals
        if (s === true) {
            if (r === true) {
                this._isInInvalidState = true
                return [false, false]
            } else {
                // set is true, reset is false, set output to 1
                return [true, false]
            }
        }
        if (r === true) {
            // set is false, reset is true, set output to 0
            return [false, true]
        }

        // no change
        const q = this.outputs.Q.value
        return [q, LogicValue.invert(q)]
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.LatchSR.contextMenu

        const switchEnablePinMenuItem =
            MenuData.item("none", s.WithEnable, () => {
                const replacement = LatchSRGatedDef.make(this.parent)
                // TODO restore stored value
                this.replaceWithComponent(replacement)
            })

        return [
            ...this.makeSetShowContentContextMenuItem(),
            ["mid", switchEnablePinMenuItem],
            ...this.makeForceOutputsContextMenuItem(true),
        ]
    }

    protected override xrayScale(): number { return 0.5 }

    protected override makeXRay(level: number, scale: number): XRay {
        const { xray, gate, wire } = this.parent.editor.newXRay(this, level, scale)
        const { ins, outs } = this.makeXRayNodes(xray)

        const gateX = -GRID_STEP
        const norQbar = gate("norQBar", "nor", gateX, outs.Q, "e")
        norQbar.outputs.Out.value = true as LogicValue // stabilize input
        const norQ = gate("norQ", "nor", gateX, outs.Q̅, "e")

        const norBackLineRight = norQ.outputs.Out.posX + GRID_STEP
        const norBackLineLeft = norQbar.in[1].posX - 0.5 * GRID_STEP
        const norQBarOutY = norQ.outputs.Out.posY
        const norQBarInY = norQ.in[0].posY
        const norQOutY = norQbar.outputs.Out.posY
        const norQInY = norQbar.in[1].posY


        wire(ins.S, norQbar.in[0], "hv", [norBackLineLeft, norQbar.in[0]])
        wire(ins.R, norQ.in[1], "hv", [norBackLineLeft, norQ.in[1]])
        // loopback top to bottom
        wire(norQbar, norQ.in[0], "straight", [
            [norBackLineRight, norQOutY],
            [norBackLineRight, norQOutY + 2 * GRID_STEP],
            [norBackLineLeft, norQBarInY - 2 * GRID_STEP],
            [norBackLineLeft, norQBarInY],
        ])
        // loopback bottom to top
        wire(norQ, norQbar.in[1], "straight", [
            [norBackLineRight, norQBarOutY],
            [norBackLineRight, norQBarOutY - 2 * GRID_STEP],
            [norBackLineLeft, norQInY + 2 * GRID_STEP],
            [norBackLineLeft, norQInY],
        ])
        // out from top gate to bottom output
        wire(norQbar, outs.Q̅, "straight", [
            [norBackLineRight + GRID_STEP, norQOutY],
            [outs.Q̅.posX - 0.5 * GRID_STEP, norQBarOutY],
        ])
        // out from bottom gate to top output
        wire(norQ, outs.Q, "straight", [
            [norBackLineRight + GRID_STEP, norQBarOutY],
            [outs.Q.posX - 0.5 * GRID_STEP, norQOutY],
        ])

        return xray
    }

}
LatchSRDef.impl = LatchSR
