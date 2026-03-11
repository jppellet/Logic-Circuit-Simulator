import * as t from "io-ts"
import { COLOR_OFF_BACKGROUND } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillWith, LogicValue, toLogicValueRepr, typeOrUndefined } from "../utils"
import { ComponentNameRepr, Repr, defineComponent, group } from "./Component"
import { DisplayBarBase, LedColors, ledColorForLogicValue } from "./DisplayBar"
import { DrawContext, DrawableParent, GraphicsRendering } from "./Drawable"


export const Display16SegDef =
    defineComponent("16seg", true, true, {
        idPrefix: "16seg",
        button: { imgWidth: 32 },
        repr: {
            color: typeOrUndefined(t.keyof(LedColors, "LedColor")),
            transparent: typeOrUndefined(t.boolean),
            name: ComponentNameRepr,
        },
        valueDefaults: {},
        size: () => ({ gridWidth: 8, gridHeight: 10 }),
        makeNodes: () => ({
            ins: {
                In: group("w", [
                    [-5, -4, "a1"],
                    [-6, -3.5, "a2"],
                    [-5, -3, "b"],
                    [-6, -2.5, "c"],
                    [-5, -2, "d2"],
                    [-6, -1.5, "d1"],
                    [-5, -1, "e"],
                    [-6, -0.5, "f"],
                    [-5, 0, "g1"],
                    [-6, 0.5, "g2"],
                    [-5, +1, "h"],
                    [-6, +1.5, "i"],
                    [-5, +2, "j"],
                    [-6, +2.5, "k"],
                    [-5, +3, "l"],
                    [-6, +3.5, "m"],
                    [-5, +4, "p"],
                ]),
            },
        }),
        initialValue: () => ArrayFillWith<LogicValue>(false, 17),
    })

export type Display16SegRepr = Repr<typeof Display16SegDef>

export class Display16Seg extends DisplayBarBase<Display16SegRepr, LogicValue[]> {

    public constructor(parent: DrawableParent, saved?: Display16SegRepr) {
        super(parent, Display16SegDef.from(parent), true, saved)
    }

    public toJSON() {
        return this.toJSONBase()
    }

    public override makeTooltip() {
        return tooltipContent(undefined, mods(
            div(S.Components.Display16Seg.tooltip),
        ))
    }

    protected doRecalcValue(): LogicValue[] {
        return this.inputValues(this.inputs.In)
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, {
            labelSize: 7,
            componentName: [this._name, true, () => this.value.map(toLogicValueRepr).reverse().join("")],
            drawInside: ({ left, right, top, bottom }) => {
                const [a1, a2, b, c, d2, d1, e, f, g1, g2, h, i, j, k, l, m, p] = this.value

                const vMargin = 10
                const strokeHalfWidth = 3
                const drawLeft = left + 18
                const drawRight = right - 10
                const drawCenterX = (drawLeft + drawRight) / 2
                const drawTop = top + vMargin
                const drawBottom = bottom - vMargin

                const doFill = (v: LogicValue) => {
                    if (!this._transparent || v !== false) {
                        g.fillStyle = ledColorForLogicValue(v, this._color)
                        g.fill()
                    }
                }

                const drawH = (v: LogicValue, xLeft: number, xRight: number, y: number) => {
                    g.beginPath()
                    g.moveTo(xLeft, y)
                    g.lineTo(xLeft + strokeHalfWidth, y - strokeHalfWidth)
                    g.lineTo(xRight - strokeHalfWidth, y - strokeHalfWidth)
                    g.lineTo(xRight, y)
                    g.lineTo(xRight - strokeHalfWidth, y + strokeHalfWidth)
                    g.lineTo(xLeft + strokeHalfWidth, y + strokeHalfWidth)
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

                const dx = strokeHalfWidth * 1.41
                const dy = strokeHalfWidth * 1.41

                const drawBackslash = (v: LogicValue, xLeft: number, yTop: number, xRight: number, yBottom: number) => {
                    g.beginPath()
                    g.moveTo(xLeft, yTop)
                    g.lineTo(xLeft + dx, yTop)
                    g.lineTo(xRight, yBottom - dy)
                    g.lineTo(xRight, yBottom)
                    g.lineTo(xRight - dx, yBottom)
                    g.lineTo(xLeft, yTop + dy)
                    g.closePath()
                    g.stroke()
                    doFill(v)
                }

                const drawSlash = (v: LogicValue, xLeft: number, yBottom: number, xRight: number, yTop: number) => {
                    g.beginPath()
                    g.moveTo(xLeft, yBottom)
                    g.lineTo(xLeft, yBottom - dy)
                    g.lineTo(xRight - dx, yTop)
                    g.lineTo(xRight, yTop)
                    g.lineTo(xRight, yTop + dy)
                    g.lineTo(xLeft + dx, yBottom)
                    g.closePath()
                    g.stroke()
                    doFill(v)
                }

                g.strokeStyle = COLOR_OFF_BACKGROUND
                g.lineWidth = 1
                drawH(a1, drawLeft + strokeHalfWidth, drawCenterX, drawTop + strokeHalfWidth)
                drawH(a2, drawCenterX, drawRight - strokeHalfWidth, drawTop + strokeHalfWidth)
                drawV(b, drawRight - strokeHalfWidth, drawTop + strokeHalfWidth, this.posY)
                drawV(c, drawRight - strokeHalfWidth, this.posY, drawBottom - strokeHalfWidth)
                drawH(d1, drawLeft + strokeHalfWidth, drawCenterX, drawBottom - strokeHalfWidth)
                drawH(d2, drawCenterX, drawRight - strokeHalfWidth, drawBottom - strokeHalfWidth)
                drawV(e, drawLeft + strokeHalfWidth, this.posY, drawBottom - strokeHalfWidth)
                drawV(f, drawLeft + strokeHalfWidth, drawTop + strokeHalfWidth, this.posY)
                drawH(g1, drawLeft + strokeHalfWidth, drawCenterX, this.posY)
                drawH(g2, drawCenterX, drawRight - strokeHalfWidth, this.posY)
                drawV(i, drawCenterX, drawTop + strokeHalfWidth, this.posY)
                drawV(l, drawCenterX, this.posY, drawBottom - strokeHalfWidth)
                const slashTop = drawTop + strokeHalfWidth + strokeHalfWidth
                const slashBottom = drawBottom - strokeHalfWidth - strokeHalfWidth
                drawBackslash(h, drawLeft + strokeHalfWidth + strokeHalfWidth, slashTop, drawCenterX - strokeHalfWidth, this.posY - strokeHalfWidth)
                drawSlash(j, drawCenterX + strokeHalfWidth, this.posY - strokeHalfWidth, drawRight - strokeHalfWidth - strokeHalfWidth, slashTop)
                drawSlash(k, drawLeft + strokeHalfWidth + strokeHalfWidth, slashBottom, drawCenterX - strokeHalfWidth, this.posY + strokeHalfWidth)
                drawBackslash(m, drawCenterX + strokeHalfWidth, this.posY + strokeHalfWidth, drawRight - strokeHalfWidth - strokeHalfWidth, slashBottom)

                g.beginPath()
                const radius = 1.3 * strokeHalfWidth
                g.arc(right - 8, bottom - 7 - radius / 2, radius, 0, 2 * Math.PI)
                g.stroke()
                doFill(p)
            },
        })
    }

}
Display16SegDef.impl = Display16Seg
