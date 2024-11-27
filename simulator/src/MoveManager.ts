import { ComponentBase } from "./components/Component"
import { DrawableWithPosition } from "./components/Drawable"
import { Waypoint } from "./components/Wire"
import { LogicEditor } from "./LogicEditor"

export class MoveManager {

    public readonly editor: LogicEditor
    private _movingDrawables = new Set<DrawableWithPosition>()

    public constructor(editor: LogicEditor) {
        this.editor = editor
    }

    public areDrawablesMoving() {
        return this._movingDrawables.size > 0
    }

    public getSingleMovingWaypoint(): Waypoint | undefined {
        if (this._movingDrawables.size === 1) {
            const drawable = this._movingDrawables.values().next().value
            if (drawable instanceof Waypoint) {
                return drawable
            }
        }
        return undefined
    }

    public setDrawableMoving(comp: DrawableWithPosition, e?: MouseEvent | TouchEvent) {
        this.changeMovingDrawables(() => {
            this._movingDrawables.add(comp)
        }, e)
    }

    public setDrawableStoppedMoving(comp: DrawableWithPosition, e?: MouseEvent | TouchEvent) {
        this.changeMovingDrawables(() => {
            this._movingDrawables.delete(comp)
        }, e)
    }

    private changeMovingDrawables(change: () => void, e?: MouseEvent | TouchEvent) {
        const emptyBefore = this._movingDrawables.size === 0
        change()
        const emptyAfter = this._movingDrawables.size === 0
        if (emptyBefore !== emptyAfter) {
            this.editor.updateCursor(e)
            this.editor.editTools.redrawMgr.addReason("started or stopped moving drawables", null)
        }
    }

    public clear() {
        this._movingDrawables.clear()
    }

    public dump() {
        const num = this._movingDrawables.size
        if (num === 0) {
            console.log("No moving drawables")
        } else {
            console.log(`There are ${num} moving drawables:`)
            for (const drawable of this._movingDrawables) {
                // class name of drawable
                const className = drawable.constructor.name
                if (drawable instanceof ComponentBase) {
                    console.log(className + " - " + (drawable.outputs._all[0]?.id ?? "?"))
                } else {
                    console.log(className)
                }
            }
        }
    }

}
