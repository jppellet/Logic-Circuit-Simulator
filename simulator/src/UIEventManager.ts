import { createPopper as createTooltip, Instance as TooltipInstance } from '@popperjs/core'
import { ButtonDataset } from './ComponentFactory'
import { Component, ComponentBase, ComponentState } from './components/Component'
import { CustomComponent } from './components/CustomComponent'
import { Drawable, DrawableWithDraggablePosition, DrawableWithPosition, MenuData, MenuItem } from "./components/Drawable"
import { Node, NodeBase } from "./components/Node"
import { Waypoint, Wire } from './components/Wire'
import { distSquared, DrawZIndex, GRID_STEP, setColorPointerOverIsDanger } from "./drawutils"
import { applyModifiersTo, button, cls, emptyMod, li, Modifier, ModifierObject, mods, span, type, ul } from './htmlgen'
import { IconName, makeIcon } from './images'
import { LogicEditor, PointerAction, PoionterActionParams } from './LogicEditor'
import { S } from './strings'
import { getScrollParent, InteractionResult, Mode, targetIsFieldOrOtherInput, TimeoutHandle } from "./utils"

type PointerDownData = {
    mainComp: Drawable | Element
    selectionComps: Drawable[]
    firedPointerDraggedAlready: boolean
    fireClickedOnFinish: boolean
    initialXY: [number, number]
    triggeredContextMenu: boolean
}

export type PointerDragEvent = PointerEvent & { dragStartX: number, dragStartY: number }

function setDragStartOnEvent(e: PointerEvent, dragStartX: number, dragStartY: number): asserts e is PointerDragEvent {
    const _e = e as any
    _e.dragStartX = dragStartX
    _e.dragStartY = dragStartY
}
function preventDefaultAlways(e: Event) {
    e.preventDefault()
}


export class EditorSelection {

    /**
     * The elements that are selected, independently of the potential
     * rectangle that is currently drawn
     */
    public previouslySelectedElements = new Set<Drawable>()

    public constructor(
        public currentlyDrawnRect: DOMRect | undefined,
    ) { }

    public toggle(elem: Drawable) {
        if (this.previouslySelectedElements.has(elem)) {
            this.previouslySelectedElements.delete(elem)
        } else {
            this.previouslySelectedElements.add(elem)
        }
    }

    public finishCurrentRect(editor: LogicEditor) {
        let rect
        if ((rect = this.currentlyDrawnRect) !== undefined) {
            for (const comp of editor.components.all()) {
                if (comp.isInRect(rect)) {
                    this.toggle(comp)
                }
            }

            for (const wire of editor.linkMgr.wires) {
                for (const point of wire.waypoints) {
                    if (point.isInRect(rect)) {
                        this.toggle(point)
                    }
                }
            }

            this.currentlyDrawnRect = undefined
        }
    }

    public isSelected(component: Drawable): boolean {
        const prevSelected = this.previouslySelectedElements.has(component)
        const rect = this.currentlyDrawnRect
        if (rect === undefined) {
            return prevSelected
        } else {
            const inverted = component.isInRect(rect)
            return inverted ? !prevSelected : prevSelected
        }
    }

}


export class UIEventManager {

    public readonly editor: LogicEditor
    private _currentComponentUnderPointer: Drawable | null = null
    private _currentTooltip: [tooltip: TooltipInstance, removeScrollListener: () => void] | null = null
    private _currentPointerDownData: PointerDownData | null = null
    private _startHoverTimeoutHandle: TimeoutHandle | null = null
    private _longPressTimeoutHandle: TimeoutHandle | null = null
    private _currentAction: PointerAction
    private _currentHandlers: ToolHandlers
    private _lastTouchEnd: [Drawable, number] | undefined = undefined
    public currentSelection: EditorSelection | undefined = undefined

    public constructor(editor: LogicEditor) {
        this.editor = editor
        this._currentAction = "edit"
        this._currentHandlers = new EditHandlers(editor)
    }

    public get currentComponentUnderPointer() {
        return this._currentComponentUnderPointer
    }

    public get currentPointerDownData() {
        return this._currentPointerDownData
    }


    public setHandlersFor<M extends PointerAction>(action: M, ...params: PoionterActionParams<M>): boolean {
        if (action === this._currentAction) {
            return false
        }
        this._currentAction = action
        const newHandlers = (() => {
            switch (action) {
                case "delete":
                    return new DeleteHandlers(this.editor)
                case "move":
                    return new MoveHandlers(this.editor)
                case "setanchor":
                    return new SetAnchorHandlers(this.editor, ...(params as PoionterActionParams<"setanchor">))
                case "edit": default:
                    return new EditHandlers(this.editor)
            }
        })()
        this._currentHandlers.unmount()
        this._currentHandlers = newHandlers
        setColorPointerOverIsDanger(action === "delete")
        return true
    }

    public startLongPressTimeout(startPointerDownData: PointerDownData, e: PointerEvent) {
        // we do this because firefox otherwise sets back offsetX/Y to 0
        const _e = e as any
        _e._savedOffsetX = _e.offsetX
        _e._savedOffsetY = _e.offsetY
        _e._savedTarget = _e.target

        this._longPressTimeoutHandle = setTimeout(
            this.editor.wrapHandler(() => {
                let cancelLongPressAction = false
                const endPointerDownData = this._currentPointerDownData
                if (endPointerDownData !== null) {
                    // mark this as handled and not needing a click event
                    endPointerDownData.fireClickedOnFinish = false
                    if (endPointerDownData.triggeredContextMenu) {
                        // cancel the long press action if a context menu was already triggered
                        cancelLongPressAction = true
                    }
                }
                if (cancelLongPressAction) {
                    return
                }

                // for mouse events, we trigger a drag after some time
                if (e.pointerType === "mouse") {
                    const [dragStartX, dragStartY] = this.editor.offsetXY(e, true)
                    setDragStartOnEvent(e, dragStartX, dragStartY)
                    if (startPointerDownData.mainComp instanceof Drawable) {
                        this._currentHandlers.pointerDraggedOn(startPointerDownData.mainComp, e)
                    }
                    for (const comp of startPointerDownData.selectionComps) {
                        this._currentHandlers.pointerDraggedOn(comp, e)
                    }
                } else {
                    // for touch events, we trigger a context menu
                    if (this.editor.mode >= Mode.CONNECT && startPointerDownData.mainComp instanceof Drawable) {
                        this._currentHandlers.contextMenuOn(startPointerDownData.mainComp, e)
                    }
                }
            }),
            500
        )
    }

