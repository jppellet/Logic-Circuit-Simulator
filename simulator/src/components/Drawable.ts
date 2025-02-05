import * as t from "io-ts"
import { ComponentList } from "../ComponentList"
import { DrawParams, LogicEditor } from "../LogicEditor"
import { type MoveManager } from "../MoveManager"
import { type NodeManager } from "../NodeManager"
import { RecalcManager, RedrawManager } from "../RedrawRecalcManager"
import { type SVGRenderingContext } from "../SVGRenderingContext"
import { TestSuites } from "../TestSuite"
import { TestsPalette } from "../TestsPalette"
import { MouseDragEvent, TouchDragEvent } from "../UIEventManager"
import { UndoManager } from "../UndoManager"
import { COLOR_COMPONENT_BORDER, COLOR_MOUSE_OVER, COLOR_MOUSE_OVER_DANGER, ColorString, DrawZIndex, GRID_STEP, inRect } from "../drawutils"
import { fixedWidthInContextMenu, Modifier, ModifierObject, span } from "../htmlgen"
import { IconName } from "../images"
import { S } from "../strings"
import { Expand, FixedArray, InteractionResult, Mode, PromiseOrValue, RichStringEnum, typeOrUndefined } from "../utils"
import { Component, ComponentBase } from "./Component"
import { type LinkManager } from "./Wire"

export type GraphicsRendering =
    | CanvasRenderingContext2D & {
        fill(): void,
        beginGroup(className?: string): void
        endGroup(): void,
        createPath(path?: Path2D | string): Path2D
    }
    | SVGRenderingContext

export interface DrawContext {
    g: GraphicsRendering
    drawParams: DrawParams
    isMouseOver: boolean
    borderColor: ColorString
    inNonTransformedFrame(f: (ctx: DrawContextExt) => unknown): void
}

export interface DrawContextExt extends DrawContext {
    rotatePoint(x: number, y: number): readonly [x: number, y: number]
}

export type MenuItem =
    | { _tag: "sep" }
    | {
        _tag: "text",
        caption: Modifier
    }
    | {
        _tag: "submenu",
        icon: IconName | undefined,
        caption: Modifier,
        items: MenuData
    }
    | {
        _tag: "item",
        icon: IconName | undefined,
        caption: Modifier,
        shortcut: string | undefined,
        danger: boolean | undefined,
        action: (itemEvent: MouseEvent | TouchEvent, menuEvent: MouseEvent | TouchEvent) => PromiseOrValue<InteractionResult | undefined | void>
    }

export type MenuData = MenuItem[]
export const MenuData = {
    sep(): MenuItem {
        return { _tag: "sep" }
    },
    text(caption: Modifier): MenuItem {
        return { _tag: "text", caption }
    },
    item(icon: IconName | undefined, caption: Modifier, action: (itemEvent: MouseEvent | TouchEvent, menuEvent: MouseEvent | TouchEvent) => PromiseOrValue<InteractionResult | undefined | void>, shortcut?: string, danger?: boolean): MenuItem {
        return { _tag: "item", icon, caption, action, shortcut, danger }
    },
    submenu(icon: IconName | undefined, caption: Modifier, items: MenuData): MenuItem {
        return { _tag: "submenu", icon, caption, items }
    },
}

export type MenuItemPlacement = "start" | "mid" | "end" // where to insert items created by components
export type MenuItems = Array<[MenuItemPlacement, MenuItem]>

class _DrawContextImpl implements DrawContext, DrawContextExt {

    private readonly entranceTransform: DOMMatrix
    private readonly entranceTransformInv: DOMMatrix
    private readonly componentTransform: DOMMatrix

    public constructor(
        comp: Drawable,
        public readonly g: GraphicsRendering,
        public readonly drawParams: DrawParams,
        public readonly isMouseOver: boolean,
        public readonly borderColor: ColorString,
    ) {
        this.entranceTransform = g.getTransform()
        this.entranceTransformInv = this.entranceTransform.inverse()
        comp.applyDrawTransform(g)
        this.componentTransform = g.getTransform()
    }

