import { saveAs } from 'file-saver'
import * as t from "io-ts"
import JSON5 from "json5"
import * as json5util from "json5/lib/util"
import { CurrentFormatVersion, migrateData } from './DataMigration'
import { LogicEditor } from "./LogicEditor"
import { NodeMapping } from './NodeManager'
import { TestSuite, TestSuiteRepr } from './TestSuite'
import { type Component } from "./components/Component"
import { type CustomComponent, type CustomComponentDefRepr } from './components/CustomComponent'
import { DrawableParent } from './components/Drawable'
import { Wire } from "./components/Wire"
import { S } from './strings'
import { JSONParseObject, isArray, isRecord, isString, keysOf, validateJson } from "./utils"


export type Circuit = CommonFields & {

    /** Global circuit options */
    opts?: Record<string, unknown>,

    /** The current subcircuit being edited (but not valided yet) */
    scratch?: Scratch,

    /** Copy of what was passed through URL parameters */
    userdata?: string | Record<string, unknown> | undefined

} & ComponentAndWires

export type Library = CommonFields & {
    type: "lib",
}

type Scratch = {

    /** The ID of the component whose scratch space it is */
    id: string,

} & ComponentAndWires

type CommonFields = {
    v: typeof CurrentFormatVersion,
    defs?: CustomComponentDefRepr[],
}

type WireRepr = t.TypeOf<typeof Wire.Repr>

export type ComponentAndWires = {

    /** The original reference position these components are from */
    pos?: [number, number],

    /** The components themselves, keyed by their ID */
    components?: Record<string, Record<string, unknown>>,

    /** The wires between the previously listed components */
    wires?: WireRepr[],

    /** The test suites linked to the circuit */
    tests?: TestSuiteRepr[],
}

type LoadOptions = {
    isUndoRedoAction?: boolean,
    immediateWirePropagation?: boolean,
    skipMigration?: boolean
}

class _Serialization {

    // Top-level

    public saveCircuitToFile(editor: LogicEditor) {
        const jsonStr = this.stringifyObject(this.buildCircuitObject(editor), false)
        const blob = new Blob([jsonStr], { type: 'application/json5' })
        const filename = editor.documentDisplayName + ".json"
        saveAs(blob, filename)
    }

    public saveLibraryToFile(editor: LogicEditor) {
        const jsonStr = this.stringifyObject(this.buildLibraryObject(editor), false)
        const blob = new Blob([jsonStr], { type: 'application/json5' })
        const filename = editor.documentDisplayName + "-lib.json"
        saveAs(blob, filename)
    }

    public loadCircuitOrLibrary(editor: LogicEditor, content: string | Record<string, unknown>, opts?: LoadOptions) {
        let parsed: Record<string, unknown>
        if (!isString(content)) {
            parsed = content
        } else {
            try {
                parsed = JSONParseObject(content)
            } catch (err) {
                console.error(err)
                return "can't load this JSON - error “" + err + `”, length = ${content.length}, JSON:\n` + content
            }
        }
        const isLib = (parsed as Partial<Library>).type === "lib"
        if (isLib) {
            return this.doLoadLibrary(editor, parsed)
        } else {
            return this.loadCircuit(editor, parsed, opts)
        }
    }

    public pasteComponents(parent: DrawableParent, content: string): Component[] | string {
        let parsed: Record<string, unknown>
        try {
            parsed = JSONParseObject(content)
        } catch (err) {
            console.error(err)
            return "can't load this JSON - error “" + err + `”, length = ${content.length}, JSON:\n` + content
        }

        // find difference of mouse position and honor it in the new components' positions
        // to avoid pasting new components on top of the old ones
        let offsetPos: [number, number] | undefined = undefined
        if (isArray(parsed.pos)) {
            const editor = parent.editor
            const ceil10 = (x: number) => Math.ceil(x / 10) * 10
            offsetPos = [ceil10(editor.mouseX - parsed.pos[0]), ceil10(editor.mouseY - parsed.pos[1])]
            // console.log(`offsetPos = ${offsetPos}`)
        }

        const compReprs = parsed.components
        if (!isArray(compReprs) && !isRecord(compReprs)) {
            return "invalid JSON: 'components' must be an array or an object"
        }

        const { nodeMapping, components, componentsByRef } = this.makeComponents(parent, compReprs, offsetPos)
        this.makeWires(parent, parsed.wires, nodeMapping, componentsByRef, false)
        return components
    }


