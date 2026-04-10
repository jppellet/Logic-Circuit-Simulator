import * as t from "io-ts"
import { COLOR_BACKGROUND, GRID_STEP, displayValuesFromArray, drawWireLineToComponent, strokeWireOutlineAndSingleValue, useCompact } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillWith, LogicValue, Unknown, isUnknown, typeOrUndefined } from "../utils"
import { ParametrizedComponentBase, Repr, ResolvedParams, defineParametrizedComponent, groupHorizontal, groupVertical, groupVerticalMulti, param, paramBool } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuData, MenuItems } from "./Drawable"
import { Gate1, GateN } from "./Gate"
import { NodeIn } from "./Node"
import { WireStyles } from "./Wire"
import { WaypointSpecCompact } from "./XRay"

export const MuxDemuxLimits: Array<[bits: number, maxSels: number]> = [
    [1, 4],
    [2, 3],
    [4, 2],
    [8, 2],
    [16, 2],
]

export const MuxDef =
    defineParametrizedComponent("mux", true, true, {
        variantName: ({ from, to, bottom }) => `mux-${from}to${to}${bottom ? "b" : ""}`,
        idPrefix: "mux",
        button: { imgWidth: 50 },
        repr: {
            from: typeOrUndefined(t.number),
            to: typeOrUndefined(t.number),
            bottom: typeOrUndefined(t.boolean),
            showWiring: typeOrUndefined(t.boolean),
        },
        valueDefaults: {
            showWiring: true,
        },
        params: {
            to: param(2, MuxDemuxLimits.map(([bits]) => bits)),
            from: param(4),
            bottom: paramBool(),
        },
        validateParams: ({ from, to, bottom }) => {
            // use 'to' as bit width reference
            const numTo = Math.max(0, Math.min(16, to))
            // clamp 'from' to be between 2*from and 16*from
            let numFrom = Math.min(16 * numTo, Math.max(2 * numTo, from))
            // derive number of selector bits
            let numSel = Math.ceil(Math.log2(numFrom / numTo))

            // impose some reasonable limits
            if (numTo >= 16 && numSel > 2) {
                numSel = 2
            } else if (numTo >= 4 && numSel > 2) {
                numSel = 2
            } else if (numTo >= 2 && numSel > 3) {
                numSel = 3
            }
            // derive rest
            const numGroups = Math.pow(2, numSel)
            numFrom = numTo * numGroups

            if (numFrom !== from || numTo !== to) {
                console.warn(`Mux of type ${MuxDef.variantName({ from, to, bottom })} was changed to ${MuxDef.variantName({ from: numFrom, to: numTo, bottom })}`)
            }
            return { numFrom, numTo, numGroups, numSel, controlPinsAtBottom: bottom }
        },
        size: ({ numFrom, numTo, numGroups, numSel }) => {
            const gridWidth = (numSel === 1 && numTo === 1) ? 2 : 2 * Math.max(2, numSel)
            const spacing = useCompact(numTo === 1 ? numFrom : numTo) ? 1 : 2
            const addByGroupSep = numTo > 1 ? 1 : 0
            const numLeftSlots = numFrom + (numGroups - 1) * addByGroupSep
            const gridHeight = 2 + spacing * numLeftSlots
            return { gridWidth, gridHeight }
        },
        makeNodes: ({ numTo, numGroups, numSel, controlPinsAtBottom, gridHeight }) => {
            const outX = 1 + Math.max(2, numSel)

            const groupOfInputs = groupVerticalMulti("w", -outX, 0, numGroups, numTo)
            const selY = (controlPinsAtBottom ? 1 : -1) * (gridHeight / 2 + 1)

            const S = groupHorizontal(controlPinsAtBottom ? "s" : "n", 0, selY, numSel, undefined, { leadLength: 0 })
            const leadLengthIncrement = 6.7
            const leadLengthS = 12.5 + ((numSel !== 1 || numTo === 1) ? 0 : leadLengthIncrement / 2)
            for (let s = 0; s < numSel; s++) {
                S[numSel - 1 - s][4]!.leadLength = leadLengthS + s * leadLengthIncrement
            }

            return {
                ins: {
                    I: groupOfInputs,
                    S,
                },
                outs: {
                    Z: groupVertical("e", outX, 0, numTo),
                },
            }
        },
        initialValue: (saved, { numTo }) => ArrayFillWith<LogicValue>(false, numTo),
    })


