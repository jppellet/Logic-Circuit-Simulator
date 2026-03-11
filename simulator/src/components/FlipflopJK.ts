import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { LogicValue } from "../utils"
import { Repr, defineComponent } from "./Component"
import { DrawableParent } from "./Drawable"
import { Flipflop, FlipflopBaseDef } from "./FlipflopOrLatch"


export const FlipflopJKDef =
    defineComponent("ff-jk", true, true, {
        idPrefix: "ff",
        ...FlipflopBaseDef,
        makeNodes: () => {
            const base = FlipflopBaseDef.makeNodes(0)
            const s = S.Components.FlipflopJK
            return {
                ins: {
                    ...base.ins,
                    J: [-4, -2, "w", s.InputJDesc],
                    K: [-4, 2, "w", s.InputKDesc],
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

}
FlipflopJKDef.impl = FlipflopJK
