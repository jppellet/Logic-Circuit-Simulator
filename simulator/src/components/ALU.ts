import * as t from "io-ts"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_COMPONENT_INNER_LABELS, COLOR_GROUP_SPAN, displayValuesFromArray, drawLabel, drawWireLineToComponent, GRID_STEP } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillUsing, ArrayFillWith, isBoolean, isHighImpedance, isUnknown, LogicValue, typeOrUndefined, Unknown } from "../utils"
import { defineParametrizedComponent, groupHorizontal, groupVertical, param, paramBool, ParametrizedComponentBase, Repr, ResolvedParams, Value } from "./Component"
import { DrawableParent, DrawContext, GraphicsRendering, MenuData, MenuItems, Orientation } from "./Drawable"
import { Gate1Types, Gate2toNType, Gate2toNTypes } from "./GateTypes"


export const ALUDef =
    defineParametrizedComponent("alu", true, true, {
        variantName: ({ bits, ext }) => `alu-${bits}${ext ? "e" : ""}`,
        idPrefix: "alu",
        button: { imgWidth: 50 },
        repr: {
            bits: typeOrUndefined(t.number),
            ext: typeOrUndefined(t.boolean),
            showOp: typeOrUndefined(t.boolean),
        },
        valueDefaults: {
            showOp: true,
        },
        params: {
            bits: param(4, [2, 4, 8, 16]),
            ext: paramBool(), // has the extended opcode
        },
        validateParams: ({ bits, ext }) => ({
            numBits: bits,
            usesExtendedOpcode: ext,
        }),
        size: ({ numBits }) => ({
            gridWidth: 7,
            gridHeight: 19 + Math.max(0, numBits - 8) * 2,
        }),
        makeNodes: ({ numBits, usesExtendedOpcode, gridWidth, gridHeight }) => {
            const inputCenterY = 5 + Math.max(0, (numBits - 8) / 2)
            const outputX = gridWidth / 2 + 1
            const bottom = (gridHeight + 1) / 2
            const top = -bottom
            const topGroupBits = usesExtendedOpcode ? 5 : 3
            // top group is built together
            const topGroup = groupHorizontal("n", 0, top, topGroupBits, undefined, { leadLength: 20 })
            const cin = topGroup.pop()!
            // extracted to be mapped correctly when switching between reduced/extended opcodes
            const opMode = topGroup.pop()!
            return {
                ins: {
                    A: groupVertical("w", -outputX, -inputCenterY, numBits),
                    B: groupVertical("w", -outputX, inputCenterY, numBits),
                    Op: topGroup,
                    Mode: opMode,
                    Cin: [cin[0], cin[1], "n", `Cin (${S.Components.ALU.InputCinDesc})`, { leadLength: 10 }],
                },
                outs: {
                    S: groupVertical("e", outputX, 0, numBits),
                    V: [0, bottom, "s", "V (oVerflow)", { leadLength: 20 }],
                    Z: [2, bottom, "s", "Z (Zero)", { leadLength: 20 }],
                    Cout: [-2, bottom, "s", `Cout (${S.Components.ALU.OutputCoutDesc})`, { leadLength: 20 }],
                },
            }
        },
        initialValue: (saved, { numBits }) => {
            const false_ = false as LogicValue
            return { s: ArrayFillWith(false_, numBits), v: false_, cout: false_ }
        },
    })

export type ALURepr = Repr<typeof ALUDef>
export type ALUParams = ResolvedParams<typeof ALUDef>

type ALUValue = Value<typeof ALUDef>

export type ALUOp = typeof ALUOps[number]
export const ALUOp = {
    shortName(op: ALUOp): string {
        return S.Components.ALU[op][0]
    },
    fullName(op: ALUOp): string {
        return S.Components.ALU[op][1]
    },
}



export const ALUOps = [
    "A+B", "A-B", "A+1", "A-1",
    //0000  0001   0010   0011
    "-A", "B-A", "A*2", "A/2",
    //0100 0101   0110   0111
    "A|B", "A&B", "A|~B", "A&~B",
    //1000  1001   1010    1011
    "~A", "A^B", "A<<", "A>>",
    //1100 1101   1110   1111
] as const

const ALUOpsReduced: readonly ALUOp[] = ["A+B", "A-B", "A|B", "A&B"]
//                                         00     01    10     11
// Used to lookup the ALUOp from the reduced opcode, which is compatible with the extended
// opcode, provided the extra control bits are inserted between the leftmost and the
// rightmost bits of the reduced opcode. Reason for this is to keep the leftmost bit
// acting as a "mode" bit switching between arithmetic (0) and logic (1) operations.

