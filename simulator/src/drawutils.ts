import { Component, ComponentBase, ComponentName, isNodeArray, ReadonlyGroupedNodeArray } from "./components/Component"
import { LedColor } from "./components/DisplayBar"
import { DrawableWithPosition, DrawContext, DrawContextExt, GraphicsRendering, HasPosition, Orientation } from "./components/Drawable"
import { Node, WireColor } from "./components/Node"
import { RectangleColor } from "./components/Rectangle"
import { Waypoint } from "./components/Wire"
import { LogicEditor } from "./LogicEditor"
import { EdgeTrigger, FixedArray, FixedArrayAssert, InBrowser, isArray, isHighImpedance, isNumber, isString, isUnknown, LogicValue, Mode, Unknown } from "./utils"


//
// GRID, GENERAL
//

export const GRID_STEP = 10
export const WIRE_WIDTH = 8
export const WIRE_WIDTH_HALF_SQUARED = (WIRE_WIDTH / 2) ** 2
export const WAYPOINT_DIAMETER = 8
const WAYPOINT_HIT_RANGE = WAYPOINT_DIAMETER + 5


export function pxToGrid(x: number) {
    return Math.round(x / GRID_STEP)
}

export function clampZoom(zoom: number) {
    return Math.max(0.1, Math.min(10, zoom / 100))
}

/**
 * Squared to avoid the square root operation
 */
export function distSquared(x0: number, y0: number, x1: number, y1: number): number {
    const dx = x1 - x0
    const dy = y1 - y0
    return dx * dx + dy * dy
}

export function inRect(centerX: number, centerY: number, width: number, height: number, pointX: number, pointY: number): boolean {
    const w2 = width / 2
    const h2 = height / 2
    return pointX >= centerX - w2 && pointX < centerX + w2 &&
        pointY >= centerY - h2 && pointY < centerY + h2
}

export class DrawingRect {

    public readonly width: number
    public readonly height: number

    public readonly top: number
    public readonly left: number
    public readonly bottom: number
    public readonly right: number

    public constructor(comp: Component, honorRotation: boolean) {
        this.width = comp.unrotatedWidth
        this.height = comp.unrotatedHeight

        const swapDims = honorRotation && Orientation.isVertical(comp.orient)
        if (swapDims) {
            [this.width, this.height] = [this.height, this.width]
        }

        this.top = comp.posY - this.height / 2
        this.left = comp.posX - this.width / 2
        this.bottom = this.top + this.height
        this.right = this.left + this.width
    }

    public outline(g: GraphicsRendering, margin: number = 0): Path2D {
        const path = g.createPath()
        path.rect(this.left - margin, this.top - margin, this.width + margin * 2, this.height + margin * 2)
        return path
    }

}

export const DrawZIndex = {
    Background: 0,
    Normal: 1,
    Overlay: 2,
} as const
export type DrawZIndex = (typeof DrawZIndex)[keyof typeof DrawZIndex]


//
// COLORS
//

export type ColorGreyLevel = number
export type ColorComponentsRGB = [number, number, number]
export type ColorComponentsRGBA = [number, number, number, number]
export type ColorString = string

export const COLOR_TRANSPARENT: ColorString = "rgba(0,0,0,0)"
export const USER_COLORS = {
    COLOR_BACKGROUND: undefined as ColorString | undefined,
}

export let COLOR_BACKGROUND: ColorString
export let COLOR_OFF_BACKGROUND: ColorString
export let COLOR_BACKGROUND_UNUSED_REGION: ColorString
export let COLOR_BACKGROUND_INVALID: ColorString
export let COLOR_BORDER: ColorString
export let COLOR_GRID_LINES: ColorString
export let COLOR_GRID_LINES_GUIDES: ColorString
export let COLOR_LABEL_OFF: ColorString
export let COLOR_LABEL_ON: ColorString
export let COLORCOMP_COMPONENT_BORDER: ColorGreyLevel
export let COLOR_COMPONENT_BORDER: ColorString
export let COLOR_COMPONENT_INNER_LABELS: ColorString
export let COLOR_COMPONENT_ID: ColorString
export let COLOR_GROUP_SPAN: ColorString
export let COLOR_WIRE_BORDER: ColorString
export let COLOR_MOUSE_OVER: ColorString
export let COLOR_MOUSE_OVER_NORMAL: ColorString
export let COLOR_MOUSE_OVER_DANGER: ColorString
export let COLOR_NODE_MOUSE_OVER: ColorString
export let COLORCOMPS_FULL: ColorComponentsRGB
export let COLOR_FULL: ColorString
export let COLOR_FULL_ALT: ColorString
export let COLOR_DARK_RED: ColorString
export let COLORCOMPS_EMPTY: ColorComponentsRGB
export let COLOR_EMPTY: ColorString
export let COLOR_EMPTY_ALT: ColorString
export let COLOR_UNKNOWN: ColorString
export let COLOR_UNKNOWN_ALT: ColorString
export let COLOR_HIGH_IMPEDANCE: ColorString
export let COLOR_ANCHOR_IN: ColorString
export let COLOR_ANCHOR_OUT: ColorString
export let COLOR_ANCHOR_NEW: ColorString
export let COLOR_GATE_NAMES: ColorString
export let COLOR_LED_ON: { [C in LedColor]: ColorString }
export let COLOR_WIRE: { [C in WireColor]: ColorString }
export let COLOR_RECTANGLE_BACKGROUND: { [C in RectangleColor]: ColorString }
export let COLOR_RECTANGLE_BORDER: { [C in RectangleColor]: ColorString }
export let PATTERN_STRIPED_GRAY: CanvasPattern

export const OPACITY_HIDDEN_ITEMS = 0.3

let _currentModeIsDark = false
doSetColors(_currentModeIsDark)

export function setDarkMode(darkMode: boolean, force: boolean) {
    if (force || darkMode !== _currentModeIsDark) {
        doSetColors(darkMode)
        for (const editor of LogicEditor.allConnectedEditors) {
            editor.wrapHandler(() => {
                editor.setDark(darkMode)
                editor.editTools.redrawMgr.requestRedraw({ why: "dark/light mode switch" })
            })()
        }
    }
}

