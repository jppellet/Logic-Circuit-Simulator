import * as t from "io-ts"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_DARK_RED, COLOR_GATE_NAMES, COLOR_MOUSE_OVER, COLOR_UNKNOWN, ColorString, GRID_STEP, PATTERN_STRIPED_GRAY, circle, drawWireLineToComponent, useCompact } from "../drawutils"
import { Modifier, ModifierObject, asValue, b, cls, div, emptyMod, mods, table, tbody, td, th, thead, tooltipContent, tr } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillUsing, Expand, InteractionResult, LogicValue, Mode, RichStringEnum, Unknown, deepArrayEquals, isUnknown, typeOrUndefined } from "../utils"
import { ExtractParamDefs, ExtractParams, InstantiatedComponentDef, NodesIn, NodesOut, ParametrizedComponentBase, Repr, ResolvedParams, SomeParamCompDef, defineParametrizedComponent, groupVertical, param } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuData, MenuItem, MenuItems } from "./Drawable"
import { Gate1Type, Gate1TypeRepr, Gate1Types, Gate2OnlyTypes, Gate2toNTypes, GateNType, GateNTypeRepr, GateNTypes, GateTypes } from "./GateTypes"

type GateRepr = Gate1Repr | GateNRepr

const LEAD_LENGTH_NORMAL = 20
const LEAD_LENGTH_OR_STYLE = 25

export abstract class GateBase<
    TRepr extends GateRepr,
    TGateType extends TRepr["poseAs"] & string = TRepr["poseAs"] & string,
    TParamDefs extends ExtractParamDefs<TRepr> = ExtractParamDefs<TRepr>
> extends ParametrizedComponentBase<
    TRepr,
    LogicValue,
    TParamDefs,
    ExtractParams<TRepr>,
    NodesIn<TRepr>,
    NodesOut<TRepr>,
    true, true
