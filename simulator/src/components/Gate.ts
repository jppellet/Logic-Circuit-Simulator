import { Expand, FixedArraySize, isDefined, isUnset, Mode, RichStringEnum, TriState, Unset, unset } from "../utils"
import { ComponentBase, ComponentRepr, defineComponent } from "./Component"
import * as t from "io-ts"
import { Color, COLOR_DARK_RED, COLOR_MOUSE_OVER, COLOR_UNSET, GRID_STEP, wireLineToComponent } from "../drawutils"
import { mode } from "../simulator"
import { asValue, b, cls, div, emptyMod, Modifier, ModifierObject, mods, table, tbody, td, th, thead, tooltipContent, tr } from "../htmlgen"
import { DrawContext } from "./Drawable"


const Gate2Types_ = {
    // usual suspects
    AND: {
        out: (in1: boolean, in2: boolean) => in1 && in2, localName: "ET",
        localDesc: "La sortie vaut 1 lorsque les deux entrées valent 1.",
    },
    OR: {
        out: (in1: boolean, in2: boolean) => in1 || in2, localName: "OU",
        localDesc: "La sortie vaut 1 lorsqu’au moins une des deux entrées vaut 1.",
    },
    XOR: {
        out: (in1: boolean, in2: boolean) => in1 !== in2, localName: "OU-X",
        localDesc: "La sortie vaut 1 lorsque l’une ou l’autre des deux entrées vaut 1, mais pas les deux.",
    },
    NAND: {
        out: (in1: boolean, in2: boolean) => !(in1 && in2), localName: "NON-ET",
        localDesc: "Porte ET inversée: la sortie vaut 1 à moins que les deux entrées ne valent 1.",
    },
    NOR: {
        out: (in1: boolean, in2: boolean) => !(in1 || in2), localName: "NON-OU",
        localDesc: "Porte OU inversée: la sortie vaut 1 lorsque les deux entrées valent 0.",
    },
    XNOR: {
        out: (in1: boolean, in2: boolean) => in1 === in2, localName: "NON-OU-X",
        localDesc: "Porte OU-X inversée: la sortie vaut 1 lorsque les entrées valent soit les deux 1, soit les deux 0.",
    },

    // less common gates
    IMPLY: {
        out: (in1: boolean, in2: boolean) => !in1 || in2, localName: "IMPLIQUE",
        localDesc: "La sortie vaut 1 si la première entrée vaut 0 ou si les deux entrées valent 1.",
    },
    RIMPLY: {
        out: (in1: boolean, in2: boolean) => in1 || !in2, localName: "IMPLIQUE (bis)",
        localDesc: "La sortie vaut 1 si la seconde entrée vaut 0 ou si les deux entrées valent 1.",
    },
    NIMPLY: {
        out: (in1: boolean, in2: boolean) => in1 && !in2, localName: "NON-IMPLIQUE",
        localDesc: "Porte IMPLIQUE inversée: la sortie ne vaut 1 que lorsque la première entrée vaut 1 et la seconde 0.",
    },
    RNIMPLY: {
        out: (in1: boolean, in2: boolean) => !in1 && in2, localName: "NON-IMPLIQUE (bis)",
        localDesc: "Porte IMPLIQUE inversée: la sortie ne vaut 1 que lorsque la première entrée vaut 0 et la seconde 1.",
    },

    // observing only one input
    TXA: {
        out: (in1: boolean, __: boolean) => in1, localName: "TRANSFERT-A",
        localDesc: "La sortie est égale à la première entrée; la seconde entrée est ignorée.",
    },
    TXB: {
        out: (__: boolean, in2: boolean) => in2, localName: "TRANSFERT-B",
        localDesc: "La sortie est égale à la seconde entrée; la première entrée est ignorée.",
    },
    TXNA: {
        out: (in1: boolean, __: boolean) => !in1, localName: "TRANSFERT-NON-A",
        localDesc: "La sortie est égale à la première entrée inversée; la seconde entrée est ignorée.",
    },
    TXNB: {
        out: (__: boolean, in2: boolean) => !in2, localName: "TRANSFERT-NON-B",
        localDesc: "La sortie est égale à la seconde entrée inversée; la première entrée est ignorée.",
    },
} as const

