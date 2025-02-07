import { LogicEditor } from "./LogicEditor"
import { TimeoutHandle } from "./utils"

export type Timestamp = number
export type CallbackFn = () => unknown
export type TimelineState = {
    hasCallbacks: boolean,
    enablesPause: boolean,
    isPaused: boolean,
    nextStepDesc: string | undefined,
}

function areStatesEqual(s1: TimelineState, s2: TimelineState): boolean {
    return s1.hasCallbacks === s2.hasCallbacks
        && s1.enablesPause === s2.enablesPause
        && s1.isPaused === s2.isPaused
        && s1.enablesPause === s2.enablesPause
        && s1.nextStepDesc === s2.nextStepDesc
}

type Callback = { callback: CallbackFn, desc: string, enablesPause: boolean }
type ScheduledCallbacks = { [time: Timestamp]: Callback[] }

export class Timeline {

    public readonly editor: LogicEditor

    // what in the system time is our zero time (adjusted on pause, reset on reload)
    private _epochStart!: Timestamp
    private _sortedNextCallbackTimes!: Timestamp[]
    // per callback time, a list of callbacks
    private _schedule!: ScheduledCallbacks
    // cached value indicating if we have callbacks that always enables pausing, like a clock
    private _numCallbacksEnablingPause!: number
    // allows canceling the next tick if (a) we pause, (b) we enqueue something before
    private _nextTimeout: { handle: TimeoutHandle, tickTime: number } | undefined
    // set when callbacks are running to return a constant time
    private _fixedLogicalTime: Timestamp | undefined
    // when we are paused: the (absolute) start time of the pause
    private _pausedSince: Timestamp | undefined
    // remember last sent state to avoid fake events
    private _lastSentState: TimelineState | undefined

    // public callback function
    public onStateChanged: (state: TimelineState) => unknown = __ => null

    public constructor(editor: LogicEditor) {
        this.editor = editor
        this.reset()
    }

    public reset() {
        this._epochStart = this.unadjustedTime()
        this._sortedNextCallbackTimes = []
        this._schedule = {}
        this._numCallbacksEnablingPause = 0
        if (this._nextTimeout !== undefined) {
            clearTimeout(this._nextTimeout.handle)
            this._nextTimeout = undefined
        }
        this._fixedLogicalTime = undefined
        this._pausedSince = undefined
    }

    public get isPaused() {
        return this._pausedSince !== undefined
    }

    public get nextTickDesc(): string | undefined {
        if (this._sortedNextCallbackTimes.length === 0) {
            return undefined
        }
        const nextTime = this._sortedNextCallbackTimes[0]
        const nextCallbacks = this._schedule[nextTime]
        if (nextCallbacks.length === 1) {
            return nextCallbacks[0].desc
        }

        // else, build a summary
        const counts = new Map<string, number>()
        for (const c of nextCallbacks) {
            counts.set(c.desc, (counts.get(c.desc) ?? 0) + 1)
        }
        return [...counts.entries()].map(([desc, count]) => `${count} × ${desc}`).join("\n")
    }

    public get state(): TimelineState {
        const hasCallbacks = this._sortedNextCallbackTimes.length > 0
        const enablesPause = this._numCallbacksEnablingPause > 0
        const isPaused = this.isPaused
        const canStep = isPaused && hasCallbacks
        const nextStepDesc = !canStep ? undefined : this.nextTickDesc
        return { hasCallbacks, enablesPause, isPaused, nextStepDesc }
    }

    public unadjustedTime(): Timestamp {
        return new Date().getTime()
    }

    public logicalTime(): Timestamp {
        if (this._fixedLogicalTime !== undefined) {
            // we're in a callback, return constant value
            return this._fixedLogicalTime
        }

        if (this._pausedSince !== undefined) {
            // return constant value of "stuck" time
            return this._pausedSince - this._epochStart
        }

        // return absolute time minus when we started to count
        return this.unadjustedTime() - this._epochStart
    }

    public hasPendingCallbacksNow(): boolean {
        // console.log(`  hasPendingCallbacksNow: ${this._sortedNextCallbackTimes}; now: ${this.logicalTime()}`)
        return this._sortedNextCallbackTimes.length > 0
            && this._sortedNextCallbackTimes[0] <= this.logicalTime()
    }

    public scheduleAt(time: Timestamp, callback: CallbackFn, desc: string, enablesPause: boolean) {
        // console.log(`Scheduling '${desc}' at ${time}`)
        const callbackRec = { callback, desc, enablesPause }
        this._numCallbacksEnablingPause += enablesPause ? 1 : 0

        if (time in this._schedule) {
            // add callback to existing time
            this._schedule[time].push(callbackRec)

        } else {
            if (time < this.logicalTime()) {
                console.log(`WARNING Scheduling this in the past (${time - this.logicalTime()} ms), may behave strangely: ` + desc)
            }

            // add new time to sorted list of times
            let i = 0
            do {
                if (i >= this._sortedNextCallbackTimes.length) {
                    // push as last value
                    this._sortedNextCallbackTimes.push(time)
                    break
                }
                if (time < this._sortedNextCallbackTimes[i]) {
                    // insert at position i
                    this._sortedNextCallbackTimes.splice(i, 0, time)
                    break
                }
                i++
                // eslint-disable-next-line no-constant-condition
            } while (true)
            this._schedule[time] = [callbackRec]

            if (i === 0) {
                // inserted in front of queue
                this.rescheduleNextIfNeeded()
            }
            // console.log("Schedule: ", this._schedule)
        }

        this.fireStateChangedIfNeeded()
    }