    // Private

    private doLoadLibrary(editor: LogicEditor, parsed: Record<string, unknown>) {
        migrateData(parsed)
        const numLoaded = editor.factory.tryLoadCustomDefsFrom(parsed.defs)
        editor.updateCustomComponentButtons()
        editor.showMessage(S.Messages.LoadedDefinitions.expand({ n: numLoaded }))
        return undefined // no error
    }

    public loadCircuit(
        parent: DrawableParent,
        parsed_: Record<string, unknown>,
        opts?: LoadOptions,
    ): undefined | string { // string is an error

        const componentList = parent.components
        const parsed = { ...parsed_ } // copy because we delete stuff from it

        try {
            if (!(opts?.skipMigration ?? false)) {
                migrateData(parsed)
            }
        } catch (err) {
            console.error(err)
            return "can't migrate JSON - error “" + err + `”, JSON:\n` + stringifySmart(parsed, { maxLength: 120 })
        }
        delete parsed.v

        if (parent.isMainEditor()) {
            parent.factory.clearCustomDefs()
            parent.factory.tryLoadCustomDefsFrom(parsed.defs)
            delete parsed.defs
        }

        for (const elem of componentList.all()) {
            elem.destroy()
        }
        componentList.clearAll()
        parent.linkMgr.clearAll()
        parent.nodeMgr.clearAll()
        if (parent.isMainEditor()) {
            parent.timeline.reset()
        }

        const compReprs = parsed.components
        const { nodeMapping, componentsByRef } = this.makeComponents(parent, compReprs, undefined)
        delete parsed.components

        const immediateWirePropagation = opts?.immediateWirePropagation ?? false
        this.makeWires(parent, parsed.wires, nodeMapping, componentsByRef, immediateWirePropagation)
        delete parsed.wires

        if (isArray(parsed.tests)) {
            const testSuiteReprs = validateJson(parsed.tests, TestSuite.ReprArray, "tests")
            if (testSuiteReprs !== undefined) {
                const testSuites = testSuiteReprs.map(ts => new TestSuite([ts, componentList]))
                parent.testSuites.set(testSuites)
                parent.ifEditing?.testsPalette.update()
            }
        }
        delete parsed.tests

        if (parent.isMainEditor()) {
            // load userdata, keeping already existing data
            if (parsed.userdata !== undefined) {
                if (typeof parent.userdata === "object" && typeof parsed.userdata === "object") {
                    // merge
                    parent.userdata = {
                        ...parsed.userdata,
                        ...parent.userdata,
                    }
                } else {
                    // cannot merge, keep existing data
                }
                delete parsed.userdata
            }

            // also works with undefined
            // must be done AFTER setting user data to ensure the UI is updated accordingly
            parent.setPartialOptions(parsed.opts as any)
            delete parsed.opts

            const isUndoRedoAction = opts?.isUndoRedoAction ?? false
            if (!isUndoRedoAction) {
                parent.editor.editTools.undoMgr.takeSnapshot()
            }

            parent.updateCustomComponentButtons()

            // try to load scratch, if any
            const scratch = parsed.scratch
            let customComp_
            if (scratch !== undefined && isRecord(scratch) && isString(scratch.id) && (customComp_ = parent.components.get(scratch.id)) !== undefined) {
                delete scratch.id
                const customComp = customComp_ as CustomComponent
                this.loadCircuit(customComp, scratch, { immediateWirePropagation: true, skipMigration: true })

                // switch editor to the scratch
                parent.setEditorRoot(customComp)
            }
            delete parsed.scratch
        }

        const unhandledData = keysOf(parsed)
        if (unhandledData.length !== 0) {
            console.warn("Unloaded data fields: " + unhandledData.join(", "))
        }

        return undefined // meaning no error
    }

