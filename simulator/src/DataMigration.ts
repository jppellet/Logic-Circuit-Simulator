import { Serialization, stringifySmart } from "./Serialization"
import { binaryStringRepr, isAllZeros, isArray, isRecord, isString, toLogicValue } from "./utils"

export const CurrentFormatVersion = 6

export function migrateData(data: Record<string, unknown>) {

    const LogBeforeAfter = false

    const initialRepr = !LogBeforeAfter ? undefined : isString(data) ? data : stringifySmart(data, { maxLength: 140 })

    let jsonVersion = Number(data.v ?? 0)
    const savedVersion = jsonVersion
    if (savedVersion > CurrentFormatVersion) {
        throw new Error(`Data format v${savedVersion} is newer than what this editor can load (v ≤ ${CurrentFormatVersion}`)
    }
    while (jsonVersion < CurrentFormatVersion) {
        const migrationFunc = migrateTo[++jsonVersion]

        // migrate the outer container
        migrationFunc(data)

        // try to migrate the inner circuit descriptions of the custom components
        const defs = data.defs
        if (isArray(defs)) {
            for (const def of defs) {
                const circuit = def.circuit
                if (isRecord(circuit)) {
                    migrationFunc(circuit)
                }
            }
        }

        data.v = jsonVersion
    }
    if (jsonVersion !== savedVersion) {
        console.log(`Migrated data format from v${savedVersion} to v${jsonVersion}, consider upgrading the source`)
        if (LogBeforeAfter) {
            console.log("BEFORE:\n" + initialRepr)
            console.log("AFTER:\n" + Serialization.stringifyObject(data, false))
        }
    } else if (LogBeforeAfter) {
        console.log(`Data format ${savedVersion} is up to date, no migration necessary`)
    }
}

// Migration functions

