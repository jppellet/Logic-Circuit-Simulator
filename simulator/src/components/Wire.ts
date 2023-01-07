import { Bezier, Offset } from "bezier-js"
import * as t from "io-ts"
import { colorForBoolean, COLOR_MOUSE_OVER, COLOR_UNKNOWN, COLOR_WIRE, dist, drawStraightWireLine, drawWaypoint, isOverWaypoint, strokeAsWireLine, WAYPOINT_DIAMETER, WIRE_WIDTH } from "../drawutils"
import { span, style, title } from "../htmlgen"
import { DrawParams, LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { Timestamp } from "../Timeline"
import { isDefined, isNotNull, isNull, isUndefined, LogicValue, Mode, typeOrUndefined } from "../utils"
import { NodeGroup, NodeID } from "./Component"
import { ContextMenuData, Drawable, DrawableWithDraggablePosition, DrawableWithPosition, DrawContext, Orientation, Orientations_, PositionSupportRepr } from "./Drawable"
import { Node, NodeIn, NodeOut, WireColor } from "./Node"

export type WaypointRepr = t.TypeOf<typeof Waypoint.Repr>

export class Waypoint extends DrawableWithDraggablePosition {

    static get Repr() {
        return t.union([
            t.tuple([t.number, t.number, t.keyof(Orientations_)]), // alternative with more fields first
            t.tuple([t.number, t.number]),
        ], "Wire")
    }

    static toSuperRepr(saved: WaypointRepr | null): PositionSupportRepr | null {
        if (isNull(saved)) {
            return null
        }
        return {
            pos: [saved[0], saved[1]],
            orient: saved[2],
            ref: undefined,
        }
    }

    constructor(
        editor: LogicEditor,
        savedData: WaypointRepr | null,
        public readonly parent: Wire,
    ) {
        super(editor, Waypoint.toSuperRepr(savedData))
    }

    toJSON(): WaypointRepr {
        if (this.orient === Orientation.default) {
            return [this.posX, this.posY]
        } else {
            return [this.posX, this.posY, this.orient]
        }
    }

    get unrotatedWidth(): number {
        return WAYPOINT_DIAMETER
    }

    get unrotatedHeight(): number {
        return WAYPOINT_DIAMETER
    }

    public override isOver(x: number, y: number) {
        return this.editor.mode >= Mode.CONNECT && isOverWaypoint(x, y, this.posX, this.posY)
    }

    override get cursorWhenMouseover() {
        return "grab"
    }

    public getPrevAndNextAnchors(): [DrawableWithPosition, DrawableWithPosition] {
        const waypoints = this.parent.waypoints
        const index = waypoints.indexOf(this)
        const prev = index > 0 ? waypoints[index - 1] : this.parent.startNode
        const next = index < waypoints.length - 1 ? waypoints[index + 1] : (this.parent.endNode ?? this.parent.startNode)
        return [prev, next]
    }

    public removeFromParent() {
        this.parent.removeWaypoint(this)
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext): void {
        if (this.editor.mode < Mode.CONNECT) {
            return
        }

        const neutral = this.editor.options.hideWireColors
        drawWaypoint(g, ctx, this.posX, this.posY, this.parent.startNode.value, ctx.isMouseOver, neutral, false, false, false)
    }

    override mouseDown(e: MouseEvent | TouchEvent) {
        if (this.editor.mode >= Mode.CONNECT) {
            this.tryStartMoving(e)
        }
        return { lockMouseOver: true }
    }

    override mouseDragged(e: MouseEvent | TouchEvent) {
        if (this.editor.mode >= Mode.CONNECT) {
            this.updateWhileMoving(e)
        }
    }

    override mouseUp(__: MouseEvent | TouchEvent) {
        this.tryStopMoving()
    }

    public override makeContextMenu(): ContextMenuData {
        return [
            this.makeChangeOrientationContextMenuItem(),
            ContextMenuData.sep(),
            ContextMenuData.item("trash", "Supprimer", () => {
                this.removeFromParent()
            }, true),
        ]
    }
}

export const WireStyles = {
    auto: "auto",
    straight: "straight",
    bezier: "bezier",
} as const

export type WireStyle = keyof typeof WireStyles

export type WireRepr = t.TypeOf<typeof Wire.Repr>

export class Wire extends Drawable {

    static get Repr() {
        return t.union([
            t.tuple([
                NodeID, NodeID,
                t.type({
                    ref: typeOrUndefined(t.string),
                    via: typeOrUndefined(t.array(Waypoint.Repr)),
                    propagationDelay: typeOrUndefined(t.number),
                    style: typeOrUndefined(t.keyof(WireStyles)),
                }),
            ]), // alternative with more fields first
            t.tuple([NodeID, NodeID]),
        ], "Wire")
    }

    private _endNode: NodeIn | null = null
    private _waypoints: Waypoint[] = []
    private _propagatingValues: [LogicValue, Timestamp][] = []
    private _style: WireStyle | undefined = undefined
    public customPropagationDelay: number | undefined = undefined
    public ribbon: Ribbon | undefined = undefined

    constructor(
        private _startNode: Node // not NodeOut since we can start from the end
    ) {
        super(_startNode.editor)
        const editor = _startNode.editor
        const longAgo = -1 - editor.options.propagationDelay // make sure it is fully propagated no matter what
        this._propagatingValues.push([_startNode.value, longAgo])
    }

    toJSON(): WireRepr {
        const endID = this._endNode?.id ?? -1
        if (this._waypoints.length === 0 && isUndefined(this.customPropagationDelay) && isUndefined(this.ref) && isUndefined(this.style)) {
            // no need for node options
            return [this._startNode.id, endID]

        } else {
            // add node options
            const waypoints = this._waypoints.map(w => w.toJSON())
            return [this._startNode.id, endID, {
                ref: this.ref,
                via: (waypoints.length === 0) ? undefined : waypoints,
                propagationDelay: this.customPropagationDelay,
                style: this.style,
            }]
        }
    }

    public get startNode(): Node {
        return this._startNode
    }

    public get endNode(): NodeIn | null {
        return this._endNode
    }

    public isInRect(__rect: DOMRect) {
        return false
    }

    public get waypoints(): readonly Waypoint[] {
        return this._waypoints
    }

    public setWaypoints(reprs: WaypointRepr[]) {
        this._waypoints = reprs.map(repr => new Waypoint(this.editor, repr, this))
    }

    public get style() {
        return this._style
    }

    public doSetStyle(style: WireStyle | undefined) {
        this._style = style
        this.setNeedsRedraw("style changed")
    }

    public setSecondNode(secondNode: Node | null) {
        // not the same as setting endNode; this may change startNode as well
        // if we need to reverse input and output

        if (!secondNode) {
            return
        }
        if (!Node.isOutput(secondNode)) {
            if (!Node.isOutput(this._startNode)) {
                console.log("WARN connecting two input nodes")
                return
            }
            this._endNode = secondNode

        } else {
            if (Node.isOutput(this._startNode)) {
                console.log("WARN connecting two output nodes")
                return
            }

            // switch nodes
            const tempNode = this._startNode
            this._startNode = secondNode
            this._endNode = tempNode
            const longAgo = -1 - (this.customPropagationDelay ?? this.editor.options.propagationDelay)
            this._propagatingValues = [[secondNode.value, longAgo]]
        }

        this._startNode.addOutgoingWire(this)
        this._endNode.incomingWire = this
        this._endNode.value = this.startNode.value
        this._endNode.doSetColor(this._startNode.color)
    }

    propageNewValue(newValue: LogicValue, now: Timestamp) {
        if (this._propagatingValues[this._propagatingValues.length - 1][0] !== newValue) {
            this._propagatingValues.push([newValue, now])
        }
    }

    destroy() {
        if (Node.isOutput(this._startNode)) {
            this._startNode.removeOutgoingWire(this)
        }
        if (isNotNull(this._endNode)) {
            this._endNode.incomingWire = null
        }
        // for (const waypoint of this._waypoints) {
        //     waypoint.destroy()
        // }
    }

    get isAlive() {
        // the start node should be alive and the end node
        // should either be null (wire being drawn) or alive
        // (wire set) for the wire to be alive
        return this.startNode.isAlive &&
            (isNull(this.endNode) || this.endNode.isAlive)
    }

    public addWaypoint(e: MouseEvent | TouchEvent) {
        const [x, y] = this.editor.offsetXYForContextMenu(e)
        let coordData = this.indexOfNextWaypointIfMouseover(x, y)
        if (isUndefined(coordData)) {
            // shouldn't happen since we're calling this form a context menu
            // which was invoked when we were in a mouseover state
            coordData = [
                0,
                [this.startNode.posX, this.startNode.posY],
                [this.endNode?.posX ?? this.startNode.posX + 20, this.endNode?.posY ?? this.startNode.posY + 20],
            ]
        }

        // determine inial direction
        const [i, [startX, startY], [endX, endY]] = coordData
        const deltaX = endX - startX
        const deltaY = endY - startY
        let orient: Orientation
        if (Math.abs(deltaX) >= Math.abs(deltaY)) {
            // initial orientation will be horizontal
            if (endX >= startX) {
                orient = "e"
            } else {
                orient = "w"
            }
        } else {
            // initial orientation will be vertical
            if (endY >= startY) {
                orient = "s"
            } else {
                orient = "n"
            }
        }

        const waypoint = new Waypoint(this.editor, [x, y, orient], this)
        this._waypoints.splice(i, 0, waypoint)
    }

    public removeWaypoint(waypoint: Waypoint) {
        const i = this._waypoints.indexOf(waypoint)
        if (i !== -1) {
            this._waypoints.splice(i, 1)
            this.setNeedsRedraw("waypoint deleted")
        }
    }

    private prunePropagatingValues(now: Timestamp, propagationDelay: number): LogicValue {
        // first, prune obsolete values if needed
        let removeBefore = 0
        for (let i = 1; i < this._propagatingValues.length; i++) {
            if (now >= this._propagatingValues[i][1] + propagationDelay) {
                // item i has fully propagated
                removeBefore = i
            } else {
                // item i is still propagating
                break
            }
        }
        if (removeBefore > 0) {
            this._propagatingValues.splice(0, removeBefore)
        }
        return this._propagatingValues[0][0]
    }

    doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        // this has to be checked _before_ we prune the list,
        // otherwise we won't get a chance to have a next animation frame
        // and to run the pending updates created by possibly setting
        // the value of the end node
        const isAnimating = this._propagatingValues.length > 1

        const options = this.editor.options
        const propagationDelay = this.customPropagationDelay ?? options.propagationDelay
        const neutral = options.hideWireColors
        const drawTime = ctx.drawParams.drawTime
        const wireValue = this.prunePropagatingValues(drawTime, propagationDelay)

        if (isNull(this.endNode)) {
            // draw to mouse position
            drawStraightWireLine(g, this.startNode.posX, this.startNode.posY, this.editor.mouseX, this.editor.mouseY, wireValue, this._startNode.color, neutral)

        } else {
            this.endNode.value = wireValue

            let prevX = this.startNode.posX
            let prevY = this.startNode.posY
            let prevProlong = this.startNode.wireProlongDirection
            const lastWaypointData = { posX: this.endNode.posX, posY: this.endNode.posY, orient: this.endNode.wireProlongDirection }
            const allWaypoints = [...this._waypoints, lastWaypointData]
            let svgPathDesc = "M" + prevX + " " + prevY + " "
            const wireStyle = this.style ?? this.startNode.editor.options.wireStyle
            for (let i = 0; i < allWaypoints.length; i++) {
                const waypoint = allWaypoints[i]
                const nextX = waypoint.posX
                const nextY = waypoint.posY
                const deltaX = nextX - prevX
                const deltaY = nextY - prevY
                const nextProlong = waypoint.orient
                let x, y, x1, y1
                if (wireStyle === WireStyles.straight || (wireStyle === WireStyles.auto && (prevX === nextX || prevY === nextY))) {
                    // straight line
                    if (i === 0) {
                        [x, y] = bezierAnchorForWire(prevProlong, prevX, prevY, -WIRE_WIDTH / 2, -WIRE_WIDTH / 2)
                        svgPathDesc += "M" + x + " " + y + " "
                        svgPathDesc += "L" + prevX + " " + prevY + " "
                    }
                    svgPathDesc += "L" + nextX + " " + nextY + " "
                    if (i === allWaypoints.length - 1) {
                        [x, y] = bezierAnchorForWire(nextProlong, nextX, nextY, -WIRE_WIDTH / 2, -WIRE_WIDTH / 2)
                        svgPathDesc += "L" + x + " " + y + " "
                    }
                } else {
                    // bezier curve
                    const bezierAnchorPointDistX = Math.max(25, Math.abs(deltaX) / 3)
                    const bezierAnchorPointDistY = Math.max(25, Math.abs(deltaY) / 3);

                    // first anchor point
                    [x, y] = bezierAnchorForWire(prevProlong, prevX, prevY, bezierAnchorPointDistX, bezierAnchorPointDistY);
                    [x1, y1] = bezierAnchorForWire(nextProlong, nextX, nextY, bezierAnchorPointDistX, bezierAnchorPointDistY)
                    svgPathDesc += "C" + x + " " + y + "," + x1 + " " + y1 + "," + nextX + " " + nextY + " "
                }

                prevX = nextX
                prevY = nextY
                prevProlong = Orientation.invert(nextProlong)
            }

            const totalLength = this.editor.lengthOfPath(svgPathDesc)
            const path = new Path2D(svgPathDesc) // TODO cache this?

            const drawParams = ctx.drawParams
            if (isDefined(drawParams.highlightColor) && (drawParams.highlightedItems?.wires.includes(this) ?? false)) {
                g.lineWidth = 15
                g.shadowColor = drawParams.highlightColor
                g.shadowBlur = 20
                g.shadowOffsetX = 0
                g.shadowOffsetY = 0
                g.strokeStyle = g.shadowColor
                g.stroke(path)
                g.shadowBlur = 0 // reset
            }

            const old = g.getLineDash()
            for (const [value, timeSet] of this._propagatingValues) {
                const frac = Math.min(1.0, (drawTime - timeSet) / propagationDelay)
                const lengthToDraw = totalLength * frac
                g.setLineDash([lengthToDraw, totalLength])
                strokeAsWireLine(g, value, this._startNode.color, ctx.isMouseOver, neutral, path)
            }
            g.setLineDash(old)

            if (isAnimating) {
                this.setNeedsRedraw("propagating value")
            }
        }
    }

    isOver(x: number, y: number): boolean {
        if (this.editor.mode < Mode.CONNECT || !this.startNode.isAlive || !this.endNode || !this.endNode.isAlive) {
            return false
        }
        return isDefined(this.indexOfNextWaypointIfMouseover(x, y))
    }

    private indexOfNextWaypointIfMouseover(x: number, y: number): undefined | [number, [number, number], [number, number]] {
        if (!this.endNode) {
            return undefined
        }
        const waypoints: DrawableWithPosition[] = [this.startNode, ...this._waypoints, this.endNode]
        const tol = WIRE_WIDTH / (10 * 2)
        for (let i = 0; i < waypoints.length - 1; i++) {
            const startX = waypoints[i].posX
            const startY = waypoints[i].posY
            const endX = waypoints[i + 1].posX
            const endY = waypoints[i + 1].posY
            const sumDist = dist(startX, startY, x, y) + dist(endX, endY, x, y)
            const wireLength = dist(startX, startY, endX, endY)
            // TODO use isPointInStroke instead to account for bezier paths
            if (sumDist >= wireLength - tol && sumDist <= wireLength + tol) {
                return [i, [startX, startY], [endX, endY]]
            }
        }
        return undefined
    }

    public override makeContextMenu(): ContextMenuData {

        const s = S.Components.Wire.contextMenu
        const currentPropDelayStr = isUndefined(this.customPropagationDelay) ? "" : ` (${this.customPropagationDelay} ms)`

        const makeItemUseColor = (desc: string, color: WireColor) => {
            const isCurrent = this._startNode.color === color
            const icon = isCurrent ? "check" : "none"
            const action = isCurrent ? () => undefined : () => this._startNode.doSetColor(color)
            const cssColor = COLOR_WIRE[color]
            return ContextMenuData.item(icon, span(title(desc), style(`display: inline-block; width: 140px; height: ${WIRE_WIDTH}px; background-color: ${cssColor}; margin-right: 8px`)), action)
        }


        const makeItemDisplayStyle = (desc: string, style: WireStyle | undefined) => {
            const isCurrent = this.style === style
            const icon = isCurrent ? "check" : "none"
            const action = isCurrent ? () => undefined : () => this.doSetStyle(style)
            return ContextMenuData.item(icon, desc, action)
        }


        const setWireOptionsItems =
            this.editor.mode < Mode.DESIGN ? [] : [
                ContextMenuData.sep(),
                ContextMenuData.item("timer", s.CustomPropagationDelay.expand({ current: currentPropDelayStr }), (__itemEvent) => {
                    const currentStr = isUndefined(this.customPropagationDelay) ? "" : String(this.customPropagationDelay)
                    const defaultDelay = String(this.editor.options.propagationDelay)
                    const message = s.CustomPropagationDelayDesc.expand({ current: defaultDelay })
                    const newValueStr = prompt(message, currentStr)
                    if (newValueStr !== null) {
                        if (newValueStr === "") {
                            this.customPropagationDelay = undefined
                        } else {
                            const asInt = parseInt(newValueStr)
                            if (!isNaN(asInt)) {
                                this.customPropagationDelay = asInt
                            }
                        }
                    }
                }),
                ContextMenuData.submenu("palette", "Couleur du fil", [
                    makeItemUseColor("Noir (standard)", WireColor.black),
                    makeItemUseColor("Rouge", WireColor.red),
                    makeItemUseColor("Bleu", WireColor.blue),
                    makeItemUseColor("Jaune", WireColor.yellow),
                    makeItemUseColor("Vert", WireColor.green),
                    makeItemUseColor("Blanc", WireColor.white),
                ]),
                ContextMenuData.submenu("wirestyle", "Style", [
                    makeItemDisplayStyle("Par défaut", undefined),
                    ContextMenuData.sep(),
                    makeItemDisplayStyle("Automatique", WireStyles.auto),
                    makeItemDisplayStyle("Ligne droite", WireStyles.straight),
                    makeItemDisplayStyle("Courbe", WireStyles.bezier),
                ]),
            ]

        const setRefItems =
            this.editor.mode < Mode.FULL ? [] : [
                ContextMenuData.sep(),
                this.makeSetRefContextMenuItem(),
            ]

        return [
            ContextMenuData.item("add", "Ajouter point intermédiaire", (__itemEvent, contextEvent) => {
                this.addWaypoint(contextEvent)
            }),
            ...setWireOptionsItems,
            ...setRefItems,
            ContextMenuData.sep(),
            ContextMenuData.item("trash", "Supprimer", () => {
                this.editor.wireMgr.deleteWire(this)
            }, true),
        ]
    }

}

