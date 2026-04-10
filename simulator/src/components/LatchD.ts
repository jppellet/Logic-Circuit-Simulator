import { GRID_STEP } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { LogicValue } from "../utils"
import { Repr, defineComponent } from "./Component"
import { DrawableParent, MenuItems } from "./Drawable"
import { FlipflopOrLatch, FlipflopOrLatchDef, FlipflopOrLatchDefNodeDistX, FlipflopOrLatchDefPreClr, LatchNorQ, LatchNorQBar, setStoredValueInXRayForNorLatch } from "./FlipflopOrLatch"
import { XRay } from "./XRay"


export const LatchDDef =
    defineComponent("latch-d", true, true, {
        idPrefix: "latch",
        ...FlipflopOrLatchDef,
        makeNodes: ({ isXRay }) => {
            const nodeDistX = FlipflopOrLatchDefNodeDistX(isXRay)
            const base = FlipflopOrLatchDef.makeNodes(nodeDistX)
            const s = S.Components.Generic
            return {
                ins: {
                    D: [-nodeDistX, -2, "w", s.InputSetDesc],
                    E: [-nodeDistX, 2, "w", s.InputResetDesc],
                    ...FlipflopOrLatchDefPreClr,
                },
                outs: base.outs,
            }
        },
    })

type LatchDRepr = Repr<typeof LatchDDef>

export class LatchD extends FlipflopOrLatch<LatchDRepr> {

    public constructor(parent: DrawableParent, saved?: LatchDRepr) {
        super(parent, LatchDDef.from(parent), saved)
    }

    public toJSON() {
        return this.toJSONBase()
    }

    public override makeTooltip() {
        const s = S.Components.LatchD.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc) // TODO more info
        ))
    }

    protected doRecalcValue(): [LogicValue, LogicValue] {
        // assume this state is valid
        this._isInInvalidState = false

        const preset = this.inputs.Pre.value
        const clr = this.inputs.Clr.value
        if (preset === true) {
            if (clr === true) {
                this._isInInvalidState = true
                return [false, false]
            } else {
                // preset is true, clear is false, set output to 1
                return [true, false]
            }
        } else if (clr === true) {
            // preset is false, clear is true, set output to 0
            return [false, true]

        }

        const d = this.inputs.D.value
        const e = this.inputs.E.value
        const current = this.storedValue

        const newQ = e === true ? d : current
        return [newQ, LogicValue.invert(newQ)]
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        return [
            ...this.makeSetShowContentContextMenuItem(),
            ...this.makeForceOutputsContextMenuItem(true),
        ]
    }

    protected override xrayScale(): number { return 0.23 }

    protected override makeXRayForFlipflopOrLatch(level: number, scale: number, link: boolean) {
        const { xray, gate, wire } = this.parent.editor.newXRay(this, level, scale)
        const { ins, outs, p } = this.makeXRayNodes(xray, link)

        const norX = 4 * GRID_STEP
        const andX = p.left + 7 * GRID_STEP

        const andD = gate("andD", "and", andX, p.later)
        wire(ins.D, andD.in[0], true)
        const andDbar = gate("andDbar", "and", andX, ins.E.posY - GRID_STEP)

        const notInputX = p.left + 3.5 * GRID_STEP
        const notD = gate("notD", "not", notInputX, 0, "s")

        const clockLeftLine = p.left + 0.5 * GRID_STEP
        wire(ins.D, notD, "hv")
        wire(notD, andDbar.in[0], "vh")
        wire(ins.E, andDbar.in[1], "vh")
        wire(ins.E, andD.in[1], "vh", [clockLeftLine, andDbar.in[1]])

        const norQbar = gate(LatchNorQBar, "nor", norX, p.later, "e", 3)
        const norQ = gate(LatchNorQ, "nor", norX, p.later, "e", 3)

        wire(andD, norQbar.in[1], true)
        wire(andDbar, norQ.in[1], true)
        wire(ins.Pre, norQbar.in[0], "vh")
        wire(ins.Clr, norQ.in[2], "vh")

        const norBackLineRight = norQ.outputs.Out.posX + GRID_STEP
        const norBackLineLeft = norQbar.in[2].posX - 0.5 * GRID_STEP
        const norQBarOutY = norQ.outputs.Out.posY
        const norQBarInY = norQ.in[0].posY
        const norQOutY = norQbar.outputs.Out.posY
        const norQInY = norQbar.in[2].posY

        // loopback top to bottom
        wire(norQbar, norQ.in[0], "straight", [
            [norBackLineRight, norQOutY],
            [norBackLineRight, norQOutY + 2 * GRID_STEP],
            [norBackLineLeft, norQBarInY - 2 * GRID_STEP],
            [norBackLineLeft, norQBarInY],
        ])
        // loopback bottom to top
        wire(norQ, norQbar.in[2], "straight", [
            [norBackLineRight, norQBarOutY],
            [norBackLineRight, norQBarOutY - 2 * GRID_STEP],
            [norBackLineLeft, norQInY + 2 * GRID_STEP],
            [norBackLineLeft, norQInY],
        ])
        // out from top gate to bottom output
        wire(norQbar, outs.Q̅, "straight", [
            [norBackLineRight + GRID_STEP, norQOutY],
            [outs.Q̅.posX - 0.5 * GRID_STEP, outs.Q̅.posY],
        ])
        // out from bottom gate to top output
        wire(norQ, outs.Q, "straight", [
            [norBackLineRight + GRID_STEP, norQBarOutY],
            [outs.Q.posX - 0.5 * GRID_STEP, outs.Q.posY],
        ])

        return xray
    }

    protected override setStoredValueInXRay(xray: XRay, val: LogicValue): void {
        setStoredValueInXRayForNorLatch(xray, val)
    }

}
LatchDDef.impl = LatchD