const migrateTo: Record<number, (container: Record<string, unknown>) => void> = {

    6: (container) => {
        // replace separate lists with a single list of components with better type fields
        const compFieldsAndCategories = {
            in: "in",
            out: "out",
            gates: "gate",
            ic: "ic",
            labels: "label",
            layout: "layout",
        } as const

        const oldToNewId: Record<string, string> = {
            "in": "in",
            "in.clock": "clock",
            "in.random": "rand",
            "out": "out",
            "out.display": "display",
            "out.7seg": "7seg",
            "out.16seg": "16seg",
            "out.ascii": "ascii",
            "out.bar": "bar",
            "out.shift-buffer": "shift-display",
            "out.shift-register": "shift-reg",
            "ic.switched-inverter": "cnot-array",
            "ic.gate-array": "{gatetype}-array",
            "ic.tristate-array": "tristate-array",
            "label": "label",
            "label.rect": "rect",
            "layout.pass": "pass",
            "ic.halfadder": "halfadder",
            "ic.adder": "adder",
            "ic.comparator": "comp",
            "ic.adder-array": "adder-array",
            "ic.alu": "alu",
            "ic.mux": "mux",
            "ic.demux": "demux",
            "ic.latch-sr": "latch-sr",
            "ic.flipflop-jk": "ff-jk",
            "ic.flipflop-t": "ff-t",
            "ic.flipflop-d": "ff-d",
            "ic.register": "reg",
            "ic.shift-register": "shift-reg",
            "ic.counter": "counter",
            "ic.ram": "ram",
            "ic.rom": "rom",
            "ic.decoder": "dec",
            "ic.decoder-7seg": "dec-7seg",
            "ic.decoder-16seg": "dec-16seg",
            "ic.decoder-bcd4": "dec-bcd4",
        }

        function newTypeFor(category: string, item: Record<string, unknown>): string {
            if (category === "gate") {
                if (!isString(item.type)) {
                    console.warn("Gate with no type found, assuming AND", item)
                    return "and"
                }
                const gateType = item.type.toLowerCase()
                return gateType === "tri" ? "tristate" : gateType
            } else {
                const id = isString(item.type) ? `${category}.${item.type}` : category
                if (id === "ic.gate-array") {
                    let gateType
                    if (!isString(item.subtype)) {
                        console.warn("Gate array with no subtype found, assuming AND", item)
                        gateType = "and"
                    } else {
                        gateType = item.subtype.toLowerCase()
                    }
                    delete item.subtype
                    return `${gateType}-array`
                } else if (id in oldToNewId) {
                    return oldToNewId[id]
                } else if (id.startsWith("ic.custom-")) {
                    return id.substring(3)
                } else {
                    console.error(`Unknown component type: ${id}`)
                    return id
                }
            }
        }

        const components: Record<string, unknown>[] = []
        for (const [field, category] of Object.entries(compFieldsAndCategories)) {
            const list = container[field]
            if (isArray(list)) {
                for (const compRepr of list) {
                    if (isRecord(compRepr)) {
                        const newType = newTypeFor(category, compRepr)
                        compRepr.type = newType
                        if (category === "gate" && isString(compRepr.poseAs)) {
                            compRepr.poseAs = compRepr.poseAs.toLowerCase()
                        }
                        components.push(compRepr)
                    }
                }
            }
            delete container[field]
        }
        container.components = components
    },


    5: (container) => {
        let type
        let match: RegExpExecArray | null

        // replace all hard-coded length types with parameterized types
        const ins = container.in
        if (isArray(ins)) {
            for (const in_ of ins) {
                if (isString(type = in_.type)) {

                    if (type === "nibble") {
                        delete in_.type
                        in_.bits = 4

                    } else if (type === "byte") {
                        delete in_.type
                        in_.bits = 8
                    }
                }
            }
        }

        const outs = container.out
        if (isArray(outs)) {
            for (const out of outs) {
                if (isString(type = out.type)) {

                    if (type === "nibble") {
                        delete out.type
                        out.bits = 4

                    } else if (type === "byte") {
                        delete out.type
                        out.bits = 8

                    } else if (type === "nibble-display") {
                        out.type = "display"
                        out.bits = 4

                    } else if (type === "byte-display") {
                        out.type = "display"
                        out.bits = 8

                    } else if (type === "shiftbuffer") {
                        out.type = "shift-buffer"
                    }
                }
            }
        }

        const gates = container.gates
        if (isArray(gates)) {
            for (const gate of gates) {
                if (isString(type = gate.type)) {

                    const lastChar = type[type.length - 1]
                    const maybeBit = parseInt(lastChar)
                    if (!isNaN(maybeBit)) {
                        gate.bits = maybeBit
                        gate.type = type.slice(0, -1)
                    }
                }
            }
        }

        const components = container.components
        if (isArray(components)) {

            const ramRegex = /^ram-(?<lines>\d+)x(?<bits>\d+)$/
            const muxRegex = /^mux-(?<from>\d+)to(?<to>\d+)$/
            const demuxRegex = /^demux-(?<from>\d+)to(?<to>\d+)$/

            for (const comp of components) {
                if (isString(type = comp.type)) {

                    if (type === "register") {
                        // register.state -> register.content
                        let state
                        if (isArray(state = comp.state)) {
                            const binStr = binaryStringRepr(state.map(toLogicValue) as any)
                            if (!isAllZeros(binStr)) {
                                comp.content = binStr
                            }
                            delete comp.state
                        }

                    } else if (type === "quad-gate") {
                        comp.type = "gate-array"

                    } else if (type === "quad-tristate") {
                        comp.type = "tristate-array"

                    } else if ((match = ramRegex.exec(type)) !== null) {
                        comp.type = "ram"
                        comp.bits = parseInt(match.groups?.bits ?? "4")
                        comp.lines = parseInt(match.groups?.lines ?? "16")

                    } else if ((match = muxRegex.exec(type)) !== null) {
                        comp.type = "mux"
                        comp.from = parseInt(match.groups?.from ?? "8")
                        comp.to = parseInt(match.groups?.to ?? "4")

                    } else if ((match = demuxRegex.exec(type)) !== null) {
                        comp.type = "demux"
                        comp.from = parseInt(match.groups?.from ?? "4")
                        comp.to = parseInt(match.groups?.to ?? "8")

                    }
                }
            }

            container.ic = components
            delete container.components
        }

        const layouts = container.layout
        if (isArray(layouts)) {

            const passthroughRegex = /^pass-(?<bits>\d+)$/

            for (const layout of layouts) {
                if (isString(type = layout.type)) {

                    if ((match = passthroughRegex.exec(type)) !== null) {
                        layout.type = "pass"
                        layout.bits = parseInt(match.groups?.bits ?? "1")
                    }
                }
            }
        }
    },


    4: (container) => {
        let nextNewId = findFirstFreeId(container)

        // correct type of 4-bit display
        const outs = container.out
        if (isArray(outs)) {
            for (const out of outs) {
                if (out.type === "nibble") {
                    out.type = "nibble-display"
                }
            }
        }

        // alu has one more output
        const components = container.components
        if (isArray(components)) {
            for (const comp of components) {
                if (comp.type === "alu") {
                    if (isArray(comp.out)) {
                        comp.out.push(nextNewId++) // add a new oVerflow output
                        // replace carry output with overflow output as it was wrongly used before
                        const t = comp.out[4]
                        comp.out[4] = comp.out[6]
                        comp.out[6] = t
                    }
                }
            }
        }
    },


    3: (container) => {
        // alu has one more input
        let nextNewId = findFirstFreeId(container)
        const components = container.components
        if (isArray(components)) {
            for (const comp of components) {
                if (comp.type === "alu") {
                    if (isArray(comp.in)) {
                        comp.in.push(nextNewId++)
                    }
                }
            }
        }
    },


    2: (container) => {
        // waypoints -> via
        const wires = container.wires
        if (isArray(wires)) {
            for (const wire of wires) {
                if (isArray(wire) && wire.length === 3) {
                    const wireOptions = wire[2]
                    if ("waypoints" in wireOptions) {
                        wireOptions.via = wireOptions.waypoints
                        delete wireOptions.waypoints
                    }
                }
            }
        }
    },


    1: (container) => {
        // all displays are now out
        if ("displays" in container) {
            const displays = container.displays
            delete container.displays
            if (!("out" in container)) {
                container.out = []
            }
            if (isArray(displays) && isArray(container.out)) {
                for (const display of displays) {
                    container.out.push(display)
                }
            }
        }

        // all clocks are now in
        if ("clocks" in container) {
            const clocks = container.clocks
            delete container.clocks
            if (!("in" in container)) {
                container.in = []
            }
            if (isArray(clocks) && isArray(container.in)) {
                for (const clock of clocks) {
                    clock.type = "clock"
                    container.in.push(clock)
                }
            }
        }

        // flipflops have a different input node order
        const components = container.components
        if (isArray(components)) {
            for (const comp of components) {
                let type
                if (isString(type = comp.type) && type.startsWith("flipflop")) {
                    // extract last three inputs
                    const inputs: Array<number> = comp.in
                    const lastThree = inputs.splice(-3)
                    comp.in = [...lastThree, ...inputs]
                }
            }
        }
    },

}


// Migration helpers

function findFirstFreeId(parsedContents: Record<string, unknown>): number {
    // this finds the maximum id of all components on raw (but parsed) JSON;
    // it is useful for migration code that needs to generate new ids

    let maxId = -1

    function inspectComponentDef(compDef: Record<string, unknown>) {
        for (const fieldName of ["id", "in", "out"]) {
            inspectValue(compDef[fieldName])
        }
    }

    function inspectValue(value: unknown) {
        if (value === undefined) {
            return
        }
        if (typeof value === "number") {
            if (!isNaN(value) && isFinite(value)) {
                maxId = Math.max(maxId, value)
            }
        } else if (typeof value === "string") {
            for (const val of value.split("-")) {
                inspectValue(parseInt(val))
            }
        } else if (isArray(value)) {
            for (const item of value) {
                inspectValue(item)
            }
        } else if (typeof value === "object" && value !== null) {
            inspectValue((value as Record<string, unknown>).id)
        }
    }

    for (const jsonField of Object.keys(parsedContents)) {
        const arr = parsedContents[jsonField]
        if (arr !== undefined && isArray(arr)) {
            for (const comp of arr) {
                inspectComponentDef(comp)
            }
        }
    }

    return maxId + 1
}