function bezierAnchorForWire(wireProlongDirection: Orientation, x: number, y: number, distX: number, distY: number): [number, number] {
    switch (wireProlongDirection) {
        case "e": // going east, so anchor point is before on X
            return [x - distX, y]
        case "w": // going west, so anchor point is after on X
            return [x + distX, y]
        case "s":// going south, so anchor point is before on Y
            return [x, y - distY]
        case "n":// going north, so anchor point is after on Y
            return [x, y + distY]
    }
}

export class Ribbon extends Drawable {

    private _startGroupStartIndex = Number.MAX_SAFE_INTEGER
    private _startGroupEndIndex = Number.MIN_SAFE_INTEGER
    private _endGroupStartIndex = Number.MAX_SAFE_INTEGER
    private _endGroupEndIndex = Number.MIN_SAFE_INTEGER
    private _coveredWires: Wire[] = []
    // private _startNodes: NodeOut[] = []
    // private _endNodes: NodeIn[] = []

    constructor(editor: LogicEditor,
        public readonly startNodeGroup: NodeGroup<NodeOut>,
        public readonly endNodeGroup: NodeGroup<NodeIn>,
    ) {
        super(editor)
    }

    isEmpty() {
        return this._coveredWires.length === 0
    }

    addCoveredWire(wire: Wire, newNodeGroupStartIndex: number, newNodeGroupEndIndex: number) {
        this._coveredWires.push(wire)
        this.updateIndices(newNodeGroupStartIndex, newNodeGroupEndIndex)
    }

