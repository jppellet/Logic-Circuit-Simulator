/**
 * This is a TypeScript port of canvas2svg a.k.a svgcanvas
 *
 * Original by https://github.com/gliffy/canvas2svg
 * Updated by https://github.com/zenozeng/svgcanvas
 * Improved by https://github.com/aha-app/svgcanvas
 *
 *  Licensed under the MIT license:
 *  http://www.opensource.org/licenses/mit-license.php
 */

import { isString } from "./utils"

export type ContextOptions = {
    width: number
    height: number
    enableMirroring: boolean
    document: Document
    ctx: CanvasRenderingContext2D
    metadata: string | undefined
}

export class SVGRenderingContext {

    // basic properties
    public readonly width: number
    public readonly height: number
    public readonly enableMirroring: boolean
    public readonly canvas: SVGRenderingContext

    // mirrored canvas properties
    public strokeStyle: string = "#000000"
    public fillStyle: string = "#000000"
    public lineCap: string = "butt"
    public lineJoin: string = "miter"
    public miterLimit: number = 10
    public lineWidth: number = 1
    public globalAlpha: number = 1
    public font: string = "10px sans-serif"
    public shadowColor: string = "#000000"
    public shadowOffsetX: number = 0
    public shadowOffsetY: number = 0
    public shadowBlur: number = 0
    public textAlign: string = "start"
    public textBaseline: string = "alphabetic"
    public lineDash: string | null = null
    public lineDashOffset: number = 0
    // extra
    public fontUnderline: string = ""
    public fontHref: string | undefined

    // internal properties
    private readonly _document: Document
    private readonly _helperCanvas: HTMLCanvasElement | undefined
    private readonly _g: CanvasRenderingContext2D
    private readonly _svg: SVGSVGElement
    private readonly _defs: SVGDefsElement
    private readonly _styleStack: Record<string, string>[]
    private readonly _groupStack: SVGElement[] = []
    private readonly _ids: Record<string, unknown>
    private readonly _transformMatrixStack: DOMMatrix[] = []
    // current state
    private _currentElement: SVGElement
    private _currentPath: Path2DSVG = new Path2DSVG(this)
    public _transformMatrix: DOMMatrix = new DOMMatrix()

    public constructor(options?: Partial<ContextOptions>)
    public constructor(width: number, height: number)

    public constructor(optionsOrWidth?: Partial<ContextOptions> | number, height?: number) {

        // keep support for this way of calling Context: new Context(width, height)
        let options: Partial<ContextOptions>
        if (height !== undefined) {
            options = { width: optionsOrWidth as number, height }
        } else if (optionsOrWidth !== undefined) {
            options = optionsOrWidth as Partial<ContextOptions>
        } else {
            options = {}
        }

        // setup options
        this.width = options.width ?? 500
        this.height = options.height ?? 500
        this.enableMirroring = options.enableMirroring ?? false

        this.canvas = this   // point back to this instance!
        this._document = options.document ?? document

        // allow passing in an existing context to wrap around
        // if a context is passed in, we know a canvas already exist
        if (options.ctx) {
            this._g = options.ctx
        } else {
            this._helperCanvas = this._document.createElement("canvas")
            this._g = this._helperCanvas.getContext("2d")!
        }

        this._styleStack = [this._getStyleState()]

        // the root svg element
        this._svg = this._document.createElementNS("http://www.w3.org/2000/svg", "svg")
        this._svg.setAttribute("version", "1.1")
        this._svg.setAttribute("xmlns", "http://www.w3.org/2000/svg")
        this._svg.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:xlink", "http://www.w3.org/1999/xlink")
        this._svg.setAttribute("width", String(this.width))
        this._svg.setAttribute("height", String(this.height))

        // make sure we don't generate the same ids in defs
        this._ids = {}

        if (options.metadata !== undefined) {
            const metadata = this._document.createElementNS("http://www.w3.org/2000/svg", "metadata")
            const textNode = this._document.createTextNode(options.metadata)
            metadata.appendChild(textNode)
            this._svg.appendChild(metadata)
        }

        // defs tag
        this._defs = this._document.createElementNS("http://www.w3.org/2000/svg", "defs")
        this._svg.appendChild(this._defs)

        // also add a group child. the svg element can't use the transform attribute
        this._currentElement = this._document.createElementNS("http://www.w3.org/2000/svg", "g")
        this._svg.appendChild(this._currentElement)

        // init transformation matrix
        this.resetTransform()
    }


    /// PRIVATE HELPERS

    public _createElement<K extends keyof SVGElementTagNameMap>(elementName: K, properties?: Record<string, string | number>, resetFill = false): SVGElementTagNameMap[K] {
        const element = this._document.createElementNS("http://www.w3.org/2000/svg", elementName)
        if (resetFill) {
            // if fill or stroke is not specified, the svg element should not display. By default SVG's fill is black.
            element.setAttribute("fill", "none")
            element.setAttribute("stroke", "none")
        }
        if (properties !== undefined) {
            for (const [key, value] of Object.entries(properties)) {
                element.setAttribute(key, String(value))
            }
        }
        return element
    }

    /**
     * Will return the closest group or svg node. May return the current element.
     */
    private _closestGroupOrSvg(node?: SVGElement | null): SVGElement {
        node = node ?? this._currentElement
        if (node.nodeName === "g" || node.nodeName === "svg") {
            return node
        } else {
            return this._closestGroupOrSvg(node.parentNode as SVGElement | null)
        }
    }

    /**
     * Applies styles on restore
     */
    private _applyStyleState(styleState: Record<string, string>) {
        for (const [key, value] of Object.entries(styleState)) {
            (this as any)[key] = value
        }
    }