    private rescheduleNextIfNeeded() {
        // schedules a timeout for the next wanted tick time

        if (this._sortedNextCallbackTimes.length === 0) {
            // make sure nothing is scheduled
            if (this._nextTimeout !== undefined) {
                clearTimeout(this._nextTimeout.handle)
                this._nextTimeout = undefined
            }

        } else {
            // check if we need to reschedule
            const tickTime = this._sortedNextCallbackTimes[0]
            if (this._nextTimeout !== undefined) {
                if (this._nextTimeout.tickTime <= tickTime) {
                    // something's scheduled before
                    return
                } else {
                    // something's scheduled after, cancel it
                    clearTimeout(this._nextTimeout.handle)
                    this._nextTimeout = undefined
                }
            }
            const now = this.logicalTime()
            const waitDuration = tickTime - now
            // console.log(`Now is ${now}; scheduling next timeline event for ${tickTime} in ${waitDuration} ms`, this._sortedNextCallbackTimes)
            const handle = setTimeout(() => this.nextTickCallback(), waitDuration)
            this._nextTimeout = { handle, tickTime }
        }
    }

    private nextTickCallback() {
        this._nextTimeout = undefined
        // don't do anything if this was called while we are paused
        if (this._pausedSince !== undefined) {
            return
        }
        this.handleNextTick()
    }

    private handleNextTick() {
        // run all the handlers from the next tick
        const wantedTime = this._sortedNextCallbackTimes.shift()
        if (wantedTime === undefined) {
            return
        }
        const now = this.logicalTime()
        // console.log(`Running callbacks for ${wantedTime} (now is ${now})`)
        const callbacks = this._schedule[wantedTime]
        const late = now - wantedTime
        if (late > 100) {
            // adjust time; probably, the page was hidden and then shown again or callbacks are running slowly
            this._epochStart += late
            // console.log(`Adjusted time by ${late} ms`)
        }
        // console.log(`Running ${callbacks.length} callbacks at adjusted time ${now} (wanted for ${wantedTime}, late by ${late} ms)`)

        const runAllCallbacks = () => {
            // use while and shift() to allow callbacks to enqueue new callbacks
            // without causing iteration issues
            let elem
            this._fixedLogicalTime = wantedTime
            while ((elem = callbacks.shift()) !== undefined) {
                const { callback, desc, enablesPause } = elem
                this._numCallbacksEnablingPause -= enablesPause ? 1 : 0
                // console.log(`  -> Running '${desc}'`)
                try {
                    callback()
                } catch (err) {
                    console.log(`ERROR running callback '${desc}': ` + err)
                }
            }
            this._fixedLogicalTime = undefined
        }

        // use wrapHandler to do any recalc/redraws after
        // calling the handlers if necessary
        this.editor.wrapHandler(runAllCallbacks)()

        // remove the time from the schedule
        delete this._schedule[wantedTime]

        // move on to the next tick
        this.rescheduleNextIfNeeded()
        this.fireStateChangedIfNeeded()
    }

    public pause() {
        if (this._pausedSince !== undefined) {
            return
        }
        if (this._nextTimeout !== undefined) {
            clearTimeout(this._nextTimeout.handle)
            this._nextTimeout = undefined
        }
        // console.log(`Pausing timeline at ${this.adjustedTime()} ms`)
        this._pausedSince = this.unadjustedTime()
        this.fireStateChangedIfNeeded()
    }

    public play() {
        if (this._pausedSince === undefined) {
            return
        }
        this._epochStart += (this.unadjustedTime() - this._pausedSince)
        this._pausedSince = undefined
        // console.log(`Resuming timeline at ${this.adjustedTime()} ms`)
        this.editor.editTools.redrawMgr.requestRedraw({ why: "timeline-play", invalidateTests: true })
        this.rescheduleNextIfNeeded()
        this.fireStateChangedIfNeeded()
    }

    public step() {
        if (this._pausedSince === undefined || this._sortedNextCallbackTimes.length === 0) {
            return
        }
        // move back epoch start time to simulate that the time
        // between now and the next tick has been elapsed
        const nextTickTime = this._sortedNextCallbackTimes[0]
        const currentPauseTime = this.logicalTime()
        this._epochStart -= nextTickTime - currentPauseTime
        this.handleNextTick()
        this.fireStateChangedIfNeeded()
    }

    private fireStateChangedIfNeeded() {
        const newState = this.state
        if (this._lastSentState === undefined || !areStatesEqual(this._lastSentState, newState)) {
            this.onStateChanged(newState)
            this._lastSentState = newState
        }
    }
}
