import { displayValuesFromArray } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { FixedArray, FixedArrayFillWith, LogicValue, Unknown, isUnknown } from "../utils"
import { ComponentBase, Repr, defineComponent, group } from "./Component"
import { DrawableParent, MenuItems } from "./Drawable"

export const Decoder7SegDef =
    defineComponent("dec-7seg", true, true, {
        idPrefix: "dec",
        button: { imgWidth: 50 },
        valueDefaults: {},
        size: () => ({ gridWidth: 4, gridHeight: 8 }),
        makeNodes: () => ({
            ins: {
                In: group("w", [
                    [-3, -3, "A"],
                    [-3, -1, "B"],
                    [-3, +1, "C"],
                    [-3, +3, "D"],
                ]),
            },
            outs: {
                Out: group("e", [
                    [+3, -3, "a"],
                    [+3, -2, "b"],
                    [+3, -1, "c"],
                    [+3, 0, "d"],
                    [+3, +1, "e"],
                    [+3, +2, "f"],
                    [+3, +3, "g"],
                ]),
            },
        }),
        initialValue: () => FixedArrayFillWith(false as LogicValue, 7),
    })

type Decoder7SegRepr = Repr<typeof Decoder7SegDef>

export class Decoder7Seg extends ComponentBase<Decoder7SegRepr> {

    public constructor(parent: DrawableParent, saved?: Decoder7SegRepr) {
        super(parent, Decoder7SegDef.from(parent), saved)
    }

    public toJSON() {
        return this.toJSONBase()
    }

    public override makeTooltip() {
        return tooltipContent(undefined, mods(
            div(S.Components.Decoder7Seg.tooltip) // TODO better info
        ))
    }

    protected doRecalcValue(): FixedArray<LogicValue, 7> {
        const input = this.inputValues(this.inputs.In)
        const [__, value] = displayValuesFromArray(input, false)

        let output
        if (isUnknown(value)) {
            output = FixedArrayFillWith(Unknown, 7)
        } else {
            output = ((): FixedArray<LogicValue, 7> => {
                switch (value) {
                    case 0: return [true, true, true, true, true, true, false]
                    case 1: return [false, true, true, false, false, false, false]
                    case 2: return [true, true, false, true, true, false, true]
                    case 3: return [true, true, true, true, false, false, true]
                    case 4: return [false, true, true, false, false, true, true]
                    case 5: return [true, false, true, true, false, true, true]
                    case 6: return [true, false, true, true, true, true, true]
                    case 7: return [true, true, true, false, false, false, false]
                    case 8: return [true, true, true, true, true, true, true]
                    case 9: return [true, true, true, true, false, true, true]
                    case 10: return [true, true, true, false, true, true, true]
                    case 11: return [false, false, true, true, true, true, true]
                    case 12: return [true, false, false, true, true, true, false]
                    case 13: return [false, true, true, true, true, false, true]
                    case 14: return [true, false, false, true, true, true, true]
                    case 15: return [true, false, false, false, true, true, true]
                    default: return FixedArrayFillWith(Unknown, 7)
                }
            })()
        }

        return output
    }

    protected override propagateValue(newValue: FixedArray<LogicValue, 7>) {
        this.outputValues(this.outputs.Out, newValue)
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        return this.makeForceOutputsContextMenuItem()
    }

}
Decoder7SegDef.impl = Decoder7Seg
