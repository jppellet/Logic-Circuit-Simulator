import { ComponentList } from "../ComponentList"
import { drawComponentIDs, DrawZIndex, fillTextVAlign, GRID_STEP, TextVAlign, WIRE_WIDTH } from "../drawutils"
import { DrawParams, LogicEditor } from "../LogicEditor"
import { NodeManager } from "../NodeManager"
import { RecalcManager } from "../RedrawRecalcManager"
import { TestSuites } from "../TestSuite"
import { isArray, isBoolean, isNumber, isString, LogicValue, Mode, Orientation, ParentType } from "../utils"
import { Component, InjectedParams } from "./Component"
import { DrawableParent, GraphicsRendering, HasPosition } from "./Drawable"
import { FlipflopOrLatch } from "./FlipflopOrLatch"
import { Gate1, Gate1Def, GateN, GateNDef } from "./Gate"
import { Gate1Type, Gate1Types, GateNType } from "./GateTypes"
import { InputDef } from "./Input"
import { Node, NodeBase, NodeIn, NodeOut } from "./Node"
import { OutputDef } from "./Output"
import { LinkManager, Wire, WireStyle } from "./Wire"


export type XRayNodesFor<T, N> =
    T extends any[][] ? N[][] :
    T extends any[] ? N[] : N

export type WaypointSpecCompact = readonly [x: number | HasPosition, y: number | HasPosition]

export class XRayPosMaker {

    public readonly left: number
    public readonly right: number
    public readonly top: number
    public readonly bottom: number
    public readonly later = 0


    public constructor(
        public readonly halfWidth: number,
        public readonly halfHeight: number) {
        this.left = -halfWidth
        this.right = halfWidth
        this.top = -halfHeight
        this.bottom = halfHeight
    }

    public x(f: number): number {
        return f * this.halfWidth
    }

    public y(f: number): number {
        return f * this.halfHeight
    }

    public leftBy(d: number, obj: HasPosition): WaypointSpecCompact {
        return [obj.posX - d * GRID_STEP, obj.posY]
    }

    public rightBy(d: number, obj: HasPosition): WaypointSpecCompact {
        return [obj.posX + d * GRID_STEP, obj.posY]
    }

    public upBy(d: number, obj: HasPosition): WaypointSpecCompact {
        return [obj.posX, obj.posY - d * GRID_STEP]
    }

    public downBy(d: number, obj: HasPosition): WaypointSpecCompact {
        return [obj.posX, obj.posY + d * GRID_STEP]
    }

    public movedBy(dx: number, dy: number, obj: HasPosition): WaypointSpecCompact {
        return [obj.posX + dx * GRID_STEP, obj.posY + dy * GRID_STEP]
    }

}


// Column allocation for wires

type WireColumnAllocationOrder = "top-down" | "bottom-up" | "outside-in" | "inside-out"

type WireColumnAllocationOptions = {
    /** Preset order for allocation */
    order?: WireColumnAllocationOrder,
    /** Whether each wire should be allocated in a different column */
    allDifferent?: boolean,
    /** Whether the allocation can reuse past columns. Doesn't make sense if allDifferent is true */
    monotonic?: boolean
}

export type WireColumnAllocation = {
    numCols: number,
    cols: number[],
}


// Position allocation for wires (from columns)

type WireColumnBookings = {
    /** Add columns to the left */
    colsLeft?: number,
    /** Add columns to the right */
    colsRight?: number,
}

type WirePositionAllocationOptions = {
    /** Start from this left position (or from the first NodeOut) */
    left?: number,
    /** Stop at this right position (or at the first NodeIn) */
    right?: number,
    /** Use this increment in the width distribution. If positive, align left; if negative, align right */
    inc?: number,
}

export class WirePositionAllocation {
    public constructor(
        public readonly first: number,
        public readonly inc: number,
        public readonly numCols: number,
        public readonly invertOn: number | undefined = undefined,
    ) { }