    wireWasDeleted(wire: Wire) {
        // TODO check ribbons here
        // const index = this._coveredWires.indexOf(wire)
        // if (index >= 0) {
        //     this._coveredWires.splice(index, 1)
        // }
        // // remove start node
        // const startNode = wire.startNode as any
        // const startNodeIndex = this._startNodes.indexOf(startNode)
        // if (startNodeIndex >= 0) {
        //     this._startNodes.splice(startNodeIndex, 1)
        // }
        // // remove end node
        // const endNode = wire.endNode as any
        // const endNodeIndex = this._endNodes.indexOf(endNode)
        // if (endNodeIndex >= 0) {
        //     this._endNodes.splice(endNodeIndex, 1)
        // }
        // // recalculate start and end group indices
        // this._startGroupStartIndex = Number.MAX_SAFE_INTEGER
        // this._startGroupEndIndex = Number.MIN_SAFE_INTEGER
        // this._endGroupStartIndex = Number.MAX_SAFE_INTEGER
        // this._endGroupEndIndex = Number.MIN_SAFE_INTEGER
        // for (const coveredWire of this._coveredWires) {

        //     this.updateIndices(coveredWire)
        // }
    }

    private updateIndices(newNodeGroupStartIndex: number, newNodeGroupEndIndex: number) {
        this._startGroupStartIndex = Math.min(this._startGroupStartIndex, newNodeGroupStartIndex)
        this._startGroupEndIndex = Math.max(this._startGroupEndIndex, newNodeGroupStartIndex)
        this._endGroupStartIndex = Math.min(this._endGroupStartIndex, newNodeGroupEndIndex)
        this._endGroupEndIndex = Math.max(this._endGroupEndIndex, newNodeGroupEndIndex)
    }


    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext): void {
        const [[startX, startY], startOrient] = this.drawRibbonEnd(g, ctx, this.startNodeGroup, this._startGroupStartIndex, this._startGroupEndIndex)
        const [[endX, endY], endOrient] = this.drawRibbonEnd(g, ctx, this.endNodeGroup, this._endGroupStartIndex, this._endGroupEndIndex)

        const deltaX = endX - startX
        const deltaY = endY - startY
        // bezier curve
        const bezierAnchorPointDistX = Math.max(25, Math.abs(deltaX) / 3)
        const bezierAnchorPointDistY = Math.max(25, Math.abs(deltaY) / 3)

        // first anchor point
        const [anchor1X, anchor1Y] = bezierAnchorForWire(Orientation.invert(startOrient), startX, startY, bezierAnchorPointDistX, bezierAnchorPointDistY)
        const [anchor2X, anchor2Y] = bezierAnchorForWire(Orientation.invert(endOrient), endX, endY, bezierAnchorPointDistX, bezierAnchorPointDistY)

        const b = new Bezier(startX, startY, anchor1X, anchor1Y, anchor2X, anchor2Y, endX, endY)

        const values: LogicValue[] = []
        for (let i = this._startGroupStartIndex; i <= this._startGroupEndIndex; i++) {
            values.push(this.startNodeGroup.nodes[i].value)
        }
        this.strokeWireBezier(g, b, values, WireColor.black, ctx.isMouseOver, false)
    }

    private strokeWireBezier(g: CanvasRenderingContext2D, b: Bezier, values: LogicValue[], color: WireColor, isMouseOver: boolean, neutral: boolean) {
        const numWires = values.length

        const WIRE_MARGIN_OUTER = (numWires === 1) ? 1 : (numWires <= 4 || numWires > 8) ? 2 : 3
        const WIRE_MARGIN_INNER = 1
        const WIRE_WIDTH = (numWires <= 8) ? 2 : 1

        if (numWires === 0) {
            return
        }

        const totalWidth = 2 * WIRE_MARGIN_OUTER + numWires * WIRE_WIDTH + (numWires - 1) * WIRE_MARGIN_INNER

        const addBezierToPath = (b: Bezier) => {
            const [p0, a0, a1, p1] = b.points
            g.moveTo(p0.x, p0.y)
            g.bezierCurveTo(a0.x, a0.y, a1.x, a1.y, p1.x, p1.y)
        }

        const drawBezier = (b: Bezier) => {
            g.beginPath()
            addBezierToPath(b)
            g.stroke()
        }

        const drawBeziers = (bs: Offset | Bezier[]) => {
            if (Array.isArray(bs)) {
                g.beginPath()
                for (const bb of bs) {
                    addBezierToPath(bb)
                }
                g.stroke()
            }
        }

        const oldLineCap = g.lineCap
        g.lineCap = "butt"

        // margin
        if (isMouseOver) {
            g.lineWidth = totalWidth + 2
            g.strokeStyle = COLOR_MOUSE_OVER
            drawBezier(b)
            g.lineWidth = totalWidth - 2 * WIRE_MARGIN_OUTER
        } else {
            g.lineWidth = totalWidth
        }

        g.strokeStyle = COLOR_WIRE[color]
        drawBezier(b)

        g.lineWidth = WIRE_WIDTH
        let dist = -((numWires - 1) / 2) * (WIRE_WIDTH + WIRE_MARGIN_INNER)
        for (const value of values) {
            g.strokeStyle = neutral ? COLOR_UNKNOWN : colorForBoolean(value)
            const b1 = b.offset(dist)
            drawBeziers(b1)
            dist += WIRE_WIDTH + WIRE_MARGIN_INNER
        }

        // restore
        g.lineCap = oldLineCap
    }

    private drawRibbonEnd(g: CanvasRenderingContext2D, ctx: DrawContext, nodeGroup: NodeGroup<Node>, startIndex: number, endIndex: number): [readonly [number, number], Orientation] {
        const nodes = nodeGroup.nodes
        const orient = nodes[startIndex].orient
        const numNodes = endIndex - startIndex + 1

        let minX = Number.POSITIVE_INFINITY
        let minY = Number.POSITIVE_INFINITY
        let maxX = Number.NEGATIVE_INFINITY
        let maxY = Number.NEGATIVE_INFINITY
        let sumX = 0
        let sumY = 0
        for (let i = startIndex; i <= endIndex; i++) {
            const node = nodes[i]
            const x = node.posX
            const y = node.posY
            minX = Math.min(minX, x)
            minY = Math.min(minY, y)
            maxX = Math.max(maxX, x)
            maxY = Math.max(maxY, y)
            sumX += x
            sumY += y
        }

        const [[startX, startY], [endX, endY], mid] = (() => {
            switch (orient) {
                case "e": return [[maxX, minY], [maxX, maxY], [maxX, sumY / numNodes]] as const
                case "w": return [[minX, minY], [minX, maxY], [minX, sumY / numNodes]] as const
                case "s": return [[minX, minY], [maxX, minY], [sumX / numNodes, minY]] as const
                case "n": return [[minX, maxY], [maxX, maxY], [sumX / numNodes, maxY]] as const
            }
        })()

        drawStraightWireLine(g, startX, startY, endX, endY, "Z", "black", true)
        return [mid, orient]
    }


    public isOver(x: number, y: number): boolean {
        return false // TODO
    }
    public isInRect(rect: DOMRect): boolean {
        return false // TODO
    }

}