    /**
     * Gets the current style state
     */
    private _getStyleState() {
        const styleState: Record<string, string> = {}
        for (const key of Object.keys(STYLES)) {
            styleState[key] = (this as any)[key]
        }
        return styleState
    }

    private _applyTransformation(element: SVGElement, matrix?: DOMMatrix) {
        // See https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/transform
        const { a, b, c, d, e, f } = matrix ?? this.getTransform()
        if (a === 1 && b === 0 && c === 0 && d === 1 && e === 0 && f === 0) {
            // if is identity, do nothing
            return
        }
        element.setAttribute('transform', `matrix(${a} ${b} ${c} ${d} ${e} ${f})`)
    }

    /**
     * Apples the current styles to the current SVG element. On "ctx.fill" or "ctx.stroke"
     */
    private _applyStyleToElement(elem: SVGElement, type: "fill" | "stroke") {
        for (const [key, style] of Object.entries(STYLES)) {
            let value = (this as any)[key]
            if ("apply" in style && style.apply) {
                // is this a gradient or pattern?
                if (value instanceof CanvasPatternSVG) {
                    // copy over defs
                    for (const node of value._ctx._defs.children) {
                        const id = node.getAttribute("id")!
                        this._ids[id] = id
                        this._defs.appendChild(node)
                    }
                    elem.setAttribute(style.apply, `url(#${value.patternElem.getAttribute("id")})`)
                }
                else if (value instanceof CanvasGradientSVG) {
                    // gradient
                    elem.setAttribute(style.apply, `url(#${value.gradientElem.getAttribute("id")})`)
                } else if (style.apply.indexOf(type) !== -1 && style.svg !== value) {
                    if ((style.svgAttr === "stroke" || style.svgAttr === "fill") && value.indexOf("rgba") !== -1) {
                        // separate alpha value, since illustrator can't handle it
                        const regex = /rgba\(\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\s*,\s*(\d?\.?\d*)\s*\)/gi
                        const matches = regex.exec(value)!
                        elem.setAttribute(style.svgAttr, `rgb(${matches[1]},${matches[2]},${matches[3]})`)
                        // should take globalAlpha here
                        const opacity = parseFloat(matches[4]) * this.globalAlpha
                        elem.setAttribute(style.svgAttr + "-opacity", String(opacity))
                    } else {
                        let attr = style.svgAttr
                        if (key === 'globalAlpha') {
                            attr = type + '-' + style.svgAttr
                            if (elem.getAttribute(attr) !== null) {
                                // fill-opacity or stroke-opacity has already been set by stroke or fill.
                                continue
                            }
                        } else if (key === 'lineWidth') {
                            const scale = this._getTransformScale()
                            value = value * Math.max(scale.x, scale.y)
                        }
                        // otherwise only update attribute if right type, and not svg default
                        elem.setAttribute(attr, value)
                    }
                }
            }
        }
    }


    /// SVG ACCESS

    /**
     * Returns the serialized value of the svg so far
     * @param fixNamedEntities - Standalone SVG doesn't support named entities, which document.createTextNode encodes. If true, we attempt to find all named entities and encode it as a numeric entity.
     * @return serialized svg
     */
    public getSerializedSvg(fixNamedEntities = false): string {
        let serialized = new XMLSerializer().serializeToString(this._svg)

        // IE search for a duplicate xmnls because they didn't implement setAttributeNS correctly
        const xmlns = /xmlns="http:\/\/www\.w3\.org\/2000\/svg".+xmlns="http:\/\/www\.w3\.org\/2000\/svg/gi
        if (xmlns.test(serialized)) {
            serialized = serialized.replace('xmlns="http://www.w3.org/2000/svg', 'xmlns:xlink="http://www.w3.org/1999/xlink')
        }

        if (fixNamedEntities) {
            for (const [key, value] of Object.entries(namedEntities)) {
                const regexp = new RegExp(key, "gi")
                if (regexp.test(serialized)) {
                    serialized = serialized.replace(regexp, value)
                }
            }
        }

        return serialized
    }

    public getSvg(): SVGSVGElement {
        return this._svg
    }


    /// CONTEXT SAVE/RESTORE and GROUPS

    public beginGroup(className: string | undefined) {
        const group = this._createElement("g")
        if (className !== undefined) {
            group.setAttribute("class", className)
        }
        const parent = this._closestGroupOrSvg()
        this._groupStack.push(parent)
        parent.appendChild(group)
        this._currentElement = group
    }

    public endGroup() {
        this._currentElement = this._groupStack.pop() ?? this._svg.children[1] as SVGElement
    }

    /**
     * Saves the current state by creating a group tag
     */
    public save() {
        this.beginGroup(undefined)
        this._styleStack.push(this._getStyleState())
        this._transformMatrixStack.push(this.getTransform())
    }

    /**
     * Sets current element to parent
     */
    public restore() {
        this.endGroup()
        this._applyStyleState(this._styleStack.pop()!)
        this.setTransform(this._transformMatrixStack.pop()!)
    }


    /// PATH API

    private _createPathElement(): SVGPathElement {
        const path = this._createElement("path", {}, true)
        const parent = this._closestGroupOrSvg()
        parent.appendChild(path)
        return path
    }

    public beginPath() {
        // https://html.spec.whatwg.org/multipage/scripting.html#current-default-path
        this._currentPath = new Path2DSVG(this)
    }

    public closePath() {
        this._currentPath.closePath()
    }

    public moveTo(x: number, y: number) {
        this._currentPath.moveTo(x, y)
    }

    public lineTo(x: number, y: number) {
        this._currentPath.lineTo(x, y)
    }

    public rect(x: number, y: number, width: number, height: number) {
        this._currentPath.rect(x, y, width, height)
    }

