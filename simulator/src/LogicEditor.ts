
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import LogicEditorTemplate from "../html/LogicEditorTemplate.html"

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import LogicEditorCSS from "../css/LogicEditor.css"

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import DialogPolyfillCSS from "../../node_modules/dialog-polyfill/dist/dialog-polyfill.css"

import dialogPolyfill from 'dialog-polyfill'
import { saveAs } from 'file-saver'
import JSON5 from "json5"
import * as LZString from "lz-string"
import * as pngMeta from 'png-metadata-writer'
import { ComponentFactory } from "./ComponentFactory"
import { ComponentList, DrawZIndex } from "./ComponentList"
import { CursorMovementManager, EditorSelection } from "./CursorMovementManager"
import { MoveManager } from "./MoveManager"
import { NodeManager } from "./NodeManager"
import { RecalcManager, RedrawManager } from "./RedrawRecalcManager"
import { SVGRenderingContext } from "./SVGRenderingContext"
import { Serialization } from "./Serialization"
import { Tests } from "./Tests"
import { Timeline, TimelineState } from "./Timeline"
import { UndoManager, UndoState } from './UndoManager'
import { Component, ComponentBase } from "./components/Component"
import { Drawable, DrawableParent, GraphicsRendering, Orientation } from "./components/Drawable"
import { Rectangle, RectangleDef } from "./components/Rectangle"
import { Waypoint, Wire, WireManager, WireStyle, WireStyles } from "./components/Wire"
import { COLOR_BACKGROUND, COLOR_BACKGROUND_UNUSED_REGION, COLOR_BORDER, COLOR_COMPONENT_BORDER, COLOR_GRID_LINES, COLOR_GRID_LINES_GUIDES, GRID_STEP, clampZoom, isDarkMode, setColors, strokeSingleLine } from "./drawutils"
import { gallery } from './gallery'
import { a, applyModifierTo, attr, attrBuilder, button, cls, div, emptyMod, href, input, label, mods, option, raw, select, span, style, target, title, type } from "./htmlgen"
import { IconName, inlineIconSvgFor, isIconName, makeIcon } from "./images"
import { makeComponentMenuInto } from "./menuutils"
import { DefaultLang, S, getLang, isLang, setLang } from "./strings"
import { InteractionResult, KeysOfByType, RichStringEnum, copyToClipboard, formatString, getURLParameter, isArray, isEmbeddedInIframe, isFalsyString, isString, isTruthyString, setEnabled, setVisible, showModal } from "./utils"



enum Mode {
    STATIC,  // cannot interact in any way
    TRYOUT,  // can change inputs on predefined circuit
    CONNECT, // can additionnally move preexisting components around and connect them
    DESIGN,  // can additionally add components from left menu
    FULL,    // can additionally force output nodes to 'unset' state and draw undetermined dates
}

const MAX_MODE_WHEN_SINGLETON = Mode.FULL
const MAX_MODE_WHEN_EMBEDDED = Mode.DESIGN
const DEFAULT_MODE = Mode.DESIGN

const ATTRIBUTE_NAMES = {
    lang: "lang",
    singleton: "singleton", // whether this is the only editor in the page
    mode: "mode",
    hidereset: "hidereset",

    // these are mirrored in the display options
    name: "name",
    showonly: "showonly",
    showgatetypes: "showgatetypes",
    showdisconnectedpins: "showdisconnectedpins",
    showtooltips: "tooltips",

    src: "src",
    data: "data",
} as const

export type InitParams = {
    orient: Orientation
}

const DEFAULT_EDITOR_OPTIONS = {
    name: undefined as string | undefined,
    showOnly: undefined as undefined | Array<string>,
    initParams: undefined as undefined | Record<string, Partial<InitParams>>,
    showGateTypes: false,
    showDisconnectedPins: false,
    wireStyle: WireStyles.auto as WireStyle,
    hideWireColors: false,
    hideInputColors: false,
    hideOutputColors: false,
    hideMemoryContent: false,
    hideTooltips: false,
    groupParallelWires: false,
    propagationDelay: 100,
    allowPausePropagation: false,
    zoom: 100,
}

export type EditorOptions = typeof DEFAULT_EDITOR_OPTIONS


export const MouseActions = RichStringEnum.withProps<{
    cursor: string | null
}>()({
    edit: { cursor: null },
    move: { cursor: "move" },
    delete: { cursor: "not-allowed" },
})
export type MouseAction = typeof MouseActions.type

type InitialData = { _type: "url", url: string } | { _type: "json", json: string } | { _type: "compressed", str: string }

type HighlightedItems = { comps: Component[], wires: Wire[], start: number }

export type DrawParams = {
    drawTime: number,
    currentMouseOverComp: Drawable | null,
    currentSelection: EditorSelection | undefined,
    highlightedItems: HighlightedItems | undefined,
    highlightColor: string | undefined,
    anythingMoving: boolean,
}
export class LogicEditor extends HTMLElement implements DrawableParent {

    public static _globalListenersInstalled = false

    public static _allConnectedEditors: Array<LogicEditor> = []
    public static get allConnectedEditors(): ReadonlyArray<LogicEditor> {
        return LogicEditor._allConnectedEditors
    }

    public readonly factory = new ComponentFactory(this)
    public readonly wireMgr: WireManager = new WireManager(this)
    public readonly nodeMgr = new NodeManager()
    public readonly timeline = new Timeline(this)
    public readonly redrawMgr = new RedrawManager()
    public readonly recalcMgr = new RecalcManager()
    public readonly moveMgr = new MoveManager(this)
    public readonly cursorMovementMgr = new CursorMovementManager(this)
    public readonly undoMgr = new UndoManager(this)

    public readonly components = new ComponentList()

    private _isEmbedded = false
    private _isSingleton = false
    private _maxInstanceMode: Mode = MAX_MODE_WHEN_EMBEDDED // can be set later
    private _isDirty = false
    private _mode: Mode = DEFAULT_MODE
    private _initialData: InitialData | undefined = undefined
    private _options: EditorOptions = { ...DEFAULT_EDITOR_OPTIONS }
    private _hideResetButton = false

    private _currentMouseAction: MouseAction = "edit"
    private _toolCursor: string | null = null
    private _highlightedItems: HighlightedItems | undefined = undefined
    private _nextAnimationFrameHandle: number | null = null

    public root: ShadowRoot
    public readonly html: {
        rootDiv: HTMLDivElement,
        canvasContainer: HTMLElement,
        mainCanvas: HTMLCanvasElement,
        leftToolbar: HTMLElement,
        tooltipElem: HTMLElement,
        tooltipContents: HTMLElement,
        mainContextMenu: HTMLElement,
        hiddenPath: SVGPathElement,
        fileChooser: HTMLInputElement,
        optionsZone: HTMLElement,
        embedDialog: HTMLDialogElement,
        embedUrl: HTMLTextAreaElement,
        // embedUrlQRCode: HTMLImageElement,
        embedIframe: HTMLTextAreaElement,
        embedWebcomp: HTMLTextAreaElement,
        embedMarkdown: HTMLTextAreaElement,
    }
    public optionsHtml: {
        undoButton: HTMLButtonElement,
        redoButton: HTMLButtonElement,

        nameField: HTMLInputElement,
        showGateTypesCheckbox: HTMLInputElement,
        showDisconnectedPinsCheckbox: HTMLInputElement,
        wireStylePopup: HTMLSelectElement,
        hideWireColorsCheckbox: HTMLInputElement,
        hideInputColorsCheckbox: HTMLInputElement,
        hideOutputColorsCheckbox: HTMLInputElement,
        hideMemoryContentCheckbox: HTMLInputElement,
        hideTooltipsCheckbox: HTMLInputElement,
        groupParallelWiresCheckbox: HTMLInputElement,
        propagationDelayField: HTMLInputElement,
        zoomLevelField: HTMLInputElement,
        showUserDataLinkContainer: HTMLDivElement,
    } | undefined = undefined
    public userdata: string | Record<string, unknown> | undefined = undefined

    private _baseDrawingScale = 1
    private _actualZoomFactor = 1
    public mouseX = -1000 // offscreen at start
    public mouseY = -1000

    public constructor() {
        super()

        this.root = this.attachShadow({ mode: 'open' })
        this.root.appendChild(template.content.cloneNode(true) as HTMLElement)

        const html: typeof this.html = {
            rootDiv: this.elemWithId("logicEditorRoot"),
            canvasContainer: this.elemWithId("canvas-sim"),
            mainCanvas: this.elemWithId("mainCanvas"),
            leftToolbar: this.elemWithId("leftToolbar"),
            tooltipElem: this.elemWithId("tooltip"),
            tooltipContents: this.elemWithId("tooltipContents"),
            mainContextMenu: this.elemWithId("mainContextMenu"),
            optionsZone: this.elemWithId("optionsZone"),
            hiddenPath: this.elemWithId("hiddenPath"),
            fileChooser: this.elemWithId("fileChooser"),
            embedDialog: this.elemWithId("embedDialog"),
            embedUrl: this.elemWithId("embedUrl"),
            // embedUrlQRCode: this.elemWithId("embedUrlQRCode"),
            embedIframe: this.elemWithId("embedIframe"),
            embedWebcomp: this.elemWithId("embedWebcomp"),
            embedMarkdown: this.elemWithId("embedMarkdown"),
        }
        this.html = html
        dialogPolyfill.registerDialog(html.embedDialog)
    }

