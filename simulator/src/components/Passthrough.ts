import * as t from "io-ts"
import { COLOR_COMPONENT_BORDER, COLOR_NODE_MOUSE_OVER, COLOR_UNKNOWN, drawWireLineToComponent, GRID_STEP, useCompact } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillWith, LogicValue, Mode, typeOrUndefined } from "../utils"
import { defineParametrizedComponent, groupVertical, param, ParametrizedComponentBase, Repr, ResolvedParams } from "./Component"
import { DrawableParent, DrawContext, GraphicsRendering, MenuData, MenuItems } from "./Drawable"
import { NodeIn, NodeOut } from "./Node"
import { WireStyle } from "./Wire"


export const Slant = {
    none: "none",
    up: "up",
    down: "down",
} as const

export type Slant = keyof typeof Slant


export const PassthroughDef =
    defineParametrizedComponent("pass", true, true, {
        variantName: ({ bits }) => `pass-${bits}`,
        idPrefix: "pass",
        button: { imgWidth: 32 },
        repr: {
            bits: typeOrUndefined(t.number),
            slant: typeOrUndefined(t.keyof(Slant)),
        },
        valueDefaults: {
            slant: Slant.none,
        },
        params: {
            bits: param(1, [1, 2, 3, 4, 8, 16]),
        },
        validateParams: ({ bits }) => ({
            numBits: bits,
        }),
        size: ({ numBits }) => ({
            gridWidth: 2,
            gridHeight: useCompact(numBits) ? numBits : 2 * numBits,
        }),
        makeNodes: ({ numBits }) => ({
            ins: {
                In: groupVertical("w", -1, 0, numBits, undefined, { leadLength: 10 }),
            },
            outs: {
                Out: groupVertical("e", +1, 0, numBits, undefined, { leadLength: 10 }),
            },
        }),
        initialValue: (saved, { numBits }) => ArrayFillWith<LogicValue>(false, numBits),
    })

export type PassthroughRepr = Repr<typeof PassthroughDef>
export type PassthroughParams = ResolvedParams<typeof PassthroughDef>


export class Passthrough extends ParametrizedComponentBase<PassthroughRepr> {

    public readonly numBits: number
    private _slant: Slant
    private _hShift: [number, number]

    public constructor(parent: DrawableParent, params: PassthroughParams, saved?: PassthroughRepr) {
        super(parent, PassthroughDef.with(params), saved)
        this.numBits = params.numBits
        this._hShift = [0, 0] // updated by updateNodeOffsets
        this._slant = saved?.slant ?? PassthroughDef.aults.slant
        this.updateNodeOffsets()
    }

    public toJSON() {
        return {
            ...this.toJSONBase(),
            bits: this.numBits === PassthroughDef.aults.bits ? undefined : this.numBits,
            slant: this._slant === PassthroughDef.aults.slant ? undefined : this._slant,
        }
    }

    public override destroy(): void {
        type SavedNodeProps = WireStyle | undefined
        type EndNodes = [NodeIn, SavedNodeProps][]

        const savedWireEnds: [NodeOut, EndNodes][] = []
        for (let i = 0; i < this.numBits; i++) {
            const nodeOut = this.inputs.In[i].incomingWire?.startNode
            if (nodeOut === undefined || !(nodeOut instanceof NodeOut)) {
                continue
            }
            const nodeIns: EndNodes = []
            for (const wire of this.outputs.Out[i].outgoingWires) {
                const endNode = wire.endNode
                if (endNode !== null) {
                    nodeIns.push([endNode, wire.style])
                }
            }
            if (nodeIns.length > 0) {
                savedWireEnds.push([nodeOut, nodeIns])
            }
        }

        super.destroy()

        if (savedWireEnds.length > 0) {
            const linkMgr = this.parent.linkMgr
            for (const [nodeOut, nodeIns] of savedWireEnds) {
                for (const [nodeIn, style] of nodeIns) {
                    const wire = linkMgr.addWire(nodeOut, nodeIn, false)
                    if (wire === undefined) {
                        console.error("Failed to add wire back")
                        continue
                    }
                    // restore wire properties
                    if (style !== undefined) {
                        wire.doSetStyle(style)
                    }
                }
            }
        }
    }