    public bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {
        this._currentPath.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y)
    }

    public quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {
        this._currentPath.quadraticCurveTo(cpx, cpy, x, y)
    }

    public arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterClockwise: boolean = false) {
        this._currentPath.arc(x, y, radius, startAngle, endAngle, counterClockwise)
    }

    public arcTo(x1: number, y1: number, x2: number, y2: number, radius: number) {
        this._currentPath.arcTo(x1, y1, x2, y2, radius)
    }

    public ellipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, counterClockwise = false) {
        this._currentPath.ellipse(x, y, radiusX, radiusY, rotation, startAngle, endAngle, counterClockwise)
    }


    /// STROKE/FILL

    public stroke(path2d?: Path2D) {
        this._strokeOrFill("stroke", path2d)
    }

    public fill(path2d?: Path2D) {
        this._strokeOrFill("fill", path2d)
    }

    private _strokeOrFill(action: "stroke" | "fill", path2d?: Path2D) {
        let path: Path2DSVG

        if (path2d) {
            if (!(path2d instanceof Path2DSVG)) {
                throw new Error("Path2D is not a Path2DSVG")
            }
            path = path2d
        } else {
            path = this._currentPath
        }

        const pathElement = this._createPathElement()
        this._applyStyleToElement(pathElement, action)
        pathElement.setAttribute("paint-order", "fill stroke markers")
        pathElement.setAttribute("d", path.d)
        // if (path2d) {
        //     this._applyTransformation(pathElement)
        // }
    }

    public fillRect(x: number, y: number, width: number, height: number) {
        const { a, b, c, d, e, f } = this.getTransform()
        if (a === 1 && b === 0 && c === 0 && d === 1 && e === 0 && f === 0) {
            // clear entire canvas
            if (x === 0 && y === 0 && width === this.width && height === this.height) {
                this._clearCanvas()
            }
        }
        const rect = this._createElement("rect", {
            x: x,
            y: y,
            width: width,
            height: height,
        }, true)
        const parent = this._closestGroupOrSvg()
        parent.appendChild(rect)
        this._currentElement = rect
        this._applyTransformation(rect)
        this._applyStyleToElement(this._currentElement, "fill")
    }

    public strokeRect(x: number, y: number, width: number, height: number) {
        const rect = this._createElement("rect", {
            x: x,
            y: y,
            width: width,
            height: height,
        }, true)
        const parent = this._closestGroupOrSvg()
        parent.appendChild(rect)
        this._currentElement = rect
        this._applyTransformation(rect)
        this._applyStyleToElement(this._currentElement, "stroke")
    }

    /**
     * Clear the entire canvas by replacing the root group
     */
    private _clearCanvas() {
        const rootGroup = this._svg.children[1]
        this._svg.removeChild(rootGroup)
        this._currentElement = this._document.createElementNS("http://www.w3.org/2000/svg", "g")
        this._svg.appendChild(this._currentElement)
        // reset groupStack as all the child group nodes are all removed.
        this._groupStack.length = 0
    }

    /**
     * "Clears" a canvas by just drawing a white rectangle in the current group.
     */
    public clearRect(x: number, y: number, width: number, height: number) {
        const { a, b, c, d, e, f } = this.getTransform()
        if (a === 1 && b === 0 && c === 0 && d === 1 && e === 0 && f === 0 && x === 0 && y === 0 && width === this.width && height === this.height) {
            this._clearCanvas()
            return
        }
        const parent = this._closestGroupOrSvg()
        const rect = this._createElement("rect", {
            x: x,
            y: y,
            width: width,
            height: height,
            fill: "#FFFFFF",
        }, true)
        this._applyTransformation(rect)
        parent.appendChild(rect)
    }

    public setLineDash(dashArray?: number[]) {
        if (dashArray && dashArray.length > 0) {
            this.lineDash = dashArray.join(",")
        } else {
            this.lineDash = null
        }
    }

    public getLineDash(): number[] {
        if (this.lineDash === null) {
            return []
        }
        return this.lineDash.split(",").map(s => parseFloat(s))
    }

    public clip(fillRule?: string) {
        const group = this._closestGroupOrSvg()
        const clipPath = this._createElement("clipPath")
        const id = randomString(this._ids)

        const pathElement = this._createPathElement()
        pathElement.setAttribute("d", this._currentPath.d)
        // this._applyTransformation(pathElement);

        clipPath.setAttribute("id", id)

        if (fillRule !== undefined) {
            clipPath.setAttribute("clip-rule", fillRule)
        }

        clipPath.appendChild(pathElement)

        this._defs.appendChild(clipPath)

        // set the clip path to this group
        group.setAttribute("clip-path", `url(#${id})`)

        this._currentElement = group
    }

    /**
     * Draws a canvas, image or mock context to this canvas.
     * http://www.whatwg.org/specs/web-apps/current-work/multipage/the-canvas-element.html#dom-context-2d-drawimage
     */
    public drawImage() {
        // convert arguments to a real array
        // eslint-disable-next-line prefer-rest-params
        const args = Array.prototype.slice.call(arguments)
        let image: any = args[0]
        let dx: number, dy: number, dw: number, dh: number, sx = 0, sy = 0, sw: number, sh: number

        if (args.length === 3) {
            dx = args[1]
            dy = args[2]
            sw = image.width
            sh = image.height
            dw = sw
            dh = sh
        } else if (args.length === 5) {
            dx = args[1]
            dy = args[2]
            dw = args[3]
            dh = args[4]
            sw = image.width
            sh = image.height
        } else if (args.length === 9) {
            sx = args[1]
            sy = args[2]
            sw = args[3]
            sh = args[4]
            dx = args[5]
            dy = args[6]
            dw = args[7]
            dh = args[8]
        } else {
            throw new Error("Invalid number of arguments passed to drawImage: " + arguments.length)
        }

        const parent = this._closestGroupOrSvg()
        const matrix = this.getTransform().translate(dx, dy)
        if (image instanceof SVGRenderingContext) {
            // canvas2svg mock canvas context. In the future we may want to clone nodes instead.
            // also I'm currently ignoring dw, dh, sw, sh, sx, sy for a mock context.
            const svg = image.getSvg().cloneNode(true) as SVGSVGElement
            if (svg.childNodes.length > 1) {
                const defs = svg.childNodes[0]
                while (defs.childNodes.length) {
                    const id = (defs.childNodes[0] as Element).getAttribute("id")!
                    this._ids[id] = id
                    this._defs.appendChild(defs.childNodes[0])
                }
                const group = svg.children[1] as SVGElement
                if (group !== undefined) {
                    this._applyTransformation(group, matrix)
                    parent.appendChild(group)
                }
            }
        } else if (image.nodeName === "CANVAS" || image.nodeName === "IMG") {
            // canvas or image
            const svgImage = this._createElement("image")
            svgImage.setAttribute("width", String(dw))
            svgImage.setAttribute("height", String(dh))
            svgImage.setAttribute("preserveAspectRatio", "none")

            if (sx || sy || sw !== image.width || sh !== image.height) {
                // crop the image using a temporary canvas
                const canvas = this._document.createElement("canvas")
                canvas.width = dw
                canvas.height = dh
                const context = canvas.getContext("2d")!
                context.drawImage(image, sx, sy, sw, sh, 0, 0, dw, dh)
                image = canvas
            }
            this._applyTransformation(svgImage, matrix)
            svgImage.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href",
                image.nodeName === "CANVAS" ? image.toDataURL() : image.getAttribute("src"))
            parent.appendChild(svgImage)
        }
    }


    /// TEXT

    /**
     * Fills or strokes text
     */
    private _applyText(text: string, x: number, y: number, action: "fill" | "stroke") {
        const el = document.createElement("span")
        el.setAttribute("style", 'font:' + this.font)

        const style = el.style
        const parent = this._closestGroupOrSvg()
        const valign = getDominantBaseline(this.textBaseline)
        const textElement = this._createElement("text", {
            "font-family": style.fontFamily,
            "font-size": style.fontSize,
            "font-style": style.fontStyle,
            "font-weight": style.fontWeight,

            // canvas doesn't support underline natively, but we do :)
            "text-decoration": this.fontUnderline,
            "x": x,
            "y": y,
            "text-anchor": getTextAnchor(this.textAlign),
            "dominant-baseline": valign,
        }, true)

        textElement.appendChild(this._document.createTextNode(text))
        this._currentElement = textElement
        this._applyTransformation(textElement)
        this._applyStyleToElement(this._currentElement, action)

        if (this.fontHref !== undefined) {
            const a = this._createElement("a")
            // canvas doesn't natively support linking, but we do :)
            a.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", this.fontHref)
            a.appendChild(textElement)
            parent.appendChild(a)
        } else {
            parent.appendChild(textElement)
        }
    }

    public fillText(text: string, x: number, y: number) {
        this._applyText(text, x, y, "fill")
    }

    public strokeText(text: string, x: number, y: number) {
        this._applyText(text, x, y, "stroke")
    }

    public measureText(text: string): TextMetrics {
        this._g.font = this.font
        return this._g.measureText(text)
    }


    /// PATHS, GRADIENTS, PATTERNS

    public createPath(arg?: string | Path2DSVG): Path2D {
        // we still return Path2D even if we are using Path2DSVG
        // for compatibility with other the std lib
        return new Path2DSVG(this, arg) as unknown as Path2D
    }

    /**
     * Adds a linear gradient to a defs tag.
     * Returns a canvas gradient object that has a reference to it's parent def
     */
    public createLinearGradient(x1: number, y1: number, x2: number, y2: number) {
        const grad = this._createElement("linearGradient", {
            id: randomString(this._ids),
            x1: x1 + "px",
            x2: x2 + "px",
            y1: y1 + "px",
            y2: y2 + "px",
            "gradientUnits": "userSpaceOnUse",
        }, false)
        this._defs.appendChild(grad)
        return new CanvasGradientSVG(grad, this)
    }

    /**
     * Adds a radial gradient to a defs tag.
     * Returns a canvas gradient object that has a reference to it's parent def
     */
    public createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) {
        const grad = this._createElement("radialGradient", {
            id: randomString(this._ids),
            cx: x1 + "px",
            cy: y1 + "px",
            r: r1 + "px",
            fx: x0 + "px",
            fy: y0 + "px",
            "gradientUnits": "userSpaceOnUse",
        }, false)
        this._defs.appendChild(grad)
        return new CanvasGradientSVG(grad, this)

    }

    public createPattern(image: HTMLCanvasElement | HTMLImageElement | SVGRenderingContext, __repetition: unknown) {
        const pattern = this._document.createElementNS("http://www.w3.org/2000/svg", "pattern")
        const id = randomString(this._ids)
        pattern.setAttribute("id", id)
        pattern.setAttribute("width", String(image.width))
        pattern.setAttribute("height", String(image.height))
        // We want the pattern sizing to be absolute, and not relative
        // https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Patterns
        // https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/patternUnits
        pattern.setAttribute("patternUnits", "userSpaceOnUse")

        if ("nodeName" in image && (image.nodeName === "CANVAS" || image.nodeName === "IMG")) {
            const img = this._document.createElementNS("http://www.w3.org/2000/svg", "image")
            img.setAttribute("width", String(image.width))
            img.setAttribute("height", String(image.height))
            img.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href",
                image.nodeName === "CANVAS" ? (image as HTMLCanvasElement).toDataURL() : image.getAttribute("src")!)
            pattern.appendChild(img)
            this._defs.appendChild(pattern)
        } else if (image instanceof SVGRenderingContext) {
            pattern.appendChild(image._svg.children[1])
            this._defs.appendChild(pattern)
        }
        return new CanvasPatternSVG(pattern, this)
    }


    /// TRANFORM

    public setTransform(matrix: DOMMatrixReadOnly): void
    public setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void

    public setTransform(am: DOMMatrixReadOnly | number, b?: number, c?: number, d?: number, e?: number, f?: number) {
        if (b === undefined) {
            const m = am as DOMMatrixReadOnly
            this._transformMatrix = new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f])
        } else {
            const a = am as number
            this._transformMatrix = new DOMMatrix([a, b, c!, d!, e!, f!])
        }
    }

    public getTransform() {
        const { a, b, c, d, e, f } = this._transformMatrix
        return new DOMMatrix([a, b, c, d, e, f])
    }

    public resetTransform() {
        this.setTransform(1, 0, 0, 1, 0, 0)
    }

    public transform(a: number, b: number, c: number, d: number, e: number, f: number) {
        const matrix = this.getTransform().multiply(new DOMMatrix([a, b, c, d, e, f]))
        this.setTransform(matrix)
    }

    public scale(x: number, y: number) {
        if (y === undefined) {
            y = x
        }
        if (isNaN(x) || isNaN(y) || !isFinite(x) || !isFinite(y)) {
            return
        }
        const matrix = this.getTransform().scale(x, y)
        this.setTransform(matrix)
    }

    public rotate(angle: number) {
        const matrix = this.getTransform().multiply(new DOMMatrix([
            Math.cos(angle),
            Math.sin(angle),
            -Math.sin(angle),
            Math.cos(angle),
            0,
            0,
        ]))
        this.setTransform(matrix)
    }

    public translate(x: number, y: number) {
        const matrix = this.getTransform().translate(x, y)
        this.setTransform(matrix)
    }

    public _matrixTransform(x: number, y: number): [number, number] {
        const { a, b, c, d, e, f } = this._transformMatrix
        const x1 = a * x + c * y + e
        const y1 = b * x + d * y + f
        return [x1, y1]
    }

    /**
     * @returns The scale component of the transform matrix as {x,y}.
     */
    public _getTransformScale() {
        return {
            x: Math.hypot(this._transformMatrix.a, this._transformMatrix.b),
            y: Math.hypot(this._transformMatrix.c, this._transformMatrix.d),
        }
    }

    /**
     * @returns The rotation component of the transform matrix in radians.
     */
    public _getTransformRotation() {
        return Math.atan2(this._transformMatrix.b, this._transformMatrix.a)
    }
}


