import { isLeft } from "fp-ts/lib/Either"
import * as t from "io-ts"
import { PathReporter } from "io-ts/lib/PathReporter"
import JSON5 from "json5"
import { Add } from "ts-arithmetic"

export type Dict<T> = Record<string, T | undefined>
export type TimeoutHandle = NodeJS.Timeout

export const InBrowser = typeof window !== 'undefined'

export const Any = undefined as any

// Better types for an Object.keys() replacement
export function keysOf<K extends keyof any>(d: Record<K, any>): K[]
export function keysOf<K extends {}>(o: K): (keyof K)[]
export function keysOf(o: any) {
    return Object.keys(o)
}

// Allows nice definitions of enums with associated data
export class RichStringEnum<K extends keyof any, P> {

    public static withProps<P0>() {
        return function <K0 extends keyof any>(defs: Record<K0, P0>) {
            return new RichStringEnum<K0, P0>(defs)
        }
    }

    private _values: Array<K>

    private constructor(public readonly props: Record<K, P>) {
        this._values = keysOf(props)
        for (let i = 0; i < this._values.length; i++) {
            this[i] = this._values[i]
        }
    }

    public get type(): K {
        throw new Error()
    }

    public get values(): ReadonlyArray<K> {
        return this._values
    }

    public get length(): number {
        return this._values.length
    }

    public get definitions(): Array<[K, P]> {
        const defs: Array<[K, P]> = []
        for (const i of this._values) {
            defs.push([i, this.props[i]])
        }
        return defs
    }

    public includes(val: unknown): val is K {
        return this.values.includes(val as any)
    }

    public indexOf(val: K): number {
        return this.values.indexOf(val)
    }

    [i: number]: K

    public *[Symbol.iterator]() {
        for (const i of this._values) {
            yield i
        }
    }

}

// returns the passed parameter typed as a tuple
export function tuple<T extends readonly any[]>(...items: [...T]): [...T] {
    return items
}

export function mergeWhereDefined<A, B>(a: A, b: B): A & PickDefined<B> {
    const obj: any = { ...a }
    for (const [k, v] of Object.entries(b as any)) {
        if (v !== undefined) {
            obj[k] = v
        }
    }
    return obj
}

export function randomString(n: number) {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    let str = ""
    for (let i = 0; i < n; i++) {
        str += chars[Math.floor(Math.random() * chars.length)]
    }
    return str
}

export function brand<B>() {
    return <A>(val: A): t.Branded<A, B> => {
        return val as any
    }
}

// Utility types to force the evaluation of computed types
// See: https://stackoverflow.com/a/57683652/390581

// expands object types one level deep
export type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never

// expands object types recursively
export type ExpandRecursively<T> = T extends Record<string, unknown>
    ? T extends infer O ? { [K in keyof O]: ExpandRecursively<O[K]> } : never
    : T


export type OptionalKeysOf<T> = { [P in keyof T]-?: undefined extends T[P] ? P : never }[keyof T]
export type RequiredKeysOf<T> = Exclude<keyof T, OptionalKeysOf<T>>

export type KeysOfByType<T, U> = { [P in keyof T]: T[P] extends U ? P : never }[keyof T]

export type FilterProperties<T, U> = {
    [P in KeysOfByType<T, U>]: T[P]
}

export type PickDefined<T> = {
    [P in keyof T as undefined extends T[P] ? never : P]: T[P]
}

export type ValuesOf<T> = T[keyof T]

export type PromiseOrValue<T> = T | Promise<T>

export type HasField<T, K extends string> = K extends keyof T ? true : false

export type IsSameType<A, B> = A extends B ? (B extends A ? true : false) : false
export type PartialWhereUndefinedRecursively<T> = ExpandRecursively<_PartialWhereUndefinedRecursively<T>>

