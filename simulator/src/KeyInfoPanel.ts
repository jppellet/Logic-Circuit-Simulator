import { LogicEditor } from "./LogicEditor"
import { div, icon, span, style, title } from "./htmlgen"
import { IconName } from "./images"
import { S } from "./strings"

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

        const testIONotMarked = hasTests && markedAsKey.every(ref => !this.editor.testSuites.hasReferenceTo(ref))

        const checks: Array<[boolean, CriterionStrings]> = [
            [hasTests, s.TestsDefined],
            [keyMarked, s.KeyMarked],
            [testIONotMarked, s.TestIONotMarked],
        ]

        const makeIcon = (name: IconName, color: string) => icon(name, style(`color: ${color}; position: relative; top: -2px; display: inline-block; margin-right: 0.2ex`))

        const results = checks.map(([passed, label], index) => {
            const html = passed ?
                span(makeIcon("check", "green"), label.true) :
                span(makeIcon("close", "red"), label.false, title(label.info))
            return { index, passed, html }
        })

        this.root.innerHTML = ""

        results.forEach(({ html }, i) => {
            if (i > 0) {
                span(style("padding: 0 1ex")).applyTo(this.root)
            }
            html.applyTo(this.root)
        })
    }

}
