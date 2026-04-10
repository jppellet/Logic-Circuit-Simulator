import { distSquaredToWaypointIfOver, drawWaypoint, GRID_STEP, NodeStyle, WAYPOINT_DIAMETER } from "../drawutils"
import { HighImpedance, InteractionResult, isUnknown, LogicValue, Mode, Orientation, RepeatFunction, toLogicValue, Unknown } from "../utils"
import { Component, InputNodeRepr, NodeGroup, NodeLabelOffsetProvider, OutputNodeRepr } from "./Component"
import { DrawableParent, DrawableWithPosition, DrawContext, GraphicsRendering } from "./Drawable"
import { Wire } from "./Wire"

export type Node = NodeIn | NodeOut

export const WireColor = {
    black: "black",
    red: "red",
    blue: "blue",
    yellow: "yellow",
    green: "green",
    white: "white",
} as const

export const DEFAULT_WIRE_COLOR = WireColor.black

export type WireColor = keyof typeof WireColor

export type MirrorNode<N extends Node> = N extends NodeIn ? NodeOut : N extends NodeOut ? NodeIn : Node

export abstract class NodeBase<N extends Node> extends DrawableWithPosition {

    public readonly id: number
    private _isAlive = true
    private _value: LogicValue = false
    private _leadLength: number
    protected _initialValue: LogicValue | undefined = undefined
    protected _forceValue: LogicValue | undefined
    protected _color: WireColor = DEFAULT_WIRE_COLOR
    public xrayInsideNode: MirrorNode<N> | undefined = undefined

    public constructor(
        public readonly component: Component,
        parent: DrawableParent,
        public xRayOutsideNode: MirrorNode<N> | undefined,
        nodeSpec: InputNodeRepr | OutputNodeRepr,
        public readonly group: NodeGroup<N> | undefined,
        public readonly idName: string, // the one in comp.inputs[idName]
        public readonly shortName: string, // the one drawn on the comp
        public readonly fullName: string, // the one in the menu
        private _gridOffsetX: number,
        private _gridOffsetY: number,
        public readonly hasTriangle: boolean,
        relativePosition: Orientation,
        private readonly _leadLengthOverride: number | undefined,
        public readonly labelOffset: NodeLabelOffsetProvider | undefined,
    ) {
        super(parent)
        this.id = nodeSpec.id
        if ("force" in nodeSpec) {
            this._forceValue = toLogicValue(nodeSpec.force)
        }
        if ("color" in nodeSpec && nodeSpec.color !== undefined) {
            this._color = nodeSpec.color
        }
        if ("initialValue" in nodeSpec && nodeSpec.initialValue !== undefined) {
            const initialValue = toLogicValue(nodeSpec.initialValue)
            this._initialValue = initialValue
            this._value = initialValue
        }
        this.parent.nodeMgr.addLiveNode(this.asNode)
        this.updatePositionFromParent()
        this.doSetOrient(relativePosition)
        this._leadLength = this.updateLeadLength()
    }

    private get asNode(): Node {
        return this as unknown as Node
    }

    public updateLeadLength(leadLengthOverride?: number) {
        return this._leadLength = leadLengthOverride ?? this._leadLengthOverride ?? this.defaultLeadLength(Orientation.isVertical(this.orient))
    }

    private defaultLeadLength(isVertical: boolean): number {
        const bias = this.hasTriangle ? -2 : 0
        if (isVertical) {
            return bias + Math.abs(this._gridOffsetY) * GRID_STEP - this.component.unrotatedHeight / 2
        }
        return bias + Math.abs(this._gridOffsetX) * GRID_STEP - this.component.unrotatedWidth / 2
    }

    public get leadLength() {
        return this._leadLength
    }

    public abstract get isConnected(): boolean

    public abstract get connectedWires(): readonly Wire[]

    /**
     * @returns [leadEndX, leadEndY, nodeX, nodeY, wireProlongDirection]
     */
    public get drawCoords(): [number, number, number, number, Orientation] {
        const dir = this.wireProlongDirection
        const x = this.posX
        const y = this.posY
        switch (dir) {
            case "e":
                return [x + this.leadLength, y, x, y, dir]
            case "w":
                return [x - this.leadLength, y, x, y, dir]
            case "n":
                return [x, y - this.leadLength, x, y, dir]
            case "s":
                return [x, y + this.leadLength, x, y, dir]
        }
    }

