import * as t from "io-ts"
import { COLOR_COMPONENT_BORDER, COLOR_UNKNOWN, displayValuesFromArray, formatWithRadix } from "../drawutils"
import { b, div, emptyMod, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { InteractionResult, Mode, isUnknown, typeOrUndefined } from "../utils"
import { ComponentBase, ComponentName, ComponentNameRepr, Repr, defineComponent, groupVertical } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuData, MenuItems, Orientation } from "./Drawable"


export const DisplayAsciiDef =
    defineComponent("ascii", {
        idPrefix: "disp",
        button: { imgWidth: 32 },
        repr: {
            name: ComponentNameRepr,
            additionalReprRadix: typeOrUndefined(t.number),
            showAsUnknown: typeOrUndefined(t.boolean),
        },
        valueDefaults: {},
        size: { gridWidth: 4, gridHeight: 8 },
        makeNodes: () => ({
            ins: {
                Z: groupVertical("w", -3, 0, 7),
            },
        }),
        initialValue: (): [string, number | "?"] => ["0000000", 0],
    })

export type DisplayAsciiRepr = Repr<typeof DisplayAsciiDef>

export class DisplayAscii extends ComponentBase<DisplayAsciiRepr> {

    private _name: ComponentName
    private _additionalReprRadix: number | undefined
    private _showAsUnknown: boolean

    public constructor(parent: DrawableParent, saved?: DisplayAsciiRepr) {
        super(parent, DisplayAsciiDef, saved)
        this._name = saved?.name ?? undefined
        this._additionalReprRadix = saved?.additionalReprRadix ?? undefined
        this._showAsUnknown = saved?.showAsUnknown ?? false
    }

    public toJSON() {
        return {
            ...this.toJSONBase(),
            name: this._name,
            additionalReprRadix: this._additionalReprRadix,
            showAsUnknown: (this._showAsUnknown) ? true : undefined,
        }
    }

    private get showAsUnknown() {
        return this._showAsUnknown || this.parent.editor.options.hideOutputColors
    }

    public override makeTooltip() {
        const s = S.Components.DisplayAscii.tooltip
        const [binaryStringRep, value] = this.value

        return tooltipContent(s.title, mods(
            div(s.desc[0], b(binaryStringRep), s.desc[1]),
            this.showAsUnknown
                ? emptyMod
                : isUnknown(value)
                    ? div(s.CurrentlyUndefined)
                    : mods(s.CurrentlyThisCharacter + " ", b("" + value),
                        (value < 32)
                            ? s.WhichIsNotPrintable
                            : mods(", ‘", b(String.fromCharCode(value)), "’.")
                    )
        ))
    }