class Path2DSVG {

    public readonly g: SVGRenderingContext
    private _parts: string[]
    private _hasMoved: boolean
    private _posX: number | undefined = undefined
    private _posY: number | undefined = undefined

    public constructor(g: SVGRenderingContext, path?: string | Path2DSVG) {
        this.g = g
        if (path === undefined) {
            this._parts = []
            this._hasMoved = false
        } else if (isString(path)) {
            this._parts = [path]
            this._hasMoved = path.indexOf("M") >= 0
        } else {
            this._parts = [...path._parts]
            this._hasMoved = this._parts.some(path => path.indexOf("M") >= 0)
        }
    }

    public get d() {
        return this._parts.join(" ")
    }

    public addPath(path: string, transform?: DOMMatrix2DInit) {
        if (transform) {
            console.error("transform argument to addPath is not supported")
        }
        this._parts.push(path)
        this._hasMoved ||= path.indexOf("M") >= 0
    }

    public closePath() {
        this.addPath("Z")
    }

    public moveTo(x: number, y: number) {
        // creates a new subpath with the given point
        this._posX = x
        this._posY = y
        const [tx, ty] = this.g._matrixTransform(x, y)
        this.addPath(`M ${tx} ${ty}`)
    }

    public lineTo(x: number, y: number) {
        this._posX = x
        this._posY = y
        const cmd = this._hasMoved ? "L" : "M"
        const [tx, ty] = this.g._matrixTransform(x, y)
        this.addPath(`${cmd} ${tx} ${ty}`)
    }