    public exit() {
        this.g.setTransform(this.entranceTransform)
    }

    public inNonTransformedFrame(f: (ctx: DrawContextExt) => unknown) {
        this.g.setTransform(this.entranceTransform)
        f(this)
        this.g.setTransform(this.componentTransform)
    }

    public rotatePoint(x: number, y: number): readonly [x: number, y: number] {
        return mult(this.entranceTransformInv, ...mult(this.componentTransform, x, y))
    }

}

function mult(m: DOMMatrix, x: number, y: number): [x: number, y: number] {
    return [
        m.a * x + m.c * y + m.e,
        m.b * x + m.d * y + m.f,
    ]
}

export interface DrawableParent {

    isMainEditor(): this is LogicEditor
    readonly editor: LogicEditor
    // nice to forward...
    readonly mode: Mode

    // implemented as one per (editor + instantiated custom component)
    readonly components: ComponentList
    readonly testSuites: TestSuites
    readonly nodeMgr: NodeManager
    readonly linkMgr: LinkManager
    readonly recalcMgr: RecalcManager

    // defined only when editing the main circuit or a custom comp
    readonly ifEditing: EditTools | undefined

    stopEditingThis(): void
    startEditingThis(tools: EditTools): void
}

export type EditTools = {
    readonly redrawMgr: RedrawManager
    readonly moveMgr: MoveManager
    readonly undoMgr: UndoManager
    readonly testsPalette: TestsPalette
    setDirty(reason: string): void
    setToolCursor(cursor: string | null): void
}

export abstract class Drawable {

    public readonly parent: DrawableParent
    private _ref: string | undefined = undefined

    protected constructor(parent: DrawableParent) {
        this.parent = parent
        this.setNeedsRedraw("newly created", true)
    }

    public get ref() {
        return this._ref
    }

    public doSetValidatedId(id: string | undefined) {
        // For components, the id must have been validated by a component list;
        // for other drawbles, ids are largely unregulated, they can be 
        // undefined or even duplicated since we don't refer to them for nodes
        this._ref = id
    }

    protected setNeedsRedraw(reason: string, invalidateMask: boolean = false, isPropagation: boolean = false) {
        this.parent.ifEditing?.redrawMgr.addReason(reason, this, invalidateMask, isPropagation)
    }

    public get drawZIndex(): DrawZIndex {
        return DrawZIndex.Normal
    }

    public draw(g: GraphicsRendering, drawParams: DrawParams): void {
        const inSelectionRect = drawParams.currentSelection?.isSelected(this) ?? false
        const isMouseOver = this === drawParams.currentMouseOverComp || inSelectionRect
        const borderColor = !isMouseOver
            ? COLOR_COMPONENT_BORDER
            : drawParams.anythingMoving && this.lockPos
                ? COLOR_MOUSE_OVER_DANGER
                : COLOR_MOUSE_OVER

        const ctx = new _DrawContextImpl(this, g, drawParams, isMouseOver, borderColor)
        try {
            this.doDraw(g, ctx)
        } finally {
            ctx.exit()
        }
    }

    public applyDrawTransform(__g: GraphicsRendering) {
        // by default, do nothing
    }

    protected abstract doDraw(g: GraphicsRendering, ctx: DrawContext): void

    public abstract isOver(x: number, y: number): boolean

    public abstract isInRect(rect: DOMRect): boolean

    public get lockPos(): boolean {
        return false
    }

    public cursorWhenMouseover(__e?: MouseEvent | TouchEvent): string | undefined {
        return undefined
    }

    public toString(): string {
        return `${this.constructor.name}(${this.toStringDetails()})`
    }

    protected toStringDetails(): string {
        return ""
    }

    public makeTooltip(): ModifierObject | undefined {
        return undefined
    }

    public makeContextMenu(): MenuData | undefined {
        return undefined
    }

