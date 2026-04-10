import * as t from "io-ts"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_COMPONENT_INNER_LABELS, COLOR_GROUP_SPAN, displayValuesFromArray, drawLabel, drawWireLineToComponent, fillTextVAlign, GRID_STEP, TextVAlign } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillUsing, ArrayFillWith, isBoolean, isHighImpedance, isUnknown, LogicValue, Orientation, typeOrUndefined, Unknown } from "../utils"
import { AdderArrayDef } from "./AdderArray"
import { BypassDef } from "./Bypass"
import { defineParametrizedComponent, groupHorizontal, groupVertical, param, paramBool, ParametrizedComponentBase, Repr, ResolvedParams, Value } from "./Component"
import { ControlledInverterDef } from "./ControlledInverter"
import { DrawableParent, DrawContext, GraphicsRendering, MenuData, MenuItems } from "./Drawable"
import { GateArrayDef } from "./GateArray"
import { Gate1Types, Gate2toNType, Gate2toNTypes } from "./GateTypes"
import { Mux, MuxDef } from "./Mux"
import { WaypointSpecCompact, WirePositionAllocation } from "./XRay"


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
            const topGroup = groupHorizontal("n", 0, top, topGroupBits, undefined, { leadLength: 0 })
            const leadLengthS = 9
            const leadLengthM = 14
            const leadLengthL = 20
            const leadLengths = usesExtendedOpcode ? [leadLengthL, 17, leadLengthM, 11, leadLengthS] : [leadLengthL, leadLengthM, 9]
            topGroup.forEach((spec, i) => spec[4]!.leadLength = leadLengths[i])
            const cin = topGroup.pop()!
            // extracted to be mapped correctly when switching between reduced/extended opcodes
            const opMode = topGroup.pop()!
            return {
                ins: {
                    A: groupVertical("w", -outputX, -inputCenterY, numBits),
                    B: groupVertical("w", -outputX, inputCenterY, numBits),
                    Op: topGroup,
                    Mode: opMode,
                    Cin: [cin[0], cin[1], "n", `Cin (${S.Components.ALU.InputCinDesc})`, cin[4]],
                },
                outs: {
                    S: groupVertical("e", outputX, 0, numBits),
                    V: [0, bottom, "s", "V (oVerflow)", { leadLength: leadLengthM }],
                    Z: [2, bottom, "s", "Z (Zero)", { leadLength: leadLengthL }],
                    Cout: [-2, bottom, "s", `Cout (${S.Components.ALU.OutputCoutDesc})`, { leadLength: leadLengthS }],
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

        // background
        g.fillStyle = COLOR_BACKGROUND
        const outline = g.createPath()
        outline.moveTo(left, top)
        outline.lineTo(right, lowerTop)
        outline.lineTo(right, bottom - 2 * GRID_STEP)
        outline.lineTo(left, bottom)
        outline.lineTo(left, this.posY + 1 * GRID_STEP)
        outline.lineTo(left + 2 * GRID_STEP, this.posY)
        outline.lineTo(left, this.posY - 1 * GRID_STEP)
        outline.closePath()
        g.fill(outline)

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
                fillTextVAlign(g, TextVAlign.middle, opName, ...ctx.rotatePoint(this.posX + 5, this.posY))
            }
        })

        // xray and outline
        this.doDrawXRayAndOutline(g, ctx, outline)
    }

    protected override xrayScale(): number | undefined {
        if (!this.usesExtendedOpcode) {
            return this.numBits >= 16 ? 0.10 : this.numBits >= 8 ? 0.16 : 0.22
        } else {
            return this.numBits >= 16 ? 0.054 : 0.08
        }
    }

    protected override makeXRay(level: number, scale: number, link: boolean) {

        const bits = this.numBits
        const { xray, wire, gate } = this.parent.editor.newXRay(this, level, scale)
        const { ins, outs, p } = this.makeXRayNodes(xray, link)

        let muxAL: Mux
        let allocOut: WirePositionAllocation

        if (!this.usesExtendedOpcode) {

            // TODO: add and gate to prevent Cout and V from being set in logic mode

            // arithmetic part
            const adder = AdderArrayDef.makeSpawned(xray, "adder", p.later, p.y(-.4), "e", { bits })
            const adderHalfHeight = adder.unrotatedHeight / 2 + 3 * GRID_STEP
            const xorCin = gate("xorCin", "xor", p.later, adder.posY - adderHalfHeight, "s")
            wire(xorCin, adder.inputs.Cin, false)
            const xorCinInOpY = xorCin.in[0].posY - GRID_STEP
            const xorCout = gate("xorCout", "xor", p.later, adder.posY + adderHalfHeight, "s")
            wire(adder.outputs.Cout, xorCout.in[0], true)

            const inv = ControlledInverterDef.makeSpawned(xray, "inv", p.later, p.later, "e", { bits, bottom: false })
            xray.alignComponentOf(inv.outputs.Out[0], adder.inputs.B[0])

            // logic part
            const andArray = GateArrayDef.makeSpawned(xray, "andArray", p.later, p.y(.65), "e", { type: "and", bits })
            const gateArrayHeight = andArray.unrotatedHeight
            const orArray = GateArrayDef.makeSpawned(xray, "orArray", p.later, andArray.posY - gateArrayHeight - GRID_STEP * Math.max(1, bits / 4), "e", { type: "or", bits })
            const muxLog = MuxDef.makeSpawned(xray, "muxLog", p.later, (andArray.posY + orArray.posY) / 2, "e", { from: 2 * bits, to: bits, bottom: false })

            // output
            muxAL = MuxDef.makeSpawned(xray, "muxAL", p.right - 4 * GRID_STEP, p.later, "e", { from: 2 * bits, to: bits, bottom: false })

            xray.wires(inv.outputs.Out, adder.inputs.B)

            const logicArrayWidth = orArray.outputs.S[0].posX - orArray.inputs.A[0].posX
            const muxWidth = muxAL.outputs.Z[0].posX - muxAL.inputs.I[0][0].posX

            const allocs = xray.wiresInZones(p.left, p.right, [{
                id: "aluIn",
                from: [...ins.A, ...ins.B],
                to: [[...adder.inputs.A, ...inv.inputs.In], orArray.inputs._all, andArray.inputs._all],
                alloc: { order: "top-down" },
                after: { comps: [inv, orArray, andArray], compWidth: logicArrayWidth },
            }, {
                id: "toMuxLog",
                from: [...orArray.outputs.S, ...andArray.outputs.S],
                to: [...muxLog.inputs.I[0], ...muxLog.inputs.I[1]],
                bookings: { colsLeft: 3 },
                after: { comps: [muxLog], compWidth: muxWidth },
            }, {
                id: "toMuxAL",
                from: muxLog.outputs.Z,
                to: muxAL.inputs.I[1],
                after: { comps: [muxAL], compWidth: muxWidth },
            }, {
                id: "aluOut",
                from: muxAL.outputs.Z,
                to: outs.S,
                alloc: { order: "bottom-up", allDifferent: true },
            }])
            allocOut = allocs.aluOut

            xray.wires(adder.outputs.S, muxAL.inputs.I[0], { position: allocs.toMuxAL })

            const allocMuxLogIn = allocs.toMuxLog
            const flagsBranchY1 = xorCout.outputs.Out.posY
            const flagsBranchY2 = outs.V.posY - GRID_STEP
            wire(xorCout, outs.Cout, "vh", [
                [allocMuxLogIn.at(bits + 2), flagsBranchY1],
                [outs.Cout, flagsBranchY2],
            ])
            wire(adder.outputs.V, outs.V, "vh", [
                [allocMuxLogIn.at(bits + 1), flagsBranchY1 - allocMuxLogIn.inc],
                [outs.V, flagsBranchY2],
            ])
            const muxLogSelInputX = allocs.toMuxAL.at(bits + 1)
            wire(ins.Op[0], muxLog.inputs.S[0], "vh", [[muxLogSelInputX, xorCinInOpY], [muxLogSelInputX, flagsBranchY1 - 2 * allocMuxLogIn.inc]])
            wire(ins.Op[0], inv.inputs.S, "vh", [inv.inputs.S, xorCinInOpY])
            wire(ins.Op[0], xorCout.in[1], "vh", [xorCout.in[1], xorCinInOpY])
            wire(ins.Op[0], xorCin.in[0], "vh", [xorCin.in[0], xorCinInOpY])
            wire(ins.Mode, muxAL.inputs.S[0], "vh", [muxAL.inputs.S[0], xorCinInOpY - 2 * GRID_STEP])

            const allocIn = allocs.aluIn
            const cInWireWaypoints: WaypointSpecCompact[] = [[xorCin.in[1], xorCinInOpY - GRID_STEP]]
            if (ins.Cin.posX < allocIn.first) {
                cInWireWaypoints.unshift([allocIn.first - 2 * allocIn.inc, ins.A[0].posY + 2 * allocIn.inc])
            }
            wire(ins.Cin, xorCin.in[1], "vh", cInWireWaypoints)


        } else {
            // extended opcode

            // xray.drawDebugLines = true

            const inc = (bits <= 4 ? 1.4 : (bits <= 16 ? 0.85 : 0.5)) * GRID_STEP
            const invertOn = bits // to have a nicer name when deriving allocators

            const allocControlLinesRight = xray.newPositionAlloc(p.right - GRID_STEP, -inc, 6)
            xray.debugVLine(allocControlLinesRight, "blue", "allocControlLinesRight")

            const decGatesY = ins.Op[0].posY + 17 * GRID_STEP
            const decGatesY2 = decGatesY + 9 * GRID_STEP
            const decGatesRightX = allocControlLinesRight.at(5) - 3 * GRID_STEP

            // control gates, first line
            const decATimes2 = gate("decATimes2", "rnimply", decGatesRightX, decGatesY, "s")
            const decATimesDiv2 = gate("decATimesDiv2", "and", decATimes2.posX - 5 * GRID_STEP, decGatesY, "s")
            const decADiv2 = gate("decADiv2", "and", decATimesDiv2.posX - 5 * GRID_STEP, decGatesY, "s")
            const decAGetsB = gate("decAGetsB", "rnimply", decADiv2.posX - 4.5 * GRID_STEP, decGatesY, "s")
            const decANeg = gate("decANeg", "nimply", decAGetsB.posX - 5 * GRID_STEP, decGatesY, "s")
            const decBGets1 = gate("decBGets1", "nimply", decANeg.posX - 4.5 * GRID_STEP, decGatesY, "s")

            // control gates, second line
            const decBCst = gate("decBCst", "or", decANeg, decGatesY2, "s", 3)
            const decBGetsA = gate("decBGetsA", "nor", p.later, decGatesY2, "s")
            const decBNeg = gate("decBNeg", "or", decATimesDiv2, decGatesY2, "s")

            // coordinates of upper right corners of the control lines

            const allocControlLinesUp = xray.newPositionAlloc(decATimes2.in[0].posY - 2 * GRID_STEP, -inc, 5)
            xray.debugHLine(allocControlLinesUp, "green", "allocControlLinesUp")

            // wires inside decoder gates
            wire(decATimesDiv2, decATimes2.in[1], "hv", [decATimesDiv2.posX + 2.5 * GRID_STEP, decATimes2.in[1]])
            wire(decATimesDiv2, decADiv2.in[0], "hv", [decATimesDiv2.posX - 2.5 * GRID_STEP, decADiv2.in[0]])
            wire(decAGetsB, decANeg.in[0], "hv", [decAGetsB.posX - 2.5 * GRID_STEP, decANeg.in[0]])
            wire(decAGetsB, decBGetsA.in[1], true)
            wire(decATimes2, decBGetsA.in[0], "vh", [decBGetsA.in[0], decBGetsA.in[0].posY - 2 * GRID_STEP])
            wire(decAGetsB, decBNeg.in[1], "vh", p.upBy(1, decBNeg.in[1]))
            wire(decADiv2, decBCst.in[0], "vh", p.upBy(3, decBCst.in[0]))
            wire(decANeg, decBCst.in[1])
            wire(decBGets1, decBCst.in[2], "vh", [decBCst.in[2], decBCst.in[2].posY - GRID_STEP])

            // wires from control lines to decoder gates
            const decLineOp0Y = allocControlLinesUp.at(0)
            const decLineOp0Corner1 = [allocControlLinesRight.at(1), decLineOp0Y] as const
            const decLineOp1Y = allocControlLinesUp.at(1)
            const decLineOp2Y = allocControlLinesUp.at(2)
            wire(ins.Op[0], decADiv2.in[1], "vh", [decADiv2.in[1], decLineOp0Y])
            wire(ins.Op[0], decANeg.in[1], "vh", [decANeg.in[1], decLineOp0Y])
            wire(ins.Op[0], decATimes2.in[0], "vh", [decATimes2.in[0], decLineOp0Y])
            wire(ins.Op[1], decATimesDiv2.in[0], "vh", [decATimesDiv2.in[0], decLineOp1Y])
            wire(ins.Op[1], decAGetsB.in[0], "vh", [decAGetsB.in[0], decLineOp1Y])
            wire(ins.Op[1], decBGets1.in[0], "vh", [decBGets1.in[0], decLineOp1Y])
            wire(ins.Op[2], decATimesDiv2.in[1], "vh", [decATimesDiv2.in[1], decLineOp2Y])
            wire(ins.Op[2], decAGetsB.in[1], "vh", [decAGetsB.in[1], decLineOp2Y])
            wire(ins.Op[2], decBGets1.in[1], "vh", [decBGets1.in[1], decLineOp2Y])
            wire(ins.Op[0], decBNeg.in[0], "vh", [decLineOp0Corner1, p.upBy(1, decBNeg.in[0])])


            // arithmetic input selectors
            const allocInput = xray.newPositionAlloc(p.left + GRID_STEP, inc, 2 * bits + 3)
            const allocInputB = allocInput.derive({ invertOn })
            const allocInputA = allocInput.derive({ colShift: bits + 1, invertOn })

            const muxAShift = MuxDef.makeSpawned(xray, "muxAShift", p.later, decBCst.posY + 16 * GRID_STEP, "e", { from: 2 * bits, to: bits, bottom: false })
            xray.alignXAfter(allocInput, muxAShift.inputs.I[0][0])

            const allocToMuxABSel = xray.newPositionAlloc(muxAShift.outputs.Z[0].posX, inc, bits + 2)
            const allocToMuxABSelA = allocToMuxABSel.derive({ colShift: 2 })

            const muxAInput = MuxDef.makeSpawned(xray, "muxAInput", p.later, p.later, "e", { from: 2 * bits, to: bits, bottom: false })

            xray.alignComponentOf(muxAInput.inputs.I[0][0], muxAShift.outputs.Z[0])
            xray.alignXAfter(allocToMuxABSel, muxAInput.inputs.I[0][0])

            xray.wires(muxAShift.outputs.Z, muxAInput.inputs.I[0])

            const muxBInput = MuxDef.makeSpawned(xray, "muxBInput", muxAInput, muxAInput.posY + muxAInput.unrotatedHeight + 2 * GRID_STEP, "e", { from: 2 * bits, to: bits, bottom: false })
            const muxBCst = MuxDef.makeSpawned(xray, "muxBCst", muxAShift, muxBInput.posY + muxBInput.unrotatedHeight / 2 + 2 * GRID_STEP, "e", { from: 2 * bits, to: bits, bottom: false })
            const cst0 = xray.constant("cst0", false, muxBCst.inputs.I[0][0], muxBCst.inputs.I[1][bits - 1].posY + 2.5 * GRID_STEP, "n")
            for (let i = 1; i < bits; i++) {
                wire(cst0.outputs.Out[0], muxBCst.inputs.I[1][i])
            }

            // from outside
            const allocControlLinesDown = xray.newPositionAlloc(decBCst.outputs.Out.posY - GRID_STEP, inc, 12)
            xray.debugHLine(allocControlLinesDown, "brown", "allocControlLinesDown")

            wire(decBGets1, muxBCst.inputs.I[1][0], "hv", [decBGets1, allocControlLinesDown.at(0)])
            const decBCstOutputWaypoint = [muxBCst.outputs.Z[0], allocControlLinesDown.at(2)] as const
            wire(decBCst, muxBCst.inputs.S[0], "vh", decBCstOutputWaypoint)
            wire(decADiv2, muxAShift.inputs.S[0], "vh", [[decBGets1.posX + inc, decADiv2.outputs.Out.posY + GRID_STEP], [muxAShift.inputs.S[0], allocControlLinesDown.at(1)]])
            wire(decAGetsB, muxAInput.inputs.S[0], "vh", [[decBGetsA.posX - 2.5 * GRID_STEP, decAGetsB.outputs.Out.posY + 3 * GRID_STEP], [muxAInput.inputs.S[0], allocControlLinesDown.at(3)]])

            const allocToAdder = xray.newPositionAlloc(muxAInput.outputs.Z[0].posX, inc, bits + 4)
            const allocToAdderA = allocToAdder.derive({ colShift: 2, invertOn })

            wire(decBGetsA, muxBInput.inputs.S[0], "vh", [allocToAdder.at(0), allocControlLinesDown.at(4)])

            const adder = AdderArrayDef.makeSpawned(xray, "adder", p.later, p.later, "e", { bits })
            xray.alignXAfter(allocToAdder, adder.inputs.A[0])
            xray.alignComponentOf(adder.inputs.B[0], muxBInput.outputs.Z[0])

            const xorCin = gate("xorCin", "xor", adder, adder.posY - adder.unrotatedHeight / 2 - 5 * GRID_STEP, "s")
            const invB = ControlledInverterDef.makeSpawned(xray, "invB", adder.posX - 6 * GRID_STEP, p.later, "e", { bits, bottom: false })
            xray.alignComponentOf(invB.outputs.Out[0], adder.inputs.B[0])
            const xorCout = gate("xorCout", "xor", p.later, adder.posY + adder.unrotatedHeight / 2 + 4 * GRID_STEP, "s")
            wire(adder.outputs.Cout, xorCout.in[0], true)
            const andCout = gate("andCout", "and", p.later, xorCout.posY + 7 * GRID_STEP, "s")
            wire(xorCout, andCout.in[0], true)
            const andV = gate("andV", "and", p.later, andCout, "s")
            wire(adder.outputs.V, andV.in[1], true)
            const notMode = gate("notMode", "not", xorCout.posX + 6 * GRID_STEP, xorCout, "s")
            wire(notMode, andCout.in[1], "hv", p.downBy(1, notMode.outputs.Out))
            wire(notMode, andV.in[0], "hv", p.downBy(1, notMode.outputs.Out))
            // 
            wire(xorCin, adder.inputs.Cin)
            wire(decBNeg, xorCin.in[1], "vh", [xorCin.in[1], allocControlLinesDown.at(5)])
            wire(decBNeg, xorCout.in[1], "vh", [[xorCin.in[1], allocControlLinesDown.at(5)], [xorCin.in[1].posX - 2 * GRID_STEP, xorCin.in[1].posY - 2 * GRID_STEP]])
            wire(decBNeg, invB.inputs.S, "vh", [[xorCin.in[1], allocControlLinesDown.at(5)], [xorCin.in[1].posX - 2 * GRID_STEP, xorCin.in[1].posY - 2 * GRID_STEP]])

            xray.wires(muxBInput.outputs.Z, invB.inputs.In)
            xray.wires(invB.outputs.Out, adder.inputs.B)

            for (let i = 0; i < bits; i++) {
                wire(ins.A[i], muxAShift.inputs.I[0][i], "hv", [allocInputA.at(i), muxAShift.inputs.I[0][i]])
                if (i > 0) {
                    wire(ins.A[i], muxAShift.inputs.I[1][i - 1], "hv", [allocInputA.at(i), muxAShift.inputs.I[1][i - 1]])
                }
                wire(ins.A[i], muxBInput.inputs.I[0][i], "hv", [allocInputA.at(i), muxBInput.inputs.I[0][i]])
                wire(ins.B[i], muxBCst.inputs.I[0][i], "hv", [allocInputB.at(i), muxBCst.inputs.I[0][i]])
                wire(muxBCst.outputs.Z[i], muxBInput.inputs.I[1][i], "hv", [allocToMuxABSelA.at(i), muxBInput.inputs.I[1][i]])
                wire(muxBCst.outputs.Z[i], muxAInput.inputs.I[1][i], "hv", [allocToMuxABSelA.at(i), muxAInput.inputs.I[1][i]])
                wire(muxAInput.outputs.Z[i], adder.inputs.A[i], "hv", [allocToAdderA.at(i), adder.inputs.A[i]])
            }
            wire(ins.A[bits - 1], muxAShift.inputs.I[1][bits - 1], "hv", [allocInputA.at(bits - 1), muxAShift.inputs.I[1][bits - 1]])

            // logic part

            const invOr = ControlledInverterDef.makeSpawned(xray, "invOr", muxBCst, p.y(.15), "e", { bits, bottom: false })
            const or = GateArrayDef.makeSpawned(xray, "or", invOr.posX + 6 * GRID_STEP, p.later, "e", { type: "or", bits })
            xray.alignComponentOf(or.inputs.B[0], invOr.outputs.Out[0])
            xray.wires(invOr.outputs.Out, or.inputs.B)

            const and = GateArrayDef.makeSpawned(xray, "and", or, or.posY + or.unrotatedHeight + 2 * GRID_STEP, "e", { type: "and", bits })
            const invAnd = ControlledInverterDef.makeSpawned(xray, "invAnd", invOr, p.later, "e", { bits, bottom: false })
            xray.alignComponentOf(invAnd.outputs.Out[0], and.inputs.B[0])
            xray.wires(invAnd.outputs.Out, and.inputs.B)

            const xor = GateArrayDef.makeSpawned(xray, "xor", or, and.posY + and.unrotatedHeight + 2 * GRID_STEP, "e", { type: "xor", bits })
            const bypassXor = BypassDef.makeSpawned(xray, "bypassXor", invOr, p.later, "e", { bits, bottom: true })
            xray.alignComponentOf(bypassXor.outputs.Out[0], xor.inputs.B[0])
            const cst1 = xray.constant("cst1", true, bypassXor.inputs.V.posX + 2 * GRID_STEP, bypassXor.inputs.V, "w")
            wire(cst1.outputs.Out[0], bypassXor.inputs.V)
            const invBypass = gate("invBypass", "not", bypassXor.posX + 3 * GRID_STEP, bypassXor.inputs.F.posY + 2.5 * GRID_STEP, "w")
            wire(invBypass, bypassXor.inputs.F, "hv")
            wire(decBCst, invOr.inputs.S, "vh", decBCstOutputWaypoint)
            wire(decBCst, invAnd.inputs.S, "vh", decBCstOutputWaypoint)

            const muxAShiftLog = MuxDef.makeSpawned(xray, "muxAShiftLog", or, xor.posY + xor.unrotatedHeight + 7 * GRID_STEP, "e", { from: 2 * bits, to: bits, bottom: false })

            xray.wires(bypassXor.outputs.Out, xor.inputs.B)
            xray.wires(ins.A, [or.inputs.A, and.inputs.A, xor.inputs.A], { position: allocInputA })
            xray.wires(ins.B, [invOr.inputs.In, invAnd.inputs.In, bypassXor.inputs.In], {
                position: allocInputB,
                alloc: "top-down",
            })
            for (let i = 0; i < bits; i++) {
                if (i < bits - 1) {
                    wire(ins.A[i], muxAShiftLog.inputs.I[0][i + 1], "hv", [allocInputA.at(i), muxAShiftLog.inputs.I[0][i + 1]])
                }
                if (i > 0) {
                    wire(ins.A[i], muxAShiftLog.inputs.I[1][i - 1], "hv", [allocInputA.at(i), muxAShiftLog.inputs.I[1][i - 1]])
                }
            }

            const muxLog = MuxDef.makeSpawned(xray, "muxLog", adder, (and.posY + xor.posY) / 2, "e", { from: 4 * bits, to: bits, bottom: false })
            const allocMuxLogIn = xray.wires([...or.outputs.S, ...and.outputs.S, ...xor.outputs.S, ...muxAShiftLog.outputs.Z], muxLog.inputs.I.flat(), { bookings: { colsLeft: 6 }, position: { inc } })
            xray.alignXAfter(allocMuxLogIn, muxLog.inputs.I[0][0])
            const allocMuxLogInControlLines = allocMuxLogIn.derive({ colShift: 2 * bits + 1, invertOn: 5 })
            xray.debugVLine(allocMuxLogInControlLines, "orange", "allocMuxLogInControlLines")

            // output mux
            muxAL = MuxDef.makeSpawned(xray, "muxAL", p.right - 2 - (bits + 3) * inc, 0, "e", { from: 2 * bits, to: bits, bottom: false })
            allocOut = xray.wires(muxAL.outputs.Z, outs.S, {
                position: { right: p.right - 2 },
                alloc: { order: "bottom-up", allDifferent: true },
            })
            const allocToMuxAL = xray.wires([...adder.outputs.S, ...muxLog.outputs.Z], muxAL.inputs.I.flat(), {
                bookings: { colsLeft: 7 },
                position: { left: notMode.posX + 2 * GRID_STEP, inc },
            })

            const allocVerticalControlLines = allocToMuxAL.derive({ colShift: bits + 1, invertOn: 6 })
            xray.debugVLine(allocVerticalControlLines, "purple", "allocVerticalControlLines")

            // Cout and V
            const allocMiddleControlLines = xray.newPositionAlloc(or.posY - or.unrotatedHeight / 2 - 2 * GRID_STEP, -inc, 6)
            xray.debugHLine(allocMiddleControlLines, "red", "allocMiddleControlLines")
            wire(andV, outs.V, "vh", [[allocMuxLogInControlLines.at(3), allocMiddleControlLines.at(4)], [outs.V, outs.V.posY - 3 * GRID_STEP]])
            const orCout = gate("orCout", "or", outs.Cout, outs.Cout.posY - 5 * GRID_STEP, "s")
            wire(orCout, outs.Cout)
            wire(andCout, orCout.in[0], "vh", [[allocMuxLogInControlLines.at(2), allocMiddleControlLines.at(5)], [orCout.in[0], outs.V.posY - 3 * GRID_STEP]])
            const andLogCout = gate("andLogCout", "and", p.later, orCout.posY - 6 * GRID_STEP, "s")
            wire(andLogCout, orCout.in[1], false)
            wire(ins.A[bits - 1], andLogCout.in[1], "hv", [allocInputA.at(bits - 1), muxAShiftLog.inputs.I[1][bits - 2]])

            const decLineModeCorner1 = [allocControlLinesRight.at(0), allocControlLinesUp.at(4)] as const
            const decLineModeCorner2 = [allocVerticalControlLines.at(5), allocControlLinesDown.at(11)] as const
            wire(ins.Mode, muxAL.inputs.S[0], "vh", [decLineModeCorner1, decLineModeCorner2])
            wire(ins.Mode, notMode, "vh", [decLineModeCorner1, decLineModeCorner2, [notMode, notMode.inputs.In[0].posY - GRID_STEP]])

            const decLineCinCorner1 = [allocControlLinesRight.at(4), allocControlLinesUp.at(3)] as const
            const decLineCinCorner2 = [allocVerticalControlLines.at(1), allocControlLinesDown.at(7)] as const
            const decLineCinCorner3 = [allocMuxLogInControlLines.at(0), allocMiddleControlLines.at(2)] as const
            const decLineCinCorner4 = [muxAShiftLog.inputs.I[0][0].posX - GRID_STEP, muxAShiftLog.inputs.S[0].posY] as const
            wire(ins.Cin, xorCin.in[0], "vh", [decLineCinCorner1, decLineCinCorner2, p.upBy(2, xorCin.in[0])])
            wire(ins.Cin, muxAShiftLog.inputs.I[0][0], "vh", [decLineCinCorner1, decLineCinCorner2, decLineCinCorner3, decLineCinCorner4])
            wire(ins.Cin, muxAShiftLog.inputs.I[1][bits - 1], "vh", [decLineCinCorner1, decLineCinCorner2, decLineCinCorner3, decLineCinCorner4])
            wire(decATimes2, andLogCout.in[0], "vh", [[allocControlLinesRight.at(5), decATimes2.outputs.Out.posY + 2 * GRID_STEP], [allocVerticalControlLines.at(0), allocControlLinesDown.at(6)], [allocMuxLogInControlLines.at(1), allocMiddleControlLines.at(3)], p.upBy(1, andLogCout.in[0])])
            const decLineOp0Corner2 = [allocVerticalControlLines.at(4), allocControlLinesDown.at(10)] as const
            const decLineOp0Corner3 = [allocMuxLogInControlLines.at(4), allocMiddleControlLines.at(1)] as const
            wire(ins.Op[0], invBypass, "vh", [decLineOp0Corner1, decLineOp0Corner2, decLineOp0Corner3])
            wire(ins.Op[0], muxAShiftLog.inputs.S[0], "vh", [decLineOp0Corner1, decLineOp0Corner2, decLineOp0Corner3, [muxAShiftLog.inputs.S[0].posX, invBypass.posY]])

            const muxMuxLogSel = MuxDef.makeSpawned(xray, "muxMuxLogSel", muxLog.posX + 4 * GRID_STEP, muxLog.posY - muxLog.unrotatedHeight / 2 - 4 * GRID_STEP, "w", { from: 2, to: 1, bottom: true })
            wire(muxMuxLogSel.outputs.Z[0], muxLog.inputs.S[0], "hv")
            const decLineOp2Corner1 = [allocControlLinesRight.at(3), decLineOp2Y] as const
            const decLineOp2Corner2 = [allocVerticalControlLines.at(2), allocControlLinesDown.at(8)] as const
            const decLineOp2Corner3 = [muxLog.inputs.S[1], allocMiddleControlLines.at(0)] as const
            wire(ins.Op[2], muxLog.inputs.S[1], "vh", [decLineOp2Corner1, decLineOp2Corner2, decLineOp2Corner3])
            wire(ins.Op[2], muxMuxLogSel.inputs.S[0], "vh", [decLineOp2Corner1, decLineOp2Corner2, decLineOp2Corner3])
            const decLineOp1Corner1 = [allocControlLinesRight.at(2), decLineOp1Y] as const
            const decLineOp1Corner2 = [allocVerticalControlLines.at(3), allocControlLinesDown.at(9)] as const
            wire(ins.Op[1], muxMuxLogSel.inputs.I[1][0], "vh", [decLineOp1Corner1, decLineOp1Corner2])
            wire(ins.Op[0], muxMuxLogSel.inputs.I[0][0], "vh", [decLineOp0Corner1, decLineOp0Corner2])
        }

        const norZ = gate("norZ", "nor", p.later, outs.Z.posY - 5 * GRID_STEP, "s", bits)
        wire(norZ, outs.Z, false)
        const norZInMinY = norZ.in[0].posY
        for (let i = 0; i < bits; i++) {
            const out = muxAL.outputs.Z[i]
            const ind = bits - 1 - i
            wire(out, norZ.in[ind], "hv", [allocOut.at(ind), norZInMinY + ind * allocOut.inc])
        }

        return xray
    }

    private doSetShowOp(showOp: boolean) {
        this._showOp = showOp
        this.requestRedraw({ why: "show op changed" })
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
                    case "A<<": {
                        cout = a[a.length - 1]
                        return [cin, ...a.slice(0, a.length - 1)]
                    }
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
    const v = !isBoolean(cout) || !isBoolean(cins[numBits - 1]) ? Unknown : cout !== cins[numBits - 1]
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
        // Signed integer overflow of the expression x-y-c (where c is 0 or 1)
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