type _PartialWhereUndefinedRecursively<T> =
    // is it an object?
    T extends Record<string, unknown>
    ? T extends infer O ? {
        [P in RequiredKeysOf<O>]: _PartialWhereUndefinedRecursively<O[P]>
    } & {
        [P in OptionalKeysOf<O>]?: _PartialWhereUndefinedRecursively<O[P]>
    }
    : never // "closing the infer block"

    // is it an array?
    : T extends ReadonlyArray<infer E>
    ? Array<_PartialWhereUndefinedRecursively<E>>

    // other types
    : T


// Lightweight ADT facilities
// Either go with:
//    export const MyADT = { Case1: ..., Case2: () => ... }
//    export type MyADT = ADTWith<typeof MyADT>
// ... or, if you need statics:
//    const MyADTCases = { Case1: ..., Case2: () => ... } // as before
//    export type MyADT = ADTWith<typeof MyADTCases>
//    export const MyADT = defineADTStatics(MyADTCases, { ...statics })
// Then, as needed, you can alias type cases:
//    export type MyADTCase = ADTCase<MyADT, "Case1">
export type ADTWith<TADTCases extends Record<string, unknown>>
    = { [K in keyof TADTCases]:
        TADTCases[K] extends (...args: infer TArgs) => infer TReturn ? TReturn : TADTCases[K]
    }[keyof TADTCases]

export function defineADTStatics<
    TADTCases extends Record<string, unknown>,
    TStatics extends Record<string, unknown>
>(cases: TADTCases, statics: TStatics) {
    return { ...statics, ...cases }
}

export type ADTCase<T extends { _tag: string }, Tag extends T["_tag"]> = T extends { _tag: Tag } ? T : never


// Series of type-assertion functions

// We *don't* have isUndefined, etc. functions as they
// do not improve readability or correctness (see for clarifications
// https://stackoverflow.com/a/22053469/390581)

export function isString(v: unknown): v is string {
    return typeof v === "string"
}

export function isArray(arg: unknown): arg is any[] {
    return Array.isArray(arg)
}

// NO: TypeScript is not smart enough to infer the type of the function,
// so just use `typeof arg === "function"` instead
// export function isFunction(arg: unknown): arg is ((...args: any[]) => any) {
//     return typeof arg === "function"
// }

export function isNumber(arg: unknown): arg is number {
    return typeof arg === "number"
}

export function isBoolean(arg: unknown): arg is boolean {
    return typeof arg === "boolean"
}

export function isRecord(arg: unknown): arg is Record<string, unknown> {
    return typeof arg === "object" && arg !== null
}


// Array stuff

export type ArrayOrDirect<T> = T | Array<T>

export function ArrayFillWith<T>(val: T, n: number): Array<T> {
    return Array(n).fill(val)
}

export function ArrayFillUsing<T>(val: (i: number) => T, n: number): Array<T> {
    const arr = Array(n)
    for (let i = 0; i < n; i++) {
        arr[i] = val(i)
    }
    return arr
}

export function ArrayClampOrPad<T>(arr: T[], len: number, padValue: T): T[] {
    const missing = len - arr.length
    if (missing === 0) {
        return arr
    }
    if (missing > 0) {
        for (let i = 0; i < missing; i++) {
            arr.push(padValue)
        }
    } else {
        // missing < 0
        arr.splice(len, -missing)
    }
    return arr
}


// Binary strings

const BinChars = ["0", "1", "?", "Z", "*"] as const

type BinChar = typeof BinChars[number]

type _CheckBinaryStringRec<FullStr extends string, S extends string> =
    S extends `${BinChar}${infer Rest}` // First character must be '1' or '0'
    ? (Rest extends "" ? FullStr : _CheckBinaryStringRec<FullStr, Rest>)
    : never

type BinString = t.Branded<string, "BinString">

/** Statically check that the passed string is a binary string */
export function b<S extends string>(s: _CheckBinaryStringRec<S, S>): BinString {
    return s as BinString
}

