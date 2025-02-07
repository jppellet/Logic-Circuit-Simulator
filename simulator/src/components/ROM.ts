import { saveAs } from 'file-saver'
import * as t from "io-ts"
import { COLOR_COMPONENT_BORDER, COLOR_EMPTY, colorForLogicValue, displayValuesFromArray, formatWithRadix, strokeSingleLine } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillWith, InteractionResult, LogicValue, Unknown, allBooleans, binaryStringRepr, hexStringRepr, isAllZeros, isArray, isUnknown, typeOrUndefined, valuesFromBinaryOrHexRepr } from "../utils"
import { ParametrizedComponentBase, Repr, ResolvedParams, defineAbstractParametrizedComponent, defineParametrizedComponent, groupHorizontal, groupVertical, param } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuData, MenuItem, MenuItemPlacement, MenuItems, Orientation } from "./Drawable"
import { RAM, RAMDef } from "./RAM"


export const ROMRAMDef =
    defineAbstractParametrizedComponent({
        button: { imgWidth: 50 },
        repr: {
            bits: typeOrUndefined(t.number),
            lines: typeOrUndefined(t.number),
            showContent: typeOrUndefined(t.boolean),
            displayRadix: typeOrUndefined(t.number),
            content: typeOrUndefined(t.union([t.string, t.array(t.string)])),
        },
        valueDefaults: {
            showContent: true,
            displayRadix: undefined as number | undefined,
        },
        params: {
            bits: param(4, [4, 8, 16, 24, 32]),
            lines: param(16, [4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048]),
        },
        validateParams: ({ bits, lines }) => {
            const numAddressBits = Math.ceil(Math.log2(lines))
            const numWords = Math.pow(2, numAddressBits)
            return { numDataBits: bits, numAddressBits, numWords }
        },
        size: ({ numWords, numDataBits }) => ({
            gridWidth: 11, // always wide enough even for 256 lines
            gridHeight: Math.max(numWords <= 16 ? 16 : 22, numDataBits + 4),
        }),
        makeNodes: ({ numDataBits, numAddressBits, gridHeight }) => {
            const addrTopOffset = -Math.ceil((gridHeight + 1) / 2)

            return {
                ins: {
                    Addr: groupHorizontal("n", 0, addrTopOffset, numAddressBits),
                },
                outs: {
                    Q: groupVertical("e", 7, 0, numDataBits),
                },
            }
        },
        initialValue: (saved, { numDataBits, numWords }) => {
            if (saved === undefined || saved.content === undefined) {
                return ROMRAMBase.defaultValue(numWords, numDataBits)
            }
            const mem = ROMRAMBase.contentsFromString(saved.content, numDataBits, numWords)
            const out = [...mem[0]]
            return { mem, out }
        },
    })


export type ROMRAMRepr = Repr<typeof ROMRAMDef>
export type ROMRAMParams = ResolvedParams<typeof ROMRAMDef>

export type ROMRAMValue = {
    mem: LogicValue[][]
    out: LogicValue[]
}


export abstract class ROMRAMBase<TRepr extends ROMRAMRepr> extends ParametrizedComponentBase<TRepr, ROMRAMValue> {

    public static defaultValue(numWords: number, numDataBits: number) {
        return ROMRAMBase.valueFilledWith(false, numWords, numDataBits)
    }

    public static valueFilledWith(v: LogicValue, numWords: number, numDataBits: number): ROMRAMValue {
        const mem: LogicValue[][] = new Array(numWords)
        for (let i = 0; i < numWords; i++) {
            mem[i] = ArrayFillWith(v, numDataBits)
        }
        const out = ArrayFillWith(v, numDataBits)
        return { mem, out }
    }

    public static contentsFromString(stringRep: string | string[], numDataBits: number, numWords: number) {
        const splitContent = isArray(stringRep) ? stringRep : stringRep.split(/\s+/)
        const mem: LogicValue[][] = new Array(numWords)
        for (let i = 0; i < numWords; i++) {
            const row = i >= splitContent.length
                ? ArrayFillWith(false, numDataBits)
                : valuesFromBinaryOrHexRepr(splitContent[i], numDataBits)
            mem[i] = row
        }
        return mem
    }

    public readonly numDataBits: number
    public readonly numAddressBits: number
    public readonly numWords: number
    private _showContent: boolean
    private _displayRadix: number | undefined