    private makeComponents(parent: DrawableParent, compReprs: unknown, offsetPos: [number, number] | undefined): { nodeMapping: NodeMapping, components: Component[], componentsByRef: Record<string, Component> } {
        // TODO also return a mapping for renamed component ids according to the same principle
        const components: Component[] = []
        const componentsByRef: Record<string, Component> = {}
        const anchorsToSet: Array<[Component, string]> = []
        const add = (c: Component | undefined, repr: unknown) => {
            if (c !== undefined) {
                components.push(c)
                if (c.ref !== undefined) {
                    componentsByRef[c.ref] = c
                }
                let anchor
                if (isRecord(repr) && "anchor" in repr && isString(anchor = repr.anchor)) {
                    anchorsToSet.push([c, anchor])
                }
            }
        }

        const nodeMapping = parent.nodeMgr.recordMappingWhile(() => {
            const factory = parent.editor.factory
            if (isArray(compReprs)) {
                // parse using ids from attributes
                for (const compRepr of compReprs as unknown[]) {
                    add(factory.makeFromJSON(parent, compRepr, offsetPos), compRepr)
                }
            } else if (isRecord(compReprs)) {
                // parse using ids from keys
                for (const [id, compRepr] of Object.entries(compReprs)) {
                    if (isRecord(compRepr)) {
                        compRepr.ref = id
                        add(factory.makeFromJSON(parent, compRepr, offsetPos), compRepr)
                    } else {
                        console.error(`Invalid non-object component repr: '${compRepr}'`)
                    }
                }
            }
        })

        for (const [comp, anchorRef] of anchorsToSet) {
            const anchor = componentsByRef[anchorRef]
            if (anchor !== undefined) {
                comp.anchor = anchor
            } else {
                console.warn(`Anchor '${anchorRef}' not found for component '${comp.ref}'`)
            }
        }

        return { nodeMapping, components, componentsByRef }
    }


    private makeWires(parent: DrawableParent, wires: unknown, nodeMapping: NodeMapping, componentsByRef: Record<string, Component>, immediateWirePropagation: boolean) {
        const linkMgr = parent.linkMgr
        const nodeMgr = parent.nodeMgr

        // recalculating all the unconnected gates here allows
        // to avoid spurious circular dependency messages, as right
        // now all components are marked as needing recalculating
        const recalcMgr = parent.recalcMgr
        recalcMgr.recalcAndPropagateIfNeeded()

        for (const obj of (isArray(wires) ? wires as unknown[] : [])) {
            const wireData = validateJson(obj, Wire.Repr, "wire")
            if (wireData === undefined) {
                return
            }

            const [nodeID1, nodeID2, wireOptions] = wireData
            const node1 = nodeMgr.findNode(nodeID1, nodeMapping)
            const node2 = nodeMgr.findNode(nodeID2, nodeMapping)
            if (node1 !== undefined && node2 !== undefined && node1.isOutput() && !node2.isOutput()) {
                const completedWire = linkMgr.addWire(node1, node2, false)
                if (completedWire !== undefined) {
                    if (wireOptions !== undefined) {
                        completedWire.setOptions(wireOptions, componentsByRef)
                    }
                    if (immediateWirePropagation) {
                        completedWire.customPropagationDelay = 0
                    }
                }
                recalcMgr.recalcAndPropagateIfNeeded()
            }
        }
    }

    public buildCircuitObject(editor: LogicEditor): Circuit {
        const dataObject: Circuit = {
            v: CurrentFormatVersion,
            opts: editor.nonDefaultOptions(),
            defs: editor.factory.customDefReprs(),
            scratch: undefined,
            userdata: editor.userdata,
        }

        const editorRoot = editor.editorRoot
        if (!(editorRoot instanceof LogicEditor)) {
            const customComp = editorRoot as CustomComponent
            // we save this scratch space, too
            const scratch: Scratch = {
                id: customComp.ref ?? "n/a",
            }
            this.buildReprsInto(scratch, editorRoot.components.all(), editorRoot.linkMgr.wires, editorRoot.testSuites.suites)
            dataObject.scratch = scratch
        }

        this.buildReprsInto(dataObject, editor.components.all(), editor.linkMgr.wires, editor.testSuites.suites)
        return dataObject
    }

    public buildLibraryObject(editor: LogicEditor): Library {
        return {
            v: CurrentFormatVersion,
            defs: editor.factory.customDefReprs(),
            type: 'lib',
        }
    }

