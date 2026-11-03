import { COLOR_UNKNOWN, TextVAlign, fillTextVAlign } from "../drawutils"
import { mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { FixedArray, FixedArrayFillWith, LogicValue, isHighImpedance, isUnknown } from "../utils"
import { ComponentBase, Repr, defineComponent } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering } from "./Drawable"


export const TrafficLightsDef =
    defineComponent("tl", true, false, {
        idPrefix: "tl",
        button: { imgWidth: 32 },
        repr: {},
        valueDefaults: {
            full: true,
        },
        size: () => ({
            gridWidth: 3,
            gridHeight: 9,
        }),
        makeNodes: () => ({
            ins: {
                r: [-2, -2, "w"],
                o: [-2, 0, "w"],
                g: [-2, 2, "w"],
            },
        }),
        initialValue: (): FixedArray<LogicValue, 3> => FixedArrayFillWith(false, 3),
    })

export type TrafficLightsRepr = Repr<typeof TrafficLightsDef>

export class TrafficLights extends ComponentBase<TrafficLightsRepr, FixedArray<LogicValue, 3>> {

    public constructor(parent: DrawableParent, saved?: TrafficLightsRepr) {
        super(parent, TrafficLightsDef.from(parent), saved)
    }

    public toJSON() {
        return this.toJSONBase()
    }

    public override makeTooltip() {
        const s = S.Components.TrafficLights
        return tooltipContent(undefined, mods(s.tooltip))
    }

    protected doRecalcValue(): FixedArray<LogicValue, 3> {
        return [this.inputs.r.value, this.inputs.o.value, this.inputs.g.value]
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        super.doDrawDefault(g, ctx, { skipLabels: true })

        const [r_, o_, g_] = this.value
        const { left, top, width, height } = this.bounds()

        for (const [i, onColor, value] of [
            [0, "red", r_],
            [1, "orange", o_],
            [2, "green", g_],
        ] as const) {
            const y = top + (i + 0.5) * height / 3
            const x = left + width / 2
            const radius = height / 8
            const unknown = isUnknown(value) || isHighImpedance(value)
            const color = unknown ? COLOR_UNKNOWN : value ? onColor : "black"
            g.beginPath()
            g.arc(x, y, radius, 0, Math.PI * 2)
            g.fillStyle = color
            g.fill()
            if (unknown) {
                g.fillStyle = "white"
                g.font = `bold ${radius * 1.5}px sans-serif`
                g.textAlign = "center"
                fillTextVAlign(g, TextVAlign.middle, "?", x, y)
            }
        }
    }
}
TrafficLightsDef.impl = TrafficLights
