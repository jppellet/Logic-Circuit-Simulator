import * as t from "io-ts"
import { COLOR_BACKGROUND, displayValuesFromArray, drawWireLineToComponent, strokeWireOutlineAndSingleValue, useCompact } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { IconName } from "../images"
import { S } from "../strings"
import { ArrayFillWith, HighImpedance, LogicValue, Unknown, isUnknown, typeOrUndefined } from "../utils"
import { ParametrizedComponentBase, Repr, ResolvedParams, defineParametrizedComponent, groupHorizontal, groupVertical, groupVerticalMulti, param, paramBool } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuData, MenuItems } from "./Drawable"
import { WireStyles } from "./Wire"


export const DemuxDef =
    defineParametrizedComponent("demux", true, true, {
        variantName: ({ from, to, bottom }) => `demux-${from}to${to}${bottom ? "b" : ""}`,
        idPrefix: "demux",
        button: { imgWidth: 50 },
        repr: {
            from: typeOrUndefined(t.number),
            to: typeOrUndefined(t.number),
            bottom: typeOrUndefined(t.boolean),
            showWiring: typeOrUndefined(t.boolean),
            disconnectedAsHighZ: typeOrUndefined(t.boolean),
        },
        valueDefaults: {
            showWiring: true,
            disconnectedAsHighZ: false,
        },
        params: {
            from: param(2, [1, 2, 4, 8, 16]),
            to: param(4),
            bottom: paramBool(),
        },
        validateParams: ({ from, to, bottom }) => {
            // reference is 'from'; 'to' is clamped to be between 2*from and 16*from
            const numTo = Math.min(16 * from, Math.max(2 * from, to))
            const numGroups = Math.ceil(numTo / from)
            const numSel = Math.ceil(Math.log2(numGroups))
            return { numFrom: from, numTo, numGroups, numSel, controlPinsAtBottom: bottom }
        },
        size: ({ numFrom, numTo, numGroups, numSel }) => {
            const gridWidth = 2 * numSel
            const spacing = useCompact(numFrom === 1 ? numTo : numFrom) ? 1 : 2
            const addByGroupSep = numFrom > 1 ? 1 : 0
            const numLeftSlots = numTo + (numGroups - 1) * addByGroupSep
            const gridHeight = spacing * numLeftSlots
            return { gridWidth, gridHeight }
        },
        makeNodes: ({ numFrom, numGroups, numSel, controlPinsAtBottom }) => {
            const outX = 1 + numSel
            const inX = -outX

            const groupOfOutputs = groupVerticalMulti("e", outX, 0, numGroups, numFrom)
            const firstInputY = groupOfOutputs[0][0][1]
            const lastGroup = groupOfOutputs[groupOfOutputs.length - 1]
            const lastInputY = lastGroup[lastGroup.length - 1][1]
            const selY = controlPinsAtBottom ? lastInputY + 2 : firstInputY - 2

            return {
                ins: {
                    In: groupVertical("w", inX, 0, numFrom),
                    S: groupHorizontal(controlPinsAtBottom ? "s" : "n", 0, selY, numSel, undefined, { leadLength: 35 }),
                },
                outs: {
                    Z: groupOfOutputs,
                },
            }
        },
        initialValue: (saved, { numTo }) => ArrayFillWith<LogicValue>(false, numTo),
    })


export type DemuxRepr = Repr<typeof DemuxDef>
export type DemuxParams = ResolvedParams<typeof DemuxDef>

export class Demux extends ParametrizedComponentBase<DemuxRepr> {

    public readonly numFrom: number
    public readonly numSel: number
    public readonly numGroups: number
    public readonly numTo: number
    public readonly controlPinsAtBottom: boolean
    private _showWiring: boolean
    private _disconnectedAsHighZ: boolean

    public constructor(parent: DrawableParent, params: DemuxParams, saved?: DemuxRepr) {
        super(parent, DemuxDef.with(params), saved)

        this.numFrom = params.numFrom
        this.numTo = params.numTo
        this.numGroups = params.numGroups
        this.numSel = params.numSel
        this.controlPinsAtBottom = params.controlPinsAtBottom

        this._showWiring = saved?.showWiring ?? DemuxDef.aults.showWiring
        this._disconnectedAsHighZ = saved?.disconnectedAsHighZ ?? DemuxDef.aults.disconnectedAsHighZ
    }

    public override toJSON() {
        return {
            ...super.toJSONBase(),
            from: this.numFrom,
            to: this.numTo,
            bottom: this.controlPinsAtBottom === DemuxDef.aults.bottom ? undefined : this.controlPinsAtBottom,
            showWiring: (this._showWiring !== DemuxDef.aults.showWiring) ? this._showWiring : undefined,
            disconnectedAsHighZ: (this._disconnectedAsHighZ !== DemuxDef.aults.disconnectedAsHighZ) ? this._disconnectedAsHighZ : undefined,
        }
    }