export function isDarkMode() {
    return _currentModeIsDark
}

function doSetColors(darkMode: boolean) {
    if (!darkMode) {
        // Light Theme
        COLOR_BACKGROUND = ColorString(0xFF)
        COLOR_OFF_BACKGROUND = ColorString(0xDF)
        COLOR_BACKGROUND_INVALID = ColorString([0xFF, 0xBB, 0xBB])
        COLOR_BACKGROUND_UNUSED_REGION = ColorString(0xEE)
        COLOR_BORDER = ColorString(200)
        COLOR_GRID_LINES = ColorString(240)
        COLOR_GRID_LINES_GUIDES = ColorString(215)
        COLOR_LABEL_OFF = ColorString(0xFF)
        COLOR_LABEL_ON = ColorString(0)
        COLORCOMP_COMPONENT_BORDER = 0x00
        COLOR_COMPONENT_INNER_LABELS = ColorString(0xAA)
        COLOR_COMPONENT_ID = ColorString([50, 50, 250])
        COLOR_GROUP_SPAN = ColorString([128, 128, 128, 0.13])
        COLOR_WIRE_BORDER = ColorString(80)
        COLOR_MOUSE_OVER_NORMAL = ColorString([0, 0x7B, 0xFF])
        COLOR_MOUSE_OVER_DANGER = ColorString([194, 34, 14])
        COLOR_NODE_MOUSE_OVER = ColorString([128, 128, 128, 0.5])
        COLORCOMPS_FULL = [255, 193, 7]
        COLOR_DARK_RED = ColorString([180, 0, 0])
        COLORCOMPS_EMPTY = [52, 58, 64]
        COLOR_UNKNOWN = ColorString([152, 158, 164])
        COLOR_HIGH_IMPEDANCE = ColorString([137, 114, 35])
        COLOR_GATE_NAMES = ColorString([190, 190, 190])
        COLOR_LED_ON = {
            green: ColorString([20, 232, 20]),
            red: ColorString([232, 20, 20]),
            yellow: ColorString([232, 232, 20]),
        }
        COLOR_WIRE = {
            black: COLOR_WIRE_BORDER,
            red: ColorString([206, 63, 57]),
            blue: ColorString([77, 102, 153]),
            yellow: ColorString([245, 209, 63]),
            green: ColorString([87, 136, 97]),
            white: ColorString([230, 217, 199]),
        }
        PATTERN_STRIPED_GRAY = createStripedPattern(COLOR_BACKGROUND, "rgba(128,128,128,0.2)")

    } else {
        // Dark Theme
        COLOR_BACKGROUND = USER_COLORS.COLOR_BACKGROUND ?? ColorString(30)
        COLOR_OFF_BACKGROUND = ColorString(60)
        COLOR_BACKGROUND_INVALID = ColorString([0xA8, 0x14, 0x14])
        COLOR_BACKGROUND_UNUSED_REGION = ColorString(55)
        COLOR_BORDER = ColorString(0x55)
        COLOR_GRID_LINES = ColorString(30)
        COLOR_GRID_LINES_GUIDES = ColorString(45)
        COLOR_LABEL_OFF = ColorString(185)
        COLOR_LABEL_ON = COLOR_BACKGROUND
        COLORCOMP_COMPONENT_BORDER = 220
        COLOR_COMPONENT_INNER_LABELS = ColorString(0x8B)
        COLOR_COMPONENT_ID = ColorString([0, 0, 150])
        COLOR_GROUP_SPAN = ColorString([128, 128, 128, 0.13])
        COLOR_WIRE_BORDER = ColorString(175)
        COLOR_MOUSE_OVER_NORMAL = ColorString([0, 0x7B, 0xFF])
        COLOR_MOUSE_OVER_DANGER = ColorString([194, 34, 14])
        COLOR_NODE_MOUSE_OVER = ColorString([128, 128, 128, 0.5])
        COLORCOMPS_FULL = [255, 193, 7]
        COLOR_DARK_RED = ColorString([180, 0, 0])
        COLORCOMPS_EMPTY = [80, 89, 99]
        COLOR_UNKNOWN = ColorString([108, 106, 98])
        COLOR_HIGH_IMPEDANCE = ColorString([103, 84, 23])
        COLOR_GATE_NAMES = ColorString([95, 95, 95])
        COLOR_LED_ON = {
            green: ColorString([11, 144, 11]),
            red: ColorString([144, 11, 11]),
            yellow: ColorString([144, 144, 11]),
        }
        COLOR_WIRE = {
            black: COLOR_WIRE_BORDER,
            red: ColorString([206, 63, 57]), // TODO update these colors below
            blue: ColorString([77, 102, 153]),
            yellow: ColorString([245, 209, 63]),
            green: ColorString([87, 136, 97]),
            white: ColorString([230, 217, 199]),
        }

        PATTERN_STRIPED_GRAY = createStripedPattern(COLOR_BACKGROUND, "rgba(128,128,128,0.4)")

    }

    // same for both light and dark theme thanks to alpha
    COLOR_RECTANGLE_BACKGROUND = {
        yellow: ColorString([230, 230, 0, 0.2]),
        blue: ColorString([54, 54, 255, 0.2]),
        green: ColorString([54, 255, 54, 0.2]),
        red: ColorString([255, 54, 54, 0.2]),
        grey: ColorString([120, 120, 120, 0.2]),
        turquoise: ColorString([0, 210, 210, 0.2]),
    }
    COLOR_RECTANGLE_BORDER = {
        yellow: ColorString([196, 196, 0, 0.5]),
        blue: ColorString([115, 115, 255, 0.5]),
        green: ColorString([0, 167, 0, 0.5]),
        red: ColorString([214, 0, 0, 0.5]),
        grey: ColorString([35, 35, 35, 0.5]),
        turquoise: ColorString([0, 162, 162, 0.5]),
    }
    COLOR_COMPONENT_BORDER = ColorString(COLORCOMP_COMPONENT_BORDER)
    setColorMouseOverIsDanger(false)
    COLOR_FULL = ColorString(COLORCOMPS_FULL)
    COLOR_EMPTY = ColorString(COLORCOMPS_EMPTY)
    COLOR_FULL_ALT = ligherColor(COLOR_FULL, 40)
    COLOR_EMPTY_ALT = ligherColor(COLOR_EMPTY, 80)
    COLOR_UNKNOWN_ALT = ligherColor(COLOR_UNKNOWN, 50)
    COLOR_ANCHOR_IN = ColorString([200, 100, 100, 0.5])
    COLOR_ANCHOR_OUT = ColorString([100, 100, 200, 0.5])
    COLOR_ANCHOR_NEW = ColorString([100, 100, 100, 0.5])

    _currentModeIsDark = darkMode
}

