import * as t from "io-ts"
import { S } from "./strings"
import { ADTWith, LogicValue, LogicValueRepr, toLogicValue, toLogicValueRepr, typeOrUndefined } from "./utils"

export type TestCaseCombinationalRepr = t.TypeOf<typeof TestCaseCombinational.Repr>

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
    public in: Map<string, LogicValue>
    public out: Map<string, LogicValue>
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
        const mapRepr = (map: Map<string, LogicValue>) =>
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
            testCases: t.array(TestCaseCombinational.Repr),
        }, "TestSuite")
    }

    public name: string | undefined
    public testCases: TestCaseCombinational[]

    public constructor(repr?: TestSuiteRepr) {
        if (repr !== undefined) {
            this.name = repr.name
            this.testCases = repr.testCases.map(tc => new TestCaseCombinational(tc))
        } else {
            this.name = S.Tests.DefaultTestSuiteName
            this.testCases = []
        }
    }

    public toJSON(): t.TypeOf<typeof TestSuite.Repr> {
        return {
            name: this.name,
            testCases: this.testCases.map(tc => tc.toJSON()),
        }
    }

}


export const TestCaseResult = {
    Pass: { _tag: "pass" as const },
    Skip: { _tag: "skip" as const },
    Fail: (msgs: string[]) => ({ _tag: "fail" as const, msgs }),
    Error: (msg: string) => ({ _tag: "error" as const, msg }),
}
export type TestCaseResult = ADTWith<typeof TestCaseResult>



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
                console.log(["FAIL", ...result.msgs].join(" - "))
            } else if (result._tag === "error") {
                console.log(`ERROR - ${result.msg}`)
            }
            console.groupEnd()
        }
        console.groupEnd()
    }

}