/** Checks at runtime that the passed string is a binary string.
 * Don't pass string literals, which should be validated statically with the
 * other function above. */
export function BinaryStringAssert<S extends string>(s: string extends S ? S : never): BinString {
    let valid = true
    if (s.length === 0) {
        valid = false
    } else {
        for (const c of s) {
            if (!BinChars.includes(c)) {
                valid = false
                break
            }
        }
    }
    if (!valid) {
        throw new Error(`BinaryStringAssert: invalid binary string '${s}'`)
    }
    return s as unknown as BinString
}


// Fixed-size array types

// assuming N is a number literal; non-literals filtered by main type
type _FixedArray<TItem, TSize extends number, TRest extends number, Acc extends TItem[], TTrueIfMutable extends boolean>
    = TRest extends 0 ? TTrueIfMutable extends true ? Acc : readonly [...Acc]
    : _FixedArray<TItem, TSize, Add<TRest, -1>, [TItem, ...Acc], TTrueIfMutable>

export type FixedArray<T, N extends number> =
    number extends N ? T[] : _FixedArray<T, N, N, [], true>

//  boolean and not false as 4th type param to keep assignment compatibility
export type ReadonlyFixedArray<T, N extends number> =
    number extends N ? readonly T[] : _FixedArray<T, N, N, [], boolean>

// function testAssignment<NN extends number>(n: N) {
//     type N = NN
//     const arr: number[] = []
//     const arrro: readonly number[] = []
//     const b: readonly number[] = arr
//     // const bb: number[] = arrro

//     const farr: FixedArray<number, N> = [] as any
//     const farrro: ReadonlyFixedArray<number, N> = [] as any
//     const fb: ReadonlyFixedArray<number, N> = farr
//     const fbb: FixedArray<number, N> = farrro // must fail
// }

// type _FixedArrayLength<T extends readonly any[], N extends number>
//     = T extends [] ? N
//     : T extends [any, ...infer U] ? _FixedArrayLength<U, Add<N, 1>>
//     : never

// export type FixedArrayLength<T extends readonly any[]> = _FixedArrayLength<T, 0>


export function FixedArrayFillWith<T, N extends number>(val: T, n: N): FixedArray<T, N> {
    return ArrayFillWith(val, n) as any
}

export function FixedArrayFillUsing<T, N extends number>(val: (i: number) => T, n: N): FixedArray<T, N> {
    return ArrayFillUsing(val, n) as any
}

export function FixedArrayMap<U, Arr extends readonly any[]>(items: Arr, fn: (item: Arr[number]) => U): FixedArray<U, Arr["length"]> {
    return items.map(fn) as any
}

export function FixedArrayAssert<T, N extends number>(arr: readonly T[], n: N): FixedArray<T, N> {
    if (arr.length !== n) {
        throw new Error(`FixedArrayAssert: expected length ${n}, got ${arr.length}`)
    }
    return arr as FixedArray<T, N>
}


// JSON

export function JSONParseObject(str: string): Record<string, unknown> {
    const parsed: unknown = JSON5.parse(str)
    if (isRecord(parsed)) {
        return parsed
    }
    throw new Error("JSONParseObject: not an object")
}


export function isTruthyString(str: string | null | undefined): boolean {
    return str !== null && str !== undefined && (str === "1" || str.toLowerCase() === "true")
}

export function isFalsyString(str: string | null | undefined): boolean {
    return str !== null && str !== undefined && (str === "0" || str.toLowerCase() === "false")
}

export function getURLParameter<T>(sParam: string, defaultValue: T): string | T
export function getURLParameter(sParam: string, defaultValue?: undefined): string | undefined
export function getURLParameter(sParam: string, defaultValue: any) {
    const sPageURL = window.location.search.substring(1)
    const sURLVariables = sPageURL.split('&')
    for (const sURLVariable of sURLVariables) {
        const sParameterName = sURLVariable.split('=')
        if (sParameterName[0] === sParam) {
            return sParameterName[1]
        }
    }
    return defaultValue
}