export const Gate2Types = RichStringEnum.withProps<{
    out: (in1: boolean, in2: boolean) => boolean
    localName: string
    localDesc: string
}>()(Gate2Types_)

export type Gate2Type = typeof Gate2Types.type


const Gate1Types_ = {
    NOT: {
        out: (in1: boolean) => !in1, localName: "NON",
        localDesc: "La sortie est égale à l’entrée inversée.",
    },
    BUF: {
        out: (in1: boolean) => in1, localName: "OUI",
        localDesc: "La sortie est égale à l’entrée.",
    },
} as const

export const Gate1Types = RichStringEnum.withProps<{
    out: (in1: boolean) => boolean
    localName: string
    localDesc: string
}>()(Gate1Types_)

export type Gate1Type = typeof Gate1Types.type


export type GateType = Gate2Type | Gate1Type
export const GateTypes = {
    isValue: (str: string | null | undefined): str is GateType => {
        return Gate2Types.isValue(str) || Gate1Types.isValue(str)
    },
}

const GateMandatoryParams = t.type({
    type: t.union([t.keyof(Gate2Types_), t.keyof(Gate1Types_)], "GateType"),
}, "Gate")
type GateMandatoryParams = t.TypeOf<typeof GateMandatoryParams>


const Gate2Def = defineComponent(2, 1, GateMandatoryParams)
const Gate1Def = defineComponent(1, 1, GateMandatoryParams)

export const GateDef = t.union([
    Gate2Def.repr,
    Gate1Def.repr,
], "Gate")


type GateRepr<N extends FixedArraySize> = ComponentRepr<N, 1> & GateMandatoryParams

const GRID_WIDTH = 7
const GRID_HEIGHT = 4

export type Gate = GateBase<any, GateRepr<any>>

export abstract class GateBase<NumInput extends FixedArraySize, Repr extends GateRepr<NumInput>> extends ComponentBase<NumInput, 1, Repr, TriState> {

    abstract get type(): GateType
    abstract get poseAs(): GateType | undefined

    get unrotatedWidth() {
        return GRID_WIDTH * GRID_STEP
    }

    get unrotatedHeight() {
        return GRID_HEIGHT * GRID_STEP
    }

    protected propagateNewValue(newValue: TriState) {
        this.outputs[0].value = newValue
    }

    protected abstract get showAsUnknown(): boolean

    doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        const gateType = this.showAsUnknown
            ? Unset
            : this.poseAs ?? this.type
        this.drawGate(g, gateType, gateType !== this.type, ctx)
    }

    protected drawGate(g: CanvasRenderingContext2D, type: GateType | unset, isFake: boolean, ctx: DrawContext) {
        const output = this.outputs[0]

        const width = GRID_WIDTH * GRID_STEP
        const height = GRID_HEIGHT * GRID_STEP
        const left = this.posX - width / 2
        const top = this.posY - height / 2
        const bottom = this.posY + height / 2
        const pi2 = Math.PI / 2

        noFill()
        if (ctx.isMouseOver) {
            const frameWidth = 2
            const frameMargin = 2
            strokeWeight(frameWidth)
            stroke(...COLOR_MOUSE_OVER)
            rect(
                left - frameWidth - frameMargin,
                top - frameWidth - frameMargin,
                width + 2 * (frameWidth + frameMargin),
                height + 2 * (frameWidth + frameMargin)
            )
        }

        const gateWidth = 40
        let gateLeft = this.posX - gateWidth / 2
        let gateRight = this.posX + gateWidth / 2
        const gateBorderColor: Color = (isFake && mode >= Mode.FULL) ? COLOR_DARK_RED : [0, 0, 0]
        strokeWeight(3)
        stroke(...gateBorderColor)

        const rightCircle = () => {
            gateRight += 5
            fill(0xFF)
            arc(gateRight, this.posY, 8, 8, 0, 0)
            noFill()
            gateRight += 4
        }
        const leftCircle = (up: boolean) => {
            arc(gateLeft - 5, this.posY - (up ? 1 : -1) * GRID_STEP, 8, 8, 0, 0)
        }
        const wireEnds = (shortUp = false, shortDown = false) => {
            stroke(0)
            for (let i = 0; i < this.inputs.length; i++) {
                const input = this.inputs[i]
                const short = i === 0 ? shortUp : shortDown
                wireLineToComponent(input, gateLeft - 3 - (short ? 9 : 0), input.posYInParentTransform)
            }
            wireLineToComponent(output, gateRight + 3, this.posY)
        }

        switch (type) {
            case "NOT":
            case "BUF":
                line(gateLeft, top, gateLeft, bottom)
                line(gateLeft, top, gateRight, this.posY)
                line(gateLeft, bottom, gateRight, this.posY)
                if (type === "NOT") {
                    rightCircle()
                }
                wireEnds()
                break

            case "AND":
            case "NAND":
            case "NIMPLY":
            case "RNIMPLY": {
                line(gateLeft, bottom, this.posX, bottom)
                line(gateLeft, top, this.posX, top)
                line(gateLeft, top, gateLeft, bottom)
                arc(this.posX, this.posY, gateWidth, height, -pi2, pi2)
                if (type === "NAND") {
                    rightCircle()
                }
                let shortUp = false, shortDown = false
                if (type === "NIMPLY") {
                    leftCircle(false)
                    shortDown = true
                } else if (type === "RNIMPLY") {
                    leftCircle(true)
                    shortUp = true
                }
                wireEnds(shortUp, shortDown)
                break
            }

            case "OR":
            case "NOR":
            case "XOR":
            case "XNOR":
            case "IMPLY":
            case "RIMPLY": {
                arc(gateLeft - 35, this.posY, 75, 75, -.55, .55)
                gateLeft -= 3
                line(gateLeft, top, this.posX - 15, top)
                line(gateLeft, bottom, this.posX - 15, bottom)
                bezier(this.posX - 15, top, this.posX + 10, top,
                    gateRight - 5, this.posY - 8, gateRight, this.posY)
                bezier(this.posX - 15, bottom, this.posX + 10, bottom,
                    gateRight - 5, this.posY + 8, gateRight, this.posY)
                const savedGateLeft = gateLeft
                gateLeft += 4
                if (type === "NOR" || type === "XNOR") {
                    rightCircle()
                }
                let shortUp = false, shortDown = false
                if (type === "IMPLY") {
                    leftCircle(true)
                    shortUp = true
                } else if (type === "RIMPLY") {
                    leftCircle(false)
                    shortDown = true
                }
                wireEnds(shortUp, shortDown)
                if (type === "XOR" || type === "XNOR") {
                    gateLeft = savedGateLeft
                    stroke(...gateBorderColor)
                    strokeWeight(3)
                    arc(gateLeft - 38, this.posY, 75, 75, -.55, .55)
                }
                break
            }

            case "TXA":
            case "TXNA": {
                triangle(
                    gateLeft, top,
                    gateRight, this.posY,
                    gateLeft, this.posY,
                )
                line(gateLeft, this.posY, gateLeft, bottom)
                let shortLeft = false
                if (type === "TXNA") {
                    leftCircle(true)
                    shortLeft = true
                }
                wireEnds(shortLeft, false)
                break
            }

            case "TXB":
            case "TXNB": {
                triangle(
                    gateLeft, bottom,
                    gateRight, this.posY,
                    gateLeft, this.posY,
                )
                line(gateLeft, this.posY, gateLeft, top)
                let shortLeft = false
                if (type === "TXNB") {
                    leftCircle(false)
                    shortLeft = true
                }
                wireEnds(false, shortLeft)
                break
            }

            case "?":
                stroke(COLOR_UNSET)
                line(gateLeft, top, gateRight, top)
                line(gateLeft, bottom, gateRight, bottom)
                line(gateLeft, top, gateLeft, bottom)
                line(gateRight, top, gateRight, bottom)
                strokeWeight(0)
                wireEnds()

                ctx.inNonTransformedFrame(() => {
                    noStroke()
                    fill(COLOR_UNSET)
                    textSize(20)
                    textAlign(CENTER, CENTER)
                    textStyle(BOLD)
                    text('?', this.posX, this.posY)
                })
                break
        }
    }

}



