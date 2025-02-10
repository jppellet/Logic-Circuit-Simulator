import * as t from "io-ts"
import JSON5 from "json5"
import { COLOR_COMPONENT_BORDER, COLOR_COMPONENT_INNER_LABELS, TextVAlign, displayValuesFromArray, fillTextVAlign } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { EdgeTrigger, LogicValue, RichStringEnum, Unknown, isUnknown, repeatString, toLogicValueRepr, typeOrUndefined } from "../utils"
import { ComponentBase, Repr, defineComponent } from "./Component"
import { DisplayAscii } from "./DisplayAscii"
import { DrawContext, DrawableParent, GraphicsRendering, MenuData, MenuItems } from "./Drawable"
import { Flipflop, makeTriggerItems } from "./FlipflopOrLatch"


export const ShiftDisplayDecoders_ = {
    "raw": { decodeWidth: 1, maxDisplayWidth: 16, decode: (v: number) => v.toString() },
    "octal": { decodeWidth: 3, maxDisplayWidth: 16, decode: (v: number) => v.toString() },
    "hex": { decodeWidth: 4, maxDisplayWidth: 16, decode: (v: number) => v.toString(16).toUpperCase() },
    "ascii": { decodeWidth: 7, maxDisplayWidth: 12, decode: (v: number) => DisplayAscii.numberToAscii(v) },
    "ascii8": { decodeWidth: 8, maxDisplayWidth: 12, decode: (v: number) => DisplayAscii.numberToAscii(v & 0x7F) },
    "uint4": { decodeWidth: 4, maxDisplayWidth: 8, decode: (v: number) => v.toString() },
    "int4": { decodeWidth: 4, maxDisplayWidth: 8, decode: (v: number) => (v > 7 ? v - 16 : v).toString() },
    "uint8": { decodeWidth: 8, maxDisplayWidth: 4, decode: (v: number) => v.toString() },
    "int8": { decodeWidth: 8, maxDisplayWidth: 4, decode: (v: number) => (v > 127 ? v - 256 : v).toString() },
    "uint16": { decodeWidth: 16, maxDisplayWidth: 1, decode: (v: number) => v.toString() },
    "int16": { decodeWidth: 16, maxDisplayWidth: 1, decode: (v: number) => (v > 32767 ? v - 65536 : v).toString() },
} as const

type ShiftDisplayDecoderProps = {
    decodeWidth: number,
    maxDisplayWidth: number,
    decode: (n: number) => string,
}

export const ShiftDisplayDecoders =
    RichStringEnum.withProps<ShiftDisplayDecoderProps>()(ShiftDisplayDecoders_)

export type ShiftBufferDecoder = keyof typeof ShiftDisplayDecoders_


export const ShiftDisplayDef =
    defineComponent("shift-display", {
        idPrefix: "shiftdisp",
        button: { imgWidth: 50 },
        repr: {
            state: typeOrUndefined(t.string),
            decodeAs: typeOrUndefined(t.keyof(ShiftDisplayDecoders_)),
            groupEvery: typeOrUndefined(t.number),
            maxItems: typeOrUndefined(t.number),
            trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
        },
        valueDefaults: {
            decodeAs: "raw" as ShiftBufferDecoder,
            trigger: EdgeTrigger.rising,
        },
        size: { gridWidth: 25, gridHeight: 5 },
        makeNodes: () => {
            const s = S.Components.Generic
            return {
                ins: {
                    Clock: [-14, +1, "w", s.InputClockDesc, { isClock: true }],
                    Clr: [-10, +3, "s", s.InputClearDesc, { prefersSpike: true }],
                    D: [-14, -1, "w", s.InputDataDesc],
                },
            }
        },
        initialValue: saved => {
            if (saved === undefined || saved.state === undefined) {
                return { incoming: [], decoded: [] }
            }
            const incoming: LogicValue[] = []
            for (let i = 0; i < saved.state.length; i++) {
                const c = saved.state.charAt(i)
                if (c === '1') {
                    incoming.push(true)
                } else if (c === '0') {
                    incoming.push(false)
                } else {
                    incoming.push(Unknown)
                }
            }
            return { incoming, decoded: [] }
        },
    })

type ShiftDisplayRepr = Repr<typeof ShiftDisplayDef>

type ShiftDisplayState = {
    incoming: LogicValue[]
    decoded: [string, LogicValue[]][]
}

export class ShiftDisplay extends ComponentBase<ShiftDisplayRepr, ShiftDisplayState> {