    public isMainEditor(): this is LogicEditor {
        return true
    }

    public get editor(): LogicEditor {
        return this
    }

    private elemWithId<E extends Element>(id: string) {
        let elem = this.root.querySelector(`#${id}`)
        if (elem === null) {
            elem = document.querySelector(`#${id}`)
            if (elem !== null) {
                console.log(`WARNING found elem with id ${id} in document rather than in shadow root`)
            }
        }
        if (elem === null) {
            console.log("root", this.root)
            throw new Error(`Could not find element with id '${id}'`)
        }
        return elem as E
    }

    public static get observedAttributes() {
        return []
    }


    public get mode() {
        return this._mode
    }

    public get actualZoomFactor() {
        return this._actualZoomFactor
    }

    public get isSingleton() {
        return this._isSingleton
    }

    public get options(): Readonly<EditorOptions> {
        return this._options
    }

    public setPartialOptions(opts: Partial<EditorOptions>) {
        const newOptions = { ...DEFAULT_EDITOR_OPTIONS, ...opts }
        if (this._isSingleton) {
            // restore showOnly
            newOptions.showOnly = this._options.showOnly
        }
        this._options = newOptions
        let optionsHtml

        if ((optionsHtml = this.optionsHtml) !== undefined) {
            this.setDocumentName(newOptions.name)
            optionsHtml.nameField.value = newOptions.name ?? ""
            optionsHtml.hideWireColorsCheckbox.checked = newOptions.hideWireColors
            optionsHtml.hideInputColorsCheckbox.checked = newOptions.hideInputColors
            optionsHtml.hideOutputColorsCheckbox.checked = newOptions.hideOutputColors
            optionsHtml.hideMemoryContentCheckbox.checked = newOptions.hideMemoryContent
            optionsHtml.showGateTypesCheckbox.checked = newOptions.showGateTypes
            optionsHtml.wireStylePopup.value = newOptions.wireStyle
            optionsHtml.showDisconnectedPinsCheckbox.checked = newOptions.showDisconnectedPins
            optionsHtml.hideTooltipsCheckbox.checked = newOptions.hideTooltips
            optionsHtml.groupParallelWiresCheckbox.checked = newOptions.groupParallelWires
            optionsHtml.propagationDelayField.valueAsNumber = newOptions.propagationDelay
            optionsHtml.zoomLevelField.valueAsNumber = newOptions.zoom

            optionsHtml.showUserDataLinkContainer.style.display = this.userdata !== undefined ? "initial" : "none"
        }

        this._actualZoomFactor = clampZoom(newOptions.zoom)

        this.redrawMgr.addReason("options changed", null)
    }

    private setDocumentName(name: string | undefined) {
        if (!this._isSingleton) {
            return
        }
        const defaultTitle = "Logic"
        if (name === undefined) {
            document.title = defaultTitle
        } else {
            document.title = `${name} – ${defaultTitle}`
        }
    }

    public nonDefaultOptions(): undefined | Partial<EditorOptions> {
        const nonDefaultOpts: Partial<EditorOptions> = {}
        let set = false
        for (const [_k, v] of Object.entries(this._options)) {
            const k = _k as keyof EditorOptions
            if (v !== DEFAULT_EDITOR_OPTIONS[k]) {
                nonDefaultOpts[k] = v as any
                set = true
            }
        }
        return set ? nonDefaultOpts : undefined
    }

    public runFileChooser(accept: string, callback: (file: File) => void) {
        const chooser = this.html.fileChooser
        chooser.setAttribute("accept", accept)
        chooser.addEventListener("change", __ => {
            const files = this.html.fileChooser.files
            if (files !== null && files.length > 0) {
                callback(files[0])
            }
        }, { once: true })
        chooser.click()
    }

    public setActiveTool(toolElement: HTMLElement, e: MouseEvent) {
        const tool = toolElement.getAttribute("tool")
        if (tool === null || tool === undefined) {
            return
        }

        // Main edit buttons on the right
        if (MouseActions.includes(tool)) {
            this.wrapHandler(() => {
                this.setCurrentMouseAction(tool)
            })()
            return
        }

        if (tool === "save") {
            if (e.altKey && this.editor.factory.hasCustomComponents()) {
                Serialization.saveLibraryToFile(this)
            } else {
                Serialization.saveCircuitToFile(this)
            }
            return
        }

        if (tool === "screenshot") {
            if (e.altKey) {
                this.download(this.toSVG(true), ".svg")
            } else {
                this.download(this.toPNG(true), ".png")
            }
            return
        }

        if (tool === "open") {
            this.runFileChooser("text/plain|image/png|application/json", file => {
                this.tryLoadFrom(file)
            })
            return
        }

        this.setCurrentMouseAction("edit")
        if (tool === "reset") {
            this.wrapHandler(() => {
                this.tryLoadCircuitFromData()
            })()
            return
        }
    }

    public setToolCursor(cursor: string | null) {
        this._toolCursor = cursor
    }

    private setCanvasSize() {
        const { canvasContainer } = this.html
        const w = canvasContainer.clientWidth
        const h = canvasContainer.clientHeight
        const f = window.devicePixelRatio ?? 1
        const mainCanvas = this.html.mainCanvas
        mainCanvas.setAttribute("width", String(w * f))
        mainCanvas.setAttribute("height", String(h * f))
        mainCanvas.style.setProperty("width", w + "px")
        mainCanvas.style.setProperty("height", h + "px")
        this._baseDrawingScale = f
    }

    public connectedCallback() {
        const { rootDiv, mainCanvas } = this.html

        const parentStyles = this.getAttribute("style")
        if (parentStyles !== null) {
            rootDiv.setAttribute("style", rootDiv.getAttribute("style") + parentStyles)
        }

        // TODO move this in SelectionMgr?
        mainCanvas.ondragenter = () => {
            return false
        }
        mainCanvas.ondragover = () => {
            return false
        }
        mainCanvas.ondragend = () => {
            return false
        }
        mainCanvas.ondrop = e => {
            if (e.dataTransfer === null) {
                return false
            }

            e.preventDefault()
            const file = e.dataTransfer.files?.[0]
            if (file !== undefined) {
                this.tryLoadFrom(file)
            } else {
                const dataItems = e.dataTransfer.items
                if (dataItems !== undefined) {
                    for (const dataItem of dataItems) {
                        if (dataItem.kind === "string" && (dataItem.type === "application/json" || dataItem.type === "text/plain")) {
                            dataItem.getAsString(content => {
                                e.dataTransfer!.dropEffect = "copy"
                                this.loadCircuit(content)
                            })
                            break
                        }
                    }
                }
            }
            return false
        }

        this.cursorMovementMgr.registerCanvasListenersOn(this.html.mainCanvas)
        if (LogicEditor._allConnectedEditors.length === 0) {
            // set lang on first instance of editor on the page
            this.setupLang()
        }
        LogicEditor._allConnectedEditors.push(this)
        this.setup()
    }

    public disconnectedCallback() {
        const insts = LogicEditor._allConnectedEditors
        insts.splice(insts.indexOf(this), 1)

        // TODO
        // this.cursorMovementManager.unregisterCanvasListenersOn(this.html.mainCanvas)
    }

    private setupLang() {
        const getNavigatorLanguage = () => {
            const lang = navigator.languages?.[0] ?? navigator.language
            if (lang.length > 2) {
                return lang.substring(0, 2)
            }
            if (lang.length === 2) {
                return lang
            }
            return undefined
        }

        const getSavedLang = () => {
            return localStorage.getItem(ATTRIBUTE_NAMES.lang)
        }

        const langStr = (getURLParameter(ATTRIBUTE_NAMES.lang)
            ?? this.getAttribute(ATTRIBUTE_NAMES.lang)
            ?? getSavedLang()
            ?? getNavigatorLanguage()
            ?? DefaultLang).toLowerCase()
        const lang = isLang(langStr) ? langStr : DefaultLang
        setLang(lang)
    }