function createStripedPattern(background: ColorString, stripeColor: string) {
    if (!InBrowser) {
        return null!
    }
    const canvas = document.createElement("canvas")
    const step = 4
    canvas.width = 2 * step
    canvas.height = 6 * step
    const g = canvas.getContext("2d")!
    g.fillStyle = background
    g.fillRect(0, 0, canvas.width, canvas.height)
    g.fillStyle = stripeColor
    g.beginPath()
    g.moveTo(step, 0)
    g.lineTo(canvas.width, 0)
    g.lineTo(0, canvas.height)
    g.lineTo(0, 3 * step)
    g.closePath()
    g.moveTo(step, canvas.height)
    g.lineTo(canvas.width, canvas.height)
    g.lineTo(canvas.width, 3 * step)
    g.closePath()
    g.fill()
    const pattern = g.createPattern(canvas, "repeat")
    if (pattern === null) {
        console.warn("Failed to create pattern")
    }
    return pattern!
}

export function setColorMouseOverIsDanger(mouseOverIsDanger: boolean) {
    COLOR_MOUSE_OVER = mouseOverIsDanger ? COLOR_MOUSE_OVER_DANGER : COLOR_MOUSE_OVER_NORMAL
}

export function ColorString(input: ColorGreyLevel | ColorComponentsRGB | ColorComponentsRGBA): ColorString {
    if (isArray(input)) {
        if (input.length === 3) {
            return `rgb(${input[0]},${input[1]},${input[2]})`
        }
        // else, rgba
        return `rgba(${input[0]},${input[1]},${input[2]},${input[3]})`
    }
    // else, grey
    return `rgb(${input},${input},${input})`
}

export function colorCompsRGB(c: ColorString): ColorComponentsRGB {
    const PREFIX = "rgb("
    if (c.startsWith(PREFIX)) {
        c = c.substring(PREFIX.length)
    }
    const SUFFIX = ")"
    if (c.endsWith(SUFFIX)) {
        c = c.substring(0, c.length - SUFFIX.length)
    }
    const comps = c.split(',').map(compStr => parseInt(compStr))
    return FixedArrayAssert(comps, 3)
}

export function ligherColor(col: string, offset: number): string {
    const components = colorCompsRGB(col)
    const newComponents = FixedArrayAssert(components.map(c => Math.min(255, c + offset)), 3)
    return ColorString(newComponents)
}

export function colorForLogicValue(value: LogicValue): ColorString {
    return isUnknown(value) ? COLOR_UNKNOWN : isHighImpedance(value) ? COLOR_HIGH_IMPEDANCE : value ? COLOR_FULL : COLOR_EMPTY
}
export function colorsForLogicValue(value: LogicValue): [ColorString, ColorString] {
    return isUnknown(value) ? [COLOR_UNKNOWN, COLOR_UNKNOWN_ALT] : isHighImpedance(value) ? [COLOR_HIGH_IMPEDANCE, COLOR_HIGH_IMPEDANCE /* not alt because High-Z is not animated*/] : value ? [COLOR_FULL, COLOR_FULL_ALT] : [COLOR_EMPTY, COLOR_EMPTY_ALT]
}

export function colorForFraction(fraction: number): ColorString {
    const c: ColorComponentsRGB = [
        (COLORCOMPS_FULL[0] - COLORCOMPS_EMPTY[0]) * fraction + COLORCOMPS_EMPTY[0],
        (COLORCOMPS_FULL[1] - COLORCOMPS_EMPTY[1]) * fraction + COLORCOMPS_EMPTY[1],
        (COLORCOMPS_FULL[2] - COLORCOMPS_EMPTY[2]) * fraction + COLORCOMPS_EMPTY[2],
    ]
    return ColorString(c)
}

export function parseColorToRGBA(col: string): FixedArray<number, 4> | undefined {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, 1, 1)
    // In order to detect invalid values,
    // we can't rely on col being in the same format as what fillStyle is computed as,
    // but we can ask it to implicitly compute a normalized value twice and compare.
    ctx.fillStyle = '#000'
    ctx.fillStyle = col
    const computed = ctx.fillStyle
    ctx.fillStyle = '#fff'
    ctx.fillStyle = col
    if (computed !== ctx.fillStyle) {
        return undefined
    }
    ctx.fillRect(0, 0, 1, 1)
    return FixedArrayAssert([...ctx.getImageData(0, 0, 1, 1).data], 4)
}



//
// FONTS
//

export const FONT_LABEL_DEFAULT = "18px sans-serif"



//
// NODE DEFINITIONS
//


export function useCompact(numNodes: number) {
    return numNodes >= 5
}

const trivialNameMatcher = /^(In|Out|in|out)\d*$/
export function isTrivialNodeName(name: string | undefined): boolean {
    return name === undefined || trivialNameMatcher.test(name)
}


//
// DRAWING
//

// Adding to current path

export function triangle(g: GraphicsRendering, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) {
    g.moveTo(x0, y0)
    g.lineTo(x1, y1)
    g.lineTo(x2, y2)
    g.closePath()
}

