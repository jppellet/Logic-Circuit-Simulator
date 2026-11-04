import * as t from "io-ts"
import { COLOR_UNKNOWN, GRID_STEP, TextVAlign, fillTextVAlign } from "../drawutils"
import { mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { FixedArray, FixedArrayFillWith, LogicValue, isHighImpedance, isUnknown, typeOrUndefined } from "../utils"
import { ParametrizedComponentBase, Repr, ResolvedParams, defineParametrizedComponent, paramBool } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuItems } from "./Drawable"


export const TrafficLightsDef =
    defineParametrizedComponent("tl", true, false, {
        variantName: ({ only2 }) => `tl-${only2 ? "2" : ""}`,
        idPrefix: "tl",
        button: { imgWidth: 32 },
        repr: {
            only2: typeOrUndefined(t.boolean),
        },
        valueDefaults: {},
        params: {
            only2: paramBool(),
        },
        validateParams: params => params,
        size: ({ only2 }) => ({
            gridWidth: 3,
            gridHeight: only2 ? 6 : 9,
        }),
        makeNodes: ({ only2 }) => {
            const rgOffset = only2 ? 1 : 2
            return {
                ins: {
                    r: [-2.5, -rgOffset, "w"],
                    ...(only2 ? {} : { o: [-2.5, 0, "w"] }),
                    g: [-2.5, rgOffset, "w"],
                },
            }
        },
        initialValue: (): FixedArray<LogicValue, 3> => FixedArrayFillWith(false, 3),
    })

export type TrafficLightsRepr = Repr<typeof TrafficLightsDef>
export type TrafficLightsParams = ResolvedParams<typeof TrafficLightsDef>

export class TrafficLights extends ParametrizedComponentBase<TrafficLightsRepr> {

    public readonly only2: boolean

    public constructor(parent: DrawableParent, params: TrafficLightsParams, saved?: TrafficLightsRepr) {
        super(parent, TrafficLightsDef.with(params), saved)

        this.only2 = params.only2
    }

    public toJSON() {
        return {
            ...this.toJSONBase(),
            only2: this.only2 ? true : undefined,
        }
    }

    public override makeTooltip() {
        const s = S.Components.TrafficLights
        return tooltipContent(undefined, mods(s.tooltip))
    }

    protected doRecalcValue(): FixedArray<LogicValue, 3> {
        return [this.inputs.r.value, this.inputs.o?.value ?? false, this.inputs.g.value]
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        super.doDrawDefault(g, ctx, { skipLabels: true })

        const [r_, o_, g_] = this.value
        const { left, top, width, height } = this.bounds()
        const radius = GRID_STEP * 1.2

        for (const [i, onColor, value] of [
            [0, "red", r_],
            [1, "orange", o_],
            [2, "green", g_],
        ] as const) {
            if (i === 1 && this.only2) {
                continue
            }
            const y = top + ((i - (this.only2 && i > 1 ? 1 : 0)) + 0.5) * height / (this.only2 ? 2 : 3)
            const x = left + width / 2
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

    public override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.TrafficLights.contextMenu
        return [
            this.makeChangeBooleanParamsContextMenuItem(s.ParamOnly2, this.only2, "only2"),
        ]
    }
}
TrafficLightsDef.impl = TrafficLights