    private setup() {
        this._isEmbedded = isEmbeddedInIframe()
        const singletonAttr = this.getAttribute(ATTRIBUTE_NAMES.singleton)
        this._isSingleton = !this._isEmbedded && singletonAttr !== null && !isFalsyString(singletonAttr)
        this._maxInstanceMode = this._isSingleton && !this._isEmbedded ? MAX_MODE_WHEN_SINGLETON : MAX_MODE_WHEN_EMBEDDED

        // Transfer from URL param to attributes if we are in singleton mode
        if (this._isSingleton || this._isEmbedded) {
            const transferUrlParamToAttribute = (name: string) => {
                const value = getURLParameter(name)
                if (value !== undefined) {
                    this.setAttribute(name, value)
                }
            }

            for (const attr of [
                ATTRIBUTE_NAMES.mode,
                ATTRIBUTE_NAMES.showonly,
                ATTRIBUTE_NAMES.showgatetypes,
                ATTRIBUTE_NAMES.showdisconnectedpins,
                ATTRIBUTE_NAMES.showtooltips,
                ATTRIBUTE_NAMES.data,
                ATTRIBUTE_NAMES.src,
                ATTRIBUTE_NAMES.hidereset,
            ]) {
                transferUrlParamToAttribute(attr)
            }

            const userParamPrefix = "user"
            const url = new URL(window.location.href)
            url.searchParams.forEach((value: string, key: string) => {
                if (key.startsWith(userParamPrefix)) {
                    key = key.substring(userParamPrefix.length)
                    if (key.startsWith(".")) {
                        key = key.substring(1)
                    }
                    if (key.length === 0) {
                        this.userdata = value
                    } else {
                        key = key[0].toLowerCase() + key.substring(1)
                        if (typeof this.userdata !== "object") {
                            this.userdata = {}
                        }
                        if (key in this.userdata) {
                            const oldValue = this.userdata[key]
                            if (isArray(oldValue)) {
                                oldValue.push(value)
                            } else {
                                this.userdata[key] = [oldValue, value]
                            }
                        } else {
                            this.userdata[key] = value
                        }
                    }
                }
            })
            if (this.userdata !== undefined) {
                console.log("Custom user data: ", this.userdata)
            }
        }

        if (this._isSingleton) {
            // console.log("LogicEditor is in singleton mode")

            // singletons manage their dark mode according to system settings
            const darkModeQuery = window.matchMedia("(prefers-color-scheme: dark)")
            darkModeQuery.onchange = () => {
                setColors(darkModeQuery.matches)
            }
            setColors(darkModeQuery.matches)

            // make load function available globally
            window.Logic.singleton = this
            window.load = this.loadCircuit.bind(this)
            window.save = this.save.bind(this)
            window.highlight = this.highlight.bind(this)

            window.logicalTime = () => {
                const time = this.timeline.logicalTime()
                // console.log(time)
                return time
            }

            this.html.canvasContainer.appendChild(
                div(style("user-select: none; position: absolute; bottom: 0; right: 0; padding: 5px 3px 2px 5px; color: rgba(128,128,128,0.2); border-radius: 10px 0 0 0; font-size: 69%; font-style: italic;"),
                    S.Messages.DevelopedBy + " ",
                    a(style("color: inherit"),
                        href("https://github.com/jppellet/Logic-Circuit-Simulator"), target("_blank"),
                        "Jean-Philippe Pellet"
                    ),
                    ", ",
                    a(style("color: inherit"),
                        href("https://www.hepl.ch/accueil/formation/unites-enseignement-et-recherche/medias-usages-numeriques-et-didactique-de-linformatique.html"), target("_blank"),
                        "HEP Vaud"
                    ),
                ).render()
            )

            window.onbeforeunload = e => {
                if (this._isSingleton && this._isDirty && this.mode >= Mode.CONNECT) {
                    e.preventDefault() // ask to save changes
                    e.returnValue = S.Messages.ReallyCloseWindow
                }
            }

            this.html.mainCanvas.focus()
        }

        // Load parameters from attributes
        let modeAttr = this.getAttribute(ATTRIBUTE_NAMES.mode)
        if (modeAttr !== null && (modeAttr = modeAttr.toUpperCase()) in Mode) {
            this._maxInstanceMode = (Mode as any)[modeAttr]
        }

        const showonlyAttr = this.getAttribute(ATTRIBUTE_NAMES.showonly)
        if (showonlyAttr !== null) {
            this._options.showOnly = showonlyAttr.toLowerCase().split(/[, +]+/).filter(x => x.trim())
        }

        const showgatetypesAttr = this.getAttribute(ATTRIBUTE_NAMES.showgatetypes)
        if (showgatetypesAttr !== null) {
            this._options.showGateTypes = isTruthyString(showgatetypesAttr)
        }

        const showdisconnectedpinsAttr = this.getAttribute(ATTRIBUTE_NAMES.showdisconnectedpins)
        if (showdisconnectedpinsAttr !== null) {
            this._options.showDisconnectedPins = isTruthyString(showdisconnectedpinsAttr)
        }

        const showtooltipsAttr = this.getAttribute(ATTRIBUTE_NAMES.showtooltips)
        if (showtooltipsAttr !== null) {
            this._options.hideTooltips = !isFalsyString(showtooltipsAttr)
        }

        // TODO move this to options so that it is correctly persisted, too
        this._hideResetButton = this.getAttribute(ATTRIBUTE_NAMES.hidereset) !== null && !isFalsyString(this.getAttribute(ATTRIBUTE_NAMES.hidereset))

        let dataOrSrcRef
        if ((dataOrSrcRef = this.getAttribute(ATTRIBUTE_NAMES.data)) !== null) {
            this._initialData = { _type: "compressed", str: dataOrSrcRef }
        } else if ((dataOrSrcRef = this.getAttribute(ATTRIBUTE_NAMES.src)) !== null) {
            this._initialData = { _type: "url", url: dataOrSrcRef }
        } else {

            const tryLoadFromLightDOM = () => {
                const innerScriptElem = this.findLightDOMChild("script")
                if (innerScriptElem !== null) {
                    this._initialData = { _type: "json", json: innerScriptElem.innerHTML }
                    innerScriptElem.remove() // remove the data element to hide the raw data
                    // do this manually
                    this.tryLoadCircuitFromData()
                    this.doRedraw()
                    return true
                } else {
                    return false
                }
            }

            // try to load from the children of the light DOM,
            // but this has to be done later as it hasn't been parsed yet
            setTimeout(() => {
                const loaded = tryLoadFromLightDOM()

                // sometimes the light DOM is not parsed yet, so try again a bit later
                if (!loaded) {
                    setTimeout(() => {
                        tryLoadFromLightDOM()
                    }, 100)
                }
            })
        }

        const setCaption = (buttonId: string, strings: string | [string, string]) => {
            const elem = this.elemWithId(buttonId)
            const [name, tooltip] = isString(strings) ? [strings, undefined] : strings
            elem.insertAdjacentText("beforeend", name)
            if (tooltip !== undefined) {
                elem.setAttribute("title", tooltip)
            }
        }

        {
            // set strings in the UI
            const s = S.Palette
            setCaption("editToolButton", s.Design)
            setCaption("deleteToolButton", s.Delete)
            setCaption("moveToolButton", s.Move)
            setCaption("saveToolButton", s.Download)
            setCaption("screenshotToolButton", s.Screenshot)
            setCaption("openToolButton", s.Open)
            setCaption("resetToolButtonCaption", s.Reset)
            setCaption("settingsTitle", S.Settings.Settings)
        }

        {
            const s = S.Dialogs.Share
            setCaption("shareDialogTitle", s.title)
            setCaption("shareDialogUrl", s.URL)
            setCaption("shareDialogIframe", s.EmbedInIframe)
            setCaption("shareDialogWebComp", s.EmbedWithWebComp)
            setCaption("shareDialogMarkdown", s.EmbedInMarkdown)
            setCaption("shareDialogClose", S.Dialogs.Generic.Close)
        }

        makeComponentMenuInto(this.html.leftToolbar, this._options.showOnly)

        // TODO move this to the Def of LabelRect to be cleaner
        const groupButton = this.html.leftToolbar.querySelector("button.sim-component-button[data-type=rect]")
        if (groupButton === null) {
            console.log("ERROR: Could not find group button")
        } else {
            groupButton.addEventListener("mousedown", this.wrapHandler(e => {
                const selectedComps = this.cursorMovementMgr.currentSelection?.previouslySelectedElements || new Set()
                if (selectedComps.size !== 0) {
                    e.preventDefault()
                    e.stopImmediatePropagation()

                    const newGroup = RectangleDef.make<Rectangle>(this)
                    newGroup.setSpawned()

                    if (newGroup instanceof Rectangle) {
                        newGroup.wrapContents(selectedComps)
                    } else {
                        console.log("ERROR: created component is not a LabelRect")
                    }
                }
            }))
        }

        this.cursorMovementMgr.registerButtonListenersOn(this.root.querySelectorAll(".sim-component-button"))

        const modifButtons = this.root.querySelectorAll<HTMLElement>("button.sim-modification-tool")
        for (const but of modifButtons) {
            but.addEventListener("click", e => {
                this.setActiveTool(but, e)
            })
        }

        const showModeChange = this._maxInstanceMode >= Mode.FULL
        if (showModeChange) {
            const modeChangeMenu: HTMLElement = this.elemWithId("modeChangeMenu")!
            div(cls("btn-group-vertical"),
                div(style("text-align: center; width: 100%; font-weight: bold; font-size: 80%; color: #666; padding: 2px;"),
                    "Mode",
                ),
                ...[Mode.FULL, Mode.DESIGN, Mode.CONNECT, Mode.TRYOUT, Mode.STATIC].map((buttonMode) => {
                    const [[modeTitle, expl], addElem] = (() => {
                        switch (buttonMode) {
                            case Mode.FULL: {
                                const optionsDiv =
                                    div(cls("sim-mode-link"),
                                        title(S.Settings.Settings),
                                        makeIcon("settings")
                                    ).render()

                                optionsDiv.addEventListener("click", () => {
                                    setVisible(this.html.optionsZone, true)
                                })

                                return [S.Modes.FULL, optionsDiv]
                            }
                            case Mode.DESIGN: return [S.Modes.DESIGN, emptyMod]
                            case Mode.CONNECT: return [S.Modes.CONNECT, emptyMod]
                            case Mode.TRYOUT: return [S.Modes.TRYOUT, emptyMod]
                            case Mode.STATIC: return [S.Modes.STATIC, emptyMod]
                        }
                    })()

                    const copyLinkDiv =
                        div(cls("sim-mode-link"),
                            title("Copie un lien vers ce contenu dans ce mode"),
                            makeIcon("link"),
                        ).render()

                    copyLinkDiv.addEventListener("click", __ => {
                        this.shareSheetForMode(buttonMode)
                    })

                    const switchToModeDiv =
                        div(cls("btn btn-sm btn-outline-light sim-toolbar-button-right sim-mode-tool"),
                            style("display: flex; justify-content: space-between; align-items: center"),
                            attrBuilder("mode")(Mode[buttonMode]),
                            title(expl),
                            modeTitle,
                            addElem,
                            copyLinkDiv
                        ).render()

                    switchToModeDiv.addEventListener("click", this.wrapHandler(() => this.setMode(buttonMode)))

                    return switchToModeDiv
                })
            ).applyTo(modeChangeMenu)
            setVisible(modeChangeMenu, true)
        }

        // this.html.embedUrlQRCode.addEventListener("click", __ => {
        //     // download
        //     const dataUrl = this.html.embedUrlQRCode.src
        //     const filename = (this.options.name ?? "circuit") + "_qrcode.png"
        //     downloadDataUrl(dataUrl, filename)
        // })

        const selectAllListener = (e: Event) => {
            const textArea = e.target as HTMLTextAreaElement
            textArea.focus()
            textArea.select()
            e.preventDefault()
        }
        for (const textArea of [this.html.embedUrl, this.html.embedIframe, this.html.embedWebcomp, this.html.embedMarkdown]) {
            textArea.addEventListener("pointerdown", selectAllListener)
            textArea.addEventListener("focus", selectAllListener)
        }


        const timelineControls: HTMLElement = this.elemWithId("timelineControls")!
        const makeRightControlButton = (icon: IconName, [text, expl]: [string | undefined, string], action: () => unknown) => {
            const but =
                button(cls("btn btn-sm btn-outline-light sim-toolbar-button-right"),
                    text === undefined ? style("text-align: center") : emptyMod,
                    title(expl),
                    makeIcon(icon, 20, 20),
                    text === undefined ? raw("&nbsp;") : text,
                ).render()
            but.addEventListener("click", this.wrapHandler(action))
            return but
        }
        const playButton = makeRightControlButton("play", S.ControlBar.TimelinePlay, () => this.timeline.play())
        const pauseButton = makeRightControlButton("pause", S.ControlBar.TimelinePause, () => this.timeline.pause())
        const stepButton = makeRightControlButton("step", S.ControlBar.TimelineStep, () => this.timeline.step())
        applyModifierTo(timelineControls, mods(playButton, pauseButton, stepButton))

        const showTimelineButtons = true
        setVisible(timelineControls, showTimelineButtons)

        const setTimelineButtonsVisible = ({ enablesPause, hasCallbacks, isPaused, nextStepDesc }: TimelineState) => {
            if (enablesPause || (this.options.allowPausePropagation && hasCallbacks)) {
                // show part of the interface
                setVisible(playButton, isPaused)
                setVisible(pauseButton, !isPaused)
                setVisible(stepButton, nextStepDesc !== undefined)
                stepButton.title = S.ControlBar.TimelineStep[1] + "\n" + (nextStepDesc ?? "")
            } else {
                // show nothing
                setVisible(playButton, false)
                setVisible(pauseButton, false)
                setVisible(stepButton, false)
            }
        }

        this.timeline.reset()
        this.timeline.onStateChanged = newState => setTimelineButtonsVisible(newState)
        setTimelineButtonsVisible(this.timeline.state)

        const undoRedoControls: HTMLElement = this.elemWithId("undoRedoControls")!
        const undoButton = makeRightControlButton("undo", S.ControlBar.Undo, this.wrapHandler(() => this.undoMgr.undo()))
        const redoButton = makeRightControlButton("redo", S.ControlBar.Redo, this.wrapHandler(() => this.undoMgr.redoOrRepeat()))

        const setUndoButtonsVisible = (state: UndoState) => {
            setEnabled(undoButton, state.canUndo)
            setEnabled(redoButton, state.canRedoOrRepeat)
        }

        applyModifierTo(undoRedoControls, mods(undoButton, redoButton))
        setUndoButtonsVisible({ canUndo: false, canRedoOrRepeat: false })
        this.undoMgr.onStateChanged = setUndoButtonsVisible


        // Options
        const optionsZone = this.html.optionsZone
        optionsZone.querySelector("#closeOptions")?.addEventListener("click", () => {
            setVisible(optionsZone, false)
        })

        const makeCheckbox = <K extends KeysOfByType<EditorOptions, boolean>>(optionName: K, [title, mouseover]: [string, string], hide = false) => {
            const checkbox = input(type("checkbox")).render()
            if (this.options[optionName] === true) {
                checkbox.checked = true
            }
            checkbox.addEventListener("change", this.wrapHandler(() => {
                this._options[optionName] = checkbox.checked
                this.redrawMgr.addReason("option changed: " + optionName, null)
            }))
            const section = div(
                style("height: 20px"),
                label(checkbox, span(style("margin-left: 4px"), attr("title", mouseover), title))
            ).render()
            optionsZone.appendChild(section)
            if (hide) {
                setVisible(section, false)
            }
            return checkbox
        }

        const nameField = input(type("text"),
            style("margin-left: 4px"),
            attr("value", this.options.name ?? ""),
            attr("placeholder", "circuit"),
            attr("title", S.Settings.NameOfDownloadedFile),
        ).render()
        nameField.addEventListener("change", () => {
            const newName = nameField.value
            this._options.name = newName.length === 0 ? undefined : newName
            this.setDocumentName(this._options.name)
        })
        optionsZone.appendChild(
            div(
                style("height: 20px; margin-bottom: 4px"),
                S.Settings.CircuitName, nameField
            ).render()
        )

        const hideWireColorsCheckbox = makeCheckbox("hideWireColors", S.Settings.hideWireColors)
        const hideInputColorsCheckbox = makeCheckbox("hideInputColors", S.Settings.hideInputColors)
        const hideOutputColorsCheckbox = makeCheckbox("hideOutputColors", S.Settings.hideOutputColors)
        const hideMemoryContentCheckbox = makeCheckbox("hideMemoryContent", S.Settings.hideMemoryContent)
        const showGateTypesCheckbox = makeCheckbox("showGateTypes", S.Settings.showGateTypes)
        const showDisconnectedPinsCheckbox = makeCheckbox("showDisconnectedPins", S.Settings.showDisconnectedPins)
        const hideTooltipsCheckbox = makeCheckbox("hideTooltips", S.Settings.hideTooltips)
        const groupParallelWiresCheckbox = makeCheckbox("groupParallelWires", S.Settings.groupParallelWires, true)
        // 
        const wireStylePopup = select(
            option(attr("value", WireStyles.auto), S.Settings.WireStyleAuto),
            option(attr("value", WireStyles.straight), S.Settings.WireStyleLine),
            option(attr("value", WireStyles.bezier), S.Settings.WireStyleCurve),
        ).render()
        wireStylePopup.addEventListener("change", this.wrapHandler(() => {
            this._options.wireStyle = wireStylePopup.value as WireStyle
            this.redrawMgr.addReason("wire style changed", null)
        }))
        optionsZone.appendChild(
            div(
                style("height: 20px"),
                S.Settings.wireStyle + " ", wireStylePopup
            ).render()
        )

        const propagationDelayField = input(type("number"),
            style("margin: 0 4px; width: 4em"),
            attr("min", "0"), attr("step", "50"),
            attr("value", String(this.options.propagationDelay)),
            attr("title", S.Settings.propagationDelay),
        ).render()
        propagationDelayField.addEventListener("change", () => {
            this._options.propagationDelay = propagationDelayField.valueAsNumber
        })
        optionsZone.appendChild(
            div(
                style("height: 20px"),
                S.Settings.propagationDelayField[0], propagationDelayField, S.Settings.propagationDelayField[1]
            ).render()
        )

        const zoomLevelField = input(type("number"),
            style("margin: 0 2px 0 5px; width: 4em"),
            attr("min", "0"), attr("step", "10"),
            attr("value", String(this.options.zoom)),
            attr("title", S.Settings.zoomLevel),
        ).render()
        zoomLevelField.addEventListener("change", this.wrapHandler(() => {
            const zoom = zoomLevelField.valueAsNumber
            this._options.zoom = zoom
            this._actualZoomFactor = clampZoom(zoom)
            this.redrawMgr.addReason("zoom level changed", null)
        }))
        optionsZone.appendChild(
            div(
                style("height: 20px"),
                S.Settings.zoomLevelField[0], zoomLevelField, S.Settings.zoomLevelField[1]
            ).render()
        )

        const showUserdataLink = a(S.Settings.showUserDataLink[1], style("text-decoration: underline; cursor: pointer")).render()
        showUserdataLink.addEventListener("click", () => {
            alert(S.Settings.userDataHeader + "\n\n" + JSON5.stringify(this.userdata, undefined, 4))
        })
        const showUserDataLinkContainer = div(
            style("margin-top: 5px; display: none"),
            S.Settings.showUserDataLink[0], showUserdataLink,
        ).render()
        optionsZone.appendChild(showUserDataLinkContainer)

        this.optionsHtml = {
            undoButton,
            redoButton,

            nameField,
            hideWireColorsCheckbox,
            hideInputColorsCheckbox,
            hideOutputColorsCheckbox,
            hideMemoryContentCheckbox,
            wireStylePopup,
            showGateTypesCheckbox,
            showDisconnectedPinsCheckbox,
            hideTooltipsCheckbox,
            groupParallelWiresCheckbox,
            propagationDelayField,
            zoomLevelField,
            showUserDataLinkContainer,
        }

        // this is called once here to set the initial transform and size before the first draw, and again later
        this.setCanvasSize()

        this.tryLoadCircuitFromData()
        // also triggers redraw, should be last thing called here

        this.setModeFromString(this.getAttribute(ATTRIBUTE_NAMES.mode))

        // this is called a second time here because the canvas width may have changed following the mode change
        this.setCanvasSize()
        LogicEditor.installGlobalListeners()

        this.doRedraw()
    }

