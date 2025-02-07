import * as t from "io-ts"
import { COLOR_COMPONENT_BORDER } from "../drawutils"
import { br, emptyMod, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { LogicValue, typeOrUndefined } from "../utils"
import { ComponentNameRepr, ComponentState, Repr, defineComponent } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuData, MenuItems } from "./Drawable"
import { InputBase, InputDef } from "./Input"

export const ClockDef =
    defineComponent("clock", {
        idPrefix: "clock",
        button: { imgWidth: 50 },
        repr: {
            name: ComponentNameRepr,
            period: t.number,
            dutycycle: typeOrUndefined(t.number),
            phase: typeOrUndefined(t.number),
            showLabel: typeOrUndefined(t.boolean),
        },
        valueDefaults: {
            period: 2000,
            dutycycle: 50,
            phase: 0,
            showLabel: true,
        },
        size: { gridWidth: 2, gridHeight: 2 }, // "overridden" by superclass
        makeNodes: () => ({
            outs: {
                // we don't strictly need a group, but we use it
                // for compatibility with InputBase
                Out: [[3, 0, "e"]],
            },
        }),
        initialValue: () => [false as LogicValue],
    })

export type ClockRepr = Repr<typeof ClockDef>

export class Clock extends InputBase<ClockRepr> {

    public get numBits() { return 1 }
    private _period: number
    private _dutycycle: number
    private _phase: number
    private _showLabel: boolean

    public constructor(parent: DrawableParent, saved?: ClockRepr) {
        // 'undefined as any' is a hack to get around the fact that InputBase is parametrized
        // and Clock is not. As long as we don't try to change nonexitent params, it's fine.
        super(parent, [ClockDef, undefined as any], saved)

        this._period = saved?.period ?? ClockDef.aults.period
        this._dutycycle = (saved?.dutycycle !== undefined) ? saved.dutycycle % 100 : ClockDef.aults.dutycycle
        this._phase = (saved?.phase !== undefined) ? saved.phase % this._period : ClockDef.aults.phase
        this._showLabel = saved?.showLabel ?? ClockDef.aults.showLabel

        // sets the value and schedules the next tick
        this.tickCallback()
    }

    public toJSON() {
        return {
            ...this.toJSONBase(),
            period: this._period,
            dutycycle: (this._dutycycle === ClockDef.aults.dutycycle) ? undefined : this._dutycycle,
            phase: (this._phase === ClockDef.aults.phase) ? undefined : this._phase,
            showLabel: (this._showLabel === ClockDef.aults.showLabel) ? undefined : this._showLabel,
        }
    }

    protected override toStringDetails(): string {
        return `period=${this._period} duty=${this._dutycycle} phase=${this._phase}`
    }

    public override makeTooltip() {
        const s = S.Components.Clock.tooltip
        return tooltipContent(s.title,
            mods(s.period[0] + this._period + s.period[1], br,
                s.dutycycle[0] + this._dutycycle + s.dutycycle[1],
                this._phase === 0
                    ? emptyMod
                    : mods(br, s.phase[0] + this._phase + s.phase[1])
            ))
    }

    private currentClockValue(logicalTime: number): [boolean, number] {
        const myTime = logicalTime - this._phase
        let timeOverPeriod = myTime % this._period
        if (timeOverPeriod < 0) {
            timeOverPeriod += this._period
        }
        const onDuration = this._period * this._dutycycle / 100
        const offDuration = this._period - onDuration
        let value: boolean
        let timeOverLastTick: number
        if (timeOverPeriod < onDuration) {
            value = true
            timeOverLastTick = timeOverPeriod
        } else {
            value = false
            timeOverLastTick = timeOverPeriod - onDuration
        }
        const lastTick = logicalTime - timeOverLastTick
        const nextTick = lastTick + (value ? onDuration : offDuration)

        return [value, nextTick]
    }

