import * as t from "io-ts"
import { circle, COLOR_COMPONENT_BORDER, COLOR_UNKNOWN, GRID_STEP } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillUsing, ArrayFillWith, LogicValue, Mode, typeOrUndefined } from "../utils"
import { AdderArrayDef } from "./AdderArray"
import { defineParametrizedComponent, groupVertical, param, ParametrizedComponentBase, Repr, ResolvedParams } from "./Component"
import { DrawableParent, DrawContext, GraphicsRendering, MenuData, MenuItems } from "./Drawable"
import { GateTypePrefix, validateGateType } from "./Gate"
import { GateNType, GateNTypes } from "./GateTypes"


export const GateArrayDef =
    defineParametrizedComponent(GateTypePrefix + "-array", true, true, {
        variantName: ({ type, bits }) =>
            // return array thus overriding default component id
            [`gate-array`, `${type}-array`, `${type}-array-${bits}`],
        idPrefix: "array",
        button: { imgWidth: 50 },
        repr: {
            // type not part of specific repr, using normal type field
            bits: typeOrUndefined(t.number),
            showAsUnknown: typeOrUndefined(t.boolean),
        },
        valueDefaults: {
            showAsUnknown: false,
        },
        params: {
            bits: param(4, [2, 4, 8, 16]),
            type: param("and" as GateNType, GateNTypes.values),
        },
        validateParams: ({ type: paramType, bits }, jsonType, defaults) => {
            const type = validateGateType(GateNTypes, paramType, jsonType, defaults.type.defaultValue, "-array")
            return { type, numBits: bits }
        },
        size: AdderArrayDef.size,
        makeNodes: ({ numBits }) => {
            const inputCenterY = 5 + Math.max(0, (numBits - 8) / 2)
            return {
                ins: {
                    A: groupVertical("w", -3, -inputCenterY, numBits),
                    B: groupVertical("w", -3, inputCenterY, numBits),
                },
                outs: {
                    S: groupVertical("e", 3, 0, numBits),
                },
            }
        },
        initialValue: (saved, { numBits }) => ArrayFillWith<LogicValue>(false, numBits),
    })


export type GateArrayRepr = Repr<typeof GateArrayDef>
export type GateArrayParams = ResolvedParams<typeof GateArrayDef>

export class GateArray extends ParametrizedComponentBase<GateArrayRepr> {

    public readonly numBits: number
    private _type: GateNType
    private _showAsUnknown: boolean

    public constructor(parent: DrawableParent, params: GateArrayParams, saved?: GateArrayRepr) {
        super(parent, GateArrayDef.with(params), saved)

        this.numBits = params.numBits
        this._type = params.type
        this._showAsUnknown = saved?.showAsUnknown ?? GateArrayDef.aults.showAsUnknown
    }

    public toJSON() {
        return {
            ...this.toJSONBase(),
            bits: this.numBits === GateArrayDef.aults.bits ? undefined : this.numBits,
            showAsUnknown: this._showAsUnknown === GateArrayDef.aults.showAsUnknown ? undefined : this._showAsUnknown,
        }
    }

    protected override jsonType(): string {
        return `${this._type}-array`
    }

    public get type() {
        return this._type
    }

    public override makeTooltip() {
        const s = S.Components.GateArray.tooltip
        const opDesc = S.Components.Gate[this._type][0]
        return tooltipContent(s.title, mods(
            div(s.desc.expand({ op: opDesc })),
        ))
    }

    protected doRecalcValue(): LogicValue[] {
        const out = GateNTypes.props[this._type].out
        const a = this.inputValues(this.inputs.A)
        const b = this.inputValues(this.inputs.B)
        return ArrayFillUsing(i => out([a[i], b[i]]), this.numBits)
    }