export type MuxRepr = Repr<typeof MuxDef>
export type MuxParams = ResolvedParams<typeof MuxDef>

export class Mux extends ParametrizedComponentBase<MuxRepr> {

    public readonly numFrom: number
    public readonly numTo: number
    public readonly numGroups: number
    public readonly numSel: number
    public readonly controlPinsAtBottom: boolean
    private readonly _isXRay: boolean
    private _showWiring: boolean

    public constructor(parent: DrawableParent, params: MuxParams, saved?: MuxRepr) {
        super(parent, MuxDef.with(params), saved)

        this.numFrom = params.numFrom
        this.numTo = params.numTo
        this.numGroups = params.numGroups
        this.numSel = params.numSel
        this.controlPinsAtBottom = params.controlPinsAtBottom
        this._isXRay = params.isXRay

        this._showWiring = saved?.showWiring ?? MuxDef.aults.showWiring
    }

    public override toJSON() {
        return {
            ...super.toJSONBase(),
            from: this.numFrom,
            to: this.numTo,
            bottom: this.controlPinsAtBottom === MuxDef.aults.bottom ? undefined : this.controlPinsAtBottom,
            showWiring: (this._showWiring !== MuxDef.aults.showWiring) ? this._showWiring : undefined,
        }
    }

    public override makeTooltip() {
        return tooltipContent(undefined, mods(
            div(S.Components.Mux.tooltip.expand({ from: this.numFrom, to: this.numTo }))
        ))
    }

    protected doRecalcValue(): LogicValue[] {
        const sels = this.inputValues(this.inputs.S)
        const sel = displayValuesFromArray(sels, false)[1]

        if (isUnknown(sel)) {
            return ArrayFillWith(Unknown, this.numTo)
        }
        return this.inputValues(this.inputs.I[sel])
    }

    protected override propagateValue(newValues: LogicValue[]) {
        this.outputValues(this.outputs.Z, newValues)
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        const { top, left, bottom, right, width } = this.bounds()
        const dy = (right - left) / 3

        // inputs
        for (const inputGroup of this.inputs.I) {
            for (const input of inputGroup) {
                drawWireLineToComponent(g, input)
            }
        }

        // selectors
        for (const sel of this.inputs.S) {
            drawWireLineToComponent(g, sel)
        }

        // outputs
        for (const output of this.outputs.Z) {
            drawWireLineToComponent(g, output)
        }

        // background
        g.fillStyle = COLOR_BACKGROUND
        const outline = g.createPath()
        outline.moveTo(left, top)
        outline.lineTo(right, top + dy)
        outline.lineTo(right, bottom - dy)
        outline.lineTo(left, bottom)
        outline.closePath()
        g.fill(outline)

        // wiring
        if (this._showWiring) {
            const sels = this.inputValues(this.inputs.S)
            const sel = displayValuesFromArray(sels, false)[1]
            if (!isUnknown(sel)) {
                const options = this.parent.editor.options
                const neutral = options.hideWireColors
                const selectedInputs = this.inputs.I[sel]
                const anchorDiffX = (right - left) / 3
                const wireStyle = this._isXRay ? WireStyles.hv : options.wireStyle
                const wireStyleBezier = wireStyle === WireStyles.bezier || wireStyle === WireStyles.auto
                const wireStyleHV = wireStyle === WireStyles.hv || wireStyle === WireStyles.vh
                const thinnerBy = Math.floor(this.numTo / 8)
                const timeFraction = ctx.drawParams.drawTimeAnimationFraction
                const inc = width / (this.numTo + 1)

                for (let i = 0; i < selectedInputs.length; i++) {
                    g.beginPath()
                    const fromY = selectedInputs[i].posYInParentTransform
                    const toNode = this.outputs.Z[i]
                    const toY = toNode.posYInParentTransform
                    g.moveTo(left + 1, fromY)
                    if (wireStyleBezier) {
                        g.bezierCurveTo(
                            left + anchorDiffX, fromY, // anchor left
                            right - anchorDiffX, toY, // anchor right
                            right - 1, toY,
                        )
                    } else if (wireStyleHV) {
                        const shiftX = (i + 1) * inc + Number(this.numSel >= 4) * GRID_STEP
                        const lineX = fromY <= this.posY
                            // in the upper part, so "hv"
                            ? right - shiftX
                            // in the lower part, so "vh"
                            : left + shiftX
                        g.lineTo(lineX, fromY)
                        g.lineTo(lineX, toY)
                        g.lineTo(right - 1, toY)
                    } else {
                        g.lineTo(left + 3, fromY)
                        g.lineTo(right - 3, toY)
                        g.lineTo(right - 1, toY)
                    }
                    strokeWireOutlineAndSingleValue(g, selectedInputs[i].value, toNode.color, neutral, timeFraction, thinnerBy)
                }
            }
        }

        // xray and outline
        this.doDrawXRayAndOutline(g, ctx, outline)
    }