    public at(i: number) {
        if (i < 0) {
            // index from end
            i += this.numCols
        }
        if (this.invertOn !== undefined) {
            i = this.invertOn - 1 - i
        }
        return this.first + i * this.inc
    }

    public derive(opts: { colShift?: number, invertOn?: number }): WirePositionAllocation {
        const colShift = opts.colShift ?? 0
        return new WirePositionAllocation(this.first + colShift * this.inc, this.inc, this.numCols - colShift, opts.invertOn)
    }

    public get rightMostOrBottomMost() {
        return Math.max(this.at(this.numCols - 1), this.at(0) - this.inc)
    }

}


// Multi-zone allocation

export type WireAllocationZone = ({
    from: ReadonlyArray<NodeOut>,
    to: ReadonlyArray<NodeIn> | ReadonlyArray<NodeIn>[],
} | {
    from: ReadonlyArray<NodeOut>[],
    to: ReadonlyArray<NodeIn>[],
}) & {
    id: string,
    debug?: boolean,
    alloc?: WireColumnAllocationOptions,
    bookings?: WireColumnBookings,
    positions?: WirePositionAllocationOptions,
    after?: {
        comps: Component[],
        compWidth?: number,
    } | Component[] | Component,
}

type WireAllocationZoneIds<T extends readonly { id: string }[]> = T[number]["id"]


type NodeOutOrComp = NodeOut | Component & { outputs: { Out: NodeOut } }
type DebugLineSpec = [vertical: boolean, pos: number, style: string | CanvasGradient | CanvasPattern, label: string, ind?: number]

export class XRay implements DrawableParent {

    public get type(): ParentType { return ParentType.XRAY }
    public isMainEditor(): this is LogicEditor { return false }
    public get editor() { return this.component.parent.editor }
    public get mode() { return Mode.STATIC }

    public readonly components = new ComponentList()
    public readonly testSuites: TestSuites = new TestSuites(this)
    public readonly nodeMgr = new NodeManager()
    public readonly linkMgr: LinkManager = new LinkManager(this)
    public readonly recalcMgr = new RecalcManager()

    private _internalNodes: Node[] = []

    public drawDebugLines: boolean = false
    private readonly _debugLines: DebugLineSpec[] = []

    public get ifEditing() { return undefined }
    public startEditingThis() { throw new Error("can't edit xray") }
    public stopEditingThis() { throw new Error("can't edit xray") }

    public readonly componentCreationParams: InjectedParams = { isXRay: true }

    public constructor(
        public readonly component: Component,
        public readonly level: number,
        public readonly scale: number,
    ) {
    }

    public registerNewInternalNode(node: Node) {
        this._internalNodes.push(node)
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
        try {
            const mirrorNodeDisconnected = !(startNode.xRayOutsideNode?.isConnected ?? true) || !(endNode.xRayOutsideNode?.isConnected ?? true)
            if (mirrorNodeDisconnected && this.level > 0) {
                // don't show xray wires for unconnected nodes
                return
            }
            const wire = this.linkMgr.addWire(startNode, endNode, false)
            if (wire === undefined) {
                return
            }
            wire.customPropagationDelay = 0
            const wireStyle = isString(styleOrAlign) ? styleOrAlign : isBoolean(styleOrAlign) ? "hv" : "straight"
            wire.doSetStyle(wireStyle)
            if (via !== undefined && via.length > 0) {
                const waypoints = (Array.isArray(via[0]) ? via : [via]) as WaypointSpecCompact[]
                let nb = 0
                for (const [x, y] of waypoints) {
                    wire.addWaypointWith(isNumber(x) ? x : x.posX, isNumber(y) ? y : y.posY, ++nb)
                }
            }
        } finally {
            if (styleOrAlign === true) {
                this.alignComponentOf(endNode, startNode)
            } else if (styleOrAlign === false) {
                this.alignComponentOf(startNode, endNode)
            }
        }
    }

