import * as t from "io-ts"
import { ComponentFactory } from "../ComponentFactory"
import { ComponentList } from "../ComponentList"
import { LogicEditor } from "../LogicEditor"
import { NodeManager } from "../NodeManager"
import { RecalcManager } from "../RedrawRecalcManager"
import { SVGRenderingContext } from "../SVGRenderingContext"
import { Serialization } from "../Serialization"
import { COLOR_COMPONENT_BORDER } from "../drawutils"
import { b, div, mods, span, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillUsing, ArrayFillWith, InteractionResult, LogicValue, isArray, isString, typeOrUndefined, validateJson } from "../utils"
import { Component, ComponentBase, ComponentRepr, NodeDesc, NodeGroupDesc, NodeInDesc, NodeOutDesc, NodeRec, defineComponent, groupHorizontal, groupVertical } from "./Component"
import { DrawContext, DrawableParent, EditTools, GraphicsRendering, MenuData, MenuItems, Orientation, Orientations } from "./Drawable"
import { Input, InputRepr } from "./Input"
import { NodeIn, NodeOut } from "./Node"
import { Output, OutputRepr } from "./Output"
import { LinkManager, Wire } from "./Wire"

type CustomComponentNodeSpec = {
    isIn: boolean,
    id: string,
    name: string,
    orient: Orientation,
    numBits: number,
    sourcePos: [number, number],
    sourceRepr: Record<string, unknown>,
}

// How custom components are identied in their type
export const CustomComponentPrefix = "custom-"
export const CustomComponentImageWidth = 50
export const CustomComponentImageHeight = 34

// How custom component definitions are stored in JSON
export const CustomComponentDefRepr = t.type({
    id: t.string,
    caption: t.string,
    circuit: t.type({
        components: typeOrUndefined(t.record(t.string, t.record(t.string, t.unknown))),
        wires: typeOrUndefined(t.array(Wire.Repr)),
    }),
})

export type CustomComponentDefRepr = t.TypeOf<typeof CustomComponentDefRepr>
type CircuitRepr = CustomComponentDefRepr["circuit"]


export class CustomComponentDef {

    public customId: string
    public readonly circuit: CircuitRepr
    public readonly insOuts: CustomComponentNodeSpec[]
    public readonly numInputs: number
    public readonly numOutputs: number
    private readonly numBySide: Record<Orientation, number> = { n: 0, e: 0, s: 0, w: 0 }
    private _caption: string
    public gridWidth!: number
    public gridHeight!: number

    public toJSON(): CustomComponentDefRepr {
        return {
            id: this.customId,
            caption: this._caption,
            circuit: this.circuit,
        }
    }

    public get caption() {
        return this._caption
    }

    public doSetCaption(caption: string) {
        this._caption = caption
        this.recalcSize()
    }

    public constructor(data: CustomComponentDefRepr) {
        this.customId = data.id
        this._caption = data.caption
        this.circuit = data.circuit

        this.insOuts = []
        let totalIn = 0
        let totalOut = 0
        const components = this.circuit.components ?? {}
        for (const [id, repr_] of Object.entries(components)) {
            const repr = repr_ as ComponentRepr<true, true>
            const isIn = repr.type === "in" && !((repr as InputRepr).isConstant ?? false)
            const isOut = repr.type === "out"
            if (isIn || isOut) {
                const inOutRepr = repr as InputRepr | OutputRepr
                const name = isString(inOutRepr.name) ? inOutRepr.name : (isIn ? "In" : "Out")
                let orient = Orientations.includes(inOutRepr.orient) ? inOutRepr.orient : Orientation.default
                orient = isIn ? Orientation.invert(orient) : orient
                const numBits = Number(inOutRepr.bits ?? 1)
                this.numBySide[orient] += numBits
                const sourcePos = (isArray(inOutRepr.pos) && inOutRepr.pos.length === 2 ? inOutRepr.pos.map(Number) : [0, 0]) as [number, number]
                this.insOuts.push({ isIn, id, name, orient, numBits, sourcePos, sourceRepr: inOutRepr })
                delete components[id] // add them back after 2D sorting
                if (isIn) {
                    totalIn += numBits
                } else {
                    totalOut += numBits
                }
            }
        }
        sortInputsOutputs(this.insOuts)
        for (const spec of this.insOuts) {
            components[spec.id] = spec.sourceRepr
        }

        this.numInputs = totalIn
        this.numOutputs = totalOut

        this.recalcSize()
    }

