import * as t from "io-ts"
import { COLOR_COMPONENT_BORDER, COLOR_RECTANGLE_BACKGROUND, COLOR_RECTANGLE_BORDER, DrawZIndex, FONT_LABEL_DEFAULT, GRID_STEP } from "../drawutils"
import { span, style, title } from "../htmlgen"
import { S } from "../strings"
import { InteractionResult, typeOrUndefined } from "../utils"
import { ComponentBase, Repr, defineComponent } from "./Component"
import { DrawContext, Drawable, DrawableParent, DrawableWithPosition, GraphicsRendering, MenuData, MenuItems } from "./Drawable"

export const RectangleColor = {
    grey: "grey",
    red: "red",
    blue: "blue",
    yellow: "yellow",
    green: "green",
    turquoise: "turquoise",
} as const

export type RectangleColor = keyof typeof RectangleColor

export const CaptionPosition = {
    n: "n",
    ne: "ne",
    e: "e",
    se: "se",
    s: "s",
    sw: "sw",
    w: "w",
    nw: "nw",
    c: "c",
} as const

export type CaptionPosition = keyof typeof CaptionPosition

export const RectangleDef =
    defineComponent("rect", {
        idPrefix: "rect",
        button: { imgWidth: 32 },
        repr: {
            w: t.number,
            h: t.number,
            color: typeOrUndefined(t.keyof(RectangleColor)),
            strokeWidth: typeOrUndefined(t.number),
            noFill: typeOrUndefined(t.boolean),
            rounded: typeOrUndefined(t.boolean),
            caption: typeOrUndefined(t.string),
            captionPos: typeOrUndefined(t.keyof(CaptionPosition)),
            captionInside: typeOrUndefined(t.boolean),
            font: typeOrUndefined(t.string),
        },
        valueDefaults: {
            width: 10 * GRID_STEP,
            height: 10 * GRID_STEP,
            color: RectangleColor.yellow,
            strokeWidth: 2,
            noFill: false,
            rounded: false,
            caption: undefined as string | undefined,
            captionPos: CaptionPosition.n,
            captionInside: false,
            font: FONT_LABEL_DEFAULT,
        },
        size: { gridWidth: 10, gridHeight: 10 },
        makeNodes: () => ({}),
    })

export type RectangleRepr = Repr<typeof RectangleDef>

export class Rectangle extends ComponentBase<RectangleRepr> {

    private _w: number
    private _h: number
    private _color: RectangleColor
    private _strokeWidth: number
    private _noFill: boolean
    private _rounded: boolean
    private _caption: string | undefined
    private _captionPos: CaptionPosition
    private _captionInside: boolean
    private _font: string

    public constructor(parent: DrawableParent, saved?: RectangleRepr) {
        super(parent, RectangleDef, saved)
        this._w = saved?.w ?? RectangleDef.aults.width
        this._h = saved?.h ?? RectangleDef.aults.height
        this._color = saved?.color ?? RectangleDef.aults.color
        this._strokeWidth = saved?.strokeWidth ?? RectangleDef.aults.strokeWidth
        this._noFill = saved?.noFill ?? RectangleDef.aults.noFill
        this._rounded = saved?.rounded ?? RectangleDef.aults.rounded
        this._caption = saved?.caption ?? RectangleDef.aults.caption
        this._captionPos = saved?.captionPos ?? RectangleDef.aults.captionPos
        this._captionInside = saved?.captionInside ?? RectangleDef.aults.captionInside
        this._font = saved?.font ?? RectangleDef.aults.font
    }

    public toJSON() {
        return {
            ...this.toJSONBase(),
            w: this._w,
            h: this._h,
            color: this._color,
            strokeWidth: this._strokeWidth,
            noFill: this._noFill === RectangleDef.aults.noFill ? undefined : this._noFill,
            rounded: this._rounded === RectangleDef.aults.rounded ? undefined : this._rounded,
            caption: this._caption === RectangleDef.aults.caption ? undefined : this._caption,
            captionPos: this._captionPos === RectangleDef.aults.captionPos ? undefined : this._captionPos,
            captionInside: this._captionInside === RectangleDef.aults.captionInside ? undefined : this._captionInside,
            font: this._font === RectangleDef.aults.font ? undefined : this._font,
        }
    }

