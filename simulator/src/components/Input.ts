import * as t from "io-ts"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, GRID_STEP, INPUT_OUTPUT_DIAMETER, circle, colorForLogicValue, distSquared, drawComponentName, drawValueText, drawValueTextCentered, drawWireLineToComponent, inRect, isTrivialNodeName, triangle, useCompact } from "../drawutils"
import { mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillWith, ComponentTypeInput, HighImpedance, InputOutputValueRepr, InteractionResult, LogicValue, Mode, Unknown, reprForLogicValues, toLogicValueRepr, typeOrUndefined, valuesFromReprForInput } from "../utils"
import { ClockDef, ClockRepr } from "./Clock"
import { Component, ComponentName, ComponentNameRepr, ExtractParamDefs, ExtractParams, InstantiatedComponentDef, NodesIn, NodesOut, ParametrizedComponentBase, Repr, ResolvedParams, SomeParamCompDef, defineParametrizedComponent, groupVertical, param } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuData, MenuItems, Orientation } from "./Drawable"
import { Node, NodeIn, NodeOut } from "./Node"


type InputBaseRepr = InputRepr | ClockRepr

export abstract class InputBase<
    TRepr extends InputBaseRepr,
    TParamDefs extends ExtractParamDefs<TRepr> = ExtractParamDefs<TRepr>,
    TParams extends ExtractParams<TRepr> = ExtractParams<TRepr>
> extends ParametrizedComponentBase<
    TRepr,
    LogicValue[],
    TParamDefs,
    TParams,
    NodesIn<TRepr>,
    NodesOut<TRepr>,
    false, true
