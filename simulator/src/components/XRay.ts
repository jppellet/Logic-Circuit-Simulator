import { ComponentList } from "../ComponentList"
import { drawComponentIDs, DrawZIndex } from "../drawutils"
import { DrawParams, LogicEditor } from "../LogicEditor"
import { NodeManager } from "../NodeManager"
import { RecalcManager } from "../RedrawRecalcManager"
import { TestSuites } from "../TestSuite"
import { Mode } from "../utils"
import { Component, InjectedParams } from "./Component"
import { DrawableParent, GraphicsRendering, Orientation } from "./Drawable"
import { Gate, Gate1, Gate1Def, GateN, GateNDef } from "./Gate"
import { Gate1Type, Gate1Types, GateNType } from "./GateTypes"
import { Node, NodeBase, NodeIn, NodeOut } from "./Node"
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

    public constructor(
        public readonly component: Component,
    ) {
    }

    /**
     * Draws a wire between the given nodes, optionally aligning the target
     * component (when styleOrAlign is true) or source component (when styleOrAlign
     * is false) so that it makes a straight line. If no straight line is wanted,
     * then a WireStyle should be passed (usually "hv" or "vh") and optionally a
     * sequence of waypoints, some of which can be determined to always show a
     * dot (when we consider that a single wire splits, to make the branch
     * visually different from just a wire crossing).
     * 
     * Components that should be auto-aligned on an X or Y axis must previously
     * have been positioned at 0 for that axis (to get the correct relative position
     * of the alignment nodes with respect to the component).
     * 
     * Be careful to make wire() calls in the right order: do not align components
     * on other components that don't have their final position yet, and make the
     * wires with visible intersection waypoints after the wire undernear without.
     */
    public wire(startNode: NodeOut | Gate, endNode: NodeIn | Gate1, styleOrAlign?: WireStyle | boolean, via?: WaypointSpecCompact | WaypointSpecCompact[]) {
        if (!(startNode instanceof NodeBase)) {
            startNode = startNode.outputs.Out
        }
        if (!(endNode instanceof NodeBase)) {
            endNode = endNode.inputs.In[0]
        }
        const wire = this.linkMgr.addWire(startNode, endNode, false)
        if (wire === undefined) {
            return
        }
        wire.customPropagationDelay = 0
        if (styleOrAlign !== undefined) {
            if (styleOrAlign === true) {
                this.alignComponentOf(endNode, startNode)
                wire.doSetStyle("hv")
            } else if (styleOrAlign === false) {
                this.alignComponentOf(startNode, endNode)
                wire.doSetStyle("hv")
            } else {
                wire.doSetStyle(styleOrAlign)
            }
        }
        if (via !== undefined && via.length > 0) {
            const waypoints = (Array.isArray(via[0]) ? via : [via]) as WaypointSpecCompact[]
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

    public gate<G extends GateNType | Gate1Type>(validatedId: string, type: G, x: number, y: number, orient?: Orientation, bits?: G extends Gate1Type ? undefined : number): G extends Gate1Type ? Gate1 : GateN {
        if (Gate1Types.includes(type)) {
            const gate1 = Gate1Def.makeSpawned<Gate1>(this, validatedId, x, y, orient, { type })
            return gate1 as any
        } else {
            const gateN = GateNDef.makeSpawned<GateN>(this, validatedId, x, y, orient, { type, bits: bits ?? 2 })
            return gateN as any
        }
    }

    private alignComponentOf(nodeToAlign: Node, referenceNode: Node) {
        const comp = nodeToAlign.component
        const alignX = Orientation.isVertical(referenceNode.orient)
        let fail: [number, string] | undefined = undefined
        if (alignX) {
            if (comp.posX !== 0) {
                fail = [comp.posX, "X"]
            }
            const compX = referenceNode.posX - nodeToAlign.posX
            comp.setPosition(compX, comp.posY, false)
        } else {
            // alignY
            if (comp.posY !== 0) {
                fail = [comp.posY, "Y"]
            }
            const compY = referenceNode.posY - nodeToAlign.posY
            comp.setPosition(comp.posX, compY, false)
        }
        if (fail) {
            const [coord, axis] = fail
            console.warn(`Autoalignement on ${axis} axis of component ${comp.ref} will fail because it should previously have an ${axis} position of 0 and it has ${coord}`)
        }
    }

    public doDraw(g: GraphicsRendering, drawParams: DrawParams) {
        this.recalcMgr.recalcAndPropagateIfNeeded()
        const drawComp = (comp: Component) => {
            g.beginGroup(comp.constructor.name)
            try {
                comp.draw(g, drawParams)
                for (const node of comp.allNodes()) {
                    node.draw(g, drawParams)
                }
            } finally {
                g.endGroup()
            }
        }

        g.beginGroup("xray")
        for (const comp of this.components.withZIndex(DrawZIndex.Background)) {
            drawComp(comp)
        }
        this.linkMgr.draw(g, drawParams)
        for (const comp of this.components.withZIndex(DrawZIndex.Normal)) {
            drawComp(comp)
        }

        // draw refs
        if (this.editor.options.showIDs) {
            drawComponentIDs(g, this.components.all())
        }

        g.endGroup()
    }
}