    private recalcSize() {
        const spacing = 2
        const margin = 1.5
        const minSize = 1 * this._caption.length + 2
        this.gridWidth = Math.ceil(Math.max(minSize, (Math.max(this.numBySide.s, this.numBySide.n) - 1) * spacing + 2 * margin))
        this.gridHeight = Math.ceil(Math.max(minSize, (Math.max(this.numBySide.e, this.numBySide.w) - 1) * spacing + 2 * margin))
    }

    // ComponentMaker interface
    public isValid() { return true }
    public get type() { return CustomComponentPrefix + this.customId }

    public uses(type: string, alsoIndirect: false | [true, ComponentFactory]): boolean {
        const compReprs = this.circuit.components
        if (compReprs === undefined) {
            return false
        }
        const whitelist: string[] = []
        for (const compRepr of Object.values(compReprs)) {
            const compType = String(compRepr.type)
            if (compType === type) {
                return true
            } else if (alsoIndirect !== false && compType.startsWith(CustomComponentPrefix) && !whitelist.includes(compType)) {
                const factory = alsoIndirect[1]
                // maybe this other custom component uses the type
                const customId = compType.substring(CustomComponentPrefix.length)
                if (factory.getCustomDef(customId)?.uses(type, alsoIndirect) ?? false) {
                    return true
                }
                whitelist.push(compType)
            }
        }
        return false
    }

    public make(parent: DrawableParent): Component {
        const comp = new CustomComponent(parent, this)
        parent.components.add(comp)
        return comp
    }

    public makeFromJSON(parent: DrawableParent, data: Record<string, unknown>): Component | undefined {
        const validated = validateJson(data, CustomComponentRepr, "CustomComponent")
        if (validated === undefined) {
            return undefined
        }
        const comp = new CustomComponent(parent, this, validated)
        parent.components.add(comp)
        return comp
    }

    public makeButtonSVG() {
        const width = CustomComponentImageWidth
        const height = CustomComponentImageHeight
        const g = new SVGRenderingContext(width, height)

        // frame
        g.rect(10, 2, 30, 30)
        g.strokeStyle = "currentColor"
        g.lineWidth = 2
        g.stroke()

        // in/out
        const maxHeight = 24
        const stdSep = 6
        const drawInsOuts = (n: number, left: number, right: number) => {
            const sep = ((n - 1) * stdSep <= maxHeight) ? stdSep : maxHeight / (n - 1)
            const top = height / 2 - (n - 1) * sep / 2
            for (let i = 0; i < n; i++) {
                const y = top + i * sep
                g.moveTo(left, y)
                g.lineTo(right, y)
            }
        }
        g.lineWidth = 1
        const maxDrawnIO = 10
        drawInsOuts(Math.min(maxDrawnIO, this.numInputs), 2, 10)
        drawInsOuts(Math.min(maxDrawnIO, this.numOutputs), 40, 48)
        g.stroke()

        // caption
        let drawCaption = this._caption
        let shortened = false

        // eslint-disable-next-line no-constant-condition
        while (true) {
            let fontSize = 15
            g.font = `${fontSize}px sans-serif`
            const textWidth = g.measureText(drawCaption).width
            const scale = (width - 24) / textWidth
            if (scale < 1) {
                fontSize = Math.floor(scale * fontSize)
                g.font = `${fontSize}px sans-serif`
            }
            if (fontSize >= 8) {
                g.textAlign = "center"
                g.textBaseline = "middle"
                g.fillStyle = "currentColor"
                g.fillText(drawCaption + (shortened ? "." : ""), width / 2, height / 2)
                break
            }
            // else, try again with a shorter caption
            drawCaption = drawCaption.slice(0, -1)
            shortened = true
        }

        return g.getSvg()
    }

