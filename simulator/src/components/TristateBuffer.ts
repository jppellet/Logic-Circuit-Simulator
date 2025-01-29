import * as t from "io-ts"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_MOUSE_OVER, drawWireLineToComponent, GRID_STEP } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { HighImpedance, isHighImpedance, isUnknown, LogicValue, typeOrUndefined, Unknown } from "../utils"
import { defineParametrizedComponent, paramBool, ParametrizedComponentBase, Repr, ResolvedParams } from "./Component"
import { DrawableParent, DrawContext, GraphicsRendering, MenuItems } from "./Drawable"

export const TristateBufferDef =
    defineParametrizedComponent("tristate", true, true, {
        variantName: ({ bottom }) => `tristate${bottom ? "b" : ""}`,
        idPrefix: "tristate",
        button: { imgWidth: 50 },
        repr: {
            bottom: typeOrUndefined(t.boolean),
        },
        valueDefaults: {},
        params: {
            bottom: paramBool(),
        },
        validateParams: ({ bottom }) => {
            return { controlPinsAtBottom: bottom }
        },
        size: () => ({ gridWidth: 4, gridHeight: 4 }),
        makeNodes: ({ controlPinsAtBottom }) => ({
            ins: {
                In: [-4, 0, "w", { leadLength: 20 }],
                E: [0,
                    controlPinsAtBottom ? 3 : -3,
                    controlPinsAtBottom ? "s" : "n",
                    "E (Enable)", { leadLength: 20 },
                ],
            },
            outs: {
                Out: [+4, 0, "e", { leadLength: 20 }],
            },
        }),
        initialValue: () => HighImpedance as LogicValue,
    })

type TristateBufferRepr = Repr<typeof TristateBufferDef>
type TristateBufferParams = ResolvedParams<typeof TristateBufferDef>

export class TristateBuffer extends ParametrizedComponentBase<TristateBufferRepr> {

    public readonly controlPinsAtBottom: boolean

    public constructor(parent: DrawableParent, params: TristateBufferParams, saved?: TristateBufferRepr) {
        super(parent, TristateBufferDef.with(params), saved)

        this.controlPinsAtBottom = params.controlPinsAtBottom
    }

    public toJSON() {
        return {
            ... this.toJSONBase(),
            bottom: this.controlPinsAtBottom === TristateBufferDef.aults.bottom ? undefined : this.controlPinsAtBottom,
        }
    }

    public override makeTooltip() {
        return tooltipContent(undefined, mods(
            div(S.Components.TristateBuffer.tooltip) // TODO
        ))
    }

    protected doRecalcValue(): LogicValue {
        const en = this.inputs.E.value
        if (isUnknown(en) || isHighImpedance(en)) {
            return Unknown
        }
        if (!en) {
            return HighImpedance
        }
        const i = this.inputs.In.value
        if (isHighImpedance(i)) {
            return Unknown
        }
        return i
    }

    protected override propagateValue(newValue: LogicValue) {
        this.outputs.Out.value = newValue
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {

        drawWireLineToComponent(g, this.inputs.In)
        drawWireLineToComponent(g, this.inputs.E)
        drawWireLineToComponent(g, this.outputs.Out)

        const { top, bottom } = this.bounds()
        const gateWidth = (2 * Math.max(2, this.inputs._all.length)) * GRID_STEP
        const gateLeft = this.posX - gateWidth / 2
        const gateRight = this.posX + gateWidth / 2
        g.fillStyle = COLOR_BACKGROUND
        g.strokeStyle = ctx.isMouseOver ? COLOR_MOUSE_OVER : COLOR_COMPONENT_BORDER
        g.lineWidth = 3

        g.beginPath()
        g.moveTo(gateLeft, top)
        g.lineTo(gateRight, this.posY)
        g.lineTo(gateLeft, bottom)
        g.closePath()
        g.stroke()
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        return [
            this.makeChangeBooleanParamsContextMenuItem(S.Components.Generic.contextMenu.ParamControlBitAtBottom, this.controlPinsAtBottom, "bottom"),
        ]
    }

}
TristateBufferDef.impl = TristateBuffer
