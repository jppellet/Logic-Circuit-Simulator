import { a, attr, button, cls, data, div, href, i, Modifier, mods, setupSvgIcon, span, style, table, tbody, td, th, thead, title, tr } from "./htmlgen"
import { LogicEditor } from "./LogicEditor"
import { S } from "./strings"
import { TestCaseCombinational, TestCaseResult, TestCaseResultFail, TestSuite, TestSuites } from "./TestSuite"
import { setVisible, toLogicValueRepr } from "./utils"


export class TestsPalette {

    public readonly rootElem: HTMLDivElement
    private readonly suiteContainer: HTMLDivElement

    public constructor(
        public readonly editor: LogicEditor,
    ) {
        const s = S.Tests

        const testsTitleElem = div(cls("toolbar-title"), s.Title).render()
        editor.eventMgr.registerTitleDragListenersOn(testsTitleElem, () => {
            editor.setTestsPaletteVisible(false)
        })

        this.suiteContainer = div(style("width: 100%; font-size: 80%;")).render()

        this.rootElem = div(cls("sim-toolbar-right"),
            style("display: none"),
            data("prev-display")("block"),
            testsTitleElem,
            this.suiteContainer
        ).render()
    }

    public setVisible(visible: boolean) {
        setVisible(this.rootElem, visible)
    }

    public clearAllSuites() {
        this.suiteContainer.innerHTML = ""
    }

    public updateWith(testSuites: TestSuites) {
        this.clearAllSuites()
        // TODO
        for (const suite of testSuites.suites) {
            console.log("adding suite " + suite.name)
        }
        this.editor.didLoadTests(testSuites)
    }

    public addTestSuite(testSuite: TestSuite): TestSuiteUI {
        const ui = new TestSuiteUI(this.editor, this, testSuite)
        this.suiteContainer.appendChild(ui.rootElem)
        return ui
    }

}


type TestCaseHTML = { line: HTMLElement, details: HTMLElement, container: HTMLElement, toggle: () => void }

export class TestSuiteUI {

    public readonly rootElem: HTMLDivElement
    private readonly htmlResults: TestCaseHTML[]

    public constructor(
        private readonly editor: LogicEditor,
        private readonly palette: TestsPalette,
        private readonly testSuite: TestSuite
    ) {
        const s = S.Tests

        this.htmlResults = testSuite.testCases.map(tc => {
            const line = button(cls("test-disclosable testcase-button"), tc.name ?? s.DefaultTestCaseName).render()
            const details = div(cls("testcase-details"), style("display: none")).render()
            const toggle = () => {
                const expanded = line.classList.toggle("expanded")
                setVisible(details, expanded)
            }
            line.addEventListener("click", toggle)
            const container = div(cls("testcase wait"), line, details).render()
            return { line, details, container, toggle } as const
        })
        const header =
            button(cls("test-suite test-disclosable expanded"), testSuite.name ?? s.DefaultTestSuiteName).render()
        const content =
            div(cls("test-cases"), style("display: block"), ...this.htmlResults.map(p => p.container)).render()

        header.addEventListener("click", () => {
            const expanded = header.classList.toggle("expanded")
            setVisible(content, expanded)
        })

        this.rootElem = div(header, content).render()
    }

    public setRunning(i: number) {
        const htmlResult = this.htmlResults[i]
        htmlResult.container.className = "testcase running"
        htmlResult.details.appendChild(this.makeTestCaseTable(this.testSuite.testCases[i]))
        htmlResult.toggle()
    }

    public setResult(i: number, result: TestCaseResult) {
        const htmlResult = this.htmlResults[i]
        if (result._tag === "fail") {
            // replace table with more detailed version
            htmlResult.details.innerHTML = ""
            htmlResult.details.appendChild(this.makeTestCaseTable(this.testSuite.testCases[i], result))
        } else {
            htmlResult.toggle() // close details if no failure
        }
        htmlResult.container.className = "testcase " + result._tag
    }

    private makeComponentRefSpan(name: string): HTMLElement {
        const link = a(name, href("#")).render()
        link.addEventListener("click", () => {
            this.editor.highlight(name)
        })
        return link
    }

    private makeTestCaseTable(testCase: TestCaseCombinational, failed?: TestCaseResultFail): HTMLTableElement {
        const s = S.Tests
        const tableBody = tbody().render()
        const ins = [...testCase.in]
        const outs = [...testCase.out]
        for (let i = 0; i < Math.max(ins.length, outs.length); i++) {
            const inStr = i >= ins.length ? "" : mods(this.makeComponentRefSpan(ins[i][0]), `: ${toLogicValueRepr(ins[i][1])}`)

            let outStr: Modifier = ""
            if (i < outs.length) {
                const outName = outs[i][0]
                let outValue: Modifier = `${toLogicValueRepr(outs[i][1])}` // should value
                if (failed !== undefined) {
                    const mismatch = failed.mismatches.find(m => m.name === outName)
                    if (mismatch !== undefined) {
                        outValue = mods(span(cls("testcase-wrongvalue"), `${toLogicValueRepr(mismatch.actual)}`), ` ≠ ${outValue}`)
                    }
                }
                outStr = mods(this.makeComponentRefSpan(outName), `: `, outValue)
            }
            tr(td(inStr), td(outStr)).applyTo(tableBody)
        }
        const setTheseInputsButton = i(
            cls("svgicon"), style("margin: 0 5px; width: 14px; color: gray; cursor: pointer;"),
            attr("data-icon", "setinput"),
            title(s.SetTheseInputs),
        ).render()
        setupSvgIcon(setTheseInputsButton)
        setTheseInputsButton.addEventListener("click", () => {
            this.editor.trySetInputsAndRecalc(testCase.in)
        })

        return table(cls("testcase-table"),
            thead(tr(th(s.SetInputs, setTheseInputsButton), th(s.WantedOutputs))),
            tableBody
        ).render()
    }

}