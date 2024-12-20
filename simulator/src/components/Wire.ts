import { Bezier, Offset } from "bezier-js"
import * as t from "io-ts"
import { COLOR_ANCHOR_NEW, COLOR_MOUSE_OVER, COLOR_UNKNOWN, COLOR_WIRE, GRID_STEP, NodeStyle, WAYPOINT_DIAMETER, WIRE_WIDTH, colorForLogicValue, dist, drawAnchorTo, drawStraightWireLine, drawWaypoint, isOverWaypoint, strokeWireOutline, strokeWireOutlineAndSingleValue, strokeWireValue } from "../drawutils"
import { span, style, title } from "../htmlgen"
import { DrawParams } from "../LogicEditor"
import { S } from "../strings"
import { Timestamp } from "../Timeline"
import { InteractionResult, LogicValue, Mode, isArray, toLogicValueRepr, typeOrUndefined } from "../utils"
import { Component, NodeGroup } from "./Component"
import { DrawContext, Drawable, DrawableParent, DrawableWithDraggablePosition, DrawableWithPosition, GraphicsRendering, MenuData, Orientation, Orientations_, PositionSupportRepr } from "./Drawable"
import { Node, NodeIn, NodeOut, WireColor, tryMakeRepeatableNodeAction } from "./Node"
import { Passthrough, PassthroughDef } from "./Passthrough"


type WaypointRepr = t.TypeOf<typeof Waypoint.Repr>

export class Waypoint extends DrawableWithDraggablePosition {

    public static get Repr() {
        return t.union([
            // alternatives with more fields first
            t.tuple([t.number, t.number, t.keyof(Orientations_), t.partial({ lockPos: t.boolean, anchor: t.string })]),
            t.tuple([t.number, t.number, t.keyof(Orientations_)]),
            t.tuple([t.number, t.number]),
        ], "Wire")
    }

    public static toSuperRepr(saved?: WaypointRepr | undefined): PositionSupportRepr | undefined {
        if (saved === undefined) {
            return undefined
        }
        return {
            pos: [saved[0], saved[1]],
            anchor: saved[3]?.anchor,
            lockPos: saved[3]?.lockPos,
            orient: saved[2],
            ref: undefined,
        }
    }

    public constructor(
        public readonly wire: Wire,
        saved: WaypointRepr | undefined,
    ) {
        super(wire.parent, Waypoint.toSuperRepr(saved))
    }

    public toJSON(): WaypointRepr {
        if (this.lockPos || this.anchor !== undefined) {
            return [this.posX, this.posY, this.orient, {
                lockPos: this.lockPos === false ? undefined : this.lockPos,
                anchor: this.anchor?.ref,
            }]
        }
        if (this.orient !== Orientation.default) {
            return [this.posX, this.posY, this.orient]
        }
        return [this.posX, this.posY]
    }

    public get unrotatedWidth(): number {
        return WAYPOINT_DIAMETER
    }

    public get unrotatedHeight(): number {
        return WAYPOINT_DIAMETER
    }

    public override isOver(x: number, y: number) {
        return this.parent.mode >= Mode.CONNECT && isOverWaypoint(x, y, this.posX, this.posY)
    }

    public override cursorWhenMouseover(e?: MouseEvent | TouchEvent) {
        const mode = this.parent.mode
        if ((e?.ctrlKey ?? false) && mode >= Mode.CONNECT) {
            return "context-menu"
        }
        if (!this.lockPos && mode >= Mode.CONNECT) {
            return "grab"
        }
        return undefined
    }

    public getPrevAndNextAnchors(): [DrawableWithPosition, DrawableWithPosition] {
        const waypoints = this.wire.waypoints
        const index = waypoints.indexOf(this)
        const prev = index > 0 ? waypoints[index - 1] : this.wire.startNode
        const next = index < waypoints.length - 1 ? waypoints[index + 1] : (this.wire.endNode ?? this.wire.startNode)
        return [prev, next]
    }

    public removeFromParent() {
        this.wire.removeWaypoint(this)
    }

    protected doDraw(g: GraphicsRendering, ctx: DrawContext): void {
        if (this.parent.mode < Mode.CONNECT) {
            return
        }

        const neutral = this.parent.editor.options.hideWireColors
        drawWaypoint(g, ctx, this.posX, this.posY, NodeStyle.WAYPOINT, this.wire.startNode.value, ctx.isMouseOver, neutral, false, false, false)
    }