    private findLightDOMChild<K extends keyof HTMLElementTagNameMap>(tagName: K): HTMLElementTagNameMap[K] | null {
        const TAGNAME = tagName.toUpperCase()
        for (const child of this.children) {
            if (child.tagName === TAGNAME) {
                return child as HTMLElementTagNameMap[K]
            }
        }
        return null
    }

    public static installGlobalListeners() {
        if (LogicEditor._globalListenersInstalled) {
            return
        }

        window.decompress = LZString.decompressFromEncodedURIComponent
        window.decodeOld = LogicEditor.decodeFromURLOld

        window.formatString = formatString

        // make gallery available globally
        window.gallery = gallery

        window.addEventListener("mousemove", e => {
            // console.log({ x: e.clientX, y: e.clientY })
            for (const editor of LogicEditor._allConnectedEditors) {
                const canvasContainer = editor.html.canvasContainer
                if (canvasContainer !== undefined) {
                    const canvasPos = canvasContainer.getBoundingClientRect()
                    // console.log(canvasContainer.getBoundingClientRect(), { x: e.clientX - canvasPos.left, y: e.clientY - canvasPos.top })
                    editor.mouseX = e.clientX - canvasPos.left
                    editor.mouseY = e.clientY - canvasPos.top
                }
            }
            // console.log("--")
        }, true)

        window.addEventListener("resize", () => {
            for (const editor of LogicEditor._allConnectedEditors) {
                const canvasContainer = editor.html.canvasContainer
                if (canvasContainer !== undefined) {
                    editor.wrapHandler(() => {
                        editor.setCanvasSize()
                        editor.redrawMgr.addReason("window resized", null)
                    })()
                }
            }
            registerPixelRatioListener()
        })

        let pixelRatioMediaQuery: undefined | MediaQueryList
        const registerPixelRatioListener = () => {
            if (pixelRatioMediaQuery !== undefined) {
                pixelRatioMediaQuery.onchange = null
            }

            const queryString = `(resolution: ${window.devicePixelRatio}dppx)`
            pixelRatioMediaQuery = window.matchMedia(queryString)
            pixelRatioMediaQuery.onchange = () => {
                for (const editor of LogicEditor._allConnectedEditors) {
                    editor.wrapHandler(() => {
                        editor.redrawMgr.addReason("devicePixelRatio changed", null)
                    })()
                }
                registerPixelRatioListener()
            }
        }
        registerPixelRatioListener()

        document.body.addEventListener("themechanged", (e) => {
            const isDark = Boolean((e as any).detail?.is_dark_theme)
            setColors(isDark)
        })

        LogicEditor._globalListenersInstalled = true
    }