    public bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {
        this._posX = x
        this._posY = y
        const g = this.g
        const [tcp1x, tcp1y] = g._matrixTransform(cp1x, cp1y)
        const [tcp2x, tcp2y] = g._matrixTransform(cp2x, cp2y)
        const [tx, ty] = g._matrixTransform(x, y)
        this.addPath(`C ${tcp1x} ${tcp1y} ${tcp2x} ${tcp2y} ${tx} ${ty}`)
    }

    public quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {
        this._posX = x
        this._posY = y
        const g = this.g
        const [tcpx, tcpy] = g._matrixTransform(cpx, cpy)
        const [tx, ty] = g._matrixTransform(x, y)
        this.addPath(`Q ${tcpx} ${tcpy} ${tx} ${ty}`)
    }

    public rect(x: number, y: number, width: number, height: number) {
        this.moveTo(x, y)
        this.lineTo(x + width, y)
        this.lineTo(x + width, y + height)
        this.lineTo(x, y + height)
        this.closePath()
    }

    public arc(
        x: number,
        y: number,
        radius: number,
        startAngle: number,
        endAngle: number,
        counterClockwise = false
    ) {
        // in canvas no circle is drawn if no angle is provided.
        if (startAngle === endAngle) {
            return
        }

        const g = this.g
        startAngle = startAngle % (2 * Math.PI)
        endAngle = endAngle % (2 * Math.PI)
        if (startAngle === endAngle) {
            // circle time! subtract some of the angle so svg is happy (svg elliptical arc can't draw a full circle)
            endAngle =
                (endAngle + 2 * Math.PI - 0.001 * (counterClockwise ? -1 : 1)) %
                (2 * Math.PI)
        }
        const endX = x + radius * Math.cos(endAngle)
        const endY = y + radius * Math.sin(endAngle)
        const startX = x + radius * Math.cos(startAngle)
        const startY = y + radius * Math.sin(startAngle)
        const sweepFlag = counterClockwise ? 0 : 1
        let largeArcFlag = 0
        let diff = endAngle - startAngle

        // https://github.com/gliffy/canvas2svg/issues/4
        if (diff < 0) {
            diff += 2 * Math.PI
        }

        if (counterClockwise) {
            largeArcFlag = diff > Math.PI ? 0 : 1
        } else {
            largeArcFlag = diff > Math.PI ? 1 : 0
        }

        const scaleX = Math.hypot(g._transformMatrix.a, g._transformMatrix.b)
        const scaleY = Math.hypot(g._transformMatrix.c, g._transformMatrix.d)

        this.lineTo(startX, startY)
        const [endx, endy] = g._matrixTransform(endX, endY)
        this.addPath(`A ${radius * scaleX} ${radius * scaleY} ${0} ${largeArcFlag} ${sweepFlag} ${endx} ${endy}`)

        this._posX = x
        this._posY = y
    }