    public allocateColumns(startNodes: ReadonlyArray<NodeOut>, endNodeSpec: ReadonlyArray<NodeIn> | ReadonlyArray<NodeIn>[], opts?: WireColumnAllocationOptions | WireColumnAllocationOrder, debugId?: string): WireColumnAllocation {
        const [num, endNodeGroups] = this._validateNodesToConnect(startNodes, endNodeSpec)
        const endNodesFor = (i: number) => endNodeGroups.map(en => en[i])

        const debug = debugId === undefined ? () => null : (msg: string) => {
            console.log(`Allocating '${debugId}' - ${msg}`)
        }

        opts = isString(opts) ? { order: opts } : opts
        let order = opts?.order
        if (order !== undefined) {
            debug(`Using preset order ${order}`)
        } else {
            // determine allocation order
            let someGoUp = false
            let someGoDown = false
            let leftMinY = Infinity
            let leftMaxY = -Infinity
            let rightMinY = Infinity
            let rightMaxY = -Infinity
            for (let i = 0; i < num; i++) {
                const fromY = startNodes[i].posY
                for (const node of endNodesFor(i)) {
                    const toY = node.posY
                    if (fromY > leftMaxY) { leftMaxY = fromY }
                    if (fromY < leftMinY) { leftMinY = fromY }
                    if (toY > rightMaxY) { rightMaxY = toY }
                    if (toY < rightMinY) { rightMinY = toY }
                    if (toY > fromY) { someGoDown = true }
                    if (toY < fromY) { someGoUp = true }
                }
            }

            if (someGoUp && someGoDown) {
                const isFanOut = rightMinY < leftMinY && rightMaxY > leftMaxY
                if (isFanOut) {
                    order = "inside-out"
                } else {
                    order = "outside-in"
                }
            } else if (!someGoUp) {
                order = "top-down"
            } else {
                order = "bottom-up"
            }

            debug(`Determined order ${order} (someGoUp=${someGoUp}, someGoDown=${someGoDown}, leftMinY=${leftMinY}, leftMaxY=${leftMaxY}, rightMinY=${rightMinY}, rightMaxY=${rightMaxY})`)
        }

        const visitAll = (visitor: (i: number) => void) => {
            const numHalf = num >> 1
            switch (order) {
                case "top-down":
                    for (let i = 0; i < num; i++) {
                        visitor(i)
                    }
                    break
                case "bottom-up":
                    for (let i = num - 1; i >= 0; i--) {
                        visitor(i)
                    }
                    break
                case "outside-in":
                    for (let i = 0; i < numHalf; i++) {
                        visitor(i)
                        visitor(num - 1 - i)
                    }
                    if (num % 2 !== 0) {
                        // middle
                        visitor(numHalf)
                    }
                    break
                case "inside-out":
                    // TODO straightest is maybe not the one in the middle
                    // check outside wiring in e.g. Bypass
                    if (num % 2 !== 0) {
                        visitor(numHalf + 1)
                    }
                    // top, bottom, top + 1, bottom - 1, etc.
                    for (let i = 0; i < numHalf; i++) {
                        visitor(numHalf + i)
                        visitor(numHalf - 1 - i)
                    }
            }
        }

        const allDifferent = opts?.allDifferent ?? false
        if (allDifferent) {
            const cols = new Array<number>(num)
            let lastAllocatedCol = -1
            visitAll(i => cols[i] = ++lastAllocatedCol)
            debug(`With allDifferent=true, we have numCols=${num} and cols=[${cols.join(", ")}]`)
            return { numCols: num, cols }
        } else {
            const alloc = new WireColumnAllocator(opts?.monotonic)
            const cols = new Array<number>(num)
            visitAll(i => {
                const ys = [startNodes[i].posY, ...endNodesFor(i).map(node => node.posY)]
                const y1 = Math.min(...ys)
                const y2 = Math.max(...ys)
                cols[i] = alloc.allocate(y1, y2)
            })
            debug(`With an allocator and monotonic=${alloc.monotonic}, we have numCols=${alloc.numColumns} and cols=[${cols.join(", ")}]`)
            return {
                numCols: alloc.numColumns, cols,
            }
        }
    }

