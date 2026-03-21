import { doALUAdd, doALUSub } from "./components/ALU"
import { WireColumnAllocator } from "./components/XRay"
import { displayValuesFromArray, WIRE_WIDTH } from "./drawutils"
import { LogicValue } from "./utils"

export class Tests {

    public aluOps() {
        function* nibbles(): Generator<boolean[], void, unknown> {
            for (const a of [false, true]) {
                for (const b of [false, true]) {
                    for (const c of [false, true]) {
                        for (const d of [false, true]) {
                            yield [a, b, c, d]
                        }
                    }
                }
            }
        }


        function representationsOf(v: LogicValue[]): [string, number, number] {
            const [str, uint_] = displayValuesFromArray(v, true)
            const uint = uint_ as number
            const sint = uint < 8 ? uint : uint - 16
            return [str, uint, sint]
        }

        let numTests = 0
        let numFailed = 0
        const verbose = false

        for (const a of nibbles()) {
            for (const b of nibbles()) {
                for (const cin of [false, true]) {


                    const [a_str, a_uint, a_sint] = representationsOf(a)
                    const [b_str, b_uint, b_sint] = representationsOf(b)

                    a.reverse()
                    b.reverse()
                    const { s: sum, v: v_sum, cout: c_sum } = doALUAdd(a, b, cin)
                    const { s: diff, v: v_diff, cout: c_diff } = doALUSub(a, b, cin)
                    a.reverse()
                    b.reverse()
                    sum.reverse()
                    diff.reverse()
                    const [sum_str, sum_uint, sum_sint] = representationsOf(sum)
                    const [diff_str, diff_uint, diff_sint] = representationsOf(diff)


                    //// TEST: unsigned addition

                    const should_sum_uint = a_uint + b_uint + Number(cin)
                    const should_c_sum = should_sum_uint > 15

                    let carryError = false
                    if (should_c_sum) {
                        // if this is an unsigned overflow, the sum has to be wrong and carry has to be set
                        carryError = sum_uint === should_sum_uint || c_sum !== true
                    } else {
                        // else the sum has to be correct and carry has to be clear
                        carryError = sum_uint !== should_sum_uint || c_sum !== false
                    }
                    if (carryError) {
                        console.log(`ERROR carry - ${a_uint} (${a_str}) + ${b_uint} (${b_str}) + ${Number(cin)} = ${sum_uint} (${sum_str}) (c=${c_sum})`)
                        numFailed++
                    } else if (verbose) {
                        console.log(`carry - ${a_uint} (${a_str}) + ${b_uint} (${b_str}) + ${Number(cin)} = ${sum_uint} (${sum_str}) (c=${c_sum})`)
                    }
                    numTests++


                    //// TEST: unsigned subtraction

                    const should_diff_uint = a_uint - b_uint - Number(cin)

                    let borrowError = false
                    if (a_uint - Number(cin) < b_uint) {
                        // if this is an unsigned underflow, the difference has to be wrong and borrow has to be set
                        borrowError = diff_uint === should_diff_uint || c_diff !== true
                    } else {
                        // else the difference has to be correct and borrow has to be clear
                        borrowError = diff_uint !== should_diff_uint || c_diff !== false
                    }
                    if (borrowError) {
                        console.log(`ERROR borrow - ${a_uint} (${a_str}) - ${b_uint} (${b_str}) - ${Number(cin)} = ${diff_uint} (${diff_str}) (c=${c_diff})`)
                        numFailed++
                    } else if (verbose) {
                        console.log(`borrow - ${a_uint} (${a_str}) - ${b_uint} (${b_str}) - ${Number(cin)} = ${diff_uint} (${diff_str}) (c=${c_diff})`)
                    }
                    numTests++



                    //// TEST: signed addition

                    const should_sum_sint = a_sint + b_sint + Number(cin)
                    const should_v_sum = should_sum_sint > 7 || should_sum_sint < -8

                    let overflowError = false
                    if (should_v_sum) {
                        // if this is a signed overflow, the sum has to be wrong and overflow has to be set
                        overflowError = sum_sint === should_sum_sint || v_sum !== true
                    } else {
                        // else the sum has to be correct and overflow has to be clear
                        overflowError = sum_sint !== should_sum_sint || v_sum !== false
                    }
                    if (overflowError) {
                        console.log(`ERROR overflow - ${a_sint} (${a_str}) + ${b_sint} (${b_str}) + ${Number(cin)} = ${sum_sint} (${sum_str}) (v=${v_sum})`)
                        numFailed++
                    } else if (verbose) {
                        console.log(`overflow - ${a_sint} (${a_str}) + ${b_sint} (${b_str}) + ${Number(cin)} = ${sum_sint} (${sum_str}) (v=${v_sum})`)
                    }
                    numTests++



                    //// TEST: signed subtraction

                    const should_diff_sint = a_sint - b_sint - Number(cin)
                    const should_v_diff = should_diff_sint > 7 || should_diff_sint < -8

                    let overflowError2 = false
                    if (should_v_diff) {
                        // if this is a signed overflow, the sum has to be wrong and overflow has to be set
                        overflowError2 = diff_sint === should_diff_sint || v_diff !== true
                    } else {
                        // else the sum has to be correct and overflow has to be clear
                        overflowError2 = diff_sint !== should_diff_sint || v_diff !== false
                    }
                    if (overflowError2) {
                        console.log(`ERROR overflow - ${a_sint} (${a_str}) - ${b_sint} (${b_str}) - ${Number(cin)} = ${diff_sint} (${diff_str}) (v=${v_diff})`)
                        numFailed++
                    } else if (verbose) {
                        console.log(`overflow - ${a_sint} (${a_str}) - ${b_sint} (${b_str}) - ${Number(cin)} = ${diff_sint} (${diff_str}) (v=${v_diff})`)
                    }
                    numTests++
                }
            }
        }

        report(numTests, numFailed)
    }

    public columnAllocator() {
        const alloc = new WireColumnAllocator(false)
        const margin = WIRE_WIDTH

        let numTests = 0
        let numFailed = 0

        const expectValue = (msg: string, expected: number, is: number) => {
            numTests++
            if (expected !== is) {
                console.log(`ERROR: ${msg} - expected ${expected}, is ${is}`)
                numFailed++
            }
        }

        expectValue("first alloc", 0,
            alloc.allocate(0, 10)
        )

        expectValue("first conflicting alloc", 1,
            alloc.allocate(0, 10)
        )

        expectValue("conflicting alloc because of margin", 2,
            alloc.allocate(10, 20)
        )

        expectValue("nonconflicting alloc in 0", 0,
            alloc.allocate(20, 40)
        )

        expectValue("alloc in 1 with reversed coords", 1,
            alloc.allocate(30, 20)
        )

        expectValue("weird empty alloc", 2,
            alloc.allocate(0, 0)
        )

        expectValue("weird empty alloc", 3,
            alloc.allocate(0, 0)
        )

        expectValue("small conflicting because of margin", 4,
            alloc.allocate(1, 2)
        )

        expectValue("big alloc right at margin", 0,
            alloc.allocate(40 + margin, 200)
        )

        expectValue("total number of columns", 5,
            alloc.numColumns
        )

        alloc.dump()


        report(numTests, numFailed)
    }

}

function report(numTests: number, numFailed: number) {
    const stack = new Error().stack!.split('\n')
    const parentName = stack[1].trim().split('@')[0]
    console.log(`Testsuite '${parentName}': ${numTests} total, ${numTests - numFailed} passed, ${numFailed} failed`)
}