    protected makeSetIdContextMenuItem(): MenuItem {
        const currentId = this._ref
        const s = S.Components.Generic.contextMenu
        const caption: Modifier = currentId === undefined ? s.SetIdentifier : span(s.ChangeIdentifier[0], span(fixedWidthInContextMenu, currentId), s.ChangeIdentifier[1])
        return MenuData.item("ref", caption, () => {
            this.runSetIdDialog()
        }, "⌥↩︎")
    }

    private runSetIdDialog() {
        const s = S.Components.Generic.contextMenu
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const currentId = this._ref
            const newId = window.prompt(s.SetIdentifierPrompt, currentId)
            if (newId === null) {
                // cancel button pressed
                break
            }
            if (newId === currentId) {
                // no change
                break
            }

            if (!(this instanceof ComponentBase)) {
                // ids are unregulated
                this.doSetValidatedId(newId.length === 0 ? undefined : newId)

            } else {
                // we're a component, check with the component list
                if (newId.length === 0) {
                    window.alert(s.IdentifierCannotBeEmpty)
                    continue
                }
                const componentList = this.parent.components
                const otherComp = componentList.get(newId)
                if (otherComp === undefined) {
                    // OK button pressed
                    componentList.changeIdOf(this, newId)
                } else {
                    if (window.confirm(s.IdentifierAlreadyInUseShouldSwap)) {
                        componentList.swapIdsOf(otherComp, this)
                    } else {
                        continue
                    }
                }
            }
            this.setNeedsRedraw("ref changed")
            break
        }
    }

    // Return { wantsDragEvents: true } (default) to signal the component
    // wants to get all mouseDragged and the final mouseUp event. Useful to
    // return false to allow drag destinations to get a mouseUp
    public mouseDown(__: MouseEvent | TouchEvent): { wantsDragEvents: boolean } {
        // empty default implementation
        return { wantsDragEvents: true }
    }

    public mouseDragged(__: MouseEvent | TouchEvent) {
        // empty default implementation
    }

    public mouseUp(__: MouseEvent | TouchEvent): InteractionResult {
        // empty default implementation
        return InteractionResult.NoChange
    }

    // Return true to indicate it was handled and had an effect
    // (and presumably doesn't need to be handled any more)
    public mouseClicked(__: MouseEvent | TouchEvent): InteractionResult {
        // empty default implementation
        return InteractionResult.NoChange
    }

    // Return true to indicate it was handled and had an effect
    // (and presumably doesn't need to be handled any more)
    public mouseDoubleClicked(__: MouseEvent | TouchEvent): InteractionResult {
        // empty default implementation
        return InteractionResult.NoChange
    }

    public keyDown(e: KeyboardEvent): void {
        if (e.key === "Enter" && e.altKey) {
            this.runSetIdDialog()
        }
    }

}


// implemented by components with no array to hold the members
// for direct access for performance
export interface HasPosition {

    readonly posX: number
    readonly posY: number

}

export const Orientations_ = {
    "e": {},
    "s": {},
    "w": {},
    "n": {},
} as const

export const Orientations = RichStringEnum.withProps<{
}>()(Orientations_)


export type Orientation = typeof Orientations.type

export const Orientation = {
    default: "e" as Orientation,
    invert(o: Orientation): Orientation {
        switch (o) {
            case "e": return "w"
            case "w": return "e"
            case "n": return "s"
            case "s": return "n"
        }
    },
    nextClockwise(o: Orientation): Orientation {
        switch (o) {
            case "e": return "s"
            case "s": return "w"
            case "w": return "n"
            case "n": return "e"
        }
    },
    nextCounterClockwise(o: Orientation): Orientation {
        switch (o) {
            case "e": return "n"
            case "n": return "w"
            case "w": return "s"
            case "s": return "e"
        }
    },
    isVertical(o: Orientation): o is "s" | "n" {
        return o === "s" || o === "n"
    },
    add(compOrient: Orientation, nodeOrient: Orientation): Orientation {
        switch (compOrient) {
            case "e": return nodeOrient
            case "w": return Orientation.invert(nodeOrient)
            case "s": return Orientation.nextClockwise(nodeOrient)
            case "n": return Orientation.nextCounterClockwise(nodeOrient)
        }
    },
}