export function circle(g: GraphicsRendering, cx: number, cy: number, d: number) {
    const r = d / 2
    g.ellipse(cx, cy, r, r, 0, 0, 2 * Math.PI)
}

// Stroking/filling

export function strokeSingleLine(g: GraphicsRendering, x0: number, y0: number, x1: number, y1: number) {
    g.beginPath()
    g.moveTo(x0, y0)
    g.lineTo(x1, y1)
    g.stroke()
}

export function strokeBezier(g: GraphicsRendering, x0: number, y0: number, anchorX0: number, anchorY0: number, anchorX1: number, anchorY1: number, x1: number, y1: number) {
    g.beginPath()
    g.moveTo(x0, y0)
    g.bezierCurveTo(anchorX0, anchorY0, anchorX1, anchorY1, x1, y1)
    g.stroke()
}

export function shouldDrawLeadsTo(nodes: readonly Node[]): boolean {
    return nodes.map(whatToDrawForNode).some(x => x.drawLead)
}

/**
 * @returns [showWire, showTriangle]
 */
export function whatToDrawForNode(node: Node): { drawLabel: boolean, drawLead: boolean, drawTriangle: boolean, drawHiddenMark: boolean } {
    const editor = node.parent.editor
    const wires = node.connectedWires
    const connected = wires.length > 0
    if (editor.mode <= Mode.TRYOUT && !connected && !editor.options.showDisconnectedPins) {
        return { drawLabel: false, drawLead: false, drawTriangle: false, drawHiddenMark: false }
    }
    const drawHiddenMark = connected && wires.some(w => w.isHidden)
    return { drawLabel: true, drawLead: !connected || drawHiddenMark, drawTriangle: node.hasTriangle, drawHiddenMark }
}

export function shouldDrawNodeLabel(nodeOrArray: Node | readonly Node[]): boolean {
    if (isArray(nodeOrArray)) {
        return nodeOrArray.map(whatToDrawForNode).some(x => x.drawLabel)
    }
    const node = nodeOrArray as Node
    return whatToDrawForNode(node).drawLabel
}

export function drawWireLineToComponent(g: GraphicsRendering, node: Node) {
    const { drawLead, drawTriangle, drawHiddenMark } = whatToDrawForNode(node)
    const [x1, y1, x0, y0] = node.drawCoordsInParentTransform
    if (drawLead) {
        const neutral = node.parent.editor.options.hideWireColors
        drawStraightWireLine(g, x0, y0, x1, y1, node.value, node.color, neutral, undefined)
    }
    if (drawTriangle) {
        g.strokeStyle = COLOR_COMPONENT_BORDER
        g.fillStyle = COLOR_COMPONENT_BORDER
        g.beginPath()
        if (x0 === x1) {
            // vertical line
            const pointsDown = (node.isOutput() && y1 <= y0) || (!node.isOutput() && y0 <= y1)
            if (pointsDown) {
                const shift = node.isOutput() ? 1 : 0
                triangle(g,
                    x1 - 3, y1 - 2 + shift,
                    x1 + 3, y1 - 2 + shift,
                    x1, y1 + 1 + shift,
                )
            } else {
                const shift = node.isOutput() ? -3 : -4
                triangle(g,
                    x1 - 3, y1 - 2 - shift,
                    x1 + 3, y1 - 2 - shift,
                    x1, y1 - 5 - shift,
                )
            }
        } else if (y0 === y1) {
            // horizontal line
            const shift = node.isOutput() ? 1 : 0
            const pointsRight = (node.isOutput() && x1 <= x0) || (!node.isOutput() && x0 <= x1)
            if (pointsRight) {
                triangle(g,
                    x1 - 2 + shift, y1 - 3,
                    x1 - 2 + shift, y1 + 3,
                    x1 + 1 + shift, y1,
                )
            } else {
                triangle(g,
                    x1 + 2 - shift, y1 - 3,
                    x1 + 2 - shift, y1 + 3,
                    x1 - 1 - shift, y1,
                )
            }
        } else {
            console.log(`ERROR  wireLineToComponent cannot draw triangle as line is not vertical or horizontal between (${x0}, ${y0}) and (${x1}, ${y1})`)
        }
        g.lineWidth = 2
        g.fill()
        g.stroke()
    }
    if (drawHiddenMark) {
        g.lineWidth = 2
        g.strokeStyle = COLOR_WIRE[node.color]
        g.beginPath()
        if (Orientation.isVertical(node.orient)) {
            g.moveTo(x0 + 5, y0 + 1.5)
            g.lineTo(x0 - 5, y0 - 1.5)
        } else {
            g.moveTo(x0 + 1.5, y0 - 5)
            g.lineTo(x0 - 1.5, y0 + 5)
        }
        g.stroke()
    }
}

export function drawStraightWireLine(g: GraphicsRendering, x0: number, y0: number, x1: number, y1: number, value: LogicValue, color: WireColor, neutral: boolean, timeFraction: number | undefined) {
    g.beginPath()
    g.moveTo(x0, y0)
    g.lineTo(x1, y1)
    strokeWireOutlineAndSingleValue(g, value, color, neutral, timeFraction)
}


export function strokeWireOutlineAndSingleValue(g: GraphicsRendering, value: LogicValue, color: WireColor, neutral: boolean, timeFraction: number | undefined) {
    strokeWireOutline(g, color, false)
    strokeWireValue(g, value, undefined, neutral, timeFraction)
}

/**
 * Draws the outline of a wire.
 * @param isMouseOver determines whether the border color is thicker with the mouse-over color
 */
export function strokeWireOutline(g: GraphicsRendering, color: WireColor, isMouseOver: boolean) {
    const oldLineCap = g.lineCap
    g.lineCap = "butt"

    const mainStrokeWidth = WIRE_WIDTH / 2
    if (isMouseOver) {
        g.lineWidth = mainStrokeWidth + 2
        g.strokeStyle = COLOR_MOUSE_OVER
    } else {
        g.lineWidth = mainStrokeWidth
        g.strokeStyle = COLOR_WIRE[color]
    }

    g.stroke()
    g.lineCap = oldLineCap
}