    public override canRotate() {
        return false
    }

    public override get unrotatedWidth() {
        return this._w
    }

    public override get unrotatedHeight() {
        return this._h
    }

    protected doRecalcValue(): undefined {
        return undefined
    }

    public override get drawZIndex(): DrawZIndex {
        return DrawZIndex.Background
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        const width = this._w
        const height = this._h
        const left = this.posX - width / 2
        const top = this.posY - height / 2

        g.beginPath()
        if (this._rounded) {
            const r = 3 * this._strokeWidth
            g.moveTo(left + r, top)
            g.lineTo(left + width - r, top)
            g.quadraticCurveTo(left + width, top, left + width, top + r)
            g.lineTo(left + width, top + height - r)
            g.quadraticCurveTo(left + width, top + height, left + width - r, top + height)
            g.lineTo(left + r, top + height)
            g.quadraticCurveTo(left, top + height, left, top + height - r)
            g.lineTo(left, top + r)
            g.quadraticCurveTo(left, top, left + r, top)
        } else {
            g.rect(left, top, width, height)
        }
        g.closePath()

        if (!this._noFill) {
            g.fillStyle = COLOR_RECTANGLE_BACKGROUND[this._color]
            g.fill()
        }

        if (this._caption !== undefined) {
            g.fillStyle = COLOR_COMPONENT_BORDER
            g.font = this._font
            g.textAlign = "center"
            g.textBaseline = "middle"

            const metrics = g.measureText(this._caption)
            const offsetV = (metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent + this._strokeWidth) / 2 + 2
            const margin = 2
            const offsetH = (metrics.width + this._strokeWidth) / 2 + margin

            const captionY = (() => {
                switch (this._captionPos) {
                    case "c":
                    case "w":
                    case "e":
                        return this.posY
                    case "n":
                    case "nw":
                    case "ne":
                        return this.posY - this.height / 2 + (this._captionInside ? 1 : -1) * offsetV
                    case "s":
                    case "se":
                    case "sw":
                        return this.posY + this.height / 2 + (this._captionInside ? -1 : 1) * offsetV
                }
            })()

            const captionX = (() => {
                switch (this._captionPos) {
                    case "c":
                    case "n":
                    case "s":
                        return this.posX

                    case "w":
                        return this.posX - this.width / 2 + (this._captionInside ? 1 : -1) * offsetH
                    case "nw":
                    case "sw":
                        return this.posX - this.width / 2 + offsetH - (this._captionInside ? 0 : 1) * (margin + this._strokeWidth)

                    case "e":
                        return this.posX + this.width / 2 + (this._captionInside ? -1 : 1) * offsetH
                    case "ne":
                    case "se":
                        return this.posX + this.width / 2 - offsetH + (this._captionInside ? 0 : 1) * (margin + this._strokeWidth)
                }
            })()

            g.fillText(this._caption, captionX, captionY)
        }

        if (ctx.isMouseOver) {
            g.lineWidth = Math.max(3, this._strokeWidth)
            g.strokeStyle = ctx.borderColor
            g.stroke()
        } else if (this._strokeWidth > 0) {
            g.lineWidth = this._strokeWidth
            g.strokeStyle = COLOR_RECTANGLE_BORDER[this._color]
            g.stroke()
        }
    }

    private doSetColor(color: RectangleColor) {
        this._color = color
        this.setNeedsRedraw("color changed")
    }

    private doSetStrokeWidth(strokeWidth: number) {
        this._strokeWidth = strokeWidth
        this.setNeedsRedraw("stroke width changed", true)
    }

    private doSetCaption(caption: string | undefined) {
        this._caption = caption
        this.setNeedsRedraw("caption changed")
    }

    private doSetCaptionPos(captionPos: CaptionPosition) {
        this._captionPos = captionPos
        this.setNeedsRedraw("caption position changed")
    }

    private doSetFont(font: string) {
        this._font = font
        this.setNeedsRedraw("font changed")
    }

