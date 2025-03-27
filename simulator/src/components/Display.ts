import * as t from "io-ts"
import { COLOR_UNKNOWN, ColorString, TextVAlign, colorCompsRGB, colorForFraction, displayValuesFromArray, fillTextVAlign, formatWithRadix, useCompact } from "../drawutils"
import { b, div, emptyMod, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { InteractionResult, Mode, Unknown, isUnknown, typeOrUndefined } from "../utils"
import { ComponentName, ComponentNameRepr, ParametrizedComponentBase, Repr, ResolvedParams, defineParametrizedComponent, groupVertical, param } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuData, MenuItems, Orientation } from "./Drawable"

export const DisplayDef =
    defineParametrizedComponent("display", true, false, {
        variantName: ({ bits }) => `display-${bits}`,
        idPrefix: "disp",
        button: { imgWidth: 32 },
        repr: {
            bits: typeOrUndefined(t.number),
            name: ComponentNameRepr,
            radix: typeOrUndefined(t.number),
            showAsUnknown: typeOrUndefined(t.boolean),
        },
        valueDefaults: {
            radix: 10,
            showAsUnknown: false,
        },
        params: {
            bits: param(4, [3, 4, 8, 16]),
        },
        validateParams: ({ bits }) => ({
            numBits: bits,
        }),
        size: ({ numBits }) => ({
            gridWidth: 2 + Math.ceil(numBits / 2),
            gridHeight: useCompact(numBits) ? numBits : 2 * numBits,
        }),
        makeNodes: ({ numBits, gridWidth }) => {
            const inX = -gridWidth / 2 - 1
            return {
                ins: {
                    In: groupVertical("w", inX, 0, numBits),
                },
            }
        },
        initialValue: (saved, { numBits }): [string, number | Unknown] =>
            [repeatString("0", numBits), 0],
    })


export type DisplayRepr = Repr<typeof DisplayDef>
export type DisplayParams = ResolvedParams<typeof DisplayDef>


export class Display extends ParametrizedComponentBase<DisplayRepr> {

    public readonly numBits: number
    private _name: ComponentName
    private _radix: number
    private _showAsUnknown: boolean

    public constructor(parent: DrawableParent, params: DisplayParams, saved?: DisplayRepr) {
        super(parent, DisplayDef.with(params), saved)

        this.numBits = params.numBits

        this._name = saved?.name ?? undefined
        this._radix = saved?.radix ?? DisplayDef.aults.radix
        this._showAsUnknown = saved?.showAsUnknown ?? DisplayDef.aults.showAsUnknown
    }

    public toJSON() {
        return {
            ...this.toJSONBase(),
            bits: this.numBits === DisplayDef.aults.bits ? undefined : this.numBits,
            name: this._name,
            radix: this._radix === DisplayDef.aults.radix ? undefined : this._radix,
            showAsUnknown: this._showAsUnknown === DisplayDef.aults.showAsUnknown ? undefined : this._showAsUnknown,
        }
    }

    private get showAsUnknown() {
        return this._showAsUnknown || this.parent.editor.options.hideOutputColors
    }

    public override makeTooltip() {
        const s = S.Components.Display.tooltip
        const radixStr = (() => {
            switch (this._radix) {
                case 2: return s.RadixBinary
                case 10: return s.RadixDecimal
                case -10: return s.RadixSignedDecimal
                case 16: return s.RadixHexadecimal
                default: return s.RadixGeneric.expand({ radix: this._radix })
            }
        })()
        const [binaryStringRep, value] = this.value

        const sParams = { numBits: this.numBits, radixStr }
        return tooltipContent(s.title.expand(sParams), mods(
            div(s.desc[0].expand(sParams) + " ", b(binaryStringRep), s.desc[1]),
            !isUnknown(value) || this.showAsUnknown
                ? emptyMod
                : div(s.CurrentlyUndefined)
        ))
    }