    /**
     * @returns [leadEndX, leadEndY, nodeX, nodeY]
     */
    public get drawCoordsInParentTransform(): [number, number, number, number] {
        const x = this.posXInParentTransform
        const y = this.posYInParentTransform
        switch (this.orient) {
            case "e":
                return [x - this.leadLength, y, x, y]
            case "w":
                return [x + this.leadLength, y, x, y]
            case "n":
                return [x, y + this.leadLength, x, y]
            case "s":
                return [x, y - this.leadLength, x, y]
        }
    }

    public get anchor(): Component | undefined {
        return undefined
    }

    public set anchor(__: Component | undefined) {
        throw new Error("Node does not support anchoring")
    }

    public isOutput(): this is NodeOut {
        return Node.isOutput(this.asNode)
    }

    public abstract get isClock(): boolean

    public get unrotatedWidth() {
        return WAYPOINT_DIAMETER
    }

    public get unrotatedHeight() {
        return WAYPOINT_DIAMETER
    }

    public get color(): WireColor {
        return this._color
    }

    public doSetColor(color: WireColor) {
        this._color = color
        this.propagateColor(color)
        this.requestRedraw({ why: "color changed" })
    }

    protected propagateColor(__color: WireColor) {
        // nothing by default; overridden in NodeOut
    }

    public override isOver(x: number, y: number) {
        return this.distSquaredIfOver(x, y, false) !== undefined
    }

    public distSquaredIfOver(x: number, y: number, moreTolerant: boolean): number | undefined {
        if (!(this.parent.mode >= Mode.CONNECT && this.acceptsMoreConnections)) {
            return undefined
        }
        return distSquaredToWaypointIfOver(x, y, this.posX, this.posY, moreTolerant)
    }

    public destroy() {
        this.preDestroy()
        this._isAlive = false
        this.parent.nodeMgr.removeLiveNode(this.asNode)
    }

    protected abstract preDestroy(): void

    protected forceDraw() {
        return false
    }

    protected doDraw(g: GraphicsRendering, ctx: DrawContext) {
        const mode = this.parent.mode
        if ((mode < Mode.CONNECT && !this.forceDraw()) || !this.acceptsMoreConnections) {
            return
        }

        const showForced = this._forceValue !== undefined && mode >= Mode.FULL
        const showForcedWarning = mode >= Mode.FULL && !isUnknown(this._value) && !isUnknown(this.value) && this._value !== this.value
        const parentOrientIsVertical = Orientation.isVertical(this.component.orient)
        const neutral = this.parent.editor.options.hideWireColors
        drawWaypoint(g, this.posX, this.posY, this.nodeDisplayStyle, this.currentDrawValue, ctx.pointerOver, neutral, showForced, showForcedWarning ? [ctx, parentOrientIsVertical] : false)
    }

    protected abstract get nodeDisplayStyle(): NodeStyle

    protected abstract get currentDrawValue(): LogicValue

    public get isAlive() {
        return this._isAlive
    }

    public get value(): LogicValue {
        return this._forceValue !== undefined ? this._forceValue : this._value
    }

    public set value(val: LogicValue) {
        const oldVisibleValue = this.value
        if (val !== this._value) {
            this._value = val
            // TODO do something of the sort to check that the nodes are the same
            // if (!this.isOutput() && this.xRayOutsideNode !== undefined && this.xRayOutsideNode.value !== val) {
            //     console.error(`X-ray desync on node ${this.fullName}: inside node value is ${val} but outside node value is ${this.xRayOutsideNode.value}`)
            // }
            this.propagateNewValueIfNeeded(oldVisibleValue)
        }
    }

    protected propagateNewValueIfNeeded(oldVisibleValue: LogicValue) {
        const newVisibleValue = this.value
        if (newVisibleValue !== oldVisibleValue) {
            this.propagateNewValue(newVisibleValue)
        }
    }

    protected abstract propagateNewValue(newValue: LogicValue): void

    public abstract get forceValue(): LogicValue | undefined

    public abstract get initialValue(): LogicValue | undefined

    public get gridOffsetX() {
        return this._gridOffsetX
    }

    public set gridOffsetX(newVal: number) {
        this._gridOffsetX = newVal
        this.updatePositionFromParent()
    }