    public override makeContextMenu(): MenuData {
        return [
            ...this.makeOrientationAndPosMenuItems().map(it => it[1]),
            MenuData.sep(),
            MenuData.item("trash", S.Components.Generic.contextMenu.Delete, () => {
                this.removeFromParent()
            }, "⌫", true),
        ]
    }
}

export const WireStyles = {
    auto: "auto",
    straight: "straight",
    bezier: "bezier",
} as const

export type WireStyle = keyof typeof WireStyles

type WireRepr = t.TypeOf<typeof Wire.Repr>
type WireOptions = Exclude<WireRepr[2], undefined>

export class Wire extends Drawable {

    public static get Repr() {
        const simpleRepr = t.tuple([t.number, t.number])
        const fullRepr = t.tuple([
            t.number, t.number,
            // include an object specifying additional properties
            t.type({
                ref: typeOrUndefined(t.string),
                via: typeOrUndefined(t.array(Waypoint.Repr)),
                propagationDelay: typeOrUndefined(t.number),
                style: typeOrUndefined(t.keyof(WireStyles)),
                hidden: typeOrUndefined(t.boolean),
            }),
        ])
        return t.union([fullRepr, simpleRepr], "Wire")
    }

    private _startNode: NodeOut
    private _endNode: NodeIn
    private _waypoints: Waypoint[] = []
    private _style: WireStyle | undefined = undefined
    private _isHidden = false
    private _propagatingValues: [LogicValue, Timestamp][] = []
    private _waypointBeingDragged: Waypoint | undefined = undefined
    public customPropagationDelay: number | undefined = undefined
    public ribbon: Ribbon | undefined = undefined

    public constructor(startNode: NodeOut, endNode: NodeIn) {
        const parent = startNode.parent
        super(parent)

        this._startNode = startNode
        this._endNode = endNode

        const longAgo = Number.MIN_SAFE_INTEGER / 2
        this._propagatingValues.push([startNode.value, longAgo])

        this.setStartNode(startNode)
        this.setEndNode(endNode)
    }

    // called immediately after construction by Serialization
    public setOptions(wireOptions: WireOptions, componentsByRef: Record<string, Component>) {
        this.doSetValidatedId(wireOptions.ref)
        if (wireOptions.via !== undefined) {
            this.setWaypoints(wireOptions.via, componentsByRef)
        }
        if (wireOptions.propagationDelay !== undefined) {
            this.customPropagationDelay = wireOptions.propagationDelay
        }
        if (wireOptions.style !== undefined) {
            this.doSetStyle(wireOptions.style)
        }
        if (wireOptions.hidden !== undefined) {
            this.doSetHidden(wireOptions.hidden)
        }
    }

