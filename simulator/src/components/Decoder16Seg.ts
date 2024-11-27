import { COLOR_COMPONENT_INNER_LABELS, displayValuesFromArray, drawLabel } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { FixedArray, FixedArrayFillWith, LogicValue, Unknown, isUnknown } from "../utils"
import { ComponentBase, Repr, defineComponent, group } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuItems } from "./Drawable"

export const Decoder16SegDef =
    defineComponent("dec-16seg", {
        idPrefix: "dec",
        button: { imgWidth: 50 },
        valueDefaults: {},
        size: { gridWidth: 4, gridHeight: 10 },
        makeNodes: () => ({
            ins: {
                In: group("w", [
                    [-3, -3],
                    [-3, -2],
                    [-3, -1],
                    [-3, 0],
                    [-3, +1],
                    [-3, +2],
                    [-3, +3],
                ]),
            },
            outs: {
                Out: group("e", [
                    [+4, -4, "a1"],
                    [+3, -3.5, "a2"],
                    [+4, -3, "b"],
                    [+3, -2.5, "c"],
                    [+4, -2, "d2"],
                    [+3, -1.5, "d1"],
                    [+4, -1, "e"],
                    [+3, -0.5, "f"],
                    [+4, 0, "g1"],
                    [+3, 0.5, "g2"],
                    [+4, +1, "h"],
                    [+3, +1.5, "i"],
                    [+4, +2, "j"],
                    [+3, +2.5, "k"],
                    [+4, +3, "l"],
                    [+3, +3.5, "m"],
                    [+4, +4, "p"],
                ]),
            },
        }),
        initialValue: () => FixedArrayFillWith(false as LogicValue, 17),
    })


type Decoder16SegRepr = Repr<typeof Decoder16SegDef>

export class Decoder16Seg extends ComponentBase<Decoder16SegRepr> {

    public constructor(parent: DrawableParent, saved?: Decoder16SegRepr) {
        super(parent, Decoder16SegDef, saved)
    }

    public toJSON() {
        return this.toJSONBase()
    }

    public override makeTooltip() {
        return tooltipContent(undefined, mods(
            div(S.Components.Decoder16Seg.tooltip) // TODO better tooltip
        ))
    }

    protected doRecalcValue(): FixedArray<LogicValue, 17> {
        const input = this.inputValues(this.inputs.In)
        const [__, value] = displayValuesFromArray(input, false)

        let output: FixedArray<LogicValue, 17>
        if (isUnknown(value)) {
            output = FixedArrayFillWith(Unknown, 17)
        } else if (value < 32) {
            // control chars
            output = FixedArrayFillWith(false, 17)
        } else {
            const line = DECODER_MAPPING[value - 32]
            output = FixedArrayFillWith(false, 17)
            for (let i = 0; i < line.length; i++) {
                output[i] = line.charAt(i) === "1"
            }
        }

        return output
    }

    protected override propagateValue(newValue: LogicValue[]) {
        this.outputValues(this.outputs.Out, newValue)
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, {
            skipLabels: true,
            drawInside: bounds => {
                this.drawGroupBox(g, this.inputs.In.group, bounds)
            },
            drawLabels: (ctx, { left, right }) => {
                g.fillStyle = COLOR_COMPONENT_INNER_LABELS
                g.font = "bold 11px sans-serif"

                drawLabel(ctx, this.orient, "C", "w", left, this.inputs.In)

                g.font = "7px sans-serif"
                this.outputs._all.forEach(output => {
                    drawLabel(ctx, this.orient, output.shortName, "e", right, output)
                })
            },
        })
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        return this.makeForceOutputsContextMenuItem()
    }

}
Decoder16SegDef.impl = Decoder16Seg


// Taken and modified from https://github.com/dmadison/LED-Segment-ASCII
const DECODER_MAPPING = [ // starts at space, which is 32
    "00000000000000000", /* (space) */
    "00110000000000001", /* ! */
    "00100000000100000", /* " */
    "00111100110100100", /* # */
    "11011101110100100", /* $ */
    "10011001110111100", /* % */
    "10001110101100010", /* & */
    "00000000000100000", /* ' */
    "00000000000010010", /* ( */
    "00000000001001000", /* ) */
    "00000000111111110", /* * */
    "00000000110100100", /* + */
    "00000000000001000", /* , */
    "00000000110000000", /* - */
    "00000000000000001", /* . */
    "00000000000011000", /* / */
    "11111111000011000", /* 0 */
    "00110000000010000", /* 1 */
    "11101110110000000", /* 2 */
    "11111100010000000", /* 3 */
    "00110001110000000", /* 4 */
    "11001101100000010", /* 5 */
    "11011111110000000", /* 6 */
    "11110000000000000", /* 7 */
    "11111111110000000", /* 8 */
    "11111101110000000", /* 9 */
    "00000000000100100", /* : */
    "00000000000101000", /* ; */
    "00000000100010010", /* < */
    "00001100110000000", /* = */
    "00000000011001000", /* > */
    "11100000010000101", /* ? */
    "11101111010100000", /* @ */
    "11110011110000000", /* A */
    "11111100010100100", /* B */
    "11001111000000000", /* C */
    "11111100000100100", /* D */
    "11001111100000000", /* E */
    "11000011100000000", /* F */
    "11011111010000000", /* G */
    "00110011110000000", /* H */
    "11001100000100100", /* I */
    "00111110000000000", /* J */
    "00000011100010010", /* K */
    "00001111000000000", /* L */
    "00110011001010000", /* M */
    "00110011001000010", /* N */
    "11111111000000000", /* O */
    "11100011110000000", /* P */
    "11111111000000010", /* Q */
    "11100011110000010", /* R */
    "11011101110000000", /* S */
    "11000000000100100", /* T */
    "00111111000000000", /* U */
    "00000011000011000", /* V */
    "00110011000001010", /* W */
    "00000000001011010", /* X */
    "00111101110000000", /* Y */
    "11001100000011000", /* Z */
    "01001000000100100", /* [ */
    "00000000001000010", /* \ */
    "10000100000100100", /* ] */
    "00000000000001010", /* ^ */
    "00001100000000000", /* _ */
    "00000000001000000", /* ` */
    "00001110100000100", /* a */
    "00000111100000100", /* b */
    "00000110100000000", /* c */
    "00000110100100100", /* d */
    "00000110100001000", /* e */
    "10000011100000000", /* f */
    "10000101100100100", /* g */
    "00000011100000100", /* h */
    "00000000000000100", /* i */
    "00000100000100100", /* j */
    "00000000000110110", /* k */
    "00000000000100100", /* l */
    "00010010110000100", /* m */
    "00000010100000100", /* n */
    "00000110100000100", /* o */
    "10000011100100000", /* p */
    "10000001100100100", /* q */
    "00000010100000000", /* r */
    "10000101100000100", /* s */
    "00000111100000000", /* t */
    "00000110000000100", /* u */
    "00000010000001000", /* v */
    "00010010000001010", /* w */
    "00000000001011010", /* x */
    "00000101100100100", /* y */
    "00000100100001000", /* z */
    "01001000100100100", /* { */
    "00000000000100100", /* | */
    "10000100010100100", /* } */
    "00000000110011000", /* ~ */
    "00000000000000000", /* (del) */
]