> {

    public abstract get numBits(): number
    private _type: TGateType
    private _poseAs: TGateType | undefined
    private _showAsUnknown: boolean

    protected constructor(parent: DrawableParent, SubclassDef: [InstantiatedComponentDef<TRepr, LogicValue>, SomeParamCompDef<TParamDefs>], type: TGateType, saved?: TRepr) {
        super(parent, SubclassDef, saved)

        this._type = type
        // this.updateLeadsFor(type) // done in subclass after it can set numBits
        this._poseAs = saved?.poseAs as TGateType ?? undefined
        this._showAsUnknown = saved?.showAsUnknown ?? false
    }

    protected override toJSONBase() {
        return {
            ...super.toJSONBase(),
            showAsUnknown: (this._showAsUnknown) ? true : undefined,
            poseAs: this._poseAs,
        }
    }

    protected override jsonType() {
        return this._type
    }

    protected abstract gateTypes(numBits: number): GateTypes<TGateType>

    public get type(): TGateType {
        return this._type
    }

    protected doSetType(newType: TGateType) {
        this._type = newType
        this.updateLeadsFor(newType)
        for (const input of this.inputs.In) {
            input.incomingWire?.invalidateWirePath()
        }
        this.setNeedsRecalc()
        this.requestRedraw({ why: "gate type changed", invalidateTests: true })
    }

    protected updateLeadsFor(type: TGateType) {
        const isOrStyle = type === "or" || type === "nor" || type === "imply" || type === "rimply"
        const leadLength = isOrStyle ? LEAD_LENGTH_OR_STYLE : LEAD_LENGTH_NORMAL
        const ins = this.inputs.In
        ins.forEach(node => node.updateLeadLength(leadLength))
        // very empirical way to make the gates look better
        if (isOrStyle) {
            const numBits = this.numBits
            if (numBits >= 6 || numBits === 4) {
                // shorter first and last
                ins[0].updateLeadLength(leadLength - 3)
                ins[numBits - 1].updateLeadLength(leadLength - 3)
                if (numBits >= 8) {
                    // shorter on edge of gate
                    const numCoveredByGate = 6
                    const iTopGate = (numBits - numCoveredByGate) / 2
                    const iBottomGate = iTopGate + numCoveredByGate - 1
                    ins[iTopGate].updateLeadLength(leadLength - 3)
                    ins[iBottomGate].updateLeadLength(leadLength - 3)
                    if (numBits >= 24) {
                        // shorter on arms' ends
                        ins[1].updateLeadLength(leadLength - 2)
                        ins[numBits - 2].updateLeadLength(leadLength - 2)
                        // above gate
                        ins[iTopGate - 1].updateLeadLength(leadLength - 2)
                        ins[iTopGate - 2].updateLeadLength(leadLength - 2)
                        // below gate
                        ins[iBottomGate + 1].updateLeadLength(leadLength - 2)
                        ins[iBottomGate + 2].updateLeadLength(leadLength - 2)
                    }
                }
            }
        }

    }

    public get poseAs() {
        return this._poseAs
    }

    public set poseAs(newPoseAs: TGateType | undefined) {
        if (newPoseAs !== this._poseAs) {
            this._poseAs = newPoseAs
            this.requestRedraw({ why: "gate display changed" })
        }
    }

    public get showAsUnknown() {
        return this._showAsUnknown
    }

    private doSetShowAsUnknown(newUnknown: boolean) {
        this._showAsUnknown = newUnknown
        this.requestRedraw({ why: "display as unknown changed" })
    }

    protected override toStringDetails(): string {
        return this.type
    }

    protected doRecalcValue(): LogicValue {
        const inputs = this.inputValues(this.inputs.In)
        const logicFunc = this.gateTypes(this.numBits).props[this.type].out
        return logicFunc(inputs)
    }

    protected override propagateValue(newValue: LogicValue) {
        this.outputs.Out.value = newValue
    }

    public override makeTooltip() {
        const s = S.Components.Gate.tooltip
        if (this.showAsUnknown) {
            return div(s.UnknownGate)
        }

        const myIns = this.inputValues(this.inputs.In)
        const myOut = this.value

        const gateProps = this.gateTypes(this.numBits).props[this.type]

        const genTruthTableData = () => {
            const header =
                this.numBits === 1 ? [s.Input] :
                    ArrayFillUsing(i => s.Input + " " + (i + 1), this.numBits)
            header.push(s.Output)
            const rows: TruthTableRowData[] = []
            for (const ins of valueCombinations(this.numBits)) {
                const matchesCurrent = deepArrayEquals(myIns, ins)
                const out = gateProps.out(ins)
                ins.push(out)
                rows.push({ matchesCurrent, cells: ins })
            }
            return [header, rows] as const
        }

        const nodeOut = this.outputs.Out.value
        const desc = nodeOut === myOut
            ? s.CurrentlyDelivers
            : s.ShouldCurrentlyDeliver

        const gateIsUnspecified = myIns.includes(Unknown)
        const explanation = gateIsUnspecified
            ? mods(desc + " " + s.UndeterminedOutputBecauseInputUnknown)
            : mods(desc + " " + s.ThisOutput + " ", asValue(myOut), " " + s.BecauseInputIs + " ", ...myIns.map(asValue))

        const fullShortDesc = gateProps.fullShortDesc()
        const header = (() => {
            switch (this.type) {
                case "not": return mods(s.Inverter[0], b(S.Components.Gate.not[0]), s.Inverter[1])
                case "buf": return mods(s.Buffer[0], b(S.Components.Gate.buf[0]), s.Buffer[1])
                default: return s.GateTitle(b(fullShortDesc[0]))
            }
        })()

        const explanationAndTable = this.numBits <= 4 ?
            mods(explanation, ", " + s.AccordingToTruthTable, div(makeTruthTable(genTruthTableData())))
            : mods(explanation, ".")

        return makeGateTooltip(this.numBits,
            header,
            fullShortDesc[2],
            explanationAndTable,
        )
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        const gateType = this._showAsUnknown
            ? Unknown
            : this.poseAs ?? this.type
        this.drawGate(g, gateType, gateType !== this.type && !this._showAsUnknown, ctx)
    }

    private drawGate(g: GraphicsRendering, type: TGateType | Unknown, isFake: boolean, ctx: DrawContext) {
        const numBits = this.numBits
        const output = this.outputs.Out

        const { top, left, bottom, right, height } = this.bounds()
        const drawArms = numBits >= 4 && numBits !== 5
        const armsOffset = GRID_STEP / (useCompact(numBits) ? 2 : 1)
        const armsTop = this.inputs.In[0].posYInParentTransform - armsOffset
        const armsBottom = this.inputs.In[numBits - 1].posYInParentTransform + armsOffset
        const pi2 = Math.PI / 2
        let nameDeltaX = 0

        const drawInversionCircle = (x: number, y: number) => {
            g.beginPath()
            circle(g, x, y, 8)
            g.fillStyle = COLOR_BACKGROUND
            g.fill()
            g.stroke()
        }

        const showAsFake = isFake && this.parent.mode >= Mode.FULL
        const gateBorderColor: ColorString = ctx.isMouseOver ? COLOR_MOUSE_OVER : (showAsFake ? COLOR_DARK_RED : COLOR_COMPONENT_BORDER)
        const gateFill = showAsFake ? PATTERN_STRIPED_GRAY : COLOR_BACKGROUND

        // inputs and output
        for (let i = 0; i < numBits; i++) {
            drawWireLineToComponent(g, this.inputs.In[i])
        }
        drawWireLineToComponent(g, output)

        // prepare main fill
        g.lineWidth = 3
        g.strokeStyle = gateBorderColor
        g.fillStyle = gateFill

        switch (type) {
            case "not":
            case "buf": {
                g.beginPath()
                g.moveTo(left, top)
                g.lineTo(right, this.posY)
                g.lineTo(left, bottom)
                g.closePath()
                g.fill()
                g.stroke()
                if (type === "not") {
                    drawInversionCircle(right + 5, this.posY)
                }
                nameDeltaX = -7
                break
            }

            case "and":
            case "nand":
            case "nimply":
            case "rnimply": {
                const arcBeginX = right - height / 2
                g.beginPath()
                g.moveTo(arcBeginX, bottom)
                g.lineTo(left, bottom)
                g.lineTo(left, top)
                g.lineTo(arcBeginX, top)
                g.arc(arcBeginX, this.posY, height / 2, -pi2, pi2)
                g.closePath()
                g.fill()
                g.lineWidth = 1
                g.stroke()
                g.strokeStyle = gateBorderColor
                g.lineWidth = 3
                g.stroke()
                g.beginPath()
                if (type.startsWith("nand")) {
                    drawInversionCircle(right + 5, this.posY)
                }
                if (type === "nimply") {
                    drawInversionCircle(left - 5, this.posY + GRID_STEP)
                } else if (type === "rnimply") {
                    drawInversionCircle(left - 5, this.posY - GRID_STEP)
                }
                nameDeltaX = -2
                if (drawArms) {
                    g.moveTo(left, armsTop)
                    g.lineTo(left, armsBottom)
                    g.stroke()
                }
                break
            }

            case "or":
            case "nor":
            case "xor":
            case "xnor":
            case "imply":
            case "rimply": {
                const leftCurve = 12
                g.beginPath()
                g.moveTo(this.posX - 15, top)
                g.bezierCurveTo(this.posX + 10, top, right - 5, this.posY - 8,
                    right, this.posY)
                g.bezierCurveTo(right - 5, this.posY + 8, this.posX + 10, bottom,
                    left, bottom)
                g.quadraticCurveTo(left + leftCurve, this.posY, left, top)
                g.closePath()
                g.fill()
                g.stroke()

                const armsHeight = armsBottom - bottom
                const armsCurvature = Math.min(leftCurve, armsHeight / 4)
                if (drawArms) {
                    g.beginPath()
                    g.moveTo(left, bottom)
                    g.quadraticCurveTo(left + armsCurvature, bottom + armsHeight / 2, left, armsBottom)
                    g.moveTo(left, top)
                    g.quadraticCurveTo(left + armsCurvature, top - armsHeight / 2, left, armsTop)
                    g.stroke()
                }

                if (type.startsWith("nor") || type.startsWith("xnor")) {
                    drawInversionCircle(right + 5, this.posY)
                }
                if (type === "imply") {
                    drawInversionCircle(left - 2, this.posY - GRID_STEP)
                } else if (type === "rimply") {
                    drawInversionCircle(left - 2, this.posY + GRID_STEP)
                }
                if (type.startsWith("x")) {
                    g.lineWidth = 3
                    const leftXorCurve = (delta: number) => {
                        g.beginPath()
                        if (drawArms) {
                            g.moveTo(left - delta, armsBottom)
                            g.quadraticCurveTo(left + armsCurvature - delta, bottom + armsHeight / 2, left - delta, bottom)
                            g.quadraticCurveTo(left + leftCurve - delta, this.posY, left - delta, top)
                            g.quadraticCurveTo(left + armsCurvature - delta, top - armsHeight / 2, left - delta, armsTop)
                        } else {
                            // simple
                            g.moveTo(left - delta, bottom)
                            g.quadraticCurveTo(left + leftCurve - delta, this.posY, left - delta, top)
                        }
                    }

                    // clear the "middle"
                    leftXorCurve(3)
                    g.strokeStyle = COLOR_BACKGROUND
                    g.stroke()

                    // left additional line for x gates
                    leftXorCurve(6)
                    g.strokeStyle = gateBorderColor
                    g.stroke()
                }
                nameDeltaX = 1
                break
            }

            case "txa":
            case "txna": {
                g.beginPath()
                g.moveTo(left, bottom)
                g.lineTo(left, top)
                g.lineTo(right, this.posY + 0.5)
                g.lineTo(left + 2, this.posY + 0.5)
                g.fill()
                g.stroke()
                if (type === "txna") {
                    drawInversionCircle(left - 5, this.posY - GRID_STEP)
                }
                break
            }

            case "txb":
            case "txnb": {
                g.beginPath()
                g.moveTo(left, top)
                g.lineTo(left, bottom)
                g.lineTo(right, this.posY - 0.5)
                g.lineTo(left + 2, this.posY - 0.5)
                g.fill()
                g.stroke()
                if (type === "txnb") {
                    drawInversionCircle(left - 5, this.posY + GRID_STEP)
                }
                break
            }

            case "?": {
                const gateRightSquare = left + (bottom - top)
                g.strokeStyle = ctx.isMouseOver ? COLOR_MOUSE_OVER : COLOR_UNKNOWN
                g.beginPath()
                g.moveTo(left, top)
                g.lineTo(gateRightSquare, top)
                g.lineTo(gateRightSquare, bottom)
                g.lineTo(left, bottom)
                g.closePath()
                g.fill()
                g.stroke()
                if (drawArms) {
                    g.moveTo(left, armsTop)
                    g.lineTo(left, armsBottom)
                    g.stroke()
                }
                g.lineWidth = 0

                ctx.inNonTransformedFrame(() => {
                    g.fillStyle = COLOR_UNKNOWN
                    g.textAlign = "center"
                    g.font = "bold 20px sans-serif"
                    g.fillText('?', (left + gateRightSquare) / 2, this.posY)
                })
                break
            }
        }

        if (this.parent.editor.options.showGateTypes && !isUnknown(type)) {
            const gateShortName = this.gateTypes(this.numBits).props[type].fullShortDesc()[1]
            if (gateShortName !== undefined) {
                g.fillStyle = COLOR_GATE_NAMES
                g.textAlign = "center"
                g.font = "bold 13px sans-serif"
                const oldTransform = g.getTransform()
                g.translate(this.posX + nameDeltaX, this.posY)
                g.scale(0.65, 1)
                g.fillText(gateShortName, 0, 0)
                g.setTransform(oldTransform)
            }
        }
    }

    public override mouseDoubleClicked(e: MouseEvent | TouchEvent) {
        if (this.parent.mode >= Mode.FULL && e.altKey) {
            this.doSetShowAsUnknown(!this._showAsUnknown)
            return InteractionResult.SimpleChange
        }
        return super.mouseDoubleClicked(e)
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const items: MenuItems = []
        const adminMode = this.parent.mode >= Mode.FULL

        if (!this._showAsUnknown || adminMode) {
            const replaceBy = this.makeReplaceByMenuItem()
            if (replaceBy !== undefined) {
                items.push(
                    ["start", replaceBy]
                )
            }
        }
        if (adminMode) {
            items.push(
                ["mid", this.makePoseAsMenuItem()],
                ...this.makeForceOutputsContextMenuItem()
            )
        }
        return items
    }

    private makeReplaceByMenuItem(): MenuItem | undefined {
        const gateTypes = this.gateTypes(this.numBits)
        const s = S.Components.Gate.contextMenu
        const otherTypes = gateTypes.values
            .filter(t => t !== this._type && gateTypes.props[t].includeInContextMenu)
            .filter(t => this.parent.editor.allowGateType(t))
        if (otherTypes.length === 0) {
            return undefined
        }
        return MenuData.submenu("replace", s.ReplaceBy, [
            ...otherTypes.map(newType => {
                const gateProps = gateTypes.props[newType]
                return MenuData.item(undefined, s.GateTempl.expand({ type: gateProps.fullShortDesc()[0] }), () => {
                    const oldType = this._type
                    this.doSetType(newType)
                    const ref = this.ref
                    if (ref !== undefined && ref.startsWith(oldType)) {
                        // change the id to match the new type
                        this.parent.components.regenerateIdOf(this)
                    }
                })
            }),
            MenuData.sep(),
            MenuData.text(s.VariantChangeDesc),
        ])
    }

    private makePoseAsMenuItem(): MenuItem {
        const gateTypes = this.gateTypes(this.numBits)
        const s = S.Components.Gate.contextMenu
        const otherTypes = gateTypes.values.filter(t => t !== this._type && gateTypes.props[t].includeInPoseAs)
        const currentShowAsUnknown = this._showAsUnknown
        const currentPoseAs = this.poseAs
        return MenuData.submenu("questioncircled", s.ShowAs, [
            MenuData.item(!currentShowAsUnknown && currentPoseAs === undefined ? "check" : "none",
                s.NormalGateTempl.expand({ type: gateTypes.props[this._type].fullShortDesc()[0] }), () => {
                    this.poseAs = undefined
                    this.doSetShowAsUnknown(false)
                }),
            MenuData.item(currentShowAsUnknown ? "check" : "none",
                s.UnknownGate, () => {
                    this.poseAs = undefined
                    this.doSetShowAsUnknown(true)
                }),
            MenuData.sep(),
            ...otherTypes.map(newType => {
                const gateProps = gateTypes.props[newType]
                return MenuData.item(!currentShowAsUnknown && newType === currentPoseAs ? "check" : "none",
                    s.GateTempl.expand({ type: gateProps.fullShortDesc()[0] }), () => {
                        this.doSetShowAsUnknown(false)
                        this.poseAs = newType
                    })
            }),
        ])
    }

}