    public wires(
        startNodes: ReadonlyArray<NodeOut>,
        endNodeSpec: ReadonlyArray<NodeIn> | ReadonlyArray<NodeIn>[],
        opts?: {
            bookings?: WireColumnBookings,
            position?: WirePositionAllocationOptions | WirePositionAllocation,
            alloc?: WireColumnAllocationOptions | WireColumnAllocationOrder | WireColumnAllocation,
            debugId?: string,
        },
    ): WirePositionAllocation {
        const [num, endNodeGroups] = this._validateNodesToConnect(startNodes, endNodeSpec)

        const { bookings, position, alloc, debugId } = opts ?? {}
        const { numCols, cols } = (alloc !== undefined && !isString(alloc) && "numCols" in alloc) ? alloc
            : this.allocateColumns(startNodes, endNodeGroups, alloc, debugId)
        const bookingRight = bookings?.colsRight ?? 0
        const bookingLeft = bookings?.colsLeft ?? 0

        let positionAlloc: WirePositionAllocation
        if (position instanceof WirePositionAllocation) {
            positionAlloc = position
        } else {
            const left = position?.left ?? startNodes[0].posX
            const right = position?.right ?? endNodeGroups[0][0].posX
            const totalCols = numCols + bookingLeft + bookingRight
            if (num === 0) {
                return new WirePositionAllocation(right, 0, totalCols)
            }
            let inc: number
            let startX: number
            if (position?.inc !== undefined) {
                inc = position.inc
                if (inc <= 0) {
                    // align right and move backwards
                    startX = right + inc
                } else {
                    // align left and move forwards
                    startX = left + inc * (totalCols + 1)
                    inc = -inc // reverse direction for allocation
                }
            } else {
                inc = (left - right) / (totalCols + 1)
                startX = right + inc
            }
            positionAlloc = new WirePositionAllocation(startX, inc, totalCols)
        }

        for (let i = 0; i < num; i++) {
            const x = positionAlloc.at(cols[i] + bookingRight)
            for (const endNodes of endNodeGroups) {
                this.wire(startNodes[i], endNodes[i], "hv", [x, endNodes[i]])
            }
        }

        return positionAlloc
    }

    private _validateNodesToConnect(startNodes: ReadonlyArray<NodeOut>, endNodeSpec: ReadonlyArray<NodeIn> | ReadonlyArray<NodeIn>[]): [number, NodeIn[][]] {
        const num = startNodes.length
        const endNodeGroups = isArray(endNodeSpec[0]) ? endNodeSpec as NodeIn[][] : [endNodeSpec as NodeIn[]]
        for (const endNodes of endNodeGroups) {
            if (num !== endNodes.length) {
                console.error(`connecting wrong number of inputs and outputs in xray`)
                return [Math.min(num, endNodes.length), endNodeGroups]
            }
        }
        if (num === 0) {
            console.error(`no nodes to connect`)
        }
        return [num, endNodeGroups]
    }

