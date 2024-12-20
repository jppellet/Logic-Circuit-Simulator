import { drawWaypoint, GRID_STEP, isOverWaypoint, NodeStyle, WAYPOINT_DIAMETER } from "../drawutils"
import { HighImpedance, InteractionResult, isUnknown, LogicValue, Mode, RepeatFunction, toLogicValue, Unknown } from "../utils"
import { Component, InputNodeRepr, NodeGroup, OutputNodeRepr } from "./Component"
import { DrawableWithPosition, DrawContext, GraphicsRendering, Orientation } from "./Drawable"
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

export abstract class NodeBase<N extends Node> extends DrawableWithPosition {

    public readonly id: number
    private _isAlive = true
    private _value: LogicValue = false
    private _leadLength: number
    protected _initialValue: LogicValue | undefined = undefined
    protected _forceValue: LogicValue | undefined
    protected _color: WireColor = DEFAULT_WIRE_COLOR

    public constructor(
        public readonly component: Component,
        nodeSpec: InputNodeRepr | OutputNodeRepr,
        public readonly group: NodeGroup<N> | undefined,
        public readonly shortName: string,
        public readonly fullName: string,
        private _gridOffsetX: number,
        private _gridOffsetY: number,
        public readonly hasTriangle: boolean,
        relativePosition: Orientation,
        private readonly _leadLengthOverride: number | undefined,
    ) {
        super(component.parent)
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

    public updateLeadLength() {
        return this._leadLength = this._leadLengthOverride ?? this.defaultLeadLength(Orientation.isVertical(this.orient))
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
        this.setNeedsRedraw("color changed")
    }

    protected propagateColor(__color: WireColor) {
        // nothing by default; overridden in NodeOut
    }

    public override isOver(x: number, y: number) {
        return this.parent.mode >= Mode.CONNECT
            && isOverWaypoint(x, y, this.posX, this.posY)
            && this.acceptsMoreConnections
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
        drawWaypoint(g, ctx, this.posX, this.posY, this.nodeDisplayStyle, this.value, ctx.isMouseOver, neutral, showForced, showForcedWarning, parentOrientIsVertical)
    }

    protected abstract get nodeDisplayStyle(): NodeStyle

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
            this.propagateNewValueIfNecessary(oldVisibleValue)
        }
    }

    protected propagateNewValueIfNecessary(oldVisibleValue: LogicValue) {
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

    public abstract get isDisconnected(): boolean

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

    public override cursorWhenMouseover(__e?: MouseEvent | TouchEvent) {
        return "crosshair"
    }

    public override mouseDown(__: MouseEvent | TouchEvent) {
        this.parent.linkMgr.startDraggingWireFrom(this.asNode)
        return { wantsDragEvents: false }
    }

    public override mouseUp(__: MouseEvent | TouchEvent) {
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

    protected preDestroy() {
        if (this._incomingWire !== null) {
            this.parent.linkMgr.deleteWire(this._incomingWire)
        }
    }

    public get acceptsMoreConnections() {
        return this._incomingWire === null
    }

    public get isDisconnected() {
        return this._incomingWire === null
    }

    public get forceValue() {
        return undefined
    }

    public get initialValue() {
        return undefined
    }

    protected propagateNewValue(__newValue: LogicValue) {
        this.component.setNeedsRecalc()
    }

    protected get nodeDisplayStyle() {
        const disconnected = this._incomingWire === null
        return disconnected ? NodeStyle.IN_DISCONNECTED : NodeStyle.IN_CONNECTED
    }

}


export class NodeOut extends NodeBase<NodeOut> {

    public readonly _tag = "_nodeout"

    private readonly _outgoingWires: Wire[] = []

    public get isClock() {
        return false
    }

    public addOutgoingWire(wire: Wire) {
        // don't add the same wire twice
        const i = this._outgoingWires.indexOf(wire)
        if (i === -1) {
            this._outgoingWires.push(wire)
        }
    }

    public removeOutgoingWire(wire: Wire) {
        const i = this._outgoingWires.indexOf(wire)
        if (i !== -1) {
            this._outgoingWires.splice(i, 1)
        }
    }

    public get outgoingWires(): readonly Wire[] {
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

    public get isDisconnected() {
        return this._outgoingWires.length === 0
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
        this.propagateNewValueIfNecessary(oldVisibleValue)
        this.setNeedsRedraw("changed forced output value")
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

    public override mouseDoubleClicked(e: MouseEvent | TouchEvent): InteractionResult {
        const superChange = super.mouseDoubleClicked(e)
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