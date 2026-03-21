import { ComponentList } from "../ComponentList"
import { drawComponentIDs, DrawZIndex, GRID_STEP, WIRE_WIDTH } from "../drawutils"
import { DrawParams, LogicEditor } from "../LogicEditor"
import { NodeManager } from "../NodeManager"
import { RecalcManager } from "../RedrawRecalcManager"
import { TestSuites } from "../TestSuite"
import { Mode, Orientation } from "../utils"
import { Component, InjectedParams } from "./Component"
import { DrawableParent, GraphicsRendering } from "./Drawable"
import { Gate1, Gate1Def, GateN, GateNDef } from "./Gate"
import { Gate1Type, Gate1Types, GateNType } from "./GateTypes"
import { Node, NodeBase, NodeIn, NodeOut } from "./Node"
import { LinkManager, WireStyle } from "./Wire"


export type XRayNodesFor<T, N> =
    T extends any[][] ? N[][] :
    T extends any[] ? N[] : N

export type WaypointSpecCompact = [x: number, y: number]
type NodeOutOrComp = NodeOut | Component & { outputs: { Out: NodeOut } }

export class XRay implements DrawableParent {

    public isMainEditor(): this is LogicEditor { return false }
    public get editor() { return this.component.parent.editor }
    public get mode() { return Mode.STATIC }

    public readonly components = new ComponentList()
    public readonly testSuites: TestSuites = new TestSuites(this)
    public readonly nodeMgr = new NodeManager()
    public readonly linkMgr: LinkManager = new LinkManager(this)
    public readonly recalcMgr = new RecalcManager()

    private readonly _debugLines: Array<[vertical: boolean, pos: number, style: string | CanvasGradient | CanvasPattern]> = []

    public get ifEditing() { return undefined }
    public startEditingThis() { throw new Error("can't edit xray") }
    public stopEditingThis() { throw new Error("can't edit xray") }

    public readonly componentCreationParams: InjectedParams = { isXRay: true }

    public constructor(
        public readonly component: Component,
        public readonly scale: number,
    ) {
    }

    /**
     * Draws a wire between the given nodes, optionally aligning the target
     * component (when styleOrAlign is true) or source component (when styleOrAlign
     * is false) so that it makes a straight line. If no straight line is wanted,
     * then a WireStyle should be passed (usually "hv" or "vh") and optionally a
     * sequence of waypoints, some of which can be determined to always show a
     * dot (when we consider that a single wire splits, to make the branch
     * visually different from just a wire crossing).
     * 
     * Components that should be auto-aligned on an X or Y axis must previously
     * have been positioned at 0 for that axis (to get the correct relative position
     * of the alignment nodes with respect to the component).
     * 
     * Be careful to make wire() calls in the right order: do not align components
     * on other components that don't have their final position yet, and make the
     * wires with visible intersection waypoints after the wire undernear without.
     */
    public wire(startNode: NodeOutOrComp, endNode: NodeIn | Gate1, styleOrAlign?: WireStyle | boolean, via?: WaypointSpecCompact | WaypointSpecCompact[]) {
        if (!(startNode instanceof NodeBase)) {
            startNode = startNode.outputs.Out
        }
        if (!(endNode instanceof NodeBase)) {
            endNode = endNode.inputs.In[0]
        }
        const wire = this.linkMgr.addWire(startNode, endNode, false)
        if (wire === undefined) {
            return
        }
        wire.customPropagationDelay = 0
        if (styleOrAlign !== undefined) {
            if (styleOrAlign === true) {
                this.alignComponentOf(endNode, startNode)
                wire.doSetStyle("hv")
            } else if (styleOrAlign === false) {
                this.alignComponentOf(startNode, endNode)
                wire.doSetStyle("hv")
            } else {
                wire.doSetStyle(styleOrAlign)
            }
        }
        if (via !== undefined && via.length > 0) {
            const waypoints = (Array.isArray(via[0]) ? via : [via]) as WaypointSpecCompact[]
            let nb = 0
            for (const [x, y] of waypoints) {
                wire.addWaypointWith(x, y, ++nb)
            }
        }
    }