export class ALU extends ParametrizedComponentBase<ALURepr> {

    public readonly numBits: number
    public readonly usesExtendedOpcode: boolean
    private _showOp: boolean

    public constructor(parent: DrawableParent, params: ALUParams, saved?: ALURepr) {
        super(parent, ALUDef.with(params), saved)

        this.numBits = params.numBits
        this.usesExtendedOpcode = params.usesExtendedOpcode

        this._showOp = saved?.showOp ?? ALUDef.aults.showOp
    }

    public toJSON() {
        return {
            bits: this.numBits === ALUDef.aults.bits ? undefined : this.numBits,
            ext: this.usesExtendedOpcode === ALUDef.aults.ext ? undefined : this.usesExtendedOpcode,
            ...this.toJSONBase(),
            showOp: (this._showOp !== ALUDef.aults.showOp) ? this._showOp : undefined,
        }
    }

    public override makeTooltip() {
        const op = this.op
        const s = S.Components.ALU.tooltip
        const opDesc = isUnknown(op) ? s.SomeUnknownOperation : s.ThisOperation + " " + ALUOp.fullName(op)
        return tooltipContent(s.title, mods(
            div(`${s.CurrentlyCarriesOut} ${opDesc}.`)
        ))
    }

    public get op(): ALUOp | Unknown {
        const opValues = this.inputValues(this.inputs.Op)
        opValues.push(this.inputs.Mode.value)
        const opIndex = displayValuesFromArray(opValues, false)[1]
        return isUnknown(opIndex) ? Unknown : (this.usesExtendedOpcode ? ALUOps : ALUOpsReduced)[opIndex]
    }

    protected doRecalcValue(): ALUValue {
        const op = this.op

        if (isUnknown(op)) {
            return { s: ArrayFillWith(Unknown, this.numBits), v: Unknown, cout: Unknown }
        }

        const a = this.inputValues(this.inputs.A)
        const b = this.inputValues(this.inputs.B)
        const cin = this.inputs.Cin.value

        return doALUOp(op, a, b, cin)
    }

    protected override propagateValue(newValue: ALUValue) {
        this.outputValues(this.outputs.S, newValue.s)
        this.outputs.V.value = newValue.v
        this.outputs.Z.value = allZeros(newValue.s)
        this.outputs.Cout.value = newValue.cout
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        const bounds = this.bounds()
        const { left, top, right, bottom } = bounds
        const lowerTop = top + 2 * GRID_STEP

        // inputs
        for (const input of this.inputs.A) {
            drawWireLineToComponent(g, input)
        }
        for (const input of this.inputs.B) {
            drawWireLineToComponent(g, input)
        }
        for (const input of this.inputs.Op) {
            drawWireLineToComponent(g, input)
        }
        drawWireLineToComponent(g, this.inputs.Mode)
        drawWireLineToComponent(g, this.inputs.Cin)

        // outputs
        for (const output of this.outputs.S) {
            drawWireLineToComponent(g, output)
        }
        drawWireLineToComponent(g, this.outputs.Z)
        drawWireLineToComponent(g, this.outputs.V)
        drawWireLineToComponent(g, this.outputs.Cout)

        // outline
        g.fillStyle = COLOR_BACKGROUND
        g.lineWidth = 3
        g.strokeStyle = ctx.borderColor

        g.beginPath()
        g.moveTo(left, top)
        g.lineTo(right, lowerTop)
        g.lineTo(right, bottom - 2 * GRID_STEP)
        g.lineTo(left, bottom)
        g.lineTo(left, this.posY + 1 * GRID_STEP)
        g.lineTo(left + 2 * GRID_STEP, this.posY)
        g.lineTo(left, this.posY - 1 * GRID_STEP)
        g.closePath()
        g.fill()
        g.stroke()

        // groups
        this.drawGroupBox(g, this.inputs.A.group, bounds)
        this.drawGroupBox(g, this.inputs.B.group, bounds)
        this.drawGroupBox(g, this.outputs.S.group, bounds)
        // special Op group
        g.beginPath()
        const opGroupHeight = 8
        const opGroupLeft = this.inputs.Mode.posXInParentTransform - 2
        const opGroupRight = this.inputs.Op[0].posXInParentTransform + 2
        const opGroupLeftTop = top + (this.usesExtendedOpcode ? 8 : 11)
        const opGroupRightTop = top + 18

        g.moveTo(opGroupLeft, opGroupLeftTop)
        g.lineTo(opGroupRight, opGroupRightTop)
        g.lineTo(opGroupRight, opGroupRightTop + opGroupHeight)
        g.lineTo(opGroupLeft, opGroupLeftTop + opGroupHeight)
        g.closePath()
        g.fillStyle = COLOR_GROUP_SPAN
        g.fill()

        // labels
        ctx.inNonTransformedFrame(ctx => {
            g.fillStyle = COLOR_COMPONENT_INNER_LABELS
            g.font = "11px sans-serif"

            // bottom outputs
            const isVertical = Orientation.isVertical(this.orient)
            const carryHOffsetF = isVertical ? 0 : 1
            drawLabel(ctx, this.orient, "Z", "s", this.outputs.Z, bottom - 16)
            drawLabel(ctx, this.orient, "V", "s", this.outputs.V.posXInParentTransform + carryHOffsetF * 2, bottom - 10, this.outputs.V)
            drawLabel(ctx, this.orient, "Cout", "s", this.outputs.Cout.posXInParentTransform + carryHOffsetF * 4, bottom - 7, this.outputs.Cout)

            // top inputs
            drawLabel(ctx, this.orient, "Cin", "n", this.inputs.Cin.posXInParentTransform, top + 4, this.inputs.Cin)

            g.font = "bold 11px sans-serif"
            drawLabel(ctx, this.orient, "Op", "n", (opGroupLeft + opGroupRight) / 2, top + 12, this.inputs.Op)

            // left inputs
            g.font = "bold 12px sans-serif"
            drawLabel(ctx, this.orient, "A", "w", left, this.inputs.A)
            drawLabel(ctx, this.orient, "B", "w", left, this.inputs.B)

            // right outputs
            drawLabel(ctx, this.orient, "S", "e", right, this.outputs.S)

            if (this._showOp) {
                const opName = isUnknown(this.op) ? "??" : ALUOp.shortName(this.op)
                const size = opName.length === 1 ? 25 : opName.length === 2 ? 17 : 13
                g.font = `bold ${size}px sans-serif`
                g.fillStyle = COLOR_COMPONENT_BORDER
                g.textAlign = "center"
                g.textBaseline = "middle"
                g.fillText(opName, ...ctx.rotatePoint(this.posX + 5, this.posY))
            }
        })
    }