    protected doRecalcValue() {
        const values = this.inputValues(this.inputs.Z)
        return displayValuesFromArray(values, false)
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        const [binaryStringRep, value] = this.value
        let mainText: string
        let mainTextFont: string
        let mainTextStyle = COLOR_COMPONENT_BORDER
        if (isUnknown(value) || this.showAsUnknown) {
            mainTextFont = "bold 18px sans-serif"
            if (this.showAsUnknown) {
                mainTextStyle = COLOR_UNKNOWN
            }
            mainText = "?"
        } else {
            mainText = DisplayAscii.numberToAscii(value)
            if (value < 32) {
                // non-printable
                mainTextFont = "16px sans-serif"
            } else {
                mainTextFont = "bold 18px sans-serif"
            }
        }

        this.doDrawDefault(g, ctx, {
            skipLabels: true,
            componentName: [this._name, true, mainText],
            drawLabels: (ctx, { width, height }) => {
                const isVertical = Orientation.isVertical(this.orient)
                const hasAdditionalRepresentation = this._additionalReprRadix !== undefined
                let mainTextPosY = this.posY + (isVertical ? 4 : 0)

                g.font = "9px sans-serif"
                g.fillStyle = COLOR_COMPONENT_BORDER

                if (!this.showAsUnknown) {
                    if (isVertical && hasAdditionalRepresentation) {
                        // upper left corner
                        g.textAlign = "start"
                        g.fillText(binaryStringRep, this.posX - height / 2 + 3, this.posY - width / 2 + 8)
                        g.textAlign = "center"
                    } else {
                        // upper center
                        g.textAlign = "center"
                        g.fillText(binaryStringRep, this.posX, this.posY + (isVertical ? -width / 2 + 8 : -height / 2 + 10))
                    }

                    if (hasAdditionalRepresentation) {
                        const additionalRepr = formatWithRadix(value, this._additionalReprRadix ?? 10, 7)
                        g.font = "bold 11px sans-serif"
                        if (isVertical) {
                            // upper right
                            g.textAlign = "end"
                            g.fillText(additionalRepr, this.posX + height / 2 - 3, this.posY - width / 2 + 9)
                            g.textAlign = "center"
                        } else {
                            // center, below bin repr
                            g.fillText(additionalRepr, this.posX, this.posY - height / 2 + 22)
                            mainTextPosY += 8 // shift main repr a bit
                        }
                    }
                }

                g.font = mainTextFont
                g.fillStyle = mainTextStyle
                g.fillText(mainText, this.posX, mainTextPosY)
            },
        })
    }

    public static numberToAscii(n: number): string {
        if (n < 32) {
            // non-printable
            return "\\" + n
        }
        return String.fromCharCode(n)
    }

    public override mouseDoubleClicked(e: MouseEvent | TouchEvent) {
        const superChange = super.mouseDoubleClicked(e)
        if (superChange.isChange) {
            return superChange // already handled
        }
        const mode = this.parent.mode
        if (mode >= Mode.FULL && e.altKey) {
            this.doSetShowAsUnknown(!this._showAsUnknown)
            return InteractionResult.SimpleChange
        } else if (mode >= Mode.DESIGN) {
            this.doSetAdditionalDisplayRadix((() => {
                switch (this._additionalReprRadix) {
                    case undefined: return 10
                    case 10: return 16
                    case 16: return undefined
                    default: return undefined
                }
            })())
            return InteractionResult.SimpleChange
        }
        return InteractionResult.NoChange
    }

    private doSetName(name: ComponentName) {
        this._name = name
        this.requestRedraw({ why: "name changed" })
    }

    private doSetShowAsUnknown(showAsUnknown: boolean) {
        this._showAsUnknown = showAsUnknown
        this.requestRedraw({ why: "display as unknown changed" })
    }

    private doSetAdditionalDisplayRadix(additionalReprRadix: number | undefined) {
        this._additionalReprRadix = additionalReprRadix
        this.requestRedraw({ why: "additional display radix changed" })
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {

        const s = S.Components.DisplayAscii.contextMenu

        const makeItemShowAs = (desc: string, handler: () => void, isCurrent: boolean,) => {
            const icon = isCurrent ? "check" : "none"
            return MenuData.item(icon, desc, handler)
        }

        const makeItemShowRadix = (radix: number | undefined, desc: string) => {
            return makeItemShowAs(desc,
                () => this.doSetAdditionalDisplayRadix(radix),
                this._additionalReprRadix === radix
            )
        }

        return [
            ["mid", MenuData.submenu("eye", s.AdditionalDisplay, [
                makeItemShowRadix(undefined, s.DisplayNone),
                makeItemShowRadix(10, s.DisplayDecimal),
                makeItemShowRadix(16, s.DisplayHex),
                MenuData.sep(),
                MenuData.text(s.ChangeDisplayDesc),
            ])],
            ["mid", makeItemShowAs(S.Components.Generic.contextMenu.ShowAsUnknown, () => this.doSetShowAsUnknown(!this._showAsUnknown), this._showAsUnknown)],
            ["mid", MenuData.sep()],
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
DisplayAsciiDef.impl = DisplayAscii