    public clearLongPressTimeout() {
        if (this._longPressTimeoutHandle !== null) {
            clearTimeout(this._longPressTimeoutHandle)
            this._longPressTimeoutHandle = null
        }
    }

    public clearHoverTimeoutHandle() {
        if (this._startHoverTimeoutHandle !== null) {
            clearTimeout(this._startHoverTimeoutHandle)
            this._startHoverTimeoutHandle = null
        }
    }

    public setCurrentComponentUnderPointer(comp: Drawable | null) {
        if (comp !== this._currentComponentUnderPointer) {
            this.clearTooltipIfNeeded()
            this.clearHoverTimeoutHandle()

            this._currentComponentUnderPointer = comp
            if (comp !== null) {
                this._startHoverTimeoutHandle = setTimeout(() => {
                    this._currentHandlers.pointerHoverOn(comp)
                    this._startHoverTimeoutHandle = null
                }, 1200)
            }
            this.editor.editTools.redrawMgr.requestRedraw({ why: "pointerover changed" })
            // console.log("Over component: ", comp)
        }
    }

    public currentSelectionEmpty() {
        return this.currentSelection === undefined || this.currentSelection.previouslySelectedElements.size === 0
    }

    public updateComponentUnderPointer([x, y]: [number, number], pullingWire: boolean, settingAnchor: boolean, isTouch: boolean) {

        // Here is the pointerover search order:
        // * Components - overlays
        // * Components - normal, and nodes, sometimes
        // * Wires, sometimes
        // * Components - background
        // We use isTouchMove to determine if we should make finger connections to nodes easier by being more tolerant

        const findComponenentUnderPointer: () => Drawable | null = () => {
            // easy optimization: maybe we're still over the
            // same component as before, so quickly check this
            const prevCompUnderPointer = this._currentComponentUnderPointer
            if (prevCompUnderPointer !== null && prevCompUnderPointer.drawZIndex !== 0) {
                // second condition says: always revalidate the pointerover of background components (with z index 0)

                // we always revalidate wires and nodes (because of tolerant hit radiuses)
                // if we're setting an anchor, we only want components, not drawables
                const rejectThis = prevCompUnderPointer instanceof Wire ||
                    prevCompUnderPointer instanceof NodeBase ||
                    (settingAnchor && !(prevCompUnderPointer instanceof ComponentBase))
                if (!rejectThis && prevCompUnderPointer.isOver(x, y)) {
                    return this._currentComponentUnderPointer
                }
            }
            const root = this.editor.editorRoot

            // overlays
            if (!pullingWire) {
                for (const comp of root.components.withZIndex(DrawZIndex.Overlay)) {
                    if (comp.isOver(x, y)) {
                        return comp
                    }
                }
            }

            // normal components or their nodes
            for (const comp of root.components.withZIndex(DrawZIndex.Normal)) {
                let nodeOver: Node | undefined = undefined
                let bestDistanceSquared = Number.POSITIVE_INFINITY
                if (!settingAnchor) {
                    // check nodes -- all of them to be able to get the smallest distance,
                    // which prevents too big hit radius from making "hidden" nodes unreachable
                    for (const node of comp.allNodes()) {
                        const dist = node.distSquaredIfOver(x, y, isTouch)
                        if (dist !== undefined && dist < bestDistanceSquared) {
                            bestDistanceSquared = dist
                            nodeOver = node
                        }
                    }
                }
                if (nodeOver !== undefined && (!pullingWire || root.linkMgr.isValidNodeToConnect(nodeOver))) {
                    return nodeOver
                }
                if (!pullingWire && comp.isOver(x, y)) {
                    return comp
                }
            }

            const showHiddenWires = this.editor.options.showHiddenWires
            if (!pullingWire && !settingAnchor) {
                // wires
                for (const wire of root.linkMgr.wires) {
                    if (!showHiddenWires && wire.isHidden) {
                        continue
                    }
                    for (const waypoint of wire.waypoints) {
                        if (waypoint.isOver(x, y)) {
                            return waypoint
                        }
                    }
                    if (wire.isOver(x, y)) {
                        return wire
                    }
                }
            }

            if (!pullingWire) {
                // background elems
                for (const comp of root.components.withZIndex(DrawZIndex.Background)) {
                    if (comp.isOver(x, y)) {
                        return comp
                    }
                }
            }

            return null
        }

        const comp = findComponenentUnderPointer()
        this.setCurrentComponentUnderPointer(comp)
    }

    public selectAll() {
        const sel = new EditorSelection(undefined)
        this.currentSelection = sel
        const root = this.editor.editorRoot
        for (const comp of root.components.all()) {
            sel.previouslySelectedElements.add(comp)
        }
        for (const wire of root.linkMgr.wires) {
            for (const waypoint of wire.waypoints) {
                sel.previouslySelectedElements.add(waypoint)
            }
        }
        this.editor.editTools.redrawMgr.requestRedraw({ why: "selected all" })
    }

    public toggleSelect(comp: Drawable) {
        let sel
        if ((sel = this.currentSelection) === undefined) {
            sel = new EditorSelection(undefined)
            this.currentSelection = sel
        }
        sel.toggle(comp)
        this.editor.editTools.redrawMgr.requestRedraw({ why: "toggled selection" })
    }

    private moveSelection(dx: number, dy: number, snapToGrid: boolean): boolean {
        const sel = this.currentSelection
        if (sel === undefined || sel.previouslySelectedElements.size === 0) {
            return false
        }
        for (const comp of sel.previouslySelectedElements) {
            if (comp instanceof DrawableWithDraggablePosition) {
                comp.setPosition(comp.posX + dx, comp.posY + dy, snapToGrid)
            }
        }
        return true
    }


    public clearTooltipIfNeeded() {
        if (this._currentTooltip !== null) {
            const [tooltip, removeListener] = this._currentTooltip
            removeListener()
            tooltip.destroy()
            this._currentTooltip = null
            this.editor.html.tooltipElem.style.display = "none"
        }
    }

    public makeTooltip(tooltipHtml: ModifierObject, rect: () => DOMRect) {
        const { tooltipContents, tooltipElem, mainCanvas } = this.editor.html
        tooltipContents.innerHTML = ""
        tooltipHtml.applyTo(tooltipContents)
        tooltipElem.style.removeProperty("display")
        const tooltip = createTooltip({
            getBoundingClientRect: rect,
            contextElement: mainCanvas,
        }, tooltipElem, {
            placement: 'right',
            modifiers: [{ name: 'offset', options: { offset: [4, 8] } }],
        })

        const scrollParent = getScrollParent(mainCanvas)
        const scrollListener = () => tooltip.update()
        scrollParent.addEventListener("scroll", scrollListener)
        const removeListener = () => scrollParent.removeEventListener("scroll", scrollListener)
        this._currentTooltip = [tooltip, removeListener]

        tooltipElem.setAttribute('data-show', '')
        tooltip.update()
    }