// for compact JSON repr, pos is an array
export const PositionSupportRepr = t.type({
    pos: t.readonly(t.tuple([t.number, t.number])),
    anchor: typeOrUndefined(t.string),
    lockPos: typeOrUndefined(t.boolean),
    orient: typeOrUndefined(t.keyof(Orientations_)),
    ref: typeOrUndefined(t.string),
})

export type PositionSupportRepr = Expand<t.TypeOf<typeof PositionSupportRepr>>


export abstract class DrawableWithPosition extends Drawable implements HasPosition {

    private _posX: number
    private _posY: number
    private _lockPos: boolean
    private _orient: Orientation
    protected _anchor: Component | undefined = undefined // not set in ctor, always begins as undefined

    protected constructor(parent: DrawableParent, saved?: PositionSupportRepr) {
        super(parent)

        // using null and not undefined to prevent subclasses from
        // unintentionally skipping the parameter

        if (saved !== undefined) {
            // restoring from saved object
            this.doSetValidatedId(saved.ref)
            this._posX = saved.pos[0]
            this._posY = saved.pos[1]
            this._lockPos = saved.lockPos ?? false
            this._orient = saved.orient ?? Orientation.default
        } else {
            // creating new object
            const editor = this.parent.editor
            this._posX = Math.max(0, editor.mouseX)
            this._posY = editor.mouseY
            this._lockPos = false
            this._orient = Orientation.default
        }
    }

    protected toJSONBase(): PositionSupportRepr {
        return {
            pos: [this.posX, this.posY] as const,
            lockPos: !this._lockPos ? undefined : true,
            orient: this.orient === Orientation.default ? undefined : this.orient,
            anchor: this._anchor?.ref,
            ref: this.ref, // last because usually stripped by serialization
        }
    }

    public abstract get anchor()

    public abstract set anchor(anchor: Component | undefined)

    public get posX() {
        return this._posX
    }

    public get posY() {
        return this._posY
    }

    public override get lockPos() {
        return this._lockPos
    }

    public isInRect(rect: DOMRect) {
        return this._posX >= rect.left && this._posX <= rect.right && this._posY >= rect.top && this._posY <= rect.bottom
    }

    public get orient() {
        return this._orient
    }

    public canRotate() {
        return true
    }

    public canLockPos() {
        return true
    }

    public doSetLockPos(lockPos: boolean) {
        this._lockPos = lockPos
        // no need to redraw
    }

    public doSetOrient(newOrient: Orientation) {
        this._orient = newOrient
        this.setNeedsRedraw("orientation changed", true)
    }

    public get width(): number {
        return Orientation.isVertical(this._orient) ? this.unrotatedHeight : this.unrotatedWidth
    }

    public get height(): number {
        return Orientation.isVertical(this._orient) ? this.unrotatedWidth : this.unrotatedHeight
    }

    public abstract get unrotatedWidth(): number

    public abstract get unrotatedHeight(): number

    public override applyDrawTransform(g: GraphicsRendering) {
        const abcd: FixedArray<number, 4> | undefined = (() => {
            switch (this._orient) {
                case "e": return undefined
                case "s": return [0, 1, -1, 0]
                case "w": return [-1, 0, 0, -1]
                case "n": return [0, -1, 1, 0]
            }
        })()

        if (abcd !== undefined) {
            g.translate(this.posX, this.posY)
            g.transform(...abcd, 0, 0)
            g.translate(-this.posX, -this.posY)
        }
    }

    public isOver(x: number, y: number) {
        return this.parent.mode >= Mode.CONNECT && inRect(this._posX, this._posY, this.width, this.height, x, y)
    }

