import * as t from "io-ts"
import JSON5 from "json5"
import { LogicEditor } from "./LogicEditor"
import { Serialization } from "./Serialization"
import { TestCaseCombinational, TestCaseCombinationalRepr } from "./TestSuite"
import { ALUDef } from "./components/ALU"
import { AdderDef } from "./components/Adder"
import { AdderArrayDef } from "./components/AdderArray"
import { Clock, ClockDef } from "./components/Clock"
import { ComparatorDef } from "./components/Comparator"
import { Component, ComponentBase, ComponentRepr } from "./components/Component"
import { ControlledInverterDef } from "./components/ControlledInverter"
import { CounterDef } from "./components/Counter"
import { CustomComponent, CustomComponentDef, CustomComponentDefRepr, CustomComponentPrefix } from "./components/CustomComponent"
import { DecoderDef } from "./components/Decoder"
import { Decoder16SegDef } from "./components/Decoder16Seg"
import { Decoder7SegDef } from "./components/Decoder7Seg"
import { DecoderBCD4Def } from "./components/DecoderBCD4"
import { DemuxDef } from "./components/Demux"
import { DisplayDef } from "./components/Display"
import { Display16SegDef } from "./components/Display16Seg"
import { Display7SegDef } from "./components/Display7Seg"
import { DisplayAsciiDef } from "./components/DisplayAscii"
import { DisplayBarDef } from "./components/DisplayBar"
import { DrawableParent, MenuData } from "./components/Drawable"
import { FlipflopDDef } from "./components/FlipflopD"
import { FlipflopJKDef } from "./components/FlipflopJK"
import { FlipflopTDef } from "./components/FlipflopT"
import { Gate1Def, GateNDef } from "./components/Gate"
import { GateArrayDef } from "./components/GateArray"
import { Gate1Types, GateNTypes } from "./components/GateTypes"
import { HalfAdderDef } from "./components/HalfAdder"
import { Input, InputDef } from "./components/Input"
import { Label, LabelDef } from "./components/Label"
import { LatchSRDef } from "./components/LatchSR"
import { MuxDef } from "./components/Mux"
import { Output, OutputDef } from "./components/Output"
import { PassthroughDef } from "./components/Passthrough"
import { RAMDef } from "./components/RAM"
import { ROMDef } from "./components/ROM"
import { RandomDef } from "./components/Random"
import { RectangleDef } from "./components/Rectangle"
import { RegisterDef } from "./components/Register"
import { ShiftDisplayDef } from "./components/ShiftDisplay"
import { ShiftRegisterDef } from "./components/ShiftRegister"
import { TristateBufferDef } from "./components/TristateBuffer"
import { TristateBufferArrayDef } from "./components/TristateBufferArray"
import { S } from "./strings"
import { binaryStringRepr, isArray, isRecord, isString, validateJson, valuesReprForTest } from "./utils"

// Generic interface to instantiate components from scratch (possibly with params) or from JSON
type ComponentMaker<TParams extends Record<string, unknown>> = {
    isValid(): boolean,
    type: string,
    make(parent: DrawableParent, params?: TParams): Component,
    makeFromJSON(parent: DrawableParent, data: Record<string, unknown>): Component | undefined,
}

// All predefined components except the ones which don't have
// static type strings: Gate1, GateN, GateArray, CustomComponent
const AllComponentDefs: ComponentMaker<any>[] = [
    // in
    InputDef,
    ClockDef,
    RandomDef,

    // out
    OutputDef,
    DisplayDef,
    Display7SegDef,
    Display16SegDef,
    DisplayAsciiDef,
    DisplayBarDef,
    ShiftDisplayDef,

    // gates
    Gate1Def,
    GateNDef,
    GateArrayDef,
    TristateBufferDef,
    TristateBufferArrayDef,
    ControlledInverterDef,

    // labels & layout
    LabelDef,
    RectangleDef,
    PassthroughDef,

    // ic
    HalfAdderDef,
    AdderDef,
    ComparatorDef,
    AdderArrayDef,
    ALUDef,
    MuxDef,
    DemuxDef,
    LatchSRDef,
    FlipflopJKDef,
    FlipflopTDef,
    FlipflopDDef,
    RegisterDef,
    ShiftRegisterDef,
    ROMDef,
    RAMDef,
    CounterDef,
    DecoderDef,
    Decoder7SegDef,
    Decoder16SegDef,
    DecoderBCD4Def,
]