    public setMode(mode: Mode) {
        this.wrapHandler(() => {
            let wantedModeStr = Mode[mode]
            if (mode > this._maxInstanceMode) {
                mode = this._maxInstanceMode
                console.log(`Cannot switch to mode ${wantedModeStr} because we are capped by ${Mode[this._maxInstanceMode]}`)
                wantedModeStr = Mode[mode]
            }
            this._mode = mode

            // console.log(`Display/interaction is ${wantedModeStr} - ${mode}`)

            this.redrawMgr.addReason("mode changed", null)

            // update mode active button
            this.root.querySelectorAll(".sim-mode-tool").forEach((elem) => {
                if (elem.getAttribute("mode") === wantedModeStr) {
                    elem.classList.add("active")
                } else {
                    elem.classList.remove("active")
                }
            })

            if (mode < Mode.CONNECT) {
                this.setCurrentMouseAction("edit")
            }

            type LeftMenuDisplay = "show" | "hide" | "inactive"

            const showLeftMenu: LeftMenuDisplay =
                (this._maxInstanceMode !== Mode.FULL)
                    ? (mode >= Mode.DESIGN) ? "show" : "hide"
                    : (mode >= Mode.DESIGN) ? "show" : "inactive"

            const showRightEditControls = mode >= Mode.CONNECT
            const modifButtons = this.root.querySelectorAll<HTMLElement>("button.sim-modification-tool")

            for (const but of modifButtons) {
                setVisible(but, showRightEditControls)
            }

            const showReset = mode >= Mode.TRYOUT && !this._hideResetButton
            const showUndoRedo = mode >= Mode.CONNECT
            const showRightMenu = showReset || showRightEditControls || showUndoRedo
            const showOnlyReset = showReset && !showRightEditControls
            const hideSettings = mode < Mode.FULL

            setVisible(this.optionsHtml!.undoButton, showUndoRedo)
            setVisible(this.optionsHtml!.redoButton, showUndoRedo)
            setVisible(this.elemWithId("resetToolButton"), showReset)
            setVisible(this.elemWithId("resetToolButtonCaption"), !showOnlyReset)
            setVisible(this.elemWithId("resetToolButtonDummyCaption"), showOnlyReset)

            if (hideSettings) {
                setVisible(this.html.optionsZone, false)
            }

            const leftToolbar = this.html.leftToolbar
            switch (showLeftMenu) {
                case "hide":
                    leftToolbar.style.removeProperty("visibility")
                    leftToolbar.style.display = "none"
                    break
                case "show":
                    leftToolbar.style.removeProperty("visibility")
                    leftToolbar.style.removeProperty("display")
                    break
                case "inactive":
                    leftToolbar.style.visibility = "hidden"
                    leftToolbar.style.removeProperty("display")
                    break
            }

            // const showTxGates = mode >= Mode.FULL && (showOnly === undefined || showOnly.includes("TX") || showOnly.includes("TXA"))
            // const txGateButton = this.root.querySelector("button[data-type=TXA]") as HTMLElement
            // setVisible(txGateButton, showTxGates)

            const rightToolbarContainer: HTMLElement = this.elemWithId("rightToolbarContainer")
            setVisible(rightToolbarContainer, showRightMenu)
        })()
    }

    public setModeFromString(modeStr: string | null) {
        let mode: Mode = this._maxInstanceMode
        if (modeStr !== null && (modeStr = modeStr.toUpperCase()) in Mode) {
            mode = (Mode as any)[modeStr]
        }
        this.setMode(mode)
    }

    public updateCustomComponentButtons() {
        // TODO
        const customDefs = this.factory.customDefs()
        if (customDefs === undefined) {
            console.log("no custom components")
        } else {
            console.log("Custom components:")
            for (const customDef of customDefs) {
                console.log("  " + customDef.id)
            }
        }
    }

    public tryLoadFrom(file: File) {
        if (file.type === "application/json" || file.type === "text/plain") {
            // JSON files can be circuits or libraries
            const reader = new FileReader()
            reader.onload = () => {
                const content = reader.result?.toString()
                if (content !== undefined) {
                    if (file.name.endsWith("lib.json")) {
                        Serialization.loadLibrary(this, content)
                    } else {
                        this.loadCircuit(content)
                    }
                }
            }
            reader.readAsText(file, "utf-8")

        } else if (file.type === "image/png") {
            // PNG files may contain a circuit in the metadata
            const reader = new FileReader()
            reader.onload = () => {
                const content = reader.result
                if (content instanceof ArrayBuffer) {
                    const uintArray2 = new Uint8Array(content)
                    const pngMetadata = pngMeta.readMetadata(uintArray2)
                    const compressedJSON = pngMetadata.tEXt?.Description
                    if (isString(compressedJSON)) {
                        this._initialData = { _type: "compressed", str: compressedJSON }
                        this.wrapHandler(() => {
                            this.tryLoadCircuitFromData()
                        })()
                    }
                }
            }
            reader.readAsArrayBuffer(file)

        } else if (file.type === "image/svg+xml") {
            // SVG files may contain a circuit in the metadata
            const reader = new FileReader()
            reader.onload = e => {
                const content = e.target?.result?.toString()
                if (content !== undefined) {

                    const temp = document.createElement("div")
                    temp.innerHTML = content
                    const metadata = temp.querySelector("svg metadata")
                    const json = metadata?.textContent
                    temp.remove()
                    if (json !== undefined && json !== null) {
                        this.loadCircuit(json)
                    }
                }
            }
            reader.readAsText(file, "utf-8")

        } else {
            console.warn("Unsupported file type", file.type)
        }
    }

