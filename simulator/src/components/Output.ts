import * as t from "io-ts"
import { circle, colorForBoolean, COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_MOUSE_OVER, dist, drawComponentName, drawValueText, drawValueTextCentered, drawWireLineToComponent, GRID_STEP, INPUT_OUTPUT_DIAMETER, triangle, useCompact } from "../drawutils"
import { mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { ArrayFillWith, isDefined, isUndefined, LogicValue, Mode, toLogicValueRepr, typeOrUndefined, Unknown, validate } from "../utils"
import { Component, ComponentBase, ComponentName, ComponentNameRepr, defineParametrizedComponent, groupVertical, Repr, ResolvedParams } from "./Component"
import { ContextMenuItem, ContextMenuItemPlacement, DrawContext, Orientation } from "./Drawable"
import { Node, NodeIn, NodeOut } from "./Node"


export const OutputDef =
    defineParametrizedComponent("out", undefined, true, false, {
        variantName: ({ bits }) => `out-${bits}`,
        button: { imgWidth: 32 },
        repr: {
            bits: typeOrUndefined(t.number),
            name: ComponentNameRepr,
        },
        valueDefaults: {},
        paramDefaults: {
            bits: 1,
        },
        validateParams: ({ bits }, defaults) => {
            const numBits = validate(bits, [1, 2, 3, 4, 7, 8, 16, 32], defaults.bits, "Output bits")
            return { numBits }
        },
        size: ({ numBits }) => {
            if (numBits === 1) {
                const d = INPUT_OUTPUT_DIAMETER / GRID_STEP
                return { gridWidth: d, gridHeight: d }
            }
            return {
                gridWidth: 2,
                gridHeight: useCompact(numBits) ? numBits : 2 * numBits,
            }
        },
        makeNodes: ({ numBits }) => ({
            ins: {
                In: groupVertical("w", numBits === 1 ? -3 : -2, 0, numBits),
            },
        }),
        initialValue: (saved, { numBits }) => ArrayFillWith<LogicValue>(false, numBits),
    })

export type OutputRepr = Repr<typeof OutputDef>
export type OutputParams = ResolvedParams<typeof OutputDef>


export class Output extends ComponentBase<OutputRepr> {

    public readonly numBits: number
    private _name: ComponentName = undefined

    public constructor(editor: LogicEditor, params: OutputParams, saved?: OutputRepr) {
        super(editor, OutputDef.with(params), saved)

        this.numBits = params.numBits
        if (isDefined(saved)) {
            this._name = saved.name
        }
    }

    public toJSON() {
        return {
            bits: this.numBits === OutputDef.aults.bits ? undefined : this.numBits,
            ...this.toJSONBase(),
            name: this._name,
        }
    }

    public override isOver(x: number, y: number) {
        if (this.numBits === 1) {
            return this.editor.mode >= Mode.CONNECT && dist(x, y, this.posX, this.posY) < INPUT_OUTPUT_DIAMETER / 2
        }
        return super.isOver(x, y)
    }

    public override makeTooltip() {
        const s = S.Components.Output.tooltip
        return tooltipContent(undefined, mods(s.title.expand({ numBits: 1 })))
    }

    protected doRecalcValue(): LogicValue[] {
        return this.inputValues(this.inputs.In)
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        if (this.numBits === 1) {
            this.doDrawSingle(g, ctx, this.inputs.In[0])
        } else {
            this.doDrawMulti(g, ctx, this.inputs.In)
        }
    }

    private doDrawSingle(g: CanvasRenderingContext2D, ctx: DrawContext, input: NodeIn) {
        drawWireLineToComponent(g, input, this.posX, this.posY)

        if (ctx.isMouseOver) {
            g.strokeStyle = COLOR_MOUSE_OVER
            g.fillStyle = COLOR_MOUSE_OVER
        } else {
            g.strokeStyle = COLOR_COMPONENT_BORDER
            g.fillStyle = COLOR_COMPONENT_BORDER
        }
        g.beginPath()
        triangle(g,
            this.posX - INPUT_OUTPUT_DIAMETER / 2 - 5, this.posY - 5,
            this.posX - INPUT_OUTPUT_DIAMETER / 2 - 5, this.posY + 5,
            this.posX - INPUT_OUTPUT_DIAMETER / 2 - 1, this.posY,
        )
        g.fill()
        g.stroke()

        const valueToShow = this.editor.options.hideOutputColors ? Unknown : input.value
        g.fillStyle = colorForBoolean(valueToShow)
        g.lineWidth = 4
        g.beginPath()
        circle(g, this.posX, this.posY, INPUT_OUTPUT_DIAMETER)
        g.fill()
        g.stroke()

        ctx.inNonTransformedFrame(ctx => {
            if (isDefined(this._name)) {
                drawComponentName(g, ctx, this._name, toLogicValueRepr(valueToShow), this, true)
            }
            drawValueTextCentered(g, valueToShow, this)
        })
    }

    private doDrawMulti(g: CanvasRenderingContext2D, ctx: DrawContext, inputs: NodeIn[]) {
        g.fillStyle = COLOR_BACKGROUND
        const drawMouseOver = ctx.isMouseOver && this.editor.mode !== Mode.STATIC
        g.strokeStyle = drawMouseOver ? COLOR_MOUSE_OVER : COLOR_COMPONENT_BORDER
        g.lineWidth = 4

        const width = this.unrotatedWidth
        const height = this.unrotatedHeight
        const left = this.posX - width / 2
        const top = this.posY - height / 2
        // const bottom = this.posY + height

        g.beginPath()
        g.rect(left, top, width, height)
        g.fill()
        g.stroke()

        const displayValues = this.editor.options.hideOutputColors ? ArrayFillWith(Unknown, this.numBits) : this.value

        g.lineWidth = 1
        const cellHeight = useCompact(this.numBits) ? GRID_STEP : 2 * GRID_STEP
        for (let i = 0; i < this.numBits; i++) {
            const y = top + i * cellHeight
            g.fillStyle = colorForBoolean(displayValues[i])
            g.beginPath()
            g.rect(left, y, width, cellHeight)
            g.fill()
            g.stroke()
        }

        for (const input of inputs) {
            drawWireLineToComponent(g, input, left - 2, input.posYInParentTransform, true)
        }

        ctx.inNonTransformedFrame(ctx => {
            if (isDefined(this._name)) {
                const valueString = displayValues.map(toLogicValueRepr).join("")
                drawComponentName(g, ctx, this._name, valueString, this, true)
            }

            for (let i = 0; i < this.numBits; i++) {
                const y = top + cellHeight / 2 + i * cellHeight
                drawValueText(g, displayValues[i], ...ctx.rotatePoint(this.posX, y), { small: useCompact(this.numBits) })
            }
        })
    }

    protected override autoConnected(newLinks: [Node, Component, Node][]) {
        if (newLinks.length !== 1) {
            return
        }

        const [inNode, comp, outNode] = newLinks[0]
        if (outNode instanceof NodeOut) {
            let group
            if (isDefined(group = outNode.group) && group.nodes.length === 1) {
                this.doSetName(group.name)
            } else if (isUndefined(this._name) && isDefined(outNode.name)) {
                this.doSetName(outNode.name)
            }
        }

        if (outNode.orient !== "w") {
            return
        }
        switch (Orientation.add(comp.orient, inNode.orient)) {
            case "e":
                // nothing to do
                return
            case "w":
                this.doSetOrient("w")
                this.setPosition(this.posX - GRID_STEP * 6, this.posY)
                return
            case "s":
                this.doSetOrient("s")
                this.setPosition(this.posX - GRID_STEP * 3, this.posY + GRID_STEP * 3)
                return
            case "n":
                this.doSetOrient("n")
                this.setPosition(this.posX - GRID_STEP * 3, this.posY - GRID_STEP * 3)
                return
        }
    }

    private doSetName(name: ComponentName) {
        this._name = name
        this.setNeedsRedraw("name changed")
    }

    protected override makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {

        return [
            ["mid", this.makeSetNameContextMenuItem(this._name, this.doSetName.bind(this))],
        ]
    }

    public override keyDown(e: KeyboardEvent): void {
        if (e.key === "Enter") {
            this.runSetNameDialog(this._name, this.doSetName.bind(this))
        }
    }
}
OutputDef.impl = Output