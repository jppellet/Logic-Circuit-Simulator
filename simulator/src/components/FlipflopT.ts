import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { LogicValue, Unknown, isHighImpedance, isUnknown } from "../utils"
import { Repr, defineComponent } from "./Component"
import { DrawableParent } from "./Drawable"
import { Flipflop, FlipflopBaseDef } from "./FlipflopOrLatch"


export const FlipflopTDef =
    defineComponent("ff-t", true, true, {
        idPrefix: "ff",
        ...FlipflopBaseDef,
        makeNodes: () => {
            const base = FlipflopBaseDef.makeNodes(2)
            const s = S.Components.FlipflopT
            return {
                ins: {
                    ...base.ins,
                    T: [-4, -2, "w", s.InputTDesc],
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
        const q = this.outputs.Q.value
        return t ? LogicValue.invert(q) : q
    }

}
FlipflopTDef.impl = FlipflopT