export function validateGateType<TGateType extends string>(GateTypes: RichStringEnum<string, any>, typeFromParam: TGateType, typeFromJson: string | undefined, defaultFromDef: TGateType, jsonTypeSuffix?: string): TGateType {
    let typeToValidate
    if (typeFromJson === undefined) {
        typeToValidate = typeFromParam
    } else {
        if (jsonTypeSuffix !== undefined && typeFromJson.endsWith(jsonTypeSuffix)) {
            typeToValidate = typeFromJson.slice(0, -jsonTypeSuffix.length)
        } else {
            typeToValidate = typeFromJson
        }
    }
    if (!GateTypes.includes(typeToValidate)) {
        console.error(`Invalid gate type: '${typeToValidate}'`)
        return defaultFromDef
    }
    return typeToValidate as TGateType
}


export const GateTypePrefix = "gate"


export const Gate1Def =
    defineParametrizedComponent(GateTypePrefix + "1", true, true, {
        variantName: ({ type }) =>
            // return array thus overriding default component id
            [type],
        button: { imgWidth: 50 },
        repr: {
            // type not part of specific repr, using normal type field
            poseAs: typeOrUndefined(Gate1TypeRepr),
            showAsUnknown: typeOrUndefined(t.boolean),
        },
        valueDefaults: {},
        params: {
            type: param("not" as Gate1Type),
        },
        validateParams: ({ type: paramType }, jsonType, defaults) => {
            const type = validateGateType(Gate1Types, paramType, jsonType, defaults.type.defaultValue)
            return { type }
        },
        idPrefix: ({ type }) => type,
        size: () => ({
            gridWidth: 4,
            gridHeight: 4,
        }),
        makeNodes: () => ({
            ins: { In: [[-4, 0, "w", { leadLength: 20 }]] },
            outs: { Out: [+4, 0, "e", { leadLength: 20 }] },
        }),
        initialValue: () => false as LogicValue,
    })