    public buildComponentsAndWireObject(components: readonly Component[], testSuites: readonly TestSuite[], sourcePos: [number, number] | undefined): ComponentAndWires {
        const dataObject: ComponentAndWires = {}
        if (sourcePos !== undefined) {
            dataObject.pos = sourcePos
        }

        // collect all wires that connect to components within the list
        const wires: Wire[] = []
        for (const comp of components) {
            for (const nodeIn of comp.inputs._all) {
                const wire = nodeIn.incomingWire
                if (wire !== null && components.includes(wire.startNode.component)) {
                    wires.push(wire)
                }
            }
        }
        this.buildReprsInto(dataObject, components, wires, testSuites)
        return dataObject
    }

    private buildReprsInto(dataObject: ComponentAndWires, components: Iterable<Component>, wires: readonly Wire[], testSuites: readonly TestSuite[]): void {
        for (const comp of components) {
            if (dataObject.components === undefined) {
                dataObject.components = {}
            }

            const id = comp.ref
            if (id === undefined) {
                console.error("Skipping component with no id: " + comp)
                continue
            }

            if (dataObject.components[id] !== undefined) {
                console.error("Skipping component with duplicate id: " + comp)
            }

            const compRepr = comp.toJSON()
            dataObject.components[id] = compRepr
        }
        if (wires.length !== 0) {
            dataObject.wires = wires.map(w => w.toJSON())
        }
        if (testSuites.length !== 0) {
            dataObject.tests = testSuites.map(ts => ts.toJSON())
        }


        // TODO: better way of representing the wires, along these lines:
        // const nodeName = (node: Node) => {
        //     const group = node.group
        //     if (group === undefined) {
        //         return node.shortName
        //     }
        //     const nodeIndex = group.nodes.indexOf(node as any)
        //     return `${group.name}[${nodeIndex}]`
        // }

        // const wires: Record<string, Record<string, string>> = {}

        // for (const comp of componentsToInclude) {
        //     const ref = componentToRef.get(comp)!
        //     for (const node of comp.inputs._all) {
        //         const wire = node.incomingWire
        //         if (wire !== null) {
        //             const nodeInName = nodeName(node)
        //             const nodeOut = wire.startNode
        //             const otherComp = nodeOut.component
        //             const sourceRef = `${componentToRef.get(otherComp)!}.${nodeName(nodeOut)}`;

        //             (wires[ref] ?? (wires[ref] = {}))[nodeInName] = sourceRef
        //         }
        //     }
        // }
    }

    public removeShowOnlyFrom(dataObject: Circuit): string[] | undefined {
        if (dataObject.opts !== undefined) {
            const showOnly = dataObject.opts.showOnly
            delete dataObject.opts.showOnly
            if (Object.keys(dataObject.opts).length === 0) {
                delete dataObject.opts
            }
            if (isArray(showOnly) && showOnly.every(isString)) {
                return showOnly
            }
        }
        return undefined
    }

    public stringifyObject(_dataObject: Partial<Circuit>, compact: boolean): string {

        // TODO: refactor this to not touch input object and not do this "delete dataObject.key" thing
        if (compact) {
            return JSON5.stringify(_dataObject)
        }

        // Custom stringifier to have always one component per line and
        // spaces after commas

        const dataObject = { ..._dataObject }

        const parts: string[] = []

        stringifyCompactReprTo(parts, dataObject, "v")
        stringifyCompactReprTo(parts, dataObject, "type")
        stringifyCompactReprTo(parts, dataObject, "opts")
        stringifyCompactReprTo(parts, dataObject, "userdata")
        stringifyCompactReprTo(parts, dataObject, "pos")

        const defs = dataObject.defs
        if (defs !== undefined && isArray(defs)) {
            const defparts: string[] = []
            for (const def of defs as Partial<CustomComponentDefRepr>[]) {
                const circuit = def.circuit!
                delete def.circuit
                let subpart = stringifySmart(def, { maxLength: Infinity })
                def.circuit = circuit
                const compparts: string[] = []
                stringifyComponentWiresTestsReprsTo(compparts, { ...circuit }, 3, true)
                const circuitRepr = compparts.length === 0 ? "{}" : "{\n      " + compparts.join(",\n      ") + "\n    }"
                subpart = subpart.slice(0, subpart.length - 1) + `, circuit: ` + circuitRepr + "}"
                defparts.push(subpart)
            }
            parts.push(`defs: [\n    ` + defparts.join(",\n    ") + "\n  ]")
        }
        delete dataObject.defs

        const scratch = dataObject.scratch
        if (scratch !== undefined) {
            const scratchparts: string[] = []
            scratchparts.push(`id: ${stringifySmart(scratch.id)}`)
            stringifyComponentWiresTestsReprsTo(scratchparts, { ...scratch }, 2, false)
            parts.push(`scratch: {\n    ` + scratchparts.join(",\n    ") + "\n  }")
        }
        delete dataObject.scratch

        stringifyComponentWiresTestsReprsTo(parts, dataObject, 1, false)

        // loop though the remaining fields
        const unprocessedFields = keysOf(dataObject)
        if (unprocessedFields.length !== 0) {
            console.error("ERROR: unprocessed fields in stringified JSON: " + unprocessedFields.join(", "))
        }

        return "{ // JSON5\n  " + parts.join(",\n  ") + "\n}"
    }

}