> {

    public abstract get numBits(): number
    protected _name: ComponentName

    protected constructor(parent: DrawableParent, SubclassDef: [InstantiatedComponentDef<TRepr, LogicValue[]>, SomeParamCompDef<TParamDefs>], saved?: TRepr) {
        super(parent, SubclassDef, saved)
        this._name = saved?.name ?? undefined
    }

    protected override toJSONBase() {
        return {
            ...super.toJSONBase(),
            name: this._name,
        }
    }

    public override isOver(x: number, y: number) {
        if (this.numBits === 1) {
            return distSquared(x, y, this.posX, this.posY) < (INPUT_OUTPUT_DIAMETER / 2) ** 2
        }
        return inRect(this.posX, this.posY, this.width, this.height, x, y)
    }

    public override get allowsForcedOutputs() {
        return false
    }

    public get name() {
        return this._name
    }

    protected doRecalcValue(): LogicValue[] {
        // this never changes on its own, just upon user interaction
        // or automatically for clocks
        return this.value
    }

    protected override propagateValue(newValue: LogicValue[]) {
        this.outputValues(this.outputs.Out, newValue)
    }

    protected shouldDrawBorder() {
        return true
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        if (this.numBits === 1) {
            this.doDrawSingle(g, ctx, this.outputs.Out[0])
        } else {
            this.doDrawMulti(g, ctx, this.outputs.Out)
        }
    }

    private doDrawSingle(g: GraphicsRendering, ctx: DrawContext, output: NodeOut) {
        drawWireLineToComponent(g, output)

        const displayValue = this.parent.editor.options.hideInputColors ? Unknown : output.value

        const shouldDrawBorder = this.shouldDrawBorder()
        if (shouldDrawBorder) {
            const drawMouseOver = ctx.isMouseOver && this.parent.mode !== Mode.STATIC

            if (drawMouseOver) {
                g.strokeStyle = ctx.borderColor
                g.fillStyle = ctx.borderColor
            } else {
                g.strokeStyle = COLOR_COMPONENT_BORDER
                g.fillStyle = COLOR_COMPONENT_BORDER
            }
            g.lineWidth = 3
            g.beginPath()
            const triangleLeft = this.posX + INPUT_OUTPUT_DIAMETER / 2 - 1
            const triangleRight = this.posX + INPUT_OUTPUT_DIAMETER / 2 + 5
            const triangleVOffset = 6.75
            triangle(g,
                triangleLeft, this.posY + triangleVOffset,
                triangleRight, this.posY,
                triangleLeft, this.posY - triangleVOffset,
            )
            g.lineWidth = 2
            g.fill()
            g.stroke()

            g.fillStyle = colorForLogicValue(displayValue)
            g.lineWidth = 4
            g.beginPath()
            circle(g, this.posX, this.posY, INPUT_OUTPUT_DIAMETER)
            g.fill()
            g.stroke()
        }

        ctx.inNonTransformedFrame(ctx => {
            if (this._name !== undefined) {
                drawComponentName(g, ctx, this._name, toLogicValueRepr(displayValue), this, false)
            }
            const forcedFillStyle = !shouldDrawBorder ? g.fillStyle = COLOR_COMPONENT_BORDER : undefined
            drawValueTextCentered(g, displayValue, this, { fillStyle: forcedFillStyle })
        })
    }

    private doDrawMulti(g: GraphicsRendering, ctx: DrawContext, outputs: NodeOut[]) {
        const bounds = this.bounds()
        const { left, top, width } = bounds
        const outline = bounds.outline(g)

        // background
        g.fillStyle = COLOR_BACKGROUND
        g.fill(outline)

        // outputs
        for (const output of outputs) {
            drawWireLineToComponent(g, output)
        }

        const displayValues = this.parent.editor.options.hideInputColors
            ? ArrayFillWith(Unknown, this.numBits) : this.value

        // cells
        const drawMouseOver = ctx.isMouseOver && this.parent.mode !== Mode.STATIC
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
        g.lineWidth = 3
        g.stroke(outline)

        // labels
        ctx.inNonTransformedFrame(ctx => {
            if (this._name !== undefined) {
                const valueString = displayValues.map(toLogicValueRepr).reverse().join("")
                drawComponentName(g, ctx, this._name, valueString, this, false)
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

        const [outNode, comp, inNode] = newLinks[0]
        if (inNode instanceof NodeIn) {
            if (inNode.prefersSpike) {
                this.doSetIsPushButton(true) // will do nothing for clocks
            }
            if (this._name === undefined && !isTrivialNodeName(inNode.shortName)) {
                this.doSetName(inNode.shortName)
            }
        }

        if (outNode.orient !== "e") {
            // should never happen, all our outputs are east
            return
        }

        switch (Orientation.add(comp.orient, inNode.orient)) {
            case "w":
                // nothing to do
                return
            case "e":
                this.doSetOrient("w")
                this.setPosition(this.posX + GRID_STEP * 6, this.posY, false)
                return
            case "s":
                this.doSetOrient("n")
                this.setPosition(this.posX + GRID_STEP * 3, this.posY + GRID_STEP * 3, false)
                return
            case "n":
                this.doSetOrient("s")
                this.setPosition(this.posX + GRID_STEP * 3, this.posY - GRID_STEP * 3, false)
                return
        }
    }

    public doSetIsPushButton(__isPushButton: boolean): void {
        // overridden in normal Input, not in Clock
    }

    public doSetName(name: ComponentName) {
        this._name = name
        this.setNeedsRedraw("name changed")
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        return [
            ["mid", this.makeSetNameContextMenuItem(this._name, this.doSetName.bind(this))],
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


export const InputDef =
    defineParametrizedComponent(ComponentTypeInput, false, true, {
        variantName: ({ bits }) => `in-${bits}`,
        idPrefix: "in",
        button: { imgWidth: 32 },
        repr: {
            bits: typeOrUndefined(t.number),
            val: typeOrUndefined(InputOutputValueRepr),
            isPushButton: typeOrUndefined(t.boolean),
            isConstant: typeOrUndefined(t.boolean),
            name: ComponentNameRepr,
        },
        valueDefaults: {
            isPushButton: false,
            isConstant: false,
        },
        params: {
            bits: param(1, [1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 24, 32]),
        },
        validateParams: ({ bits }) => ({
            numBits: bits,
        }),
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
            outs: {
                Out: groupVertical("e", numBits === 1 ? 3 : 2, 0, numBits, undefined, { hasTriangle: numBits !== 1 }),
            },
        }),
        initialValue: (saved, { numBits }) => {
            return valuesFromReprForInput(saved?.val, numBits)
        },
    })

export type InputRepr = Repr<typeof InputDef>
export type InputParams = ResolvedParams<typeof InputDef>

export class Input extends InputBase<InputRepr> {

    public readonly numBits: number
    private _isPushButton: boolean
    private _isConstant: boolean

    public constructor(parent: DrawableParent, params: InputParams, saved?: InputRepr) {
        super(parent, InputDef.with(params), saved)

        this.numBits = params.numBits

        this._isPushButton = saved?.isPushButton ?? InputDef.aults.isPushButton
        this._isConstant = saved?.isConstant ?? InputDef.aults.isConstant
    }

    public toJSON() {
        return {
            ...this.toJSONBase(),
            bits: this.numBits === InputDef.aults.bits ? undefined : this.numBits,
            val: this.contentRepr(true),
            isPushButton: (this._isPushButton !== InputDef.aults.isPushButton) ? this._isPushButton : undefined,
            isConstant: (this._isConstant !== InputDef.aults.isConstant) ? this._isConstant : undefined,
        }
    }

    public get isConstant() {
        return this._isConstant
    }

    public contentRepr<AllowUndefined extends boolean>(undefinedIfTrivial: AllowUndefined) {
        return reprForLogicValues(this.value, undefinedIfTrivial)
    }

    public override cursorWhenMouseover(e?: MouseEvent | TouchEvent) {
        const mode = this.parent.mode
        if (mode === Mode.STATIC) {
            // signal we can't switch it here
            return "not-allowed"
        }
        if ((e?.ctrlKey ?? false) && mode >= Mode.CONNECT) {
            return "context-menu"
        }
        if ((e?.altKey ?? false) && mode >= Mode.DESIGN) {
            return "copy"
        }

        if (this._isConstant) {
            if (mode >= Mode.DESIGN && !this.lockPos) {
                // we can still move it
                return "grab"
            } else {
                // no special pointer change, it's constant and static
                return undefined
            }
        }        // we can switch it
        return "pointer"
    }

    public override makeTooltip() {
        const s = S.Components.Input.tooltip
        return tooltipContent(undefined, mods(s.title.expand({ numBits: this.numBits })))
    }

    public get isLinkedToSomeClock(): boolean {
        return this.outputs._all.some(out => out.outgoingWires.some(w => w.endNode.isClock))
    }

    public get isPushButton() {
        return this._isPushButton
    }

    protected override shouldDrawBorder() {
        return !this._isConstant
    }

    public override mouseClicked(e: MouseEvent | TouchEvent) {
        let result
        if ((result = super.mouseClicked(e)).isChange) {
            return result
        }

        if (this.parent.mode === Mode.STATIC
            || this._isPushButton
            || this._isConstant) {
            return InteractionResult.NoChange
        }

        const i = this.clickedBitIndex(e)
        if (i === -1) {
            return InteractionResult.SimpleChange
        }

        const altKey = e.altKey // don't include event in the closure
        const doChange = () => {
            this.doSetValueChangingBit(i, nextValue(this.value[i], this.parent.mode, altKey))
            return true
        }

        doChange()
        return InteractionResult.RepeatableChange(doChange)
    }

    public override mouseDown(e: MouseEvent | TouchEvent) {
        this.trySetPushButtonBit(true, e)
        return super.mouseDown(e)
    }

    public override mouseUp(e: MouseEvent | TouchEvent) {
        const result = super.mouseUp(e)
        this.trySetPushButtonBit(false, e)
        return result
    }

    private clickedBitIndex(e: MouseEvent | TouchEvent): number {
        const h = this.unrotatedHeight
        const y = this.parent.editor.offsetXYForComponent(e, this)[1] - this.posY + h / 2
        const i = Math.floor(y * this.numBits / h)
        if (i >= 0 && i < this.numBits) {
            return i
        }
        return -1
    }

    private trySetPushButtonBit(v: LogicValue, e: MouseEvent | TouchEvent) {
        let i
        if (this.parent.mode !== Mode.STATIC
            && this._isPushButton
            && !this._isConstant
            && this.parent.editor.eventMgr.currentSelectionEmpty()
            && (i = this.clickedBitIndex(e)) !== -1) {
            this.doSetValueChangingBit(i, v)
        }
    }

    private doSetValueChangingBit(i: number, v: LogicValue) {
        const newValues = [...this.value]
        newValues[i] = v
        this.doSetValue(newValues)
    }

    public setValue(values: LogicValue[]) {
        if (values.length !== this.numBits) {
            console.warn(`Expected ${this.numBits} values, got ${values.length} for input ${this.ref}`)
            return
        }
        this.doSetValue(values)
    }

    public override doSetIsPushButton(isPushButton: boolean) {
        this._isPushButton = isPushButton
        if (isPushButton) {
            this.doSetValue(ArrayFillWith(false, this.numBits))
        }
    }

    private doSetIsConstant(isConstant: boolean) {
        this._isConstant = isConstant
        this.setNeedsRedraw("constant changed")
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.Input.contextMenu

        const makeItemBehaveAs = (desc: string, value: boolean) => {
            const isCurrent = this._isPushButton === value
            const icon = isCurrent ? "check" : "none"
            const action = isCurrent ? () => undefined : () => this.doSetIsPushButton(value)
            return MenuData.item(icon, desc, action)
        }

        const newItems: MenuItems = [
            ["mid", makeItemBehaveAs(s.ToggleButton, false)],
            ["mid", makeItemBehaveAs(s.PushButton, true)],
            ["mid", MenuData.sep()],
            this.makeChangeParamsContextMenuItem("outputs", S.Components.Generic.contextMenu.ParamNumBits, this.numBits, "bits"),
            ["mid", MenuData.sep()],

        ]

        if (this.numBits === 1) {
            const makeToggleConstantItem = () => {
                const icon = this._isConstant ? "check" : "none"
                const action = () => this.doSetIsConstant(!this._isConstant)
                return MenuData.item(icon, s.LockValue + ` (${toLogicValueRepr(this.value[0])})`, action)
            }
            const replaceWithClockItem =
                MenuData.item("timer", s.ReplaceWithClock, () => {
                    this.replaceWithComponent(ClockDef.make(this.parent))
                })

            newItems.push(
                ["mid", makeToggleConstantItem()],
                ["mid", MenuData.sep()],
                ["mid", replaceWithClockItem],
                ["mid", MenuData.sep()],
            )
        }

        newItems.push(...super.makeComponentSpecificContextMenuItems())

        return newItems
    }

}
InputDef.impl = Input

function nextValue(value: LogicValue, mode: Mode, altKey: boolean): LogicValue {
    switch (value) {
        case true: return (mode >= Mode.FULL && altKey) ? Unknown : false
        case false: return (mode >= Mode.FULL && altKey) ? Unknown : true
        case Unknown: return mode >= Mode.FULL ? (altKey ? HighImpedance : false) : Unknown
        case HighImpedance: return mode >= Mode.FULL ? (altKey ? Unknown : false) : HighImpedance
    }
}