    protected override xrayScale(): number | undefined {
        const useSmallScale =
            this.numTo >= 8 ||
            this.numTo >= 4 && this.numSel >= 2 ||
            this.numTo >= 1 && this.numSel >= 3 ||
            this.numTo === 1 && this.numSel === 1
        const useExtraSmallScale =
            this.numTo >= 8 && this.numSel >= 2 ||
            this.numTo === 1 && this.numSel === 3
        return useExtraSmallScale ? 0.0848 : useSmallScale ? 0.11 : 0.18
    }

    protected override makeXRay(level: number, scale: number, link: boolean) {
        const { xray, wire, gate } = this.parent.editor.newXRay(this, level, scale)
        const { ins, outs, p } = this.makeXRayNodes(xray, link)

        const bits = this.numTo
        const groups = this.numGroups
        const sels = this.numSel

        const nots: Gate1[] = []
        const notOrient = this.controlPinsAtBottom ? "n" : "s"
        const notXOffsetFactor = this.controlPinsAtBottom ? -1 : 1
        for (let s = 0; s < sels; s++) {
            const not = gate(`not${s}`, "not", ins.S[s], ins.S[s].posY + notXOffsetFactor * 2.5 * GRID_STEP, notOrient)
            wire(ins.S[s], not)
            nots.push(not)
        }

        const orCenterX = p.right - 3 * GRID_STEP
        const andCenterX = orCenterX - 6 * GRID_STEP

        const globalOffsetX = (nots[0].outputs.Out.posY - ins.S[0].posY) / 2
        const andGateHeight = (2 + sels * (useCompact(sels + 1) ? 1 : 2)) * GRID_STEP
        const andGateSpacing = GRID_STEP
        const andGroupHeight = groups * andGateHeight + (groups - 1) * andGateSpacing
        const andGroupSpacing = 6 * GRID_STEP
        const andGroupsTotalHeight = bits * andGroupHeight + (bits - 1) * andGroupSpacing
        const firstAndGroupCenterY = globalOffsetX + (andGroupHeight - andGroupsTotalHeight) / 2

        // make AND and OR gates, no wiring yet
        const ands: GateN[][] = []
        const ors: GateN[] = []
        for (let b = 0; b < bits; b++) {
            const groupCenterY = firstAndGroupCenterY + b * (andGroupHeight + andGroupSpacing)
            const or = gate(`or${b}`, "or", orCenterX, groupCenterY, "e", groups)
            ors.push(or)

            const firstGateCenterY = groupCenterY - (andGroupHeight - andGateHeight) / 2
            const localAnds: GateN[] = []
            for (let g = 0; g < groups; g++) {
                const andCenterY = firstGateCenterY + g * (andGateHeight + andGateSpacing)
                const and = gate(`and${b}.${g}`, "and", andCenterX, andCenterY, "e", sels + 1)
                localAnds.push(and)
            }
            ands.push(localAnds)
        }

        // allocate wires in zones and set x positions of gates
        const andInputs: NodeIn[] = []
        for (let g = 0; g < groups; g++) {
            for (let b = 0; b < bits; b++) {
                andInputs.push(ands[b][g].inputs.In[sels])
            }
        }
        const gateWidth = ands[0][0].outputs.Out.posX - ands[0][0].inputs.In[0].posX
        const andsFlat = ands.flat()
        const allocations = xray.wiresInZones(p.left + 2, p.right - 2, [{
            id: "muxIn",
            from: ins.I.flat(),
            to: andInputs,
            bookings: { colsRight: 2 * sels + 1 },
            after: { comps: andsFlat, compWidth: gateWidth },
        }, {
            id: "andToOr",
            from: ands.map(ands => ands.map(and => and.outputs.Out)),
            to: ors.map(g => g.inputs.In),
            after: { comps: ors, compWidth: gateWidth },
        }, {
            id: "muxOut",
            from: ors.map(g => g.outputs.Out),
            to: outs.Z,
        }])

        // wire the AND gate selector lines
        const andInputAlloc = allocations.muxIn
        for (let b = 0; b < bits; b++) {
            for (let g = 0; g < groups; g++) {
                for (let s = 0; s < sels; s++) {
                    const useNot = ((g >> s) & 1) === 0
                    const lineIndex = s * 2 + Number(!useNot)
                    const notOuputY = nots[s].outputs.Out.posY + notXOffsetFactor * GRID_STEP
                    const lineX = andInputAlloc.at(lineIndex)

                    if (useNot) {
                        const andIn = ands[b][g].inputs.In[s]
                        wire(nots[s], andIn, "hv", [
                            [nots[s], notOuputY],
                            [lineX, andIn],
                        ])
                    } else {
                        const in_ = ins.S[s]
                        const inPosX = in_.posX - 2.5 * GRID_STEP
                        const dir = inPosX < lineX ? 1 : -1
                        const waypoints: WaypointSpecCompact[] = [
                            [inPosX, in_],
                            [lineX, notOuputY - dir * andInputAlloc.inc],
                        ]
                        wire(in_, ands[b][g].inputs.In[s], "vh", waypoints)
                    }
                }
            }
        }

        return xray
    }