    public hideContextMenuIfNeeded(e: PointerEvent) {
        this._currentHandlers.hideContextMenuIfNeeded(e)
    }

    public registerCanvasListenersOn(canvas: HTMLCanvasElement) {
        const editor = this.editor

        const returnFalse = () => false
        const preventDefaultIfCanConnect = (e: Event) => {
            // prevent scrolling when we can connect
            if (this.editor.mode >= Mode.CONNECT) {
                e.preventDefault()
            }
        }

        // Prevent scrolling
        canvas.ontouchstart = preventDefaultIfCanConnect
        canvas.ontouchmove = preventDefaultIfCanConnect
        canvas.ontouchend = preventDefaultAlways

        // Handle pointer events

        // Typical sequence:
        // pointerenter -> pointerover -> pointerdown? -> pointermove* -> pointerup || pointercancel -> pointerout -> pointerleave
        // We're interested in:           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

        // We don't use e.isPrimary since there could be several primary pointers, one
        // per pointer type. Instead, we use the pointerId to determine the one to listen to.
        // We still use custom logic to move and zoom the canvas when two pointers are used.

        // This tracks the active pointers, the first one being our main pointer
        const downPointers: Map<number, PointerEvent> = new Map()
        let trackedPointerId: number | undefined = undefined

        type Transform = { zoom: number, tX: number, tY: number }
        type PointersLoc = { dist: number, centerX: number, centerY: number }
        let currentZoomSession: { initialTransform: Transform, initialPointersLoc: PointersLoc } | undefined = undefined

        const cancelZoomSession = () => {
            if (currentZoomSession !== undefined) {
                // round final translation offset to not be off-grid
                const translationRoundTo = GRID_STEP / 2
                const tX = Math.round(editor.translationX / translationRoundTo) * translationRoundTo
                const tY = Math.round(editor.translationY / translationRoundTo) * translationRoundTo
                editor.setTranslation(tX, tY)
                currentZoomSession = undefined
            }
        }

        const applyZoomAndTranslation = (zoom: number, startGestureX: number, startGestureY: number, endGestureX: number, endGestureY: number) => {
            const effectiveZoom = editor.setZoom(zoom, true)
            const effectiveScale = effectiveZoom / 100
            const tX = endGestureX / effectiveScale - startGestureX
            const tY = endGestureY / effectiveScale - startGestureY
            editor.setTranslation(tX, tY)
        }

        const getTwoPointersLoc = (skipTransform: boolean): PointersLoc => {
            if (downPointers.size !== 2) {
                throw new Error("Pointer distance called with " + downPointers.size + " pointers instead of 2")
            }
            const pointerEvents = downPointers.values()
            const p1 = pointerEvents.next().value!
            const p2 = pointerEvents.next().value!
            const [p1X, p1Y] = editor.offsetXY(p1, skipTransform)
            const [p2X, p2Y] = editor.offsetXY(p2, skipTransform)
            const centerX = (p1X + p2X) / 2
            const centerY = (p1Y + p2Y) / 2
            const dx = p1X - p2X
            const dy = p1Y - p2Y
            const dist = Math.sqrt(dx * dx + dy * dy)
            return { dist, centerX, centerY }
        }

        canvas.onpointerdown = editor.wrapHandler(e => {
            const pointerId = e.pointerId
            canvas.setPointerCapture(pointerId)
            downPointers.set(pointerId, e)

            const numPointers = downPointers.size
            if (numPointers === 2) {
                // finish previous pointer session
                this.doPointerUp(e)
                trackedPointerId = undefined

                if (editor.mode >= Mode.CONNECT) {
                    // we'll start a zoom session
                    const initialTransform = {
                        zoom: this.editor.userDrawingScale * 100,
                        tX: this.editor.translationX,
                        tY: this.editor.translationY,
                    }
                    currentZoomSession = {
                        initialTransform,
                        initialPointersLoc: getTwoPointersLoc(false),
                    }
                }
            } else {
                cancelZoomSession()
            }

            if (numPointers === 1) {
                // start handling these pointer's events
                trackedPointerId = pointerId
                this.doPointerDown(e)
            }
        })
        canvas.onpointermove = editor.wrapHandler(e => {
            const pointerId = e.pointerId
            if (downPointers.has(pointerId)) {
                // update it if it was down; otherwise, it's a mousemove without
                // a pointerdown so we don't track it
                downPointers.set(pointerId, e)
            }

            const numPointers = downPointers.size
            let handle = false
            if (numPointers === 2 && currentZoomSession !== undefined) {
                const initLoc = currentZoomSession.initialPointersLoc
                const newLoc = getTwoPointersLoc(true)
                const factor = newLoc.dist / initLoc.dist * 100 / currentZoomSession.initialTransform.zoom
                const targetZoom = currentZoomSession.initialTransform.zoom * factor
                const stickyZoom = targetZoom > 95 && targetZoom < 105 ? 100 : targetZoom
                applyZoomAndTranslation(stickyZoom, initLoc.centerX, initLoc.centerY, newLoc.centerX, newLoc.centerY)
            } else {
                handle = pointerId === trackedPointerId
            }

            if (e.pointerType !== "touch" || handle) {
                this.doPointerMove(e)
            }
        })
        // pointerleave: outside of canvas incl. descendants
        canvas.onpointerleave = this.clearTooltipIfNeeded.bind(this)
        // no need to handle pointerout because it also fires when entering a child element

        const onpointerupcancel = editor.wrapHandler((e: PointerEvent) => {
            const pointerId = e.pointerId
            downPointers.delete(pointerId)

            if (pointerId === trackedPointerId) {
                this.doPointerUp(e)
                trackedPointerId = undefined
            }

            cancelZoomSession()
        })

        canvas.onpointerup = onpointerupcancel
        canvas.onpointercancel = onpointerupcancel

        // Wheel events for zooming and panning
        let wheelEndTimer: TimeoutHandle | null = null
        canvas.onwheel = editor.wrapHandler(e => {
            if (editor.mode >= Mode.CONNECT) {
                e.preventDefault()
                const isZoomGesture = e.ctrlKey || e.metaKey
                if (isZoomGesture) {
                    // Calculate zoom factor based on deltaY
                    const delta = -e.deltaY
                    const zoomFactor = 1 + delta * 0.005
                    const oldZoom = editor.userDrawingScale * 100
                    const [oldCenterX, oldCenterY] = editor.offsetXY(e, false)
                    const [newCenterX, newCenterY] = editor.offsetXY(e, true)
                    applyZoomAndTranslation(oldZoom * zoomFactor, oldCenterX, oldCenterY, newCenterX, newCenterY)
                } else {
                    // Handle as a pan gesture if not a zoom
                    const speedFactor = 1 / editor.userDrawingScale // slower if zoomed in
                    const panX = -e.deltaX * speedFactor
                    const panY = -e.deltaY * speedFactor
                    editor.setTranslation(editor.translationX + panX, editor.translationY + panY)
                }

                // detect end of wheel interaction
                if (wheelEndTimer !== null) {
                    clearTimeout(wheelEndTimer)
                }
                wheelEndTimer = setTimeout(() => {
                    wheelEndTimer = null
                    editor.finishAutoZoomTranslationIfActive()
                }, 200)
            }
        })

        // Context menu
        canvas.oncontextmenu = editor.wrapHandler((e) => {
            e.preventDefault()
            if (this.editor.mode >= Mode.CONNECT && this._currentComponentUnderPointer !== null) {
                this._currentHandlers.contextMenuOn(this._currentComponentUnderPointer, e)
            }
        })
        // there is a global 'pointerdown' listener that is used to hide the context menu

        // Key events
        canvas.addEventListener("keyup", editor.wrapHandler(e => {
            if (targetIsFieldOrOtherInput(e)) {
                return
            }

            const keyLower = e.key.toLowerCase()
            switch (keyLower) {
                case "escape": {
                    let handled: boolean
                    handled = editor.eventMgr.tryDeleteComponentsWhere(comp => comp.state === ComponentState.SPAWNING, false) > 0
                    if (!handled) {
                        handled = editor.linkMgr.tryCancelWireOrAnchor()
                    }
                    if (!handled && this.editor.editorRoot instanceof CustomComponent) {
                        handled = this.editor.tryCloseCustomComponentEditor()
                    }
                    if (!handled) {
                        handled = editor.setCurrentPointerAction("edit")
                    }

                    if (handled) {
                        e.preventDefault()
                    }
                    return
                }

                case "backspace":
                case "delete": {
                    e.preventDefault()
                    if (!editor.deleteSelection()) {
                        // if nothing was deleted, we try to delete the hovered component
                        if (this.currentComponentUnderPointer !== null) {
                            const result = editor.eventMgr.tryDeleteDrawable(this.currentComponentUnderPointer)
                            if (result.isChange) {
                                editor.editTools.undoMgr.takeSnapshot(result)
                            }
                        }
                    }
                    return
                }

                case "e":
                    editor.setCurrentPointerAction("edit")
                    e.preventDefault()
                    return

                case "d":
                    editor.setCurrentPointerAction("delete")
                    e.preventDefault()
                    return

                case "m":
                    editor.setCurrentPointerAction("move")
                    e.preventDefault()
                    return

                case "t":
                    if (editor.editorRoot.testSuites.totalCases() > 0) {
                        editor.setTestsPaletteVisible(true)
                        editor.editTools.testsPalette.runAllTestSuites()
                        e.preventDefault()
                        return
                    }
            }
        }))

        canvas.addEventListener("keydown", editor.wrapAsyncHandler(async e => {
            const ctrlOrCommand = e.ctrlKey || e.metaKey
            const keyLower = e.key.toLowerCase()
            const shift = e.shiftKey || (keyLower !== e.key)
            switch (keyLower) {
                case "a":
                    if (ctrlOrCommand && editor.mode >= Mode.CONNECT && !targetIsFieldOrOtherInput(e)) {
                        e.preventDefault()
                        this.selectAll()
                    }
                    return

                case "s":
                    if (ctrlOrCommand && editor.isSingleton) {
                        e.preventDefault()
                        editor.saveCurrentStateToUrl()
                    }
                    return

                case "z":
                    if (ctrlOrCommand && !targetIsFieldOrOtherInput(e)) {
                        e.preventDefault()
                        if (shift) {
                            editor.editTools.undoMgr.redoOrRepeat()
                        } else {
                            editor.editTools.undoMgr.undo()
                        }
                    }
                    return
                case "y":
                    if (ctrlOrCommand && !targetIsFieldOrOtherInput(e)) {
                        e.preventDefault()
                        editor.editTools.undoMgr.redoOrRepeat()
                    }
                    return
                case "x":
                    if (ctrlOrCommand && !targetIsFieldOrOtherInput(e)) {
                        e.preventDefault()
                        await editor.cut()
                    }
                    return
                case "c":
                    if (ctrlOrCommand && !targetIsFieldOrOtherInput(e)) {
                        e.preventDefault()
                        await editor.copy()
                    }
                    return
                case "v":
                    if (ctrlOrCommand && !targetIsFieldOrOtherInput(e)) {
                        e.preventDefault()
                        await editor.paste()
                    }
                    return
                case "g":
                    if (ctrlOrCommand && editor.mode >= Mode.CONNECT) {
                        e.preventDefault()
                        editor.makeGroupWithSelection()
                    }
                    return

                case "arrowright":
                    if (this.moveSelection(ctrlOrCommand ? 1 : GRID_STEP / 2, 0, e.altKey)) {
                        return
                    }
                    break
                case "arrowleft":
                    if (this.moveSelection(ctrlOrCommand ? -1 : -GRID_STEP / 2, 0, e.altKey)) {
                        return
                    }
                    break
                case "arrowdown":
                    if (this.moveSelection(0, ctrlOrCommand ? 1 : GRID_STEP / 2, e.altKey)) {
                        return
                    }
                    break
                case "arrowup":
                    if (this.moveSelection(0, ctrlOrCommand ? -1 : -GRID_STEP / 2, e.altKey)) {
                        return
                    }
                    break
            }

            // console.log("keydown %o %o, comp: %o", e, keyLower, this._currentPointerOverComp)

            if (this._currentComponentUnderPointer !== null) {
                this._currentComponentUnderPointer.keyDown(e)
            }
        }))


        // Drag and drop on canvas
        canvas.ondragenter = returnFalse
        canvas.ondragover = returnFalse
        canvas.ondragend = returnFalse
        canvas.ondrop = e => {
            if (e.dataTransfer === null) {
                return false
            }

            e.preventDefault()
            const file = e.dataTransfer.files?.[0]
            if (file !== undefined) {
                editor.tryLoadFrom(file)
            } else {
                const dataItems = e.dataTransfer.items
                if (dataItems !== undefined) {
                    for (const dataItem of dataItems) {
                        if (dataItem.kind === "string" && (dataItem.type === "application/json" || dataItem.type === "application/json5" || dataItem.type === "text/plain")) {
                            dataItem.getAsString(content => {
                                e.dataTransfer!.dropEffect = "copy"
                                editor.loadCircuitOrLibrary(content)
                            })
                            break
                        }
                    }
                }
            }
            return false
        }
    }