    public get gridOffsetY() {
        return this._gridOffsetY
    }

    public set gridOffsetY(newVal: number) {
        this._gridOffsetY = newVal
        this.updatePositionFromParent()
    }

    public abstract get acceptsMoreConnections(): boolean

    public get posXInParentTransform() {
        return this.component.posX + this._gridOffsetX * GRID_STEP
    }

    public get posYInParentTransform() {
        return this.component.posY + this._gridOffsetY * GRID_STEP
    }

    public updatePositionFromParent() {
        const component = this.component
        const [appliedGridOffsetX, appliedGridOffsetY] = (() => {
            switch (component.orient) {
                case "e": return [+this._gridOffsetX, +this._gridOffsetY]
                case "w": return [-this._gridOffsetX, -this._gridOffsetY]
                case "s": return [-this._gridOffsetY, +this._gridOffsetX]
                case "n": return [+this._gridOffsetY, -this._gridOffsetX]
            }
        })()
        return super.trySetPosition(
            component.posX + appliedGridOffsetX * GRID_STEP,
            component.posY + appliedGridOffsetY * GRID_STEP,
            false
        ) ?? [this.posX, this.posY]
    }

    public setPositionAsXRayFor(node: Node, xrayScale: number) {
        const [x, y] = node.drawCoordsInParentTransform
        const [dx, dy] = !node.hasTriangle ? [0, 0] : (() => {
            const d = 2
            switch (node.orient) {
                case "e": return [-d, 0]
                case "w": return [d, 0]
                case "s": return [0, -d]
                case "n": return [0, d]
            }
        })()
        super.trySetPosition((x - node.component.posX + dx) / xrayScale, (y - node.component.posY + dy) / xrayScale, false)
    }

    /**
     * Points in the direction with which an outgoing wire from this node should start,
     * e.g. to draw a smooth curve
     */
    public get wireProlongDirection(): Orientation {
        switch (this.component.orient) {
            case "e":
                switch (this.orient) {
                    case "e": return "w"
                    case "w": return "e"
                    case "s": return "n"
                    case "n": return "s"
                }
                break
            case "w": return this.orient
            case "s":
                switch (this.orient) {
                    case "e": return "n"
                    case "w": return "s"
                    case "s": return "e"
                    case "n": return "w"
                }
                break
            case "n":
                switch (this.orient) {
                    case "e": return "s"
                    case "w": return "n"
                    case "s": return "w"
                    case "n": return "e"
                }
        }
    }

    public override cursorWhenMouseover(__e?: PointerEvent) {
        return "crosshair"
    }

    public override pointerDown(__: PointerEvent) {
        this.parent.linkMgr.startDraggingWireFrom(this.asNode)
        return { wantsDragEvents: false }
    }

    public override pointerUp(__: PointerEvent) {
        const newWire = this.parent.linkMgr.stopDraggingWireOn(this.asNode)
        if (newWire === undefined) {
            return InteractionResult.NoChange
        }
        return tryMakeRepeatableNodeAction(newWire.startNode, newWire.endNode, (startNode, endNode) => {
            const newWire = this.parent.linkMgr.addWire(startNode, endNode, true)
            return newWire !== undefined
        })
    }

}


export class NodeIn extends NodeBase<NodeIn> {

    public readonly _tag = "_nodein"

    private _incomingWire: Wire | null = null
    public prefersSpike = false
    public isClock = false

    public get incomingWire() {
        return this._incomingWire
    }

    public set incomingWire(wire: Wire | null) {
        this._incomingWire = wire
        if (wire === null) {
            this.value = false
        } else {
            this.value = wire.startNode.value
        }
    }

    public get isConnected(): boolean {
        return this._incomingWire !== null
    }

    public get connectedWires() {
        return this._incomingWire === null ? [] : [this._incomingWire]
    }

    protected preDestroy() {
        if (this._incomingWire !== null) {
            this.parent.linkMgr.deleteWire(this._incomingWire)
        }
    }

    public get acceptsMoreConnections() {
        return this._incomingWire === null
    }

    protected override positionChanged(__delta: [number, number]) {
        this._incomingWire?.invalidateWirePath()
    }

    public get forceValue() {
        return undefined
    }

    public get initialValue() {
        return undefined
    }

