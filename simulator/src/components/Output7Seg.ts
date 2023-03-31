import * as t from "io-ts"
import { COLOR_OFF_BACKGROUND } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { ArrayFillWith, LogicValue, toLogicValueRepr, typeOrUndefined } from "../utils"
import { ComponentNameRepr, defineComponent, group, Repr } from "./Component"
import { DrawContext } from "./Drawable"
import { ledColorForLogicValue, LedColors, OutputBarBase } from "./OutputBar"


export const Output7SegDef =
    defineComponent("out", "7seg", {
        button: { imgWidth: 32 },
        repr: {
            color: typeOrUndefined(t.keyof(LedColors, "LedColor")),
            transparent: typeOrUndefined(t.boolean),
            name: ComponentNameRepr,
        },
        valueDefaults: {},
        size: { gridWidth: 8, gridHeight: 10 },
        makeNodes: () => ({
            ins: {
                In: group("w", [
                    [-5, -4, "a"],
                    [-5, -3, "b"],
                    [-5, -2, "c"],
                    [-5, -1, "d"],
                    [-5, 0, "e"],
                    [-5, +1, "f"],
                    [-5, +2, "g"],
                    [-5, +4, "p"],
                ]),
            },
        }),
        initialValue: () => ArrayFillWith<LogicValue>(false, 8),
    })


export type Output7SegRepr = Repr<typeof Output7SegDef>

export class Output7Seg extends OutputBarBase<Output7SegRepr, LogicValue[]> {

    public constructor(editor: LogicEditor, saved?: Output7SegRepr) {
        super(editor, Output7SegDef, true, saved)
    }

    public toJSON() {
        return {
            type: "7seg" as const,
            ...this.toJSONBase(),
        }
    }

    public override makeTooltip() {
        return tooltipContent(undefined, mods(
            div(S.Components.Output7Seg.tooltip)
        ))
    }

    protected doRecalcValue(): LogicValue[] {
        return this.inputValues(this.inputs.In)
    }

    protected override doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, {
            labelSize: 9,
            componentName: [this._name, true, () => this.value.map(toLogicValueRepr).reverse().join("")],
            drawInside: ({ left, right, top, bottom }) => {
                const [a, b, c, d, e, f, gg, p] = this.value

                const hMargin = 20
                const vMargin = 10
                const strokeHalfWidth = 4
                const drawLeft = left + hMargin
                const drawRight = right - hMargin
                const drawTop = top + vMargin
                const drawBottom = bottom - vMargin

                const doFill = (v: LogicValue) => {
                    if (!this._transparent || v !== false) {
                        g.fillStyle = ledColorForLogicValue(v, this._color)
                        g.fill()
                    }
                }

                const drawH = (v: LogicValue, y: number) => {
                    g.beginPath()
                    g.moveTo(drawLeft + strokeHalfWidth, y)
                    g.lineTo(drawLeft + strokeHalfWidth + strokeHalfWidth, y - strokeHalfWidth)
                    g.lineTo(drawRight - strokeHalfWidth - strokeHalfWidth, y - strokeHalfWidth)
                    g.lineTo(drawRight - strokeHalfWidth, y)
                    g.lineTo(drawRight - strokeHalfWidth - strokeHalfWidth, y + strokeHalfWidth)
                    g.lineTo(drawLeft + strokeHalfWidth + strokeHalfWidth, y + strokeHalfWidth)
                    g.closePath()
                    g.stroke()
                    doFill(v)
                }

                const drawV = (v: LogicValue, x: number, yTop: number, yBottom: number) => {
                    g.beginPath()
                    g.moveTo(x, yTop)
                    g.lineTo(x + strokeHalfWidth, yTop + strokeHalfWidth)
                    g.lineTo(x + strokeHalfWidth, yBottom - strokeHalfWidth)
                    g.lineTo(x, yBottom)
                    g.lineTo(x - strokeHalfWidth, yBottom - strokeHalfWidth)
                    g.lineTo(x - strokeHalfWidth, yTop + strokeHalfWidth)
                    g.closePath()
                    g.stroke()
                    doFill(v)
                }

                g.strokeStyle = COLOR_OFF_BACKGROUND
                g.lineWidth = 1
                drawH(a, drawTop + strokeHalfWidth)
                drawV(b, drawRight - strokeHalfWidth, drawTop + strokeHalfWidth, this.posY)
                drawV(c, drawRight - strokeHalfWidth, this.posY, drawBottom - strokeHalfWidth)
                drawH(d, drawBottom - strokeHalfWidth)
                drawV(e, drawLeft + strokeHalfWidth, this.posY, drawBottom - strokeHalfWidth)
                drawV(f, drawLeft + strokeHalfWidth, drawTop + strokeHalfWidth, this.posY)
                drawH(gg, this.posY)

                g.beginPath()
                const radius = 1.3 * strokeHalfWidth
                g.arc(right - hMargin / 2, bottom - vMargin - radius / 2, radius, 0, 2 * Math.PI)
                g.stroke()
                doFill(p)
            },
        })
    }

}
Output7SegDef.impl = Output7Seg
