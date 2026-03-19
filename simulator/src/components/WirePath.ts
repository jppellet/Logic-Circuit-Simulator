import { BezierCoords, bezierPoint, circle, fractionIfPointOnStraightSegment, isPointCloseToBezierWire, isPointCloseToStraightWire, isSameDirection, LineCoords, WIRE_WIDTH } from "../drawutils"
import { GraphicsRendering } from "./Drawable"

export type PossibleBranchPoints =
    | readonly [x: number, y: number, endX: number, endY: number] // don't match if following same dir
    | readonly [x: number, y: number] // for bezier end points and for the last point, match always


type WirePathLength = {
    ofPart: number[]
    total: number
    cumFracOfPart: number[]
}

export class WirePath {

    private _length: WirePathLength | undefined = undefined
    private readonly _possibleBranchPoints: PossibleBranchPoints[] = []

    public constructor(
        public parts: ReadonlyArray<LineCoords | BezierCoords>
    ) {
        // Find potential branch points, skipping first and last part, which are leads
        for (let i = 1; i < parts.length - 1; i++) {
            const part = parts[i]
            if (part.length === 4) {
                // straight
                this._possibleBranchPoints.push(part)
            } else {
                this._possibleBranchPoints.push([part[0], part[1]])
            }
        }
        const lastPart = parts[parts.length - 1]
        this._possibleBranchPoints.push([lastPart[0], lastPart[1]])
    }

    public get length(): WirePathLength {
        if (this._length === undefined) {
            let totalLength = 0
            const partLengths = []
            const cumPartLengths = []
            for (const part of this.parts) {
                let partLength: number
                if (part.length === 4) {
                    // line
                    const dx = part[2] - part[0]
                    const dy = part[3] - part[1]
                    partLength = Math.sqrt(dx * dx + dy * dy)
                } else {
                    // bezier with helper
                    const helperElement = document.createElementNS('http://www.w3.org/2000/svg', "path")
                    helperElement.setAttributeNS(null, "d", `M${part[0]} ${part[1]} C${part[4]} ${part[5]},${part[6]} ${part[7]},${part[2]} ${part[3]}`)
                    partLength = helperElement.getTotalLength()
                }
                partLengths.push(partLength)
                totalLength += partLength
                cumPartLengths.push(totalLength)
            }
            this._length = { ofPart: partLengths, total: totalLength, cumFracOfPart: cumPartLengths.map(v => v / totalLength) }
        }
        return this._length
    }

    public get possibleBranchPoints(): readonly PossibleBranchPoints[] {
        return this._possibleBranchPoints
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
                if (isPointCloseToStraightWire(x, y, part)) {
                    return i
                }
            } else {
                // bezier
                if (isPointCloseToBezierWire(x, y, part)) {
                    return i
                }
            }
        }
        return undefined
    }

    public fractionIfOverPossibleBranchPoint(point: PossibleBranchPoints): number | undefined {
        // skip first and last parts, which are leads
        const [x, y, endX, endY] = point
        for (let i = 1; i < this.parts.length; i++) {
            const fracBefore = this.length.cumFracOfPart[i - 1]
            const part = this.parts[i]
            const [partStartX, partStartY] = part
            if (part.length !== 4 || i === this.parts.length - 1) {
                // bezier or last segment: match start point
                if (partStartX === x && partStartY === y) {
                    return fracBefore
                }
                // console.log(`       part ${i}=${JSON.stringify(part)}, bezier or last, no match`)
            } else {
                // straight: match if on segment and not same dir
                const fracOnThisPart = fractionIfPointOnStraightSegment(x, y, part)
                if (fracOnThisPart !== undefined) {
                    if (endX === undefined || endY === undefined || !isSameDirection(x, y, endX, endY, part)) {
                        const fracOfPart = this.length.cumFracOfPart[i] - fracBefore
                        return fracBefore + fracOnThisPart * fracOfPart
                    }
                    // console.log(`       part ${i}=${JSON.stringify(part)}, straight, no match because colinear with ${JSON.stringify(point)}`)
                } else {
                    // console.log(`       part ${i}=${JSON.stringify(part)}, straight, no match because not on segment`)
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