export class WireManager {

    public readonly editor: LogicEditor
    private readonly _wires: Wire[] = []
    private readonly _ribbons: Ribbon[] = []
    private _wireBeingAdded: Wire | undefined = undefined

    constructor(editor: LogicEditor) {
        this.editor = editor
    }

    public get wires(): readonly Wire[] {
        return this._wires
    }

    public get ribbons(): readonly Ribbon[] {
        return this._ribbons
    }

    public get isAddingWire() {
        return isDefined(this._wireBeingAdded)
    }

    draw(g: CanvasRenderingContext2D, drawParams: DrawParams) {
        this.removeDeadWires()
        const useRibbons = this.editor.options.groupParallelWires
        if (useRibbons) {
            for (const ribbon of this._ribbons) {
                ribbon.draw(g, drawParams)
            }
        }
        for (const wire of this._wires) {
            if (useRibbons && isDefined(wire.ribbon)) {
                continue
            }
            wire.draw(g, drawParams)
            for (const waypoint of wire.waypoints) {
                waypoint.draw(g, drawParams)
            }
        }

    }

    private removeDeadWires() {
        let i = 0
        while (i < this._wires.length) {
            const wire = this._wires[i]
            if (!wire.isAlive) {
                wire.destroy()
                this._wires.splice(i, 1)
            } else {
                i++
            }
        }
    }

