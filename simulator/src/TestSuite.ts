import * as t from "io-ts"
import { DrawableParent } from "./components/Drawable"
import { S } from "./strings"
import { ADTCase, ADTWith, LogicValue, LogicValueRepr, toLogicValue, toLogicValueRepr, typeOrUndefined } from "./utils"

export type TestCaseCombinationalRepr = t.TypeOf<typeof TestCaseCombinational.Repr>

export type InOutValueMap = Map<string, LogicValue>

export class TestCaseCombinational {

    public static get Repr() {
        return t.intersection([
            t.type({
                in: t.record(t.string, LogicValueRepr),
                out: t.record(t.string, LogicValueRepr),
            }),
            t.partial({
                name: t.string,
                breakOnFail: t.boolean,
            }),
        ], "TestCaseCombinational")
    }

    public name: string | undefined
    public in: InOutValueMap
    public out: InOutValueMap
    public breakOnFail: boolean

    public constructor(repr?: TestCaseCombinationalRepr) {
        if (repr !== undefined) {
            this.name = repr.name
            this.in = new Map(Object.entries(repr.in).map(([k, v]) => [k, toLogicValue(v)]))
            this.out = new Map(Object.entries(repr.out).map(([k, v]) => [k, toLogicValue(v)]))
            this.breakOnFail = repr.breakOnFail ?? false
        } else {
            this.name = S.Tests.DefaultTestCaseName
            this.in = new Map()
            this.out = new Map()
            this.breakOnFail = false
        }
    }

    public toJSON(): TestCaseCombinationalRepr {
        const mapRepr = (map: InOutValueMap) =>
            Object.fromEntries([...map.entries()].map(([k, v]) => [k, toLogicValueRepr(v)]))
        return {
            name: this.name,
            in: mapRepr(this.in),
            out: mapRepr(this.out),
            breakOnFail: this.breakOnFail === true ? true : undefined,
        }
    }

}


export type TestSuiteRepr = t.TypeOf<typeof TestSuite.Repr>

export class TestSuite {

    public static get Repr() {
        return t.type({
            name: typeOrUndefined(t.string),
            cases: t.array(TestCaseCombinational.Repr),
        }, "TestSuite")
    }

    public static get ReprArray() {
        return t.array(TestSuite.Repr)
    }

    public name: string | undefined
    public testCases: TestCaseCombinational[]

    public constructor(repr?: TestSuiteRepr) {
        if (repr !== undefined) {
            this.name = repr.name
            this.testCases = repr.cases.map(tc => new TestCaseCombinational(tc))
        } else {
            this.name = S.Tests.DefaultTestSuiteName
            this.testCases = []
        }
    }

    public toJSON(): TestSuiteRepr {
        return {
            name: this.name,
            cases: this.testCases.map(tc => tc.toJSON()),
        }
    }

}

export type TestCaseResultMismatch = { name: string, expected: LogicValue, actual: LogicValue }

export const TestCaseResult = {
    Pass: { _tag: "pass" as const },
    Skip: { _tag: "skip" as const },
    Fail: (mismatches: TestCaseResultMismatch[]) => ({ _tag: "fail" as const, mismatches }),
    Error: (msg: string) => ({ _tag: "error" as const, msg }),
}
export type TestCaseResult = ADTWith<typeof TestCaseResult>

export type TestCaseResultFail = ADTCase<TestCaseResult, "fail">


export class TestSuiteResults {

    public constructor(
        public readonly testSuite: TestSuite
    ) {
    }

    public readonly testCaseResults: Array<[TestCaseCombinational, TestCaseResult]> = []

    public addTestCaseResult(testCase: TestCaseCombinational, result: TestCaseResult) {
        this.testCaseResults.push([testCase, result])
    }

    public dump() {
        console.group(`Test Suite Results for ${this.testSuite.name}`)
        for (const [testCase, result] of this.testCaseResults) {
            console.group(`Test Case ${testCase.name}`)
            if (result._tag === "pass") {
                console.log("PASS")
            } else if (result._tag === "fail") {
                const mismatches = result.mismatches.map(m => `${m.name}: ${toLogicValueRepr(m.actual)} instead of ${toLogicValueRepr(m.expected)}`)
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
        this.parent.ifEditing?.testsPalette.updateWith(this)
    }

}