    public wires(startNodes: NodeOut[], endNodes: NodeIn[], left?: number, right?: number, monotonicAllocation?: boolean): [number, number] {
        let num = startNodes.length
        if (num !== endNodes.length) {
            console.error(`connecting wrong number of inputs and outputs in xray`)
            num = Math.min(num, endNodes.length)
        }
        if (num === 0) {
            console.error(`no nodes to connect`)
            return [0, 0]
        }

        const alloc = new WireColumnAllocator(monotonicAllocation ?? true)
        const cols = new Array<number>(num)

        const allocateAt = (i: number) => {
            const fromY = startNodes[i].posY
            const toY = endNodes[i].posY
            cols[i] = alloc.allocate(fromY, toY)
        }

        // determine allocation order
        let someGoUp = false
        let someGoDown = false
        for (let i = 0; i < num; i++) {
            const fromY = startNodes[i].posY
            const toY = endNodes[i].posY
            if (toY > fromY) {
                someGoDown = true
            }
            if (toY < fromY) {
                someGoUp = true
            }
        }

        // allocation order
        if (someGoUp && someGoDown) {
            // top, bottom, top + 1, bottom - 1, etc.
            for (let i = 0; i < (num >> 1); i++) {
                allocateAt(i)
                allocateAt(num - 1 - i)
            }
            if (num % 2 !== 0) {
                allocateAt((num >> 1) + 1)
            }
        } else if (!someGoUp) {
            // all down
            for (let i = 0; i < num; i++) {
                allocateAt(i)
            }
        } else {
            // all up
            for (let i = num - 1; i >= 0; i--) {
                allocateAt(i)
            }
        }

        // now that we know the number of columa, find distance
        const numCols = alloc.numColumns
        left ??= startNodes[0].posX
        right ??= endNodes[0].posX
        const [startX, inc] = numCols === 1 ? [(left + right) / 2, 0] : [right, (left - right) / (numCols - 1)]

        for (let i = 0; i < num; i++) {
            const x = startX + cols[i] * inc
            this.wire(startNodes[i], endNodes[i], "hv", [x, endNodes[i].posY])
            cols[i] = x
        }

        return [left, right]
    }


    public gate<G extends GateNType | Gate1Type>(validatedId: string, type: G, x: number, y: number, orient?: Orientation, bits?: G extends Gate1Type ? undefined : number): G extends Gate1Type ? Gate1 : GateN {
        if (Gate1Types.includes(type)) {
            const gate1 = Gate1Def.makeSpawned<Gate1>(this, validatedId, x, y, orient, { type })
            return gate1 as any
        } else {
            const gateN = GateNDef.makeSpawned<GateN>(this, validatedId, x, y, orient, { type, bits: bits ?? 2 })
            return gateN as any
        }
    }

    private alignComponentOf(nodeToAlign: Node, referenceNode: Node) {
        const comp = nodeToAlign.component
        const referenceComponentOrient = referenceNode.isXRayMirrorNode ? Orientation.default : referenceNode.component.orient
        const alignX = Orientation.isVertical(Orientation.add(referenceComponentOrient, referenceNode.orient))
        let fail: [number, string] | undefined = undefined
        if (alignX) {
            if (comp.posX !== 0) {
                fail = [comp.posX, "X"]
            }
            const compX = referenceNode.posX - nodeToAlign.posX
            comp.setPosition(compX, comp.posY, false)
        } else {
            // alignY
            if (comp.posY !== 0) {
                fail = [comp.posY, "Y"]
            }
            const compY = referenceNode.posY - nodeToAlign.posY
            comp.setPosition(comp.posX, compY, false)
        }
        if (fail) {
            const [coord, axis] = fail
            console.warn(`Autoalignement on ${axis} axis of component ${comp.ref} will fail because it should previously have an ${axis} position of 0 and it has ${coord}`)
        }
    }

