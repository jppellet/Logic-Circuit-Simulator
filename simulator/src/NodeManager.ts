import { Component } from "./components/Component"
import { Node } from "./components/Node"

export type NodeMapping = Map<number, number>

export class NodeManager {

    private _lastGivenNodeID = -1
    private _usedIDs = new Set<number>()
    private _allLiveNodes: Node[] = []
    private _currentMapping: NodeMapping | undefined = undefined

    public getFreeId(): number {
        while (this._usedIDs.has(++this._lastGivenNodeID)) {
            // empty block, condition does the increment
        }
        this._usedIDs.add(this._lastGivenNodeID)
        return this._lastGivenNodeID
    }

    public getFreeIdFrom(sourceId: number): number {
        if (!this._usedIDs.has(sourceId)) {
            this._usedIDs.add(sourceId)
            return sourceId
        }

        if (this._currentMapping !== undefined) {
            const newId = this.getFreeId()
            this._currentMapping.set(sourceId, newId)
            return newId
        } else {
            console.error(`Loaded node with id ${sourceId}, which is already taken, with no NodeMapping being built`)
            return sourceId
        }
    }

    public addLiveNode(node: Node) {
        if (!this._usedIDs.has(node.id)) {
            console.error(`Inserting live node with unreserved id ${node.id}`)
        }
        this._allLiveNodes[node.id] = node
    }

    public removeLiveNode(node: Node) {
        delete this._allLiveNodes[node.id]
        this._usedIDs.delete(node.id)
    }

    public clearAll() {
        this._allLiveNodes.splice(0, this._allLiveNodes.length)
        this._usedIDs.clear()
        this._lastGivenNodeID = -1
        this._currentMapping = undefined
    }

    public findNode(id: number, mapping: NodeMapping): Node | undefined {
        const mappedId = mapping.get(id) ?? id
        return this._allLiveNodes[mappedId]
    }

    public recordMappingWhile(f: () => void): NodeMapping {
        if (this._currentMapping !== undefined) {
            console.warn("NodeManager.recordMappingWhile called while already recording a mapping")
        }
        this._currentMapping = new Map()
        f()
        const mapping = this._currentMapping
        this._currentMapping = undefined
        // console.log(`${mapping.size} node mappings were recorded`)
        return mapping
    }

    public tryConnectNodesOf(comp: Component) {
        const linkMgr = comp.parent.linkMgr
        const addedConnections: [Node, Component, Node][] = []
        for (const node of comp.allNodes()) {
            if (node.acceptsMoreConnections) {
                const nodeX = node.posX
                const nodeY = node.posY
                const component = node.component
                for (const other of this._allLiveNodes) {
                    if (other !== undefined && other.component !== component && other.acceptsMoreConnections) {
                        if (other.posX === nodeX && other.posY === nodeY) {
                            // the wire manager will take care of determining whether
                            // they can actually be connected or not
                            linkMgr.startDraggingWireFrom(node)
                            const wire = linkMgr.stopDraggingWireOn(other)
                            if (wire !== undefined) {
                                addedConnections.push([node, other.component, other])
                            }
                        }
                    }
                }
            }
        }
        return addedConnections
    }

}
