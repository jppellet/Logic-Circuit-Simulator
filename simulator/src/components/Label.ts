import * as t from "io-ts"
import { COLOR_COMPONENT_BORDER, DrawZIndex, FONT_LABEL_DEFAULT, GRID_STEP, TextVAlign, fillTextVAlign } from "../drawutils"
import { S } from "../strings"
import { InteractionResult, typeOrUndefined } from "../utils"
import { ComponentBase, Repr, defineComponent } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuData, MenuItems } from "./Drawable"

export const LabelDef =
    defineComponent("label", {
        idPrefix: "label",
        button: { imgWidth: 32 },
        repr: {
            text: t.string,
            // align: typeOrUndefined(t.string), 
            font: typeOrUndefined(t.string),
        },
        valueDefaults: {
            text: "Label",
            // align: "center" as const,
            font: FONT_LABEL_DEFAULT,
        },
        size: { gridWidth: 4, gridHeight: 2 }, // overridden
        makeNodes: () => ({}),
    })

export type LabelRepr = Repr<typeof LabelDef>

export class Label extends ComponentBase<LabelRepr> {

    private _text: string
    // private _align: CanvasTextAlign // causes issues with mouseovers and stuff
    private _font: string
    private _cachedTextMetrics: TextMetrics | undefined = undefined

    public constructor(parent: DrawableParent, saved?: LabelRepr) {
        super(parent, LabelDef, saved)
        this._text = saved?.text ?? LabelDef.aults.text
        // this._align = (saved?.align as CanvasTextAlign) ?? LabelStringDefaults.align
        this._font = saved?.font ?? LabelDef.aults.font
    }

    public toJSON() {
        return {
            ...this.toJSONBase(),
            text: this._text,
            // align: this._align === LabelStringDefaults.align ? undefined : this._align,
            font: this._font === LabelDef.aults.font ? undefined : this._font,
        }
    }

    public override get unrotatedWidth() {
        return this._cachedTextMetrics?.width ?? GRID_STEP * this._text.length
    }

    public override get unrotatedHeight() {
        const metrics = this._cachedTextMetrics
        if (metrics === undefined) {
            return 2 * GRID_STEP
        }
        return metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
    }

    public get text() {
        return this._text
    }

    protected doRecalcValue(): undefined {
        return undefined
    }

    public override get drawZIndex(): DrawZIndex {
        return DrawZIndex.Overlay
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        g.font = this._font
        g.lineWidth = 3

        if (ctx.isMouseOver) {
            if (this._cachedTextMetrics === undefined) {
                this._cachedTextMetrics = g.measureText(this._text)
            }
            const width = this.unrotatedWidth
            const height = this.unrotatedHeight
            g.strokeStyle = ctx.borderColor
            g.beginPath()
            g.rect(this.posX - width / 2, this.posY - height / 2, width, height)
            g.stroke()
        }

        g.fillStyle = COLOR_COMPONENT_BORDER
        g.textAlign = "center"
        fillTextVAlign(g, TextVAlign.middle, this._text, this.posX, this.posY)
    }

    private doSetText(text: string) {
        this._text = text
        this._cachedTextMetrics = undefined
        this.requestRedraw({ why: "text changed", invalidateMask: true })
    }

    private doSetFont(font: string) {
        this._font = font
        this._cachedTextMetrics = undefined
        this.requestRedraw({ why: "font changed", invalidateMask: true })
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.Label.contextMenu
        const setTextItem = MenuData.item("pen", s.ChangeText, this.runSetTextDialog.bind(this), "↩︎")

        const setFontItem = MenuData.item("font", s.Font, () => {
            this.runSetFontDialog(this._font, LabelDef.aults.font, this.doSetFont.bind(this))
        })

        return [
            ["mid", setTextItem],
            ["mid", setFontItem],
        ]
    }

    private runSetTextDialog(): InteractionResult {
        const promptReturnValue = window.prompt(S.Components.Label.contextMenu.ChangeTextPrompt, this._text)
        if (promptReturnValue !== null) {
            // OK button pressed
            const newText = promptReturnValue.length === 0 ? LabelDef.aults.text : promptReturnValue
            this.doSetText(newText)
            return InteractionResult.SimpleChange
        }
        return InteractionResult.NoChange
    }

    public override keyDown(e: KeyboardEvent): void {
        if (e.key === "Enter" && !e.altKey) {
            this.runSetTextDialog()
        } else {
            super.keyDown(e)
        }
    }

    public override mouseDoubleClicked(e: MouseEvent | TouchEvent) {
        const superChange = super.mouseDoubleClicked(e)
        if (superChange.isChange) {
            return superChange // already handled
        }
        return this.runSetTextDialog()
    }

}
LabelDef.impl = Label