// Data present in the HTMLElement of a component button
export type ButtonDataset = {
    type: string,
    componentId?: string,
    params?: string,
}

export class ComponentFactory {

    public readonly editor: LogicEditor
    private readonly _predefinedComponents = new Map<string, ComponentMaker<any>>()
    private readonly _customComponents = new Map<string, CustomComponentDef>()

    public constructor(editor: LogicEditor) {
        this.editor = editor
        for (const maker of AllComponentDefs) {
            const key = maker.type
            if (!maker.isValid()) {
                throw new Error(`Implementation missing for components of type '${key}'`)
            }
            // console.log(`Registering component for '${key}'`)
            if (this._predefinedComponents.has(key)) {
                throw new Error(`Duplicate component for components of type '${key}'`)
            }
            this._predefinedComponents.set(key, maker)
        }
    }


    // Component creation functions

    public makeFromJSON(parent: DrawableParent, obj_: unknown, offsetPos?: [number, number]): Component | undefined {
        if (!isRecord(obj_)) {
            console.warn(`Skipping invalid non-object component: ${JSON5.stringify(obj_, null, 2)}`)
            return undefined
        }
        const obj = obj_ as Partial<ComponentRepr<boolean, boolean>>
        if (offsetPos !== undefined) {
            if (isArray(obj.pos)) {
                obj.pos = [obj.pos[0] + offsetPos[0], obj.pos[1] + offsetPos[1]]
            }
        }
        const type = isString(obj.type) ? obj.type : "<unknown>"
        const maker = this.getMaker(type)
        return maker?.makeFromJSON(parent, obj)
    }

    public makeFromButton(parent: DrawableParent, elem: HTMLElement) {
        const compDataset = elem.dataset as ButtonDataset
        const paramsStr = compDataset.params
        const maker = this.getMaker(compDataset.type)
        const params = paramsStr === undefined ? undefined : JSON5.parse(paramsStr) as Record<string, unknown>
        return maker?.make(parent, params)

        // TODO further general component customisation based on editor options
        // const classId = compDataset.componentId
        // if (classId === undefined) {
        //     console.warn("No class ID linked to elem " + elem.outerHTML)
        // } else {
        //     const compConfig = editor.options.initParams?.[classId]
        //     if (compConfig !== undefined) {
        //         let val
        //         if ((val = compConfig.orient) !== undefined) {
        //             newComp.doSetOrient(val)
        //         }
        //     }

    }

    private getMaker(type: string): ComponentMaker<any> | undefined {
        let maker
        // normal cases
        if ((maker = this._predefinedComponents.get(type)) !== undefined) {
            return maker
        }

        // gates
        if (Gate1Types.includes(type)) {
            return Gate1Def
        } else if (GateNTypes.includes(type)) {
            return GateNDef
        }

        const hyphenPos = type.indexOf("-")
        if (hyphenPos !== -1) {

            // gate arrays
            const typeStart = type.substring(0, hyphenPos)
            const typeEnd = type.substring(hyphenPos + 1)
            if (typeEnd === "array" && GateNTypes.includes(typeStart)) {
                return GateArrayDef
            }

            // custom components
            if (type.startsWith(CustomComponentPrefix)) {
                const customId = type.substring(CustomComponentPrefix.length)
                if ((maker = this._customComponents.get(customId)) !== undefined) {
                    return maker
                }
            }
        }

        console.warn(`Unknown component for '${type}'`)
        return undefined
    }


    // Custom components handling

    public getCustomDef(customId: string): CustomComponentDef | undefined {
        return this._customComponents.get(customId)
    }

    public customDefs(): CustomComponentDef[] | undefined {
        if (this._customComponents.size === 0) {
            return undefined
        }
        return [...this._customComponents.values()]
    }

    public customDefReprs(): CustomComponentDefRepr[] | undefined {
        const defs = this.customDefs()
        if (defs === undefined) {
            return undefined
        }
        return defs.map(def => def.toJSON())
    }

    public clearCustomDefs() {
        this._customComponents.clear()
    }

