import { BezierCoords, bezierPoint, circle, fractionIfPointOnStraightSegment, isPointCloseToBezierWire, isPointCloseToStraightWire, isSameDirection, LineCoords, WIRE_WIDTH } from "../drawutils"
import { Mode } from "../utils"
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

    public readonly parts: ReadonlyArray<LineCoords | BezierCoords>
    private _length: WirePathLength | undefined = undefined
    private readonly _possibleBranchPoints: PossibleBranchPoints[] = []

    public constructor(
        parts: ReadonlyArray<LineCoords | BezierCoords>,
        __mode: Mode,
    ) {
        this.parts = parts // normalizePath(parts, mode) // calling this leads to issues with waypoint detection in XRay mode
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


function normalizePath(parts: ReadonlyArray<LineCoords | BezierCoords>, mode: Mode): ReadonlyArray<LineCoords | BezierCoords> {

    const tryMerge = (part1: LineCoords | BezierCoords, part2: LineCoords | BezierCoords): LineCoords | undefined => {
        if (part1.length === 4 && part2.length === 4 &&
            ((part1[1] === part1[3] && part1[1] === part2[3]) || // horizontal, same y as next
                (part1[0] === part1[2] && part1[0] === part2[2]))    // vertical, same x as next
        ) {
            return [part1[0], part1[1], part2[2], part2[3]]
        }
        return undefined
    }

    // always try to merge the end
    const newLastPart = tryMerge(parts[parts.length - 2], parts[parts.length - 1])
    if (newLastPart !== undefined) {
        parts = [...parts.slice(0, parts.length - 2), newLastPart]
    }

    if (mode <= Mode.TRYOUT) {
        // also try to merge the beginning
        const newFirstPart = tryMerge(parts[0], parts[1])
        if (newFirstPart !== undefined) {
            parts = [newFirstPart, ...parts.slice(2)]
        }
    }

    return parts
}