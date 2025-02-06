import { type Input } from "./components/Input"
import { type Output } from "./components/Output"
import { a, cls, data, div, href, Modifier, mods, span, style, table, tbody, td, th, thead, title, tr } from "./htmlgen"
import { makeIcon } from "./images"
import { LogicEditor } from "./LogicEditor"
import { S } from "./strings"
import { TestCaseCombinational, TestCaseResult, TestCaseResultFail, TestSuite } from "./TestSuite"
import { UIPermissions } from "./UIPermissions"
import { isString, reprForLogicValues, setVisible } from "./utils"


export class TestsPalette {

    public readonly rootElem: HTMLDivElement
    private readonly scroller: HTMLDivElement
    private readonly suiteContainer: HTMLDivElement
    private readonly testSuites = new Map<TestSuite, TestSuiteUI>()

    public constructor(
        public readonly editor: LogicEditor,
    ) {
        const s = S.Tests

        const testsTitleElem = div(cls("toolbar-title"), s.Title).render()
        editor.eventMgr.registerTitleDragListenersOn(testsTitleElem, () => {
            editor.setTestsPaletteVisible(false)
        })

        this.suiteContainer = div(style("width: 100%;")).render()
        this.scroller = div(style("width: 100%; font-size: 80%; overflow-y: auto; min-height: 28px; resize: vertical"), this.suiteContainer).render()

        this.rootElem = div(cls("sim-toolbar-right"),
            style("display: none"),
            data("prev-display")("block"),
            testsTitleElem,
            this.scroller
        ).render()
    }

    public updateMaxHeight() {
        const maxHeight = Math.min(this.suiteContainer.clientHeight, this.editor.html.mainCanvas.clientHeight - 38)
        this.scroller.style.maxHeight = maxHeight + "px"
    }

    public setVisible(visible: boolean) {
        setVisible(this.rootElem, visible)
        if (visible) {
            this.updateMaxHeight()
        }
    }

    public clearAllSuites() {
        this.suiteContainer.innerHTML = ""
        this.testSuites.clear()
    }

    public update() {
        this.clearAllSuites()
        const parentSuites = this.editor.editorRoot.testSuites
        for (const suite of parentSuites.suites) {
            this.addTestSuite(suite)
        }
        this.editor.didLoadTests(parentSuites)
    }

    public addTestSuite(testSuite: TestSuite): TestSuiteUI {
        const numExisting = this.testSuites.size
        const ui = new TestSuiteUI(this.editor, this, testSuite)
        ui.expanded = numExisting === 0
        this.testSuites.set(testSuite, ui)
        this.suiteContainer.appendChild(ui.rootElem)
        return ui
    }

    public getOrMakeUIFor(testSuite: TestSuite): TestSuiteUI {
        return this.testSuites.get(testSuite) ?? this.addTestSuite(testSuite)
    }

}


type TestCaseHTML = { line: HTMLElement, details: HTMLElement, container: HTMLElement, toggle: (force?: boolean) => void }

export class TestSuiteUI {

    public readonly rootElem: HTMLDivElement
    private readonly header: HTMLDivElement
    private readonly content: HTMLDivElement
    private _expanded = false

    private readonly htmlResults: TestCaseHTML[]