export const Serialization = new _Serialization()


function stringifyCompactReprTo(parts: string[], container: Record<string, unknown>, key: string) {
    const value = container[key]
    if (value !== undefined) {
        parts.push(`${stringifyKey(key)}: ${stringifySmart(value, { maxLength: Infinity })}`)
    }
    delete container[key]
}

function stringifyComponentWiresTestsReprsTo(parts: string[], container: ComponentAndWires, outerLevel: number, noWireDelay: boolean) {
    const outerIndent = "  ".repeat(outerLevel)
    const innerIndent = outerIndent + "  "
    let entries

    const comps = container.components
    if (comps !== undefined) {
        if (isArray(comps) && comps.length !== 0) {
            // array style
            const subparts: string[] = []
            for (const compRepr of comps) {
                subparts.push(stringifySmart(compRepr, { maxLength: Infinity }))
            }
            parts.push(`components: [\n${innerIndent}` + subparts.join(`,\n${innerIndent}`) + `,\n${outerIndent}]`)

        } else if ((entries = Object.entries(comps)).length !== 0) {
            // object style
            const subparts: string[] = []
            for (const [id, compRepr] of entries) {
                delete compRepr.ref
                subparts.push(`${stringifyKey(id)}: ${stringifySmart(compRepr, { maxLength: Infinity })}`)
            }
            parts.push(`components: {\n${innerIndent}` + subparts.join(`,\n${innerIndent}`) + `,\n${outerIndent}}`)
        }
    }
    delete container.components

    if (noWireDelay && container.wires !== undefined) {
        for (const wire of container.wires) {
            const wireOpts = wire[2]
            if (wireOpts !== undefined) {
                delete wireOpts.propagationDelay
                if (allValuesUndefined(wireOpts)) {
                    wire.splice(2, 1)
                }
            }
        }
    }
    stringifyCompactReprTo(parts, container, "wires")

    const tests = container.tests
    if (tests !== undefined && tests.length !== 0) {
        const innerIndent2 = innerIndent + "  "

        const subparts: string[] = []
        for (const testSuiteRepr of tests) {
            const Cases = "cases"
            const testCases = testSuiteRepr[Cases]
            const testCasesReprStrs = testCases.map(testCase => stringifySmart(testCase, { maxLength: Infinity }));

            (testSuiteRepr as any).cases = undefined
            const baseSuiteRepr = stringifySmart(testSuiteRepr, { maxLength: Infinity })
            testSuiteRepr.cases = testCases
            const completeSuiteRepr = baseSuiteRepr.substring(0, baseSuiteRepr.length - 1) + `, ${Cases}: [\n${innerIndent2}` + testCasesReprStrs.join(`,\n${innerIndent2}`) + `,\n${innerIndent}]},`
            subparts.push(completeSuiteRepr)
        }

        parts.push(`tests: [\n${innerIndent}` + subparts.join(`\n${innerIndent}`) + `\n${outerIndent}]`)
    }
    delete container.tests
}

function allValuesUndefined(obj: Record<string, unknown>): boolean {
    for (const value of Object.values(obj)) {
        if (value !== undefined) {
            return false
        }
    }
    return true
}


// Note: This regex matches even invalid JSON strings, but since we’re
// working on the output of `JSON.stringify` we know that only valid strings
// are present (unless the user supplied a weird `options.indent` but in
// that case we don’t care since the output would be invalid anyway).
const stringOrChar = /("([^\\"]|\\.)*")|[:,]/g