    public debugVline(x: number, style?: string | CanvasGradient | CanvasPattern) {
        this._debugLines.push([true, x, style ?? "red"])
    }

    public debugHline(x: number, style?: string | CanvasGradient | CanvasPattern) {
        this._debugLines.push([false, x, style ?? "red"])
    }

    public doDraw(g: GraphicsRendering, drawParams: DrawParams) {
        this.recalcMgr.recalcAndPropagateIfNeeded()
        const drawComp = (comp: Component) => {
            g.group(comp.constructor.name, () => {
                comp.draw(g, drawParams)
                for (const node of comp.allNodes()) {
                    node.draw(g, drawParams)
                }
            })
        }

        g.group("xray", () => {
            for (const comp of this.components.withZIndex(DrawZIndex.Background)) {
                drawComp(comp)
            }
            this.linkMgr.draw(g, drawParams)
            for (const comp of this.components.withZIndex(DrawZIndex.Normal)) {
                drawComp(comp)
            }

            // draw refs
            if (this.editor.options.showIDs) {
                drawComponentIDs(g, this.components.all())
            }

            if (this._debugLines.length !== 0) {
                const halfHeight = (this.component.unrotatedHeight / 2 + GRID_STEP) / this.scale
                const halfWidth = (this.component.unrotatedWidth / 2 + GRID_STEP) / this.scale
                for (const [vertical, pos, style] of this._debugLines) {
                    g.lineWidth = 1
                    g.strokeStyle = style
                    g.beginPath()
                    if (vertical) {
                        g.moveTo(pos, -halfHeight)
                        g.lineTo(pos, halfHeight)
                    } else {
                        g.moveTo(-halfWidth, pos)
                        g.lineTo(halfWidth, pos)
                    }
                    g.stroke()
                }
            }
        })
    }
}


type AllocatorSpan = [from: number, to: number]

export class WireColumnAllocator {

    private _usedSegmentsByColumn: Array<Array<AllocatorSpan>> = []
    private _startSearchingAt: number = 0

    public constructor(
        public readonly monotonic: boolean,
        public margin: number = WIRE_WIDTH,
    ) { }

    public get numColumns() {
        return this._usedSegmentsByColumn.length
    }

    public allocate(spanStart: number, spanEnd: number): number {
        const i = (() => {
            const newSpan: AllocatorSpan = spanStart > spanEnd ? [spanEnd, spanStart] : [spanStart, spanEnd]
            const margin = this.margin

            // find first column that can fit it
            let i = this._startSearchingAt
            for (; i < this._usedSegmentsByColumn.length; i++) {
                const colSpans = this._usedSegmentsByColumn[i]
                let hasConflict = false
                for (const span of colSpans) {
                    if (spansOverlap(span, newSpan, margin)) {
                        hasConflict = true
                        break
                    }
                }
                if (!hasConflict) {
                    colSpans.push(newSpan)
                    return i
                }
            }

            // we didn't find a suitable colum so we allocate a new one
            this._usedSegmentsByColumn.push([newSpan])
            return i
        })()

        if (this.monotonic) {
            this._startSearchingAt = i
        }
        return i
    }

    public dump() {
        console.log(`WireColumnAllocator dump (margin=${this.margin})`)
        for (let i = 0; i < this.numColumns; i++) {
            const sortedSpans = [...this._usedSegmentsByColumn[i]].sort((a, b) => a[0] - b[0])
            console.log(`  Col ${i}: ${sortedSpans.map(s => s.join("-")).join(", ")}`)
        }
    }

}

function spansOverlap(s1: AllocatorSpan, s2: AllocatorSpan, margin: number) {
    return s1[0] - margin < s2[1] && s2[0] - margin < s1[1]
}