/**
 * Draws the (potentially fractional, potentially animated) value on a wire.
 * @param g the graphics rendering context
 * @param value the value to draw on the line
 * @param color one of the predefined wire color palettes to use
 * @param lengthToDrawAndTotal undefined to draw the whole line, or a pair of number to draw only that many units/"pixels" and the total length
 * @param neutral overrides the default wire color with a neutral color
 * @param timeFraction undefined to show no animation within the value being propagated, or a number between 0 and 1 to show an dashed line animation
 * @param path undefined to draw the current path in the context; otherwise, the path to draw
 */
export function strokeWireValue(g: GraphicsRendering, value: LogicValue, lengthToDrawAndTotal: [number, number] | undefined, neutral: boolean, timeFraction: number | undefined) {
    const oldLineCap = g.lineCap
    g.lineCap = "butt"

    // inner value
    g.lineWidth = WIRE_WIDTH / 2 - 2
    const [baseColor, altColor] = neutral ? [COLOR_UNKNOWN, COLOR_UNKNOWN_ALT] : colorsForLogicValue(value)
    g.strokeStyle = baseColor
    const animationDashSize = 20

    if (lengthToDrawAndTotal !== undefined) {
        // draw only up to the given length, no other animation
        const [lengthToDraw, totalLength] = lengthToDrawAndTotal
        g.setLineDash([lengthToDraw, totalLength])
        g.stroke()
        g.setLineDash([])

    } else {
        // whole line

        if (timeFraction === undefined) {
            // no animation
            g.stroke()

        } else {
            // animate the line
            g.setLineDash([animationDashSize, animationDashSize])
            g.lineDashOffset = -timeFraction * animationDashSize * 2
            g.stroke()

            g.strokeStyle = altColor
            g.lineDashOffset += animationDashSize
            g.stroke()

            g.lineDashOffset = 0
            g.setLineDash([])
        }
    }

    g.lineCap = oldLineCap
}

export function isOverWaypoint(x: number, y: number, waypointX: number, waypointY: number): boolean {
    return distSquared(x, y, waypointX, waypointY) < (WAYPOINT_HIT_RANGE / 2) ** 2
}

export enum NodeStyle {
    IN_CONNECTED,
    IN_DISCONNECTED,
    OUT_CONNECTED,
    OUT_DISCONNECTED,
    IN_OUT,
    WAYPOINT,
}

export function drawWaypoint(g: GraphicsRendering, ctx: DrawContext, x: number, y: number, style: NodeStyle, value: LogicValue, isMouseOver: boolean, neutral: boolean, showForced: boolean, showForcedWarning: boolean, parentOrientIsVertical: boolean) {

    const [circleColor, thickness] =
        showForced
            ? [COLOR_DARK_RED, 3] // show forced nodes with red border if not in teacher mode
            : [COLOR_WIRE_BORDER, 1]   // show normally

    g.strokeStyle = circleColor
    g.lineWidth = thickness
    g.fillStyle = style === NodeStyle.IN_DISCONNECTED ? COLOR_BACKGROUND : (neutral ? COLOR_UNKNOWN : colorForLogicValue(value))

    g.beginPath()
    circle(g, x, y, WAYPOINT_DIAMETER)
    g.fill()
    g.stroke()

    if (isMouseOver) {
        g.fillStyle = COLOR_NODE_MOUSE_OVER
        g.beginPath()
        circle(g, x, y, WAYPOINT_DIAMETER * 2)
        g.fill()
        g.stroke()
    }

    if (showForcedWarning) {
        // forced value to something that is contrary to normal output
        g.textAlign = "center"
        g.fillStyle = circleColor
        g.font = "bold 14px sans-serif"

        ctx.inNonTransformedFrame(ctx => {
            g.fillText("!!", ...ctx.rotatePoint(
                x + (parentOrientIsVertical ? 13 : 0),
                y + (parentOrientIsVertical ? 0 : -13),
            ))
        })
    }
}

export function drawClockInput(g: GraphicsRendering, left: number, clockNode: Node, trigger: EdgeTrigger) {
    const clockY = clockNode.posYInParentTransform
    g.strokeStyle = COLOR_COMPONENT_BORDER
    g.lineWidth = 2

    g.beginPath()
    g.moveTo(left + 1, clockY - 4)
    g.lineTo(left + 9, clockY)
    g.lineTo(left + 1, clockY + 4)
    g.stroke()
    if (trigger === EdgeTrigger.falling) {
        g.fillStyle = COLOR_COMPONENT_BORDER
        g.closePath()
        g.fill()
    }

    drawWireLineToComponent(g, clockNode)
}


export function drawLabel(ctx: DrawContextExt, compOrient: Orientation, text: string | undefined, anchor: Orientation | undefined, x: number, y: Node | ReadonlyGroupedNodeArray<Node>): void
export function drawLabel(ctx: DrawContextExt, compOrient: Orientation, text: string | undefined, anchor: Orientation | undefined, x: Node | ReadonlyGroupedNodeArray<Node>, y: number): void
export function drawLabel(ctx: DrawContextExt, compOrient: Orientation, text: string | undefined, anchor: Orientation | undefined, x: number, y: number, referenceNode: Node | ReadonlyGroupedNodeArray<Node> | undefined): void