    public constructor(parent: DrawableParent, SubclassDef: typeof RAMDef | typeof ROMDef, params: ROMRAMParams, saved?: TRepr) {
        super(parent, SubclassDef.with(params) as any /* TODO */, saved)

        this.numDataBits = params.numDataBits
        this.numAddressBits = params.numAddressBits
        this.numWords = params.numWords

        this._showContent = saved?.showContent ?? (!this.canShowContent() ? false : RAMDef.aults.showContent)
        this._displayRadix = saved?.displayRadix ?? RAMDef.aults.displayRadix
    }

    public override toJSONBase() {
        return {
            ...super.toJSONBase(),
            bits: this.numDataBits === RAMDef.aults.bits ? undefined : this.numDataBits,
            lines: this.numWords === RAMDef.aults.lines ? undefined : this.numWords,
            showContent: (!this.canShowContent()) ? undefined : (this._showContent !== RAMDef.aults.showContent) ? this._showContent : undefined,
            displayRadix: this._displayRadix !== RAMDef.aults.displayRadix ? this._displayRadix : undefined,
            content: this.contentRepr(" ", true),
        }
    }

    private contentRepr<TrimEnd extends boolean>(delim: string, trimEnd: TrimEnd)
        : string | (TrimEnd extends false ? never : undefined) {
        const cells: string[] = []
        const useHex = this.numDataBits >= 8
        const hexWidth = Math.ceil(this.numDataBits / 4)
        for (let addr = 0; addr < this.numWords; addr++) {
            const word = this.value.mem[addr]
            const wordRepr = useHex && allBooleans(word) ? hexStringRepr(word, hexWidth) : binaryStringRepr(word)
            cells.push(wordRepr)
        }
        if (trimEnd) {
            let numToSkip = 0
            for (let addr = this.numWords - 1; addr >= 0; addr--) {
                if (isAllZeros(cells[addr])) {
                    numToSkip++
                } else {
                    break
                }
            }
            if (numToSkip > 0) {
                // remove last numToSkip cells
                cells.splice(this.numWords - numToSkip, numToSkip)
            }
        }
        const result: string | undefined = cells.length === 0 ? undefined : cells.join(delim)
        return result as any
    }

    protected currentAddress(): number | Unknown {
        const addrBits = this.inputValues(this.inputs.Addr)
        const [__, addr] = displayValuesFromArray(addrBits, false)
        return addr
    }

    protected override propagateValue(newValue: ROMRAMValue) {
        this.outputValues(this.outputs.Q, newValue.out)
    }

    private canShowContent() {
        return this.numWords <= 64 && this.numDataBits <= 16
    }

    protected doSetShowContent(showContent: boolean) {
        this._showContent = showContent
        this.requestRedraw({ why: "show content changed" })
    }

