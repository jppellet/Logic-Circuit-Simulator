import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, drawWireLineToComponent, GRID_STEP } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { HighImpedance, isHighImpedance, isUnknown, LogicValue, Unknown } from "../utils"
import { ComponentBase, defineComponent, Repr } from "./Component"
import { DrawableParent, DrawContext, GraphicsRendering } from "./Drawable"

export const TristateBufferDef =
    defineComponent("tristate", {
        idPrefix: "tristate",
        button: { imgWidth: 50 },
        valueDefaults: {},
        size: { gridWidth: 7, gridHeight: 4 },
        makeNodes: () => ({
            ins: {
                In: [-4, 0, "w", { leadLength: 20 }],
                E: [0, -3, "n", "E (Enable)", { leadLength: 20 }],
            },
            outs: {
                Out: [+4, 0, "e", { leadLength: 20 }],
            },
        }),
        initialValue: () => HighImpedance as LogicValue,
    })

type TristateBufferRepr = Repr<typeof TristateBufferDef>

export class TristateBuffer extends ComponentBase<TristateBufferRepr> {

    public constructor(parent: DrawableParent, saved?: TristateBufferRepr) {
        super(parent, TristateBufferDef, saved)
    }

    public toJSON() {
        return this.toJSONBase()
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

        const width = this.unrotatedWidth
        const height = this.unrotatedHeight
        const left = this.posX - width / 2
        // const right = left + width
        const top = this.posY - height / 2
        const bottom = top + height

        if (ctx.isMouseOver) {
            const frameWidth = 2
            const frameMargin = 2
            g.lineWidth = frameWidth
            g.strokeStyle = ctx.borderColor
            g.beginPath()
            g.rect(
                left - frameWidth - frameMargin,
                top - frameWidth - frameMargin,
                width + 2 * (frameWidth + frameMargin),
                height + 2 * (frameWidth + frameMargin)
            )
            g.stroke()
        }

        drawWireLineToComponent(g, this.inputs.In)
        drawWireLineToComponent(g, this.inputs.E)
        drawWireLineToComponent(g, this.outputs.Out)

        const gateWidth = (2 * Math.max(2, this.inputs._all.length)) * GRID_STEP
        const gateLeft = this.posX - gateWidth / 2
        const gateRight = this.posX + gateWidth / 2
        g.fillStyle = COLOR_BACKGROUND
        g.strokeStyle = COLOR_COMPONENT_BORDER
        g.lineWidth = 3

        g.beginPath()
        g.moveTo(gateLeft, top)
        g.lineTo(gateRight, this.posY)
        g.lineTo(gateLeft, bottom)
        g.closePath()
        g.stroke()
    }

}
TristateBufferDef.impl = TristateBuffer