export function drawLabel(ctx: DrawContextExt, compOrient: Orientation, text: string | undefined, anchor: Orientation | undefined, x: number | Node | ReadonlyGroupedNodeArray<Node>, y: number | Node | ReadonlyGroupedNodeArray<Node>, referenceNode?: Node | ReadonlyGroupedNodeArray<Node>) {
    if (text === undefined) {
        return
    }

    if (referenceNode === undefined) {
        if (!isNumber(x)) {
            referenceNode = x
        } else if (!isNumber(y)) {
            referenceNode = y
        }
    }

    let showLabel = true
    if (referenceNode !== undefined) {
        showLabel = shouldDrawNodeLabel(referenceNode)
    }
    if (!showLabel) {
        return
    }

    const [halign, valign, dx, dy] = (() => {
        if (anchor === undefined) {
            return ["center", "middle", 0, 0] as const
        }
        const rotatedAnchor = Orientation.add(compOrient, anchor)
        switch (rotatedAnchor) {
            case "e": return ["right", "middle", -3, 0] as const
            case "w": return ["left", "middle", 3, 0] as const
            case "n": return ["center", "top", 0, 2] as const
            case "s": return ["center", "bottom", 0, -2] as const
        }
    })()

    const xx = isNumber(x) ? x :
        (isNodeArray(x) ? x.group : x).posXInParentTransform
    const yy = isNumber(y) ? y :
        (isNodeArray(y) ? y.group : y).posYInParentTransform
    const [finalX, finalY] = ctx.rotatePoint(xx, yy)

    // we assume a color and a font have been set before this function is called
    const g = ctx.g
    g.textAlign = halign
    g.textBaseline = valign
    g.fillText(text, finalX + dx, finalY + dy)
}

export function drawValueTextCentered(g: GraphicsRendering, value: LogicValue, comp: HasPosition, opts?: { fillStyle?: string, small?: boolean }) {
    drawValueText(g, value, comp.posX, comp.posY, opts)
}

export function drawValueText(g: GraphicsRendering, value: LogicValue, x: number, y: number, opts?: { fillStyle?: string, small?: boolean }) {
    g.textAlign = "center"
    g.textBaseline = "middle"

    let spec = ""
    let label = ""

    const small = opts?.small ?? false
    const fillStyle = opts?.fillStyle

    const sizeStrBig = small ? "12" : "18"
    const sizeStrSmall = small ? "10" : "16"

    if (isUnknown(value)) {
        g.fillStyle = fillStyle ?? COLOR_LABEL_OFF
        spec = "bold " + sizeStrBig
        label = '?'
    } else if (isHighImpedance(value)) {
        g.fillStyle = fillStyle ?? COLOR_LABEL_OFF
        spec = sizeStrSmall
        label = 'Z'
    } else if (value) {
        g.fillStyle = fillStyle ?? COLOR_LABEL_ON
        spec = "bold " + sizeStrBig
        label = '1'
    } else {
        g.fillStyle = fillStyle ?? COLOR_LABEL_OFF
        spec = sizeStrBig
        label = '0'
    }
    g.font = `${spec}px sans-serif`
    g.fillText(label, x, y)
}


//
// MISC
//

export const INPUT_OUTPUT_DIAMETER = 26

const NAME_POSITION_SETTINGS = {
    right: ["start", "middle", 7],
    left: ["end", "middle", 9],
    top: ["center", "bottom", 5],
    bottom: ["center", "top", 5],
} as const

function textSettingsForName(onRight: boolean, orient: Orientation) {
    if (onRight) {
        switch (orient) {
            case "e": return NAME_POSITION_SETTINGS.right
            case "w": return NAME_POSITION_SETTINGS.left
            case "n": return NAME_POSITION_SETTINGS.top
            case "s": return NAME_POSITION_SETTINGS.bottom
        }
    } else {
        switch (orient) {
            case "e": return NAME_POSITION_SETTINGS.left
            case "w": return NAME_POSITION_SETTINGS.right
            case "n": return NAME_POSITION_SETTINGS.bottom
            case "s": return NAME_POSITION_SETTINGS.top
        }
    }
}

export function drawComponentName(g: GraphicsRendering, ctx: DrawContextExt, name: ComponentName, value: string | number, comp: Component, onRight: boolean) {
    if (name === undefined) {
        return
    }

    let displayName
    if (isString(name)) {
        displayName = name
    } else {
        // dynamic name
        if (value in name) {
            displayName = `${name[value]}`
        } else if ("default" in name) {
            displayName = `${name.default}`
        } else if (isUnknown(value)) {
            displayName = Unknown
        } else {
            displayName = undefined
        }
    }

    if (displayName === undefined) {
        return
    }

    const [hAlign, vAlign, deltaX] = textSettingsForName(onRight, comp.orient)
    g.textAlign = hAlign
    g.textBaseline = vAlign
    g.font = "italic 18px sans-serif"
    g.fillStyle = COLOR_COMPONENT_BORDER
    const point = ctx.rotatePoint(comp.posX + (onRight ? 1 : -1) * (comp.unrotatedWidth / 2 + deltaX), comp.posY)
    g.fillText(displayName, ...point)
    g.textBaseline = "middle" // restore
}

export function drawAnchorsAroundComponent(g: GraphicsRendering, comp: DrawableWithPosition, includeTo: boolean) {
    const anchor = comp.anchor
    if (anchor !== undefined) {
        const color = includeTo ? COLOR_ANCHOR_IN : COLOR_ANCHOR_NEW
        drawAnchorTo(g, comp.posX, comp.posY, anchor.posX, anchor.posY, [anchor.width, anchor.height], color, undefined)
    }
    if (includeTo) {
        drawAllTo(comp)
    }

    function drawAllTo(drawable: DrawableWithPosition) {
        if (!(drawable instanceof ComponentBase)) {
            return
        }

        for (const anchoredComp of drawable.anchoredDrawables) {
            if (anchoredComp instanceof Waypoint) {
                continue
            }
            drawAnchorTo(g, anchoredComp.posX, anchoredComp.posY, drawable.posX, drawable.posY, [drawable.width, drawable.height], COLOR_ANCHOR_OUT, comp)
            drawAllTo(anchoredComp)
        }
    }
}