    protected abstract get moduleName(): string

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, (ctx, { width, height }) => {

            const mem = this.value.mem
            const addr = this.currentAddress()
            let contentBottom, labelCenter

            if (!this._showContent || !this.canShowContent() || this.parent.editor.options.hideMemoryContent) {
                g.font = `bold 18px sans-serif`
                g.fillStyle = COLOR_COMPONENT_BORDER
                g.textAlign = "center"
                g.textBaseline = "middle"
                g.fillText(this.moduleName, this.posX, this.posY - 6)
                g.font = `11px sans-serif`
                const numWordsStr = this.numWords >= 1024 ? `${this.numWords / 1024}k` : this.numWords.toString()
                g.fillText(`${numWordsStr} × ${this.numDataBits} bits`, this.posX, this.posY + 12)
                labelCenter = this.posX
                contentBottom = this.posY + 25
            } else {
                const isVertical = Orientation.isVertical(this.orient)
                const canUseTwoCols = isVertical
                const addressedContentHeight = this._displayRadix !== undefined ? 12 : 0
                const contentCenterY = this.posY - addressedContentHeight / 2
                const [availWidth, availHeight] = !isVertical
                    ? [width - 42, height - 30 - addressedContentHeight]
                    : [height - 66, width - 30 - addressedContentHeight]
                const arrowWidth = 10

                let useTwoCols = false
                let cellHeight = Math.floor((availHeight - addressedContentHeight) * 2 / this.numWords) / 2
                if (cellHeight <= 2 && canUseTwoCols) {
                    useTwoCols = true
                    cellHeight = Math.floor((availHeight - addressedContentHeight) * 4 / this.numWords) / 2
                }
                if (!useTwoCols) {
                    const cellWidth = Math.floor((availWidth - arrowWidth) * 2 / this.numDataBits) / 2
                    labelCenter = this.posX + 3
                    contentBottom = drawMemoryCells(g, mem, this.numDataBits, addr, 0, this.numWords, labelCenter, contentCenterY, cellWidth, cellHeight)
                } else {
                    const cellWidth = Math.floor((availWidth / 2 - 2 * arrowWidth) * 2 / this.numDataBits) / 2
                    labelCenter = this.posX
                    contentBottom = drawMemoryCells(g, mem, this.numDataBits, addr, 0, this.numWords / 2, this.posX + 2 - 38, contentCenterY, cellWidth, cellHeight)
                    drawMemoryCells(g, mem, this.numDataBits, addr, this.numWords / 2, this.numWords, this.posX + 2 + 38, contentCenterY, cellWidth, cellHeight)
                }
            }

            if (this._displayRadix !== undefined) {
                g.textAlign = "center"
                g.textBaseline = "top"
                const word = isUnknown(addr) ? Unknown : displayValuesFromArray(mem[addr], false)[1]
                const repr = formatWithRadix(word, this._displayRadix, this.numDataBits, true)
                g.fillStyle = COLOR_COMPONENT_BORDER
                g.fillText(`${repr}`, labelCenter, contentBottom + 3)
            }
        })
    }

    private doSetDisplayRadix(additionalReprRadix: number | undefined) {
        this._displayRadix = additionalReprRadix
        this.requestRedraw({ why: "additional display radix changed" })
    }

    private doSetMem(mem: LogicValue[][]) {
        const addr = this.currentAddress()
        const out = isUnknown(addr) ? ArrayFillWith(Unknown, this.numDataBits) : mem[addr]
        this.doSetValue({ mem, out }, true)
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.RAM.contextMenu
        const sg = S.Components.Generic.contextMenu
        const ss = S.Components.Display.contextMenu

        const makeItemShowRadix = (radix: number | undefined, desc: string) => {
            const icon = this._displayRadix === radix ? "check" : "none"
            return MenuData.item(icon, desc, () => this.doSetDisplayRadix(radix))
        }

        const editContentItem: [MenuItemPlacement, MenuItem] =
            ["mid", MenuData.item("memcontent", s.EditContent, () => {
                const current = this.contentRepr(" ", false)
                const promptReturnValue = window.prompt(s.EditContentPrompt, current)
                if (promptReturnValue !== null) {
                    this.doSetMem(RAM.contentsFromString(promptReturnValue, this.numDataBits, this.numWords))
                }
            })]

        const saveContentItem: [MenuItemPlacement, MenuItem] =
            ["mid", MenuData.item("download", s.SaveContent, () => {
                const blob = new Blob([this.contentRepr("\n", false)], { type: "text/plain" })
                const filename = this.parent.editor.documentDisplayName + "." + (this.ref ?? this.moduleName.toLowerCase()) + "-content.txt"
                saveAs(blob, filename)
            })]

        const loadContentItem: [MenuItemPlacement, MenuItem] =
            ["mid", MenuData.item("open", s.LoadContent, () => {
                this.parent.editor.runFileChooser("text/plain", async file => {
                    const content = await file.text()
                    this.doSetMem(RAM.contentsFromString(content, this.numDataBits, this.numWords))
                })
            })]

        const swapROMRAMItem: [MenuItemPlacement, MenuItem] =
            ["mid", MenuData.item("replace", s.SwapROMRAM, () => {
                const isROM = this instanceof ROM
                const repr = this.toNodelessJSON();
                (repr as any).type = isROM ? "ram" : "rom"
                const otherDef = isROM ? RAMDef : ROMDef
                const newComp = otherDef.makeFromJSON(this.parent, repr)
                if (newComp === undefined) {
                    console.warn("Could not swap ROM/RAM from repr:", repr)
                    return InteractionResult.NoChange
                }
                this.replaceWithComponent(newComp)
                return InteractionResult.SimpleChange
            })]

        const additionalDisplayItems: [MenuItemPlacement, MenuItem] =
            ["mid", MenuData.submenu("eye", s.SelectedDataDisplay, [
                makeItemShowRadix(undefined, ss.DisplayNone),
                MenuData.sep(),
                makeItemShowRadix(2, ss.DisplayAsBinary),
                makeItemShowRadix(16, ss.DisplayAsHexadecimal),
                makeItemShowRadix(10, ss.DisplayAsDecimal),
                makeItemShowRadix(-10, ss.DisplayAsSignedDecimal),
                makeItemShowRadix(8, ss.DisplayAsOctal),
            ])]


        const icon = this._showContent ? "check" : "none"
        const toggleShowContentItems: MenuItems =
            !this.canShowContent() ? [] : [
                ["mid", MenuData.item(icon, sg.ShowContent,
                    () => this.doSetShowContent(!this._showContent))],
            ]

        return [
            ...this.makeSpecificROMRAMItems(),
            additionalDisplayItems,
            ...toggleShowContentItems,
            ["mid", MenuData.sep()],
            editContentItem,
            saveContentItem,
            loadContentItem,
            ["mid", MenuData.sep()],
            swapROMRAMItem,
            ["mid", MenuData.sep()],
            this.makeChangeParamsContextMenuItem("memlines", sg.ParamNumWords, this.numWords, "lines"),
            this.makeChangeParamsContextMenuItem("outputs", S.Components.Generic.contextMenu.ParamNumBits, this.numDataBits, "bits"),
            ...this.makeForceOutputsContextMenuItem(true),
        ]
    }

    protected makeSpecificROMRAMItems(): MenuItems {
        return []
    }

}


