import { createPopper, Instance as PopperInstance } from '@popperjs/core'
import { ButtonDataset } from './ComponentFactory'
import { Component, ComponentBase, ComponentState } from './components/Component'
import { CustomComponent } from './components/CustomComponent'
import { Drawable, DrawableWithDraggablePosition, DrawableWithPosition, MenuData, MenuItem } from "./components/Drawable"
import { Node } from "./components/Node"
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
    private _currentPointerOverComp: Drawable | null = null
    private _currentPointerOverPopper: [popper: PopperInstance, removeScrollListener: () => void] | null = null
    private _currentPointerDownData: PointerDownData | null = null
    private _startHoverTimeoutHandle: TimeoutHandle | null = null
    private _longPressTimeoutHandle: TimeoutHandle | null = null
    private _currentAction: PointerAction
    private _currentHandlers: ToolHandlers
    private _lastPointerEnd: [Drawable, number] | undefined = undefined
    public currentSelection: EditorSelection | undefined = undefined

    public constructor(editor: LogicEditor) {
        this.editor = editor
        this._currentAction = "edit"
        this._currentHandlers = new EditHandlers(editor)
    }

    public get currentPointerOverComp() {
        return this._currentPointerOverComp
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

    public setCurrentPointerOverComp(comp: Drawable | null) {
        if (comp !== this._currentPointerOverComp) {
            this.clearPopperIfNecessary()
            this.clearHoverTimeoutHandle()

            this._currentPointerOverComp = comp
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

    public updatePointerOver([x, y]: [number, number], pullingWire: boolean, settingAnchor: boolean) {

        // pointerover search order:
        // * Components - overlays
        // * Components - normal, and nodes, sometimes
        // * Wires, sometimes
        // * Components - background

        const findPointerOver: () => Drawable | null = () => {
            // easy optimization: maybe we're still over the
            // same component as before, so quickly check this
            const prevPointerOver = this._currentPointerOverComp
            if (prevPointerOver !== null && prevPointerOver.drawZIndex !== 0) {
                // second condition says: always revalidate the pointerover of background components (with z index 0)

                // we always revalidate wires
                // if we're setting an anchor, we only want components, not drawables
                const rejectThis = prevPointerOver instanceof Wire || (settingAnchor && !(prevPointerOver instanceof ComponentBase))
                if (!rejectThis && prevPointerOver.isOver(x, y)) {
                    return this._currentPointerOverComp
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
                let nodeOver: Node | null = null
                if (!settingAnchor) {
                    // check nodes
                    for (const node of comp.allNodes()) {
                        if (node.isOver(x, y)) {
                            nodeOver = node
                            break
                        }
                    }
                }
                if (nodeOver !== null && (!pullingWire || root.linkMgr.isValidNodeToConnect(nodeOver))) {
                    return nodeOver
                }
                if (!pullingWire && comp.isOver(x, y)) {
                    return comp
                }
            }

            if (!pullingWire && !settingAnchor) {
                // wires
                for (const wire of root.linkMgr.wires) {
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

        this.setCurrentPointerOverComp(findPointerOver())
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


    public clearPopperIfNecessary() {
        if (this._currentPointerOverPopper !== null) {
            const [popper, removeListener] = this._currentPointerOverPopper
            removeListener()
            popper.destroy()
            this._currentPointerOverPopper = null
            this.editor.html.tooltipElem.style.display = "none"
        }
    }

    public makePopper(tooltipHtml: ModifierObject, rect: () => DOMRect) {
        const { tooltipContents, tooltipElem, mainCanvas } = this.editor.html
        tooltipContents.innerHTML = ""
        tooltipHtml.applyTo(tooltipContents)
        tooltipElem.style.removeProperty("display")
        const popper = createPopper({
            getBoundingClientRect: rect,
            contextElement: mainCanvas,
        }, tooltipElem, {
            placement: 'right',
            modifiers: [{ name: 'offset', options: { offset: [4, 8] } }],
        })

        const scrollParent = getScrollParent(mainCanvas)
        const scrollListener = () => popper.update()
        scrollParent.addEventListener("scroll", scrollListener)
        const removeListener = () => scrollParent.removeEventListener("scroll", scrollListener)
        this._currentPointerOverPopper = [popper, removeListener]

        tooltipElem.setAttribute('data-show', '')
        popper.update()
    }

    public registerCanvasListenersOn(canvas: HTMLCanvasElement) {
        const editor = this.editor
        const returnFalse = () => false
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

        // cancel touch events
        canvas.addEventListener("touchstart", e => {
            if (this.editor.mode >= Mode.CONNECT) {
                // prevent scrolling when we can connect
                e.preventDefault()
            }
        })

        canvas.addEventListener("touchmove", e => {
            if (this.editor.mode >= Mode.CONNECT) {
                // prevent scrolling when we can connect
                e.preventDefault()
            }
        })

        canvas.addEventListener("touchend", e => {
            // touchend should always be prevented, otherwise it may
            // generate mouse/click events
            e.preventDefault()
        })


        canvas.addEventListener("pointerdown", editor.wrapHandler((e) => {
            // console.log("pointerdown %o, composedPath = %o", e, e.composedPath())
            this._pointerDown(e)
        }))

        canvas.addEventListener("pointermove", editor.wrapHandler((e) => {
            // console.log("pointermove %o, composedPath = %o", e, e.composedPath())
            this._pointerMove(e)
            this.editor.updateCursor(e)
        }))

        canvas.addEventListener("mouseleave", editor.wrapHandler(() => {
            this.clearPopperIfNecessary()
        }))

        document.addEventListener("pointerdown", e => this._currentHandlers.hideContextMenuIfNeeded(e))

        canvas.addEventListener("pointerup", editor.wrapHandler((e) => {
            // console.log("pointerup %o, composedPath = %o", e, e.composedPath())
            this._pointerUp(e)
            if (e.pointerType === "touch") {
                this.setCurrentPointerOverComp(null)
            } else {
                this.updatePointerOver(this.editor.offsetXY(e), false, false)
                this.editor.updateCursor(e)
            }
            this.editor.focus()
        }))

        // canvas.addEventListener("pointercancel", editor.wrapHandler((e) => {
        //     // console.log("canvas touchcancel %o %o, composedPath = %o", offsetXY(e), e, e.composedPath())
        // }))

        canvas.addEventListener("contextmenu", editor.wrapHandler((e) => {
            // console.log("contextmenu %o, composedPath = %o", e, e.composedPath())
            e.preventDefault()
            if (this.editor.mode >= Mode.CONNECT && this._currentPointerOverComp !== null) {
                this._currentHandlers.contextMenuOn(this._currentPointerOverComp, e)
            }
        }))

        canvas.addEventListener("keyup", editor.wrapHandler(e => {
            if (targetIsFieldOrOtherInput(e)) {
                return
            }
            switch (e.key) {
                case "Escape": {
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

                case "Backspace":
                case "Delete": {
                    e.preventDefault()
                    if (!editor.deleteSelection()) {
                        // if nothing was deleted, we try to delete the hovered component
                        if (this.currentPointerOverComp !== null) {
                            const result = editor.eventMgr.tryDeleteDrawable(this.currentPointerOverComp)
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

            if (this._currentPointerOverComp !== null) {
                this._currentPointerOverComp.keyDown(e)
            }
        }))
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

    public registerTitleDragListenersOn(title: HTMLDivElement, closeHandler?: () => unknown) {
        let isDragging = false
        let startX: number, startY: number, startTop: number, startRight: number

        title.addEventListener('mousedown', (e) => {
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

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) { return }

            // Calculate the movement
            const deltaX = e.clientX - startX
            const deltaY = e.clientY - startY

            // Update top and right based on movement
            const parent = title.parentElement!
            parent.style.top = `${startTop + deltaY}px`
            parent.style.right = `${startRight - deltaX}px`
        })

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false

                // Restore cursor
                title.style.removeProperty("cursor")
            }
        })

        if (closeHandler) {
            const closeButton = makeIcon("close")
            closeButton.classList.add("close-palette")
            closeButton.addEventListener("click", closeHandler)
            title.appendChild(closeButton)
        }
    }

    private _pointerDown(e: PointerEvent) {
        this.clearHoverTimeoutHandle()
        this.clearPopperIfNecessary()
        if (this._currentPointerDownData === null) {
            const xy = this.editor.offsetXY(e)
            this.updatePointerOver(xy, false, false)
            if (this._currentPointerOverComp !== null) {
                // pointer down on component
                const { wantsDragEvents } = this._currentHandlers.pointerDownOn(this._currentPointerOverComp, e)
                if (wantsDragEvents) {
                    const selectedComps = this.currentSelection === undefined ? [] : [...this.currentSelection.previouslySelectedElements]
                    for (const comp of selectedComps) {
                        if (comp !== this._currentPointerOverComp) {
                            this._currentHandlers.pointerDownOn(comp, e)
                        }
                    }
                    const pointerDownData: PointerDownData = {
                        mainComp: this._currentPointerOverComp,
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

    private _pointerMove(e: PointerEvent) {
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
            this.updatePointerOver(this.editor.offsetXY(e), linkMgr.isAddingWire, linkMgr.isSettingAnchor)
        }
    }

    private _pointerUp(e: PointerEvent) {
        // our target is either the locked component that
        // was clicked or the latest poin ter over component
        const pointerUpTarget = this._currentPointerDownData?.mainComp ?? this._currentPointerOverComp
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
        this.editor.editTools.redrawMgr.requestRedraw({ why: "pointerup" })
    }

    private isDoubleClick(clickedComp: Drawable, e: PointerEvent) {
        if ("offsetX" in e) {
            return e.detail === 2
        } else {
            const oldLastTouchEnd = this._lastPointerEnd
            const now = new Date().getTime()
            this._lastPointerEnd = [clickedComp, now]
            if (oldLastTouchEnd === undefined) {
                return false
            }
            const [lastComp, lastTime] = oldLastTouchEnd
            const elapsedTimeMillis = now - lastTime
            const isDoubleTouch = lastComp === clickedComp && elapsedTimeMillis > 0 && elapsedTimeMillis < 300
            if (isDoubleTouch) {
                this._lastPointerEnd = undefined
            }
            return isDoubleTouch
        }
    }

    public registerButtonListenersOn(componentButtons: HTMLButtonElement[], isCustomElement: boolean) {
        const editor = this.editor
        for (const compButton of componentButtons) {

            compButton.addEventListener("touchstart", e => e.preventDefault())
            compButton.addEventListener("touchmove", e => e.preventDefault())
            compButton.addEventListener("touchend", e => e.preventDefault())

            const buttonPointerDown = (e: PointerEvent) => {
                this.editor.setCurrentPointerAction("edit")
                e.preventDefault()
                this.editor.eventMgr.currentSelection = undefined
                const newComponent = editor.factory.makeFromButton(editor.editorRoot, compButton)
                if (newComponent === undefined) {
                    return
                }
                this._currentPointerOverComp = newComponent
                const { wantsDragEvents } = this._currentHandlers.pointerDownOn(newComponent, e)
                if (wantsDragEvents) {
                    this._currentPointerDownData = {
                        mainComp: this._currentPointerOverComp,
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
            }

            compButton.addEventListener("pointerdown", editor.wrapHandler((e) => {
                // console.log("button pointerdown %o %o", editor.offsetXY(e), e)
                if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
                    // will be handled by context menu
                    return
                }
                buttonPointerDown(e as any)
            }))
            compButton.addEventListener("pointermove", editor.wrapHandler((e) => {
                // console.log("button pointermove %o %o", editor.offsetXY(e), e)
                e.preventDefault()
                this._pointerMove(e as any)
            }))
            compButton.addEventListener("pointerup", editor.wrapHandler((e) => {
                // console.log("button pointerup %o %o", editor.offsetXY(e), e)
                e.preventDefault() // otherwise, may generate mouseclick, etc.
                this._pointerUp(e as any)
                this.setCurrentPointerOverComp(null)
            }))

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
            this.clearPopperIfNecessary()
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

class EditHandlers extends ToolHandlers {

    private _openedContextMenu: HTMLElement | null = null

    public constructor(editor: LogicEditor) {
        super(editor)
    }

    public override pointerHoverOn(comp: Drawable) {
        const editor = this.editor
        editor.eventMgr.clearPopperIfNecessary()
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
                const f = editor.actualZoomFactor
                const [cx, cy, w, h] =
                    comp instanceof DrawableWithPosition
                        ? [comp.posX * f, comp.posY * f, comp.width * f, comp.height * f]
                        : [editor.pointerX, editor.pointerY, 4, 4]
                return new DOMRect(containerRect.x + cx - w / 2, containerRect.y + cy - h / 2, w, h)
            }
            editor.eventMgr.makePopper(tooltip, rect)
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
    public override pointerDraggedOnBackground(e: PointerDragEvent) {
        const editor = this.editor
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

    public override pointerUpOnBackground(__e: PointerEvent) {
        const editor = this.editor
        editor.linkMgr.tryCancelWireOrAnchor()

        const eventMgr = editor.eventMgr
        const currentSelection = eventMgr.currentSelection
        if (currentSelection !== undefined) {
            currentSelection.finishCurrentRect(this.editor)
            editor.editTools.redrawMgr.requestRedraw({ why: "selection rect changed" })
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
