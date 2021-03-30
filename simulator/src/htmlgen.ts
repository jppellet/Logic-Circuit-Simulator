
//
// Helper export function s to build HTML more smartly in JavaScript
//

export interface ModifierObject {
    applyTo(parent: Element): void
}
export type Modifier = ModifierObject | Node | string
export interface RenderObject<T extends HTMLElement> {
    render(): T
}
export type ElemRenderer<T extends HTMLElement> = ModifierObject & RenderObject<T>
export interface AttrBuilder {
    (attrValue: any): ModifierObject;
    attrName: string;
}
export interface StyleBuilder {
    (styleValue: any): ModifierObject;
    styleName: string;
}

export function isModifierObject(mod: any): mod is ModifierObject {
    return typeof mod.applyTo === "function"
}
export function isNode(obj: any): obj is Node {
    return typeof obj === "object" && "nodeType" in obj
}

export function applyModifierTo(parent: Element, modifier: Modifier): void {
    if (isNode(modifier)) {
        parent.appendChild(modifier)
    } else if (isModifierObject(modifier)) {
        modifier.applyTo(parent)
    } else {
        const text = "" + modifier
        parent.appendChild(document.createTextNode(text))
    }
}

export function applyModifiersTo(parent: Element, modifiers: Modifier[]): void {
    for (const mod of modifiers) {
        applyModifierTo(parent, mod)
    }
}

export function elemBuilder<K extends keyof HTMLElementTagNameMap>(tagName: K): (...modifiers: Modifier[]) => ElemRenderer<HTMLElementTagNameMap[K]> {
    return (...modifiers: Modifier[]) => {
        return {
            render: () => {
                const el = document.createElement(tagName)
                applyModifiersTo(el, modifiers)
                return el
            },
            applyTo: function (parent) {
                parent.appendChild(this.render())
            },
        }
    }
}


export function attrBuilder(attrName: string): AttrBuilder {
    const builder = ((attrValue: any): ModifierObject => {
        return {
            applyTo: p => p.setAttribute(attrName, "" + attrValue),
        }
    }) as AttrBuilder
    builder.attrName = attrName
    return builder
}

export function styleBuilder(styleName: string): StyleBuilder {
    const builder = ((styleValue: any): ModifierObject => {
        return {
            applyTo: p => (p as HTMLElement).style.setProperty(styleName, styleValue),
        }
    }) as StyleBuilder
    builder.styleName = styleName
    return builder
}

export function data(dataName: string): AttrBuilder {
    return attrBuilder("data-" + dataName)
}

export function raw(rawHTML: string): Modifier {
    return {
        applyTo: p => p.insertAdjacentHTML('beforeend', rawHTML),
    }
}

export function addClass(className: string): Modifier {
    return {
        applyTo: p => p.classList.add(className),
    }
}

export function mods(...modifiers: Modifier[]): Modifier {
    return {
        applyTo: p => applyModifiersTo(p, modifiers),
    }
}

export const emptyMod: Modifier = {
    applyTo: __ => undefined, // do nothing
}

export function faglyph(glyphName: string) {
    return i(cls(`fa fa-${glyphName}`))
}

export function attr(attrName: string, attrValue: string): Modifier {
    return attrBuilder(attrName)(attrValue)
}

export const div = elemBuilder("div")
export const span = elemBuilder("span")
export const ul = elemBuilder("ul")
export const ol = elemBuilder("ol")
export const li = elemBuilder("li")
export const input = elemBuilder("input")
export const label = elemBuilder("label")
export const b = elemBuilder("b")
export const i = elemBuilder("i")
export const img = elemBuilder("img")
export const canvas = elemBuilder("canvas")
export const style = attrBuilder("style")
export const type = attrBuilder("type")
export const cls = attrBuilder("class")
export const title = attrBuilder("title")
export const src = attrBuilder("src")
export const draggable = attrBuilder("draggable")("true")
export const br = raw('<br>')