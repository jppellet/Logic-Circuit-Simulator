import { LogicEditor } from "./LogicEditor"
import { applyModifierTo, cls, div, Modifier, span, style } from "./htmlgen"
import { setVisible, TimeoutHandle } from "./utils"

export class MessageBar {

    private readonly root: HTMLElement
    private readonly msgSpan: HTMLElement
    private readonly closeButton: HTMLElement
    private _currentTimeout: TimeoutHandle | undefined = undefined

    public constructor(
        editor: LogicEditor,
    ) {
        this.msgSpan = span().render()
        this.closeButton = span("×", style("padding-left: 0.5em; cursor: pointer; margin-left: 0.5em; border-left: 1px solid rgba(127,127,127,0.8);")).render()
        this.closeButton.onclick = () => this.hideNow()
        this.root = div(cls("msgZone"),
            div(cls("msgBar"),
                this.msgSpan, this.closeButton,
            ),
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
    public showMessage(msg: Modifier, duration: number, withCloseButton: boolean): () => void {
        if (this._currentTimeout !== undefined) {
            clearTimeout(this._currentTimeout)
            this._currentTimeout = undefined
        }
        this.msgSpan.innerHTML = ""
        applyModifierTo(this.msgSpan, msg)
        this.root.classList.add("visible")
        if (duration > 0) {
            this._currentTimeout = setTimeout(this.hideNow, duration)
        }
        setVisible(this.closeButton, withCloseButton)
        return this.hideNow
    }

}