    private makeCurrentSizeString() {
        return `${this._w} × ${this._h}`
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.Rectangle.contextMenu
        const currentSizeStr = this.makeCurrentSizeString()
        const setSizeItem = MenuData.item("dimensions", s.Size + ` (${currentSizeStr})…`, () => this.runSetSizeDialog(currentSizeStr))

        const makeSetStrokeWidthItem = (strokeWidth: number, desc: string) => {
            const isCurrent = this._strokeWidth === strokeWidth
            const icon = isCurrent ? "check" : "none"
            return MenuData.item(icon, desc, () => this.doSetStrokeWidth(strokeWidth))
        }

        const makeItemUseColor = (desc: string, color: RectangleColor) => {
            const isCurrent = this._color === color
            const icon = isCurrent ? "check" : "none"
            const action = isCurrent ? () => undefined : () => this.doSetColor(color)
            if (color !== undefined) {
                const fillColorProp = this._noFill ? "" : `background-color: ${COLOR_RECTANGLE_BACKGROUND[color]}; `
                const roundedProp = !this._rounded ? "" : "border-radius: 4px; "
                const borderColor = COLOR_RECTANGLE_BORDER[color]
                return MenuData.item(icon, span(title(desc), style(`display: inline-block; width: 140px; height: 18px; ${fillColorProp}${roundedProp}margin-right: 8px; border: 2px solid ${borderColor}`)), action)
            } else {
                return MenuData.item(icon, desc, action)
            }
        }

        const toggleRoundedItem = MenuData.item(this._rounded ? "check" : "none", s.Rounded, () => {
            this._rounded = !this._rounded
            this.setNeedsRedraw("rounded changed")
        })

        const toggleNoFillItem = MenuData.item(!this._noFill ? "check" : "none", s.WithBackgroundColor, () => {
            this._noFill = !this._noFill
            this.setNeedsRedraw("nofill changed")
        })

        const setCaptionItemName = this._caption !== undefined ? s.ChangeTitle : s.SetTitle
        const setCaptionItem = MenuData.item("pen", setCaptionItemName, () => this.runSetCaptionDialog(), "↩︎")

        const makeItemSetPlacement = (desc: string, placement: CaptionPosition) => {
            const isCurrent = this._captionPos === placement
            const icon = isCurrent ? "check" : "none"
            const action = isCurrent ? () => undefined : () => this.doSetCaptionPos(placement)
            return MenuData.item(icon, desc, action)
        }

        const toggleCaptionInsideItems = this._captionPos === "c" ? [] : [
            MenuData.item(this._captionInside ? "check" : "none", s.InsideFrame, () => {
                this._captionInside = !this._captionInside
                this.setNeedsRedraw("caption inside changed")
            }),
            MenuData.sep(),
        ]

        const setFontItem = MenuData.item("font", s.Font, () => {
            this.runSetFontDialog(this._font, RectangleDef.aults.font, this.doSetFont.bind(this))
        })

        return [
            ["mid", setSizeItem],
            ["mid", MenuData.submenu("palette", s.Color, [
                toggleNoFillItem,
                MenuData.sep(),
                makeItemUseColor(s.ColorYellow, RectangleColor.yellow),
                makeItemUseColor(s.ColorRed, RectangleColor.red),
                makeItemUseColor(s.ColorGreen, RectangleColor.green),
                makeItemUseColor(s.ColorBlue, RectangleColor.blue),
                makeItemUseColor(s.ColorTurquoise, RectangleColor.turquoise),
                makeItemUseColor(s.ColorGrey, RectangleColor.grey),
            ])],
            ["mid", MenuData.submenu("strokewidth", s.Border, [
                makeSetStrokeWidthItem(0, s.BorderNone),
                MenuData.sep(),
                makeSetStrokeWidthItem(1, s.Border1px),
                makeSetStrokeWidthItem(2, s.Border2px),
                makeSetStrokeWidthItem(3, s.Border3px),
                makeSetStrokeWidthItem(5, s.Border5px),
                makeSetStrokeWidthItem(10, s.Border10px),
            ])],
            ["mid", toggleRoundedItem],
            ["mid", MenuData.sep()],
            ["mid", setCaptionItem],
            ["mid", setFontItem],
            ["mid", MenuData.submenu("placement", s.TitlePlacement, [
                ...toggleCaptionInsideItems,
                makeItemSetPlacement(s.PlacementTop, CaptionPosition.n),
                makeItemSetPlacement(s.PlacementTopLeft, CaptionPosition.nw),
                makeItemSetPlacement(s.PlacementTopRight, CaptionPosition.ne),
                makeItemSetPlacement(s.PlacementBottom, CaptionPosition.s),
                makeItemSetPlacement(s.PlacementBottomLeft, CaptionPosition.sw),
                makeItemSetPlacement(s.PlacementBottomRight, CaptionPosition.se),
                makeItemSetPlacement(s.PlacementLeft, CaptionPosition.w),
                makeItemSetPlacement(s.PlacementRight, CaptionPosition.e),
                makeItemSetPlacement(s.PlacementCenter, CaptionPosition.c),
            ])],
        ]
    }

