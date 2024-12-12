import { LogicEditor } from "./LogicEditor"
import { Modifier, applyModifierTo, cls, div } from "./htmlgen"
import { TimeoutHandle } from "./utils"

export class MessageBar {

    private readonly root: HTMLElement
    private readonly msgBox: HTMLElement
    private _currentTimeout: TimeoutHandle | undefined = undefined

    public constructor(
        editor: LogicEditor,
    ) {
        this.msgBox = div(cls("msgBar")).render()
        this.root = div(cls("msgZone"),
            this.msgBox
        ).render()

        editor.html.mainCanvas.insertAdjacentElement("afterend", this.root)

        this.hideNow = this.hideNow.bind(this)
    }

    private hideNow() {
        this._currentTimeout = undefined
        this.root.classList.remove("visible")
    }

    /**
     * @param duration If 0, the message will not disappear automatically (unless replaced by another auto-hiding message)
     */
    public showMessage(msg: Modifier, duration: number): () => void {
        if (this._currentTimeout !== undefined) {
            clearTimeout(this._currentTimeout)
            this._currentTimeout = undefined
        }
        this.msgBox.innerHTML = ""
        applyModifierTo(this.msgBox, msg)
        this.root.classList.add("visible")
        if (duration > 0) {
            this._currentTimeout = setTimeout(this.hideNow, duration)
        }
        return this.hideNow
    }

}