    public override makeTooltip() {
        return tooltipContent(undefined, mods(
            div(S.Components.Demux.tooltip.expand({ from: this.numFrom, to: this.numTo })) // TODO better tooltip
        ))
    }

    protected doRecalcValue(): LogicValue[] {
        const sels = this.inputValues(this.inputs.S)
        const sel = displayValuesFromArray(sels, false)[1]

        if (isUnknown(sel)) {
            return ArrayFillWith(Unknown, this.numTo)
        }

        const values: Array<LogicValue> = []
        const disconnected = this._disconnectedAsHighZ ? HighImpedance : false
        for (let g = 0; g < this.numGroups; g++) {
            if (g === sel) {
                const inputs = this.inputValues(this.inputs.In)
                for (const input of inputs) {
                    values.push(input)
                }
            } else {
                for (let i = 0; i < this.numFrom; i++) {
                    values.push(disconnected)
                }
            }
        }

        return values
    }

    protected override propagateValue(newValues: LogicValue[]) {
        this.outputValues(this.outputs._all, newValues)
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        const { top, left, bottom, right } = this.bounds()
        const dy = (right - left) / 3

        // inputs
        for (const input of this.inputs.In) {
            drawWireLineToComponent(g, input)
        }

        // selectors
        for (const sel of this.inputs.S) {
            drawWireLineToComponent(g, sel)
        }


        // outputs
        for (const outputGroup of this.outputs.Z) {
            for (const output of outputGroup) {
                drawWireLineToComponent(g, output)
            }
        }

        // background
        const outline = g.createPath()
        outline.moveTo(left, top + dy)
        outline.lineTo(right, top)
        outline.lineTo(right, bottom)
        outline.lineTo(left, bottom - dy)
        outline.closePath()
        g.fillStyle = COLOR_BACKGROUND
        g.fill(outline)

        // wiring
        if (this._showWiring) {
            const neutral = this.parent.editor.options.hideWireColors
            const sels = this.inputValues(this.inputs.S)
            const sel = displayValuesFromArray(sels, false)[1]
            if (!isUnknown(sel)) {
                const selectedOutputs = this.outputs.Z[sel]
                const anchorDiffX = (right - left) / 3
                const wireStyleBezier = this.parent.editor.options.wireStyle === WireStyles.bezier
                const timeFraction = ctx.drawParams.drawTimeAnimationFraction

                for (let i = 0; i < this.inputs.In.length; i++) {
                    g.beginPath()
                    const fromNode = this.inputs.In[i]
                    const fromY = fromNode.posYInParentTransform
                    const toY = selectedOutputs[i].posYInParentTransform
                    g.moveTo(left + 1, fromY)
                    if (!wireStyleBezier) {
                        g.lineTo(left + 3, fromY)
                        g.lineTo(right - 3, toY)
                        g.lineTo(right - 1, toY)
                    } else {
                        g.bezierCurveTo(
                            left + anchorDiffX, fromY, // anchor left
                            right - anchorDiffX, toY, // anchor right
                            right - 1, toY,
                        )
                    }
                    strokeWireOutlineAndSingleValue(g, this.inputs.In[i].value, fromNode.color, neutral, timeFraction)
                }
            }
        }

        // outline
        g.lineWidth = 3
        g.strokeStyle = ctx.borderColor
        g.stroke(outline)

    }

    private doSetShowWiring(showWiring: boolean) {
        this._showWiring = showWiring
        this.setNeedsRedraw("show wiring changed")
    }

    private doSetDisconnectedAsHighZ(disconnectedAsHighZ: boolean) {
        this._disconnectedAsHighZ = disconnectedAsHighZ
        this.setNeedsRecalc()
    }


    protected override makeComponentSpecificContextMenuItems(): MenuItems {

        const s = S.Components.MuxDemux.contextMenu
        let icon: IconName = this._showWiring ? "check" : "none"
        const toggleShowWiringItem = MenuData.item(icon, s.ShowWiring, () => {
            this.doSetShowWiring(!this._showWiring)
        })

        icon = this._disconnectedAsHighZ ? "check" : "none"
        const toggleUseHighZItem = MenuData.item(icon, s.UseZForDisconnected, () => {
            this.doSetDisconnectedAsHighZ(!this._disconnectedAsHighZ)
        })

        return [
            this.makeChangeParamsContextMenuItem("inputs", s.ParamNumFrom, this.numFrom, "from"),
            this.makeChangeParamsContextMenuItem("outputs", s.ParamNumTo, this.numTo, "to", [2, 4, 8, 16].map(x => x * this.numFrom)),
            ["mid", MenuData.sep()],
            this.makeChangeBooleanParamsContextMenuItem(s.ParamControlAtBottom, this.controlPinsAtBottom, "bottom"),
            ["mid", toggleShowWiringItem],
            ["mid", toggleUseHighZItem],
            ...this.makeForceOutputsContextMenuItem(true),
        ]
    }

}
DemuxDef.impl = Demux