    public override get alwaysDrawMultiOutNodes() {
        return true
    }

    protected doRecalcValue(): LogicValue[] {
        return this.inputValues(this.inputs.In)
    }

    protected override propagateValue(newValue: LogicValue[]): void {
        this.outputValues(this.outputs.Out, newValue)
    }

    public override isOver(x: number, y: number): boolean {
        if (this._slant === Slant.none) {
            return super.isOver(x, y)
        }

        let yPosWithNoHOffset = 0
        let f = 0
        switch (this._slant) {
            case Slant.up:
                yPosWithNoHOffset = this.inputs.In[0].posY
                f = -1
                break
            case Slant.down:
                yPosWithNoHOffset = this.inputs.In[this.numBits - 1].posY
                f = 1
                break
        }

        const deltaX = (y - yPosWithNoHOffset) * f
        return super.isOver(x + deltaX, y)
    }

    public override makeTooltip() {
        return tooltipContent(undefined, mods(
            div(S.Components.Passthrough.tooltip)
        ))
    }


    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        const width = 3
        const height = this.unrotatedHeight
        const top = this.posY - height / 2
        const bottom = top + height
        const mouseoverMargin = 4
        const [topShift, bottomShift] = this._hShift

        for (const input of this.inputs._all) {
            drawWireLineToComponent(g, input)
        }

        for (const output of this.outputs._all) {
            drawWireLineToComponent(g, output)
        }

        g.beginPath()
        g.moveTo(this.posX + topShift, top)
        g.lineTo(this.posX + bottomShift, bottom)

        if (ctx.isMouseOver) {
            g.lineWidth = width + mouseoverMargin * 2
            g.strokeStyle = COLOR_NODE_MOUSE_OVER
            g.stroke()

            g.strokeStyle = COLOR_COMPONENT_BORDER
        } else {
            g.strokeStyle = COLOR_UNKNOWN
        }

        if (this.parent.mode >= Mode.CONNECT) {
            g.lineWidth = width
            g.stroke()
        }
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        if (this.numBits === 1) {
            return []
        }

        const s = S.Components.Passthrough.contextMenu

        const makeItemSetSlant = (desc: string, slant: Slant) => {
            const isCurrent = this._slant === slant
            const icon = isCurrent ? "check" : "none"
            const action = isCurrent ? () => undefined : () => this.doSetSlant(slant)
            return MenuData.item(icon, desc, action)
        }

        return [
            ["mid", MenuData.submenu("slanted", s.Slant, [
                makeItemSetSlant(s.SlantNone, Slant.none),
                MenuData.sep(),
                makeItemSetSlant(s.SlantRight, Slant.down),
                makeItemSetSlant(s.SlantLeft, Slant.up),
            ])],
            ["mid", MenuData.sep()],
            this.makeChangeParamsContextMenuItem("inputs", S.Components.Generic.contextMenu.ParamNumBits, this.numBits, "bits"),
        ]
    }

    private doSetSlant(slant: Slant) {
        this._slant = slant
        this.updateNodeOffsets()
        this.setNeedsRedraw("slant changed")
    }

    private updateNodeOffsets() {
        const n = this.numBits
        switch (this._slant) {
            case "none":
                for (let i = 0; i < n; i++) {
                    this.inputs.In[i].gridOffsetX = -1
                    this.outputs.Out[i].gridOffsetX = +1
                }
                this._hShift = [0, 0]
                break
            case "down": {
                const f = n > 4 ? 1 : 2
                for (let i = 0; i < n; i++) {
                    const shift = f * (n - 1 - i)
                    this.inputs.In[i].gridOffsetX = -1 + shift
                    this.outputs.Out[i].gridOffsetX = +1 + shift
                }
                this._hShift = [f * (n - 0.5) * GRID_STEP, -f * GRID_STEP / 2]
                break
            }
            case "up": {
                const f = n > 4 ? 1 : 2
                for (let i = 0; i < n; i++) {
                    const shift = f * i
                    this.inputs.In[i].gridOffsetX = -1 + shift
                    this.outputs.Out[i].gridOffsetX = +1 + shift
                }
                this._hShift = [-f * GRID_STEP / 2, f * (n - 0.5) * GRID_STEP]
                break
            }
        }

    }

}
PassthroughDef.impl = Passthrough