    protected _decodeAs: ShiftBufferDecoder
    protected _groupEvery: number | undefined
    protected _maxItems: number | undefined
    protected _trigger: EdgeTrigger
    protected _lastClock: LogicValue = Unknown

    public constructor(parent: DrawableParent, saved?: ShiftDisplayRepr) {
        super(parent, ShiftDisplayDef, saved)

        this._decodeAs = saved?.decodeAs ?? ShiftDisplayDef.aults.decodeAs
        this._groupEvery = saved?.groupEvery ?? undefined
        this._maxItems = saved?.maxItems ?? undefined
        this._trigger = saved?.trigger ?? ShiftDisplayDef.aults.trigger

        this.redecodeAll()
    }

    public toJSON() {
        const stateArray = allBitsOf(this.value).map(b => toLogicValueRepr(b))
        return {
            ...this.toJSONBase(),
            state: stateArray.length === 0 ? undefined : stateArray.join(""),
            decodeAs: (this._decodeAs !== ShiftDisplayDef.aults.decodeAs) ? this._decodeAs : undefined,
            groupEvery: this._groupEvery,
            maxItems: this._maxItems,
            trigger: (this._trigger !== ShiftDisplayDef.aults.trigger) ? this._trigger : undefined,
        }
    }

    public get trigger() {
        return this._trigger
    }

    public override makeTooltip() {
        return tooltipContent(S.Components.ShiftDisplay.tooltip, mods(
            div(JSON5.stringify(this.value)) // TODO more info
        ))
    }

    protected doRecalcValue(): ShiftDisplayState {
        if (this.inputs.Clr.value === true) {
            return { incoming: [], decoded: [] }
        }
        const prevClock = this._lastClock
        const clock = this._lastClock = this.inputs.Clock.value
        const oldValue = this.value

        if (Flipflop.isClockTrigger(this._trigger, prevClock, clock)) {
            const newBit = this.inputs.D.value
            const decoder = ShiftDisplayDecoders.props[this._decodeAs]
            const maxItems = this._maxItems ?? decoder.maxDisplayWidth
            return ShiftDisplay.valueByAddingNewBit(newBit, oldValue, decoder, maxItems)
        }
        return oldValue
    }

    private static valueByAddingNewBit(newBit: LogicValue, oldValue: ShiftDisplayState, decoder: ShiftDisplayDecoderProps, maxItems: number): ShiftDisplayState {
        const newIncoming = [newBit, ...oldValue.incoming]
        if (newIncoming.length < decoder.decodeWidth) {
            return { incoming: newIncoming, decoded: oldValue.decoded }
        }
        const valAsInt = displayValuesFromArray(newIncoming, true)[1]
        const decoded = isUnknown(valAsInt) ? Unknown : decoder.decode(valAsInt)
        const newDecoded: ShiftDisplayState["decoded"] = [[decoded, newIncoming], ...oldValue.decoded]
        if (newDecoded.length > maxItems) {
            newDecoded.splice(maxItems, newDecoded.length - maxItems)
        }
        return { incoming: [], decoded: newDecoded }
    }