    private doSetShowWiring(showWiring: boolean) {
        this._showWiring = showWiring
        this.requestRedraw({ why: "show wiring changed" })
    }


    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.MuxDemux.contextMenu
        const icon = this._showWiring ? "check" : "none"
        const toggleShowWiringItem = MenuData.item(icon, s.ShowWiring, () => {
            this.doSetShowWiring(!this._showWiring)
        })

        const makeChangeInOutItems = () => {
            return MuxDemuxLimits.flatMap(([bits, maxSels]) => {
                const items = []
                for (let sels = 1; sels <= maxSels; sels++) {
                    const isCurrent = bits === this.numTo && sels === this.numSel
                    const icon = isCurrent ? "check" : "none"
                    const numGroups = Math.pow(2, sels)
                    const from = bits * numGroups
                    const action = isCurrent ? () => undefined : () => {
                        this.replaceWithNewParams({ from, to: bits })
                    }
                    items.push(MenuData.item(icon, s.InputsOutputs.expand({ numInputs: from, numOutputs: bits }), action))
                }
                return items
            })
        }

        return [
            ["mid", MenuData.submenu("outputs", s.ParamNumInOut, makeChangeInOutItems())],
            ["mid", MenuData.sep()],
            this.makeChangeBooleanParamsContextMenuItem(this.numSel === 1 ? S.Components.Generic.contextMenu.ParamControlBitAtBottom : S.Components.Generic.contextMenu.ParamControlBitsAtBottom, this.controlPinsAtBottom, "bottom"),
            ["mid", toggleShowWiringItem],
            ...this.makeForceOutputsContextMenuItem(true),
        ]
    }

}
MuxDef.impl = Mux