    public arcTo(x1: number, y1: number, x2: number, y2: number, radius: number) {
        // Based on Webkit implementation from
        // https://github.com/WebKit/webkit/blob/main/Source/WebCore/platform/graphics/cairo/PathCairo.cpp
        // See also http://www.w3.org/TR/2015/WD-2dcontext-20150514/#dom-context-2d-arcto

        // Let the point (x0, y0) be the last point in the subpath.
        const x0 = this._posX
        const y0 = this._posY

        // First ensure there is a subpath for (x1, y1).
        if (x0 === undefined || y0 === undefined) {
            return
        }

        // Negative values for radius must cause the implementation to throw an IndexSizeError exception.
        if (radius < 0) {
            throw new Error(
                "IndexSizeError: The radius provided (" + radius + ") is negative."
            )
        }

        // If the point (x0, y0) is equal to the point (x1, y1),
        // or if the point (x1, y1) is equal to the point (x2, y2),
        // or if the radius radius is zero,
        // then the method must add the point (x1, y1) to the subpath,
        // and connect that point to the previous point (x0, y0) by a straight line.
        if ((x0 === x1 && y0 === y1) || (x1 === x2 && y1 === y2) || radius === 0) {
            this.lineTo(x1, y1)
            return
        }

        const p1p0 = [x0 - x1, y0 - y1]
        const p1p2 = [x2 - x1, y2 - y1]
        const p1p0_length = Math.hypot(p1p0[0], p1p0[1])
        const p1p2_length = Math.hypot(p1p2[0], p1p2[1])
        const cos_phi = (p1p0[0] * p1p2[0] + p1p0[1] * p1p2[1]) / (p1p0_length * p1p2_length)
        // all points on a line logic
        if (cos_phi === -1) {
            this.lineTo(x1, y1)
            return
        }
        if (cos_phi === 1) {
            // add infinite far away point
            const max_length = 65535
            const factor_max = max_length / p1p0_length
            const ep = [x0 + factor_max * p1p0[0], y0 + factor_max * p1p0[1]]
            this.lineTo(ep[0], ep[1])
            return
        }

        const tangent = radius / Math.tan(Math.acos(cos_phi) / 2)
        const factor_p1p0 = tangent / p1p0_length
        const t_p1p0 = [x1 + factor_p1p0 * p1p0[0], y1 + factor_p1p0 * p1p0[1]]

        let orth_p1p0 = [p1p0[1], -p1p0[0]]
        const orth_p1p0_length = Math.hypot(orth_p1p0[0], orth_p1p0[1])
        const factor_ra = radius / orth_p1p0_length

        // angle between orth_p1p0 and p1p2 to get the right vector orthographic to p1p0
        const cos_alpha = (orth_p1p0[0] * p1p2[0] + orth_p1p0[1] * p1p2[1]) / (orth_p1p0_length * p1p2_length)
        if (cos_alpha < 0) {
            orth_p1p0 = [-orth_p1p0[0], -orth_p1p0[1]]
        }

        const p = [t_p1p0[0] + factor_ra * orth_p1p0[0], t_p1p0[1] + factor_ra * orth_p1p0[1]]

        // calculate angles for addArc
        orth_p1p0 = [-orth_p1p0[0], -orth_p1p0[1]]
        let sa = Math.acos(orth_p1p0[0] / orth_p1p0_length)
        if (orth_p1p0[1] < 0) {
            sa = 2 * Math.PI - sa
        }

        // anticlockwise logic
        let anticlockwise = false

        const factor_p1p2 = tangent / p1p2_length
        const t_p1p2 = [x1 + factor_p1p2 * p1p2[0], y1 + factor_p1p2 * p1p2[1]]
        const orth_p1p2 = [t_p1p2[0] - p[0], t_p1p2[1] - p[1]]
        const orth_p1p2_length = Math.hypot(orth_p1p2[0], orth_p1p2[1])
        let ea = Math.acos(orth_p1p2[0] / orth_p1p2_length)
        if (orth_p1p2[1] < 0) {
            ea = 2 * Math.PI - ea
        }
        if (sa > ea && sa - ea < Math.PI) { anticlockwise = true }
        if (sa < ea && ea - sa > Math.PI) { anticlockwise = true }

        this.lineTo(t_p1p0[0], t_p1p0[1])
        this.arc(p[0], p[1], radius, sa, ea, anticlockwise)
    }