    public constructor(
        private readonly editor: LogicEditor,
        private readonly palette: TestsPalette,
        private readonly testSuite: TestSuite,
    ) {
        const s = S.Tests

        this.htmlResults = testSuite.testCases.map(tc => {
            const deleteButton = span(cls("sim-mode-link testcase-delete-button"), style("flex: none; font-size: 80%; opacity: 0.85; margin: -1px; padding: 1px"),
                title(s.DeleteTest), makeIcon("trash")
            ).render()
            deleteButton.addEventListener("click", () => {
                if (!UIPermissions.canModifyTestCases(this.editor)) {
                    // button should be hidden anyway
                    window.alert(S.Messages.NoPermission)
                    return
                }
                this.editor.removeTestCase(tc)
            })

            const line = div(cls("test-disclosable testcase-button"),
                span(style("flex: auto"), tc.name ?? s.DefaultTestCaseName),
                deleteButton,
            ).render()
            const details = div(cls("testcase-details"), style("display: none"), this.makeTestCaseDetailsTable(tc)).render()
            const toggle = (force?: boolean) => {
                const expanded = line.classList.toggle("expanded", force)
                setVisible(details, expanded)
                this.palette.updateMaxHeight()
            }
            line.addEventListener("click", (e) => {
                if (e.target !== deleteButton) {
                    toggle()
                }
            })
            const container = div(cls("testcase wait"), line, details).render()
            return { line, details, container, toggle } as const
        })


        const runAllIcon = makeIcon("play")
        style("position: relative; top: -2px;").applyTo(runAllIcon)
        const runAllButton = span(cls("sim-mode-link"), style("font-size: 80%; opacity: 0.85;"),
            title(s.RunTestSuite), runAllIcon, s.Run
        ).render()

        runAllButton.addEventListener("click", async () => {
            const oldExpanded = this.expanded
            const testResult = await this.editor.runTestSuite(this.testSuite, { fast: true })
            if (testResult !== undefined && testResult.isAllPass()) {
                this.expanded = oldExpanded
            }
        })

        this.header =
            div(cls("test-suite test-disclosable expanded"), testSuite.name ?? s.DefaultTestSuiteName, runAllButton).render()
        this.content =
            div(cls("test-cases"), style("display: block"), ...this.htmlResults.map(p => p.container)).render()

        this.header.addEventListener("click", (e) => {
            if (e.target === this.header) {
                this.expanded = !this.expanded
            }
        })

        this.rootElem = div(this.header, this.content).render()
    }

    public get expanded() {
        return this._expanded
    }

    public set expanded(expanded: boolean) {
        this._expanded = this.header.classList.toggle("expanded", expanded)
        setVisible(this.content, this._expanded)
        this.palette.updateMaxHeight()
    }

    public setRunning(i: number) {
        if (!this._expanded) {
            this.expanded = true
        }
        const htmlResult = this.htmlResults[i]
        htmlResult.container.className = "testcase running"
        htmlResult.toggle(true)
    }

    public setResult(i: number, result: TestCaseResult) {
        const htmlResult = this.htmlResults[i]
        if (result._tag === "fail") {
            // replace table with more detailed version
            htmlResult.details.innerHTML = ""
            htmlResult.details.appendChild(this.makeTestCaseDetailsTable(this.testSuite.testCases[i], result))
        } else {
            htmlResult.toggle() // close details if no failure
        }
        htmlResult.container.className = "testcase " + result._tag
    }

    private makeComponentRefSpan(elem: Input | Output | string): HTMLElement {
        const compStr = isString(elem) ? elem
            : isString(elem.name) ? elem.name
                : elem.ref ?? "?"
        const link = a(compStr, href("#")).render()
        link.addEventListener("click", () => {
            this.editor.highlight(elem)
        })
        return link
    }

    private makeTestCaseDetailsTable(testCase: TestCaseCombinational, failed?: TestCaseResultFail): HTMLTableElement {
        const s = S.Tests
        const tableBody = tbody().render()
        const ins = [...testCase.in]
        const outs = [...testCase.out]
        for (let i = 0; i < Math.max(ins.length, outs.length); i++) {
            const inStr = i >= ins.length ? "" : mods(this.makeComponentRefSpan(ins[i][0]), `: ${ins[i][1]}`)

            let outStr: Modifier = ""
            if (i < outs.length) {
                const [output, expectedRepr] = outs[i]
                let outValue: Modifier = String(expectedRepr)
                if (failed !== undefined) {
                    const mismatch = failed.mismatches.find(m => m.output === output)
                    if (mismatch !== undefined) {
                        outValue = mods(span(cls("testcase-wrongvalue"), `${reprForLogicValues(mismatch.actual, false)}`), ` ≠ ${outValue}`)
                    }
                }
                outStr = mods(this.makeComponentRefSpan(output), `: `, outValue)
            }
            tr(td(inStr), td(outStr)).applyTo(tableBody)
        }


        const setTheseInputsButton = makeIcon("setinput")
        mods(
            style("margin: 0 5px; width: 14px; color: gray; cursor: pointer;"),
            title(s.SetTheseInputs),
        ).applyTo(setTheseInputsButton)
        setTheseInputsButton.addEventListener("click", () => {
            testCase.tryFixReferences(this.editor.components)
            this.editor.trySetInputsAndRecalc(testCase.in)
        })

        return table(cls("testcase-table"),
            thead(tr(th(s.SetInputs, setTheseInputsButton), th(s.WantedOutputs))),
            tableBody
        ).render()
    }

}