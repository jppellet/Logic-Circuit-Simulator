import { dist, WIRE_WIDTH } from "../drawutils"
import { GraphicsRendering } from "./Drawable"

export type LineCoords = readonly [startX: number, startY: number, endX: number, endY: number]

/**
 * Note that the control points are at the end such that the second pair of coordinates is the end of the curve, just like for LineCoords.
 */
export type BezierCoords = readonly [startX: number, startY: number, endX: number, endY: number, control1X: number, control1Y: number, control2X: number, control2Y: number]

export class WirePath {

    public readonly pathDesc: string
    private _length: number | undefined = undefined

    public constructor(
        public parts: ReadonlyArray<LineCoords | BezierCoords>
    ) {
        this.pathDesc = this._buildPathDesc()
    }

    public get length(): number {
        if (this._length === undefined) {
            const helperElement = document.createElementNS('http://www.w3.org/2000/svg', "path")
            helperElement.setAttributeNS(null, "d", this.pathDesc)
            this._length = helperElement.getTotalLength()
        }
        return this._length
    }

    public draw(g: GraphicsRendering) {
        g.beginPath()
        const start = this.parts[0]
        g.moveTo(start[0], start[1])
        for (const part of this.parts) {
            if (part.length === 4) {
                // line
                g.lineTo(part[2], part[3])
            } else {
                // bezier
                g.bezierCurveTo(part[4], part[5], part[6], part[7], part[2], part[3])
            }
        }

    }

    public isOver(x: number, y: number): boolean {
        const i = this.partIndexIfMouseover(x, y)
        if (i === undefined) {
            return false
        }
        console.log(`i = ${i} for ${x}, ${y}`)
        return true
        // return this.partIndexIfMouseover(x, y) !== undefined
    }

    public partIndexIfMouseover(x: number, y: number): undefined | number {
        const tol = WIRE_WIDTH / (10 * 2)
        for (let i = 0; i < this.parts.length - 1; i++) {
            const [startX, startY, endX, endY] = this.parts[i]
            const sumDist = dist(startX, startY, x, y) + dist(endX, endY, x, y)
            const wireLength = dist(startX, startY, endX, endY)
            // TODO use something smarter to account for bezier paths
            if (sumDist >= wireLength - tol && sumDist <= wireLength + tol) {
                return i
            }
        }
        return undefined
    }

    private _buildPathDesc(): string {
        const start = this.parts[0]
        const pathDescParts = [`M${start[0]} ${start[1]}`]
        for (const part of this.parts) {
            if (part.length === 4) {
                // line
                pathDescParts.push(`L${part[2]} ${part[3]}`)
            } else {
                // bezier
                pathDescParts.push(`C${part[4]} ${part[5]},${part[6]} ${part[7]},${part[2]} ${part[3]}`)
            }
        }
        return pathDescParts.join(" ")
    }


}