    public toJSON(): WireRepr {
        const endID = this._endNode.id
        if (this._waypoints.length === 0 && this.customPropagationDelay === undefined && this.ref === undefined && this.style === undefined && !this.isHidden) {
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
                hidden: this.isHidden === false ? undefined : this.isHidden,
            }]
        }
    }

    public get startNode(): NodeOut {
        return this._startNode
    }

    public get endNode(): NodeIn {
        return this._endNode
    }

    public isInRect(__rect: DOMRect) {
        return false
    }

    public get waypoints(): readonly Waypoint[] {
        return this._waypoints
    }

    public setWaypoints(reprs: WaypointRepr[], componentsByRef: Record<string, Component>) {
        this._waypoints = reprs.map(repr => {
            const wp = new Waypoint(this, repr)
            const anchorRef = repr[3]?.anchor
            if (anchorRef !== undefined) {
                const anchor = componentsByRef[anchorRef]
                if (anchor !== undefined) {
                    wp.anchor = anchor
                }
            }
            return wp
        })
    }

    public get style() {
        return this._style
    }

    public doSetStyle(style: WireStyle | undefined) {
        this._style = style
        this.setNeedsRedraw("style changed")
    }

    public get isHidden() {
        return this._isHidden
    }

    private get behavesHidden() {
        return this._isHidden && !this.parent.editor.options.showHiddenWires
    }

    public doSetHidden(hidden: boolean) {
        this._isHidden = hidden
        this.setNeedsRedraw("hidden changed")
    }

    public setStartNode(startNode: NodeOut, now?: Timestamp) {
        if (this._startNode !== undefined) {
            this._startNode.removeOutgoingWire(this)
        }

        this._startNode = startNode
        startNode.addOutgoingWire(this)

        if (now !== undefined) {
            this.propagateNewValue(this._startNode.value, now)
        }
    }

    public setEndNode(endNode: NodeIn) {
        if (this._endNode !== undefined) {
            this._endNode.incomingWire = null
        }
        this._endNode = endNode
        if (endNode.incomingWire !== null && endNode.incomingWire !== undefined) {
            console.warn(`Unexpectedly replacing existing incoming wire on node ${this._endNode.id}`)
        }
        endNode.incomingWire = this
        endNode.value = this._startNode.value
        endNode.doSetColor(this._startNode.color)
    }

    public propagateNewValue(newValue: LogicValue, logicalTime: Timestamp) {
        if (this._propagatingValues[this._propagatingValues.length - 1][0] !== newValue) {
            this._propagatingValues.push([newValue, logicalTime])
        }
        const propagationDelay = this.customPropagationDelay ?? this.parent.editor.options.propagationDelay
        if (propagationDelay === 0) {
            this.endNode.value = newValue
            // remove all but the last value
            this._propagatingValues.splice(0, this._propagatingValues.length - 1)
        } else {
            const desc = S.Components.Wire.timeline.PropagatingValue.expand({ val: toLogicValueRepr(newValue) })
            this.parent.editor.timeline.scheduleAt(logicalTime + propagationDelay, () => {
                this.endNode.value = newValue
            }, desc, false)
        }
    }

    public destroy() {
        if (Node.isOutput(this._startNode)) {
            this._startNode.removeOutgoingWire(this)
        }
        if (this._endNode !== null) {
            this._endNode.incomingWire = null
        }
        // for (const waypoint of this._waypoints) {
        //     waypoint.destroy()
        // }
    }

    public get isAlive() {
        // the start node should be alive and the end node
        // should either be null (wire being drawn) or alive
        // (wire set) for the wire to be alive
        return this.startNode.isAlive && this.endNode.isAlive
    }

    public addPassthroughFrom(e: MouseEvent | TouchEvent): Passthrough | undefined {
        const parent = this.parent
        const [x, y] = parent.editor.offsetXYForContextMenu(e, true)
        const endNode = this.endNode

        const passthrough = PassthroughDef.make<Passthrough>(parent, { bits: 1 })
        passthrough.setSpawned()
        passthrough.setPosition(x, y, false)
        passthrough.anchor = this.startNode.component

        // modify this wire to go to the passthrough
        this.setEndNode(passthrough.inputs.In[0])

        // create a new wire from the passthrough to the end node
        const newWire = parent.linkMgr.addWire(passthrough.outputs.Out[0], endNode, false)
        if (newWire === undefined) {
            console.warn("Couldn't create new wire")
            return
        }
        newWire.doSetStyle(this.style)
        return passthrough
    }

    public addWaypointFrom(e: MouseEvent | TouchEvent): Waypoint {
        const [x, y] = this.parent.editor.offsetXYForContextMenu(e, true)
        return this.addWaypointWith(x, y)
    }

    public addWaypointWith(x: number, y: number): Waypoint {
        let coordData = this.indexOfNextWaypointIfMouseover(x, y)
        if (coordData === undefined) {
            // shouldn't happen since we're calling this form a context menu
            // which was invoked when we were in a mouseover state
            coordData = [
                0,
                [this.startNode.posX, this.startNode.posY],
                [this.endNode.posX, this.endNode.posY],
            ]
        }

        // determine initial direction
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

        const waypoint = new Waypoint(this, [x, y, orient])
        waypoint.anchor = this.startNode.component
        this._waypoints.splice(i, 0, waypoint)
        return waypoint
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

    protected doDraw(g: GraphicsRendering, ctx: DrawContext) {
        // this has to be checked _before_ we prune the list,
        // otherwise we won't get a chance to have a next animation frame
        // and to run the pending updates created by possibly setting
        // the value of the end node
        const isAnimating = this._propagatingValues.length > 1

        const options = this.parent.editor.options
        const propagationDelay = this.customPropagationDelay ?? options.propagationDelay
        const neutral = options.hideWireColors
        const drawTime = ctx.drawParams.drawTime
        this.prunePropagatingValues(drawTime, propagationDelay)

        if (this.behavesHidden) {
            return
        }


        // eslint-disable-next-line prefer-const
        let [startX, startY, prevX, prevY, prevProlong] = this.startNode.drawCoords
        const [endLeadX, endLeadY, endNodeX, endNodeY, endNodeProlong] = this.endNode.drawCoords
        const lastWaypointData = { posX: endNodeX, posY: endNodeY, orient: endNodeProlong }
        const allWaypoints = [...this._waypoints, lastWaypointData]
        let svgPathDesc = "M" + startX + " " + startY + " " + "L" + prevX + " " + prevY + " "
        const wireStyle = this.style ?? this.startNode.parent.editor.options.wireStyle
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

        svgPathDesc += "L" + endLeadX + " " + endLeadY

        const path = g.createPath(svgPathDesc)

        const drawParams = ctx.drawParams
        // highlight if needed
        if (drawParams.highlightColor !== undefined && (drawParams.highlightedItems?.wires.includes(this) ?? false)) {
            g.lineWidth = 15
            g.shadowColor = drawParams.highlightColor
            g.shadowBlur = 20
            g.shadowOffsetX = 0
            g.shadowOffsetY = 0
            g.strokeStyle = g.shadowColor
            g.stroke(path)
            g.shadowBlur = 0 // reset
        }

        // outline
        const color = this._startNode.color
        strokeWireOutline(g, color, ctx.isMouseOver, path)

        // single value
        if (this._propagatingValues.length === 1) {
            // no need to compute the length of the path, which is costly
            const [value, timeSet] = this._propagatingValues[0]
            const frac = Math.min(1.0, (drawTime - timeSet) / propagationDelay)
            if (frac < 1.0) {
                console.warn(`Propagating value not fully propagated but drawn as such (frac=${frac} < 1.0, drawTime=${drawTime}, timeSet=${timeSet}, propagationDelay=${propagationDelay})`)
            }
            strokeWireValue(g, value, color, undefined, neutral, drawParams.drawTimeAnimationFraction, path)

        } else {
            // multiple propagating values
            const totalLength = this.parent.editor.lengthOfPath(svgPathDesc)
            for (const [value, timeSet] of this._propagatingValues) {
                const frac = Math.min(1.0, (drawTime - timeSet) / propagationDelay)
                const lengthToDraw = totalLength * frac
                strokeWireValue(g, value, color, [lengthToDraw, totalLength], neutral, drawParams.drawTimeAnimationFraction, path)
            }
        }

        if (isAnimating && !this.parent.editor.timeline.isPaused) {
            this.setNeedsRedraw("propagating value", true)
        }
    }

    public isOver(x: number, y: number): boolean {
        if (this.parent.mode < Mode.CONNECT || !this.startNode.isAlive || !this.endNode.isAlive || this.behavesHidden) {
            return false
        }
        return this.indexOfNextWaypointIfMouseover(x, y) !== undefined
    }

    private indexOfNextWaypointIfMouseover(x: number, y: number): undefined | [number, [number, number], [number, number]] {
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

    public override mouseDown(e: MouseEvent | TouchEvent) {
        if (e.altKey && this.parent.mode >= Mode.DESIGN) {
            const passthrough = this.addPassthroughFrom(e)
            if (passthrough !== undefined) {
                return passthrough.outputs.Out[0].mouseDown(e)
            }
        }
        return super.mouseDown(e)
    }

    public override mouseDragged(e: MouseEvent | TouchEvent) {
        if (this._waypointBeingDragged !== undefined) {
            this._waypointBeingDragged.mouseDragged(e)
        } else {
            if (this.parent.editor.eventMgr.currentSelectionEmpty()) {
                const waypoint = this.addWaypointFrom(e)
                this._waypointBeingDragged = waypoint
                waypoint.mouseDown(e)
                waypoint.mouseDragged(e)
            }
        }
    }

    public override mouseUp(e: MouseEvent | TouchEvent) {
        if (this._waypointBeingDragged !== undefined) {
            this._waypointBeingDragged.mouseUp(e)
            this._waypointBeingDragged = undefined
            return InteractionResult.SimpleChange
        }
        return InteractionResult.NoChange
    }

    public override makeContextMenu(): MenuData {

        const s = S.Components.Wire.contextMenu
        const currentPropDelayStr = this.customPropagationDelay === undefined ? "" : ` (${this.customPropagationDelay} ms)`

        const makeItemUseColor = (desc: string, color: WireColor) => {
            const isCurrent = this._startNode.color === color
            const icon = isCurrent ? "check" : "none"
            const action = isCurrent ? () => undefined : () => this._startNode.doSetColor(color)
            const cssColor = COLOR_WIRE[color]
            return MenuData.item(icon, span(title(desc), style(`display: inline-block; width: 140px; height: ${WIRE_WIDTH}px; background-color: ${cssColor}; margin-right: 8px`)), action)
        }


        const makeItemDisplayStyle = (desc: string, style: WireStyle | undefined) => {
            const isCurrent = this.style === style
            const icon = isCurrent ? "check" : "none"
            const action = isCurrent ? () => undefined : () => this.doSetStyle(style)
            return MenuData.item(icon, desc, action)
        }

        const hiddenMenuItem =
            MenuData.item(this.isHidden ? "check" : "none", s.HiddenWire, () => {
                this.doSetHidden(!this.isHidden)
            })

        const setWireOptionsItems =
            this.parent.mode < Mode.DESIGN ? [] : [
                MenuData.sep(),
                MenuData.item("timer", s.CustomPropagationDelay.expand({ current: currentPropDelayStr }), (__itemEvent) => {
                    const currentStr = this.customPropagationDelay === undefined ? "" : String(this.customPropagationDelay)
                    const defaultDelay = String(this.parent.editor.options.propagationDelay)
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
                MenuData.submenu("palette", s.WireColor, [
                    makeItemUseColor(s.WireColorBlack, WireColor.black),
                    makeItemUseColor(s.WireColorRed, WireColor.red),
                    makeItemUseColor(s.WireColorBlue, WireColor.blue),
                    makeItemUseColor(s.WireColorYellow, WireColor.yellow),
                    makeItemUseColor(s.WireColorGreen, WireColor.green),
                    makeItemUseColor(s.WireColorWhite, WireColor.white),
                ]),
                MenuData.submenu("wirestyle", s.WireStyle, [
                    makeItemDisplayStyle(s.WireStyleDefault, undefined),
                    MenuData.sep(),
                    makeItemDisplayStyle(s.WireStyleAuto, WireStyles.auto),
                    makeItemDisplayStyle(s.WireStyleStraight, WireStyles.straight),
                    makeItemDisplayStyle(s.WireStyleCurved, WireStyles.bezier),
                ]),

                MenuData.sep(),
                hiddenMenuItem,
            ]

        const setRefItems =
            this.parent.mode < Mode.FULL ? [] : [
                MenuData.sep(),
                this.makeSetIdContextMenuItem(),
            ]

        return [
            MenuData.item("add", s.AddMiddlePoint, (__itemEvent, contextEvent) => {
                this.addWaypointFrom(contextEvent)
            }),
            MenuData.item("add", s.AddPassthrough, (__itemEvent, contextEvent) => {
                this.addPassthroughFrom(contextEvent)
            }),
            ...setWireOptionsItems,
            ...setRefItems,
            MenuData.sep(),
            MenuData.item("trash", S.Components.Generic.contextMenu.Delete, () => {
                return this.parent.linkMgr.deleteWire(this)
            }, "⌫", true),
        ]
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

    public constructor(parent: DrawableParent,
        public readonly startNodeGroup: NodeGroup<NodeOut>,
        public readonly endNodeGroup: NodeGroup<NodeIn>,
    ) {
        super(parent)
    }

    public isEmpty() {
        return this._coveredWires.length === 0
    }

    public addCoveredWire(wire: Wire, newNodeGroupStartIndex: number, newNodeGroupEndIndex: number) {
        this._coveredWires.push(wire)
        this.updateIndices(newNodeGroupStartIndex, newNodeGroupEndIndex)
    }

    public wireWasDeleted(__wire: Wire) {
        // TODO check ribbons here
        // const index = this._coveredWires.indexOf(wire)
        // if (index >= 0) {
        //     this._coveredWires.splice(index, 1)
        // }
        // // remove start node
        // const startNode = wire.startNode
        // const startNodeIndex = this._startNodes.indexOf(startNode)
        // if (startNodeIndex >= 0) {
        //     this._startNodes.splice(startNodeIndex, 1)
        // }
        // // remove end node
        // const endNode = wire.endNode
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


    protected doDraw(g: GraphicsRendering, ctx: DrawContext): void {
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

    private strokeWireBezier(g: GraphicsRendering, b: Bezier, values: LogicValue[], color: WireColor, isMouseOver: boolean, neutral: boolean) {
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
            if (isArray(bs)) {
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
            g.strokeStyle = neutral ? COLOR_UNKNOWN : colorForLogicValue(value)
            const b1 = b.offset(dist)
            drawBeziers(b1)
            dist += WIRE_WIDTH + WIRE_MARGIN_INNER
        }

        // restore
        g.lineCap = oldLineCap
    }

    private drawRibbonEnd(g: GraphicsRendering, ctx: DrawContext, nodeGroup: NodeGroup<Node>, startIndex: number, endIndex: number): [readonly [number, number], Orientation] {
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

        drawStraightWireLine(g, startX, startY, endX, endY, "Z", "black", true, ctx.drawParams.drawTimeAnimationFraction)
        return [mid, orient]
    }


    public isOver(__x: number, __y: number): boolean {
        return false // TODO
    }
    public isInRect(__rect: DOMRect): boolean {
        return false // TODO
    }

}



/**
 * Manages links between components, i.e., wires and ribbons, and the anchor being set.
 */
export class LinkManager {

    public readonly parent: DrawableParent

    // wires and ribbons
    private readonly _wires: Wire[] = []
    private readonly _ribbons: Ribbon[] = []
    private _wireBeingAddedFrom: Node | undefined = undefined

    // anchors
    private _anchorBeingSetFrom: DrawableWithPosition | undefined = undefined

    public constructor(parent: DrawableParent) {
        this.parent = parent
    }

    public get wires(): readonly Wire[] {
        return this._wires
    }

    public get ribbons(): readonly Ribbon[] {
        return this._ribbons
    }

    public get isAddingWire() {
        return this._wireBeingAddedFrom !== undefined
    }

    public get isSettingAnchor() {
        return this._anchorBeingSetFrom !== undefined
    }

    public draw(g: GraphicsRendering, drawParams: DrawParams) {
        this.removeDeadWires()
        const useRibbons = this.parent.editor.options.groupParallelWires
        if (useRibbons) {
            for (const ribbon of this._ribbons) {
                ribbon.draw(g, drawParams)
            }
        }
        for (const wire of this._wires) {
            if (useRibbons && wire.ribbon !== undefined) {
                continue
            }
            wire.draw(g, drawParams)
            for (const waypoint of wire.waypoints) {
                waypoint.draw(g, drawParams)
            }
        }
        this.drawWireBeingAdded(g, drawParams)
        this.drawAnchorBeingSet(g)
    }

    private drawWireBeingAdded(g: GraphicsRendering, drawParams: DrawParams) {
        // TODO use some PartialWire class to draw this and allow adding waypoints
        // while dragging, e.g. with the A or Space key
        const nodeFrom = this._wireBeingAddedFrom
        if (nodeFrom !== undefined) {
            const x1 = nodeFrom.posX
            const y1 = nodeFrom.posY
            const editor = this.parent.editor
            const zoomFactor = editor.options.zoom / 100
            const x2 = editor.mouseX / zoomFactor
            const y2 = editor.mouseY / zoomFactor
            g.beginPath()
            g.moveTo(x1, y1)
            if (this.parent.editor.options.wireStyle === WireStyles.straight) {
                g.lineTo(x2, y2)
            } else {
                const deltaX = x2 - x1
                const deltaY = y2 - y1
                // bezier curve
                const bezierAnchorPointDistX = Math.max(25, Math.abs(deltaX) / 3)
                const bezierAnchorPointDistY = Math.max(25, Math.abs(deltaY) / 3)

                // first anchor point
                const outgoingOrient = Orientation.add(nodeFrom.component.orient, nodeFrom.orient)
                const [a1x, a1y] = bezierAnchorForWire(Orientation.invert(outgoingOrient), x1, y1, bezierAnchorPointDistX, bezierAnchorPointDistY)
                const [a2x, a2y] = bezierAnchorForWire(outgoingOrient, x2, y2, bezierAnchorPointDistX, bezierAnchorPointDistY)
                g.bezierCurveTo(a1x, a1y, a2x, a2y, x2, y2)
            }
            strokeWireOutlineAndSingleValue(g, nodeFrom.value, nodeFrom.color, false, drawParams.drawTimeAnimationFraction)
        }
    }

    private drawAnchorBeingSet(g: GraphicsRendering) {
        const drawable = this._anchorBeingSetFrom
        if (drawable !== undefined) {
            const x1 = drawable.posX
            const y1 = drawable.posY
            const editor = this.parent.editor
            const zoomFactor = editor.options.zoom / 100
            const x2 = editor.mouseX / zoomFactor
            const y2 = editor.mouseY / zoomFactor
            drawAnchorTo(g, x1, y1, x2, y2, 6, COLOR_ANCHOR_NEW, undefined)
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

    public addWire(startNode: NodeOut, endNode: NodeIn, tryOffset: boolean): Wire | undefined {
        if (!startNode.acceptsMoreConnections || !endNode.acceptsMoreConnections) {
            return undefined
        }
        const wire = new Wire(startNode, endNode)
        this._wires.push(wire)
        if (tryOffset) {
            // done only when creating a new wire manually
            this.offsetWireIfNecessary(wire)
        }
        this.tryMergeWire(wire)
        this.parent.ifEditing?.setToolCursor(null)
        this.parent.ifEditing?.setDirty("added wire")
        return wire
    }

    public startSettingAnchorFrom(drawable: DrawableWithPosition) {
        if (this._anchorBeingSetFrom !== undefined) {
            console.warn("LinkManager.startSettingAnchorFrom: already setting anchor from a drawable")
        }
        this._anchorBeingSetFrom = drawable
        this.parent.ifEditing?.setToolCursor("alias")
    }

    public stopSettingAnchorOn(comp: Component): InteractionResult {
        const anchorBeingSetFrom = this._anchorBeingSetFrom
        if (anchorBeingSetFrom) {
            return this.trySetAnchor(anchorBeingSetFrom, comp)
        }
        return InteractionResult.NoChange
    }

    public trySetAnchor(from: DrawableWithPosition, to: Component): InteractionResult {
        this.tryCancelSetAnchor()

        if (to.ref === undefined) {
            console.warn("LinkManager.stopSettingAnchorOn: component has no ref")
        }
        if (to !== from) {
            let forbidden = false
            let current = to
            while (current.anchor !== undefined) {
                current = current.anchor
                if (current === from) {
                    forbidden = true
                    break
                }
            }
            if (forbidden) {
                this.parent.editor.showMessage(S.Messages.CircularAnchorsForbidden)
            } else {
                from.anchor = to
                this.parent.editor.showMessage(S.Messages.AnchorAdded)
                return InteractionResult.SimpleChange
            }
        }
        return InteractionResult.NoChange
    }

    public tryCancelSetAnchor() {
        this._anchorBeingSetFrom = undefined
        this.parent.ifEditing?.setToolCursor(null)
    }

    public startDraggingWireFrom(node: Node) {
        if (this._wireBeingAddedFrom !== undefined) {
            console.warn("LinkManager.startDraggingFrom: already dragging from a node")
        }
        if (!node.acceptsMoreConnections) {
            return
        }
        this._wireBeingAddedFrom = node
        this.parent.ifEditing?.setToolCursor("crosshair")
    }

    public stopDraggingWireOn(newNode: Node): Wire | undefined {
        const nodes = this.getOutInNodesForNewWire(newNode)
        this._wireBeingAddedFrom = undefined
        if (nodes === undefined) {
            return undefined
        }
        return this.addWire(nodes[0], nodes[1], true)
    }

    public isValidNodeToConnect(node: Node): boolean {
        return this.getOutInNodesForNewWire(node) !== undefined
    }

    private getOutInNodesForNewWire(newNode: Node): [NodeOut, NodeIn] | undefined {
        const otherNode = this._wireBeingAddedFrom
        if (otherNode === undefined) {
            return undefined
        }

        if (newNode === otherNode) {
            // can't connect to itself
            return undefined
        }

        if (otherNode.isOutput()) {
            if (newNode.isOutput() || !newNode.acceptsMoreConnections) {
                // can't connect two outputs or to an input that can't accept more connections
                return undefined
            } else {
                return [otherNode, newNode]
            }
        } else {
            if (newNode.isOutput()) {
                // that works
                return [newNode, otherNode]
            } else {
                // two inputs: if one is connected to some output already, connect to that
                let otherStartNode = newNode.incomingWire?.startNode
                if (otherStartNode !== undefined && otherNode.acceptsMoreConnections) {
                    return [otherStartNode, otherNode]
                }
                otherStartNode = otherNode.incomingWire?.startNode
                if (otherStartNode !== undefined && newNode.acceptsMoreConnections) {
                    return [otherStartNode, newNode]
                }

                // nothing else we can do
                return undefined
            }
        }
    }

    public tryCancelWireOrAnchor(): boolean {
        if (this._wireBeingAddedFrom !== undefined) {
            this._wireBeingAddedFrom = undefined
            this.parent.ifEditing?.setToolCursor(null)
            return true
        }
        if (this._anchorBeingSetFrom !== undefined) {
            this._anchorBeingSetFrom = undefined
            this.parent.ifEditing?.setToolCursor(null)
            return true
        }
        return false
    }

    private offsetWireIfNecessary(wire: Wire) {
        const startNode = wire.startNode
        const endNode = wire.endNode
        const comp = startNode.component as Component
        if (comp !== endNode.component) {
            return
        }
        const dx2 = (endNode.posX - startNode.posX) / 2
        const dy2 = (endNode.posY - startNode.posY) / 2
        const midpointX = startNode.posX + dx2
        const midpointY = startNode.posY + dy2
        if (!comp.isOver(midpointX, midpointY)) {
            return
        }

        const addToX = dx2 > dy2

        const dir = addToX
            ? (startNode.posX < endNode.posX ? 1 : startNode.posX > endNode.posX ? -1 : startNode.posX < comp.posX ? -1 : 1)
            : (startNode.posY < endNode.posY ? 1 : startNode.posY > endNode.posY ? -1 : startNode.posY < comp.posY ? -1 : 1)
        const calcOffsetFromDim = (dim: number) => {
            return dir * (dim / 2 + 2 * GRID_STEP)
        }

        const isVertical = Orientation.isVertical(comp.orient)

        const waypointX = midpointX + (addToX ? calcOffsetFromDim(isVertical ? comp.unrotatedHeight : comp.unrotatedWidth) : 0)
        const waypointY = midpointY + (addToX ? 0 : calcOffsetFromDim(isVertical ? comp.unrotatedWidth : comp.unrotatedHeight))
        wire.addWaypointWith(waypointX, waypointY)
    }

    private tryMergeWire(wire: Wire) {
        const startNode = wire.startNode
        const endNode = wire.endNode

        const startGroup = startNode.group
        const endGroup = endNode.group
        if (startGroup === undefined || endGroup === undefined) {
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
        if (wireBefore !== undefined) {
            let ribbon = wireBefore.ribbon
            if (ribbon === undefined) {
                ribbon = new Ribbon(startNode.parent, startGroup, endGroup)
                this._ribbons.push(ribbon) // TODO determine when we must remove them
                wireBefore.ribbon = ribbon
                ribbon.addCoveredWire(wireBefore, indexStart - 1, indexEnd - 1)
            }
            ribbon.addCoveredWire(wire, indexStart, indexEnd)
            wire.ribbon = ribbon
        }

        // TODO merge after, too!

        // if (wireAfter !== undefined) {
        //     console.log("we have a wire after")
        // }


        // const wireAfter = findWire(startGroup, indexStart + 1, endGroup, indexEnd + 1)
    }

    public deleteWire(wire: Wire): InteractionResult {
        // TODO check in ribbon
        const oldStartNode = wire.startNode
        const oldEndNode = wire.endNode
        const deleted = this.doDeleteWire(wire)
        if (!deleted) {
            return InteractionResult.NoChange
        }
        return tryMakeRepeatableNodeAction(oldStartNode, oldEndNode, (startNode, endNode) => {
            const wire = endNode.incomingWire
            if (wire === null || wire.startNode !== startNode) {
                return false
            }
            return this.doDeleteWire(wire)
        })
    }

    private doDeleteWire(wire: Wire): boolean {
        // TODO check in ribbon
        wire.destroy()
        const ribbon = wire.ribbon
        if (ribbon !== undefined) {
            ribbon.wireWasDeleted(wire)
            if (ribbon.isEmpty()) {
                this._ribbons.splice(this._ribbons.indexOf(ribbon), 1)
            }
        }
        // remove wire from array
        this._wires.splice(this._wires.indexOf(wire), 1)
        this.parent.ifEditing?.redrawMgr.addReason("deleted wire", null)
        return true
    }

    public clearAll() {
        // TODO clear ribbons
        for (const wire of this._wires) {
            wire.destroy()
        }
        this._wires.splice(0, this._wires.length)
        this.parent.ifEditing?.redrawMgr.addReason("deleted wires", null)
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