    private doSetShowOp(showOp: boolean) {
        this._showOp = showOp
        this.setNeedsRedraw("show op changed")
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.ALU.contextMenu
        const icon = this._showOp ? "check" : "none"
        const toggleShowOpItem = MenuData.item(icon, s.toggleShowOp, () => {
            this.doSetShowOp(!this._showOp)
        })

        return [
            ["mid", toggleShowOpItem],
            ["mid", MenuData.sep()],
            this.makeChangeParamsContextMenuItem("inputs", S.Components.Generic.contextMenu.ParamNumBits, this.numBits, "bits"),
            this.makeChangeBooleanParamsContextMenuItem(s.ParamUseExtendedOpcode, this.usesExtendedOpcode, "ext"),
            ["mid", MenuData.sep()],
            ...this.makeForceOutputsContextMenuItem(),
        ]
    }

}
ALUDef.impl = ALU

function allZeros(vals: LogicValue[]): LogicValue {
    for (const v of vals) {
        if (isUnknown(v) || isHighImpedance(v)) {
            return Unknown
        }
        if (v === true) {
            return false
        }
    }
    return true
}


export function doALUOp(op: ALUOp, a: readonly LogicValue[], b: readonly LogicValue[], cin: LogicValue):
    ALUValue {
    const numBits = a.length
    switch (op) {
        // arithmetic
        case "A+B": return doALUAdd(a, b, cin)
        case "A*2": return doALUAdd(a, a, cin)
        case "A+1": return doALUAdd(a, [true, ...ArrayFillWith(false, numBits - 1)], cin)
        case "A/2": return doALUSub([...a.slice(1), a[numBits - 1]], ArrayFillWith(false, numBits), cin)
        case "A-1": return doALUSub(a, [true, ...ArrayFillWith(false, numBits - 1)], cin)
        case "A-B": return doALUSub(a, b, cin)
        case "B-A": return doALUSub(b, a, cin)
        case "-A": return doALUSub(ArrayFillWith(false, numBits), a, cin)

        // logic
        default: {
            let cout: LogicValue = false
            const s: LogicValue[] = (() => {
                switch (op) {
                    case "A|B": return doALUBinOp("or", a, b)
                    case "A&B": return doALUBinOp("and", a, b)
                    case "A^B": return doALUBinOp("xor", a, b)
                    case "A|~B": return doALUBinOp("or", a, doALUNot(b))
                    case "A&~B": return doALUBinOp("and", a, doALUNot(b))
                    case "~A": return doALUNot(a)
                    case "A>>": return [...a.slice(1), cin]
                    case "A<<":
                        cout = a[a.length - 1]
                        return [cin, ...a.slice(0, a.length - 1)]
                }
            })()
            return { s, v: false, cout }
        }

    }
}