function drawMemoryCells(g: GraphicsRendering, mem: LogicValue[][], numDataBits: number, addr: number | Unknown, start: number, end: number, centerX: number, centerY: number, cellWidth: number, cellHeight: number): number {
    const numCellsToDraw = end - start
    const contentTop = centerY - numCellsToDraw / 2 * cellHeight
    const contentLeft = centerX - numDataBits / 2 * cellWidth
    const contentRight = contentLeft + numDataBits * cellWidth
    const contentBottom = contentTop + numCellsToDraw * cellHeight

    // by default, paint everything as zero
    g.fillStyle = COLOR_EMPTY
    g.fillRect(contentLeft, contentTop, contentRight - contentLeft, contentBottom - contentTop)

    for (let i = start; i < end; i++) {
        for (let j = 0; j < numDataBits; j++) {
            const v = mem[i][numDataBits - j - 1]
            if (v !== false) {
                g.fillStyle = colorForLogicValue(v)
                g.fillRect(contentLeft + j * cellWidth, contentTop + i * cellHeight, cellWidth, cellHeight)
            }
        }
    }

    g.strokeStyle = COLOR_COMPONENT_BORDER
    g.lineWidth = 0.5
    for (let i = 1; i < numCellsToDraw; i++) {
        const y = contentTop + i * cellHeight
        strokeSingleLine(g, contentLeft, y, contentRight, y)
    }
    for (let j = 1; j < numDataBits; j++) {
        const x = contentLeft + j * cellWidth
        strokeSingleLine(g, x, contentTop, x, contentBottom)
    }
    const borderLineWidth = 2
    g.lineWidth = borderLineWidth
    g.strokeRect(contentLeft - borderLineWidth / 2, contentTop - borderLineWidth / 2, contentRight - contentLeft + borderLineWidth, contentBottom - contentTop + borderLineWidth)
    if (!isUnknown(addr) && addr >= start && addr < end) {
        const arrowY = contentTop + (addr - start) * cellHeight + cellHeight / 2
        const arrowRight = contentLeft - 3
        const arrowWidth = 8
        const arrowHalfHeight = 3
        g.beginPath()
        g.moveTo(arrowRight, arrowY)
        g.lineTo(arrowRight - arrowWidth, arrowY + arrowHalfHeight)
        g.lineTo(arrowRight - arrowWidth + 2, arrowY)
        g.lineTo(arrowRight - arrowWidth, arrowY - arrowHalfHeight)
        g.closePath()
        g.fillStyle = COLOR_COMPONENT_BORDER
        g.fill()
    }

    return contentBottom
}



export const ROMDef =
    defineParametrizedComponent("rom", true, true, {
        variantName: ({ bits, lines }) => `rom-${lines}x${bits}`,
        idPrefix: "rom",
        ...ROMRAMDef,
    })

export type ROMRepr = Repr<typeof ROMDef>

export class ROM extends ROMRAMBase<ROMRepr> {

    public constructor(parent: DrawableParent, params: ROMRAMParams, saved?: ROMRepr) {
        super(parent, ROMDef, params, saved)
    }

    public toJSON() {
        return super.toJSONBase()
    }

    protected get moduleName() {
        return "ROM"
    }

    protected doRecalcValue(): ROMRAMValue {
        const { mem } = this.value
        const addr = this.currentAddress()
        const out = isUnknown(addr) ? ArrayFillWith(Unknown, this.numDataBits) : mem[addr]
        return { mem, out }
    }

    public override makeTooltip() {
        const s = S.Components.ROM.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc.expand({ numWords: this.numWords, numDataBits: this.numDataBits }))
            // TODO more info
        ))
    }

}
ROMDef.impl = ROM