    // ComponentDef creation
    public toStandardDef() {
        return defineComponent(CustomComponentPrefix + this.customId, {
            idPrefix: this.customId,
            button: { imgWidth: 50 },
            valueDefaults: {},
            size: { gridWidth: this.gridWidth, gridHeight: this.gridHeight },
            makeNodes: ({ gridWidth, gridHeight }) => {
                const right = gridWidth / 2 + 1
                const left = -right
                const bottom = gridHeight / 2 + 1
                const top = -bottom
                const starts: Record<Orientation, number> = {
                    n: this.numBySide.n - 1,
                    e: -(this.numBySide.e - 1),
                    s: this.numBySide.s - 1,
                    w: -(this.numBySide.w - 1),
                }
                const counts: Record<Orientation, number> = { n: 0, e: 0, s: 0, w: 0 }
                const make = (spec: CustomComponentNodeSpec): NodeDesc | NodeGroupDesc<NodeDesc> => {
                    const { orient, numBits } = spec
                    const [x, y] = (() => {
                        const f = Orientation.isVertical(orient) ? -1 : 1
                        const nextPos = starts[orient] + f * (counts[orient] + (numBits - 1) / 2) * 2
                        switch (orient) {
                            case "e": return [right, nextPos]
                            case "w": return [left, nextPos]
                            case "n": return [nextPos, top]
                            case "s": return [nextPos, bottom]
                        }
                    })()
                    counts[orient] += numBits
                    return numBits === 1
                        ? [x, y, orient]
                        : Orientation.isVertical(orient)
                            ? groupHorizontal(orient, x, y, numBits)
                            : groupVertical(orient, x, y, numBits)
                }

                const ins: NodeRec<NodeInDesc> = {}
                const outs: NodeRec<NodeOutDesc> = {}
                //.sort((a, b) => a.sortIndex - b.sortIndex)
                // console.log(sortedSpecs)
                for (const spec of this.insOuts) {
                    (spec.isIn ? ins : outs)[spec.name] = make(spec)
                }
                return { ins, outs }
            },
            initialValue: () => ArrayFillWith(false as LogicValue, this.numOutputs),
        })
    }
}

export const CustomComponentRepr = ComponentRepr(true, true)
export type CustomComponentRepr = t.TypeOf<typeof CustomComponentRepr>


export class CustomComponent extends ComponentBase<CustomComponentRepr, LogicValue[]> implements DrawableParent {


    /// Base public properties ///

    private _customDef: CustomComponentDef
    public get customDef() { return this._customDef }
    public readonly numInputs: number
    public readonly numOutputs: number


    /// DrawableParent implementation ///

    public isMainEditor(): this is LogicEditor { return false }
    public get editor() { return this.parent.editor }
    public get mode() { return this.parent.mode }

    public readonly components = new ComponentList()
    public readonly nodeMgr = new NodeManager()
    public readonly linkMgr: LinkManager = new LinkManager(this)
    public readonly recalcMgr = new RecalcManager()

    private _ifEditing: EditTools | undefined = undefined
    public get ifEditing() { return this._ifEditing }
    public stopEditingThis() { this._ifEditing = undefined }
    public startEditingThis(tools: EditTools) { this._ifEditing = tools }


    /// Other internals ///

    private _subcircuitInputs: NodeOut[] = []
    private _subcircuitOutputs: NodeIn[] = []

    public constructor(parent: DrawableParent, customDef: CustomComponentDef, saved?: CustomComponentRepr) {
        super(parent, customDef.toStandardDef(), saved)
        this._customDef = customDef
        this.numInputs = this.inputs._all.length
        this.numOutputs = this.outputs._all.length

        const error = Serialization.loadCircuit(this, customDef.circuit, { immediateWirePropagation: true, skipMigration: true })
        if (error !== undefined) {
            console.error("Failed to load custom component:", error)
            this.setInvalid()
        }

        let iIn = 0
        for (const comp of this.components.all()) {
            // assume they have been kept in the right order
            if (comp instanceof Input && !comp.isConstant) {
                const nodes = comp.outputs._all
                this._subcircuitInputs.push(...nodes)
                const num = nodes.length
                if (num === 1 && comp.isLinkedToSomeClock) {
                    this.inputs._all[iIn].isClock = true
                }
                for (let i = 0; i < num; i++) {
                    this.inputs._all[iIn + i].prefersSpike = comp.isPushButton
                }
                iIn += num
            } else if (comp instanceof Output) {
                this._subcircuitOutputs.push(...comp.inputs._all)
            }
        }
    }

