import * as t from "io-ts"
import { COLOR_HIGH_IMPEDANCE, COLOR_LED_ON, COLOR_TRANSPARENT, COLOR_UNKNOWN, COLOR_WIRE_BORDER, GRID_STEP, pxToGrid } from "../drawutils"
import { Modifier, asValue, mods, span, style, title, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { HighImpedance, InteractionResult, LogicValue, Unknown, isHighImpedance, isUnknown, toLogicValueRepr, typeOrUndefined } from "../utils"
import { ComponentBase, ComponentName, ComponentNameRepr, InstantiatedComponentDef, NodesIn, NodesOut, Repr, defineComponent } from "./Component"
import { Display16SegRepr } from "./Display16Seg"
import { Display7SegRepr } from "./Display7Seg"
import { DrawContext, DrawableParent, GraphicsRendering, MenuData, MenuItems } from "./Drawable"



export const LedColors = {
    green: null,
    red: null,
    yellow: null,
} as const

export type LedColor = keyof typeof LedColors

export const DisplayBarTypes = {
    v: null,
    h: null,
    px: null,
    PX: null,
} as const

type DisplayBarType = keyof typeof DisplayBarTypes


export function ledColorForLogicValue(v: LogicValue, onColor: LedColor) {
    return isUnknown(v) ? COLOR_UNKNOWN :
        isHighImpedance(v) ? COLOR_HIGH_IMPEDANCE :
            v ? COLOR_LED_ON[onColor] : COLOR_WIRE_BORDER
}

type DisplayBarBaseRepr = DisplayBarRepr | Display7SegRepr | Display16SegRepr

export abstract class DisplayBarBase<TRepr extends DisplayBarBaseRepr, TValue> extends ComponentBase<
    TRepr,
    TValue,
    NodesIn<TRepr>,
    NodesOut<TRepr>,
    true, false
> {

    private readonly transparentDefault: boolean
    protected _color: LedColor
    protected _transparent: boolean
    protected _name: ComponentName

    protected constructor(parent: DrawableParent, SubclassDef: InstantiatedComponentDef<TRepr, TValue>, transparentDefault: boolean, saved?: TRepr) {
        super(parent, SubclassDef, saved)
        this.transparentDefault = transparentDefault

        this._color = saved?.color ?? DisplayBarDef.aults.color
        this._transparent = saved?.transparent ?? transparentDefault
        this._name = saved?.name ?? undefined
    }

    public override toJSONBase() {
        return {
            ...super.toJSONBase(),
            color: this._color === DisplayBarDef.aults.color ? undefined : this._color,
            transparent: this._transparent === this.transparentDefault ? undefined : this._transparent,
            name: this._name,
        }
    }

    private doSetName(name: ComponentName) {
        this._name = name
        this.setNeedsRedraw("name changed")
    }

    private doSetColor(color: LedColor) {
        this._color = color
        this.setNeedsRedraw("color changed")
    }

    private doSetTransparent(transparent: boolean) {
        this._transparent = transparent
        this.setNeedsRedraw("transparent changed")
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.DisplayBar.contextMenu

        const makeItemUseColor = (desc: string, color: LedColor) => {
            const isCurrent = this._color === color
            const icon = isCurrent ? "check" : "none"
            const action = isCurrent ? () => undefined : () => this.doSetColor(color)
            const cssColor = COLOR_LED_ON[color]
            return MenuData.item(icon, span(title(desc), style(`display: inline-block; width: 140px; height: 16px; background-color: ${cssColor}; margin-right: 8px`)), action)
        }

        const itemTransparent = MenuData.item(
            this._transparent ? "check" : "none",
            s.TransparentWhenOff,
            () => this.doSetTransparent(!this._transparent)
        )

        return [
            ["mid", MenuData.submenu("palette", s.Color, [
                makeItemUseColor(s.ColorGreen, "green"),
                makeItemUseColor(s.ColorRed, "red"),
                makeItemUseColor(s.ColorYellow, "yellow"),
                MenuData.sep(),
                itemTransparent,
            ])],
            ["mid", this.makeSetNameContextMenuItem(this._name, this.doSetName.bind(this))],
        ]
    }

    public override keyDown(e: KeyboardEvent): void {
        if (e.key === "Enter" && !e.altKey) {
            this.runSetNameDialog(this._name, this.doSetName.bind(this))
        } else {
            super.keyDown(e)
        }
    }

}



export const DisplayBarDef =
    defineComponent("bar", {
        idPrefix: "bar",
        button: { imgWidth: 32 },
        repr: {
            display: t.keyof(DisplayBarTypes, "OutputBarType"),
            color: typeOrUndefined(t.keyof(LedColors, "LedColor")),
            transparent: typeOrUndefined(t.boolean),
            name: ComponentNameRepr,
        },
        valueDefaults: {
            display: "h" as DisplayBarType,
            color: "green" as LedColor,
            transparent: true,
        },
        size: { gridWidth: 1, gridHeight: 1 }, // overridden
        makeNodes: () => ({
            ins: {
                I: [0, 0, "w"],
            },
        }),
        initialValue: () => false as LogicValue,
    })

export type DisplayBarRepr = Repr<typeof DisplayBarDef>

export class DisplayBar extends DisplayBarBase<DisplayBarRepr, LogicValue> {

    private _display!: DisplayBarType

    public constructor(parent: DrawableParent, saved?: DisplayBarRepr) {
        super(parent, DisplayBarDef, false, saved)

        this.doSetDisplay(saved?.display ?? DisplayBarDef.aults.display)
    }

    public toJSON() {
        return {
            ...super.toJSONBase(),
            display: this._display,
        }
    }

    public override get unrotatedWidth() {
        return this.getWidthAndHeight()[0]
    }

    public override get unrotatedHeight() {
        return this.getWidthAndHeight()[1]
    }

    public override makeTooltip() {
        const s = S.Components.DisplayBar.tooltip
        const expl: Modifier = (() => {
            switch (this.value) {
                case Unknown: return s.ValueUnknown
                case HighImpedance: return s.ValueUnknown
                case true: return mods(s.Value1[0], asValue(this.value), s.Value1[1])
                case false: return mods(s.Value0[0], asValue(this.value), s.Value0[1])
            }
        })()
        return tooltipContent(s.title, expl)
    }

    public get display() {
        return this._display
    }

    protected doRecalcValue(): LogicValue {
        return this.inputs.I.value
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        const valueToShow = this.parent.editor.options.hideOutputColors ? Unknown : this.value
        const background = this._transparent && valueToShow === false
            ? COLOR_TRANSPARENT
            : ledColorForLogicValue(valueToShow, this._color)

        this.doDrawDefault(g, ctx, {
            background,
            skipLabels: true,
            componentName: [this._name, true, toLogicValueRepr(valueToShow)],
        })
    }

    public getWidthAndHeight() {
        const w = 10
        const h = 2
        switch (this._display ?? DisplayBarDef.aults.display) {
            case "h":
                return [w * GRID_STEP, h * GRID_STEP] as const
            case "v":
                return [h * GRID_STEP, w * GRID_STEP] as const
            case "px":
                return [h * GRID_STEP, h * GRID_STEP] as const
            case "PX":
                return [w * GRID_STEP, w * GRID_STEP] as const
        }
    }

    public override mouseDoubleClicked(e: MouseEvent | TouchEvent) {
        const superChange = super.mouseDoubleClicked(e)
        if (superChange.isChange) {
            return superChange // already handled
        }
        this.doSetDisplay((() => {
            switch (this.display) {
                case "h":
                    return "v"
                case "v":
                    return "px"
                case "px":
                    return "PX"
                case "PX":
                    return "h"
            }
        })())
        return InteractionResult.SimpleChange
    }

    private doSetDisplay(newDisplay: DisplayBarType) {
        this._display = newDisplay
        this.updateInputOffsetX()
        this.setNeedsRedraw("display mode changed", true)
    }

    private updateInputOffsetX() {
        const width = this.getWidthAndHeight()[0]
        const input = this.inputs.I
        input.gridOffsetX = -pxToGrid(width / 2) - 1
        input.updateLeadLength()
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.DisplayBar.contextMenu

        const makeItemShowAs = (desc: string, display: DisplayBarType) => {
            const isCurrent = this._display === display
            const icon = isCurrent ? "check" : "none"
            const action = isCurrent ? () => undefined : () => { this.doSetDisplay(display) }
            return MenuData.item(icon, desc, action)
        }

        return [
            ["mid", MenuData.submenu("eye", s.Display, [
                makeItemShowAs(s.DisplayVerticalBar, "v"),
                makeItemShowAs(s.DisplayHorizontalBar, "h"),
                makeItemShowAs(s.DisplaySmallSquare, "px"),
                makeItemShowAs(s.DisplayLargeSquare, "PX"),
                MenuData.sep(),
                MenuData.text(s.DisplayChangeDesc),
            ])],
            ...super.makeComponentSpecificContextMenuItems(),
        ]
    }


}
DisplayBarDef.impl = DisplayBar