    protected trySetPosition(posX: number, posY: number, snapToGrid: boolean): undefined | [number, number] {
        const newPos = this.tryMakePosition(posX, posY, snapToGrid)
        if (newPos === undefined) {
            return
        }
        this.doSetPosition(newPos[0], newPos[1])
        return newPos
    }

    protected tryMakePosition(posX: number, posY: number, snapToGrid: boolean): undefined | [number, number] {
        const roundTo = snapToGrid ? (GRID_STEP / 2) : 1
        posX = Math.round(posX / roundTo) * roundTo
        posY = Math.round(posY / roundTo) * roundTo
        if (posX !== this._posX || posY !== this.posY) {
            return [posX, posY]
        }
        return undefined
    }

    protected doSetPosition(posX: number, posY: number) {
        const delta: [number, number] = [posX - this._posX, posY - this._posY]
        this._posX = posX
        this._posY = posY
        this.setNeedsRedraw("position changed", true)
        this.positionChanged(delta)
    }

    protected abstract positionChanged(delta: [number, number]): void

    protected makeOrientationAndPosMenuItems(): MenuItems {
        const s = S.Components.Generic.contextMenu

        const shortcuts = { e: "→", s: "↓", w: "←", n: "↑" }
        const rotateItem: MenuItems = !this.canRotate() ? [] : [
            ["start", MenuData.submenu("direction", s.Orientation, [
                ...Orientations.values.map(orient => {
                    const isCurrent = this._orient === orient
                    const icon = isCurrent ? "check" : "none"
                    const caption = S.Orientations[orient]
                    const action = isCurrent ? () => undefined : () => {
                        this.doSetOrient(orient)
                    }
                    return MenuData.item(icon, caption, action, shortcuts[orient])
                }),
                MenuData.sep(),
                MenuData.text(s.ChangeOrientationDesc),
            ])],
        ]

        const lockPosItem: MenuItems = !this.canLockPos() ? [] : [
            ["start", MenuData.item(this.lockPos ? "check" : "none", s.LockPosition, () => {
                this.doSetLockPos(!this.lockPos)
            }, "L")],
        ]

        const anchorItem: MenuItems = this._anchor === undefined ? [
            ["start", MenuData.item("none", s.SetAnchor, () => {
                this.parent.editor.showMessage(S.Messages.SetAnchorPrompt)
                this.parent.editor.setCurrentMouseAction("setanchor", false, this)
            })],
        ] : [
            ["start", MenuData.item("none", span(s.ClearAnchor[0], span(fixedWidthInContextMenu, this._anchor.ref ?? "???"), s.ClearAnchor[1]), () => {
                this.anchor = undefined
            })],
        ]

        return [...rotateItem, ...lockPosItem, ...anchorItem]
    }

    public override keyDown(e: KeyboardEvent): void {
        if (this.canRotate()) {
            if (e.key === "ArrowRight") {
                this.doSetOrient("e")
                return
            } else if (e.key === "ArrowDown") {
                this.doSetOrient("s")
                return
            } else if (e.key === "ArrowLeft") {
                this.doSetOrient("w")
                return
            } else if (e.key === "ArrowUp") {
                this.doSetOrient("n")
                return
            }
        }
        if (this.canLockPos()) {
            if (e.key === "l") {
                this.doSetLockPos(!this.lockPos)
                return
            }
        }
        super.keyDown(e)
    }

}


interface DragContext {
    mouseOffsetToPosX: number
    mouseOffsetToPosY: number
    lastAnchorX: number
    lastAnchorY: number
    createdClone: DrawableWithDraggablePosition | undefined
}


export abstract class DrawableWithDraggablePosition extends DrawableWithPosition {

    private _isMovingWithContext: undefined | DragContext = undefined

    protected constructor(parent: DrawableParent, saved?: PositionSupportRepr) {
        super(parent, saved)
    }

    public get anchor() {
        return this._anchor
    }

