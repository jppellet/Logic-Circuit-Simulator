import { BezierCoords, bezierPoint, circle, isPointOnBezierWire, isPointOnStraightWire, LineCoords, WIRE_WIDTH } from "../drawutils"
import { GraphicsRendering } from "./Drawable"

export class WirePath {

    private _length: number | undefined = undefined

    public constructor(
        public parts: ReadonlyArray<LineCoords | BezierCoords>
    ) {}

    public get length(): number {
        if (this._length === undefined) {
            const helperElement = document.createElementNS('http://www.w3.org/2000/svg', "path")
            helperElement.setAttributeNS(null, "d", buildPathDesc(this.parts))
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

    public drawBezierDebug(g: GraphicsRendering) {
        g.strokeStyle = "red"
        g.lineWidth = 1
        for (const part of this.parts) {
            if (part.length === 4) {
                continue
            }
            // bounding box
            const bezierMeta = part[8]
            const [left, top, right, bottom] = bezierMeta.boundingBox
            g.strokeRect(left, top, right - left, bottom - top)

            const stepSize = bezierMeta.tStepSize
            // sample a series of points on the curve and check if the point is close to any of them
            for (let t = 0; t <= 1; t += stepSize) {
                const [x, y] = bezierPoint(t, part)
                g.beginPath()
                circle(g, x, y, WIRE_WIDTH)
                g.stroke()
            }
        }
    }

    public isOver(x: number, y: number): boolean {
        return this.partIndexIfMouseover(x, y) !== undefined
    }

    public partIndexIfMouseover(x: number, y: number): undefined | number {
        for (let i = 0; i < this.parts.length - 1; i++) {
            const part = this.parts[i]
            if (part.length === 4) {
                // line
                if (isPointOnStraightWire(x, y, part)) {
                    return i
                }
            } else {
                // bezier
                if (isPointOnBezierWire(x, y, part)) {
                    return i
                }
            }
        }
        return undefined
    }

}


function buildPathDesc(parts: ReadonlyArray<LineCoords | BezierCoords>): string {
    const start = parts[0]
    const pathDescParts = [`M${start[0]} ${start[1]}`]
    for (const part of parts) {
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