    addNode(newNode: Node): Wire | undefined {
        let completedWire: Wire | undefined = undefined
        if (!this.isAddingWire) {
            // start drawing a new wire
            const wire = new Wire(newNode)
            this._wires.push(wire)
            this._wireBeingAdded = wire
            this.editor.setToolCursor("crosshair")

        } else {
            // complete the new wire
            const currentWireIndex = this._wires.length - 1
            const currentWire = this._wires[currentWireIndex]
            let created = false
            if (newNode !== currentWire.startNode) {
                if (currentWire.startNode.isOutput !== newNode.isOutput && newNode.acceptsMoreConnections) {
                    // normal, create
                    currentWire.setSecondNode(newNode)
                    created = true
                } else if (!Node.isOutput(newNode)) {
                    const otherStartNode = newNode.incomingWire?.startNode
                    if (isDefined(otherStartNode)
                        && otherStartNode.acceptsMoreConnections
                        && otherStartNode.isOutput !== currentWire.startNode.isOutput) {
                        // create new connection with other end of this node
                        currentWire.setSecondNode(otherStartNode)
                        created = true
                    }
                }
            }

            if (!created) {
                delete this._wires[currentWireIndex]
                this._wires.length--
            } else {
                completedWire = currentWire
                this.tryMergeWire(completedWire)
                this.editor.setDirty("added wire")
            }

            this._wireBeingAdded = undefined
            this.editor.setToolCursor(null)
        }
        this.editor.redrawMgr.addReason("started or stopped wire", null)
        return completedWire
    }