    public ellipse(
        x: number,
        y: number,
        radiusX: number,
        radiusY: number,
        rotation: number,
        startAngle: number,
        endAngle: number,
        counterClockwise = false
    ) {
        if (startAngle === endAngle) {
            return
        }

        const g = this.g;
        [x, y] = g._matrixTransform(x, y)
        const scale = g._getTransformScale()
        radiusX = radiusX * scale.x
        radiusY = radiusY * scale.y
        rotation = rotation + g._getTransformRotation()

        startAngle = startAngle % (2 * Math.PI)
        endAngle = endAngle % (2 * Math.PI)
        if (startAngle === endAngle) {
            endAngle =
                (endAngle + 2 * Math.PI - 0.001 * (counterClockwise ? -1 : 1)) %
                (2 * Math.PI)
        }
        const endX = x +
            Math.cos(-rotation) * radiusX * Math.cos(endAngle) +
            Math.sin(-rotation) * radiusY * Math.sin(endAngle)
        const endY = y -
            Math.sin(-rotation) * radiusX * Math.cos(endAngle) +
            Math.cos(-rotation) * radiusY * Math.sin(endAngle)
        const startX = x +
            Math.cos(-rotation) * radiusX * Math.cos(startAngle) +
            Math.sin(-rotation) * radiusY * Math.sin(startAngle)
        const startY = y -
            Math.sin(-rotation) * radiusX * Math.cos(startAngle) +
            Math.cos(-rotation) * radiusY * Math.sin(startAngle)
        const sweepFlag = counterClockwise ? 0 : 1
        let largeArcFlag = 0
        let diff = endAngle - startAngle

        if (diff < 0) {
            diff += 2 * Math.PI
        }

        if (counterClockwise) {
            largeArcFlag = diff > Math.PI ? 0 : 1
        } else {
            largeArcFlag = diff > Math.PI ? 1 : 0
        }

        // Transform is already applied, so temporarily remove since lineTo
        // will apply it again.
        const currentTransform = g._transformMatrix
        g.resetTransform()
        this.lineTo(startX, startY)
        g._transformMatrix = currentTransform

        this.addPath(`A ${radiusX} ${radiusY} ${rotation * (180 / Math.PI)} ${largeArcFlag} ${sweepFlag} ${endX} ${endY}`)
        this._posX = endX
        this._posY = endY
    }
}


class CanvasGradientSVG implements CanvasGradient {

    public constructor(
        public readonly gradientElem: SVGGradientElement,
        private readonly _ctx: SVGRenderingContext,
    ) { }

    public addColorStop(offset: number, color: string) {
        const stop = this._ctx._createElement("stop")
        stop.setAttribute("offset", String(offset))
        if (color.indexOf("rgba") !== -1) {
            // separate alpha value, since webkit can't handle it
            const regex = /rgba\(\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\s*,\s*(\d?\.?\d*)\s*\)/gi
            const matches = regex.exec(color)
            if (matches) {
                stop.setAttribute("stop-color", `rgb(${matches[1]},${matches[2]},${matches[3]})`)
                stop.setAttribute("stop-opacity", matches[4])
            } else {
                stop.setAttribute("stop-color", color)
            }
        } else {
            stop.setAttribute("stop-color", color)
        }
        this.gradientElem.appendChild(stop)
    }
}


class CanvasPatternSVG {
    public constructor(
        public readonly patternElem: SVGPatternElement,
        public readonly _ctx: SVGRenderingContext,
    ) { }
}


/// HELPER FUNCTIONS

function randomString(holder?: Record<string, unknown>) {
    if (!holder) {
        throw new Error("cannot create a random attribute name for an undefined object")
    }
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz"
    let randomstring = ""
    do {
        randomstring = ""
        for (let i = 0; i < 12; i++) {
            randomstring += chars[Math.floor(Math.random() * chars.length)]
        }
    } while (holder[randomstring] !== undefined)
    return randomstring
}

// Some basic mappings for attributes and default values.
const STYLES = {
    "strokeStyle": {
        svgAttr: "stroke",
        svg: "none",
        apply: "stroke",
    },
    "fillStyle": {
        svgAttr: "fill",
        svg: null, // svg default is black, but we need to special case this to handle canvas stroke without fill
        apply: "fill",
    },
    "lineCap": {
        svgAttr: "stroke-linecap",
        svg: "butt",
        apply: "stroke",
    },
    "lineJoin": {
        svgAttr: "stroke-linejoin",
        svg: "miter",
        apply: "stroke",
    },
    "miterLimit": {
        svgAttr: "stroke-miterlimit",
        svg: 4,
        apply: "stroke",
    },
    "lineWidth": {
        svgAttr: "stroke-width",
        svg: 1,
        apply: "stroke",
    },
    "globalAlpha": {
        svgAttr: "opacity",
        svg: 1,
        apply: "fill stroke",
    },
    "lineDash": {
        svgAttr: "stroke-dasharray",
        svg: null,
        apply: "stroke",
    },
} satisfies Record<string, {
    svgAttr?: string, // corresponding svg attribute
    svg?: string | number | null,       // svg default
    apply?: string,    // apply on stroke() or fill()
}>


const _textAnchorMapping: Record<string, string> = {
    left: "start",
    right: "end",
    center: "middle",
    start: "start",
    end: "end",
}
function getTextAnchor(textAlign: string) {
    return _textAnchorMapping[textAlign] ?? _textAnchorMapping.start
}

