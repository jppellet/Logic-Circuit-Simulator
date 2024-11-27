import { LogicEditor } from "./LogicEditor"
import { Serialization } from "./Serialization"
import { InteractionResult, RepeatFunction } from "./utils"

const MAX_UNDO_SNAPSHOTS = 100

type Snapshot = {
    time: number
    circuitStr: string
    repeatAction?: RepeatFunction
}

export type UndoState = {
    canUndo: boolean
    canRedoOrRepeat: boolean
}

export class UndoManager {

    public readonly editor: LogicEditor
    private _undoSnapshots: Snapshot[] = []
    private _redoSnapshots: Snapshot[] = []

    // remember last sent state to avoid fake events
    private _lastSentState: UndoState | undefined
    // public callback function
    public onStateChanged: (state: UndoState) => unknown = __ => null

    public constructor(editor: LogicEditor) {
        this.editor = editor
    }

    public get state(): UndoState {
        return {
            canUndo: this.canUndo(),
            canRedoOrRepeat: this.canRedoOrRepeat(),
        }
    }

    public canUndo() {
        return this._undoSnapshots.length > 1
    }

    public canRedoOrRepeat() {
        return this._redoSnapshots.length > 0 ||
            (this._undoSnapshots.length > 0 &&
                this._undoSnapshots[this._undoSnapshots.length - 1].repeatAction !== undefined)
    }

    public takeSnapshot(interactionResult?: InteractionResult) {
        const isChange = interactionResult?.isChange ?? true
        if (!isChange) {
            return
        }

        const repeatAction = interactionResult === undefined ? undefined
            : interactionResult._tag === "RepeatableChange" ? interactionResult.repeat : undefined
        this.doTakeSnapshot(repeatAction)
    }

    private doTakeSnapshot(repeatAction?: RepeatFunction) {
        const now = Date.now()
        // const nowStr = new Date(now).toISOString()
        // console.log("Taking snapshot at " + nowStr + " (repeatAction=" + repeatAction + ")")

        const dataObject = this.editor.save()
        const jsonStr = Serialization.stringifyObject(dataObject, true)
        this._undoSnapshots.push({ time: now, circuitStr: jsonStr, repeatAction })
        while (this._undoSnapshots.length > MAX_UNDO_SNAPSHOTS) {
            this._undoSnapshots.shift()
        }
        if (this._redoSnapshots.length > 0) {
            this._redoSnapshots = []
        }
        // this.dump()
        this.fireStateChangedIfNeeded()
    }

    public undo() {
        if (!this.canUndo()) {
            console.log("Nothing to undo")
            return
        }
        const stateNow = this._undoSnapshots.pop()!
        const prevState = this._undoSnapshots[this._undoSnapshots.length - 1]
        this._redoSnapshots.push(stateNow)
        this.loadSnapshot(prevState)
        // this.dump()
        this.fireStateChangedIfNeeded()
    }

    public redoOrRepeat() {
        if (!this.canRedoOrRepeat()) {
            console.log("Nothing to redo or repeat")
            return
        }
        const snapshot = this._redoSnapshots.pop()
        if (snapshot !== undefined) {
            this._undoSnapshots.push(snapshot)
            this.loadSnapshot(snapshot)
        } else {
            const repeatAction = this._undoSnapshots[this._undoSnapshots.length - 1].repeatAction
            if (repeatAction !== undefined) {
                const result = repeatAction()
                const newRepeatAction = result === false ? undefined : result === true ? repeatAction : result
                this.doTakeSnapshot(newRepeatAction)
            }
        }
        // this.dump()
        this.fireStateChangedIfNeeded()
    }

    public dump() {
        function printStack(name: string, stack: Snapshot[]) {
            const title = name + (stack.length === 0 ? " (empty)" : "")
            console.group(title)
            for (let i = stack.length - 1; i >= 0; i--) {
                const snapshot = stack[i]
                const timeStr = new Date(snapshot.time).toISOString()
                console.log(timeStr + "\t" + snapshot.circuitStr)
            }
            console.groupEnd()
        }
        printStack("Undo stack", this._undoSnapshots)
        printStack("Redo stack", this._redoSnapshots)
    }

    private loadSnapshot(snapshot: Snapshot) {
        Serialization.loadCircuitOrLibrary(this.editor, snapshot.circuitStr, { isUndoRedoAction: true })
    }

    private fireStateChangedIfNeeded() {
        const newState = this.state
        if (this._lastSentState === undefined || !areStatesEqual(this._lastSentState, newState)) {
            this.onStateChanged(newState)
            this._lastSentState = newState
        }
    }

}

function areStatesEqual(s1: UndoState, s2: UndoState): boolean {
    return s1.canUndo === s2.canUndo
        && s1.canRedoOrRepeat === s2.canRedoOrRepeat
}