    /**
     * Allocates columns in the indicated separate horizontal zones, separated by
     * series of components, and balances out the space between wires across all zones.
     * It will move the X position of the middle components accordingly, but their Y
     * position is assumed to be final for the allocation to work.
     */
    public wiresInZones<const ZS extends readonly WireAllocationZone[]>(
        left: number, right: number, zones: ZS
    ): { [K in WireAllocationZoneIds<ZS>]: WirePositionAllocation } {
        const zoneAllocs = zones.map(zone => {
            const [from, to] = isArray(zone.from[0])
                ? [zone.from[0] as NodeOut[], zone.to[0] as NodeIn[]]
                : [zone.from as NodeOut[], zone.to as NodeIn[]]
            const debugId = (zone.debug ?? false) ? zone.id : undefined
            return this.allocateColumns(from, to, zone.alloc, debugId)
        })
        // normalize zones' after property
        const zoneCompWidths: number[] = []
        let totalCompWidths = 0
        for (const zone of zones) {
            if (zone.after !== undefined) {
                if (!("comps" in zone.after)) {
                    const comps = Array.isArray(zone.after) ? zone.after : [zone.after]
                    zone.after = { comps }
                }
                if (zone.after.compWidth === undefined) {
                    zone.after.compWidth = zone.after.comps.length === 0 ? 0 : this.componentWidthWithInputs(zone.after.comps[0])
                }
                zoneCompWidths.push(zone.after.compWidth)
                totalCompWidths += zone.after.compWidth
            } else {
                zoneCompWidths.push(0)
            }
        }
        let totalCols = 0
        for (let i = 0; i < zones.length; i++) {
            const bookings = zones[i].bookings
            totalCols += zoneAllocs[i].numCols + (bookings?.colsLeft ?? 0) + (bookings?.colsRight ?? 0)
        }
        const colInc = (right - left - totalCompWidths) / (totalCols + zones.length)

        const positionsAllocs: Record<string, WirePositionAllocation> = {}
        let posX = left
        for (let i = 0; i < zones.length; i++) {
            const zone = zones[i]
            const bookings = zones[i].bookings
            const zoneLeft = posX
            posX += (zoneAllocs[i].numCols + (bookings?.colsLeft ?? 0) + (bookings?.colsRight ?? 0) + 1) * colInc
            const zoneRight = posX

            if (zone.after !== undefined && "comps" in zone.after) {
                const compWidth = zoneCompWidths[i]
                const compX = posX + compWidth / 2
                for (const comp of zone.after.comps) {
                    comp.setPosition(compX, comp.posY, false)
                }
                posX += compWidth
            }

            const [froms, tos] = isArray(zone.from[0])
                ? [zone.from as NodeOut[][], zone.to as NodeIn[][]]
                : [[zone.from as NodeOut[]], [zone.to as NodeIn[]]]
            const position = { left: zoneLeft, right: zoneRight }
            const debugId = (zone.debug ?? false) ? zone.id : undefined
            const positionAlloc = this.wires(froms[0], tos[0], { bookings, position, alloc: zoneAllocs[i], debugId })
            // subzones (if any)
            for (let j = 1; j < froms.length; j++) {
                this.wires(froms[j], tos[j], { bookings, position, alloc: zoneAllocs[i], debugId })
            }
            positionsAllocs[zone.id] = positionAlloc
        }
        return positionsAllocs as any
    }

    private componentWidthWithInputs(comp: Component): number {
        const halfWidth = comp.unrotatedWidth / 2
        let leftmost = comp.posX - halfWidth
        let rightmost = comp.posX + halfWidth
        for (const node of comp.allNodes()) {
            const x = node.posX
            if (x < leftmost) { leftmost = x }
            if (x > rightmost) { rightmost = x }
        }
        return rightmost - leftmost
    }

    public gate<G extends GateNType | Gate1Type>(validatedId: string, type: G, x: number | HasPosition, y: number | HasPosition, orient?: Orientation, bits?: G extends Gate1Type ? undefined : number): G extends Gate1Type ? Gate1 : GateN {
        if (Gate1Types.includes(type)) {
            const gate1 = Gate1Def.makeSpawned(this, validatedId, x, y, orient, { type })
            return gate1 as any
        } else {
            const gateN = GateNDef.makeSpawned(this, validatedId, x, y, orient, { type, bits: bits ?? 2 })
            return gateN as any
        }
    }

    public constant(validatedId: string, value: LogicValue, x: number | HasPosition, y: number | HasPosition, orient?: Orientation) {
        const input = InputDef.makeSpawned(this, validatedId, x, y, orient, { bits: 1 })
        input.doSetIsConstant(true)
        input.setValue([value])
        return input
    }

    public alignXAfter(alloc: WirePositionAllocation, node: NodeIn) {
        const tracksEnd = alloc.rightMostOrBottomMost
        const comp = node.component
        comp.setPosition(tracksEnd - node.gridOffsetX * GRID_STEP, comp.posY, false)
    }

