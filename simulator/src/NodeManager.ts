import { int } from "./utils"
import { ComponentState } from "./components/Component"
import { Node } from "./components/Node"
import { wireMgr } from "./simulator"


export const NodeManager = (() => {
    let lastGivenNodeID = -1
    const usedIDs = new Set<number>()
    const allLiveNodes: Node[] = []

    return {
        newID: function (): int {
            while (usedIDs.has(++lastGivenNodeID)) {
                // empty block, condition does the increment
            }
            usedIDs.add(lastGivenNodeID)
            console.log(`gave out new node id ${lastGivenNodeID}`)
            return lastGivenNodeID as int
        },
        markIDUsed: function (id: number): void {
            if (usedIDs.has(id)) {
                console.warn(`WARN: loaded node with id ${id}, which is already taken`)
            }
            usedIDs.add(id)
        },

        addLiveNode: function (node: Node) {
            if (!usedIDs.has(node.id)) {
                console.warn(`WARN inserting live node with unreserved id ${node.id}`)
            }
            allLiveNodes[node.id] = node
        },

        removeLiveNode: function (node: Node) {
            delete allLiveNodes[node.id]
            usedIDs.delete(node.id)
        },

        clearAllLiveNodes: function () {
            allLiveNodes.splice(0, allLiveNodes.length)
            usedIDs.clear()
            lastGivenNodeID = -1
        },

        findNode: function (nodeID: number): Node | undefined {
            return allLiveNodes[nodeID]
        },

        tryConnectNodes: function () {
            let exitOnNextComponent = false
            for (const node of allLiveNodes) {
                if (node.acceptsMoreConnections) {
                    const component = node.parent
                    if (component.state === ComponentState.SPAWNING || component.isMoving) {
                        exitOnNextComponent = true
                        const nodeX = node.posX
                        const nodeY = node.posY
                        for (const other of allLiveNodes) {
                            if (other !== node && other.posX === nodeX && other.posY === nodeY) {
                                wireMgr.addNode(node)
                                wireMgr.addNode(other)
                                return
                            }
                        }
                    } else if (exitOnNextComponent) {
                        return
                    }
                }
            }
        },

    }
})()

