import * as t from "io-ts"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillWith, EdgeTrigger, LogicValue, Unknown, isUnknown, typeOrUndefined } from "../utils"
import { Repr, ResolvedParams, defineParametrizedComponent, groupVertical } from "./Component"
import { DrawableParent, MenuData } from "./Drawable"
import { Flipflop, makeTriggerItems } from "./FlipflopOrLatch"
import { ROMRAMBase, ROMRAMDef, ROMRAMValue } from "./ROM"


export const RAMDef =
    defineParametrizedComponent("ram", true, true, {
        variantName: ({ bits, lines }) => `ram-${lines}x${bits}`,
        idPrefix: "ram",
        ...ROMRAMDef,
        repr: {
            ...ROMRAMDef.repr,
            trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
        },
        valueDefaults: {
            ...ROMRAMDef.valueDefaults,
            trigger: EdgeTrigger.rising,
        },
        makeNodes: (params, defaults) => {
            const base = ROMRAMDef.makeNodes(params, defaults)
            const { numDataBits, gridHeight } = params
            const bottomOffset = Math.ceil((gridHeight + 1) / 2)
            const clockYOffset = bottomOffset - 2
            const s = S.Components.Generic

            return {
                ins: {
                    Clock: [-7, clockYOffset, "w", s.InputClockDesc, { isClock: true }],
                    WE: [-2, bottomOffset, "s", s.InputWriteEnableDesc],
                    Clr: [+2, bottomOffset, "s", s.InputClearDesc, { prefersSpike: true }],
                    D: groupVertical("w", -7, 0, numDataBits),
                    Addr: base.ins.Addr,
                },
                outs: base.outs,
            }
        },
    })


export type RAMRepr = Repr<typeof RAMDef>
export type RAMParams = ResolvedParams<typeof RAMDef>


export class RAM extends ROMRAMBase<RAMRepr> {

    private _trigger: EdgeTrigger = RAMDef.aults.trigger
    private _lastClock: LogicValue = Unknown

    public constructor(parent: DrawableParent, params: RAMParams, saved?: RAMRepr) {
        super(parent, RAMDef, params, saved)

        this._trigger = saved?.trigger ?? RAMDef.aults.trigger
    }

    public toJSON() {
        return {
            ...super.toJSONBase(),
            trigger: (this._trigger !== RAMDef.aults.trigger) ? this._trigger : undefined,
        }
    }

    protected get moduleName() {
        return "RAM"
    }

    public get trigger() {
        return this._trigger
    }

    protected doSetTrigger(trigger: EdgeTrigger) {
        this._trigger = trigger
        this.requestRedraw({ why: "trigger changed", invalidateTests: true })
    }

    protected doRecalcValue(): ROMRAMValue {
        const clear = this.inputs.Clr.value
        const numWords = this.numWords
        if (clear === true) {
            // clear is true, preset is false, set output to 0
            return RAM.valueFilledWith(false, numWords, this.numDataBits)
        }

        // first, determine output
        const addr = this.currentAddress()

        const prevClock = this._lastClock
        const clock = this._lastClock = this.inputs.Clock.value

        // handle normal operation
        const oldState = this.value
        const we = this.inputs.WE.value
        if (we !== true || !Flipflop.isClockTrigger(this.trigger, prevClock, clock)) {
            // nothing to write, just update output
            const out = isUnknown(addr) ? ArrayFillWith(Unknown, this.numDataBits) : oldState.mem[addr]
            return { mem: oldState.mem, out }
        }

        // we write
        if (isUnknown(addr)) {
            return RAM.valueFilledWith(Unknown, numWords, this.numDataBits)
        }

        // build new state
        const newData = this.inputValues(this.inputs.D).map(LogicValue.filterHighZ)
        const newState: LogicValue[][] = new Array(numWords)
        for (let i = 0; i < numWords; i++) {
            if (i === addr) {
                newState[i] = newData
            } else {
                newState[i] = oldState.mem[i]
            }
        }
        return { mem: newState, out: newData }
    }

    public override makeTooltip() {
        const s = S.Components.RAM.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc.expand({ numWords: this.numWords, numDataBits: this.numDataBits }))
            // TODO more info
        ))
    }

    protected override() {
        return [
            ...makeTriggerItems(this._trigger, this.doSetTrigger.bind(this)),

            ["mid", MenuData.sep()],
        ]
    }

}
RAMDef.impl = RAM