    public getCustomComponentTypesWhichUse(id: string) {
        const compIds: string[] = [id]
        for (const def of this._customComponents.values()) {
            if (def.uses(id, [true, this])) {
                compIds.push(def.type)
            }
        }
        return compIds
    }

    public tryAddCustomDef(def: CustomComponentDef, overwrite: boolean): ComponentMaker<any> | undefined {
        // Calling this may change the list of custom defs, we may need to update the UI
        const customid = def.customId
        if (!overwrite && this._customComponents.has(customid)) {
            console.warn(`Could not add custom component with duplicate id '${customid}'`)
            return undefined
        }
        this._customComponents.set(customid, def)
        return def
    }

    public tryLoadCustomDefsFrom(defs: unknown): number {
        // Calling this may change the list of custom defs, we may need to update the UI
        if (defs === undefined) {
            return 0
        }
        const validatedDefs = validateJson(defs, t.array(CustomComponentDefRepr), "defs")
        if (validatedDefs === undefined) {
            return 0
        }
        let numLoaded = 0
        for (const validatedDef of validatedDefs) {
            const maker = this.tryAddCustomDef(new CustomComponentDef(validatedDef), false)
            if (maker !== undefined) {
                numLoaded++
            }
        }
        return numLoaded
    }

    public hasCustomComponents() {
        return this._customComponents.size > 0
    }

    public makeContextMenu(id: string): MenuData | undefined {
        const customId = id.substring(CustomComponentPrefix.length)
        const def = this._customComponents.get(customId)
        if (def === undefined) {
            return undefined
        }

        const s = S.Components.Custom.contextMenu
        return [
            MenuData.item("pen", s.ChangeName, () => this.runChangeCustomComponentCaptionDialog(def)),
            MenuData.item("connect", s.ChangeCircuit, () => {
                window.alert(s.EditFromComponentMessage)
            }),
            MenuData.sep(),
            MenuData.item("trash", s.Delete, () => {
                if (this.editor.components.contains(id)) {
                    window.alert(s.CannotDeleteInUse)
                    return
                }
                for (const compDef of this._customComponents.values()) {
                    if (compDef.uses(def.type, false)) {
                        window.alert(s.CannotDeleteInUseBy.expand({ caption: compDef.caption }))
                        return
                    }
                }
                if (window.confirm(s.ConfirmDelete)) {
                    this._customComponents.delete(customId)
                    this.editor.updateCustomComponentButtons()
                }
            }, undefined, true),
        ]
    }

    public runChangeCustomComponentCaptionDialog(def: CustomComponentDef) {
        const s = S.Components.Custom.contextMenu
        const oldCaption = def.caption
        const oldType = def.type
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const newCaption = window.prompt(s.ChangeNamePrompt, oldCaption)
            if (newCaption === null || newCaption === oldCaption) {
                return
            }
            if (newCaption.length === 0) {
                window.alert(s.ChangeNameEmpty)
                continue
            }

            def.doSetCaption(newCaption)
            const oldDefaultCustomId = makeCustomIdFromCaption(oldCaption)
            if (def.customId === oldDefaultCustomId) {
                // The ID was automatically generated from the caption, so we'll try to update it as well
                const newCustomId = makeCustomIdFromCaption(newCaption)
                if (!this._customComponents.has(newCustomId)) {
                    // we can actually change it without conflicts
                    this._customComponents.delete(oldDefaultCustomId)
                    def.customId = newCustomId
                    const newType = def.type

                    // update the type in all custom conponent definitions
                    for (const compDef of this._customComponents.values()) {
                        for (const compRepr of Object.values(compDef.circuit.components ?? {})) {
                            if (compRepr.type === oldType) {
                                compRepr.type = newType
                            }
                        }
                    }
                    this._customComponents.set(newCustomId, def)
                }
            }
            break
        }