export function adjustLineEndpoint(
    x1: number, y1: number,
    x2: number, y2: number,
    w: number, h: number
): [number, number] {
    // Half dimensions of the square
    const halfW = w / 2
    const halfH = h / 2

    // Line direction
    const dx = x2 - x1
    const dy = y2 - y1

    // Calculate t for intersections
    const tValues: number[] = []

    // Left edge (x = x2 - halfW)
    if (dx !== 0) {
        const tLeft = (x2 - halfW - x1) / dx
        const yAtLeft = y1 + tLeft * dy
        if (tLeft >= 0 && tLeft <= 1 && yAtLeft >= y2 - halfH && yAtLeft <= y2 + halfH) {
            tValues.push(tLeft)
        }
    }

    // Right edge (x = x2 + halfW)
    if (dx !== 0) {
        const tRight = (x2 + halfW - x1) / dx
        const yAtRight = y1 + tRight * dy
        if (tRight >= 0 && tRight <= 1 && yAtRight >= y2 - halfH && yAtRight <= y2 + halfH) {
            tValues.push(tRight)
        }
    }

    // Top edge (y = y2 - halfH)
    if (dy !== 0) {
        const tTop = (y2 - halfH - y1) / dy
        const xAtTop = x1 + tTop * dx
        if (tTop >= 0 && tTop <= 1 && xAtTop >= x2 - halfW && xAtTop <= x2 + halfW) {
            tValues.push(tTop)
        }
    }

    // Bottom edge (y = y2 + halfH)
    if (dy !== 0) {
        const tBottom = (y2 + halfH - y1) / dy
        const xAtBottom = x1 + tBottom * dx
        if (tBottom >= 0 && tBottom <= 1 && xAtBottom >= x2 - halfW && xAtBottom <= x2 + halfW) {
            tValues.push(tBottom)
        }
    }

    // Find the smallest t value
    const t = Math.min(...tValues)

    // Adjusted endpoint
    const adjustedX = x1 + t * dx
    const adjustedY = y1 + t * dy

    return [adjustedX, adjustedY]
}

export function drawAnchorTo(g: GraphicsRendering, sX: number, sY: number, tX: number, tY: number, distOrDim: number | [number, number], color: string, whileDraggingComp: DrawableWithPosition | undefined) {
    // This is the arrowhead and the names of the points, and the dir and perp vectors:
    //               at
    //               +                 perp
    //      st     mt|\                ^
    //      +--------+ \               |
    // +s   |           +th   +t         --> dir
    //      +--------+ /
    //      sb     mb|/
    //               + 
    //               ab

    const ds = 0 // distance from s to the projection of st or sb
    const wl = 3 // width of the line, distance from st to sb
    const wh = 8 // width of the arrowhead, distance from mt to at or mb to ab
    const h = 20 // height of the arrowhead, distance from th to the projection of mt or mb
    const [dt, [tWidth, tHeight]] = isNumber(distOrDim) ? [distOrDim, [0, 0]] : [10, distOrDim] // TODO use width/height of the component

    // if the start is within the target (e.g., we're dragging a group and the anchor is the group's center),
    // do nothing, because it's visually clear that they should move together
    if (Math.abs(sX - tX) < tWidth / 2 && Math.abs(sY - tY) < tHeight / 2) {
        return
    }

    // if the start is within the target's exclusion box, do nothing
    if (whileDraggingComp !== undefined) {
        const c = whileDraggingComp
        if (sX >= c.posX - c.width / 2 && sX <= c.posX + c.width / 2 &&
            sY >= c.posY - c.height / 2 && sY <= c.posY + c.height / 2) {
            return
        }
    }

    // direction vector
    let dirX = tX - sX
    let dirY = tY - sY
    const magn = Math.sqrt(dirX * dirX + dirY * dirY)
    if (magn < 20) {
        // too short to draw
        return
    }
    dirX /= magn
    dirY /= magn

    // perpendicular vector
    const perpX = -dirY
    const perpY = dirX

    sX += ds * dirX
    sY += ds * dirY
    const st = [sX + wl * perpX, sY + wl * perpY]
    const sb = [sX - wl * perpX, sY - wl * perpY]

    tX -= dt * dirX
    tY -= dt * dirY
    const th = [tX, tY]

    tX -= h * dirX
    tY -= h * dirY
    const mt = [tX + wl * perpX, tY + wl * perpY]
    const at = [tX + wh * perpX, tY + wh * perpY]
    const mb = [tX - wl * perpX, tY - wl * perpY]
    const ab = [tX - wh * perpX, tY - wh * perpY]

    // fill this polygon
    g.fillStyle = color
    g.beginPath()
    g.moveTo(st[0], st[1])
    g.lineTo(mt[0], mt[1])
    g.lineTo(at[0], at[1])
    g.lineTo(th[0], th[1])
    g.lineTo(ab[0], ab[1])
    g.lineTo(mb[0], mb[1])
    g.lineTo(sb[0], sb[1])
    g.closePath()
    g.fill()
}

// Bézier utils

export type LineCoords = readonly [
    /* 0 */ startX: number,
    /* 1 */ startY: number,
    /* 2 */ endX: number,
    /* 3 */ endY: number,
]

/**
 * Note that the control points are at the end such that the second pair of coordinates is the end of the curve, just like for LineCoords.
 */
export type BezierCoordsInit = readonly [
    /* 0 */ startX: number,
    /* 1 */ startY: number,
    /* 2 */ endX: number,
    /* 3 */ endY: number,
    /* 4 */ control1X: number,
    /* 5 */ control1Y: number,
    /* 6 */ control2X: number,
    /* 7 */ control2Y: number,
]

export type BezierCoordsMeta = {
    boundingBox: [left: number, top: number, right: number, bottom: number],
    tStepSize: number,
}

export type BezierCoords = readonly [...BezierCoordsInit, meta: BezierCoordsMeta]


export function bezierPoint(t: number, coords: BezierCoordsInit | BezierCoords): [number, number] {
    const u = 1 - t
    const f1 = u ** 3
    const f2 = 3 * u ** 2 * t
    const f3 = 3 * u * t ** 2
    const f4 = t ** 3
    const x = f1 * coords[0] + f2 * coords[4] + f3 * coords[6] + f4 * coords[2]
    const y = f1 * coords[1] + f2 * coords[5] + f3 * coords[7] + f4 * coords[3]
    return [x, y]
}