    public alignYAfter(alloc: WirePositionAllocation, node: NodeIn) {
        const tracksEnd = alloc.rightMostOrBottomMost
        const comp = node.component
        comp.setPosition(comp.posX, tracksEnd - node.gridOffsetY * GRID_STEP, false)
    }

    public alignComponentOf(nodeToAlign: Node, referenceNode: Node) {
        const comp = nodeToAlign.component
        const isXRayMirrorNode = referenceNode.xRayOutsideNode !== undefined
        const referenceComponentOrient = isXRayMirrorNode ? Orientation.default : referenceNode.component.orient
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

    public debugVLine(coord: number | WirePositionAllocation, style?: string | CanvasGradient | CanvasPattern, label?: string) {
        this._debugLine(coord, style, true, label)
    }

    public debugHLine(coord: number | WirePositionAllocation, style?: string | CanvasGradient | CanvasPattern, label?: string) {
        this._debugLine(coord, style, false, label)
    }

    private _debugLine(coord: number | WirePositionAllocation, style: string | CanvasGradient | CanvasPattern | undefined, vertical: boolean, label?: string) {
        style ??= "red"
        label ??= ""
        if (isNumber(coord)) {
            this._debugLines.push([vertical, coord, style, label])
        } else {
            for (let i = 0; i < coord.numCols; i++) {
                this._debugLines.push([vertical, coord.at(i), style, label, i])
            }
        }
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

            // debug lines
            if (this.drawDebugLines && this._debugLines.length !== 0) {
                this.doDrawDebugLines(g)
            }

        })
    }

    private doDrawDebugLines(g: GraphicsRendering) {
        const halfHeight = (this.component.unrotatedHeight / 2 + GRID_STEP) / this.scale
        const halfWidth = (this.component.unrotatedWidth / 2 + GRID_STEP) / this.scale
        for (const [vertical, pos, style, label, i] of this._debugLines) {
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

            g.fillStyle = style
            g.font = "10px sans-serif"
            const [drawLabel, groupLabel] = i !== undefined ? [`${i}`, label] : [label, undefined]
            if (vertical) {
                fillTextVAlign(g, TextVAlign.middle, drawLabel, pos, +(halfHeight + 10))
                fillTextVAlign(g, TextVAlign.middle, drawLabel, pos, -(halfHeight + 10))
                if (i === 0 && groupLabel !== undefined) {
                    fillTextVAlign(g, TextVAlign.middle, groupLabel, pos, +(halfHeight + 25))
                    fillTextVAlign(g, TextVAlign.middle, groupLabel, pos, -(halfHeight + 25))
                }
            } else {
                fillTextVAlign(g, TextVAlign.middle, drawLabel, -(halfWidth + 10), pos)
                fillTextVAlign(g, TextVAlign.middle, drawLabel, +(halfWidth + 10), pos)
                if (i === 0 && groupLabel !== undefined) {
                    fillTextVAlign(g, TextVAlign.middle, groupLabel, +(halfWidth + 10), pos - 15)
                    fillTextVAlign(g, TextVAlign.middle, groupLabel, -(halfWidth + 10), pos - 15)
                }
            }
        }
    }

    /**
     * In an XRay, sets the value of the component by setting the value of
     * an internal subcomponent of type FlipflopOrLatch that has a stored
     * value. Useful for all components that delegate storing to other,
     * simpler storing components.
     */
    public setStoredValueOfFlipflopOrLatch(id: string, val: LogicValue) {
        const subcomponent = this.components.get(id)
        if (subcomponent === undefined) {
            console.warn(`Cannot set stored value for latch in XRay: missing subcomponent with id ${id}`)
            return
        }
        (subcomponent as FlipflopOrLatch<any>).storedValue = val
    }

    public disconnect() {
        for (const node of this._internalNodes) {
            if (node.xRayOutsideNode !== undefined) {
                node.xRayOutsideNode.xrayInsideNode = undefined
                node.xRayOutsideNode = undefined
            }
        }
    }

    // For export

    public materializeInputsAndOutputs() {
        const inputNodes = new Map<NodeOut, Wire[]>()
        const outputNodes = new Map<NodeIn, Wire[]>()
        for (const wire of this.linkMgr.wires) {
            wire.customPropagationDelay = undefined
            if (wire.startNode.xRayOutsideNode !== undefined) {
                let wires = inputNodes.get(wire.startNode)
                if (wires === undefined) {
                    wires = []
                    inputNodes.set(wire.startNode, wires)
                }
                wires.push(wire)
            }
            if (wire.endNode.xRayOutsideNode !== undefined) {
                let wires = outputNodes.get(wire.endNode)
                if (wires === undefined) {
                    wires = []
                    outputNodes.set(wire.endNode, wires)
                }
                wires.push(wire)
            }
        }

        const offsets = (node: Node, orient: Orientation) => {
            switch (orient) {
                case "e": return [-node.gridOffsetX, -node.gridOffsetY]
                case "w": return [node.gridOffsetX, node.gridOffsetY]
                case "s": return [-node.gridOffsetY, -node.gridOffsetX]
                case "n": return [node.gridOffsetY, node.gridOffsetX]
                default: throw new Error(`invalid orientation ${orient}`)
            }
        }

        for (const [node, wires] of inputNodes) {
            const input = InputDef.makeSpawned(this, `in_${node.shortName}`, 0, 0, node.orient)
            const newNodeOut = input.outputs.Out[0]
            const [dx, dy] = offsets(newNodeOut, node.orient)
            input.setPosition(node.posX + dx * GRID_STEP, node.posY + dy * GRID_STEP, false)
            input.doSetName(node.shortName)
            input.setValue([node.value])
            input.doSetIsPushButton(node.xRayOutsideNode?.prefersSpike ?? false)
            for (const wire of wires) {
                wire.setStartNode(newNodeOut)
            }
        }
        for (const [node, wires] of outputNodes) {
            const orient = Orientation.invert(node.orient)
            const output = OutputDef.makeSpawned(this, `out_${node.shortName}`, 0, 0, orient)
            const newNodeIn = output.inputs.In[0]
            const [dx, dy] = offsets(newNodeIn, orient)
            output.setPosition(node.posX + dx * 2 * GRID_STEP, node.posY + dy * 2 * GRID_STEP, false)
            output.doSetName(node.shortName)
            for (const wire of wires) {
                wire.setEndNode(newNodeIn)
            }

        }
    }

    // Workarounds

    public newPositionAlloc(first: number, inc: number, numCols: number) {
        return new WirePositionAllocation(first, inc, numCols)
    }

    public newPosMaker(scaledHalfWidth: number, scaledHalfHeight: number) {
        return new XRayPosMaker(scaledHalfWidth, scaledHalfHeight)
    }
}


type AllocatorSpan = [from: number, to: number]

export class WireColumnAllocator {

    private _usedSegmentsByColumn: Array<Array<AllocatorSpan>> = []
    private _startSearchingAt: number = 0

    public constructor(
        public readonly monotonic: boolean = true,
    ) { }

    public get numColumns() {
        return this._usedSegmentsByColumn.length
    }

    public allocate(spanStart: number, spanEnd: number): number {
        const i = (() => {
            const newSpan: AllocatorSpan = spanStart > spanEnd ? [spanEnd, spanStart] : [spanStart, spanEnd]
            const margin = WIRE_WIDTH

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
        console.log(`WireColumnAllocator dump:`)
        for (let i = 0; i < this.numColumns; i++) {
            const sortedSpans = [...this._usedSegmentsByColumn[i]].sort((a, b) => a[0] - b[0])
            console.log(`  Col ${i}: ${sortedSpans.map(s => s.join("-")).join(", ")}`)
        }
    }

}

function spansOverlap(s1: AllocatorSpan, s2: AllocatorSpan, margin: number) {
    return s1[0] - margin < s2[1] && s2[0] - margin < s1[1]
}