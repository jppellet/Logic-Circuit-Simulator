import { GRID_STEP } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { LogicValue } from "../utils"
import { Repr, defineComponent } from "./Component"
import { DrawableParent, MenuData, MenuItems } from "./Drawable"
import { FlipflopOrLatch, FlipflopOrLatchDef, FlipflopOrLatchDefNodeDistX, FlipflopOrLatchDefPreClr, LatchNorQ, LatchNorQBar, setStoredValueInXRayForNorLatch } from "./FlipflopOrLatch"
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
        const current = this.storedValue
        return [current, LogicValue.invert(current)]
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.LatchSR.contextMenu

        const switchEnablePinMenuItem =
            MenuData.item("none", s.WithEnable, () => {
                const replacement = LatchSRWithEnableDef.make(this.parent)
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

    protected override makeXRayForFlipflopOrLatch(level: number, scale: number, link: boolean) {
        const { xray, gate, wire } = this.parent.editor.newXRay(this, level, scale)
        const { ins, outs } = this.makeXRayNodes(xray, link)

        const gateX = -GRID_STEP
        const norQbar = gate(LatchNorQBar, "nor", gateX, outs.Q, "e")
        const norQ = gate(LatchNorQ, "nor", gateX, outs.Q̅, "e")

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

    protected override setStoredValueInXRay(xray: XRay, val: LogicValue): void {
        setStoredValueInXRayForNorLatch(xray, val)
    }

}
LatchSRDef.impl = LatchSR



export const LatchSRWithEnableDef =
    defineComponent("latch-sr-en", true, true, {
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
                    E: [-nodeDistX, 0, "w", s.InputEnableDesc],
                    ...FlipflopOrLatchDefPreClr,
                },
                outs: base.outs,
            }
        },
    })

type LatchSRWithEnableRepr = Repr<typeof LatchSRWithEnableDef>

export class LatchSRWithEnable extends FlipflopOrLatch<LatchSRWithEnableRepr> {

    public constructor(parent: DrawableParent, saved?: LatchSRWithEnableRepr) {
        super(parent, LatchSRWithEnableDef.from(parent), saved)
    }

    public toJSON() {
        return this.toJSONBase()
    }

    public override makeTooltip() {
        const s = S.Components.LatchSRGated.tooltip
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

        // handle set and reset signals
        const enable = this.inputs.E.value
        if (enable === true) {
            const s = this.inputs.S.value
            const r = this.inputs.R.value
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
        }

        // no change
        const current = this.storedValue
        return [current, LogicValue.invert(current)]
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.LatchSR.contextMenu

        const switchEnablePinMenuItem =
            MenuData.item("check", s.WithEnable, () => {
                const replacement = LatchSRDef.make(this.parent)
                // TODO restore stored value
                this.replaceWithComponent(replacement)
            })

        return [
            ...this.makeSetShowContentContextMenuItem(),
            ["mid", switchEnablePinMenuItem],
            ...this.makeForceOutputsContextMenuItem(true),
        ]
    }

    protected override xrayScale(): number { return 0.3 }

    protected override makeXRayForFlipflopOrLatch(level: number, scale: number, link: boolean) {
        const { xray, gate, wire } = this.parent.editor.newXRay(this, level, scale)
        const { ins, outs, p } = this.makeXRayNodes(xray, link)

        const andGateX = -4 * GRID_STEP

        const andS = gate("andS", "and", andGateX, p.later)
        wire(ins.S, andS.in[0], true)
        const andR = gate("andR", "and", andGateX, p.later)
        wire(ins.R, andR.in[1], true)
        const branch = [p.left + GRID_STEP / 2, ins.E] as const
        wire(ins.E, andS.in[1], "vh", branch)
        wire(ins.E, andR.in[0], "vh", branch)

        const norGateX = 2.5 * GRID_STEP
        const norQbar = gate(LatchNorQBar, "nor", norGateX, p.later, "e", 3)
        const norQ = gate(LatchNorQ, "nor", norGateX, p.later, "e", 3)

        wire(andS, norQbar.in[1], true)
        wire(andR, norQ.in[1], true)
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
LatchSRWithEnableDef.impl = LatchSRWithEnable