    private doPointerDown(e: PointerEvent) {
        this.clearHoverTimeoutHandle()
        this.clearTooltipIfNeeded()
        if (this._currentPointerDownData === null) {
            const xy = this.editor.offsetXY(e)
            this.updateComponentUnderPointer(xy, false, false, e.pointerType === "touch")
            if (this._currentComponentUnderPointer !== null) {
                // pointer down on component
                const { wantsDragEvents } = this._currentHandlers.pointerDownOn(this._currentComponentUnderPointer, e)
                if (wantsDragEvents) {
                    const selectedComps = this.currentSelection === undefined ? [] : [...this.currentSelection.previouslySelectedElements]
                    for (const comp of selectedComps) {
                        if (comp !== this._currentComponentUnderPointer) {
                            this._currentHandlers.pointerDownOn(comp, e)
                        }
                    }
                    const pointerDownData: PointerDownData = {
                        mainComp: this._currentComponentUnderPointer,
                        selectionComps: selectedComps,
                        firedPointerDraggedAlready: false,
                        fireClickedOnFinish: true,
                        initialXY: xy,
                        triggeredContextMenu: false,
                    }
                    this._currentPointerDownData = pointerDownData
                    this.startLongPressTimeout(pointerDownData, e)
                }
                this.editor.editTools.redrawMgr.requestRedraw({ why: "pointerdown" })
            } else {
                // pointer down on background
                this._currentPointerDownData = {
                    mainComp: this.editor.html.canvasContainer,
                    selectionComps: [], // ignore selection
                    firedPointerDraggedAlready: false,
                    fireClickedOnFinish: true,
                    initialXY: xy,
                    triggeredContextMenu: false,
                }
                this._currentHandlers.pointerDownOnBackground(e)
            }
            this.editor.updateCursor(e)
        } else {
            // we got a pointerdown while a component had programmatically
            // been determined as being pointerdown'd; ignore
        }
    }