    protected propagateNewValue(newValue: LogicValue) {
        this.component.setNeedsRecalc()
        if (this.xrayInsideNode !== undefined) {
            this.xrayInsideNode.value = newValue
        }
    }

    protected get nodeDisplayStyle() {
        const disconnected = this._incomingWire === null
        return disconnected ? NodeStyle.IN_DISCONNECTED : NodeStyle.IN_CONNECTED
    }

    protected get currentDrawValue() {
        // doesn't matter, it's either empty or not drawn
        return false
    }

}

export type BranchPoint = [x: number, y: number, frac: number, wire: Wire]

export class NodeOut extends NodeBase<NodeOut> {

    public readonly _tag = "_nodeout"

    private readonly _outgoingWires: Wire[] = []
    private _branchPoints: BranchPoint[] | undefined = undefined

    public get isClock() {
        return false
    }

    public addOutgoingWire(wire: Wire) {
        // don't add the same wire twice
        const i = this._outgoingWires.indexOf(wire)
        if (i === -1) {
            this._outgoingWires.push(wire)
            this.invalidateBranchPoints()
        }
    }

    public removeOutgoingWire(wire: Wire) {
        const i = this._outgoingWires.indexOf(wire)
        if (i !== -1) {
            this._outgoingWires.splice(i, 1)
            this.invalidateBranchPoints()
        }
    }

    public invalidateBranchPoints() {
        this._branchPoints = undefined
    }

    public get branchPoints() {
        if (this._branchPoints === undefined) {
            const branchPoints: BranchPoint[] = []

            const numWires = this._outgoingWires.length
            if (numWires > 1) {
                const branchPointSet = new Set<string>()
                for (let i = 0; i < numWires; i++) {
                    const wire = this._outgoingWires[i]
                    if (wire.isHidden) {
                        continue
                    }
                    const possibleBranchPoints = wire.wirePath.possibleBranchPoints
                    // console.log(`wire has pbp = ${JSON.stringify(possibleBranchPoints)}`)
                    // console.log(`    and path = ${JSON.stringify(wire.wirePath.parts)}`)
                    for (const possibleBranchPoint of possibleBranchPoints) {
                        const stringRepr = `${possibleBranchPoint[0]},${possibleBranchPoint[1]}`
                        if (branchPointSet.has(stringRepr)) {
                            continue
                        }
                        let match = -1
                        let matchFraction: undefined | number = 0
                        // it is on another wire?
                        for (let j = 0; j < numWires; j++) {
                            const otherWire = this._outgoingWires[j]
                            if (otherWire === wire || otherWire.isHidden) {
                                continue
                            }
                            // console.log(`     checking ${JSON.stringify(possibleBranchPoint)}`)
                            matchFraction = otherWire.wirePath.fractionIfOverPossibleBranchPoint(possibleBranchPoint)
                            if (matchFraction !== undefined) {
                                if (matchFraction > 1) {
                                    matchFraction = otherWire.wirePath.fractionIfOverPossibleBranchPoint(possibleBranchPoint)
                                }
                                match = j
                                break
                            }
                        }
                        if (match !== -1 && matchFraction !== undefined) {
                            // console.log(`     -> yes`)
                            branchPointSet.add(stringRepr)
                            const [x, y] = possibleBranchPoint

                            // pick frontmost wire as reference
                            if (i > match) {
                                // update matchFraction for i, remove direction to match also from colinear segment if from same wire
                                const otherMatchFraction = wire.wirePath.fractionIfOverPossibleBranchPoint([x, y])
                                if (otherMatchFraction === undefined) {
                                    console.warn("Cannot find fraction of branch point from on wire from which it came")
                                } else {
                                    match = i
                                    matchFraction = otherMatchFraction
                                }
                            }
                            const refWire = this._outgoingWires[match]
                            branchPoints.push([x, y, matchFraction, refWire])
                        } else {
                            // console.log(`     -> no`)
                        }
                    }
                }
            }
            // console.log(` -> bp for ${this.component.ref}.${this.shortName}: ${JSON.stringify(branchPoints)}`)
            this._branchPoints = branchPoints
        }
        return this._branchPoints
    }

    public get outgoingWires(): readonly Wire[] {
        return this._outgoingWires
    }

    public get isConnected(): boolean {
        return this._outgoingWires.length > 0
    }

    public get connectedWires() {
        return this._outgoingWires
    }