export function isEmbeddedInIframe(): boolean {
    try {
        return window.self !== window.top
    } catch (e) {
        return true
    }
}

export function onVisible(element: HTMLElement, callback: () => void) {
    new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.intersectionRatio > 0) {
                callback()
                observer.disconnect()
                return
            }
        })
    }).observe(element)
}

export function setEnabled(elem: HTMLButtonElement, enabled: boolean) {
    if (enabled) {
        elem.removeAttribute("disabled")
    } else {
        elem.setAttribute("disabled", "disabled")
    }
}

export function setVisible(elem: HTMLElement, visible: boolean) {
    if (visible) {
        const prevDisplay = elem.getAttribute("data-prev-display")
        if (prevDisplay === null) {
            if (elem.style.display === "none") {
                elem.style.removeProperty("display")
            } else {
                // not hidden
            }
        } else {
            elem.removeAttribute("data-prev-display")
            elem.style.display = prevDisplay
        }
    } else {
        const currentDisplay = elem.style.display
        if (currentDisplay.length !== 0 && currentDisplay !== "none") {
            elem.setAttribute("data-prev-display", currentDisplay)
        }
        elem.style.display = "none"
    }
}

export function toggleVisible(elem: HTMLElement) {
    setVisible(elem, elem.style.display === "none")
}

export function setHidden(elem: HTMLElement, hidden: boolean) {
    if (hidden) {
        elem.style.visibility = "hidden"
    } else {
        elem.style.removeProperty("visibility")
    }
}

export type UIDisplay = "show" | "hide" | "inactive"

export function setDisplay(elem: HTMLElement, display: UIDisplay) {
    setVisible(elem, display !== "hide")
    setHidden(elem, display === "inactive")
}

export function setActive(elem: HTMLElement, active: boolean) {
    elem.classList.toggle("active", active)
}

export function showModal(dlog: HTMLDialogElement): boolean {
    if (typeof (dlog as any).showModal === "function") {
        dlog.style.display = "initial";
        (dlog as any).showModal()
        const listener = () => {
            dlog.style.display = "none"
            dlog.removeEventListener("close", listener)
        }
        dlog.addEventListener("close", listener)
        return true
    }
    return false
}


// An InteractionResult is used to indicate whether some interaction
// had an effect, in which case a snapshot can be taken for undo/redo.
// It can also be a RepeatableChange to allow to redos acting as
// repetitions of the last change.

export type RepeatFunction = () => boolean | RepeatFunction

const InteractionResultCases = {
    NoChange: { _tag: "NoChange" as const, isChange: false as const },
    SimpleChange: { _tag: "SimpleChange" as const, isChange: true as const },
    RepeatableChange: (repeat: RepeatFunction) => ({ _tag: "RepeatableChange" as const, isChange: true as const, repeat }),
}

export const InteractionResult = defineADTStatics(InteractionResultCases, {
    fromBoolean: (changed: boolean) =>
        changed ? InteractionResult.SimpleChange : InteractionResult.NoChange,

    merge: (r0: InteractionResult, r1: InteractionResult): InteractionResult => {
        // keeps the most informative result
        if (r0._tag === "NoChange") {
            return r1
        }
        if (r0._tag === "RepeatableChange") {
            return r0
        }
        // r0 is SimpleChange
        if (r1._tag === "RepeatableChange") {
            return r1
        }
        return r0
    },
})

export type InteractionResult = ADTWith<typeof InteractionResultCases>


// Reused types across several components

export const EdgeTrigger = {
    rising: "rising",
    falling: "falling",
} as const

export type EdgeTrigger = keyof typeof EdgeTrigger

export const ComponentTypeInput = "in" as const

export const ComponentTypeOutput = "out" as const


// More general-purpose utility functions