    private doPointerMove(e: PointerEvent) {
        if (this._currentPointerDownData !== null) {
            if (this._currentPointerDownData.triggeredContextMenu) {
                // cancel it all
                this._currentPointerDownData = null
            } else {
                const initialXY = this._currentPointerDownData.initialXY
                setDragStartOnEvent(e, initialXY[0], initialXY[1])
                if (this._currentPointerDownData.mainComp instanceof Drawable) {
                    // check if the drag is too small to be taken into account now
                    // (e.g., touchmove is fired very quickly)
                    let fireDragEvent =
                        // if we fired a drag event already for this "click session", we go on
                        this._currentPointerDownData.firedPointerDraggedAlready

                    if (!fireDragEvent) {
                        // we check if we should fire a drag event and cancel it if the move is too small,
                        const d2 = distSquared(...this.editor.offsetXY(e), ...this._currentPointerDownData.initialXY)
                        // NaN is returned when no input point was specified and
                        // dragging should then happen regardless
                        fireDragEvent = isNaN(d2) || d2 >= 5 * 5 // 5 pixels
                    }

                    if (fireDragEvent) {
                        // dragging component
                        this.clearLongPressTimeout()
                        this._currentPointerDownData.fireClickedOnFinish = false
                        this._currentHandlers.pointerDraggedOn(this._currentPointerDownData.mainComp, e)
                        for (const comp of this._currentPointerDownData.selectionComps) {
                            if (comp !== this._currentPointerDownData.mainComp) {
                                this._currentHandlers.pointerDraggedOn(comp, e)
                            }
                        }
                        this._currentPointerDownData.firedPointerDraggedAlready = true
                    }
                } else {
                    // dragging background
                    this._currentHandlers.pointerDraggedOnBackground(e)
                }
            }
        } else {
            // moving pointer or dragging without a locked component
            const linkMgr = this.editor.editorRoot.linkMgr
            this.updateComponentUnderPointer(this.editor.offsetXY(e), linkMgr.isAddingWire, linkMgr.isSettingAnchor, e.pointerType === "touch")
        }
        this.editor.updateCursor(e)
    }

    private doPointerUp(e: PointerEvent) {
        // our target is either the locked component that
        // was clicked or the latest poin ter over component
        const pointerUpTarget = this._currentPointerDownData?.mainComp ?? this._currentComponentUnderPointer
        if (pointerUpTarget instanceof Drawable) {
            // pointerup on component
            this.clearLongPressTimeout()
            let change = this._currentHandlers.pointerUpOn(pointerUpTarget, e)
            for (const comp of this._currentPointerDownData?.selectionComps ?? []) {
                if (comp !== pointerUpTarget) {
                    const newChange = this._currentHandlers.pointerUpOn(comp, e)
                    change = InteractionResult.merge(change, newChange)
                }
            }

            const pointerDownData = this._currentPointerDownData
            const firePointerClicked = pointerDownData === null ? false : pointerDownData.fireClickedOnFinish && !pointerDownData.triggeredContextMenu
            if (firePointerClicked) {
                let newChange
                if (this.isDoubleClick(pointerUpTarget, e)) {
                    newChange = this._currentHandlers.pointerDoubleClickedOn(pointerUpTarget, e)
                    if (!newChange.isChange) {
                        // no double click handler, so we trigger a normal click
                        newChange = this._currentHandlers.pointerClickedOn(pointerUpTarget, e)
                    }
                } else {
                    newChange = this._currentHandlers.pointerClickedOn(pointerUpTarget, e)
                }
                change = InteractionResult.merge(change, newChange)
            }

            if (change.isChange) {
                this.editor.editTools.undoMgr.takeSnapshot(change)
            }

        } else {
            // pointerup on background
            this._currentHandlers.pointerUpOnBackground(e)
        }
        this._currentPointerDownData = null

        if (e.pointerType === "touch") {
            this.setCurrentComponentUnderPointer(null)
        } else {
            this.updateComponentUnderPointer(this.editor.offsetXY(e), false, false, false)
            this.editor.updateCursor(e)
        }
        this.editor.editTools.redrawMgr.requestRedraw({ why: "pointerup" })
        this.editor.focus()
    }