export type Gate1Repr = Expand<Repr<typeof Gate1Def>>
export type Gate1Params = ResolvedParams<typeof Gate1Def>


export class Gate1 extends GateBase<Gate1Repr> {

    public get numBits() { return 1 }

    public constructor(parent: DrawableParent, params: Gate1Params, saved?: Gate1Repr) {
        super(parent, Gate1Def.with(params), params.type, saved)
    }

    protected gateTypes() { return Gate1Types }

    public toJSON(): Gate1Repr {
        return super.toJSONBase()
    }

    public override mouseDoubleClicked(e: MouseEvent | TouchEvent) {
        const superChange = super.mouseDoubleClicked(e)
        if (superChange.isChange) {
            return superChange // already handled
        }
        if (this.parent.mode >= Mode.DESIGN) {
            this.doSetType(this.type === "buf" ? "not" : "buf")
            return InteractionResult.SimpleChange
        }
        return InteractionResult.NoChange
    }

}
Gate1Def.impl = Gate1



export const GateNDef =
    defineParametrizedComponent(GateTypePrefix + "", true, true, {
        variantName: ({ type, bits }) =>
            // return array thus overriding default component id
            [type, `${type}-${bits}`],
        button: { imgWidth: 50 },
        repr: {
            // type not part of specific repr, using normal type field
            poseAs: typeOrUndefined(GateNTypeRepr),
            showAsUnknown: typeOrUndefined(t.boolean),
        },
        valueDefaults: {},
        params: {
            bits: param(2, [2, 3, 4, 5, 6, 7, 8, 12, 16, 24, 32]),
            type: param("and" as GateNType),
        },
        validateParams: ({ type: paramType, bits }, jsonType, defaults) => {
            const type = validateGateType((bits > 2) ? Gate2toNTypes : GateNTypes, paramType, jsonType, defaults.type.defaultValue)
            return { type, numBits: bits }
        },
        idPrefix: ({ type }) => type,
        size: ({ numBits }) => {
            const tall = numBits !== 2 && numBits !== 4 && numBits !== 6
            return {
                gridWidth: 4,
                gridHeight: tall ? 5 : 4,
            }
        },
        makeNodes: ({ numBits }) => {
            const leadLength = 20
            return {
                ins: {
                    In: groupVertical("w", -4, 0, numBits, undefined, { leadLength }),
                },
                outs: {
                    Out: [4, 0, "e", { leadLength }],
                },
            }
        },
        initialValue: () => false as LogicValue,
    })