    public override toStringDetails() {
        return this.customDef?.customId ?? ""
    }

    public toJSON() {
        return this.toJSONBase()
    }

    protected override jsonType() {
        return CustomComponentPrefix + this.customDef.customId
    }

    protected override makeClone(setSpawning: boolean): CustomComponent {
        const repr = this.toNodelessJSON()
        const clone = new CustomComponent(this.parent, this.customDef, repr)
        this.parent.components.add(clone)
        if (setSpawning) {
            clone.setSpawning()
        }
        return clone
    }

    public updateFromDef() {
        // we need to recreate it to regenerate the properties from the new def
        const newDef = this.editor.factory.getCustomDef(this._customDef.customId)
        if (newDef === undefined) {
            console.warn("New custom component definition not found, using old one, but trouble is ahead")
        } else {
            this._customDef = newDef
        }
        this.replaceWithComponent(this.makeClone(false))
    }

    protected doRecalcValue(): LogicValue[] {
        for (let i = 0; i < this.numInputs; i++) {
            this._subcircuitInputs[i].value = this.inputs._all[i].value
        }
        this.recalcMgr.recalcAndPropagateIfNeeded()
        const outputs = ArrayFillUsing(i => this._subcircuitOutputs[i].value, this.numOutputs)
        return outputs
    }

    protected override propagateValue(newValue: LogicValue[]) {
        this.outputValues(this.outputs._all, newValue)
    }

    public override makeTooltip() {
        const s = S.Components.Custom.tooltip
        return tooltipContent(mods(b(this.customDef.caption), span(s.titleSuffix)), mods(
            div(s.desc),
        ))
    }


    // TODO tooltip

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext): void {
        super.doDrawDefault(g, ctx, () => {
            g.font = `bold 18px sans-serif`
            g.fillStyle = COLOR_COMPONENT_BORDER
            g.textAlign = "center"
            g.textBaseline = "middle"
            g.fillText(this.customDef.caption, this.posX, this.posY)
        })
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.Custom.contextMenu

        return [
            ...this.makeForceOutputsContextMenuItem(),
            ["mid", MenuData.item("connect", s.ChangeCircuit, () => {
                this.tryOpenEditor()
            }, "↩︎")],
        ]
    }

    public override keyDown(e: KeyboardEvent): void {
        if (e.key === "Enter" && !e.altKey) {
            this.tryOpenEditor()
        } else {
            super.keyDown(e)
        }
    }

    public override mouseDoubleClicked(e: MouseEvent | TouchEvent) {
        const result = super.mouseDoubleClicked(e)
        if (result.isChange) {
            return result
        }
        this.tryOpenEditor()
        return InteractionResult.SimpleChange
    }

    private tryOpenEditor() {
        if (!(this.editor.editorRoot instanceof LogicEditor)) {
            alert(S.Components.Custom.messages.NotInMainEditor)
            return
        }
        this.editor.setEditorRoot(this)
        this.editor.editTools.undoMgr.takeSnapshot()
    }

}


function sortInputsOutputs(insOuts: CustomComponentNodeSpec[]) {
    const orientValue = {
        e: 0,
        w: 1,
        n: 2,
        s: 3,
    }
    const criterion = (spec: CustomComponentNodeSpec) => {
        return Orientation.isVertical(spec.orient) ? -spec.sourcePos[0] : spec.sourcePos[1]
    }
    insOuts.sort((a, b) => {
        return orientValue[a.orient] - orientValue[b.orient] || criterion(a) - criterion(b)
    })
}