    private isDoubleClick(clickedComp: Drawable, e: PointerEvent) {
        if (e.pointerType === "mouse") {
            return e.detail === 2
        } else {
            const oldLastTouchEnd = this._lastTouchEnd
            const now = new Date().getTime()
            this._lastTouchEnd = [clickedComp, now]
            if (oldLastTouchEnd === undefined) {
                return false
            }
            const [lastComp, lastTime] = oldLastTouchEnd
            const elapsedTimeMillis = now - lastTime
            const isDoubleTouch = lastComp === clickedComp && elapsedTimeMillis > 0 && elapsedTimeMillis < 300
            if (isDoubleTouch) {
                this._lastTouchEnd = undefined
            }
            return isDoubleTouch
        }
    }

    public registerButtonListenersOn(componentButtons: HTMLButtonElement[], isCustomElement: boolean) {
        const editor = this.editor

        const pointermoveHandler = editor.wrapHandler((e: PointerEvent) => {
            // e.preventDefault()
            this.doPointerMove(e)
            // this.setCurrentComponentUnderPointer(null)
        })
        const pointerupHandler = editor.wrapHandler((e: PointerEvent) => {
            // e.preventDefault()
            this.doPointerUp(e)
            // this.setCurrentComponentUnderPointer(null)
        })

        for (const compButton of componentButtons) {

            compButton.ontouchstart = preventDefaultAlways
            compButton.ontouchmove = preventDefaultAlways
            compButton.ontouchend = preventDefaultAlways

            compButton.onpointermove = pointermoveHandler
            compButton.onpointerup = pointerupHandler
            compButton.onpointerdown = editor.wrapHandler((e) => {
                // console.log("button pointerdown %o %o", editor.offsetXY(e), e)
                if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
                    // will be handled by context menu
                    return
                }
                this.editor.setCurrentPointerAction("edit")
                e.preventDefault()
                compButton.setPointerCapture(e.pointerId)
                this.editor.eventMgr.currentSelection = undefined
                const newComponent = editor.factory.makeFromButton(editor.editorRoot, compButton)
                if (newComponent === undefined) {
                    return
                }
                this._currentComponentUnderPointer = newComponent
                const { wantsDragEvents } = this._currentHandlers.pointerDownOn(newComponent, e)
                if (wantsDragEvents) {
                    this._currentPointerDownData = {
                        mainComp: this._currentComponentUnderPointer,
                        selectionComps: [], // ignore selection when dragging new component
                        firedPointerDraggedAlready: false,
                        fireClickedOnFinish: false,
                        initialXY: [NaN, NaN],
                        triggeredContextMenu: false,
                    }
                }
                const [x, y] = editor.offsetXY(e, true)
                setDragStartOnEvent(e, x, y)
                this._currentHandlers.pointerDraggedOn(newComponent, e)
            })

            compButton.addEventListener("contextmenu", editor.wrapHandler((e) => {
                // console.log("button contextmenu %o %o", editor.offsetXY(e), e)
                e.preventDefault()
                e.stopPropagation()

                if (isCustomElement && this.editor.mode >= Mode.DESIGN) {
                    this._currentHandlers.contextMenuOnButton(compButton.dataset as ButtonDataset, e)
                }
            }))
        }
    }

    public registerTitleDragListenersOn(title: HTMLDivElement, closeHandler?: () => unknown) {
        let isDragging = false
        let startX: number, startY: number, startTop: number, startRight: number

        let closeButton: HTMLElement | undefined = undefined
        if (closeHandler) {
            closeButton = makeIcon("close")
            closeButton.classList.add("close-palette")
            closeButton.addEventListener("click", closeHandler)
            closeButton.addEventListener("click", () => {
                console.log("close palette")
            })
            title.appendChild(closeButton)
        }

        title.addEventListener('pointerdown', (e) => {
            if (isDragging) { return }
            if (e.composedPath().includes(closeButton as any)) { return } // don't start drag when clicking close button

            title.setPointerCapture(e.pointerId)
            isDragging = true

            // Store the initial mouse position
            startX = e.clientX
            startY = e.clientY

            // Get the current computed top and right values of the element
            const parent = title.parentElement!
            const computedStyle = window.getComputedStyle(parent)
            startTop = parseInt(computedStyle.top, 10)
            startRight = parseInt(computedStyle.right, 10)

            // Change cursor to grabbing
            title.style.cursor = 'grabbing'

            // Prevent text selection while dragging
            e.preventDefault()
        })

        title.addEventListener('pointermove', (e) => {
            if (!isDragging) { return }

            // Calculate the movement
            const deltaX = e.clientX - startX
            const deltaY = e.clientY - startY

            // Update top and right based on movement
            const parent = title.parentElement!
            parent.style.top = `${startTop + deltaY}px`
            parent.style.right = `${startRight - deltaX}px`
        })

        title.addEventListener('pointerup', () => {
            if (isDragging) {
                isDragging = false

                // Restore cursor
                title.style.removeProperty("cursor")
            }
        })
    }

    public tryDeleteDrawable(comp: Drawable): InteractionResult {
        if (comp instanceof ComponentBase) {
            const ref = comp.ref
            if (this.editor.editorRoot.testSuites.hasReferenceTo(ref)) {
                if (!window.confirm(S.Tests.ComponentUsedInTestSuite.expand({ ref }))) {
                    return InteractionResult.NoChange
                }
            }
            const numDeleted = this.tryDeleteComponentsWhere(c => c === comp, true)
            return InteractionResult.fromBoolean(numDeleted !== 0)
        } else if (comp instanceof Wire) {
            return this.editor.editorRoot.linkMgr.deleteWire(comp)
        } else if (comp instanceof Waypoint) {
            comp.removeFromParent()
            return InteractionResult.SimpleChange
        }
        return InteractionResult.NoChange
    }

    public tryDeleteComponentsWhere(cond: (e: Component) => boolean, onlyOne: boolean) {
        const numDeleted = this.editor.editorRoot.components.tryDeleteWhere(cond, onlyOne).length
        if (numDeleted > 0) {
            this.clearTooltipIfNeeded()
            this.editor.editTools.redrawMgr.requestRedraw({ why: "component(s) deleted", invalidateMask: true, invalidateTests: true })
        }
        return numDeleted
    }

}

abstract class ToolHandlers {

    public readonly editor: LogicEditor

    public constructor(editor: LogicEditor) {
        this.editor = editor
    }