    private runSetSizeDialog(currentSizeStr: string) {
        const promptReturnValue = window.prompt(S.Components.Rectangle.contextMenu.SizePrompt, currentSizeStr)
        if (promptReturnValue !== null) {
            let match
            if ((match = /^(?<w>\d*)((\s+|( *[×x,;] *))(?<h>\d*))?$/.exec(promptReturnValue)) !== null) {
                const parse = (s: string | undefined, dflt: number) => {
                    if (s === undefined) {
                        return dflt
                    }
                    const n = parseInt(s)
                    if (isNaN(n) || n <= 0) {
                        return dflt
                    }
                    return n
                }
                const w = parse(match.groups?.w, this._w)
                const h = parse(match.groups?.h, this._h)
                this.doSetDimensions(w, h)
            }
        }
    }

    private doSetDimensions(w: number, h: number) {
        this._w = w
        this._h = h
        this.setNeedsRedraw("size changed", true)
    }

    public wrapContents(selectedComps: Set<Drawable>) {
        if (selectedComps.size === 0) {
            return
        }

        let left = Number.POSITIVE_INFINITY
        let top = Number.POSITIVE_INFINITY
        let right = Number.NEGATIVE_INFINITY
        let bottom = Number.NEGATIVE_INFINITY
        for (const comp of selectedComps) {
            if (comp instanceof DrawableWithPosition) {
                left = Math.min(left, comp.posX - comp.width / 2)
                top = Math.min(top, comp.posY - comp.height / 2)
                right = Math.max(right, comp.posX + comp.width / 2)
                bottom = Math.max(bottom, comp.posY + comp.height / 2)
            }
        }

        const tryX = (left + right) / 2
        const tryY = (top + bottom) / 2
        const [x, y] = this.trySetPosition(tryX, tryY, true) ?? [tryX, tryY]

        left = Math.floor((left + Math.max(0, tryX - x)) / GRID_STEP) * GRID_STEP
        top = Math.floor((top + Math.max(0, tryY - y)) / GRID_STEP) * GRID_STEP
        right = Math.ceil((right + Math.max(0, x - tryX)) / GRID_STEP) * GRID_STEP
        bottom = Math.ceil((bottom + Math.max(0, y - tryY)) / GRID_STEP) * GRID_STEP
        const w = right - left + 4 * GRID_STEP
        const h = bottom - top + 4 * GRID_STEP
        this.doSetDimensions(w, h)
    }

    private runSetCaptionDialog() {
        const promptReturnValue = window.prompt(S.Components.Rectangle.contextMenu.SetTitlePrompt, this._caption)
        if (promptReturnValue !== null) {
            // OK button pressed
            const newCaption = promptReturnValue.length === 0 ? undefined : promptReturnValue
            this.doSetCaption(newCaption)
        }
    }

    public override mouseDoubleClicked(__e: MouseEvent | TouchEvent): InteractionResult {
        // TODO: implement dragging for resizing the rectangle
        // don't call super, which would rotate the rectangle, this is useless here
        this.runSetSizeDialog(this.makeCurrentSizeString())
        return InteractionResult.SimpleChange
    }

    public override keyDown(e: KeyboardEvent): void {
        if (e.key === "Enter" && !e.altKey) {
            this.runSetCaptionDialog()
        } else {
            super.keyDown(e)
        }
    }

}
RectangleDef.impl = Rectangle