export type GateNRepr = Repr<typeof GateNDef>
export type GateNParams = ResolvedParams<typeof GateNDef>

export class GateN extends GateBase<GateNRepr> {

    public readonly numBits: number

    public constructor(parent: DrawableParent, params: GateNParams, saved?: GateNRepr) {
        super(parent, GateNDef.with(params), params.type, saved)
        this.numBits = params.numBits
        this.updateLeadsFor(params.type)
    }

    protected gateTypes(numBits: number) {
        return (numBits > 2 ? Gate2toNTypes : GateNTypes) as any
    }

    public toJSON() {
        return {
            ...this.toJSONBase(),
            bits: this.numBits !== GateNDef.aults.bits ? this.numBits : undefined,
        }
    }

    public override mouseDoubleClicked(e: MouseEvent | TouchEvent) {
        const superChange = super.mouseDoubleClicked(e)
        if (superChange.isChange) {
            return superChange // already handled
        }
        if (this.parent.mode >= Mode.DESIGN) {
            // switch to IMPLY / NIMPLY variant
            const newType = (() => {
                switch (this.type) {
                    case "imply": return "rimply"
                    case "rimply": return "imply"

                    case "nimply": return "rnimply"
                    case "rnimply": return "nimply"

                    case "txa": return "txb"
                    case "txb": return "txna"
                    case "txna": return "txnb"
                    case "txnb": return "txa"

                    default: return undefined
                }
            })()
            if (newType !== undefined) {
                this.doSetType(newType)
                return InteractionResult.SimpleChange
            }
        }
        return InteractionResult.NoChange
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.Generic.contextMenu

        const changeBitsItems: MenuItems = Gate2OnlyTypes.includes(this.type) ? [] : [
            this.makeChangeParamsContextMenuItem("inputs", s.ParamNumInputs, this.numBits, "bits"),
            ["mid", MenuData.sep()],
        ]

        return [
            ...changeBitsItems,
            ...super.makeComponentSpecificContextMenuItems(),
        ]
    }

}
GateNDef.impl = GateN



// Truth table generation helpers

function* valueCombinations(n: number) {
    let curr = 0
    const max = 1 << n
    while (curr < max) {
        const binString = curr.toString(2).padStart(n, "0")
        const valueArray = binString.split("").reverse().map(v => (v === "1") as LogicValue)
        yield valueArray
        curr++
    }
}

type TruthTableRowData = { matchesCurrent: boolean, cells: LogicValue[] }
function makeTruthTable([header, rows]: readonly [string[], TruthTableRowData[]]) {
    const htmlRows = rows.map(({ matchesCurrent, cells }) =>
        tr(matchesCurrent ? cls("current") : emptyMod, ...cells.map(v => td(asValue(v))))
    )
    return table(cls("truth-table"),
        thead(tr(...header.map(title =>
            th(title))
        )),
        tbody(...htmlRows)
    )
}
function makeGateTooltip(numBits: number, title: Modifier, description: Modifier, explanationAndTable: Modifier): ModifierObject {
    const numBitsDisplay = Math.min(4, numBits)
    const maxWidth = 200 + (Math.max(0, numBitsDisplay - 2)) * 50
    return tooltipContent(title, mods(div(description), div(explanationAndTable)), maxWidth)
}