export function doALUAdd(a: readonly LogicValue[], b: readonly LogicValue[], cin: LogicValue): ALUValue {
    const numBits = a.length
    const sum3bits = (a: LogicValue, b: LogicValue, c: LogicValue): [LogicValue, LogicValue] => {
        const asNumber = (v: LogicValue) => v === true ? 1 : 0
        const numUnset = (isUnknown(a) || isHighImpedance(a) ? 1 : 0) + (isUnknown(b) || isHighImpedance(a) ? 1 : 0) + (isUnknown(c) || isHighImpedance(a) ? 1 : 0)
        const sum = asNumber(a) + asNumber(b) + asNumber(c)

        if (numUnset === 0) {
            // we know exactly
            return [sum % 2 === 1, sum >= 2]
        }
        if (numUnset === 1 && sum >= 2) {
            // carry will always be set
            return [Unknown, true]
        }
        // At this point, could be anything
        return [Unknown, Unknown]
    }

    const s: LogicValue[] = ArrayFillWith(Unknown, numBits)
    const cins: LogicValue[] = ArrayFillWith(Unknown, numBits + 1)
    cins[0] = cin
    for (let i = 0; i < numBits; i++) {
        const [ss, cout] = sum3bits(cins[i], a[i], b[i])
        s[i] = ss
        cins[i + 1] = cout
    }
    const cout = cins[numBits]
    const v = !isBoolean(cout) || !isBoolean(cins[numBits - 2]) ? Unknown : cout !== cins[numBits - 1]
    return { s, cout, v }
}

export function doALUSub(a: readonly LogicValue[], b: readonly LogicValue[], cin: LogicValue): ALUValue {
    const numBits = a.length
    const s: LogicValue[] = ArrayFillWith(Unknown, numBits)
    const toInt = (vs: readonly LogicValue[]): number | undefined => {
        let s = 0
        let col = 1
        for (const v of vs) {
            if (isUnknown(v)) {
                return undefined
            }
            s += Number(v) * col
            col *= 2
        }
        return s
    }

    const aInt = toInt(a)
    const bInt = toInt(b)
    let cout: LogicValue = Unknown
    let v: LogicValue = Unknown
    if (aInt !== undefined && bInt !== undefined && isBoolean(cin)) {
        // otherwise, stick with default Unset values everywhere
        let yInt = aInt - bInt - (cin ? 1 : 0)
        // console.log(`${aInt} - ${bInt} = ${yInt}`)
        // we can get anything from (max - (-min)) = 7 - (-8) = 15
        // to (min - max) = -8 - 7 = -15
        if (yInt < 0) {
            yInt += Math.pow(2, numBits)
        }
        // now we have everything between 0 and 15
        const yBinStr = (yInt >>> 0).toString(2).padStart(numBits, '0')
        const lastIdx = numBits - 1
        for (let i = 0; i < numBits; i++) {
            s[i] = yBinStr[lastIdx - i] === '1'
        }

        cout = bInt > (aInt - (cin ? 1 : 0))

        const aNeg = a[lastIdx] === true // NOT redundant comparison
        const bNeg = b[lastIdx] === true
        const yNeg = s[lastIdx] === true

        // see https://stackoverflow.com/a/34547815/390581
        // Signed integer overflow of the expression x-y-c (where c is again 0 or 1)
        // occurs if and only if x and y have opposite signs, and the sign of the 
        // result is opposite to that of x (or, equivalently, the same as that of y).
        v = aNeg !== bNeg && aNeg !== yNeg
    }

    return { s, cout, v }
}

function doALUNot(a: readonly LogicValue[]): LogicValue[] {
    const not = Gate1Types.props.not.out
    return ArrayFillUsing(i => not([a[i]]), a.length)
}

function doALUBinOp(op: Gate2toNType, a: readonly LogicValue[], b: readonly LogicValue[]) {
    const func = Gate2toNTypes.props[op].out
    return ArrayFillUsing(i => func([a[i], b[i]]), a.length)
}