export function stringifySmart(
    passedObj: any,
    options?: {
        replacer?: (this: any, key: string, value: any) => any,
        indent?: number | string,
        maxLength?: number
    }
): string {

    options ??= {}
    const indent: string = JSON.stringify([1], undefined, options.indent ?? 2).slice(2, -3)
    const maxLength: number =
        indent === ""
            ? Infinity
            : options.maxLength ?? 80

    let replacer = options.replacer

    return (function _stringify(obj: any, currentIndent: string, reserved: number): string {
        if (obj !== undefined && typeof obj.toJSON === "function") {
            obj = obj.toJSON()
        }

        const string = JSON5.stringify(obj, replacer)

        if (string === undefined) {
            return string
        }

        let length = maxLength - currentIndent.length - reserved

        if (string.length <= length) {
            const prettified = string.replace(
                stringOrChar,
                function (match, stringLiteral) {
                    return stringLiteral ?? match + " "
                }
            )
            if (prettified.length <= length) {
                return prettified
            }
        }

        if (replacer !== null) {
            obj = JSON5.parse(string)
            replacer = undefined
        }

        if (typeof obj === "object" && obj !== null) {
            const nextIndent = currentIndent + indent
            const items: string[] = []
            let index = 0

            let start: string
            let end: string
            if (Array.isArray(obj)) {
                start = "["
                end = "]"
                length = obj.length
                for (; index < length; index++) {
                    items.push(
                        _stringify(obj[index], nextIndent, index === length - 1 ? 0 : 1) ||
                        "null"
                    )
                }
            } else {
                start = "{"
                end = "}"
                const keys = Object.keys(obj)
                length = keys.length
                for (; index < length; index++) {
                    const key = keys[index]
                    const keyPart = stringifyKey(key) + ": "
                    const value = _stringify(
                        obj[key],
                        nextIndent,
                        keyPart.length + (index === length - 1 ? 0 : 1)
                    )
                    if (value !== undefined) {
                        items.push(keyPart + value)
                    }
                }
            }

            if (items.length > 0) {
                return [start, indent + items.join(",\n" + nextIndent), end].join(
                    "\n" + currentIndent
                )
            }
        }

        return string
    })(passedObj, "", 0)
}

// Adapted from JSON5 (https://github.com/json5/json5), MIT license
function stringifyKey(key: string): string {
    if (key.length === 0) {
        return quoteString(key)
    }

    const firstChar = String.fromCodePoint(key.codePointAt(0)!)
    if (!json5util.isIdStartChar(firstChar)) {
        return quoteString(key)
    }

    for (let i = firstChar.length; i < key.length; i++) {
        if (!json5util.isIdContinueChar(String.fromCodePoint(key.codePointAt(i)!))) {
            return quoteString(key)
        }
    }

    return key
}

const replacements: Record<string, string> = {
    "'": "\\'",
    '"': '\\"',
    '\\': '\\\\',
    '\b': '\\b',
    '\f': '\\f',
    '\n': '\\n',
    '\r': '\\r',
    '\t': '\\t',
    '\v': '\\v',
    '\0': '\\0',
    '\u2028': '\\u2028',
    '\u2029': '\\u2029',
}

function quoteString(value: string): string {
    const quotes = {
        "'": 0.1,
        '"': 0.2,
    }

    let product = ''

    for (let i = 0; i < value.length; i++) {
        const c = value[i]
        switch (c) {
            case "'":
            case '"':
                quotes[c]++
                product += c
                continue

            case '\0':
                if (json5util.isDigit(value[i + 1])) {
                    product += '\\x00'
                    continue
                }
        }

        if (replacements[c] !== undefined) {
            product += replacements[c]
            continue
        }

        if (c < ' ') {
            const hexString = c.charCodeAt(0).toString(16)
            product += '\\x' + ('00' + hexString).substring(hexString.length)
            continue
        }
        product += c
    }

    const quoteChar = keysOf(quotes).reduce(function (a, b) { return (quotes[a] < quotes[b]) ? a : b })
    product = product.replace(new RegExp(quoteChar, 'g'), replacements[quoteChar])
    return quoteChar + product + quoteChar
}