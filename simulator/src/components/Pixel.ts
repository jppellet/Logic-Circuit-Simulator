import * as t from "io-ts"
import { COLORCOMPS_UNKNOWN, displayValuesFromArray, useCompact } from "../drawutils"
import { mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { Mode, isUnknown, typeOrUndefined } from "../utils"
import { ParametrizedComponentBase, Repr, ResolvedParams, defineParametrizedComponent, groupHorizontal, groupVertical, param, paramBool } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuData, MenuItems } from "./Drawable"


export const PixelDef =
    defineParametrizedComponent("pixel", true, true, {
        variantName: ({ bits, touch }) => `pixel${touch ? "-touch" : ""}-${bits}`,
        idPrefix: "pixel",
        button: { imgWidth: 32 },
        repr: {
            bits: typeOrUndefined(t.number),
            full: typeOrUndefined(t.boolean),
        },
        valueDefaults: {
            full: true,
        },
        params: {
            bits: param(2, [1, 2, 4, 8]),
            touch: paramBool(),
        },
        validateParams: ({ bits, touch }) => ({
            numBits: bits,
            isTouch: touch,
        }),
        size: ({ numBits }) => {
            const size = useCompact(numBits) ? numBits : 2 * numBits
            return {
                gridWidth: size,
                gridHeight: size,
            }
        },
        makeNodes: ({ numBits, isTouch, gridWidth }) => {
            const offset = gridWidth / 2 + 1
            return {
                ins: {
                    R: groupHorizontal("n", 0, -offset, numBits),
                    G: groupVertical("w", -offset, 0, numBits),
                    B: groupHorizontal("s", 0, offset, numBits),
                },
                outs: {
                    T: !isTouch ? undefined : [offset, 0, "e"],
                },
            }
        },
        initialValue: (): PixelValue => ({ color: COLORCOMPS_UNKNOWN, pressed: false }),
    })

type PixelValue = { color: [number, number, number], pressed: boolean }
export type PixelRepr = Repr<typeof PixelDef>
export type PixelParams = ResolvedParams<typeof PixelDef>


export class Pixel extends ParametrizedComponentBase<PixelRepr> {

    public readonly numBits: number
    public readonly isTouch: boolean
    private _full: boolean

    public constructor(parent: DrawableParent, params: PixelParams, saved?: PixelRepr) {
        super(parent, PixelDef.with(params), saved)

        this.numBits = params.numBits
        this.isTouch = params.isTouch

        this._full = params.numBits === 1 ? true : (saved?.full ?? PixelDef.aults.full)
    }

    public toJSON() {
        return {
            ...this.toJSONBase(),
            bits: this.numBits === PixelDef.aults.bits ? undefined : this.numBits,
            touch: this.isTouch === PixelDef.aults.touch ? undefined : this.isTouch,
            full: this._full === PixelDef.aults.full ? undefined : this._full,
        }
    }

    public override isOver(x: number, y: number): boolean {
        if (!this.isTouch) {
            return super.isOver(x, y)
        }
        // we are touch, so we can always be over it
        return this._isOverThisRect(x, y)
    }

    public override makeTooltip() {
        const s = S.Components.Pixel
        return tooltipContent(undefined, mods(s.tooltip))
    }

    protected doRecalcValue(): PixelValue {
        const { pressed } = this.value
        const [__, r_] = displayValuesFromArray(this.inputValues(this.inputs.R), false)
        const [___, g_] = displayValuesFromArray(this.inputValues(this.inputs.G), false)
        const [____, b_] = displayValuesFromArray(this.inputValues(this.inputs.B), true)
        if (isUnknown(r_) || isUnknown(g_) || isUnknown(b_)) {
            return { color: COLORCOMPS_UNKNOWN, pressed }
        }
        return { color: [r_, g_, b_], pressed }
    }


    private doSetValueWithPressed(pressed: boolean) {
        const { color } = this.value
        this.doSetValue({ color, pressed })
    }

    protected override propagateValue(newValue: PixelValue) {
        if ("T" in this.outputs) {
            this.outputs.T.value = newValue.pressed
        }
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        super.doDrawDefault(g, ctx)

        const [r_, g_, b_] = this.value.color
        const maxVal = (1 << this.numBits) - 1
        const colorComp = (c: number) => Math.round(c / maxVal * 255)
        const outerColor = `rgba(${colorComp(r_)}, ${colorComp(g_)}, ${colorComp(b_)}, 0.5)`
        const innerColor = `rgb(${colorComp(r_)}, ${colorComp(g_)}, ${colorComp(b_)})`

        const bounds = this.bounds()
        const { width, height } = bounds

        let padding = 1
        if (!this._full && this.numBits > 1) {
            g.fillStyle = outerColor
            g.fillRect(this.posX - width / 2 + padding, this.posY - height / 2 + padding, width - padding * 2, height - padding * 2)
            padding = 10
        }
        g.fillStyle = innerColor
        g.fillRect(this.posX - width / 2 + padding, this.posY - height / 2 + padding, width - padding * 2, height - padding * 2)
    }

    private doSetFull(full: boolean) {
        if (this._full === full) {
            return
        }
        this._full = full
        this.requestRedraw({ why: "pixel full changed" })
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.Pixel.contextMenu

        const toggleFullItems: MenuItems = this.numBits === 1 ? [] : [
            ["mid", MenuData.item(this._full ? "check" : "none", s.Full, () => this.doSetFull(!this._full))],
            ["mid", MenuData.sep()],
        ]


        return [
            ...toggleFullItems,
            this.makeChangeBooleanParamsContextMenuItem(s.ParamTouch, this.isTouch, "touch"),
            ["mid", MenuData.sep()],
            this.makeChangeParamsContextMenuItem("inputs", s.ParamNumBits, this.numBits, "bits"),
        ]
    }

    public override pointerDown(e: PointerEvent) {
        if (this.isTouch) {
            this.doSetValueWithPressed(true)
        }
        return super.pointerDown(e)
    }

    public override pointerUp(e: PointerEvent) {
        const result = super.pointerUp(e)
        if (this.isTouch) {
            this.doSetValueWithPressed(false)
        }
        return result
    }

    public override cursorWhenMouseover(e?: PointerEvent): string | undefined {
        const superCursor = super.cursorWhenMouseover(e)
        if (this.isTouch && (superCursor === "grab" || superCursor === undefined) && this.parent.mode >= Mode.TRYOUT) {
            // we can switch it
            return "pointer"
        }
        return superCursor
    }

}
PixelDef.impl = Pixel