    private tryMergeWire(wire: Wire) {
        const startNode = wire.startNode
        const endNode = wire.endNode
        if (endNode === null || !(startNode instanceof NodeOut)) {
            return
        }

        const startGroup = startNode.group
        const endGroup = endNode.group
        if (isUndefined(startGroup) || isUndefined(endGroup)) {
            return
        }

        const findWire = (group1: NodeGroup<NodeOut>, i1: number, group2: NodeGroup<NodeIn>, i2: number): Wire | undefined => {
            if (i1 < 0 || i2 < 0 || i1 >= group1.nodes.length || i2 >= group2.nodes.length) {
                return undefined
            }
            return group1.nodes[i1].findWireTo(group2.nodes[i2])
        }

        const indexStart = startGroup.nodes.indexOf(startNode)
        const indexEnd = endGroup.nodes.indexOf(endNode)

        const wireBefore = findWire(startGroup, indexStart - 1, endGroup, indexEnd - 1)
        if (isDefined(wireBefore)) {
            let ribbon = wireBefore.ribbon
            if (isUndefined(ribbon)) {
                ribbon = new Ribbon(startNode.editor, startGroup, endGroup)
                this._ribbons.push(ribbon) // TODO determine when we must remove them
                wireBefore.ribbon = ribbon
                ribbon.addCoveredWire(wireBefore, indexStart - 1, indexEnd - 1)
            }
            ribbon.addCoveredWire(wire, indexStart, indexEnd)
            wire.ribbon = ribbon
        }

        // TODO merge after, too!

        // if (isDefined(wireAfter)) {
        //     console.log("we have a wire after")
        // }


        // const wireAfter = findWire(startGroup, indexStart + 1, endGroup, indexEnd + 1)
    }

    deleteWire(wire: Wire) {
        // TODO check in ribbon
        wire.destroy()
        const ribbon = wire.ribbon
        if (isDefined(ribbon)) {
            ribbon.wireWasDeleted(wire)
            if (ribbon.isEmpty()) {
                this._ribbons.splice(this._ribbons.indexOf(ribbon), 1)
            }
        }
        // remove wire from array
        this._wires.splice(this._wires.indexOf(wire), 1)
        this.editor.redrawMgr.addReason("deleted wire", null)
    }

    clearAllWires() {
        // TODO clear ribbons
        for (const wire of this._wires) {
            wire.destroy()
        }
        this._wires.splice(0, this._wires.length)
        this.editor.redrawMgr.addReason("deleted wires", null)
    }

    tryCancelWire() {
        const wireBeingAdded = this._wireBeingAdded
        if (isDefined(wireBeingAdded)) {
            // adding the start node as end node to trigger deletion
            this.addNode(wireBeingAdded.startNode)
        }
    }

}