    // This will typically be called in the deserialization once all components
    // have been created
    public set anchor(anchor: Component | undefined) {
        if (this._anchor !== anchor) {
            if (this._anchor !== undefined) {
                this._anchor.removeAnchoredDrawable(this)
            }
            this._anchor = anchor
            if (anchor !== undefined) {
                anchor.addAnchoredDrawable(this)
            }
        }
    }

    public get isMoving() {
        return this._isMovingWithContext !== undefined
    }

    private tryStartMoving(e: MouseEvent | TouchEvent) {
        if (this.lockPos) {
            return
        }
        if (this._isMovingWithContext === undefined) {
            const [offsetX, offsetY] = this.parent.editor.offsetXY(e)
            this._isMovingWithContext = {
                mouseOffsetToPosX: offsetX - this.posX,
                mouseOffsetToPosY: offsetY - this.posY,
                lastAnchorX: this.posX,
                lastAnchorY: this.posY,
                createdClone: undefined,
            }
        }
    }

    private tryStopMoving(e: MouseEvent | TouchEvent): boolean {
        let wasMoving = false
        if (this._isMovingWithContext !== undefined) {
            this._isMovingWithContext = undefined
            wasMoving = true
        }
        this.parent.ifEditing?.moveMgr.setDrawableStoppedMoving(this, e)
        return wasMoving
    }


    public setPosition(x: number, y: number, snapToGrid: boolean) {
        const newPos = this.tryMakePosition(x, y, snapToGrid)
        if (newPos !== undefined) { // position would change indeed
            this.doSetPosition(...newPos)
        }
    }

    public override mouseDown(e: MouseEvent | TouchEvent) {
        if (this.parent.mode >= Mode.CONNECT) {
            if (e.metaKey) {
                this.parent.linkMgr.startSettingAnchorFrom(this)
                return { wantsDragEvents: false }
            }
            this.tryStartMoving(e)
        }
        return { wantsDragEvents: true }
    }

    public override mouseDragged(e: MouseDragEvent | TouchDragEvent) {
        if (this.parent.mode >= Mode.CONNECT && !this.lockPos) {
            this.parent.ifEditing?.moveMgr.setDrawableMoving(this, e)
            const [x, y] = this.parent.editor.offsetXY(e)
            const snapToGrid = !e.metaKey
            this.updateSelfPositionIfNeeded(x, y, snapToGrid, e)
        }
    }

    public override mouseUp(e: MouseEvent | TouchEvent): InteractionResult {
        this._isMovingWithContext?.createdClone?.mouseUp(e)
        const result = this.tryStopMoving(e)
        return InteractionResult.fromBoolean(result)
    }

    protected updateSelfPositionIfNeeded(x: number, y: number, snapToGrid: boolean, e: MouseDragEvent | TouchDragEvent): undefined | [number, number] {
        if (this._isMovingWithContext === undefined) {
            return undefined
        }
        const { mouseOffsetToPosX, mouseOffsetToPosY, lastAnchorX, lastAnchorY, createdClone } = this._isMovingWithContext

        if (createdClone !== undefined) {
            createdClone.mouseDragged(e)
            return undefined
        }

        let targetX = x - mouseOffsetToPosX
        let targetY = y - mouseOffsetToPosY
        if (e.shiftKey) {
            // move along axis only
            const dx = Math.abs(lastAnchorX - targetX)
            const dy = Math.abs(lastAnchorY - targetY)
            if (dx <= dy) {
                targetX = lastAnchorX
            } else {
                targetY = lastAnchorY
            }
        }
        const newPos = this.tryMakePosition(targetX, targetY, snapToGrid)
        if (newPos === undefined) {
            return undefined
        }

        let clone
        if (e.altKey && this.parent.mode >= Mode.DESIGN && (clone = this.makeClone(true)) !== undefined) {
            this._isMovingWithContext.createdClone = clone
            this.parent.editor.eventMgr.setCurrentMouseOverComp(clone)
        } else {
            this.doSetPosition(...newPos)
        }
        return newPos
    }

    protected makeClone(__setSpawning: boolean): DrawableWithDraggablePosition | undefined {
        return undefined
    }

}