export function any(bools: boolean[]): boolean {
    for (const b of bools) {
        if (b) {
            return true
        }
    }
    return false
}

export function repeatString(c: string, n: number) {
    return Array(n + 1).join(c)
}

export function formatString(str: string, ...varargs: any[]) {
    if (varargs.length) {
        const t = typeof varargs[0]
        const args = ("string" === t || "number" === t) ?
            Array.prototype.slice.call(varargs)
            : varargs[0]

        for (const key in args) {
            str = str.replace(new RegExp("\\{" + key + "\\}", "gi"), args[key])
        }
    }
    return str
}


export function deepObjectEquals(v1: Record<string, unknown>, v2: Record<string, unknown>) {
    const keys1 = Object.keys(v1)
    const keys2 = Object.keys(v2)
    if (keys1.length !== keys2.length) {
        return false
    }
    for (const key of keys1) {
        if (!deepArrayEquals(v1[key], v2[key])) {
            return false
        }
    }
    return true
}



export function deepArrayEquals(v1: unknown, v2: unknown) {
    if (isArray(v1) && isArray(v2)) {
        if (v1.length !== v2.length) {
            return false
        }
        for (let i = 0; i < v1.length; i++) {
            if (v1[i] !== v2[i]) {
                return false
            }
        }
        return true
    } else {
        return v1 === v2
    }
}


// io-ts utils

export const typeOrUndefined = <T extends t.Mixed>(tpe: T) => {
    return t.union([tpe, t.undefined], tpe.name + " | undefined")
}

export const typeOrNull = <T extends t.Mixed>(tpe: T) => {
    return t.union([tpe, t.null], tpe.name + " | null")
}

export function templateLiteral<L extends string>(regex: RegExp | string, name?: string) {
    const regex_ = typeof regex === 'string' ? new RegExp(regex) : regex
    const predicate = (s: string): s is L => regex_.test(s)
    return new t.RefinementType(
        name ?? `TemplateLiteral<${regex_.source}>`,
        (u): u is L => t.string.is(u) && predicate(u),
        (i, c) => {
            const e = t.string.validate(i, c)
            if (isLeft(e)) {
                return e
            }
            const a = e.right
            return predicate(a) ? t.success(a) : t.failure(a, c)
        },
        t.string.encode,
        t.string,
        predicate,
    )
}

export function validateJson<T, I>(obj: I, repr: t.Decoder<I, T>, what: string): T | undefined {
    const validated = repr.decode(obj)
    if (isLeft(validated)) {
        console.warn(`ERROR while parsing ${what} from %o -> %s: `, obj, PathReporter.report(validated).join("; "))
        return undefined
    }
    return validated.right
}


// Unset; LogicValue

export const HighImpedance = "Z" as const
export type HighImpedance = typeof HighImpedance
export function isHighImpedance<T>(v: T | HighImpedance): v is HighImpedance {
    return v === HighImpedance
}

export const Unknown = "?" as const
export type Unknown = typeof Unknown
export function isUnknown<T>(v: T | Unknown): v is Unknown {
    return v === Unknown
}
export const TUnknown = new t.Type<Unknown>(
    "Unknown",
    isUnknown,
    (input, context) => isUnknown(input) ? t.success(input) : t.failure(input, context),
    t.identity,
)

export type LogicValue = boolean | HighImpedance | Unknown
export const LogicValue = {
    invert(v: LogicValue): LogicValue {
        return isUnknown(v) || isHighImpedance(v) ? v : !v
    },
    filterHighZ(v: LogicValue): boolean | Unknown {
        return isHighImpedance(v) ? Unknown : v
    },
}

export type LogicValueRepr = 0 | 1 | HighImpedance | Unknown
export const LogicValueRepr = new t.Type<LogicValueRepr>(
    "0|1|?|Z",
    (v: unknown): v is LogicValueRepr => isUnknown(v) || isHighImpedance(v) || v === 1 || v === 0,
    (input, context) =>
        isUnknown(input) ? t.success(input) :
            isHighImpedance(input) ? t.success(input) :
                input === 1 ? t.success(1) :
                    input === 0 ? t.success(0) :
                        t.failure(input, context),
    t.identity,
)

