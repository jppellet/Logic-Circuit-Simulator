import { Component } from "./components/Component"
import { Drawable } from "./components/Drawable"
import { Dict } from "./utils"

export class RedrawManager {

    private _canvasRedrawReasons: Dict<unknown[]> = {}
    private _maskWasInvalidated = false
    private _isPropagating = false
    private _isEmpty = true

    public addReason(reason: string, comp: Drawable | null, invalidateMask: boolean = false, isPropagation: boolean = false) {
        const compObj = comp
        const compList = this._canvasRedrawReasons[reason]
        if (compList === undefined) {
            this._canvasRedrawReasons[reason] = [compObj]
        } else {
            compList.push(compObj)
        }
        if (invalidateMask) {
            this._maskWasInvalidated = true
        }
        if (isPropagation) {
            this._isPropagating = true
        }
        this._isEmpty = false
    }

    public getReasonsAndClear(): [getReasons: () => string, redrawMask: boolean] | undefined {
        if (this._isEmpty) {
            return undefined
        }

        const redrawReasons = this._canvasRedrawReasons
        const getReasons = () => {
            const reasonParts: string[] = []
            for (const reason of Object.keys(redrawReasons)) {
                reasonParts.push(reason)
                const linkedComps = redrawReasons[reason]!
                reasonParts.push(" (", String(linkedComps.length), "×)", ": ")
                for (const comp of linkedComps) {
                    if (comp !== null) {
                        const compAny = comp as any
                        reasonParts.push(compAny.constructor?.name ?? "Component")
                        if (compAny.type !== undefined) {
                            reasonParts.push("_", compAny.type)
                        }
                        if (compAny.name !== undefined) {
                            reasonParts.push("('", compAny.name, "')")
                        }
                        reasonParts.push("; ")
                    }
                }
                reasonParts.pop()
                reasonParts.push("\n    ")
            }
            reasonParts.pop()
            return reasonParts.join("")
        }

        const redrawMask = this._maskWasInvalidated

        this._canvasRedrawReasons = {}
        this._isPropagating = false
        this._maskWasInvalidated = false
        this._isEmpty = true
        return [getReasons, redrawMask]
    }

    public hasReasons(): boolean {
        return !this._isEmpty
    }

    public isAnyValuePropagating(): boolean {
        return this._isPropagating
    }
}


export class RecalcManager {

    private _propagateQueue: Array<Component> = []
    private _recalcQueue: Array<[Component, force: boolean]> = []
    public debug = false

    public enqueueForPropagate(comp: Component) {
        this._propagateQueue.push(comp)
        this.log("Enqueued for propagate: " + comp)
    }

    public enqueueForRecalc(comp: Component, forcePropagate: boolean) {
        this._recalcQueue.push([comp, forcePropagate])
        this.log("Enqueued for recalc: " + comp)
    }

    public queueIsEmpty(): boolean {
        return this._propagateQueue.length === 0 && this._recalcQueue.length === 0
    }

    public recalcAndPropagateIfNeeded(): boolean {
        if (this.queueIsEmpty()) {
            return false
        }
        this.recalcAndPropagate()
        return true
    }

    private recalcAndPropagate() {
        // We proceed as follows: first, we propagate (from input nodes to components)
        // all pending values. This marks some components as needing recalc, probably, and
        // doing all propagation beforehand allows to wait with recalc until all values are
        // propagated. Then, we recalc all components that need it, and then we loop until
        // no new propagation/recalc is needed. We may need several loops if propagation
        // times are set to 0, and we break out of the loop after a certain number of rounds
        // to avoid infinite loops (e.g., a NOT gate looping back to itself)

        let round = 0
        const roundLimit = 1000
        do {
            round++
            if (round >= roundLimit) {
                console.warn(`ERROR: Circular dependency; suspending updates after ${roundLimit} recalc/propagate rounds`)
                for (const comp of [...this._propagateQueue, ...this._recalcQueue.map((r) => r[0])]) {
                    comp.setInvalid()
                }
                this._propagateQueue = []
                this._recalcQueue = []
                break
            }

            this.log(`Recalc/propagate round ${round}: ${this._propagateQueue.length} propagate, ${this._recalcQueue.length} recalc.`)

            const propagateQueue = this._propagateQueue
            this._propagateQueue = []
            this.log(`  PROPAG (${propagateQueue.length}) – ` + propagateQueue.map((c) => c.toString()).join("; "))
            for (const comp of propagateQueue) {
                try {
                    comp.propagateCurrentValue()
                } catch (e) {
                    console.error("Error while propagating value of " + comp, e)
                    comp.setInvalid()
                }
            }

            const recalcQueue = this._recalcQueue
            this._recalcQueue = []
            this.log(`  RECALC (${recalcQueue.length}) – ` + recalcQueue.map((c) => c.toString()).join("; "))
            for (const [comp, forcePropagate] of recalcQueue) {
                try {
                    comp.recalcValue(forcePropagate)
                } catch (e) {
                    console.error("Error while recalculating value of " + comp, e)
                    comp.setInvalid()
                }
            }

        } while (!this.queueIsEmpty())

        this.log(`Recalc/propagate done in ${round} rounds.`)
    }

    private log(msg: string) {
        if (this.debug) {
            console.log(msg)
        }
    }

}