    public pointerHoverOn(__comp: Drawable) {
        // empty
    }
    public pointerDownOn(__comp: Drawable, __e: PointerEvent) {
        return { wantsDragEvents: true }
    }
    public pointerDraggedOn(__comp: Drawable, __e: PointerDragEvent) {
        // empty
    }
    public pointerUpOn(__comp: Drawable, __e: PointerEvent): InteractionResult {
        return InteractionResult.NoChange
    }
    public pointerClickedOn(__comp: Drawable, __e: PointerEvent): InteractionResult {
        return InteractionResult.NoChange
    }
    public pointerDoubleClickedOn(__comp: Drawable, __e: PointerEvent): InteractionResult {
        return InteractionResult.NoChange
    }
    public contextMenuOn(__comp: Drawable, __e: MouseEvent): boolean {
        return false // false means unhandled
    }
    public contextMenuOnButton(__props: ButtonDataset, __e: MouseEvent) {
        // empty
    }
    public hideContextMenuIfNeeded(__e?: PointerEvent) {
        // empty
    }
    public pointerDownOnBackground(__e: PointerEvent) {
        // empty
    }
    public pointerDraggedOnBackground(__e: PointerDragEvent) {
        // empty
    }
    public pointerUpOnBackground(__e: PointerEvent) {
        // empty
    }
    public unmount() {
        // empty
    }
}

type PanningSession = {
    startX: number,
    startY: number,
    initialTranslationX: number,
    initialTranslationY: number,
}

class EditHandlers extends ToolHandlers {

    private _openedContextMenu: HTMLElement | null = null
    private _currentPanningSession: PanningSession | undefined = undefined

    public constructor(editor: LogicEditor) {
        super(editor)
    }

    public override pointerHoverOn(comp: Drawable) {
        const editor = this.editor
        editor.eventMgr.clearTooltipIfNeeded()
        if (editor.options.hideTooltips) {
            return
        }
        // maybe the component is now dead
        if ((comp instanceof ComponentBase) && comp.state === ComponentState.DEAD) {
            return
        }
        const tooltip = comp.makeTooltip()
        if (tooltip !== undefined) {
            const rect = () => {
                const containerRect = editor.html.canvasContainer.getBoundingClientRect()
                const f = editor.userDrawingScale
                const dx = editor.translationX
                const dy = editor.translationY
                const [cx, cy, w, h] =
                    comp instanceof DrawableWithPosition
                        ? [(comp.posX + dx) * f, (comp.posY + dy) * f, comp.width * f, comp.height * f]
                        : [editor.pointerX, editor.pointerY, 4, 4]
                return new DOMRect(containerRect.x + cx - w / 2, containerRect.y + cy - h / 2, w, h)
            }
            editor.eventMgr.makeTooltip(tooltip, rect)
        }
    }
    public override pointerDownOn(comp: Drawable, e: PointerEvent) {
        return comp.pointerDown(e)
    }
    public override pointerDraggedOn(comp: Drawable, e: PointerDragEvent) {
        comp.pointerDragged(e)
    }
    public override pointerUpOn(comp: Drawable, e: PointerEvent) {
        const change = comp.pointerUp(e)
        this.editor.editorRoot.linkMgr.tryCancelWireOrAnchor()
        return change
    }
    public override pointerClickedOn(comp: Drawable, e: PointerEvent) {
        // console.log("pointerClickedOn %o", comp)
        return comp.pointerClicked(e)
    }
    public override pointerDoubleClickedOn(comp: Drawable, e: PointerEvent) {
        return comp.pointerDoubleClicked(e)
    }
    public override contextMenuOn(comp: Drawable, e: PointerEvent) {
        // console.log("contextMenuOn: %o", comp)
        return this.showContextMenu(comp.makeContextMenu(), e)
    }
    public override contextMenuOnButton(props: ButtonDataset, e: PointerEvent) {
        return this.showContextMenu(this.editor.factory.makeContextMenu(props.type), e)
    }

    public override pointerDownOnBackground(e: PointerEvent) {
        const editor = this.editor
        if (LogicEditor.spaceDown && editor.mode >= Mode.CONNECT) {
            editor.setToolCursor("grabbing")
            const [startX, startY] = editor.offsetXY(e, true)
            this._currentPanningSession = { startX, startY, initialTranslationX: editor.translationX, initialTranslationY: editor.translationY }
        } else {
            const eventMgr = editor.eventMgr
            const currentSelection = eventMgr.currentSelection
            if (currentSelection !== undefined) {
                const allowSelection = editor.mode >= Mode.CONNECT
                if (e.shiftKey && allowSelection) {
                    if (currentSelection.currentlyDrawnRect !== undefined) {
                        console.log("unexpected defined current rect when about to begin a new one")
                    }
                    // augment selection
                    const [left, top] = editor.offsetXY(e)
                    const rect = new DOMRect(left, top, 1, 1)
                    currentSelection.currentlyDrawnRect = rect
                } else {
                    // clear selection
                    eventMgr.currentSelection = undefined
                }
                editor.editTools.redrawMgr.requestRedraw({ why: "selection rect changed" })
            }
        }
    }
    public override pointerDraggedOnBackground(e: PointerDragEvent) {
        const editor = this.editor
        if (this._currentPanningSession !== undefined) {
            const { startX, startY, initialTranslationX, initialTranslationY } = this._currentPanningSession
            const [x, y] = editor.offsetXY(e, true)
            const dx = x - startX
            const dy = y - startY
            const scaleFactor = editor.userDrawingScale
            editor.setTranslation(initialTranslationX + dx / scaleFactor, initialTranslationY + dy / scaleFactor)
        } else {
            const allowSelection = editor.mode >= Mode.CONNECT
            if (allowSelection) {
                const eventMgr = editor.eventMgr
                const currentSelection = eventMgr.currentSelection
                const [x, y] = editor.offsetXY(e)
                if (currentSelection === undefined) {
                    const rect = new DOMRect(x, y, 1, 1)
                    eventMgr.currentSelection = new EditorSelection(rect)
                } else {
                    const rect = currentSelection.currentlyDrawnRect
                    if (rect === undefined) {
                        console.log("trying to update a selection rect that is not defined")
                    } else {
                        rect.width = x - rect.x
                        rect.height = y - rect.y
                        editor.editTools.redrawMgr.requestRedraw({ why: "selection rect changed" })
                    }
                }
            }
        }
    }

    public override pointerUpOnBackground(__e: PointerEvent) {
        const editor = this.editor
        editor.linkMgr.tryCancelWireOrAnchor()

        const eventMgr = editor.eventMgr
        const currentSelection = eventMgr.currentSelection
        if (currentSelection !== undefined) {
            currentSelection.finishCurrentRect(this.editor)
            editor.editTools.redrawMgr.requestRedraw({ why: "selection rect changed" })
        }
        editor.setToolCursor(null)
        if (this._currentPanningSession !== undefined) {
            editor.finishAutoZoomTranslationIfActive()
            this._currentPanningSession = undefined
        }
    }