export function toLogicValueRepr(v: LogicValue): LogicValueRepr
export function toLogicValueRepr(v: LogicValue | undefined): LogicValueRepr | undefined
export function toLogicValueRepr(v: LogicValue | undefined): LogicValueRepr | undefined {
    switch (v) {
        case true: return 1
        case false: return 0
        case Unknown: return Unknown
        case HighImpedance: return HighImpedance
        case undefined: return undefined
    }
}

export function toLogicValue(v: LogicValueRepr): LogicValue
export function toLogicValue(v: LogicValueRepr | undefined): LogicValue | undefined
export function toLogicValue(v: LogicValueRepr | undefined): LogicValue | undefined {
    switch (v) {
        case 1: return true
        case 0: return false
        case Unknown: return Unknown
        case HighImpedance: return HighImpedance
        case undefined: return undefined
    }
}

export function toLogicValueFromChar(char: string): LogicValue {
    switch (char) {
        case "1": return true
        case "0": return false
        case Unknown: return Unknown
        case HighImpedance: return HighImpedance
        default: return Unknown
    }
}

export const InputOutputValueRepr = t.union([
    LogicValueRepr,
    t.string,
    t.array(LogicValueRepr),
])
export type InputOutputValueRepr = t.TypeOf<typeof InputOutputValueRepr>

export function allBooleans(values: LogicValue[]): values is boolean[] {
    for (const v of values) {
        if (v !== true && v !== false) {
            return false
        }
    }
    return true
}

export function isAllZeros(s: string) {
    for (const c of s) {
        if (c !== "0") {
            return false
        }
    }
    return true
}

export function binaryStringRepr(values: readonly LogicValue[]): string {
    const binStr = values.map(toLogicValueRepr).reverse().join("")
    return binStr
}

export function valuesReprForTest(values: readonly LogicValue[]): string | 0 | 1 {
    return values.length === 1 ? toLogicValueRepr(values[0]) : binaryStringRepr(values)
}

export function hexStringRepr(values: readonly boolean[], hexWidth: number): string {
    const binStr = binaryStringRepr(values)
    return parseInt(binStr, 2).toString(16).toUpperCase().padStart(hexWidth, "0")
}

export function valuesFromBinaryOrHexRepr(wordRepr: string, numBits: number): LogicValue[] {
    const len = wordRepr.length
    const isBinary = len === numBits
    const binaryRepr = isBinary ? wordRepr : parseInt(wordRepr, 16).toString(2).padStart(numBits, "0")
    const row: LogicValue[] = Array(numBits)
    for (let i = 0; i < numBits; i++) {
        row[i] = toLogicValueFromChar(binaryRepr[numBits - i - 1])
    }
    return row
}

export function valuesFromReprForInput(repr: string | LogicValueRepr | LogicValueRepr[] | undefined, numBits: number): LogicValue[] {
    if (repr === undefined || isString(repr) && repr.length === 0) {
        // empty string or undefined
        return ArrayFillWith<LogicValue>(false, numBits)
    }
    if (isArray(repr)) {
        // array of LogicValueRepr
        return ArrayClampOrPad(repr.map(v => toLogicValue(v)), numBits, false)
    }
    if (isNumber(repr)) {
        // use that number for all bits
        return ArrayFillWith<LogicValue>(toLogicValue(repr), numBits)
    }
    // by now, we have a bit string
    return ArrayClampOrPad(Array.from(repr).reverse().map(v => toLogicValueFromChar(v)), numBits, false)
}

