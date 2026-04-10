import * as t from "io-ts"
import { COLOR_BACKGROUND, GRID_STEP, displayValuesFromArray, drawWireLineToComponent, strokeWireOutlineAndSingleValue, useCompact } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { IconName } from "../images"
import { S } from "../strings"
import { ArrayFillWith, HighImpedance, LogicValue, Unknown, isUnknown, typeOrUndefined } from "../utils"
import { ParametrizedComponentBase, Repr, ResolvedParams, defineParametrizedComponent, groupHorizontal, groupVertical, groupVerticalMulti, param, paramBool } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuData, MenuItems } from "./Drawable"
import { Gate1, GateN } from "./Gate"
import { MuxDemuxLimits } from "./Mux"
import { WireStyles } from "./Wire"
import { WaypointSpecCompact } from "./XRay"


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
            from: param(2, MuxDemuxLimits.map(([bits]) => bits)),
            to: param(4),
            bottom: paramBool(),
        },
        validateParams: ({ from, to, bottom }) => {
            // use 'from' as bit width reference
            const numFrom = Math.max(0, Math.min(16, from))
            // clamp 'to' to be between 2*from and 16*from
            let numTo = Math.min(16 * numFrom, Math.max(2 * numFrom, to))
            // derive number of selector bits
            let numSel = Math.ceil(Math.log2(numTo / numFrom))

            // impose some reasonable limits
            if (numFrom >= 16 && numSel > 2) {
                numSel = 2
            } else if (numFrom >= 4 && numSel > 2) {
                numSel = 2
            } else if (numFrom >= 2 && numSel > 3) {
                numSel = 3
            }
            // derive rest
            const numGroups = Math.pow(2, numSel)
            numTo = numFrom * numGroups

            if (numFrom !== from || numTo !== to) {
                console.warn(`Demux of type ${DemuxDef.variantName({ from, to, bottom })} was changed to ${DemuxDef.variantName({ from: numFrom, to: numTo, bottom })}`)
            }
            return { numFrom, numTo, numGroups, numSel, controlPinsAtBottom: bottom }
        },
        size: ({ numFrom, numTo, numGroups, numSel }) => {
            const gridWidth = (numFrom === 1 && numSel === 1) ? 2 : 2 * Math.max(2, numSel)
            const spacing = useCompact(numFrom === 1 ? numTo : numFrom) ? 1 : 2
            const addByGroupSep = numFrom > 1 ? 1 : 0
            const numLeftSlots = numTo + (numGroups - 1) * addByGroupSep
            const gridHeight = spacing * numLeftSlots + 2
            return { gridWidth, gridHeight }
        },
        makeNodes: ({ numFrom, numGroups, numSel, controlPinsAtBottom, gridHeight }) => {
            const outX = 1 + Math.max(2, numSel)

            const groupOfOutputs = groupVerticalMulti("e", outX, 0, numGroups, numFrom)
            const selY = (controlPinsAtBottom ? 1 : -1) * (gridHeight / 2 + 1)

            const S = groupHorizontal(controlPinsAtBottom ? "s" : "n", 0, selY, numSel, undefined, { leadLength: 0 })
            const leadLengthIncrement = 6.7
            const leadLengthS = 12.5 + ((numSel !== 1 || numFrom === 1) ? 0 : leadLengthIncrement / 2)
            for (let s = 0; s < numSel; s++) {
                S[s][4]!.leadLength = leadLengthS + s * leadLengthIncrement
            }

            return {
                ins: {
                    In: groupVertical("w", -outX, 0, numFrom),
                    S,
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
    private readonly _isXRay: boolean
    private _showWiring: boolean
    private _disconnectedAsHighZ: boolean

    public constructor(parent: DrawableParent, params: DemuxParams, saved?: DemuxRepr) {
        super(parent, DemuxDef.with(params), saved)

        this.numFrom = params.numFrom
        this.numTo = params.numTo
        this.numGroups = params.numGroups
        this.numSel = params.numSel
        this.controlPinsAtBottom = params.controlPinsAtBottom
        this._isXRay = params.isXRay

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
        const { top, left, bottom, right, width } = this.bounds()
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
            const sels = this.inputValues(this.inputs.S)
            const sel = displayValuesFromArray(sels, false)[1]
            if (!isUnknown(sel)) {
                const options = this.parent.editor.options
                const neutral = options.hideWireColors
                const selectedOutputs = this.outputs.Z[sel]
                const anchorDiffX = (right - left) / 3
                const wireStyle = this._isXRay ? WireStyles.hv : options.wireStyle
                const wireStyleBezier = wireStyle === WireStyles.bezier || wireStyle === WireStyles.auto
                const wireStyleHV = wireStyle === WireStyles.hv || wireStyle === WireStyles.vh
                const thinnerBy = Math.floor(this.numFrom / 8)
                const timeFraction = ctx.drawParams.drawTimeAnimationFraction
                const inc = width / (this.numFrom + 1)

                for (let i = 0; i < this.inputs.In.length; i++) {
                    g.beginPath()
                    const fromNode = this.inputs.In[i]
                    const fromY = fromNode.posYInParentTransform
                    const toY = selectedOutputs[i].posYInParentTransform
                    g.moveTo(left + 1, fromY)
                    if (wireStyleBezier) {
                        g.bezierCurveTo(
                            left + anchorDiffX, fromY, // anchor left
                            right - anchorDiffX, toY, // anchor right
                            right - 1, toY,
                        )
                    } else if (wireStyleHV) {
                        const lineX = left + (i + 1) * inc + Number(this.numSel >= 4) * GRID_STEP
                        g.lineTo(lineX, fromY)
                        g.lineTo(lineX, toY)
                        g.lineTo(right - 1, toY)
                    } else {
                        g.lineTo(left + 3, fromY)
                        g.lineTo(right - 3, toY)
                        g.lineTo(right - 1, toY)
                    }
                    strokeWireOutlineAndSingleValue(g, this.inputs.In[i].value, fromNode.color, neutral, timeFraction, thinnerBy)
                }
            }
        }

        // xray and outline
        this.doDrawXRayAndOutline(g, ctx, outline)
    }

    protected override xrayScale(): number | undefined {
        const useSmallScale = this.numFrom === 1 && this.numSel >= 2
        return useSmallScale ? 0.11 : 0.18
    }

    protected override makeXRay(level: number, scale: number, link: boolean) {
        const { xray, wire, gate } = this.parent.editor.newXRay(this, level, scale)
        const { ins, outs, p } = this.makeXRayNodes(xray, link)

        const bits = this.numFrom
        const groups = this.numGroups
        const sels = this.numSel

        const ands: GateN[][] = []
        for (let g = 0; g < groups; g++) {

            const localAnds: GateN[] = []
            for (let b = 0; b < bits; b++) {
                const out = outs.Z[g][b]
                const and = gate(`and${g}.${b}`, "and", p.right - 2 * GRID_STEP, out, "e", sels + 1)
                wire(and, out)
                localAnds.push(and)
            }
            ands.push(localAnds)
        }

        const linesRight = ands[0][0].inputs.In[0].posX - GRID_STEP
        const lineSpacing = Math.min(2 * GRID_STEP, (linesRight - (p.left + 2)) / (2 * sels + bits + 2))

        const passShiftX = 2.5 * GRID_STEP
        const firstNotX = Math.min(linesRight - passShiftX, ins.S[0].posX)
        const firstNotShiftX = ins.S[0].posX - firstNotX

        const nots: Gate1[] = []
        for (let i = 0; i < sels; i++) {
            const in_ = ins.S[i]
            const notShiftX = sels === 1 ? firstNotShiftX : (sels - 1 - i) / (sels - 1) * firstNotShiftX
            const notPosX = in_.posX - notShiftX
            const notPosY = in_.posY + 2.5 * GRID_STEP + notShiftX / 3
            const not = gate(`not${i}`, "not", notPosX, notPosY, "s")
            wire(in_, not, "straight")
            nots.push(not)
        }

        for (let b = 0; b < bits; b++) {
            const in_ = ins.In[b]
            for (let g = 0; g < groups; g++) {
                const and = ands[g][b]
                for (let s = 0; s < sels; s++) {
                    const useNot = ((g >> s) & 1) === 0
                    const to = and.inputs.In[s]
                    const not = nots[s]
                    const from = ins.S[s]
                    const selLineIndex = 2 * s + Number(useNot)
                    const passPosX = not.posX + passShiftX
                    const passPosY = Math.max(from.posY, not.posY - 2.5 * GRID_STEP - passShiftX / 3)

                    const hSegmentY = useNot
                        ? /* not */ nots[s].outputs.Out.posY + 0.7 * GRID_STEP
                        : /* direct */
                        s === 0 ? passPosY : nots[s - 1].outputs.Out.posY + 2 * GRID_STEP

                    const selLineX = linesRight - selLineIndex * lineSpacing
                    if (useNot) {
                        const waypoints: WaypointSpecCompact | undefined = (bits === 1 && sels === 1) ? undefined : [selLineX, hSegmentY]
                        wire(not, to, "vh", waypoints)
                    } else {
                        // try to simplify waypoints
                        const waypoints: WaypointSpecCompact[] =
                            passPosX === selLineX ? [
                                [selLineX, passPosY], // go right
                                [selLineX, to], // go down
                            ] : passPosY === hSegmentY ? [
                                [selLineX, passPosY], // go right
                                [selLineX, to], // go down
                            ] : [
                                [passPosX, passPosY], // go right
                                [passPosX, hSegmentY], // go down
                                [selLineX, hSegmentY], // go right
                                [selLineX, to], // go down
                            ]
                        wire(from, to, "straight", waypoints)
                    }
                }

                wire(in_, and.inputs.In[sels], "vh", [linesRight - (2 * sels + b + 1) * lineSpacing, in_])
            }
        }

        return xray
    }

    private doSetShowWiring(showWiring: boolean) {
        this._showWiring = showWiring
        this.requestRedraw({ why: "show wiring changed" })
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

        const makeChangeInOutItems = () => {
            return MuxDemuxLimits.flatMap(([bits, maxSels]) => {
                const items = []
                for (let sels = 1; sels <= maxSels; sels++) {
                    const isCurrent = bits === this.numFrom && sels === this.numSel
                    const icon = isCurrent ? "check" : "none"
                    const numGroups = Math.pow(2, sels)
                    const to = bits * numGroups
                    const action = isCurrent ? () => undefined : () => {
                        this.replaceWithNewParams({ from: bits, to })
                    }
                    items.push(MenuData.item(icon, s.InputsOutputs.expand({ numInputs: bits, numOutputs: to }), action))
                }
                return items
            })
        }

        return [
            ["mid", MenuData.submenu("outputs", s.ParamNumInOut, makeChangeInOutItems())],
            this.makeChangeBooleanParamsContextMenuItem(this.numSel === 1 ? S.Components.Generic.contextMenu.ParamControlBitAtBottom : S.Components.Generic.contextMenu.ParamControlBitsAtBottom, this.controlPinsAtBottom, "bottom"),
            ["mid", toggleShowWiringItem],
            ["mid", toggleUseHighZItem],
            ...this.makeForceOutputsContextMenuItem(true),
        ]
    }

}
DemuxDef.impl = Demux