    public tryLoadCircuitFromData() {
        if (this._initialData === undefined) {
            return
        }

        if (this._initialData._type === "url") {
            // load from URL
            const url = this._initialData.url
            // will only work within the same domain for now
            fetch(url, { mode: "cors" }).then(response => response.text()).then(json => {
                console.log(`Loaded initial data from URL '${url}'`)
                this._initialData = { _type: "json", json }
                this.tryLoadCircuitFromData()
            })

            // TODO try fetchJSONP if this fails?

            return
        }

        let error: undefined | string = undefined

        if (this._initialData._type === "json") {
            // already decompressed
            try {
                error = Serialization.loadCircuit(this, this._initialData.json)
            } catch (e) {
                error = String(e) + " (JSON)"
            }

        } else {
            let decodedData
            try {
                decodedData = LZString.decompressFromEncodedURIComponent(this._initialData.str)
                if (this._initialData.str.length !== 0 && (decodedData?.length ?? 0) === 0) {
                    throw new Error("zero decoded length")
                }
            } catch (err) {
                error = String(err) + " (LZString)"

                // try the old, uncompressed way of storing the data in the URL
                try {
                    decodedData = LogicEditor.decodeFromURLOld(this._initialData.str)
                    error = undefined
                } catch (e) {
                    // swallow error from old format
                }
            }

            if (error === undefined && isString(decodedData)) {
                // remember the decompressed/decoded value
                error = Serialization.loadCircuit(this, decodedData)
                if (error === undefined) {
                    this._initialData = { _type: "json", json: decodedData }
                }
            }
        }


        if (error !== undefined) {
            console.log("ERROR could not not load initial data: " + error)
        }
    }

    public loadCircuit(jsonStringOrObject: string | Record<string, unknown>) {
        this.wrapHandler(
            (jsonStringOrObject: string | Record<string, unknown>) =>
                Serialization.loadCircuit(this, jsonStringOrObject)
        )(jsonStringOrObject)
    }

    public setDirty(__reason: string) {
        if (this.mode >= Mode.CONNECT) {
            // other modes can't be dirty
            this._isDirty = true
        }
    }

    public setDark(dark: boolean) {
        this.html.rootDiv.classList.toggle("dark", dark)
    }

    public tryDeleteDrawable(comp: Drawable): InteractionResult {
        if (comp instanceof ComponentBase) {
            const numDeleted = this.tryDeleteComponentsWhere(c => c === comp, true)
            return InteractionResult.fromBoolean(numDeleted !== 0)
        } else if (comp instanceof Wire) {
            return this.wireMgr.deleteWire(comp)
        } else if (comp instanceof Waypoint) {
            comp.removeFromParent()
            return InteractionResult.SimpleChange
        }
        return InteractionResult.NoChange
    }

    public tryDeleteComponentsWhere(cond: (e: Component) => boolean, onlyOne: boolean) {
        const numDeleted = this.components.tryDeleteWhere(cond, onlyOne)
        if (numDeleted > 0) {
            this.cursorMovementMgr.clearPopperIfNecessary()
            this.redrawMgr.addReason("component(s) deleted", null)
        }
        return numDeleted
    }

    public setCurrentMouseAction(action: MouseAction) {
        this._currentMouseAction = action
        this.setToolCursor(MouseActions.props[action].cursor)

        const toolButtons = this.root.querySelectorAll<HTMLElement>(".sim-modification-tool")
        for (const toolButton of toolButtons) {
            const setActive = toolButton.getAttribute("tool") === action
            if (setActive) {
                toolButton.classList.add("active")
            } else {
                toolButton.classList.remove("active")
            }
        }

        this.cursorMovementMgr.setHandlersFor(action)
        this.redrawMgr.addReason("mouse action changed", null)
    }

    public updateCursor(e?: MouseEvent | TouchEvent) {
        this.html.canvasContainer.style.cursor =
            this.moveMgr.areDrawablesMoving()
                ? "grabbing"
                : this._toolCursor
                ?? this.cursorMovementMgr.currentMouseOverComp?.cursorWhenMouseover(e)
                ?? "default"
    }

    public lengthOfPath(svgPathDesc: string): number {
        const p = this.html.hiddenPath
        p.setAttribute("d", svgPathDesc)
        const length = p.getTotalLength()
        // console.log(`p=${svgPathDesc}, l=${length}`)
        return length
    }

    public offsetXYForContextMenu(e: MouseEvent | TouchEvent, snapToGrid = false): [number, number] {
        const mainCanvas = this.html.mainCanvas
        let x, y

        if ("offsetX" in e && e.offsetX === 0 && e.offsetY === 0 && e.target === mainCanvas) {
            const canvasRect = mainCanvas.getBoundingClientRect()
            x = e.clientX - canvasRect.x
            y = e.clientY - canvasRect.y
        } else {
            [x, y] = this.offsetXY(e)
        }

        if (snapToGrid) {
            x = Math.round(x / GRID_STEP) * GRID_STEP
            y = Math.round(y / GRID_STEP) * GRID_STEP
        }
        return [x, y]
    }

    public offsetXY(e: MouseEvent | TouchEvent): [number, number] {
        const [unscaledX, unscaledY] = (() => {
            const mainCanvas = this.html.mainCanvas
            let target = e.target
            if ("offsetX" in e) {
                // MouseEvent
                const canvasRect = mainCanvas.getBoundingClientRect()
                let offsetX = e.offsetX
                let offsetY = e.offsetY

                // fix for firefox having always 0 offsetX,Y
                if (offsetX === 0 && offsetY === 0) {
                    const _e = e as any
                    if ("_savedOffsetX" in _e) {
                        offsetX = _e._savedOffsetX
                        offsetY = _e._savedOffsetY
                        target = _e._savedTarget
                    } else if ("layerX" in e) {
                        // This should never happen and is actually wrong, because we assume 
                        offsetX = _e.layerX + canvasRect.x
                        offsetY = _e.layerY + canvasRect.y
                    }
                }

                if (target === mainCanvas) {
                    return [offsetX, offsetY]
                } else {
                    const elemRect = (target as HTMLElement).getBoundingClientRect()
                    return [
                        Math.max(GRID_STEP * 2, offsetX + elemRect.x - canvasRect.x),
                        Math.max(GRID_STEP * 2, offsetY + elemRect.y - canvasRect.y),
                    ]
                }
            } else {
                const elemRect = (target as HTMLElement).getBoundingClientRect()
                const bodyRect = document.body.getBoundingClientRect()
                const touch = e.changedTouches[0]
                const offsetX = touch.pageX - (elemRect.left - bodyRect.left)
                const offsetY = touch.pageY - (elemRect.top - bodyRect.top)

                if (target === mainCanvas) {
                    return [offsetX, offsetY]
                } else {
                    const canvasRect = mainCanvas.getBoundingClientRect()
                    return [
                        Math.max(GRID_STEP * 2, offsetX + elemRect.x - canvasRect.x),
                        Math.max(GRID_STEP * 2, offsetY + elemRect.y - canvasRect.y),
                    ]
                }
            }
        })()
        const currentScale = this._actualZoomFactor
        return [unscaledX / currentScale, unscaledY / currentScale]
    }

    public offsetXYForComponent(e: MouseEvent | TouchEvent, comp: Component): [number, number] {
        const offset = this.offsetXY(e)
        if (comp.orient === Orientation.default) {
            return offset
        }
        const [x, y] = offset
        const dx = x - comp.posX
        const dy = y - comp.posY
        switch (comp.orient) {
            case "e": return offset // done before anyway
            case "w": return [comp.posX - dx, comp.posY - dy]
            case "s": return [comp.posX - dy, comp.posY - dx]
            case "n": return [comp.posX + dy, comp.posY + dx]
        }
    }

    private guessAdequateCanvasSize(applyZoom: boolean): [number, number] {
        let rightmostX = Number.NEGATIVE_INFINITY, leftmostX = Number.POSITIVE_INFINITY
        let lowestY = Number.NEGATIVE_INFINITY, highestY = Number.POSITIVE_INFINITY
        for (const comp of this.components.all()) {
            const cx = comp.posX
            const width = comp.width
            const left = cx - width / 2
            const right = left + width
            if (right > rightmostX) {
                rightmostX = right
            }
            if (left < leftmostX) {
                leftmostX = left
            }

            const cy = comp.posY
            const height = comp.height
            const top = cy - height / 2
            const bottom = top + height
            if (bottom > lowestY) {
                lowestY = bottom
            }
            if (top < highestY) {
                highestY = top
            }
        }
        leftmostX = Math.max(0, leftmostX)
        let w = rightmostX + leftmostX // add right margin equal to left margin
        if (isNaN(w)) {
            w = 300
        }
        highestY = Math.max(0, highestY)
        let h = highestY + lowestY // add lower margin equal to top margin
        if (isNaN(h)) {
            h = 150
        }
        const f = applyZoom ? this._actualZoomFactor : 1
        return [f * w, f * h]
    }

