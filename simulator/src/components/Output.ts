import * as t from "io-ts"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COMPONENT_OUTLINE_THICKNESS, GRID_STEP, INPUT_OUTPUT_DIAMETER, circle, colorForLogicValue, distSquared, drawComponentName, drawValueText, drawValueTextCentered, drawWireLineToComponent, isTrivialNodeName, triangle, useCompact } from "../drawutils"
import { mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillWith, ComponentTypeOutput, LogicValue, Mode, Orientation, Unknown, isHighImpedance, isUnknown, reprForLogicValues, toLogicValueRepr, typeOrUndefined } from "../utils"
import { Component, ComponentName, ComponentNameRepr, ParametrizedComponentBase, Repr, ResolvedParams, defineParametrizedComponent, groupVertical, paramBool } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuData, MenuItems, PointerOverMode } from "./Drawable"
import { InputDef } from "./Input"
import { Node, NodeIn, NodeOut } from "./Node"


export const OutputDef =
    defineParametrizedComponent(ComponentTypeOutput, true, false, {
        variantName: ({ bits, bulb }) => !bulb ? `out-${bits}` : "bulb",
        idPrefix: "out",
        button: { imgWidth: 32 },
        repr: {
            bits: typeOrUndefined(t.number),
            bulb: typeOrUndefined(t.boolean),
            name: ComponentNameRepr,
        },
        valueDefaults: {},
        params: {
            bits: InputDef.paramDefs.bits,
            bulb: paramBool(),
        },
        validateParams: ({ bits, bulb }) => ({
            numBits: bits,
            showAsBulb: bits === 1 && bulb,
        }),
        size: ({ numBits, showAsBulb }) => {
            if (numBits === 1) {
                if (showAsBulb) {
                    return { gridWidth: 2, gridHeight: 4 }
                } else {
                    const d = INPUT_OUTPUT_DIAMETER / GRID_STEP
                    return { gridWidth: d, gridHeight: d }
                }
            }
            return {
                gridWidth: 2,
                gridHeight: useCompact(numBits) ? numBits : 2 * numBits,
            }
        },
        makeNodes: ({ numBits, showAsBulb }) => ({
            ins: {
                In: groupVertical("w", numBits === 1 ? (showAsBulb ? -2 : -3) : -2, 0, numBits, undefined, { hasTriangle: numBits !== 1, leadLength: !showAsBulb ? undefined : 13 }),
            },
        }),
        initialValue: (saved, { numBits }) => ArrayFillWith<LogicValue>(false, numBits),
    })

export type OutputRepr = Repr<typeof OutputDef>
export type OutputParams = ResolvedParams<typeof OutputDef>


export class Output extends ParametrizedComponentBase<OutputRepr> {

    public readonly numBits: number
    public readonly showAsBulb: boolean
    private _name: ComponentName

    public constructor(parent: DrawableParent, params: OutputParams, saved?: OutputRepr) {
        super(parent, OutputDef.with(params), saved)

        this.numBits = params.numBits
        this.showAsBulb = params.showAsBulb

        this._name = saved?.name ?? undefined
    }

    public toJSON() {
        return {
            ...this.toJSONBase(),
            bits: this.numBits === OutputDef.aults.bits ? undefined : this.numBits,
            bulb: this.showAsBulb === OutputDef.aults.bulb ? undefined : this.showAsBulb,
            name: this._name,
        }
    }

    public override isOver(x: number, y: number) {
        if (this.numBits === 1 && !this.doShowAsBulb) {
            return this.parent.mode >= Mode.CONNECT && distSquared(x, y, this.posX, this.posY) < (INPUT_OUTPUT_DIAMETER / 2) ** 2
        }
        return super.isOver(x, y)
    }

    public get name() {
        return this._name
    }

    public contentRepr<AllowUndefined extends boolean>(undefinedIfTrivial: AllowUndefined) {
        return reprForLogicValues(this.value, undefinedIfTrivial)
    }

    public override makeTooltip() {
        const s = S.Components.Output.tooltip
        return tooltipContent(undefined, mods(s.title.expand({ numBits: this.numBits })))
    }

    protected doRecalcValue(): LogicValue[] {
        return this.inputValues(this.inputs.In)
    }

    private get doShowAsBulb() {
        return this.showAsBulb
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        if (this.numBits === 1) {
            this.doDrawSingle(g, ctx, this.inputs.In[0])
        } else {
            this.doDrawMulti(g, ctx, this.inputs.In)
        }
    }

