import * as t from "io-ts"
import { GRID_STEP, displayValuesFromArray } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { FixedArrayFillWith, LogicValue, Unknown, isUnknown, typeOrUndefined } from "../utils"
import { Add3IfGeq5Def } from "./Add3IfGeq5"
import { ParametrizedComponentBase, Repr, ResolvedParams, defineParametrizedComponent, groupVertical, groupVerticalMulti, param } from "./Component"
import { DrawableParent, MenuData, MenuItems } from "./Drawable"


export const DecoderBCDDef =
    defineParametrizedComponent("dec-bcd", true, true, {
        variantName: ({ bits }) => `dec-bcd-${bits}`,
        idPrefix: "dec-bcd",
        button: { imgWidth: 50 },
        repr: {
            bits: typeOrUndefined(t.number),
        },
        valueDefaults: {},
        params: {
            bits: param(4, [4, 8]),
        },
        validateParams: ({ bits }) => ({
            numFrom: bits,
            numGroups: bits === 4 ? 2 : 3,
            numTo: bits === 4 ? 5 : 10,
        }),
        size: ({ numFrom }) => ({
            gridWidth: 5,
            gridHeight: 12 * (numFrom / 4),
        }),
        makeNodes: ({ numFrom, numTo, numGroups }) => {
            // generate outputs in groups of 4, then remove extra outputs to not produce extrane outputs that are not needed
            const generated = numGroups * 4
            const toRemove = generated - numTo
            const yCenter = toRemove
            const outputs = groupVerticalMulti("e", 4, yCenter, numGroups, 4)
            outputs[outputs.length - 1].splice(outputs[outputs.length - 1].length - toRemove, toRemove)

            return {
                ins: {
                    A: groupVertical("w", -4, 0, numFrom),
                },
                outs: {
                    BCD: outputs,
                },
            }
        },
        initialValue: (saved, { numTo }) => FixedArrayFillWith(false as LogicValue, numTo),
    })

type DecoderBCDRepr = Repr<typeof DecoderBCDDef>
export type DecoderBCDParams = ResolvedParams<typeof DecoderBCDDef>

export class DecoderBCD extends ParametrizedComponentBase<DecoderBCDRepr> {

    public readonly numFrom: number
    public readonly numTo: number
    public readonly numGroups: number

    public constructor(parent: DrawableParent, params: DecoderBCDParams, saved?: DecoderBCDRepr) {
        super(parent, DecoderBCDDef.with(params), saved)
        this.numFrom = params.numFrom
        this.numTo = params.numTo
        this.numGroups = params.numGroups
    }

    public toJSON() {
        return {
            ...this.toJSONBase(),
            bits: this.numFrom === DecoderBCDDef.aults.bits ? undefined : this.numFrom,
        }
    }

    public override makeTooltip() {
        return tooltipContent(undefined, mods(
            div(S.Components.DecoderBCD4.tooltip)
        ))
    }

    protected doRecalcValue(): Array<LogicValue> {
        const input = this.inputValues(this.inputs.A)
        const [__, value] = displayValuesFromArray(input, false)

        if (isUnknown(value)) {
            return FixedArrayFillWith(Unknown as LogicValue, this.numTo)
        }

        const output = FixedArrayFillWith(false as LogicValue, this.numTo)
        const units = value % 10
        const tens = Math.floor((value - units) / 10) % 10
        const hundreds = Math.floor((value - tens * 10 - units) / 100) % 10
        const digits = [units, tens, hundreds]

        for (let i = 0; i < this.numTo; i++) {
            const digitIndex = Math.floor(i / 4)
            const digitValue = digits[digitIndex]
            output[i] = digitValue & (1 << (i % 4)) ? true : false
        }

        return output
    }

    protected override propagateValue(newValue: LogicValue[]) {
        for (let i = 0; i < this.numGroups; i++) {
            const groupStart = i * 4
            const groupEnd = groupStart + this.outputs.BCD[i].length
            const groupValues = newValue.slice(groupStart, groupEnd)
            this.outputValues(this.outputs.BCD[i], groupValues)
        }
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.Generic.contextMenu
        return [
            this.makeChangeParamsContextMenuItem("outputs", s.ParamNumBits, this.numFrom, "bits"),
            ["mid", MenuData.sep()],
            ...this.makeForceOutputsContextMenuItem(),
        ]
    }

    protected override xrayScale() {
        return this.numFrom <= 4 ? 0.5 : 0.15
    }