    protected doRecalcValue() {
        return displayValuesFromArray(this.inputValues(this.inputs.In), false)
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        const [binaryStringRep, value] = this.value
        const maxValue = (1 << this.inputs.In.length) - 1
        const background = isUnknown(value) || this.showAsUnknown ? COLOR_UNKNOWN : colorForFraction(value / maxValue)

        this.doDrawDefault(g, ctx, {
            background,
            skipLabels: true,
            componentName: [this._name, true, value],
            drawLabels: (ctx, { width, height }) => {
                const isVertical = Orientation.isVertical(this.orient)
                const backColorComps = colorCompsRGB(background)
                const textColor = ColorString(backColorComps[0] + backColorComps[1] + backColorComps[2] > 3 * 127 ? 0 : 0xFF)
                g.fillStyle = textColor

                g.textAlign = "center"

                if (!this.showAsUnknown) {
                    const [hasSpaces, spacedStringRep] = insertSpaces(binaryStringRep, this._radix)
                    g.font = `${hasSpaces ? 9 : 10}px sans-serif`
                    fillTextVAlign(g, TextVAlign.middle, spacedStringRep, this.posX, this.posY + (isVertical ? -width / 2 + 7 : -height / 2 + 8))
                }

                const mainSize = this.numBits === 4 && this._radix === 8 ? 16 : 18
                g.font = `bold ${mainSize}px sans-serif`

                const stringRep = this.showAsUnknown ? Unknown
                    : formatWithRadix(value, this._radix, this.numBits)
                fillTextVAlign(g, TextVAlign.middle, stringRep, this.posX, this.posY + (isVertical ? 6 : 0))
            },
        })
    }


    public override pointerDoubleClicked(e: PointerEvent) {
        const superChange = super.pointerDoubleClicked(e)
        if (superChange.isChange) {
            return superChange // already handled
        }
        const mode = this.parent.mode
        if (mode >= Mode.FULL && e.altKey) {
            this.doSetShowAsUnknown(!this._showAsUnknown)
            return InteractionResult.SimpleChange
        } else if (mode >= Mode.DESIGN) {
            this.doSetRadix(this._radix === 10 ? 16 : 10)
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

    private doSetRadix(radix: number) {
        this._radix = radix
        this.requestRedraw({ why: "radix changed" })
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {

        const s = S.Components.Display.contextMenu
        const makeItemShowAs = (desc: string, handler: () => void, isCurrent: boolean,) => {
            const icon = isCurrent ? "check" : "none"
            const caption = s.DisplayAs + " " + desc
            const action = isCurrent ? () => undefined : handler
            return MenuData.item(icon, caption, action)
        }

        const makeItemShowRadix = (radix: number, desc: string) => {
            return makeItemShowAs(desc, () => {
                if (this._showAsUnknown) {
                    this.doSetShowAsUnknown(false)
                }
                this.doSetRadix(radix)
            }, !this._showAsUnknown && this._radix === radix)
        }

        return [
            ["mid", makeItemShowRadix(10, s.DisplayAsDecimal)],
            ["mid", makeItemShowRadix(-10, s.DisplayAsSignedDecimal)],
            ["mid", makeItemShowRadix(8, s.DisplayAsOctal)],
            ["mid", makeItemShowRadix(16, s.DisplayAsHexadecimal)],
            ["mid", makeItemShowAs(s.DisplayAsUnknown, () => this.doSetShowAsUnknown(!this._showAsUnknown), this._showAsUnknown)],
            ["mid", MenuData.sep()],
            this.makeChangeParamsContextMenuItem("inputs", S.Components.Generic.contextMenu.ParamNumBits, this.numBits, "bits"),
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
DisplayDef.impl = Display

function repeatString(s: string, n: number) {
    let result = ""
    for (let i = 0; i < n; i++) {
        result += s
    }
    return result
}

function insertSpaces(binaryStringRep: string, radix: number): [boolean, string] {
    let n = -1
    if (radix === 16) {
        n = 4
    } else if (radix === 8) {
        n = 3
    }
    if (n < 0) {
        return [false, binaryStringRep]
    }
    const re = new RegExp(`(.{${n}})`, "g")
    const spaced = reverseString(reverseString(binaryStringRep).replace(re, "$1 "))
    return [true, spaced]
}

function reverseString(str: string) {
    return str.split("").reverse().join("")
}