export function reprForLogicValues<AllowUndefined extends boolean>(values: LogicValue[], undefinedIfTrivial: AllowUndefined): LogicValueRepr | string | (AllowUndefined extends false ? never : undefined) {
    const numBits = values.length
    if (numBits === 1) {
        const value = values[0]
        return undefinedIfTrivial && value === false ? undefined as any : toLogicValueRepr(value)
    }
    if (undefinedIfTrivial) {
        let nontrivial = false
        for (let i = 0; i < numBits; i++) {
            if (values[i] !== false) {
                nontrivial = true
                break
            }
        }
        if (!nontrivial) {
            return undefined as any
        }
    }

    return values.map(toLogicValueRepr).reverse().join("")
}



// Enums or RichEnums used in several files

export enum Mode {
    STATIC,  // cannot interact in any way
    TRYOUT,  // can change inputs on predefined circuit
    CONNECT, // can additionnally move preexisting components around and connect them
    DESIGN,  // can additionally add components from left menu
    FULL,    // can additionally force output nodes to 'unset' state and draw undetermined dates
}

export async function copyToClipboard(textToCopy: string): Promise<boolean> {

    try {
        await navigator.clipboard.writeText(textToCopy)
        console.log("Text copied to clipboard with new API")
        return true
    } catch (e) {
        // fallback to old method
    }

    function isOS() {
        //can use a better detection logic here
        return navigator.userAgent.match(/ipad|iphone/i)
    }

    const textArea = document.createElement('textarea')
    textArea.readOnly = true
    textArea.contentEditable = "true"
    textArea.value = textToCopy
    document.body.appendChild(textArea)

    if (isOS()) {
        const range = document.createRange()
        range.selectNodeContents(textArea)
        const selection = window.getSelection()
        if (selection !== null) {
            selection.removeAllRanges()
            selection.addRange(range)
            textArea.setSelectionRange(0, 999999)
        }
    } else {
        textArea.select()
    }

    const ok = document.execCommand('copy')
    document.body.removeChild(textArea)
    return ok
}

export async function pasteFromClipboard(): Promise<string | undefined> {

    try {
        const text = await navigator.clipboard.readText()
        console.log("Text pasted from clipboard with new API")
        return text
    } catch (e) {
        // fallback to old method
    }

    const textArea = document.createElement('textarea')
    textArea.readOnly = false
    textArea.contentEditable = "true"
    document.body.appendChild(textArea)

    let result: string | undefined = undefined
    textArea.focus()
    const ok = document.execCommand('paste')
    if (ok && textArea.value.length > 0) {
        result = textArea.value
    }
    document.body.removeChild(textArea)
    return result
}

export function targetIsFieldOrOtherInput(e: Event) {
    const targets = e.composedPath()
    let elem, tagName
    return targets.length !== 0 && (elem = targets[0]) instanceof HTMLElement && ((tagName = elem.tagName) === "INPUT" || tagName === "SELECT")
}

export function getScrollParent(element: HTMLElement): HTMLElement | Document {
    let style = getComputedStyle(element)
    const excludeStaticParent = style.position === "absolute"
    const overflowRegex = /(auto|scroll)/

    if (style.position === "fixed") {
        return document
    }
    let parent
    for (parent = element; (parent = parent.parentElement);) {
        style = getComputedStyle(parent)
        if (excludeStaticParent && style.position === "static") {
            continue
        }
        if (overflowRegex.test(style.overflow + style.overflowY + style.overflowX)) {
            return parent
        }
    }
    return document
}


export const fetchJSONP = ((unique: number) => (url: string) =>
    new Promise<string>(resolve => {
        const script = document.createElement('script')
        const name = `_jsonp_${unique++}`

        if (url.match(/\?/)) {
            url += `&callback=${name}`
        } else {
            url += `?callback=${name}`
        }

        script.src = url;
        (window as any)[name] = (json: any) => {
            script.remove()
            delete (window as any)[name]
            resolve(JSON5.stringify(json))
        }

        document.body.appendChild(script)
    })
)(0)