    protected doSetTrigger(trigger: EdgeTrigger) {
        this._trigger = trigger
        this.requestRedraw({ why: "trigger changed", invalidateTests: true })
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, {
            drawInside: () => {
                const drawContents = () => {
                    const text = this.makeRepresentationString()
                    let toDraw
                    if (text === undefined) {
                        g.fillStyle = COLOR_COMPONENT_INNER_LABELS
                        g.font = "15px sans-serif"
                        toDraw = S.Components.ShiftDisplay.EmptyCaption
                    } else {
                        g.fillStyle = COLOR_COMPONENT_BORDER
                        g.font = "bold 16px sans-serif"
                        toDraw = text
                    }
                    fillTextVAlign(g, TextVAlign.middle, toDraw, this.posX, this.posY)
                }

                g.textAlign = "center"
                if (this.orient === "w") {
                    // avoid text upside down
                    ctx.inNonTransformedFrame(drawContents)
                } else {
                    drawContents()
                }
            },
        })
    }

    private makeRepresentationString() {
        const { incoming, decoded } = this.value
        if (incoming.length === 0 && decoded.length === 0) {
            return undefined
        }

        const decodeAs = this._decodeAs
        const decoder = ShiftDisplayDecoders.props[decodeAs]
        const toPad = decoder.decodeWidth - incoming.length
        const padding = repeatString("_ ", toPad)
        const undecodedStr = padding + displayValuesFromArray(incoming, true)[0]

        const sep = decodeAs.includes("int") ? " " : ""

        let fullDecodedStr
        if (decoded.length === 0) {
            fullDecodedStr = "…"
        } else {
            const groupEvery = this._groupEvery ?? 0
            if (groupEvery < 2) {
                fullDecodedStr = decoded.map(v => v[0]).join(sep)
            } else {
                const offset = groupEvery - (decoded.length % groupEvery)
                const decodedParts: string[] = []
                for (let i = 0; i < decoded.length; i++) {
                    if (i !== 0) {
                        if ((i + offset) % groupEvery === 0) {
                            decodedParts.push(sep + " ")
                        } else {
                            decodedParts.push(sep)
                        }
                    }
                    decodedParts.push(decoded[i][0])
                }
                fullDecodedStr = decodedParts.join("")
            }
            if (decodeAs === "hex") {
                fullDecodedStr = "0x" + (groupEvery < 2 ? "" : " ") + fullDecodedStr
            } else if (decodeAs === "octal") {
                fullDecodedStr = "0o" + (groupEvery < 2 ? "" : " ") + fullDecodedStr
            }
        }

        if (decodeAs === "raw") {
            return fullDecodedStr
        }
        return undecodedStr + " ➟ " + fullDecodedStr
    }

    private redecodeAll() {
        const decoder = ShiftDisplayDecoders.props[this._decodeAs]
        const allBits = allBitsOf(this.value)
        const maxItems = this._maxItems ?? decoder.maxDisplayWidth
        let value: ShiftDisplayState = { incoming: [], decoded: [] }
        for (const newBit of allBits.reverse()) {
            value = ShiftDisplay.valueByAddingNewBit(newBit, value, decoder, maxItems)
        }
        this.doSetValue(value)
    }

    private doSetDecodeAs(decodeAs: ShiftBufferDecoder) {
        this._decodeAs = decodeAs
        this.redecodeAll() // will call requestRedraw
    }

    private doSetGroupEvery(groupEvery: number | undefined) {
        this._groupEvery = groupEvery
        this.requestRedraw({ why: "grouping changed" })
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {

        const s = S.Components.ShiftDisplay.contextMenu
        const makeItemDecodeAs = (decoder: ShiftBufferDecoder, desc: string) => {
            const isCurrent = this._decodeAs === decoder
            const icon = isCurrent ? "check" : "none"
            return MenuData.item(icon, desc, () => this.doSetDecodeAs(decoder))
        }

        const makeItemGroupEvery = (groupEvery: number | undefined, desc: string) => {
            const isCurrent = this._groupEvery === groupEvery
            const icon = isCurrent ? "check" : "none"
            return MenuData.item(icon, desc, () => this.doSetGroupEvery(groupEvery))
        }

        return [
            ...makeTriggerItems(this._trigger, this.doSetTrigger.bind(this)),
            ["mid", MenuData.sep()],
            ["mid", MenuData.submenu("eye", s.Decoding, [
                makeItemDecodeAs("raw", s.DecodingNone),
                makeItemDecodeAs("octal", s.DecodingOctal),
                makeItemDecodeAs("hex", s.DecodingHex),
                makeItemDecodeAs("ascii", s.DecodingAscii7),
                makeItemDecodeAs("ascii8", s.DecodingAscii8),
                makeItemDecodeAs("uint4", s.DecodingUint4),
                makeItemDecodeAs("int4", s.DecodingInt4),
                makeItemDecodeAs("uint8", s.DecodingUint8),
                makeItemDecodeAs("int8", s.DecodingInt8),
                makeItemDecodeAs("uint16", s.DecodingUint16),
                makeItemDecodeAs("int16", s.DecodingInt16),
                MenuData.sep(),
                MenuData.text(s.DecodingChangeWarning),
            ])],
            ["mid", MenuData.submenu("regroup", s.Grouping, [
                makeItemGroupEvery(undefined, s.GroupingNone),
                MenuData.sep(),
                makeItemGroupEvery(2, s.GroupBy.expand({ n: 2 })),
                makeItemGroupEvery(3, s.GroupBy.expand({ n: 3 })),
                makeItemGroupEvery(4, s.GroupBy.expand({ n: 4 })),
                makeItemGroupEvery(7, s.GroupBy.expand({ n: 7 })),
                makeItemGroupEvery(8, s.GroupBy.expand({ n: 8 })),
                makeItemGroupEvery(16, s.GroupBy.expand({ n: 16 })),
            ])],
        ]
    }
}
ShiftDisplayDef.impl = ShiftDisplay

function allBitsOf({ incoming, decoded }: ShiftDisplayState): LogicValue[] {
    const allBits = [...incoming]
    for (const [__stringRep, bits] of decoded) {
        allBits.push(...bits)
    }
    return allBits
}
