import * as t from "io-ts"
import { COLOR_BACKGROUND, GRID_STEP, displayValuesFromArray, drawWireLineToComponent, strokeWireOutlineAndSingleValue, useCompact } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillWith, LogicValue, Unknown, isUnknown, typeOrUndefined } from "../utils"
import { ParametrizedComponentBase, Repr, ResolvedParams, defineParametrizedComponent, groupHorizontal, groupVertical, groupVerticalMulti, param, paramBool } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuData, MenuItems } from "./Drawable"
import { Gate1, GateN, gateGridHeight } from "./Gate"
import { NodeIn, NodeOut } from "./Node"
import { WireStyles } from "./Wire"
import { XRay } from "./XRay"


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
            to: param(2, [1, 2, 4, 8, 16]),
            from: param(4),
            bottom: paramBool(),
        },
        validateParams: ({ from, to, bottom }) => {
            // reference is 'to'; 'from' is clamped to be between 2*to and 16*to
            const numFrom = Math.min(16 * to, Math.max(2 * to, from))
            const numGroups = Math.ceil(numFrom / to)
            const numSel = Math.ceil(Math.log2(numGroups))
            return { numFrom, numTo: to, numGroups, numSel, controlPinsAtBottom: bottom }
        },
        size: ({ numFrom, numTo, numGroups, numSel }) => {
            const gridWidth = 2 * Math.max(2, numSel)
            const spacing = useCompact(numTo === 1 ? numFrom : numTo) ? 1 : 2
            const addByGroupSep = numTo > 1 ? 1 : 0
            const numLeftSlots = numFrom + (numGroups - 1) * addByGroupSep
            const gridHeight = 2 + spacing * numLeftSlots
            return { gridWidth, gridHeight }
        },
        makeNodes: ({ numTo, numGroups, numSel, controlPinsAtBottom, isXRay }) => {
            const outX = (isXRay ? 0.5 : 1) + Math.max(2, numSel)
            const inX = -outX

            const groupOfInputs = groupVerticalMulti("w", inX, 0, numGroups, numTo)
            const firstInputY = groupOfInputs[0][0][1]
            const lastGroup = groupOfInputs[groupOfInputs.length - 1]
            const lastInputY = lastGroup[lastGroup.length - 1][1]
            const selY = controlPinsAtBottom ? lastInputY + 3 : firstInputY - 3

            return {
                ins: {
                    I: groupOfInputs,
                    S: groupHorizontal(controlPinsAtBottom ? "s" : "n", 0, selY, numSel, undefined, /*{ leadLength: 35 }*/),
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
    private _showWiring: boolean

    public constructor(parent: DrawableParent, params: MuxParams, saved?: MuxRepr) {
        super(parent, MuxDef.with(params), saved)

        this.numFrom = params.numFrom
        this.numTo = params.numTo
        this.numGroups = params.numGroups
        this.numSel = params.numSel
        this.controlPinsAtBottom = params.controlPinsAtBottom

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
        const { top, left, bottom, right } = this.bounds()
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
                const neutral = this.parent.editor.options.hideWireColors
                const selectedInputs = this.inputs.I[sel]
                const anchorDiffX = (right - left) / 3
                const wireStyle = this.parent.editor.options.wireStyle
                const wireStyleBezier = wireStyle === WireStyles.bezier || wireStyle === WireStyles.auto
                const timeFraction = ctx.drawParams.drawTimeAnimationFraction

                for (let i = 0; i < selectedInputs.length; i++) {
                    this.parent.editor.options.wireStyle
                    g.beginPath()
                    const fromY = selectedInputs[i].posYInParentTransform
                    const toNode = this.outputs.Z[i]
                    const toY = toNode.posYInParentTransform
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
                    strokeWireOutlineAndSingleValue(g, selectedInputs[i].value, toNode.color, neutral, timeFraction)
                }
            }
        }

        // xray and outline
        this.doDrawXRayAndOutline(g, ctx, outline, 0.18)
    }

    protected override makeXRay(scale: number): XRay | undefined {
        const { xray, wire, gate } = this.parent.editor.newXRay(this, scale)
        const { ins, outs, x, y } = this.makeXRayNodes<Mux>(xray)

        const bits = this.numTo
        const groups = this.numGroups
        const sels = this.numSel
        const compact = useCompact(bits)

        const nots: Gate1[] = []
        for (let s = 0; s < sels; s++) {
            const notPosX = ins.S[s].posX + 2.5 * GRID_STEP
            const not = gate(`not${s}`, "not", notPosX, y.top + 3 * GRID_STEP, "s")
            wire(ins.S[s], not, "vh", [notPosX, y.top + 2])
            nots.push(not)
        }

        const orCenterX = x.right - 3 * GRID_STEP
        const andCenterX = orCenterX - 6 * GRID_STEP

        const andInputsSpacing = GRID_STEP
        const notOutputsTop = nots[nots.length - 1].outputs.Out.posY
        const notOutputsBottom = notOutputsTop + (2 * sels) * andInputsSpacing
        const andInputsLeft = andCenterX - 3 * GRID_STEP - (2 * sels) * andInputsSpacing

        const globalOffsetY = (notOutputsBottom + GRID_STEP - y.top) / 2
        const andGateHeight = gateGridHeight(sels + 1) * GRID_STEP
        const andGateSpacing = (compact ? 1 : 5) * GRID_STEP
        const andGroupHeight = groups * andGateHeight + (groups - 1) * andGateSpacing
        const andGroupSpacing = (compact ? 1.5 : 10) * GRID_STEP
        const andGroupsTotalHeight = bits * andGroupHeight + (bits - 1) * andGroupSpacing
        const firstAndGroupCenterY = globalOffsetY + (andGroupHeight - andGroupsTotalHeight) / 2

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
                for (let s = 0; s < sels; s++) {
                    const useNot = ((g >> s) & 1) === 0
                    const from = useNot ? nots[s] : ins.S[s]
                    const delta = (sels * 2 - (s * 2 + Number(!useNot))) * andInputsSpacing
                    wire(from, and.inputs.In[s], "vh", [andInputsLeft + delta, notOutputsTop + delta])
                }
                localAnds.push(and)
            }
            xray.wires(localAnds.map(g => g.outputs.Out), or.inputs.In)

            ands.push(localAnds)
        }
        xray.wires(ors.map(g => g.outputs.Out), outs.Z, undefined, x.right - 2)


        const inss: NodeOut[] = []
        const outss: NodeIn[] = []
        for (let g = 0; g < groups; g++) {
            for (let b = 0; b < bits; b++) {
                inss.push(ins.I[g][b])
                outss.push(ands[b][g].inputs.In[sels])
            }
        }
        xray.wires(inss, outss, x.left + 2, andInputsLeft, false)

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

        return [
            this.makeChangeParamsContextMenuItem("outputs", s.ParamNumTo, this.numTo, "to"),
            this.makeChangeParamsContextMenuItem("inputs", s.ParamNumFrom, this.numFrom, "from", [2, 4, 8, 16].map(x => x * this.numTo)),
            ["mid", MenuData.sep()],
            this.makeChangeBooleanParamsContextMenuItem(this.numSel === 1 ? S.Components.Generic.contextMenu.ParamControlBitAtBottom : S.Components.Generic.contextMenu.ParamControlBitsAtBottom, this.controlPinsAtBottom, "bottom"),
            ["mid", toggleShowWiringItem],
            ...this.makeForceOutputsContextMenuItem(true),
        ]
    }

}
MuxDef.impl = Mux