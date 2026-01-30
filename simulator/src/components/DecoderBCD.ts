import * as t from "io-ts"
import { displayValuesFromArray } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { FixedArrayFillWith, LogicValue, Unknown, isUnknown, typeOrUndefined } from "../utils"
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

}
DecoderBCDDef.impl = DecoderBCD
