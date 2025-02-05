import { type DrawableParent } from "./components/Drawable"
import { type LogicEditor } from "./LogicEditor"
import { Mode } from "./utils"

function perm(mode: Mode) {
    return (parent: DrawableParent) => parent.editor.mode >= mode
}

export type UIPermission = keyof typeof UIPermissions

export const UIPermissions = {

    canModifyTestCases: perm(Mode.FULL),

    canModifyCustomComponents: perm(Mode.DESIGN),

} as const satisfies Record<string, (editor: LogicEditor) => boolean>