    protected override propagateValue(newValue: LogicValue[]) {
        this.outputValues(this.outputs.S, newValue)
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, {
            skipLabels: true,
            drawInside: ({ left, right }) => {
                if (this._showAsUnknown) {
                    ctx.inNonTransformedFrame(() => {
                        g.fillStyle = COLOR_UNKNOWN
                        g.textAlign = "center"
                        g.font = "bold 20px sans-serif"
                        g.fillText('?', this.posX, this.posY)
                    })
                } else {
                    // draw gate type
                    g.lineWidth = 2
                    g.strokeStyle = COLOR_COMPONENT_BORDER
                    g.beginPath()

                    const top = this.posY - GRID_STEP
                    const bottom = this.posY + GRID_STEP
                    let gateLeft = left + 10
                    const gateRight = right - 10
                    const pi2 = Math.PI / 2
                    const type = this._type

                    const drawRightCircle = () => {
                        g.beginPath()
                        circle(g, gateRight + 3, this.posY, 5)
                        g.stroke()
                    }
                    const drawLeftCircle = (up: boolean) => {
                        g.beginPath()
                        circle(g, gateLeft - 3, this.posY - (up ? 1 : -1) * 4, 5)
                        g.stroke()
                    }

                    switch (type) {
                        case "and":
                        case "nand":
                        case "nimply":
                        case "rnimply": {
                            g.moveTo(this.posX, bottom)
                            g.lineTo(gateLeft, bottom)
                            g.lineTo(gateLeft, top)
                            g.lineTo(this.posX, top)
                            g.arc(this.posX, this.posY, GRID_STEP, -pi2, pi2)
                            g.closePath()
                            g.stroke()
                            g.beginPath()
                            if (type.startsWith("nand")) {
                                drawRightCircle()
                            }
                            if (type === "nimply") {
                                drawLeftCircle(false)
                            } else if (type === "rnimply") {
                                drawLeftCircle(true)
                            }
                            break
                        }

                        case "or":
                        case "nor":
                        case "xor":
                        case "xnor":
                        case "imply":
                        case "rimply": {
                            g.beginPath()
                            g.moveTo(gateLeft, top)
                            g.lineTo(this.posX - 5, top)
                            g.bezierCurveTo(this.posX + 2, top, gateRight - 5, this.posY - 8,
                                gateRight, this.posY)
                            g.bezierCurveTo(gateRight - 5, this.posY + 8, this.posX + 2, bottom,
                                this.posX - 5, bottom)
                            g.lineTo(gateLeft, bottom)
                            g.quadraticCurveTo(this.posX - 4, this.posY, gateLeft, top)
                            g.closePath()
                            g.stroke()
                            const savedGateLeft = gateLeft
                            gateLeft += 2
                            if (type.startsWith("nor") || type.startsWith("xnor")) {
                                drawRightCircle()
                            }
                            if (type === "imply") {
                                drawLeftCircle(true)
                            } else if (type === "rimply") {
                                drawLeftCircle(false)
                            }
                            if (type.startsWith("x")) {
                                g.beginPath()
                                g.moveTo(savedGateLeft - 4, bottom)
                                g.quadraticCurveTo(this.posX - 8, this.posY, savedGateLeft - 4, top)
                                g.stroke()
                            }
                            break
                        }

                        case "txa":
                        case "txna": {
                            g.beginPath()
                            g.moveTo(gateLeft, bottom)
                            g.lineTo(gateLeft, top)
                            g.lineTo(gateRight, this.posY)
                            g.lineTo(gateLeft + 2, this.posY)
                            g.stroke()
                            if (type === "txna") {
                                drawLeftCircle(true)
                            }
                            break
                        }

                        case "txb":
                        case "txnb": {
                            g.beginPath()
                            g.moveTo(gateLeft, top)
                            g.lineTo(gateLeft, bottom)
                            g.lineTo(gateRight, this.posY)
                            g.lineTo(gateLeft + 2, this.posY)
                            g.stroke()
                            if (type === "txnb") {
                                drawLeftCircle(false)
                            }
                            break
                        }
                    }
                }
            },
        })
    }

    private doSetType(newSubtype: GateNType) {
        this._type = newSubtype
        this.setNeedsRecalc()
        this.setNeedsRedraw("quad gate type changed")
    }

    private doSetShowAsUnknown(showAsUnknown: boolean) {
        this._showAsUnknown = showAsUnknown
        this.setNeedsRedraw("display as unknown changed")
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.GateArray.contextMenu

        const typeItems: MenuData = []
        const subtypes = (["and", "or", "xor", "nand", "nor", "xnor", "-", "imply", "rimply", "nimply", "rnimply"] as const)
            .filter(t => this.parent.editor.allowGateType(t))

        if (subtypes.length !== 0) {
            // remove leading or trailing "-" if present
            if (subtypes[0] === "-") {
                subtypes.shift()
            } else if (subtypes[subtypes.length - 1] === "-") {
                subtypes.pop()
            }

            for (const subtype of subtypes) {
                if (subtype === "-") {
                    typeItems.push(MenuData.sep())
                } else {
                    const icon = this._type === subtype ? "check" : "none"
                    typeItems.push(MenuData.item(icon, subtype.toUpperCase(), () => {
                        this.doSetType(subtype)
                    }))
                }
            }
        }

        const items: MenuItems = []

        if (typeItems.length >= 2) {
            // 2 because a choice of 1 is just a direct item
            items.push(["mid", MenuData.submenu("settings", s.Type, typeItems)])
        }

        if (this.parent.mode >= Mode.FULL) {
            const showAsUnknownItem = MenuData.item(this._showAsUnknown ? "check" : "none", s.ShowAsUnknown, () => {
                this.doSetShowAsUnknown(!this._showAsUnknown)
            })

            items.push(
                ["mid", showAsUnknownItem],
            )
        }

        items.push(
            ["mid", MenuData.sep()],
            this.makeChangeParamsContextMenuItem("inputs", S.Components.Generic.contextMenu.ParamNumBits, this.numBits, "bits"),
            ...this.makeForceOutputsContextMenuItem(true)
        )

        return items
    }

}
GateArrayDef.impl = GateArray