// TODO migrate to new Def/Repr system
type Gate2MandatoryParams = {
    type: Gate2Type
}
type Gate2Repr = Expand<ComponentRepr<2, 1> & Gate2MandatoryParams & {
    showAsUnknown?: boolean
    poseAs?: Gate2Type | undefined
}>

export class Gate2 extends GateBase<2, Gate2Repr> {

    private _type: Gate2Type
    private _showAsUnknown = false
    private _poseAs: Gate2Type | undefined = undefined

    constructor(savedData: Gate2Repr | Gate2MandatoryParams) {
        super(false, "in" in savedData ? savedData : null, {
            inOffsets: [[-4, -1], [-4, +1]],
            outOffsets: [[+4, 0]],
        })
        this._type = savedData.type
        if ("in" in savedData) {
            // it's a Gate2Repr
            if (isDefined(savedData.showAsUnknown)) {
                this._showAsUnknown = savedData.showAsUnknown
            }
            this._poseAs = savedData.poseAs
        }
    }

    toJSON() {
        return {
            type: this.type,
            ...super.toJSONBase(),
            showAsUnknown: (this._showAsUnknown) ? true : undefined,
            poseAs: this._poseAs,
        }
    }

    public get type() {
        return this._type
    }

    public get poseAs() {
        return this._poseAs
    }

    protected toStringDetails(): string {
        return this.type
    }

    public makeTooltip() {
        if (this._showAsUnknown) {
            return div("Porte cachée")
        }

        const gateProps = Gate2Types.propsOf(this._type)
        const myIn0 = this.inputs[0].value
        const myIn1 = this.inputs[1].value
        const myOut = this.value

        const genTruthTableData = () => {
            const header = ["Entrée 1", "Entrée 2", "Sortie"]
            const rows: TruthTableRowData[] = []
            for (const in0 of [false, true]) {
                for (const in1 of [false, true]) {
                    const matchesCurrent = myIn0 === in0 && myIn1 === in1
                    const out = gateProps.out(in0, in1)
                    rows.push({ matchesCurrent, cells: [in0, in1, out] })
                }
            }
            return [header, rows] as const
        }

        const nodeOut = this.outputs[0].value
        const desc = nodeOut === myOut
            ? "Actuellement, elle livre"
            : "Actuellement, elle devrait livrer"

        const gateIsUnspecified = isUnset(myIn0) || isUnset(myIn1)
        const explanation = gateIsUnspecified
            ? mods(desc + " une sortie indéterminée comme toutes ses entrées ne sont pas connues. Sa table de vérité est:")
            : mods(desc + " une sortie de ", asValue(myOut), " selon la table de vérité suivante:")

        return makeGateTooltip(
            mods("Porte ", b(gateProps.localName)),
            gateProps.localDesc,
            explanation,
            makeTruthTable(genTruthTableData())
        )

    }

    protected get showAsUnknown() {
        return this._showAsUnknown
    }

    protected doRecalcValue(): TriState {
        const in1 = this.inputs[0].value
        const in2 = this.inputs[1].value
        if (isUnset(in1) || isUnset(in2)) {
            return Unset
        }
        const gateProps = Gate2Types.propsOf(this._type)
        return gateProps.out(in1, in2)
    }

    mouseDoubleClicked(e: MouseEvent | TouchEvent) {
        if (super.mouseDoubleClicked(e)) {
            return true // already handled
        }
        if (mode >= Mode.FULL && e.altKey) {
            this._showAsUnknown = !this._showAsUnknown
            this.setNeedsRedraw("display style changed")
            return true
        } else if (mode >= Mode.DESIGN) {
            // switch to IMPLY / NIMPLY variant
            const newType = (() => {
                switch (this._type) {
                    case "IMPLY": return "RIMPLY"
                    case "RIMPLY": return "IMPLY"

                    case "NIMPLY": return "RNIMPLY"
                    case "RNIMPLY": return "NIMPLY"

                    case "TXA": return "TXB"
                    case "TXB": return "TXNA"
                    case "TXNA": return "TXNB"
                    case "TXNB": return "TXA"

                    default: return undefined
                }
            })()
            if (isDefined(newType)) {
                this._type = newType
                this.setNeedsRecalc()
                this.setNeedsRedraw("gate variant changed")
                return true
            }
        }
        return false
    }

}