        this.editor.updateCustomComponentButtons()
        this.editor.components.updateCustomComponents(oldType) // they still have the old type
        this.editor.focus()
    }

    public tryMakeNewCustomComponent(editor: LogicEditor): undefined | string {
        const s = S.Components.Custom.messages

        const selectionAll = editor.eventMgr.currentSelection?.previouslySelectedElements
        if (selectionAll === undefined) {
            return s.EmptySelection
        }
        const selectedComps = [...selectionAll].filter((e): e is Component => e instanceof ComponentBase)
        if (selectedComps.length === 0) {
            return s.EmptySelection
        }

        const checkResult = this.checkComponentsForCustomDef(selectedComps)
        if (isString(checkResult)) {
            return checkResult
        }

        const componentsToInclude = checkResult.components

        let caption
        const labels = componentsToInclude.filter((e): e is Label => e instanceof Label)
        if (labels.length !== 1) {
            caption = window.prompt(s.EnterCaptionPrompt)
            if (caption === null) {
                return ""
            }
        } else {
            caption = labels[0].text
        }

        const id = makeCustomIdFromCaption(caption)
        if (this._customComponents.has(id)) {
            return s.ComponentAlreadyExists.expand({ id })
        }

        const { components, wires } = Serialization.buildComponentsAndWireObject(componentsToInclude, [], undefined)
        if (components === undefined || wires === undefined) {
            return s.NoWires
        }

        const maker = this.tryAddCustomDef(new CustomComponentDef({
            id, caption, circuit: { components, wires },
        }), false)
        if (maker === undefined) {
            return ""
        }

        const customComp = maker.make(editor)
        customComp.setSpawned()
        customComp.setPosition(editor.mouseX + customComp.unrotatedWidth / 2 - 5, editor.mouseY, true)
        editor.eventMgr.currentSelection = undefined
        editor.eventMgr.setCurrentMouseOverComp(customComp)

        for (const comp of componentsToInclude) {
            editor.components.tryDelete(comp)
        }

        return undefined // success
    }

    public tryMakeNewTestCase(editor: LogicEditor): TestCaseCombinational | string {
        const s = S.Messages
        const sc = S.Components.Custom.messages

        const selectionAll = editor.eventMgr.currentSelection?.previouslySelectedElements
        if (selectionAll === undefined) {
            return sc.EmptySelection
        }
        const selectedComps = [...selectionAll].filter((e): e is Component => e instanceof ComponentBase)
        if (selectedComps.length === 0) {
            return sc.EmptySelection
        }

        const checkResult = this.checkComponentsForTestCase(selectedComps)
        if (isString(checkResult)) {
            return checkResult
        }

        const { inputs, outputs } = checkResult

        const mkDesc = (inOut: Input | Output) => `${inOut.ref ?? "?"}${isString(inOut.name) ? ` (“${inOut.name}”)` : ""}: ${binaryStringRepr(inOut.value)}`

        const joiner = "\n • "
        const inputsStr = s.TestCaseInputToSet.expand({ n: inputs.length }) + joiner + inputs.map(mkDesc).join(joiner)
        const outputsStr = s.TestCaseOuputToCheck.expand({ n: outputs.length }) + joiner + outputs.map(mkDesc).join(joiner)

        const prompt = s.NewTestCaseTitle + `\n\n${inputsStr}\n\n${outputsStr}\n\n` + s.NewTestCaseSetName

        const testCaseName = window.prompt(prompt)
        if (testCaseName === null) {
            return ""
        }

        const inMap: TestCaseCombinationalRepr["in"] = Object.create(null)
        for (const input of inputs) {
            inMap[input.ref ?? "?"] = valuesReprForTest(input.value)
        }

        const outMap: TestCaseCombinationalRepr["out"] = Object.create(null)
        for (const output of outputs) {
            outMap[output.ref ?? "?"] = valuesReprForTest(output.value)
        }

        return new TestCaseCombinational({
            in: inMap, out: outMap,
            name: testCaseName.length === 0 ? undefined : testCaseName,
        }, editor.components)
    }

    public tryModifyCustomComponent(def: CustomComponentDef, defRoot: CustomComponent): undefined | string {
        const s = S.Components.Custom.messages
        const components = [...defRoot.components.all()]

        const checkResult = this.checkComponentsForCustomDef(components)
        if (isString(checkResult)) {
            return checkResult
        }

        const newComponents = checkResult.components

        const circuit = Serialization.buildComponentsAndWireObject(newComponents, [], undefined)
        if (circuit.components === undefined || circuit.wires === undefined) {
            return ""
        }

        const newDef = new CustomComponentDef({
            id: def.customId,
            caption: def.caption,
            circuit: { components: circuit.components, wires: circuit.wires },
        })

        if (newDef.numInputs !== def.numInputs || newDef.numOutputs !== def.numOutputs) {
            if (!window.confirm(s.InputsOutputsChanged)) {
                return "" // cancelled
            }
        }

        this.tryAddCustomDef(newDef, true)
        return undefined // success
    }

    private checkComponentsForCustomDef(components: Component[]): { components: Component[], inputs: Input[], outputs: Output[] } | string {
        const s = S.Components.Custom.messages

        const inputs = components.filter((e): e is Input => e instanceof Input)
        if (inputs.length === 0) {
            return s.NoInput
        }

        const outputs = components.filter((e): e is Output => e instanceof Output)
        if (outputs.length === 0) {
            return s.NoOutput
        }


        // Check that all inputs and outputs have names
        function checkNames(inOuts: Array<Input | Output>): boolean {
            const names = new Set<string>()
            const missingNames: Array<Input | Output> = []
            for (const inOut of inOuts) {
                const name = inOut.name
                if (name === undefined) {
                    missingNames.push(inOut)
                } else {
                    if (!isString(name) || names.has(name)) {
                        return false
                    }
                    names.add(name)
                }
            }
            for (const inOut of missingNames) {
                const prefix = inOut instanceof Input ? "In" : "Out"
                let i = 0, name
                do {
                    name = `${prefix}${i++}`
                } while (names.has(name))
                inOut.doSetName(name)
                names.add(name)
            }
            return true
        }

        const namesValid = checkNames(inputs) && checkNames(outputs)
        if (!namesValid) {
            return s.InputsOutputsMustHaveNames
        }


        const componentsToInclude: Component[] = [...inputs, ...outputs]
        const queue: Component[] = []
        let comp

        // Go forward from inputs to keep all linked components.
        // We don't complain about linked components that are not in the selection
        // as we allow inputs to connect to other stuff as well.
        queue.push(...inputs)
        while ((comp = queue.shift()) !== undefined) {
            for (const node of comp.outputs._all) {
                for (const wire of node.outgoingWires) {
                    const otherComp = wire.endNode.component
                    if (components.includes(otherComp)
                        && !componentsToInclude.includes(otherComp)) {
                        componentsToInclude.push(otherComp)
                        queue.push(otherComp)
                    }
                }
            }
        }

        // Go backward from outputs to include all linked components
        // and make sure all necessary components are in the selection.
        queue.push(...outputs)
        const missingComponents: Component[] = []
        while ((comp = queue.shift()) !== undefined) {
            for (const node of comp.inputs._all) {
                const wire = node.incomingWire
                if (wire !== null) {
                    const otherComp = wire.startNode.component

                    if (!components.includes(otherComp)) {
                        // this component is missing from the selection
                        if (!missingComponents.includes(otherComp)) {
                            missingComponents.push(otherComp)
                        }
                    } else {
                        if (!componentsToInclude.includes(otherComp)) {
                            componentsToInclude.push(otherComp)
                            queue.push(otherComp)
                        }
                    }
                }
            }
        }

        if (missingComponents.length > 0) {
            const missingCompsStr = missingComponents.map(c => c.toString()).join(", ")
            return s.MissingComponents.expand({ list: missingCompsStr })
        }

        const uselessComponents = components.filter(c =>
            !componentsToInclude.includes(c)
            // allow disconnected comps that have no inputs or outputs, e.g. labels
            && (c.inputs._all.length !== 0 || c.outputs._all.length !== 0)
        )
        if (uselessComponents.length > 0) {
            const uselessCompsStr = uselessComponents.map(c => c.toString()).join(", ")
            return s.UselessComponents.expand({ list: uselessCompsStr })
        }

        if (componentsToInclude.some(c => c instanceof Clock)) {
            return s.CannotIncludeClock
        }

        return { components: componentsToInclude, inputs, outputs }
    }

    private checkComponentsForTestCase(components: Component[]): { inputs: Input[], outputs: Output[] } | string {
        const s = S.Components.Custom.messages

        const inputs = components.filter((e): e is Input => e instanceof Input)
        if (inputs.length === 0) {
            return s.NoInput
        }

        const outputs = components.filter((e): e is Output => e instanceof Output)
        if (outputs.length === 0) {
            return s.NoOutput
        }

        return { inputs, outputs }
    }

}


function makeCustomIdFromCaption(caption: string): string {
    return caption
        .trim()
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
}