    public async shareSheetForMode(mode: Mode) {
        if (this._mode > MAX_MODE_WHEN_EMBEDDED) {
            this._mode = MAX_MODE_WHEN_EMBEDDED
        }
        const modeStr = Mode[mode].toLowerCase()
        const [fullJson, compressedUriSafeJson] = this.fullJsonStateAndCompressedForUri()

        console.log("JSON:\n" + fullJson)

        const fullUrl = this.fullUrlForMode(mode, compressedUriSafeJson)
        this.html.embedUrl.value = fullUrl

        const modeParam = mode === MAX_MODE_WHEN_EMBEDDED ? "" : `:mode: ${modeStr}\n`
        const embedHeight = this.guessAdequateCanvasSize(true)[1]

        const markdownBlock = `\`\`\`{logic}\n:height: ${embedHeight}\n${modeParam}\n${fullJson}\n\`\`\``
        this.html.embedMarkdown.value = markdownBlock

        const iframeEmbed = `<iframe style="width: 100%; height: ${embedHeight}px; border: 0" src="${fullUrl}"></iframe>`
        this.html.embedIframe.value = iframeEmbed

        const webcompEmbed = `<div style="width: 100%; height: ${embedHeight}px">\n  <logic-editor mode="${Mode[mode].toLowerCase()}">\n    <script type="application/json">\n      ${fullJson.replace(/\n/g, "\n      ")}\n    </script>\n  </logic-editor>\n</div>`
        this.html.embedWebcomp.value = webcompEmbed


        // const dataUrl = await QRCode.toDataURL(fullUrl, { margin: 0, errorCorrectionLevel: 'L' })
        // const qrcodeImg = this.html.embedUrlQRCode
        // qrcodeImg.src = dataUrl

        this.saveToUrl(compressedUriSafeJson)

        if (!showModal(this.html.embedDialog)) {
            // alert("The <dialog> API is not supported by this browser")

            // TODO show the info some other way

            if (copyToClipboard(fullUrl)) {
                console.log("  -> Copied!")
            } else {
                console.log("  -> Could not copy!")
            }
        }
    }

    public saveCurrentStateToUrl() {
        const [fullJson, compressedUriSafeJson] = this.fullJsonStateAndCompressedForUri()
        console.log("Saved to URL compressed version of:\n" + fullJson)
        this.saveToUrl(compressedUriSafeJson)
    }

    public save() {
        return Serialization.buildCircuitObject(this)
    }

    public saveToUrl(compressedUriSafeJson: string) {
        if (this._isSingleton) {
            history.pushState(null, "", this.fullUrlForMode(MAX_MODE_WHEN_SINGLETON, compressedUriSafeJson))
            this._isDirty = false
        }
    }

    private fullJsonStateAndCompressedForUri(): [string, string] {
        const jsonObj = Serialization.buildCircuitObject(this)
        const jsonFull = Serialization.stringifyObject(jsonObj, false)
        Serialization.removeShowOnlyFrom(jsonObj)
        const jsonForUri = Serialization.stringifyObject(jsonObj, true)

        // We did this in the past, but now we're compressing things a bit
        // const encodedJson1 = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "%3D")

        // this can compress to like 40-50% of the original size
        const compressedUriSafeJson = LZString.compressToEncodedURIComponent(jsonForUri)
        return [jsonFull, compressedUriSafeJson]
    }

    private fullUrlForMode(mode: Mode, compressedUriSafeJson: string): string {
        const loc = window.location
        const showOnlyParam = this._options.showOnly === undefined ? "" : `&${ATTRIBUTE_NAMES.showonly}=${this._options.showOnly.join(",")}`
        const currentLang = getLang()
        const hasCorrectLangParam = new URL(loc.href).searchParams.get(ATTRIBUTE_NAMES.lang) === currentLang
        const langParam = !hasCorrectLangParam ? "" // no param, keep default lang
            : `&${ATTRIBUTE_NAMES.lang}=${currentLang}` // keep currently set lang
        return `${loc.protocol}//${loc.host}${loc.pathname}?${ATTRIBUTE_NAMES.mode}=${Mode[mode].toLowerCase()}${langParam}${showOnlyParam}&${ATTRIBUTE_NAMES.data}=${compressedUriSafeJson}`
    }

    public toBase64(blob: Blob | null | undefined): Promise<string | undefined> {
        return new Promise((resolve, __) => {
            if (blob === null || blob === undefined) {
                resolve(undefined)
                return
            }
            const reader = new FileReader()
            reader.onloadend = () => {
                const dataURL = reader.result as string
                const asBase64 = dataURL.substring(dataURL.indexOf(",") + 1)
                resolve(asBase64)
            }
            reader.readAsDataURL(blob)
        })
    }

    public async toPNG(withMetadata: boolean, heightHint?: number): Promise<Blob | undefined> {
        const pngBareBlob = await new Promise<Blob | null>((resolve) => {
            const drawingScale = 3 // super retina
            let [width, height] = this.guessAdequateCanvasSize(false)
            if (heightHint !== undefined) {
                height = heightHint
            }
            width *= drawingScale
            height *= drawingScale

            const transform = new DOMMatrix(`scale(${drawingScale})`)

            const tmpCanvas = document.createElement('canvas')
            tmpCanvas.width = width
            tmpCanvas.height = height

            const g = LogicEditor.getGraphics(tmpCanvas)
            const wasDark = isDarkMode()
            if (wasDark) {
                setColors(false)
            }
            this.doDrawWithContext(g, width, height, transform, transform, true, true)
            if (wasDark) {
                setColors(true)
            }
            tmpCanvas.toBlob(resolve, 'image/png')
            tmpCanvas.remove()
        })

        if (pngBareBlob === null) {
            return undefined
        }

        if (!withMetadata) {
            return pngBareBlob
        }

        // else, add metadata
        const compressedUriSafeJson = this.fullJsonStateAndCompressedForUri()[1]
        const pngBareData = new Uint8Array(await pngBareBlob.arrayBuffer())
        const pngChunks = pngMeta.extractChunks(pngBareData)
        pngMeta.insertMetadata(pngChunks, { "tEXt": { "Description": compressedUriSafeJson } })
        return new Blob([pngMeta.encodeChunks(pngChunks)], { type: "image/png" })
    }

    public async toSVG(withMetadata: boolean): Promise<Blob> {
        const metadata = !withMetadata ? undefined
            : Serialization.stringifyObject(Serialization.buildCircuitObject(this), false)

        const [width, height] = this.guessAdequateCanvasSize(false)
        const id = new DOMMatrix()
        const svgCtx = new SVGRenderingContext({ width, height, metadata })
        this.doDrawWithContext(svgCtx, width, height, id, id, true, true)
        const serializedSVG = svgCtx.getSerializedSvg()
        return Promise.resolve(new Blob([serializedSVG], { type: "image/svg+xml" }))
    }

    public async download(data: Promise<Blob | undefined>, extension: string) {
        const blob = await data
        if (blob === undefined) {
            return
        }
        const filename = (this.options.name ?? "circuit") + extension
        saveAs(blob, filename)
    }

    public recalcPropagateAndDrawIfNeeded() {
        if (this._nextAnimationFrameHandle !== null) {
            // an animation frame will be played soon anyway
            return
        }

        const __recalculated = this.recalcMgr.recalcAndPropagateIfNeeded()

        if (this.wireMgr.isAddingWire) {
            this.redrawMgr.addReason("adding a wire", null)
        }

        const redrawReasons = this.redrawMgr.getReasonsAndClear()
        if (redrawReasons === undefined) {
            return
        }

        // console.log("Drawing " + (__recalculated ? "with" : "without") + " recalc, reasons:\n    " + redrawReasons)
        this.doRedraw()

        if (this.redrawMgr.hasReasons()) {
            // an animation is running
            this._nextAnimationFrameHandle = requestAnimationFrame(() => {
                this._nextAnimationFrameHandle = null
                this.recalcPropagateAndDrawIfNeeded()
            })
        }
    }

    public highlight(refs: string | string[] | undefined) {
        if (refs === undefined) {
            this._highlightedItems = undefined
            return
        }

        if (isString(refs)) {
            refs = [refs]
        }

        const highlightComps: Component[] = []
        for (const comp of this.components.all()) {
            if (comp.ref !== undefined && refs.includes(comp.ref)) {
                highlightComps.push(comp)
            }
        }

        const highlightWires: Wire[] = []
        for (const wire of this.wireMgr.wires) {
            if (wire.ref !== undefined && refs.includes(wire.ref)) {
                highlightWires.push(wire)
            }
        }

        if (highlightComps.length === 0 && highlightWires.length === 0) {
            console.log(`Nothing to highlight for ref '${refs}'`)
            this._highlightedItems = undefined
            return
        }

        const start = this.timeline.unadjustedTime()
        this._highlightedItems = { comps: highlightComps, wires: highlightWires, start }
        this.redrawMgr.addReason("highlighting component", null)
        this.recalcPropagateAndDrawIfNeeded()
    }

    public redraw() {
        this.setCanvasSize()
        this.redrawMgr.addReason("explicit redraw call", null)
        this.recalcPropagateAndDrawIfNeeded()
    }

    private doRedraw() {
        // const timeBefore = performance.now()
        const g = LogicEditor.getGraphics(this.html.mainCanvas)
        const mainCanvas = this.html.mainCanvas
        const baseDrawingScale = this._baseDrawingScale

        const width = mainCanvas.width / baseDrawingScale
        const height = mainCanvas.height / baseDrawingScale
        const baseTransform = new DOMMatrix(`scale(${this._baseDrawingScale})`)
        const contentTransform = baseTransform.scale(this._actualZoomFactor)
        this.doDrawWithContext(g, width, height, baseTransform, contentTransform, false, false)
        // const timeAfter = performance.now()
        // console.log(`Drawing took ${timeAfter - timeBefore}ms`)
    }