// TODO migrate to new Def/Repr system
type Gate1MandatoryParams = {
    type: Gate1Type
}
type Gate1Repr = Expand<ComponentRepr<1, 1> & Gate1MandatoryParams & {
    poseAs?: Gate1Type | undefined
}>


// TODO make this work with BUF as well
export class Gate1 extends GateBase<1, Gate1Repr> {

    private _type: Gate1Type
    private _poseAs: Gate1Type | undefined = undefined

    constructor(savedData: Gate1Repr | Gate1MandatoryParams) {
        super(false, "in" in savedData ? savedData : null, {
            inOffsets: [[-4, 0]],
            outOffsets: [[+4, 0]],
        })
        this._type = savedData.type
        if ("in" in savedData) {
            // it's a Gate1Repr
            this._poseAs = savedData.poseAs
        }
    }

    toJSON() {
        return {
            type: this.type,
            ...super.toJSONBase(),
            poseAs: this._poseAs,
        }
    }

    public get type() {
        return this._type
    }

    public get poseAs() {
        return this._poseAs
    }

    protected get showAsUnknown() {
        return false
    }

    protected doRecalcValue(): TriState {
        const in0 = this.inputs[0].value
        if (isUnset(in0)) {
            return Unset
        }
        const gateProps = Gate1Types.propsOf(this._type)
        return gateProps.out(in0)
    }


    public makeTooltip() {
        const myIn = this.inputs[0].value
        const myOut = this.value

        const gateProps = Gate1Types.propsOf(this._type)

        const genTruthTableData = () => {
            const header = ["Entrée", "Sortie"]
            const rows: TruthTableRowData[] = []
            for (const in0 of [false, true]) {
                const matchesCurrent = myIn === in0
                const out = gateProps.out(in0)
                rows.push({ matchesCurrent, cells: [in0, out] })
            }
            return [header, rows] as const
        }

        const nodeOut = this.outputs[0].value
        const desc = nodeOut === myOut
            ? "Actuellement, il livre"
            : "Actuellement, il devrait livrer"

        const explanation = isUnset(myIn)
            ? mods(desc + " une sortie indéterminée comme son entrée n’est pas connue. Sa table de vérité est:")
            : mods(desc + " une sortie de ", asValue(myOut), " car son entrée est ", asValue(myIn), ", selon la table de vérité suivante:")

        const header = (() => {
            switch (this._type) {
                case "NOT": return mods("Inverseur (porte ", b("NON"), ")")
                case "BUF": return mods("Buffer (porte ", b("OUI"), ")")
            }
        })()

        return makeGateTooltip(
            header,
            Gate1Types.propsOf(this._type).localDesc,
            explanation,
            makeTruthTable(genTruthTableData())
        )
    }



    mouseDoubleClicked(e: MouseEvent | TouchEvent) {
        if (super.mouseDoubleClicked(e)) {
            return true // already handled
        }
        if (mode >= Mode.DESIGN) {
            this._type = this._type === "BUF" ? "NOT" : "BUF"
            this.setNeedsRecalc()
            this.setNeedsRedraw("gate variant changed")
            return true
        }
        return false
    }

}

// Truth table generation helpers

type TruthTableRowData = { matchesCurrent: boolean, cells: boolean[] }
const makeTruthTable = ([header, rows]: readonly [string[], TruthTableRowData[]]) => {
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
const makeGateTooltip = (title: Modifier, description: Modifier, explanation: Modifier, truthTable: Modifier): ModifierObject => {
    return tooltipContent(title, mods(div(description), div(explanation), div(truthTable)))
}

export const GateFactory = {

    make: <N extends FixedArraySize>(savedData: GateRepr<N> | GateMandatoryParams) => {
        if (Gate1Types.isValue(savedData.type)) {
            const sameSavedDataWithBetterTyping = { ...savedData, type: savedData.type }
            return new Gate1(sameSavedDataWithBetterTyping)
        } else {
            const sameSavedDataWithBetterTyping = { ...savedData, type: savedData.type }
            return new Gate2(sameSavedDataWithBetterTyping)
        }
    },

}