const _dominantBaselineMapping: Record<string, string> = {
    alphabetic: "alphabetic",
    hanging: "hanging",
    top: "text-before-edge",
    bottom: "text-after-edge",
    middle: "central", // neither central nor middle are correct work in Illustrator
}
function getDominantBaseline(textBaseline: string) {
    return _dominantBaselineMapping[textBaseline] ?? _dominantBaselineMapping.alphabetic
}


function createNamedToNumberedLookup(itemsStr: string, radix?: number) {
    const lookup: Record<string, string> = {}
    const items = itemsStr.split(',')
    radix = radix ?? 10
    // Map from named to numbered entities.
    for (let i = 0; i < items.length; i += 2) {
        const entity = '&' + items[i + 1] + ';'
        const base10 = parseInt(items[i], radix)
        lookup[entity] = '&#' + base10 + ';'
    }
    // FF and IE need to create a regex from hex values ie &nbsp; == \xa0
    lookup["\\xa0"] = '&#160;'
    return lookup
}

// Unpack entities lookup where the numbers are in radix 32 to reduce the size
// entity mapping courtesy of tinymce
const namedEntities = createNamedToNumberedLookup(
    '50,nbsp,51,iexcl,52,cent,53,pound,54,curren,55,yen,56,brvbar,57,sect,58,uml,59,copy,' +
    '5a,ordf,5b,laquo,5c,not,5d,shy,5e,reg,5f,macr,5g,deg,5h,plusmn,5i,sup2,5j,sup3,5k,acute,' +
    '5l,micro,5m,para,5n,middot,5o,cedil,5p,sup1,5q,ordm,5r,raquo,5s,frac14,5t,frac12,5u,frac34,' +
    '5v,iquest,60,Agrave,61,Aacute,62,Acirc,63,Atilde,64,Auml,65,Aring,66,AElig,67,Ccedil,' +
    '68,Egrave,69,Eacute,6a,Ecirc,6b,Euml,6c,Igrave,6d,Iacute,6e,Icirc,6f,Iuml,6g,ETH,6h,Ntilde,' +
    '6i,Ograve,6j,Oacute,6k,Ocirc,6l,Otilde,6m,Ouml,6n,times,6o,Oslash,6p,Ugrave,6q,Uacute,' +
    '6r,Ucirc,6s,Uuml,6t,Yacute,6u,THORN,6v,szlig,70,agrave,71,aacute,72,acirc,73,atilde,74,auml,' +
    '75,aring,76,aelig,77,ccedil,78,egrave,79,eacute,7a,ecirc,7b,euml,7c,igrave,7d,iacute,7e,icirc,' +
    '7f,iuml,7g,eth,7h,ntilde,7i,ograve,7j,oacute,7k,ocirc,7l,otilde,7m,ouml,7n,divide,7o,oslash,' +
    '7p,ugrave,7q,uacute,7r,ucirc,7s,uuml,7t,yacute,7u,thorn,7v,yuml,ci,fnof,sh,Alpha,si,Beta,' +
    'sj,Gamma,sk,Delta,sl,Epsilon,sm,Zeta,sn,Eta,so,Theta,sp,Iota,sq,Kappa,sr,Lambda,ss,Mu,' +
    'st,Nu,su,Xi,sv,Omicron,t0,Pi,t1,Rho,t3,Sigma,t4,Tau,t5,Upsilon,t6,Phi,t7,Chi,t8,Psi,' +
    't9,Omega,th,alpha,ti,beta,tj,gamma,tk,delta,tl,epsilon,tm,zeta,tn,eta,to,theta,tp,iota,' +
    'tq,kappa,tr,lambda,ts,mu,tt,nu,tu,xi,tv,omicron,u0,pi,u1,rho,u2,sigmaf,u3,sigma,u4,tau,' +
    'u5,upsilon,u6,phi,u7,chi,u8,psi,u9,omega,uh,thetasym,ui,upsih,um,piv,812,bull,816,hellip,' +
    '81i,prime,81j,Prime,81u,oline,824,frasl,88o,weierp,88h,image,88s,real,892,trade,89l,alefsym,' +
    '8cg,larr,8ch,uarr,8ci,rarr,8cj,darr,8ck,harr,8dl,crarr,8eg,lArr,8eh,uArr,8ei,rArr,8ej,dArr,' +
    '8ek,hArr,8g0,forall,8g2,part,8g3,exist,8g5,empty,8g7,nabla,8g8,isin,8g9,notin,8gb,ni,8gf,prod,' +
    '8gh,sum,8gi,minus,8gn,lowast,8gq,radic,8gt,prop,8gu,infin,8h0,ang,8h7,and,8h8,or,8h9,cap,8ha,cup,' +
    '8hb,int,8hk,there4,8hs,sim,8i5,cong,8i8,asymp,8j0,ne,8j1,equiv,8j4,le,8j5,ge,8k2,sub,8k3,sup,8k4,' +
    'nsub,8k6,sube,8k7,supe,8kl,oplus,8kn,otimes,8l5,perp,8m5,sdot,8o8,lceil,8o9,rceil,8oa,lfloor,8ob,' +
    'rfloor,8p9,lang,8pa,rang,9ea,loz,9j0,spades,9j3,clubs,9j5,hearts,9j6,diams,ai,OElig,aj,oelig,b0,' +
    'Scaron,b1,scaron,bo,Yuml,m6,circ,ms,tilde,802,ensp,803,emsp,809,thinsp,80c,zwnj,80d,zwj,80e,lrm,' +
    '80f,rlm,80j,ndash,80k,mdash,80o,lsquo,80p,rsquo,80q,sbquo,80s,ldquo,80t,rdquo,80u,bdquo,810,dagger,' +
    '811,Dagger,81g,permil,81p,lsaquo,81q,rsaquo,85c,euro', 32)