    private doDrawSingle(g: GraphicsRendering, ctx: DrawContext, input: NodeIn) {
        drawWireLineToComponent(g, input)
        const valueToShow = this.parent.editor.options.hideOutputColors ? Unknown : input.value
        let yOffset = 0

        if (this.doShowAsBulb) {

            yOffset = -7
            const { left, right, top, bottom, width } = this.bounds()
            const oldEnds = g.lineCap

            g.lineCap = "butt"
            g.strokeStyle = ctx.borderColor
            g.fillStyle = ctx.borderColor

            // bottom half circle
            const halfCircleTop = bottom - width / 4
            g.beginPath()
            g.arc(this.posX, halfCircleTop, width / 5, 0, Math.PI)
            g.lineWidth = 2
            g.fill()
            g.stroke()

            // two h lines
            const bodyLeft = left + width / 5
            const bodyRight = right - width / 5
            g.lineCap = "round"
            g.beginPath()
            g.moveTo(bodyLeft, halfCircleTop - 2)
            g.lineTo(bodyRight, halfCircleTop - 2)
            g.moveTo(bodyLeft, halfCircleTop - 5)
            g.lineTo(bodyRight, halfCircleTop - 5)
            g.lineWidth = 2
            g.stroke()

            // top actual bulb shape
            const curveBottom = halfCircleTop - 8
            const cpYMid = this.posY - 4
            const cpYTop = top - 3
            g.beginPath()
            g.moveTo(bodyLeft, curveBottom)
            g.bezierCurveTo(bodyLeft, cpYMid, left, cpYMid, left, cpYMid - 5)
            g.bezierCurveTo(left, cpYTop, right, cpYTop, right, cpYMid - 5)
            g.bezierCurveTo(right, cpYMid, bodyRight, cpYMid, bodyRight, curveBottom)
            g.closePath()
            if (valueToShow === false) {
                g.fillStyle = COLOR_BACKGROUND
            } else {
                g.fillStyle = colorForLogicValue(valueToShow)
            }
            g.fill()
            g.stroke()

            g.lineCap = oldEnds

        } else {
            g.strokeStyle = ctx.borderColor
            g.fillStyle = ctx.borderColor
            g.beginPath()
            triangle(g,
                this.posX - INPUT_OUTPUT_DIAMETER / 2 - 5, this.posY - 5,
                this.posX - INPUT_OUTPUT_DIAMETER / 2 - 5, this.posY + 5,
                this.posX - INPUT_OUTPUT_DIAMETER / 2 - 1, this.posY,
            )
            g.lineWidth = 2
            g.fill()
            g.stroke()

            g.fillStyle = colorForLogicValue(valueToShow)
            g.lineWidth = 4
            g.beginPath()
            circle(g, this.posX, this.posY, INPUT_OUTPUT_DIAMETER)
            g.fill()
            g.stroke()
        }

        ctx.inNonTransformedFrame(ctx => {
            if (this._name !== undefined) {
                drawComponentName(g, ctx, this._name, toLogicValueRepr(valueToShow), this, true)
            }
            if (!this.doShowAsBulb || isUnknown(valueToShow) || isHighImpedance(valueToShow)) {
                drawValueTextCentered(g, valueToShow, { posX: this.posX, posY: this.posY + yOffset })
            }
        })
    }

    private doDrawMulti(g: GraphicsRendering, ctx: DrawContext, inputs: NodeIn[]) {
        const bounds = this.bounds()
        const { left, top, width } = bounds
        const outline = bounds.outline(g)

        // background
        g.fillStyle = COLOR_BACKGROUND
        g.fill(outline)

        // inputs
        for (const input of inputs) {
            drawWireLineToComponent(g, input)
        }

        const displayValues = this.parent.editor.options.hideOutputColors ? ArrayFillWith(Unknown, this.numBits) : this.value

        // cells
        const drawMouseOver = ctx.pointerOver !== PointerOverMode.None && this.parent.mode !== Mode.STATIC
        g.strokeStyle = drawMouseOver ? ctx.borderColor : COLOR_COMPONENT_BORDER
        g.lineWidth = 1
        const cellHeight = useCompact(this.numBits) ? GRID_STEP : 2 * GRID_STEP
        for (let i = 0; i < this.numBits; i++) {
            const y = top + i * cellHeight
            g.fillStyle = colorForLogicValue(displayValues[i])
            g.beginPath()
            g.rect(left, y, width, cellHeight)
            g.fill()
            g.stroke()
        }

        // outline
        g.lineWidth = COMPONENT_OUTLINE_THICKNESS
        g.stroke(outline)

        // labels
        ctx.inNonTransformedFrame(ctx => {
            if (this._name !== undefined) {
                const valueString = displayValues.map(toLogicValueRepr).reverse().join("")
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
            if ((group = outNode.group) !== undefined && group.nodes.length === 1 && !isTrivialNodeName(group.name)) {
                this.doSetName(group.name)
            } else if (this._name === undefined && !isTrivialNodeName(outNode.shortName)) {
                this.doSetName(outNode.shortName)
            }
        }

        if (inNode.orient !== "w") {
            // should never happen, all our inputs are west
            return
        }

        switch (Orientation.add(comp.orient, outNode.orient)) {
            case "e":
                // nothing to do
                return
            case "w":
                this.doSetOrient("w")
                this.setPosition(this.posX - GRID_STEP * 6, this.posY, false)
                return
            case "s":
                this.doSetOrient("s")
                this.setPosition(this.posX - GRID_STEP * 3, this.posY + GRID_STEP * 3, false)
                return
            case "n":
                this.doSetOrient("n")
                this.setPosition(this.posX - GRID_STEP * 3, this.posY - GRID_STEP * 3, false)
                return
        }
    }

    public doSetName(name: ComponentName) {
        this._name = name
        this.requestRedraw({ why: "name changed" })
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.Output.contextMenu

        return [
            ["mid", this.makeSetNameContextMenuItem(this._name, this.doSetName.bind(this))],
            ["mid", MenuData.sep()],
            ...(this.numBits !== 1 ? [] : [
                this.makeChangeBooleanParamsContextMenuItem(s.ParamBulb, this.showAsBulb, "bulb"),
            ]),
            ["mid", MenuData.sep()],
            this.makeChangeParamsContextMenuItem("inputs", S.Components.Generic.contextMenu.ParamNumBits, this.numBits, "bits"),
        ]
    }

    public override keyDown(e: KeyboardEvent): void {
        if (e.key === "Enter" && !e.altKey) {
            this.runSetNameDialog(this._name, this.doSetName.bind(this))
        } else {
            super.keyDown(e)
        }
    }
}
OutputDef.impl = Output