    protected preDestroy() {
        // we need to make a copy of the array because the wires will remove themselves from the array
        for (const wire of [...this._outgoingWires]) {
            this.parent.linkMgr.deleteWire(wire)
        }
    }

    public get acceptsMoreConnections() {
        return true
    }

    protected override positionChanged(__delta: [number, number]) {
        if (this._outgoingWires !== undefined) {
            for (const wire of this._outgoingWires) {
                wire.invalidateWirePath()
            }
        }
    }

    public findWireTo(node: NodeIn): Wire | undefined {
        return this._outgoingWires.find(wire => wire.endNode === node)
    }

    public get forceValue() {
        return this._forceValue
    }

    public set forceValue(newForceValue: LogicValue | undefined) {
        const oldVisibleValue = this.value
        this._forceValue = newForceValue
        this.propagateNewValueIfNeeded(oldVisibleValue)
        this.requestRedraw({ why: "changed forced output value", invalidateTests: true })
    }

    public get initialValue() {
        return this._initialValue
    }

    protected override propagateColor(color: WireColor) {
        for (const wire of this._outgoingWires) {
            wire.endNode.doSetColor(color)
        }
    }

    protected propagateNewValue(newValue: LogicValue) {
        const now = this.parent.editor.timeline.logicalTime()
        for (const wire of this._outgoingWires) {
            wire.propagateNewValue(newValue, now)
        }
    }

    protected override forceDraw() {
        return this._outgoingWires.length > 1 && this.component.alwaysDrawMultiOutNodes
    }

    protected get nodeDisplayStyle() {
        const disconnected = this._outgoingWires.length === 0
        return disconnected ? NodeStyle.OUT_DISCONNECTED : NodeStyle.OUT_CONNECTED
    }

    protected get currentDrawValue() {
        if (this._outgoingWires.length === 0) {
            return this.value
        }

        const refWire = this._outgoingWires[this._outgoingWires.length - 1]
        return refWire.drawnValueAt(refWire.wirePath.length.cumFracOfPart[0])
    }

    public override pointerDoubleClicked(e: PointerEvent): InteractionResult {
        const superChange = super.pointerDoubleClicked(e)
        if (superChange.isChange) {
            return superChange // already handled
        }
        if (this.parent.mode >= Mode.FULL && e.altKey && this.isOutput() && this.component.allowsForcedOutputs) {
            this.forceValue = (() => {
                switch (this._forceValue) {
                    case undefined: return Unknown
                    case Unknown: return HighImpedance
                    case HighImpedance: return false
                    case false: return true
                    case true: return undefined
                }
            })()
            return InteractionResult.SimpleChange
        }
        return InteractionResult.NoChange
    }

}

export const Node = {
    isOutput(node: Node): node is NodeOut {
        return node._tag === "_nodeout"
    },
}

export function tryMakeRepeatableNodeAction(startNode: NodeOut, endNode: NodeIn, handleNodes: (startNode: NodeOut, endNode: NodeIn) => boolean): InteractionResult {
    // if we just connected a group, we can repeat if there are
    // more free nodes in the group
    const startGroup = startNode.group
    const endGroup = endNode.group
    if (startGroup === undefined || endGroup === undefined) {
        return InteractionResult.SimpleChange
    }

    const startIndex = startGroup.indexOf(startNode)
    const startIncrement = startIndex < startGroup.nodes.length - 1 ? 1 : -1
    const endIndex = endGroup.indexOf(endNode)
    const endIncrement = endIndex < endGroup.nodes.length - 1 ? 1 : -1

    const makeRepeatFunction = function makeRepeatFunction(startIndex: number, endIndex: number): false | RepeatFunction {
        if (startIndex >= startGroup.nodes.length || startIndex < 0
            || endIndex >= endGroup.nodes.length || endIndex < 0) {
            return false
        }

        return () => {
            const success = handleNodes(startGroup.nodes[startIndex], endGroup.nodes[endIndex])
            if (success) {
                return makeRepeatFunction(startIndex + startIncrement, endIndex + endIncrement)
            }
            return false
        }

    }

    const repeat = makeRepeatFunction(startIndex + startIncrement, endIndex + endIncrement)
    if (repeat === false) {
        return InteractionResult.SimpleChange
    }

    return InteractionResult.RepeatableChange(repeat)
}