    public override hideContextMenuIfNeeded(e?: PointerEvent) {
        // if e is passed, only hide if the target is not the context menu
        if (this._openedContextMenu !== null) {
            const menuContainsTarget = e !== undefined && this._openedContextMenu.contains(e.composedPath()[0] as Element)
            if (!menuContainsTarget) {
                this._openedContextMenu.classList.remove('show-menu')
                this._openedContextMenu.innerHTML = ""
                this._openedContextMenu = null
            }
        }
    }

    private showContextMenu(menuData: MenuData | undefined, e: PointerEvent) {
        this.hideContextMenuIfNeeded()

        // console.log("asking for menu: %o got: %o", comp, MenuData)
        if (menuData === undefined) {
            return false
        }

        // console.log("setting triggered")
        const currentPointerDownData = this.editor.eventMgr.currentPointerDownData
        if (currentPointerDownData !== null) {
            currentPointerDownData.triggeredContextMenu = true
        }

        // console.log("building menu for %o", MenuData)

        let hasContentJustifyingSeparator = false

        const defToElem = (item: MenuItem): Modifier => {
            function mkButton(spec: { icon?: IconName | undefined, caption: Modifier }, shortcut: string | undefined, danger: boolean) {
                return button(type("button"), cls(`menu-btn${(danger ? " danger" : "")}`),
                    spec.icon === undefined
                        ? spec.caption
                        : mods(
                            makeIcon(spec.icon),
                            span(cls("menu-text"), spec.caption)
                        ),
                    shortcut === undefined ? emptyMod : span(cls("menu-shortcut"), shortcut),
                )
            }

            hasContentJustifyingSeparator ||= item._tag !== "sep"
            switch (item._tag) {
                case "sep":
                    if (hasContentJustifyingSeparator) {
                        hasContentJustifyingSeparator = false
                        return li(cls("menu-separator")).render()
                    } else {
                        return emptyMod
                    }
                case "text":
                    return li(cls("menu-item-static"), item.caption).render()
                case "item": {
                    const but = mkButton(item, item.shortcut, item.danger ?? false).render()
                    but.addEventListener("click", this.editor.wrapAsyncHandler(async (itemEvent: MouseEvent) => {
                        this.hideContextMenuIfNeeded()
                        const result = await Promise.resolve(item.action(itemEvent, e))
                        this.editor.editTools.undoMgr.takeSnapshot(result as Exclude<typeof result, void>)
                        this.editor.focus()
                    }))
                    return li(cls("menu-item"), but).render()
                }
                case "submenu": {
                    return li(cls("menu-item submenu"),
                        mkButton(item, undefined, false),
                        ul(cls("menu"),
                            ...item.items.map(defToElem)
                        )
                    ).render()
                }
            }
        }

        const items = menuData.map(defToElem)

        const mainContextMenu = this.editor.html.mainContextMenu
        applyModifiersTo(mainContextMenu, items)
        mainContextMenu.classList.add("show-menu")

        let menuTop = e.pageY
        mainContextMenu.style.top = menuTop + 'px'
        mainContextMenu.style.left = e.pageX + 'px'

        let needsScrollY = false
        const menuRect = mainContextMenu.getBoundingClientRect()
        const hOverflow = window.innerHeight - menuRect.bottom
        if (hOverflow < 0) {
            menuTop += Math.min(0, hOverflow)
            if (menuTop < 5) {
                menuTop = 5
                needsScrollY = true
            }
            mainContextMenu.style.top = menuTop + 'px'
        }

        // TODO this causes some weird behavior with submenus, to be fixed
        if (needsScrollY) {
            mainContextMenu.style.setProperty("max-height", (window.innerHeight - 10) + "px")
            mainContextMenu.style.setProperty("overflow-y", "scroll")
        } else {
            mainContextMenu.style.removeProperty("max-height")
            mainContextMenu.style.removeProperty("overflow-y")
        }

        this._openedContextMenu = mainContextMenu

        return true // handled
    }
}

class DeleteHandlers extends ToolHandlers {

    public constructor(editor: LogicEditor) {
        super(editor)
    }

    public override pointerClickedOn(comp: Drawable, __: PointerEvent) {
        return this.editor.eventMgr.tryDeleteDrawable(comp)
    }
}


class SetAnchorHandlers extends ToolHandlers {

    private _from: DrawableWithPosition

    public constructor(editor: LogicEditor, from: DrawableWithPosition) {
        super(editor)
        this._from = from
        editor.linkMgr.startSettingAnchorFrom(from)
    }

    public override unmount() {
        // e.g. on escape, make sure to cancel the anchor set
        this.editor.linkMgr.tryCancelSetAnchor()
    }

    private finish() {
        // always go back to edit mode after setting an anchor
        this.editor.setCurrentPointerAction("edit")
    }

    public override pointerClickedOn(comp: Drawable, __: PointerEvent) {
        let result: InteractionResult = InteractionResult.NoChange
        if (comp instanceof ComponentBase) {
            result = this.editor.linkMgr.trySetAnchor(this._from, comp)
        } else {
            this.editor.linkMgr.tryCancelSetAnchor()
        }
        this.finish()
        return result
    }

    public override pointerUpOnBackground(__: PointerEvent) {
        this.editor.linkMgr.tryCancelSetAnchor()
        this.finish()
    }
}

class MoveHandlers extends ToolHandlers {

    public constructor(editor: LogicEditor) {
        super(editor)
    }

    public override pointerDownOnBackground(e: PointerEvent) {
        for (const comp of this.editor.components.all()) {
            comp.pointerDown(e)
        }
        for (const wire of this.editor.linkMgr.wires) {
            for (const waypoint of wire.waypoints) {
                waypoint.pointerDown(e)
            }
        }
    }
    public override pointerDraggedOnBackground(e: PointerDragEvent) {
        for (const comp of this.editor.components.all()) {
            comp.pointerDragged(e)
        }
        for (const wire of this.editor.linkMgr.wires) {
            for (const waypoint of wire.waypoints) {
                waypoint.pointerDragged(e)
            }
        }
    }
    public override pointerUpOnBackground(e: PointerEvent) {
        for (const comp of this.editor.components.all()) {
            comp.pointerUp(e)
        }
        for (const wire of this.editor.linkMgr.wires) {
            for (const waypoint of wire.waypoints) {
                waypoint.pointerUp(e)
            }
        }
    }
}
