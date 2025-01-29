import * as t from "io-ts"
import { type ComponentList } from "./ComponentList"
import { type Component } from "./components/Component"
import { DrawableParent } from "./components/Drawable"
import { type Input } from "./components/Input"
import { type Output } from "./components/Output"
import { S } from "./strings"
import { ADTCase, ADTWith, ComponentTypeInput, ComponentTypeOutput, InputOutputValueRepr, isString, LogicValue, reprForLogicValues } from "./utils"


export type TestCaseValueMap<IO extends Input | Output> = Map<IO | string, InputOutputValueRepr>


function buildMap<IO extends Input | Output>(repr: Record<string, InputOutputValueRepr>, compList: ComponentList, isInputOutput: (comp: Component | undefined) => comp is IO): TestCaseValueMap<IO> {
    const map: TestCaseValueMap<IO> = new Map()
    for (const [ref, value] of Object.entries(repr)) {
        const comp = compList.get(ref)
        if (isInputOutput(comp)) {
            map.set(comp, value)
        } else {
            // fall back to using the ref as a string
            map.set(ref, value)
        }
    }
    return map
}

function fixMap<IO extends Input | Output>(map: TestCaseValueMap<IO>, compList: ComponentList, isInputOutput: (comp: Component | undefined) => comp is IO) {
    for (const [k, v] of map.entries()) {
        if (isString(k)) {
            const comp = compList.get(k)
            if (isInputOutput(comp)) {
                map.delete(k)
                map.set(comp, v)
            }
        }
    }
}

function isInput(comp: Component | undefined): comp is Input {
    return comp?.def.type === ComponentTypeInput
}

function isOutput(comp: Component | undefined): comp is Output {
    return comp?.def.type === ComponentTypeOutput
}

export type TestCaseCombinationalRepr = t.TypeOf<typeof TestCaseCombinational.Repr>

export class TestCaseCombinational {

    public static get Repr() {
        return t.intersection([
            t.type({
                in: t.record(t.string, InputOutputValueRepr),
                out: t.record(t.string, InputOutputValueRepr),
            }),
            t.partial({
                name: t.string,
                stopOnFail: t.boolean,
            }),
        ], "TestCaseCombinational")
    }

    public name: string | undefined
    public in: TestCaseValueMap<Input>
    public out: TestCaseValueMap<Output>
    public stopOnFail: boolean

    public constructor(repr: TestCaseCombinationalRepr, compList: ComponentList) {
        if (repr !== undefined) {
            this.name = repr.name
            this.in = buildMap(repr.in, compList, isInput)
            this.out = buildMap(repr.out, compList, isOutput)
            this.stopOnFail = repr.stopOnFail ?? false
        } else {
            this.name = S.Tests.DefaultTestCaseName
            this.in = new Map()
            this.out = new Map()
            this.stopOnFail = false
        }
    }

    public tryFixReferences(compList: ComponentList) {
        fixMap(this.in, compList, isInput)
        fixMap(this.out, compList, isOutput)
    }

    public toJSON(): TestCaseCombinationalRepr {
        const mapRepr = (map: TestCaseValueMap<Input | Output>) =>
            Object.fromEntries([...map.entries()].map(
                ([k, v]) => [(isString(k) ? k : k.ref ?? "?"), v])
            )
        return {
            name: this.name,
            in: mapRepr(this.in),
            out: mapRepr(this.out),
            stopOnFail: this.stopOnFail === true ? true : undefined,
        }
    }

}


export type TestSuiteRepr = t.TypeOf<typeof TestSuite.Repr>

export class TestSuite {

    public static get Repr() {
        return t.intersection([
            t.type({
                cases: t.array(TestCaseCombinational.Repr),
            }),
            t.partial({
                name: t.string,
                hidden: t.boolean,
            }),
        ], "TestSuite")
    }

    public static get ReprArray() {
        return t.array(TestSuite.Repr)
    }

    public name: string | undefined
    public isHidden: boolean
    public testCases: TestCaseCombinational[]

    public constructor(reprAndComps?: [TestSuiteRepr, ComponentList]) {
        if (reprAndComps !== undefined) {
            const [repr, compList] = reprAndComps
            this.name = repr.name
            this.isHidden = repr.hidden ?? false
            this.testCases = repr.cases.map(tc => new TestCaseCombinational(tc, compList))
        } else {
            this.name = undefined
            this.isHidden = false
            this.testCases = []
        }
    }

    public toJSON(): TestSuiteRepr {
        return {
            name: this.name,
            hidden: this.isHidden === true ? true : undefined,
            cases: this.testCases.map(tc => tc.toJSON()),
        }
    }

}

export type TestCaseResultMismatch = { output: Output, expected: LogicValue[], actual: LogicValue[] }

export const TestCaseResult = {
    Pass: { _tag: "pass" as const },
    Skip: { _tag: "skip" as const },
    Fail: (mismatches: TestCaseResultMismatch[]) => ({ _tag: "fail" as const, mismatches }),
    Error: (msg: string) => ({ _tag: "error" as const, msg }),
}
export type TestCaseResult = ADTWith<typeof TestCaseResult>

export type TestCaseResultFail = ADTCase<TestCaseResult, "fail">


export class TestSuiteResults {

    public readonly testCaseResults: Array<[TestCaseCombinational, TestCaseResult]> = []

    public constructor(
        public readonly testSuite: TestSuite
    ) {
    }

    public addTestCaseResult(testCase: TestCaseCombinational, result: TestCaseResult) {
        this.testCaseResults.push([testCase, result])
    }

    public isAllPass(): boolean {
        return this.testCaseResults.every(([, result]) => result._tag === "pass")
    }

    public dump() {
        console.group(`Test Suite Results for ${this.testSuite.name}`)
        for (const [testCase, result] of this.testCaseResults) {
            console.group(`Test Case ${testCase.name}`)
            if (result._tag === "pass") {
                console.log("PASS")
            } else if (result._tag === "fail") {
                const mismatches = result.mismatches.map(m => `${m.output.ref}: ${reprForLogicValues(m.actual, false)} instead of ${reprForLogicValues(m.expected, false)}`)
                console.log("FAIL - mismatches: " + mismatches.join(", "))
            } else if (result._tag === "error") {
                console.log(`ERROR - ${result.msg}`)
            }
            console.groupEnd()
        }
        console.groupEnd()
    }

}


export class TestSuites {

    private readonly _testSuites: TestSuite[]

    public constructor(
        public readonly parent: DrawableParent
    ) {
        this._testSuites = []
    }

    public get suites(): ReadonlyArray<TestSuite> {
        return this._testSuites
    }

    public totalCases(): number {
        return this._testSuites.reduce((acc, suite) => acc + suite.testCases.length, 0)
    }

    public set(testSuites: readonly TestSuite[]) {
        this._testSuites.length = 0
        this._testSuites.push(...testSuites)
    }

    public push(testSuite: TestSuite) {
        this._testSuites.push(testSuite)
    }

}