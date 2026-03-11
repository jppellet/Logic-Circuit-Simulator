import { ComponentList } from "../ComponentList"
import { LogicEditor } from "../LogicEditor"
import { NodeManager } from "../NodeManager"
import { RecalcManager } from "../RedrawRecalcManager"
import { TestSuites } from "../TestSuite"
import { Mode } from "../utils"
import { Component, InjectedParams } from "./Component"
import { DrawableParent } from "./Drawable"
import { NodeIn, NodeOut } from "./Node"
import { LinkManager, WireStyle } from "./Wire"

type WaypointSpecCompact = [x: number, y: number] | [x: number, y: number, showDot: boolean]

export class XRay implements DrawableParent {

    public isMainEditor(): this is LogicEditor { return false }
    public get editor() { return this.component.parent.editor }
    public get mode() { return Mode.STATIC }

    public readonly components = new ComponentList()
    public readonly testSuites: TestSuites = new TestSuites(this)
    public readonly nodeMgr = new NodeManager()
    public readonly linkMgr: LinkManager = new LinkManager(this)
    public readonly recalcMgr = new RecalcManager()

    public get ifEditing() { return undefined }
    public startEditingThis() { throw new Error("can't edit xray") }
    public stopEditingThis() { throw new Error("can't edit xray") }

    public readonly componentCreationParams: InjectedParams = { isXRay: true }

    public currentlyDrawn: boolean = false

    public constructor(
        public readonly component: Component,
    ) {
    }

    public wire(startNode: NodeOut, endNode: NodeIn, opts?: {
        via?: WaypointSpecCompact | WaypointSpecCompact[],
        style?: WireStyle
    }) {
        const wire = this.linkMgr.addWire(startNode, endNode, false)
        if (wire === undefined) {
            return
        }
        wire.customPropagationDelay = 0
        if (opts?.style !== undefined) {
            wire.doSetStyle(opts.style)
        }
        if (opts?.via !== undefined && opts.via.length > 0) {
            const waypoints = (Array.isArray(opts.via[0]) ? opts.via : [opts.via]) as WaypointSpecCompact[]
            let nb = 0
            for (const wpSpec of waypoints) {
                const [x, y, showDot] = wpSpec
                const wp = wire.addWaypointWith(x, y, ++nb)
                if (showDot === true) {
                    wp.showDot = true
                }
            }
        }
    }
}