    private doDrawWithContext(g: GraphicsRendering, width: number, height: number, baseTransform: DOMMatrixReadOnly, contentTransform: DOMMatrixReadOnly, skipBorder: boolean, transparentBackground: boolean) {
        g.setTransform(baseTransform)
        g.lineCap = "square"
        g.textBaseline = "middle"

        // clear background
        g.fillStyle = COLOR_BACKGROUND
        if (transparentBackground) {
            g.clearRect(0, 0, width, height)
        } else {
            g.fillRect(0, 0, width, height)
        }
        g.setTransform(contentTransform)

        // draw highlight
        const highlightRectFor = (comp: Component) => {
            const margin = 15
            let w = comp.unrotatedWidth + margin + margin
            let h = comp.unrotatedHeight + margin + margin
            if (Orientation.isVertical(comp.orient)) {
                const t = w
                w = h
                h = t
            }
            return new DOMRect(comp.posX - w / 2, comp.posY - h / 2, w, h)
        }

        const highlightedItems = this._highlightedItems
        let highlightColor: string | undefined = undefined
        if (highlightedItems !== undefined) {
            const HOLD_TIME = 2000
            const FADE_OUT_TIME = 200
            const START_ALPHA = 0.4
            const elapsed = this.timeline.unadjustedTime() - highlightedItems.start
            const highlightAlpha = (elapsed < HOLD_TIME) ? START_ALPHA : START_ALPHA * (1 - (elapsed - HOLD_TIME) / FADE_OUT_TIME)
            if (highlightAlpha <= 0) {
                this._highlightedItems = undefined
            } else {

                g.beginPath()
                for (const comp of highlightedItems.comps) {
                    const highlightRect = highlightRectFor(comp)
                    g.moveTo(highlightRect.x, highlightRect.y)
                    g.lineTo(highlightRect.right, highlightRect.y)
                    g.lineTo(highlightRect.right, highlightRect.bottom)
                    g.lineTo(highlightRect.x, highlightRect.bottom)
                    g.closePath()
                }

                highlightColor = `rgba(238,241,0,${highlightAlpha})`
                g.shadowColor = highlightColor
                g.shadowBlur = 20
                g.shadowOffsetX = 0
                g.shadowOffsetY = 0
                g.fillStyle = highlightColor
                g.fill()

                g.shadowBlur = 0 // reset

                // will make it run until alpha is 0
                this.redrawMgr.addReason("highlight animation", null)
            }
        }

        // draw grid if moving comps
        // this.moveMgr.dump()
        const isMovingComponent = this.moveMgr.areDrawablesMoving()
        if (isMovingComponent) {
            g.beginGroup("grid")
            const widthAdjusted = width / this._actualZoomFactor
            const heightAdjusted = height / this._actualZoomFactor
            const step = GRID_STEP //* 2
            g.strokeStyle = COLOR_GRID_LINES
            g.lineWidth = 1
            g.beginPath()
            for (let x = step; x < widthAdjusted; x += step) {
                g.moveTo(x, 0)
                g.lineTo(x, height)
            }
            for (let y = step; y < heightAdjusted; y += step) {
                g.moveTo(0, y)
                g.lineTo(width, y)
            }
            g.stroke()
            g.endGroup()
        }

        // draw guidelines when moving waypoint
        const singleMovingWayoint = this.moveMgr.getSingleMovingWaypoint()
        if (singleMovingWayoint !== undefined) {
            g.beginGroup("guides")
            const guides = singleMovingWayoint.getPrevAndNextAnchors()
            g.strokeStyle = COLOR_GRID_LINES_GUIDES
            g.lineWidth = 1.5
            g.beginPath()
            for (const guide of guides) {
                g.moveTo(guide.posX, 0)
                g.lineTo(guide.posX, height)
                g.moveTo(0, guide.posY)
                g.lineTo(width, guide.posY)
            }
            g.stroke()
            g.endGroup()
        }

        // draw border according to mode
        if (!skipBorder && (this._mode >= Mode.CONNECT || this._maxInstanceMode === MAX_MODE_WHEN_SINGLETON)) {
            g.beginGroup("border")
            g.setTransform(baseTransform)
            g.strokeStyle = COLOR_BORDER
            g.lineWidth = 2
            g.strokeRect(0, 0, width, height)
            if (this._maxInstanceMode === MAX_MODE_WHEN_SINGLETON && this._mode < this._maxInstanceMode) {
                const h = this.guessAdequateCanvasSize(true)[1]
                strokeSingleLine(g, 0, h, width, h)

                g.fillStyle = COLOR_BACKGROUND_UNUSED_REGION
                g.fillRect(0, h, width, height - h)
            }
            g.setTransform(contentTransform)
            g.endGroup()
        }

        // const currentScale = this._currentScale
        // g.scale(currentScale, currentScale)

        const drawTime = this.timeline.logicalTime()
        g.strokeStyle = COLOR_COMPONENT_BORDER
        const currentMouseOverComp = this.cursorMovementMgr.currentMouseOverComp
        const drawParams: DrawParams = {
            drawTime,
            currentMouseOverComp,
            highlightedItems,
            highlightColor,
            currentSelection: undefined,
            anythingMoving: this.moveMgr.areDrawablesMoving(),
        }
        const currentSelection = this.cursorMovementMgr.currentSelection
        drawParams.currentSelection = currentSelection
        const drawComp = (comp: Component) => {
            g.beginGroup(comp.constructor.name)
            try {
                comp.draw(g, drawParams)
                for (const node of comp.allNodes()) {
                    node.draw(g, drawParams) // never show nodes as selected
                }
            } finally {
                g.endGroup()
            }
        }

        // draw background components
        g.beginGroup("background")
        for (const comp of this.components.withZIndex(DrawZIndex.Background)) {
            drawComp(comp)
        }
        g.endGroup()

        // draw wires
        g.beginGroup("wires")
        this.wireMgr.draw(g, drawParams) // never show wires as selected
        g.endGroup()

        // draw normal components
        g.beginGroup("components")
        for (const comp of this.components.withZIndex(DrawZIndex.Normal)) {
            drawComp(comp)
        }
        g.endGroup()

        // draw overlays
        g.beginGroup("overlays")
        for (const comp of this.components.withZIndex(DrawZIndex.Overlay)) {
            drawComp(comp)
        }
        g.endGroup()

        // draw selection
        let selRect
        if (currentSelection !== undefined && (selRect = currentSelection.currentlyDrawnRect) !== undefined) {
            g.beginGroup("selection")
            g.lineWidth = 1.5
            g.strokeStyle = "rgb(100,100,255)"
            g.fillStyle = "rgba(100,100,255,0.2)"
            g.beginPath()
            g.rect(selRect.x, selRect.y, selRect.width, selRect.height)
            g.stroke()
            g.fill()
            g.endGroup()
        }

    }

    public cut() {
        // TODO stubs
        console.log("cut")
    }

    public copy() {
        if (this.cursorMovementMgr.currentSelection === undefined) {
            // copy URL
            copyToClipboard(window.location.href)
            return
        }
        // TODO stubs
        console.log("copy")
    }

    public paste() {
        // TODO stubs
        console.log("paste")
    }


    public wrapHandler<T extends unknown[], R>(f: (...params: T) => R): (...params: T) => R {
        return (...params: T) => {
            const result = f(...params)
            this.recalcPropagateAndDrawIfNeeded()
            return result
        }
    }

    public static decodeFromURLOld(str: string) {
        return decodeURIComponent(atob(str.replace(/-/g, "+").replace(/_/g, "/").replace(/%3D/g, "=")))
    }

    public static getGraphics(canvas: HTMLCanvasElement): GraphicsRendering {
        const g = canvas.getContext("2d")! as GraphicsRendering
        g.createPath = (path?: Path2D | string) => new Path2D(path)
        g.beginGroup = () => undefined
        g.endGroup = () => undefined
        return g
    }
}

export class LogicStatic {

    public singleton: LogicEditor | undefined

    public highlight(diagramRefs: string | string[], componentRefs: string | string[]) {
        if (isString(diagramRefs)) {
            diagramRefs = [diagramRefs]
        }
        for (const diagramRef of diagramRefs) {
            const diagram = document.getElementById("logic_" + diagramRef)
            if (diagram === null) {
                console.log(`Cannot find logic diagram with reference '${diagramRef}'`)
                return
            }
            if (!(diagram instanceof LogicEditor)) {
                console.log(`Element with id '${diagramRef}' is not a logic editor`)
                return
            }
            diagram.highlight(componentRefs)
        }
    }

    public printUndoStack() {
        this.singleton?.undoMgr.dump()
    }

    public tests = new Tests()

}

const template = (() => {
    const template = document.createElement('template')
    template.innerHTML = LogicEditorTemplate
    const styles = [LogicEditorCSS, DialogPolyfillCSS]
    template.content.querySelector("#inlineStyle")!.innerHTML = styles.join("\n\n\n")

    template.content.querySelectorAll("i.svgicon").forEach((_iconElem) => {
        const iconElem = _iconElem as HTMLElement
        const iconName = iconElem.dataset.icon ?? "question"
        if (isIconName(iconName)) {
            iconElem.innerHTML = inlineIconSvgFor(iconName)
        } else {
            console.log(`Unknown icon name '${iconName}'`)
        }
    })
    return template
})()
// cannot be in setup function because 'template' var is not assigned until that func returns
// and promotion of elems occurs during this 'customElements.define' call
window.Logic = new LogicStatic()
window.customElements.define('logic-editor', LogicEditor)
document.addEventListener("toggle", e => {
    if (!(e.target instanceof HTMLDetailsElement)) {
        return
    }
    if (e.target.open) {
        e.target.querySelectorAll("logic-editor").forEach(el => {
            if (el instanceof LogicEditor) {
                el.redraw()
            }
        })
    }
}, true)
