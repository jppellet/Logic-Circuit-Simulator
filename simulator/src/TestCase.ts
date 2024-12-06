import * as t from "io-ts"
import { S } from "./strings"
import { LogicValue, LogicValueRepr, toLogicValue, toLogicValueRepr, typeOrUndefined } from "./utils"

export type TestCaseRepr = t.TypeOf<typeof TestCase.Repr>

export class TestCase {

    public static get Repr() {
        return t.type({
            name: typeOrUndefined(t.string),
            in: t.record(t.string, LogicValueRepr),
            out: t.record(t.string, LogicValueRepr),
        }, "TestCase")
    }

    public name: string | undefined
    public in: Map<string, LogicValue>
    public out: Map<string, LogicValue>

    public constructor(repr?: TestCaseRepr) {
        if (repr !== undefined) {
            this.name = repr.name
            this.in = new Map(Object.entries(repr.in).map(([k, v]) => [k, toLogicValue(v)]))
            this.out = new Map(Object.entries(repr.out).map(([k, v]) => [k, toLogicValue(v)]))
        } else {
            this.name = S.Settings.DefaultTestCaseName
            this.in = new Map()
            this.out = new Map()
        }
    }

    public toJSON(): TestCaseRepr {
        const mapRepr = (map: Map<string, LogicValue>) =>
            Object.fromEntries([...map.entries()].map(([k, v]) => [k, toLogicValueRepr(v)]))
        return {
            name: this.name,
            in: mapRepr(this.in),
            out: mapRepr(this.out),
        }
    }


}

