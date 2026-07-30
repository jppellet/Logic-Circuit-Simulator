import { LogicEditor } from "./LogicEditor"
import { isInput, isOutput } from "./TestSuite"
import { a, div, href, icon, span, style, title } from "./htmlgen"
import { IconName } from "./images"
import { S } from "./strings"
import { isString } from "./utils"

export class KeyInfoPanel {

    private readonly root: HTMLElement

    public constructor(
        public readonly editor: LogicEditor,
    ) {
        this.root = div(style("position: absolute; bottom: 0.2ex; width: 100%; text-align: left; font-size: 9pt; padding-left: 0.8ex;")).render()

        editor.html.mainCanvas.insertAdjacentElement("afterend", this.root)

        this.update()
    }

    public update() {
        const s = S.KeyInfoPanel
        type CriterionStrings = typeof s.TestsDefined

        const editor = this.editor
        const hasTests = editor.testSuites.suites.some(suite => suite.testCases.length > 0)

        const markedAsKey = []
        for (const comp of this.editor.components.all()) {
            if (comp.tags.includes("key")) {
                markedAsKey.push(comp.ref)
            }
        }
        const keyMarked = markedAsKey.length > 0


        const checks: Array<[boolean, CriterionStrings]> = [
            [hasTests, s.TestsDefined],
            [keyMarked, s.KeyMarked],
        ]

        const makeIcon = (name: IconName, color: string) => icon(name, style(`color: ${color}; position: relative; top: -1px; display: inline-block; margin: 0 0.2ex`))

        const htmlParts = checks.map(([passed, label]) => {
            let html: HTMLElement
            if (passed === undefined) {
                html = span().render()
            } else if (passed) {
                html = span(makeIcon("check", "green"), label.true).render()
            } else {
                const link = a(makeIcon("questioncircled", "blue")).render()
                link.onclick = () => editor.showMessage(label.info, 5000, true)
                html = span(makeIcon("close", "red"), label.false, link, title(label.info)).render()
            }

            return html
        })

        if (hasTests) {
            const markedTestIO = markedAsKey.filter(ref => editor.testSuites.hasReferenceTo(ref))
            if (markedTestIO.length > 0) {
                const html = span(makeIcon("close", "red"), s.IOMarkedButInTests).render()
                markedTestIO.forEach((ref, i) => {
                    html.appendChild(this.makeComponentRefSpan(ref))
                    if (i < markedTestIO.length - 1) {
                        html.appendChild(span(", ").render())
                    }
                })
                htmlParts.push(html)
            }
        }

        this.root.innerHTML = ""
        htmlParts.forEach((html, i) => {
            if (i > 0) {
                this.root.insertAdjacentHTML("beforeend", "<br>")
            }
            this.root.appendChild(html)
        })
    }

    private makeComponentRefSpan(ref: string): HTMLElement {
        const component = this.editor.components.get(ref)
        if (component === undefined) {
            return span(ref).render()
        }

        const compStr = (isInput(component) || isOutput(component)) && isString(component.name) ? component.name : ref
        const link = a(compStr, href("#")).render()
        link.addEventListener("click", (e) => {
            e.preventDefault()
            this.editor.highlight(component)
        })
        return link
    }


}