    protected override makeXRay(level: number, scale: number, link: boolean) {
        const { xray, wire } = this.parent.editor.newXRay(this, level, scale)
        const { ins, outs, p } = this.makeXRayNodes(xray, link)

        // implements the double-dabble adder structure for the BCD decoder
        if (this.numFrom === 4) {

            const condAdd = Add3IfGeq5Def.makeSpawned(xray, "condAdd", p.later, p.later)
            xray.alignComponentOf(condAdd.inputs.In[0], ins.A[1])
            xray.wiresInZones(p.left + 2, p.right - 2, [{
                id: "in",
                from: ins.A.slice(1),
                to: condAdd.inputs.In,
                after: condAdd,
            }, {
                id: "out",
                from: condAdd.outputs.Out,
                to: [...outs.BCD[0].slice(1), ...outs.BCD[1]],
            }])
            wire(ins.A[0], outs.BCD[0][0], "hv", [0, outs.BCD[0][0]])


        } else if (this.numFrom === 8) {

            const allocIn = xray.newPositionAlloc(p.left + 2, GRID_STEP, 2)

            const condAdd1 = Add3IfGeq5Def.makeSpawned(xray, "condAdd1", p.later, p.later)
            xray.alignXAfter(allocIn, condAdd1.inputs.In[0])
            wire(ins.A[5], condAdd1.inputs.In[0], true)
            wire(ins.A[6], condAdd1.inputs.In[1], "hv", [allocIn.at(0), condAdd1.inputs.In[1].posY])
            wire(ins.A[7], condAdd1.inputs.In[2], "hv", [allocIn.at(1), condAdd1.inputs.In[2].posY])

            const condAdd2 = Add3IfGeq5Def.makeSpawned(xray, "condAdd2", condAdd1.posX + 5 * GRID_STEP, p.later)
            wire(condAdd1.outputs.Out[0], condAdd2.inputs.In[1], true)
            wire(condAdd1.outputs.Out[1], condAdd2.inputs.In[2])
            wire(condAdd1.outputs.Out[2], condAdd2.inputs.In[3])
            wire(ins.A[4], condAdd2.inputs.In[0], "hv")

            const condAdd3 = Add3IfGeq5Def.makeSpawned(xray, "condAdd3", condAdd2.posX + 5 * GRID_STEP, p.later)
            wire(condAdd2.outputs.Out[0], condAdd3.inputs.In[1], true)
            wire(condAdd2.outputs.Out[1], condAdd3.inputs.In[2])
            wire(condAdd2.outputs.Out[2], condAdd3.inputs.In[3])
            wire(ins.A[3], condAdd3.inputs.In[0], "hv")

            const condAdd4 = Add3IfGeq5Def.makeSpawned(xray, "condAdd4", condAdd3.posX + 5 * GRID_STEP, p.later)
            wire(condAdd3.outputs.Out[0], condAdd4.inputs.In[1], true)
            wire(condAdd3.outputs.Out[1], condAdd4.inputs.In[2])
            wire(condAdd3.outputs.Out[2], condAdd4.inputs.In[3])
            wire(ins.A[2], condAdd4.inputs.In[0], "hv")

            const condAdd4b = Add3IfGeq5Def.makeSpawned(xray, "condAdd4b", condAdd4, p.later)
            wire(condAdd3.outputs.Out[3], condAdd4b.inputs.In[0], true)
            wire(condAdd2.outputs.Out[3], condAdd4b.inputs.In[1])
            wire(condAdd1.outputs.Out[3], condAdd4b.inputs.In[2])

            const condAdd5 = Add3IfGeq5Def.makeSpawned(xray, "condAdd5", condAdd4.posX + 5 * GRID_STEP, p.later)
            wire(condAdd4.outputs.Out[0], condAdd5.inputs.In[1], true)
            wire(condAdd4.outputs.Out[1], condAdd5.inputs.In[2])
            wire(condAdd4.outputs.Out[2], condAdd5.inputs.In[3])
            wire(ins.A[1], condAdd5.inputs.In[0], "hv")

            const condAdd5b = Add3IfGeq5Def.makeSpawned(xray, "condAdd5b", condAdd5, p.later)
            wire(condAdd4.outputs.Out[3], condAdd5b.inputs.In[0], true)
            wire(condAdd4b.outputs.Out[0], condAdd5b.inputs.In[1])
            wire(condAdd4b.outputs.Out[1], condAdd5b.inputs.In[2])
            wire(condAdd4b.outputs.Out[2], condAdd5b.inputs.In[3])

            wire(ins.A[0], outs.BCD[0][0], "hv", [allocIn.at(0), outs.BCD[0][0].posY])

            wire(condAdd4b.outputs.Out[3], outs.BCD[2][1], "vh")

            xray.wires(
                [...condAdd5.outputs.Out, ...condAdd5b.outputs.Out],
                [...outs.BCD[0].slice(1), ...outs.BCD[1], ...outs.BCD[2].slice(0, 3)], {
                position: { right: p.right + 2 },
            })
        } else {
            return undefined
        }

        return xray
    }

}
DecoderBCDDef.impl = DecoderBCD