    private tickCallback() {
        const timeline = this.parent.editor.timeline
        const [value, nextTick] = this.currentClockValue(timeline.logicalTime())
        this.doSetValue([value])
        if (this.state !== ComponentState.DEAD) {
            const s = S.Components.Clock.timeline
            const desc = value ? s.NextFallingEdge : s.NextRisingEdge
            timeline.scheduleAt(nextTick, () => {
                this.tickCallback()
            }, desc, true)
        }
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        super.doDraw(g, ctx)

        if (!this._showLabel) {
            return
        }

        ctx.inNonTransformedFrame(() => {
            const w = 40
            const h = 10
            const offsetY = this.orient === "s" ? -36 : 26
            g.strokeStyle = COLOR_COMPONENT_BORDER
            g.lineWidth = 1
            const left = this.posX - w / 2
            const mid1 = left + w * this._phase / this._period
            const mid2 = mid1 + w * this._dutycycle / 100
            const right = this.posX + w / 2
            const bottom = this.posY + offsetY + h / 2
            const top = this.posY + offsetY - h / 2
            g.beginPath()
            g.moveTo(left, bottom)
            g.lineTo(mid1, bottom)
            g.lineTo(mid1, top)
            g.lineTo(mid2, top)
            g.lineTo(mid2, bottom)
            g.lineTo(right, bottom)
            g.stroke()

            g.fillStyle = COLOR_COMPONENT_BORDER
            g.textAlign = "center"
            g.font = "10px sans-serif"
            const periodStr = this._period >= 1000
                ? (this._period / 1000) + " s"
                : this._period + " ms"
            g.fillText(periodStr, this.posX, bottom + 8)
        })
    }

    private doSetPeriod(period: number) {
        this._period = period
        this.requestRedraw({ why: "period changed", invalidateTests: true })
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.Clock.contextMenu

        const periodPresets: [number, string][] = [
            [100, "100 ms (10 Hz)"],
            [250, "250 ms (4 Hz)"],
            [500, "500 ms (2 Hz)"],
            [1000, "1 s (1 Hz)"],
            [2000, "2 s (0.5 Hz)"],
            [4000, "4 s (0.25 Hz)"],
            [8000, "8 s (0.125 Hz)"],
            [16000, "16 s (0.0625 Hz)"],
        ]

        let matchesSomePreset = false
        const makeItemSetPeriod = (data: [number, string]) => {
            const [period, desc] = data
            const isCurrent = this._period === period
            matchesSomePreset = matchesSomePreset || isCurrent
            const icon = isCurrent ? "check" : "none"
            return MenuData.item(icon, desc, () => this.doSetPeriod(period))
        }

        const presetPeriodItems = periodPresets.map(makeItemSetPeriod)
        const customPeriodItem = MenuData.item(matchesSomePreset ? "none" : "check", s.CustomPeriod + (matchesSomePreset ? "…" : " (" + this._period + " ms, " + Math.round(1000000 / this._period) / 1000 + " Hz)…"), () => this.runSetPeriodDialog())

        const replaceWithInputItem =
            MenuData.item("replace", s.ReplaceWithInput, () => {
                this.replaceWithComponent(InputDef.make(this.parent, { bits: 1 }))
            })

        return [
            ...super.makeComponentSpecificContextMenuItems(),
            ["mid", MenuData.sep()],
            ["mid", MenuData.submenu("timer", s.Period, [...presetPeriodItems, MenuData.sep(), customPeriodItem])],
            ["mid", MenuData.sep()],
            ["mid", replaceWithInputItem],
        ]
    }

    private runSetPeriodDialog() {
        const s = S.Components.Clock.contextMenu
        const newPeriodStr = window.prompt(s.SetPeriodMillis, String(this._period))
        if (newPeriodStr === null || newPeriodStr.length === 0) {
            return
        }

        const newPeriod = parseInt(newPeriodStr)
        if (isNaN(newPeriod) || newPeriod < 1) {
            window.alert(s.InvalidPeriod)
            this.runSetPeriodDialog()
            return
        }

        this.doSetPeriod(newPeriod)
    }


}
ClockDef.impl = Clock