/**
 * Find the t values for the X or Y extrema of a cubic Bézier curve in one dimension
 * @param forY false for x, true for y
 * @returns the t values for the extrema
 */
function bezierExtrema(coords: BezierCoordsInit, forY: boolean): number[] {
    const di = Number(forY)
    const start = coords[0 + di] as number
    const end = coords[2 + di] as number
    const c1 = coords[4 + di] as number
    const c2 = coords[6 + di] as number

    // a, b, c factors of the quadradic equation that is given by setting
    // the derivative of the bezier curve to zero (for x or y)
    const a = -3 * start + 9 * c1 - 9 * c2 + 3 * end
    const b = 6 * start - 12 * c1 + 6 * c2
    const c = -3 * start + 3 * c1

    const roots: number[] = []
    let r
    if (Math.abs(a) < 1e-6) {
        // Quadratic or linear case
        if (Math.abs(b) > 1e-6 && (r = -c / b) > 0 && r < 1) {
            roots.push(r)
        }
    } else {
        // Solve quadratic equation: at^2 + bt + c = 0
        const discriminant = b ** 2 - 4 * a * c
        if (discriminant >= 0) {
            const sqrtD = Math.sqrt(discriminant)
            r = (-b - sqrtD) / (2 * a)
            if (r > 0 && r < 1) {
                roots.push(r)
            }
            r = (-b + sqrtD) / (2 * a)
            if (r > 0 && r < 1) {
                roots.push(r)
            }
        }
    }

    return roots
}

function bezierBoundingBox(coords: BezierCoordsInit, margin: number): [left: number, top: number, right: number, bottom: number] {
    const xExtrema = bezierExtrema(coords, false)
    const yExtrema = bezierExtrema(coords, true)

    const ts = [0, 1, ...xExtrema, ...yExtrema]

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity

    for (const t of ts) {
        const [x, y] = bezierPoint(t, coords)
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
    }

    return [minX - margin, minY - margin, maxX + margin, maxY + margin]
}

export function isPointOnStraightWire(x: number, y: number, coords: LineCoords): boolean {
    const [x1, y1, x2, y2] = coords
    const length2 = (x2 - x1) ** 2 + (y2 - y1) ** 2

    // if the segment length is zero, check if the point matches the start
    if (length2 === 0) {
        return x === x1 && y === y1
    }

    // projection of the point onto the segment (t parameter, 0 <= t <= 1)
    const t = ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / length2
    if (t < 0 || t > 1) {
        return false
    }

    // closest point on the segment to the given point
    const closestX = x1 + t * (x2 - x1)
    const closestY = y1 + t * (y2 - y1)
    const dist2 = (x - closestX) ** 2 + (y - closestY) ** 2
    return dist2 <= WIRE_WIDTH_HALF_SQUARED
}

export function makeBezierCoords(coords: BezierCoordsInit): BezierCoords {
    const [startX, startY, endX, endY] = coords
    const endpointDist = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2)
    const numPoints = Math.max(3, Math.ceil(endpointDist / WIRE_WIDTH * 1.25))
    const tStepSize = 1 / numPoints
    const boundingBox = bezierBoundingBox(coords, WIRE_WIDTH / 2)
    const bezierMEta = { tStepSize, boundingBox }
    return [...coords, bezierMEta]
}

export function isPointOnBezierWire(x: number, y: number, coords: BezierCoords): boolean {
    const bezierMeta = coords[8]

    // fast reject outside bounding box
    const [left, top, right, bottom] = bezierMeta.boundingBox
    if (x < left || x > right || y < top || y > bottom) {
        return false
    }
    
    // sample a series of points on the curve and check if the point is close to any of them
    const stepSize = bezierMeta.tStepSize
    for (let t = 0; t <= 1; t += stepSize) {
        const [wx, wy] = bezierPoint(t, coords)
        const dist2 = (wx - x) ** 2 + (wy - y) ** 2
        if (dist2 <= WIRE_WIDTH_HALF_SQUARED) {
            return true
        }
    }
    return false
}

//
// DATA CONVERSIONS FOR DISPLAY PURPOSES
//

export function displayValuesFromArray(values: readonly LogicValue[], mostSignificantFirst: boolean): [binaryStringRep: string, value: number | Unknown] {
    // lowest significant bit is the first bit
    let binaryStringRep = ""
    let hasUnset = false
    const add: (v: any) => void = mostSignificantFirst
        ? v => binaryStringRep = binaryStringRep + v
        : v => binaryStringRep = v + binaryStringRep

    for (const value of values) {
        if (isUnknown(value) || isHighImpedance(value)) {
            hasUnset = true
            add(value)
        } else {
            add(+value)
        }
    }
    const value = hasUnset ? Unknown : parseInt(binaryStringRep, 2)
    return [binaryStringRep, value]
}

export function formatWithRadix(value: number | Unknown, radix: number, numBits: number, withPrefix = true): string {
    if (isUnknown(value)) {
        return Unknown
    }

    if (radix === -10) {
        // signed int
        const asBinStr = (value >>> 0).toString(2).padStart(numBits, '0')
        if (asBinStr[0] === '1') {
            // negative
            const rest = parseInt(asBinStr.substring(1), 2)
            // swap hyphen for minus sign as en-dash
            return '–' + String(-(-Math.pow(2, numBits - 1) + rest))
        } else {
            return String(value)
        }
    } else {
        const padWidth = radix === 10 ? 1 : Math.ceil(Math.log(Math.pow(2, numBits)) / Math.log(radix))
        const caption = value.toString(radix).toUpperCase().padStart(padWidth, '0')
        const prefix = !withPrefix ? "" : (() => {
            switch (radix) {
                case 16: return "0x"
                case 8: return "0o"
                case 2: return "0b"
                default: return ""
            }
        })()
        return prefix + caption
    }
}