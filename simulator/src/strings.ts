import { Modifier, mods } from "./htmlgen"
import { RichStringEnum, tuple } from "./utils"

export type Strings = typeof Strings_fr

// either just the title (mouseover), or the title and the caption
type ComponentStrings = string | [string, string]

export class Template<TPlaceholders extends string[]> {
    public constructor(public readonly templateString: string) { }
    public expand(values: { [K in TPlaceholders[number]]: unknown }) {
        return this.templateString.replace(/\$(s?)\{(\w+)(\?(\w*)(:(\w*))?)?\}/g, (match, s, key, plurDecl, plural, singDecl, singular) => {
            const value = (values as any)[key] as unknown | undefined
            if (s === "s") {
                return S.plural(value === undefined ? 0 : Number(value), plural, singular)
            }
            return String(value ?? "<<" + key + ">>")
        })
    }
}

type _ExtractPlaceholders<TName extends string, TPlaceholders extends string[]>
    = TName extends `${infer __TStart}\${${infer TPlaceholder}}${infer TEnd}`
    ? _ExtractPlaceholders<`${TEnd}`, [...TPlaceholders, TPlaceholder]>
    : TPlaceholders

type ExtractPlaceholders<TName extends string> =
    _ExtractPlaceholders<TName, []>

export function template<TText extends string>(templ: TText) {
    return new Template<ExtractPlaceholders<TText>>(templ)
}


const Strings_fr = {
    plural: (n: number, plural?: string, singular?: string) => Math.abs(n) < 2 ? (singular ?? "") : (plural ?? "s"),
    ComponentBar: {
        Labels: {
            More: "Plus",
            Less: "Moins",
        },
        SectionNames: {
            InputOutput: "Entrées/ sorties",
            Layout: "Dispo- sition",
            Gates: "Portes",
            Components: "Compo- sants",
            Custom: "Person- nalisé",
        },
        Components: RichStringEnum.withProps<ComponentStrings>()({
            Input1: ["Entrée", "IN"],
            InputN: ["Entrée multiple", "IN mult."],
            Input8: ["Entrée octet (8 bits)", "IN 8 bits"],
            Clock: ["Générateur de signal d’horloge", "Horloge"],
            Random: ["Entrée aléatoire", "Aléatoire"],
            Output1: ["Sortie", "OUT"],
            OutputN: ["Sortie multiple", "OUT mult."],
            Output8: ["Sortie octet (8 bits)", "OUT 8 bits"],
            DisplayN: ["Afficheur d’une valeur", "Afficheur"],
            Display8: ["Affichage de 8 bits", "Aff. 8 bits"],
            Display7Seg: ["Afficheur à 7 segments", "7 segments"],
            Display16Seg: ["Afficheur à 16 segments", "16 segments"],
            DisplayAscii: ["Affichage d’un caractère ASCII (sur 7 bits)", "Caractère"],
            DisplayBar: ["Affichage d’un bit sous forme de segment lumineux", "Segment"],
            ShiftDisplay: ["Affichage avec buffer à décalage", "Affichage à décalage"],

            Passthrough1: ["Broche", "Broche"],
            PassthroughN: ["Broche à plusieurs entrées-sortes", "Broche (n)"],
            Label: ["Étiquette", "Label"],
            Rectangle: ["Rectangle de regroupement", "Groupe"],

            not: ["Porte NON", "NON"],
            buf: ["Buffer (porte OUI)", "OUI"],
            tri: ["Sortie à 3 états", "3 états"],
            and: ["Porte ET", "ET"],
            or: ["Porte OU", "OU"],
            xor: ["Porte OU-X", "OU-X"],
            nand: ["Porte NON-ET", "NON-ET"],
            nor: ["Porte NON-OU", "NON-OU"],
            xnor: ["Porte NON-OU-X", "NON-OU-X"],
            imply: ["Porte IMPLIQUE", "IMPLIQUE"],
            nimply: ["Porte NON-IMPLIQUE", "NON-IMPL."],
            transfer: ["Fausse porte TRANSFERT à deux entrées", "TRANSF."],

            and3: ["Porte ET à 3 entrées", "ET (3)"],
            or3: ["Porte OU à 3 entrées", "OU (3)"],
            xor3: ["Porte OU-X à 3 entrées", "OU-X (3)"],
            nand3: ["Porte NON-ET à 3 entrées", "NON-ET (3)"],
            nor3: ["Porte NON-OU à 3 entrées", "NON-OU (3)"],
            xnor3: ["Porte NON-OU-X à 3 entrées", "NON-OU-X (3)"],

            and4: ["Porte ET à 4 entrées", "ET (4)"],
            or4: ["Porte OU à 4 entrées", "OU (4)"],
            xor4: ["Porte OU-X à 4 entrées", "OU-X (4)"],
            nand4: ["Porte NON-ET à 4 entrées", "NON-ET (4)"],
            nor4: ["Porte NON-OU à 4 entrées", "NON-OU (4)"],
            xnor4: ["Porte NON-OU-X à 4 entrées", "NON-OU-X (4)"],

            ControlledInverter: ["Inverseur commuté", "Inv. comm."],
            GateArray: ["Porte multiple", "Porte mult."],
            TristateBufferArray: ["Sortie à 3 états multiple", "3 états mult."],

            HalfAdder: ["Demi-additionneur", "Demi-add."],
            Adder: ["Additionneur", "Addit."],
            AdderArray: ["Additionneur multiple", "Add. mult."],
            ALU: ["Unité arithmétique et logique", "ALU"],

            Mux: ["Multiplexer", "Mux"],
            Mux2to1: ["Multiplexer 2-vers-1 (1 bit de contrôle)", "Mux 2-1"],
            Mux4to1: ["Multiplexer 4-vers-1 (2 bits de contrôle)", "Mux 4-1"],
            Mux8to1: ["Multiplexer 8-vers-1 (3 bits de contrôle)", "Mux 8-1"],
            Mux4to2: ["Multiplexer 4-vers-2 (1 bit de contrôle)", "Mux 4-2"],
            Mux8to2: ["Multiplexer 8-vers-2 (2 bits de contrôle)", "Mux 8-2"],
            Mux8to4: ["Multiplexer 8-vers-4 (1 bit de contrôle)", "Mux 8-4"],
            Mux16to8: ["Multiplexer 16-vers-8 (1 bit de contrôle)", "Mux 16-8"],

            Demux: ["Démultiplexer", "Demux"],
            Demux1to2: ["Démultiplexer 1-vers-2 (1 bit de contrôle)", "Demux 1-2"],
            Demux1to4: ["Démultiplexer 1-vers-4 (2 bits de contrôle)", "Demux 1-4"],
            Demux1to8: ["Démultiplexer 1-vers-8 (3 bits de contrôle)", "Demux 1-8"],
            Demux2to4: ["Démultiplexer 2-vers-4 (1 bit de contrôle)", "Demux 2-4"],
            Demux2to8: ["Démultiplexer 2-vers-8 (2 bits de contrôle)", "Demux 2-8"],
            Demux4to8: ["Démultiplexer 4-vers-8 (1 bit de contrôle)", "Demux 4-8"],
            Demux8to16: ["Démultiplexer 8-vers-16 (1 bit de contrôle)", "Demux 8-16"],

            LatchSR: ["Verrou SR", "Verrou SR"],
            FlipflopJK: ["Bascule JK", "Basc. JK"],
            FlipflopT: ["Bascule T", "Basc. T"],
            FlipflopD: ["Bascule D", "Basc. D"],
            Register: ["Registre", "Registre"],
            ShiftRegister: ["Registre à décalage", "Reg. déc."],
            RAM: ["RAM (mémoire vive)", "RAM"],
            ROM: ["ROM (mémoire morte)", "ROM"],

            Counter: ["Compteur 4 bits", "Compteur"],
            Decoder: ["Décodeur binaire vers 1-sur-n", "Décodeur"],
            Decoder7Seg: ["Décodeur 7 segments", "Déc. 7 seg."],
            Decoder16Seg: ["Décodeur ASCII vers 16 segments", "Déc. 16 seg."],
            DecoderBCD4: ["Décodeur 4 bits vers BCD sur 5 bits", "Déc. BCD"],

            Comparator: ["Comparateur", "Compar."],
        }),
    },
    Modes: {
        FULL: tuple("Admin", "En plus du mode complet, ce mode permet de rendre les entrées, les sorties des portes, voire les portes elles-mêmes indéterminées"),
        DESIGN: tuple("Complet", "La totalité des actions de conception d’un circuit sont possible"),
        CONNECT: tuple("Connexion", "Il est possible de déplacer et de connecter des éléments déjà sur le canevas, mais pas d’en rajouter (le menu de gauche ne serait pas actif)"),
        TRYOUT: tuple("Test", "Il est seulement possible de changer les entrées pour tester un circuit préétabli"),
        STATIC: tuple("Statique", "Les éléments sont juste affichés; aucune interaction n’est possible"),
    },
    Orientations: {
        e: "Vers la droite (par défaut)",
        s: "Vers le bas",
        w: "Vers la gauche",
        n: "Vers le haut",
    },
    Settings: {
        Settings: "Réglages",
        CircuitName: "Nom:",
        DefaultFileName: "circuit",
        NameOfDownloadedFile: "Ceci sera le nom du fichier téléchargé.",
        animateWires: tuple("Animer les fils", "Si coché, les fils sont animés pour montrer dans quel sens logique le signal se propage."),
        hideWireColors: tuple("Cacher l’état des fils", "Si coché, les fils sont affichés avec une couleur neutre plutôt que de montrer s’ils véhiculent un 1 ou un 0."),
        hideInputColors: tuple("Cacher l’état des entrées", "Si coché, les entrées sont affichées avec une couleur neutre, même si elles livrent au circuit une valeur bien déterminée. S’utilise volontiers en cachant aussi l’état des fils."),
        hideOutputColors: tuple("Cacher l’état des sorties", "Si coché, les sorties sont affichées avec une couleur neutre. S’utilise volontiers en cachant aussi l’état des fils."),
        hideMemoryContent: tuple("Cacher le contenu stocké", "Si coché, les verrous, bascules, registres et autres mémoires ne montrent pas leur contenu."),
        showGateTypes: tuple("Montrer type des portes", "Si coché, affiche sur les portes logique le nom de la fonction réalisée."),
        showDisconnectedPins: tuple("Toujours montrer les pattes", "Si non coché, les pattes non connectées des composants sont masquées dans les modes où les connexions du circuit ne peuvent pas être modifiées (et restent visibles sinon)."),
        hideTooltips: tuple("Désactiver tooltips", "Si coché, les informations supplémentaires des tooltips (comme les tables de vérité) ne seront pas affichées."),
        groupParallelWires: tuple("Grouper les fils parallèles", "Si coché, les fils parralèles allant d'un composant à un autre seront regroupés en un seul fil plus épais."),
        showHiddenWires: tuple("Montrer les fils cachés", "Si coché, les fils cachés seront quand même affichés."),
        showAnchors: tuple("Montrer les ancrages", "Si coché, des flèches indiqueront les composants auxquels sont ancrés les composants lors de leur déplacement."),
        showIds: tuple("Montrer les identifiants", "Si coché, les identifiants des composants seront affichés."),
        propagationDelay: "Un 1 ou un 0 imposé sur une connexion sera répercuté à l’autre bout de la connexion après ce délai de propagation.",
        propagationDelayField: tuple("Propagation en", "ms"),
        zoomLevel: "Le niveau de zoom sur les composants du circuit.",
        zoomLevelField: tuple("Zoom:", "%"),
        showUserDataLink: tuple("Voir les", "données liées"),
        userDataHeader: "Les données suivantes sont exportées avec le circuit:",
        wireStyle: "Style des fils:",
    },
    Tests: {
        Title: "Tests",
        DefaultTestCaseName: "Test",
        DefaultTestSuiteName: "Tests",
        SetInputs: "Entrées",
        WantedOutputs: "Sorties",
        SetTheseInputs: "Régler ces entrées",
    },
    TopBar: {
        DirtyTooltip: "Le circuit a été modifié depuis la dernière sauvegarde.",
        CircuitNameTooltip: "Nom du circuit actuellement édité; cliquez pour modifier",
        SetCircuitName: "Tapez le nom du circuit (ou laissez vide pour le nom par défaut):",
        CustomComponentCaptionTooltip: "Nom du sous-circuit actuellement édité; cliquez pour modifier",
        CloseCircuit: "Retour au circuit complet",

        Undo: tuple("Annuler", "Annule la dernière action"),
        Redo: tuple("Rétablir", "Rétablit la dernière action annulée ou répète l’action précédente"),

        Download: tuple("Télécharger", "Télécharge le circuit (ou les composants personnalisés avec la touche Option/Alt)"),
        Screenshot: tuple("Screenshot", "Télécharge le circuit sous forme d’image (PNG ou SVG avec touche Option/Alt)"),
        Open: tuple("Ouvrir", "Ouvre un circuit précédemment téléchargé"),
        Reset: tuple("Réinitialiser", "Réinitialise l’état de ce circuit"),

        TimelinePlay: tuple("Play", "Démarre l’écoulement du temps"),
        TimelinePause: tuple("Pause", "Arrête l’écoulement du temps"),
        TimelineStep: tuple("Pas à pas", "Avance au prochain événement"),
        TimeLabel: "Temps: ",

        Design: tuple("Concevoir", "Compose ou modifie le circuit"),
        Delete: tuple("Supprimer", "Supprime des éléments du circuit"),
        Move: tuple("Déplacer", "Déplace tout le circuit"),

        Tests: tuple("Tests", "Montre les tests pour ce circuit"),
    },
    Messages: {
        UnsupportedFileType: template("Type de fichier non pris en charge: ${type}."),
        LoadedDefinitions: template("${n} composant$s{n} personnalisé$s{n} chargé$s{n}"),
        SavedToUrl: "Circuit enregistré dans l’URL",
        SetAnchorPrompt: "Cliquez sur le composant auquel s’ancrer",
        AnchorAdded: "Ancrage ajouté",
        CircularAnchorsForbidden: "Les ancrages circulaires ne sont pas pris en charge.",
        NotImplemented: "Cette fonctionnalité n’est pas encore implémentée.",
        ReallyCloseWindow: "Voulez-vous vraiment fermer la fenêtre sans prendre en compte les derniers changements?",
        DevelopedBy: "Développé par ",

        DidUndo: "Annuler",
        DidRedo: "Rétablir",
        DidRepeat: "Répéter",
        NothingToUndo: "Rien à annuler",
        NothingToRedo: "Rien à rétablir ou répéter",

        RunningTestCase: template("Exécution du test ${name}..."),
    },
    Components: {
        Generic: {
            contextMenu: {
                Delete: "Supprimer",
                Reset: "Réactiver",

                MakeNewComponent: "Créer un nouveau composant…",
                MakeNewComponentFailed: "Impossible de créer un nouveau composant.",

                SetIdentifier: "Attribuer un identifiant…",
                ChangeIdentifier: tuple("Changer l’identifiant (", ")…"),
                SetIdentifierPrompt: "Choisissez l’identifiant unique à attribuer à ce composant:",
                IdentifierCannotBeEmpty: "L’identifiant ne peut pas être vide.",
                IdentifierAlreadyInUseShouldSwap: "L’identifiant est déjà utilisé par un autre composant. Voulez-vous inverser les identifiants?",

                SetAnchor: "Définir l’ancrage…",
                ClearAnchor: tuple("Supprimer l’ancrage (", ")"),

                Orientation: "Orientation",
                ChangeOrientationDesc: "Changez l’orientation avec Commande + double-clic sur le composant",
                LockPosition: "Verrouiller la position",
                ShowAsUnknown: "Afficher comme inconnu",

                ForceOutputSingle: "Forcer la sortie",
                ForceOutputMultiple: "Forcer une sortie",
                Output: "Sortie",
                NormalOutput: "Sortie normale",
                ForceAsUnknown: "Forcer comme état inconnu",
                ForceAs1: "Forcer à 1",
                ForceAs0: "Forcer à 0",
                ForceAsZ: "Forcer à haute impédance",
                ForceOutputDesc: "Forcez une sortie avec Option + double-clic sur la sortie",

                SetName: "Ajouter un nom…",
                ChangeName: "Changer le nom…",
                SetNamePrompt: "Choisissez le nom à afficher ou laissez vide pour le supprimer:",

                SetFontPrompt: tuple("Entrez une spécification de police ou laissez vide pour la valeur par défaut (", "):"),

                TriggerOn: "Stocker au",
                TriggerRisingEdge: "flanc montant",
                TriggerFallingEdge: "flanc descendant",

                ShowContent: "Montrer le contenu",

                ParamNumInputs: tuple("Nombre d’entrées", template("${val} entrée$s{val}")),
                ParamNumBits: tuple("Nombre de bits", template("${val} bit$s{val}")),
                ParamNumWords: tuple("Nombre de lignes", template("${val} ligne$s{val}")),
            },

            InputCarryInDesc: "Cin (retenue précédente)",
            InputClockDesc: "Clock (horloge)",
            InputClearDesc: "C (Clear, mise à 0)",
            InputPresetDesc: "P (Preset, mise à 1)",
            InputSetDesc: "S (Set, mise à 1)",
            InputResetDesc: "R (Reset, mise à 0)",
            InputDataDesc: "D (Données)",
            InputWriteEnableDesc: "WE (écriture activée)",

            OutputSumDesc: "S (somme)",
            OutputCarryDesc: "C (retenue)",
            OutputCarryOutDesc: "Cout (retenue)",
            OutputQDesc: "Q (sortie normale)",
            OutputQBarDesc: "Q̅ (sortie inversée)",
        },
        Custom: {
            MenuButtonSuffix: " (composant personnalisé)",
            contextMenu: {
                ChangeName: "Renommer…",
                ChangeNamePrompt: "Choisissez le nom de ce composant personnalité:",
                ChangeNameEmpty: "Le nom ne peut pas être vide.",
                ChangeCircuit: "Modifier le circuit",
                Delete: "Supprimer ce composant",
                EditFromComponentMessage: "Vous pouvez modifier ce composant depuis le menu d’un composant du circuit.",
                CannotDeleteInUse: "Impossible de supprimer ce composant car il est utilisé dans le circuit.",
                CannotDeleteInUseBy: template("Impossible de supprimer ce composant car il est utilisé dans la définition d’un autre composant (${caption})."),
                ConfirmDelete: "Voulez-vous vraiment supprimer ce composant personnalisé?",
            },
            tooltip: {
                titleSuffix: " (composant personnalisé)",
                desc: "Ce composant calcule ses sorties selon le circuit personnalisé que vous avez défini.",
            },
            messages: {
                EmptySelection: "Aucun composant n’est sélectionné.",
                NoInput: "Aucune entrée n’est sélectionnée.",
                NoOutput: "Aucune sortie n’est sélectionnée.",
                InputsOutputsMustHaveNames: "Toutes les entrées et sorties doivent avoir un nom.",
                MissingComponents: template("Les composants suivants sont connectés à des sorties mais ne sont pas sélectionnés: ${list}."),
                NoWires: "Aucun fil n’est présent entre les composants sélectionnés.",
                UselessComponents: template("Les composants suivants ne sont pas connectés à des sorties et sont inutiles: ${list}."),
                CannotIncludeClock: "Les horloges ne peuvent pas être incluses dans les composants personnalisés. Ajoutez une entrée normale, qui pourra être connectée à une horloge de l'extérieur du composant.",
                EnterCaptionPrompt: "Entrez le nom (unique) du composant personnalisé:",
                ComponentAlreadyExists: template("Un composant personnalisé avec l’identifiant '${id}' existe déjà."),
                InputsOutputsChanged: "Les entrées et sorties ont changé et certaines connexions pourront être supprimées en adaptant le circuit. Voulez-vous continuer?",
                NotInMainEditor: "Revenez d’abord à l’éditeur principal pour modifier le circuit personnalisé de ce composant.",
            },
        },
        Adder: {
            tooltip: {
                title: "Additionneur",
                desc: "Additionne deux bits A et B et une retenue d’entrée Cin, et fournit un bit de somme S et une retenue de sortie Cout.",
            },
        },
        AdderArray: {
            tooltip: {
                title: template("Additionneur à ${numBits} bit$s{numBits}"),
                desc: "Additionne les deux nombres d'entrées A et B avec une retenue d’entrée Cin, et fournit les bits de somme S et une retenue de sortie Cout.",
            },
        },
        ALU: {
            "A+B": tuple("+", "Addition"),
            "A-B": tuple("A–B", "Soustraction (A – B)"),
            "B-A": tuple("B–A", "Soustraction (B – A)"),
            "A+1": tuple("A+1", "A + 1"),
            "A-1": tuple("A–1", "A – 1"),
            "-A": tuple("–A", "Négation d’A"),
            "A*2": tuple("A×2", "Addition d’A à lui-même (A × 2)"),
            "A/2": tuple("A/2", "Décalage arithmétique à droite de 1 (A / 2)"),
            "A|B": tuple("OU", "Disjonction (A OU B)"),
            "A&B": tuple("ET", "Conjonction (A ET B)"),
            "A|~B": tuple("OU-n", "A OU NON(B)"),
            "A&~B": tuple("ET-n", "A ET NON(B)"),
            "~A": tuple("A̅", "Inversion d’A"),
            "A^B": tuple("OU-X", "Disjonction excl. (A OU-X B)"),
            "A<<": tuple("<<", "Décalage logique à gauche de 1 de A"),
            "A>>": tuple(">>", "Décalage logique à droite de 1 de A"),

            InputCinDesc: "retenue d’entrée",
            OutputCoutDesc: "retenue de sortie",
            tooltip: {
                title: "Unité arithmétique et logique (ALU)",
                CurrentlyCarriesOut: "Effectue actuellement",
                SomeUnknownOperation: "une opération inconnue",
                ThisOperation: "l’opération",
            },
            contextMenu: {
                toggleShowOp: "Afficher l’opération",
                ParamUseExtendedOpcode: "Utiliser opérations étendues",
            },
        },
        Clock: {
            tooltip: {
                title: "Horloge",
                period: tuple("Période: ", " ms"),
                dutycycle: tuple("Rapport cyclique: ", "%"),
                phase: tuple("Déphasage: ", " ms"),
            },
            contextMenu: {
                Period: "Période",
                CustomPeriod: "Autre",
                SetPeriodMillis: "Entrez la période de l’horloge en millisecondes:",
                InvalidPeriod: "La période doit être un nombre entier positif.",
                ReplaceWithInput: "Remplacer par entrée",
            },
            timeline: {
                NextRisingEdge: "Prochain flanc montant de l’horloge",
                NextFallingEdge: "Prochain flanc descendant de l’horloge",
            },
        },
        Comparator: {
            tooltip: {
                title: "Comparateur",
                desc: "Comparateur entre deux bits A et B, activé par une entrée E.",
            },
        },
        Counter: {
            tooltip: {
                title: "Compteur",
                desc: "Compteur à quatre bits.",
            },
            contextMenu: {
                DisplayTempl: template("Affichage ${desc}"),
                DisplayNone: "absent",
                DisplayDecimal: "décimal",
                DisplayHex: "hexadécimal",
            },
        },
        Decoder: {
            tooltip: {
                title: "Décodeur binaire",
                desc: template("Ce décodeur prend en entrée un nombre binaire codé sur ${numFrom} bit$s{numFrom} et active la sortie correspondante parmi ${numTo} (actuellement, ${n})."),
            },
        },
        Decoder7Seg: {
            tooltip: "Décodeur 7 segments",
        },
        Decoder16Seg: {
            tooltip: "Décodeur ASCII vers 16 segments",
        },
        DecoderBCD4: {
            tooltip: "Décodeur 4 bits vers BCD (binary-coded decimal)",
        },
        Demux: {
            tooltip: template("Démultiplexeur ${from} vers ${to}"),
        },
        FlipflopD: {
            tooltip: {
                title: "Bascule D",
                desc: "Stocke un bit.",
            },
        },
        FlipflopJK: {
            InputJDesc: "J (Jump, mise à 1)",
            InputKDesc: "K (Kill, mise à 0)",
            tooltip: {
                title: "Bascule JK",
                desc: "Stocke un bit.",
            },
        },
        FlipflopT: {
            InputTDesc: "T (Toggle, bascule)",
            tooltip: {
                title: "Bascule T",
                desc: "Stocke un bit.",
            },
        },
        Gate: {
            not: tuple("NON", "NON", "La sortie est égale à l’entrée inversée."),
            buf: tuple("OUI", "OUI", "La sortie est égale à l’entrée."),

            and: tuple("ET", "ET", "La sortie vaut 1 lorsque toutes les entrées valent 1."),
            or: tuple("OU", "OU", "La sortie vaut 1 lorsqu’au moins une des entrées vaut 1."),
            xor: tuple("OU-X", "OU-X", "La sortie vaut 1 lorsqu’un nombre impair d’entrées valent 1."),
            nand: tuple("NON-ET", "N-ET", "Porte ET inversée: la sortie vaut 1 à moins que toutes les entrées ne valent 1."),
            nor: tuple("NON-OU", "N-OU", "Porte OU inversée: la sortie vaut 1 lorsque toutes les entrées valent 0."),
            xnor: tuple("NON-OU-X", "N-OU-X", "Porte OU-X inversée: la sortie vaut 1 lorsqu’un nombre pair d’entrées valent 1."),

            imply: tuple("IMPLIQUE", "IMPL", "La sortie vaut 1 si la première entrée vaut 0 ou si les deux entrées valent 1."),
            rimply: tuple("IMPLIQUE (bis)", "IMPL", "La sortie vaut 1 si la seconde entrée vaut 0 ou si les deux entrées valent 1."),
            nimply: tuple("NON-IMPLIQUE", "N-IMPL", "Porte IMPLIQUE inversée: la sortie ne vaut 1 que lorsque la première entrée vaut 1 et la seconde 0."),
            rnimply: tuple("NON-IMPLIQUE (bis)", "N-IMPL", "Porte IMPLIQUE inversée: la sortie ne vaut 1 que lorsque la première entrée vaut 0 et la seconde 1."),

            txa: tuple("TRANSFERT-A", undefined, "La sortie est égale à la première entrée; la seconde entrée est ignorée."),
            txb: tuple("TRANSFERT-B", undefined, "La sortie est égale à la seconde entrée; la première entrée est ignorée."),
            txna: tuple("TRANSFERT-NON-A", undefined, "La sortie est égale à la première entrée inversée; la seconde entrée est ignorée."),
            txnb: tuple("TRANSFERT-NON-B", undefined, "La sortie est égale à la seconde entrée inversée; la première entrée est ignorée."),


            tooltip: {
                GateTitle: (gateType: Modifier) => mods("Porte ", gateType),
                UnknownGate: "Porte inconnue",
                Input: "Entrée",
                Output: "Sortie",
                CurrentlyDelivers: "Actuellement, il livre",
                ShouldCurrentlyDeliver: "Actuellement, il devrait livrer",
                UndeterminedOutputBecauseInputUnknown: "une sortie indéterminée comme son entrée n’est pas connue. Sa table de vérité est:",
                UndeterminedOutputBecauseInputsUnknown: "une sortie indéterminée comme toutes ses entrées ne sont connues. Sa table de vérité est:",
                ThisOutput: "une sortie de",
                BecauseInputIs: "car son entrée est",
                AccordingToTruthTable: "selon la table de vérité suivante:",
                Inverter: tuple("Inverseur (porte ", ")"),
                Buffer: tuple("Buffer (porte ", ")"),
            },

            contextMenu: {
                ReplaceBy: "Remplacer par",
                GateTempl: template("Porte ${type}"),
                ShowAs: "Afficher comme",
                NormalGateTempl: template("Porte ${type} normale"),
                UnknownGate: "Porte inconnue (avec «?»)",
                VariantChangeDesc: "Changez entre les variantes avec Majuscule + double-clic sur la porte",
            },
        },
        HalfAdder: {
            tooltip: {
                title: "Demi-additionneur",
                desc: "Additionne deux bits A et B et fournit un bit de somme S et une retenue de sortie C.",
            },
        },
        Input: {
            tooltip: {
                title: template("Entrée (${numBits} bit$s{numBits})"),
            },
            contextMenu: {
                LockValue: "Verrouiller cette valeur",
                PushButton: "Poussoir",
                ToggleButton: "Commutateur",
                ReplaceWithClock: "Remplacer par horloge",
            },
        },
        Random: {
            tooltip: {
                title: "Valeur aléatoire",
                desc: tuple("À chaque coup d’horloge, la valeur de sortie sera 1 avec une probabilité de ", "."),
            },
            contextMenu: {
                ShowProb: "Montrer la probabilité",
            },
        },
        Rectangle: {
            contextMenu: {
                Size: "Taille",
                SizePrompt: "Entrez la taille de ce rectangle:",
                Rounded: "Arrondi",
                WithBackgroundColor: "Avec couleur de fond",
                SetTitle: "Ajouter un titre…",
                ChangeTitle: "Changer le titre…",
                SetTitlePrompt: "Entrez le titre à afficher ou laissez vide pour le supprimer:",
                InsideFrame: "À l’intérieur du cadre",
                Font: "Police…",

                Color: "Couleur",
                ColorYellow: "Jaune",
                ColorRed: "Rouge",
                ColorGreen: "Vert",
                ColorBlue: "Bleu",
                ColorTurquoise: "Turquoise",
                ColorGrey: "Gris",

                Border: "Bordure",
                BorderNone: "Aucune bordure",
                Border1px: "Fine (1 pixel)",
                Border2px: "Moyenne (2 pixels)",
                Border3px: "Épaisse (3 pixels)",
                Border5px: "Très épaisse (5 pixels)",
                Border10px: "Énorme (10 pixels)",

                TitlePlacement: "Position du titre",
                PlacementTop: "En haut",
                PlacementTopLeft: "En haut à gauche",
                PlacementTopRight: "En haut à droite",
                PlacementBottom: "En bas",
                PlacementBottomLeft: "En bas à gauche",
                PlacementBottomRight: "En bas à droite",
                PlacementLeft: "À gauche",
                PlacementRight: "À droite",
                PlacementCenter: "Au centre",
            },
        },
        Label: {
            contextMenu: {
                ChangeText: "Changer le texte…",
                ChangeTextPrompt: "Choisissez le texte à afficher:",
                Font: "Police…",
            },
        },
        LatchSR: {
            tooltip: {
                title: "Verrou SR",
                desc: "Stocke un bit.",
            },
        },
        Mux: {
            tooltip: template("Multiplexeur ${from} vers ${to}"),
        },
        MuxDemux: {
            contextMenu: {
                ShowWiring: "Afficher les connexions",
                UseZForDisconnected: "Utiliser Z pour sorties déconnectées",

                ParamNumFrom: tuple("Nombre d’entrées", template("${val} entrée$s{val}")),
                ParamNumTo: tuple("Nombre de sorties", template("${val} sortie$s{val}")),
                ParamControlAtBottom: "Bits de contrôle en bas",
            },
        },
        Output: {
            tooltip: {
                title: template("Sortie (${numBits} bit$s{numBits})"),
            },
        },
        Display7Seg: {
            tooltip: "Afficheur 7 segments",
        },
        Display16Seg: {
            tooltip: "Afficheur 16 segments",
        },
        DisplayAscii: {
            tooltip: {
                title: "Afficheur de caractère ASCII",
                desc: tuple("Affiche le caractère ASCII représenté par ses 7 entrées, actuellement ", "."),
                CurrentlyUndefined: "Comme toutes ses entrées ne sont pas connues, ce caractère est actuellement indéfini.",
                CurrentlyThisCharacter: "Actuellement, c’est le caractère numéro",
                WhichIsNotPrintable: " (un caractère non imprimable).",
            },
            contextMenu: {
                AdditionalDisplay: "Affichage supplémentaire",
                DisplayNone: "Aucun",
                DisplayDecimal: "Valeur décimale",
                DisplayHex: "Valeur hexadécimale",
                ChangeDisplayDesc: "Changez l’affichage supplémentaire avec un double-clic sur le composant",
            },
        },
        DisplayBar: {
            tooltip: {
                title: "Afficheur lumineux",
                ValueUnknown: "Son état est indéterminé car son entrée n’est pas connue.",
                ValueZ: "Son état est indéterminé car son entrée est flottante (haute impédance).",
                Value1: tuple("Il est actuellement allumé car son entrée est de ", "."),
                Value0: tuple("Il est actuellement éteint car son entrée est de ", "."),
            },
            contextMenu: {
                TransparentWhenOff: "Transparent si éteint",

                Display: "Affichage",
                DisplayVerticalBar: "Barre verticale",
                DisplayHorizontalBar: "Barre horizontale",
                DisplaySmallSquare: "Petit carré",
                DisplayLargeSquare: "Grand carré",
                DisplayChangeDesc: "Changez l’affichage avec un double-clic sur le composant",

                Color: "Couleur",
                ColorGreen: "Vert",
                ColorRed: "Rouge",
                ColorYellow: "Jaune",
            },
        },
        Display: {
            tooltip: {
                title: template("Afficheur ${numBits} bit$s{numBits}"),
                desc: tuple(template("Affiche la valeur ${radixStr} de ses ${numBits} entrée$s{numBits}, actuellement "), "."),

                RadixBinary: "binaire",
                RadixDecimal: "décimale",
                RadixSignedDecimal: "décimale signée",
                RadixHexadecimal: "hexadécimale",
                RadixGeneric: template("en base ${radix}"),
                CurrentlyUndefined: "Comme toutes ses entrées ne sont pas connues, cette valeur est actuellement indéfinie.",
            },
            contextMenu: {
                DisplayAs: "Afficher",
                DisplayNone: "Aucun",
                DisplayAsBinary: "en binaire (base 2)",
                DisplayAsDecimal: "en décimal (base 10)",
                DisplayAsSignedDecimal: "en décimal signé",
                DisplayAsOctal: "en octal (base 8)",
                DisplayAsHexadecimal: "en hexadécimal (base 16)",
                DisplayAsUnknown: "comme inconnu",
            },
        },
        ShiftDisplay: {
            tooltip: "Affichage à décalage",
            contextMenu: {
                Decoding: "Décodage",
                DecodingNone: "Aucun",
                DecodingOctal: "Octal",
                DecodingHex: "Hexadécimal",
                DecodingAscii7: "ASCII (7 bits)",
                DecodingAscii8: "ASCII (8 bits)",
                DecodingUint4: "Entier sur 4 bits",
                DecodingInt4: "Entier signé sur 4 bits",
                DecodingUint8: "Entier sur 8 bits",
                DecodingInt8: "Entier signé sur 8 bits",
                DecodingUint16: "Entier sur 16 bits",
                DecodingInt16: "Entier signé sur 16 bits",
                DecodingChangeWarning: "Attention, changer le décodage peut tronquer la valeur stockée",

                Grouping: "Regrouper les données",
                GroupingNone: "Pas de regroupement",
                GroupBy: template("Par ${n}"),
            },
            EmptyCaption: "(vide)",
        },
        Passthrough: {
            tooltip: "Broche. Sert uniquement à arranger les connexions.",
            contextMenu: {
                Slant: "Inclinaison",
                SlantNone: "Aucune",
                SlantRight: "De 45° vers la droite",
                SlantLeft: "De 45° vers la gauche",
            },
        },
        GateArray: {
            tooltip: {
                title: "Porte multiple",
                desc: template("Effectue plusieurs fois en parallèle l’opération logique choisie; actuellement, ${op}."),
            },
            contextMenu: {
                Type: "Type",
                ShowAsUnknown: "Masquer le type",
            },
        },
        TristateBufferArray: {
            tooltip: {
                title: "Sortie à 3 états multiple",
                desc: "Représente plusieurs sorties à trois états, contrôlées par un seul bit de contrôle.",
            },
        },
        RAM: {
            tooltip: {
                title: "RAM (mémoire vive)",
                desc: template("Stocke ${numWords} ligne$s{numWords} de ${numDataBits} bit$s{numDataBits}."),
            },
            contextMenu: {
                SelectedDataDisplay: "Affichage des données addressées",
                EditContent: "Éditer le contenu…",
                EditContentPrompt: "Tapez le nouveau contenu de la mémoire en séparant les lignes par des espaces. S’il y a autant de caractères que de bits, les données sont lues comme étant du binaire, sinon, comme de l'hexadécimal.",
                SaveContent: "Sauvegarder le contenu",
                LoadContent: "Charger le contenu…",
                SwapROMRAM: "Échanger ROM et RAM",
            },
        },
        ROM: {
            tooltip: {
                title: "ROM (mémoire morte)",
                desc: template("Stocke ${numWords} ligne$s{numWords} de ${numDataBits} bits${numDataBits}."),
            },
        },
        Register: {
            tooltip: {
                title: "Registre",
                desc: template("Stocke ${numBits} bit$s{numBits}."),
            },
            contextMenu: {
                ParamHasIncDec: "Avec incrémentaiton",
                Saturating: "Avec saturation",
            },
        },
        ShiftRegister: {
            tooltip: {
                title: "Registre à décalage",
                desc: template("Stocke ${numBits} bit$s{numBits} et les décale à chaque activation."),
            },
        },
        ControlledInverter: {
            tooltip: {
                title: "Inverseur commuté",
                desc: "Inverse ses entrées si le bit de contrôle S vaut 1; sinon, les sorties sont égales aux entrées.",
            },
        },
        TristateBuffer: {
            tooltip: "Sortie à 3 états",
        },
        Wire: {
            contextMenu: {
                AddMiddlePoint: "Ajouter un point intermédiaire",
                AddPassthrough: "Ajouter une broche",

                CustomPropagationDelay: template("Délai de propagation spécifique${current}…"),
                CustomPropagationDelayDesc: template("Délai de propagation personnalisé en millisecondes pour cette connexion (laisser vide pour utiliser la valeur par défaut du circuit, actuellement de ${current} ms):"),

                WireColor: "Couleur du fil",
                WireColorBlack: "Noir (par défaut)",
                WireColorRed: "Rouge",
                WireColorBlue: "Bleu",
                WireColorYellow: "Jaune",
                WireColorGreen: "Vert",
                WireColorWhite: "Blanc",

                WireStyle: "Style",
                WireStyleDefault: "Par défaut",
                WireStyleAuto: "Auto",
                WireStyleStraight: "Ligne",
                WireStyleSquareHV: "H puis V",
                WireStyleSquareVH: "V puis H",
                WireStyleCurved: "Courbe",

                HiddenWire: "Masquer le fil",
            },
            timeline: {
                PropagatingValue: template("Propagation de la valeur ${val} sur le fil"),
            },
        },
    },
    Dialogs: {
        Generic: {
            Close: "Fermer",
        },
        Share: {
            title: "Partager ce circuit",
            URL: "URL:",
            EmbedInIframe: "Inclusion via <iframe>:",
            EmbedWithWebComp: "Inclusion via un web component:",
            EmbedInMarkdown: "Inclusion en Markdown/Myst:",
        },
    },
}

const Strings_en: Strings = {
    plural: (n: number, plural?: string, singular?: string) => Math.abs(n) === 1 ? (singular ?? "") : (plural ?? "s"),
    ComponentBar: {
        SectionNames: {
            InputOutput: "Input/ Output",
            Gates: "Gates",
            Layout: "Layout",
            Components: "Compo- nents",
            Custom: "Custom",
        },
        Labels: {
            More: "More",
            Less: "Less",
        },
        Components: RichStringEnum.withProps<ComponentStrings>()({
            Input1: ["Input", "IN"],
            InputN: ["Multiple Inputs", "IN Mult."],
            Input8: ["Byte (8-Bit) Input", "IN (8-Bit)"],
            Clock: ["Clock Generator", "Clock"],
            Random: ["Random Input", "Random"],
            Output1: ["Output", "OUT"],
            OutputN: ["Multiple Outputs", "OUT Mult."],
            Output8: ["Byte (8-Bit) Output", "OUT (8-Bit)"],
            DisplayN: ["Value Display", "Display"],
            Display8: ["Byte (8-Bit) Display", "8-Bit Displ."],
            Display7Seg: ["7-Segment Display", "7-Segment"],
            Display16Seg: ["16-Segment Display", "16-Segment"],
            DisplayAscii: ["ASCII Character (7-Bit) Display", "Character"],
            DisplayBar: ["Bit Display as a Light Bar", "Bar"],
            ShiftDisplay: ["Display with Shift Buffer", "Shift Displ."],

            Passthrough1: ["Passthrough", "Passthrough"],
            PassthroughN: ["Passthrough with multiple inputs-outputs", "Passthr. (n)"],
            Label: ["Label", "Label"],
            Rectangle: ["Grouping Rectangle", "Group"],

            not: ["NOT Gate", "NOT"],
            buf: ["Buffer", "BUF"],
            tri: ["Tristate Buffer", "Tristate"],
            and: ["AND Gate", "AND"],
            or: ["OR Gate", "OR"],
            xor: ["XOR Gate", "XOR"],
            nand: ["NAND Gate", "NAND"],
            nor: ["NOR Gate", "NOR"],
            xnor: ["XNOR Gate", "XNOR"],
            imply: ["IMPLY Gate", "IMPLY"],
            nimply: ["NIMPLY Gate", "NIMPLY"],
            transfer: ["Fake 2-Input TRANSFER Gate", "TRANSF."],

            and3: ["3-Input AND Gate", "AND (3)"],
            or3: ["3-Input OR Gate", "OR (3)"],
            xor3: ["3-Input XOR Gate", "XOR (3)"],
            nand3: ["3-Input NAND Gate", "NAND (3)"],
            nor3: ["3-Input NOR Gate", "NOR (3)"],
            xnor3: ["3-Input XNOR Gate", "XNOR (3)"],

            and4: ["4-Input AND Gate", "AND (4)"],
            or4: ["4-Input AND Gate", "OR (4)"],
            xor4: ["4-Input AND Gate", "XOR (4)"],
            nand4: ["4-Input AND Gate", "NAND (4)"],
            nor4: ["4-Input AND Gate", "NOR (4)"],
            xnor4: ["4-Input AND Gate", "XNOR (4)"],

            ControlledInverter: ["Switched Inverter", "Switched Inv."],
            GateArray: ["Gate Array", "Gate Array"],
            TristateBufferArray: ["Tristate Buffer Array", "Tristate Arr."],

            HalfAdder: ["Half Adder", "Half Adder"],
            Adder: ["Full Adder", "Full Adder"],
            AdderArray: ["Adder Array", "Adder Arr."],
            ALU: ["Arithmetic and Logic Unit", "ALU"],

            Mux: ["Multiplexer", "Mux"],
            Mux2to1: ["2-to-1 Multiplexer (1 Control Bit)", "Mux 2-1"],
            Mux4to1: ["4-to-1 Multiplexer (2 Control Bit)", "Mux 4-1"],
            Mux8to1: ["8-to-1 Multiplexer (3 Control Bit)", "Mux 8-1"],
            Mux4to2: ["4-to-2 Multiplexer (1 Control Bit)", "Mux 4-2"],
            Mux8to2: ["8-to-2 Multiplexer (2 Control Bit)", "Mux 8-2"],
            Mux8to4: ["8-to-4 Multiplexer (1 Control Bit)", "Mux 8-4"],
            Mux16to8: ["16-to-8 Multiplexer (1 Control Bit)", "Mux 16-8"],

            Demux: ["Demultiplexer", "Demux"],
            Demux1to2: ["1-to-2 Demultiplexer (1 Control Bit)", "Demux 1-2"],
            Demux1to4: ["1-to-4 Demultiplexer (2 Control Bit)", "Demux 1-4"],
            Demux1to8: ["1-to-8 Demultiplexer (3 Control Bit)", "Demux 1-8"],
            Demux2to4: ["2-to-4 Demultiplexer (1 Control Bit)", "Demux 2-4"],
            Demux2to8: ["2-to-8 Demultiplexer (2 Control Bit)", "Demux 2-8"],
            Demux4to8: ["4-to-8 Demultiplexer (1 Control Bit)", "Demux 4-8"],
            Demux8to16: ["8-to-16 Demultiplexer (1 Control Bit)", "Demux 8-16"],

            LatchSR: ["SR Latch", "SR Latch"],
            FlipflopJK: ["JK Flip-Flop", "FF-JK"],
            FlipflopT: ["T Flip-Flop", "FF-T"],
            FlipflopD: ["D Flip-Flop", "FF-D"],
            Register: ["Register", "Register"],
            ShiftRegister: ["Shift Register", "Shift Reg."],
            RAM: ["RAM Module", "RAM"],
            ROM: ["ROM Module", "ROM"],

            Counter: ["4-Bit Counter", "Counter"],
            Decoder: ["Binary to One-of-N Decoder", "Decoder"],
            Decoder7Seg: ["7-Segment Decoder", "7-Seg. Dec."],
            Decoder16Seg: ["ASCII-to-16-Segment Decoder", "16-Seg. Dec."],
            DecoderBCD4: ["4-Bit-to-BCD Decoder", "BCD Dec."],

            Comparator: ["Comparator", "Compar."],
        }),
    },
    Modes: {
        FULL: tuple("Admin", "In addition to the full mode, this enables features like hiding wire colors, setting inputs and output to undetermined values, create faulty components, etc."),
        DESIGN: tuple("Full", "All standard circuit-design features are enabled"),
        CONNECT: tuple("Connect", "You can move and connect components already on the canvas, but not add more components (the left component bar is not shown)"),
        TRYOUT: tuple("Tryout", "You can only change inputs to try out a already-designed circuit"),
        STATIC: tuple("Static", "Components are displayed without any possible interaction"),
    },
    Orientations: {
        e: "Right (default)",
        s: "Down",
        w: "Left",
        n: "Up",
    },
    Settings: {
        Settings: "Settings",
        CircuitName: "Name:",
        DefaultFileName: "circuit",
        NameOfDownloadedFile: "This will be the name of the downloaded file.",
        animateWires: tuple("Animate wires", "If checked, wires are shown as animated to show the propagation direction."),
        hideWireColors: tuple("Hide wire colors", "If checked, wires are shown with a neutral color instead of showing whether they carry a 1 or a 0."),
        hideInputColors: tuple("Hide input colors", "If checked, inputs are shown with a neutral color, even if they still deliver a well determined value. Can be used together with hidden wire colors."),
        hideOutputColors: tuple("Hide output colors", "If checked, outputs are shown with a neutral color. Can be used together with hidden wire colors."),
        hideMemoryContent: tuple("Hide stored values", "If checked, latches, flip-flops, registers and other memory components don’t show the content they store."),
        showGateTypes: tuple("Show gate types", "If checked, gates types are displayed textually on top of the gate symbol."),
        showDisconnectedPins: tuple("Always show pins", "If unchecked, disconnected component pins are hidden in modes where new connections can’t be made (but stay visible otherwise)."),
        hideTooltips: tuple("Disable tooltips", "If checked, additional information in component tooltips (such as truth tables) won’t be shown."),
        groupParallelWires: tuple("Group parallel wires", "If checked, parallel wires from one component to another will be grouped together as a thicker wire."),
        showHiddenWires: tuple("Show hidden wires", "If checked, hidden wires will still be shown."),
        showAnchors: tuple("Show anchors", "If checked, arrows will be shown to denote which component is anchored to which other component while moving."),
        showIds: tuple("Show IDs", "If checked, component IDs will be shown on top of them"),
        propagationDelay: "A 1 or 0 output on some wire will propagate to the other end of the wire after this propagation delay.",
        propagationDelayField: tuple("Propagation in", "ms"),
        zoomLevel: "The zoom level on the circuit components.",
        zoomLevelField: tuple("Zoom:", "%"),
        showUserDataLink: tuple("See ", "linked data"),
        userDataHeader: "This data is exported with the circuit:",
        wireStyle: "Wire style:",
    },
    Tests: {
        Title: "Tests",
        DefaultTestCaseName: "Test",
        DefaultTestSuiteName: "Test Suite",
        SetInputs: "Inputs",
        WantedOutputs: "Outputs",
        SetTheseInputs: "Set these inputs",
    },
    TopBar: {
        DirtyTooltip: "The circuit has been modified since the last download/save",
        CircuitNameTooltip: "Name of the circuit; click to change",
        SetCircuitName: "Set the name of the circuit (or leave empty to use the default name):",
        CustomComponentCaptionTooltip: "Name of the subcircuit currently being edited; click to change",
        CloseCircuit: "Back to the main circuit",

        Undo: tuple("Undo", "Undo the last action"),
        Redo: tuple("Redo", "Redo the last undone action or repeat the last action"),

        Download: tuple("Download", "Download the circuit (or the custom components with Option/Alt key down)"),
        Screenshot: tuple("Screenshot", "Download the circuit as an image (PNG or SVG with Option/Alt key down)"),
        Open: tuple("Open", "Open a previously downloaded circuit"),
        Reset: tuple("Reset", "Reset the state of this circuit"),

        TimelinePlay: tuple("Play", "Starts logical time"),
        TimelinePause: tuple("Pause", "Stops logical time"),
        TimelineStep: tuple("Step", "Moves logical time to the next scheduled event"),
        TimeLabel: "Time: ",

        Design: tuple("Design", "Create or modify the circuit"),
        Delete: tuple("Delete", "Delete elements from the circuit"),
        Move: tuple("Move", "Move the whole circuit"),

        Tests: tuple("Tests", "Show tests for the circuit"),
    },
    Messages: {
        UnsupportedFileType: template("Unsupported file type: ${type}."),
        LoadedDefinitions: template("Loaded ${n} custom component definition$s{n}"),
        SavedToUrl: "Circuit saved to URL",
        SetAnchorPrompt: "Click on the component to anchor to",
        AnchorAdded: "Anchor added",
        CircularAnchorsForbidden: "Circular anchors are not supported.",
        NotImplemented: "This feature is not implemented yet.",
        ReallyCloseWindow: "Do you really want to close the window without saving the changes?",
        DevelopedBy: "Developed by",

        DidUndo: "Undo",
        DidRedo: "Redo",
        DidRepeat: "Repeat",
        NothingToUndo: "Nothing to undo",
        NothingToRedo: "Nothing to redo or repeat",

        RunningTestCase: template("Running test case ${name}..."),
    },
    Components: {
        Generic: {
            contextMenu: {
                Delete: "Delete",
                Reset: "Reset",

                MakeNewComponent: "Make New Component…",
                MakeNewComponentFailed: "Cannot create new custom component.",

                SetIdentifier: "Set Identifier…",
                ChangeIdentifier: tuple("Change Identifier (", ")…"),
                SetIdentifierPrompt: "Choose the unique identifier to use for this component:",
                IdentifierCannotBeEmpty: "The identifier cannot be empty.",
                IdentifierAlreadyInUseShouldSwap: "The identifier is already in use. Do you want to swap the component identifiers?",

                SetAnchor: "Set Anchor…",
                ClearAnchor: tuple("Remove Anchor (", ")"),

                Orientation: "Orientation",
                ChangeOrientationDesc: "Change the orientation with Command + double click on the component",
                LockPosition: "Lock Position",
                ShowAsUnknown: "Show As Unknown",

                ForceOutputSingle: "Force Output",
                ForceOutputMultiple: "Force an Output",
                Output: "Output",
                NormalOutput: "Normal Output",
                ForceAsUnknown: "Force as Unkown",
                ForceAs1: "Force as 1",
                ForceAs0: "Force as 0",
                ForceAsZ: "Force as High Impedance",
                ForceOutputDesc: "Force an output with Option + click on an output node",

                SetName: "Set Name…",
                ChangeName: "Change Name…",
                SetNamePrompt: "Choose the name to display or leave empty to remove it:",

                SetFontPrompt: tuple("Enter a font specification or leave empty to use the default value (", "):"),

                TriggerOn: "Trigger on",
                TriggerRisingEdge: "Rising Edge",
                TriggerFallingEdge: "Fallling Edge",

                ShowContent: "Show Content",

                ParamNumInputs: tuple("Number of Inputs", template("${val} Input$s{val}")),
                ParamNumBits: tuple("Number of Bits", template("${val} Bit$s{val}")),
                ParamNumWords: tuple("Number of Lines", template("${val} Line$s{val}")),
            },

            InputCarryInDesc: "Cin (Previous Carry)",
            InputClockDesc: "Clock",
            InputClearDesc: "C (Clear, set to 0)",
            InputPresetDesc: "P (Preset, set to 1)",
            InputSetDesc: "S (Set, set to 1)",
            InputResetDesc: "R (Reset, set to 0)",
            InputDataDesc: "D (Data)",
            InputWriteEnableDesc: "WE (Write Enable)",

            OutputSumDesc: "S (Sum)",
            OutputCarryDesc: "C (Carry)",
            OutputCarryOutDesc: "Cout (Carry)",
            OutputQDesc: "Q (Normal Output)",
            OutputQBarDesc: "Q̅ (Inverted Output)",
        },
        Custom: {
            MenuButtonSuffix: " (custom component)",
            contextMenu: {
                ChangeName: "Rename…",
                ChangeNamePrompt: "Enter the name of this custom component:",
                ChangeNameEmpty: "The name cannot be empty.",
                ChangeCircuit: "Edit Circuit",
                Delete: "Delete Custom Component",
                EditFromComponentMessage: "You can edit this custom component by right-clicking such a component in the circuit.",
                CannotDeleteInUse: "Cannot delete this custom component because it is in use in the circuit.",
                CannotDeleteInUseBy: template("Cannot delete this custom component because it is used to define another component (${caption})."),
                ConfirmDelete: "Are you sure you want to delete this custom component?",
            },
            tooltip: {
                titleSuffix: " (Custom Component)",
                desc: "This custom component computes its outputs according to the circuit you have defined.",
            },
            messages: {
                EmptySelection: "No components are selected.",
                NoInput: "No input is selected.",
                NoOutput: "No output is selected.",
                InputsOutputsMustHaveNames: "All inputs and outputs must have unique (non-dynamic) names.",
                MissingComponents: template("The following components are connected to outputs but are missing from selection: ${list}."),
                NoWires: "There are no wires between the selected components.",
                UselessComponents: template("The following components are not connected to outputs and are useless: ${list}."),
                CannotIncludeClock: "Clocks cannot be included in custom components. Add a normal input, which can later be connected to an external clock.",
                EnterCaptionPrompt: "Entrez le nom (unique) du composant personnalisé:",
                ComponentAlreadyExists: template("A custom component definition with id '${id}' already exists."),
                InputsOutputsChanged: "The inputs and outputs have changed and some connections may be removed by adapting the circuit. Do you want to continue?",
                NotInMainEditor: "Please go back to the main editor to edit the custom circuit of this component.",
            },
        },
        Adder: {
            tooltip: {
                title: "Adder",
                desc: "Adds two bits A and B together with an input carry Cin, and outputs a sum bit S and an output carry Cout.",
            },
        },
        AdderArray: {
            tooltip: {
                title: template("${numBits}-Bit Adder Array"),
                desc: "Adds the two inputs numbers A et B together with an input carry Cin, and outputs sum bits S and an output carry Cout.",
            },
        },
        ALU: {
            "A+B": tuple("+", "Addition"),
            "A-B": tuple("A–B", "Subtraction (A – B)"),
            "B-A": tuple("B–A", "Subtraction (B – A)"),
            "A+1": tuple("A+1", "A + 1"),
            "A-1": tuple("A–1", "A – 1"),
            "-A": tuple("–A", "Negation of A"),
            "A*2": tuple("A×2", "Addition of A to itself (A × 2)"),
            "A/2": tuple("A/2", "Arithmetic right shift by 1 (A/2)"),
            "A|B": tuple("OR", "Disjunction (A OR B)"),
            "A&B": tuple("AND", "Conjunction (A AND B)"),
            "A|~B": tuple("ORn", "A OR NOT(B)"),
            "A&~B": tuple("ANDn", "A AND NOT(B)"),
            "~A": tuple("A̅", "Inversion of A"),
            "A^B": tuple("XOR", "Excl. Disjunction (A XOR B)"),
            "A<<": tuple("<<", "Logical Left Shift by 1 of A"),
            "A>>": tuple(">>", "Logical Right Shift by 1 of A"),

            InputCinDesc: "input carry",
            OutputCoutDesc: "output carry",
            tooltip: {
                title: "Arithmetic and Logic Unit (ALU)",
                CurrentlyCarriesOut: "Currently carries out",
                SomeUnknownOperation: "an unknown operation",
                ThisOperation: "operation",
            },
            contextMenu: {
                toggleShowOp: "Show Operation",
                ParamUseExtendedOpcode: "Use Extended Opcode",
            },
        },
        Clock: {
            tooltip: {
                title: "Clock",
                period: tuple("Period: ", " ms"),
                dutycycle: tuple("Duty cycle: ", "%"),
                phase: tuple("Phase: ", " ms"),
            },
            contextMenu: {
                Period: "Period",
                CustomPeriod: "Other",
                SetPeriodMillis: "Enter the period in milliseconds:",
                InvalidPeriod: "The period must be a positive number.",
                ReplaceWithInput: "Replace with Input",
            },
            timeline: {
                NextRisingEdge: "Next rising edge of the clock",
                NextFallingEdge: "Next falling edge of the clock",
            },
        },
        Comparator: {
            tooltip: {
                title: "Comparator",
                desc: "Comparator between two bits A and B, enabled by an input E.",
            },
        },
        Counter: {
            tooltip: {
                title: "Counter",
                desc: "4-bit counter.",
            },
            contextMenu: {
                DisplayTempl: template("${desc} Display"),
                DisplayNone: "No",
                DisplayDecimal: "Decimal",
                DisplayHex: "Hexadecimal",
            },
        },
        Decoder: {
            tooltip: {
                title: "Binary Decoder",
                desc: template("Takes as input a binary number coded on ${numFrom} bit$s{numFrom} and activates the corresponding output among ${numTo} (currently, ${n})."),
            },
        },
        Decoder7Seg: {
            tooltip: "7-Segment Decoder",
        },
        Decoder16Seg: {
            tooltip: "7-Bit ASCII to 16-Segment Decoder",
        },
        DecoderBCD4: {
            tooltip: "4-Bit to BCD (Binary-Coded Decimal) Decoder",
        },
        Demux: {
            tooltip: template("${from}-to-${to} Demultiplexer"),
        },
        FlipflopD: {
            tooltip: {
                title: "D Flip-Flop",
                desc: "Stores one bit.",
            },
        },
        FlipflopJK: {
            InputJDesc: "J (Jump, set to 1)",
            InputKDesc: "K (Kill, set to 0)",
            tooltip: {
                title: "JK Flip-Flop",
                desc: "Stores one bit.",
            },
        },
        FlipflopT: {
            InputTDesc: "T (Toggle)",
            tooltip: {
                title: "T Flip-Flop",
                desc: "Stores one bit.",
            },
        },
        Gate: {
            not: tuple("NOT", "NOT", "The output is the inverted input."),
            buf: tuple("BUF", "BUF", "The output is the same as the input."),

            and: tuple("AND", "AND", "The output is 1 when all inputs are 1."),
            or: tuple("OR", "OR", "The output is 1 when at least one of the inputs is 1."),
            xor: tuple("XOR", "XOR", "The output is 1 when an odd number of inputs are 1."),
            nand: tuple("NAND", "NAND", "Inverted AND gate: the output is 1 unless all inputs are 1."),
            nor: tuple("NOR", "NOR", "Inverted OR gate: the output is 1 when all inputs are 0."),
            xnor: tuple("XNOR", "XNOR", "Inverted XOR gate: the output is 1 when an even number of inputs are 1."),

            imply: tuple("IMPLY", "IMPL", "The output is 1 if the first input is 0 or if both inputs are 1."),
            rimply: tuple("IMPLY (bis)", "IMPL", "The output is 1 if the second input is 0 or if both inputs are 1."),
            nimply: tuple("NIMPLY", "N-IMPL", "Inverted IMPLY gate: the output is only 1 if the first input is 1 and the second one 0."),
            rnimply: tuple("NIMPLY (bis)", "N-IMPL", "Inverted IMPLY gate: la sortie ne vaut 1 que lorsque la première entrée vaut 0 et la seconde 1."),

            txa: tuple("TRANSFER-A", undefined, "The output is the same as the first input; the second input is ignored."),
            txb: tuple("TRANSFER-B", undefined, "The output is the same as the second input; the first input is ignored."),
            txna: tuple("TRANSFER-NOT-A", undefined, "The output is the inverted first input; the second input is ignored."),
            txnb: tuple("TRANSFER-NOT-B", undefined, "The output is the inverted second input; the first input is ignored."),

            tooltip: {
                GateTitle: (gateType: Modifier) => mods(gateType, " Gate"),
                UnknownGate: "Unknown Gate",
                Input: "Input",
                Output: "Output",
                CurrentlyDelivers: "It currently delivers",
                ShouldCurrentlyDeliver: "it should currently deliver",
                UndeterminedOutputBecauseInputUnknown: "an unknown output as its input is unknown. Its truth table is:",
                UndeterminedOutputBecauseInputsUnknown: "an unknown output as not all inputs are known. Its truth table is:",
                ThisOutput: "the output",
                BecauseInputIs: "because its input is",
                AccordingToTruthTable: "according to the following truth table:",
                Inverter: tuple("Inverter (", " gate)"),
                Buffer: tuple("Buffer (", " gate)"),
            },

            contextMenu: {
                ReplaceBy: "Replace By",
                GateTempl: template("${type} Gate"),
                ShowAs: "Show As",
                NormalGateTempl: template("Normal ${type} Gate"),
                UnknownGate: "Unknown Gate (with “?”)",
                VariantChangeDesc: "Switch to a variant with Shift + double-click on the gate",
            },
        },
        HalfAdder: {
            tooltip: {
                title: "Half Adder",
                desc: "Adds two bits A and B. Outputs a sum bit S and an output carry bit C.",
            },
        },
        Input: {
            tooltip: {
                title: template("Input (${numBits}-Bit)"),
            },
            contextMenu: {
                LockValue: "Lock This Value",
                PushButton: "Push Button",
                ToggleButton: "Toggle Button",
                ReplaceWithClock: "Replace With Clock",
            },
        },
        Random: {
            tooltip: {
                title: "Random Input",
                desc: tuple("When triggered by the clock, the output value will be 1 with probability ", "."),
            },
            contextMenu: {
                ShowProb: "Show Probability",
            },
        },
        Rectangle: {
            contextMenu: {
                Size: "Size",
                SizePrompt: "Enter the size of this rectangle:",
                Rounded: "Rounded",
                WithBackgroundColor: "With Background Color",
                SetTitle: "Add Title…",
                ChangeTitle: "Change Title…",
                SetTitlePrompt: "Enter the title to display or leave empty to remove it:",
                InsideFrame: "Inside Frame",
                Font: "Font",

                Color: "Color",
                ColorYellow: "Yellow",
                ColorRed: "Red",
                ColorGreen: "Green",
                ColorBlue: "Blue",
                ColorTurquoise: "Turquoise",
                ColorGrey: "Grey",

                Border: "Border",
                BorderNone: "None",
                Border1px: "Fine (1 pixel)",
                Border2px: "Medium (2 pixels)",
                Border3px: "Thick (3 pixels)",
                Border5px: "Very Thick (5 pixels)",
                Border10px: "Huge (10 pixels)",

                TitlePlacement: "Title Placement",
                PlacementTop: "Top",
                PlacementTopLeft: "Top Left",
                PlacementTopRight: "Top Right",
                PlacementBottom: "Bottom",
                PlacementBottomLeft: "Bottom Left",
                PlacementBottomRight: "Bottom Right",
                PlacementLeft: "Left",
                PlacementRight: "Right",
                PlacementCenter: "Center",
            },
        },
        Label: {
            contextMenu: {
                ChangeText: "Change Text…",
                ChangeTextPrompt: "Type the text to display:",
                Font: "Font…",
            },
        },
        LatchSR: {
            tooltip: {
                title: "SR Latch",
                desc: "Stores one bit.",
            },
        },
        Mux: {
            tooltip: template("${from}-to-${to} Multiplexer"),
        },
        MuxDemux: {
            contextMenu: {
                ShowWiring: "Show Internal Wiring",
                UseZForDisconnected: "Use Z For Disconnected Pins",

                ParamNumFrom: tuple("Number of Inputs", template("${val} Input$s{val}")),
                ParamNumTo: tuple("Number of Outputs", template("${val} Output$s{val}")),
                ParamControlAtBottom: "Control Bits at Bottom",
            },
        },
        Output: {
            tooltip: {
                title: template("Output (${numBits}-Bit)"),
            },
        },
        Display7Seg: {
            tooltip: "7-Segment Display",
        },
        Display16Seg: {
            tooltip: "16-Segment Display",
        },
        DisplayAscii: {
            tooltip: {
                title: "ASCII Character Display",
                desc: tuple("Displays the ASCII character represented by the 7 inputs, currently ", "."),
                CurrentlyUndefined: "As not all inputs are known, this character is currently undefined.",
                CurrentlyThisCharacter: "Currently, this character is",
                WhichIsNotPrintable: " (a non-printable character).",
            },
            contextMenu: {
                AdditionalDisplay: "Additional Display",
                DisplayNone: "None",
                DisplayDecimal: "Decimal Value",
                DisplayHex: "Hexadecimal Value",
                ChangeDisplayDesc: "Change the additional display with a double-click on the component",
            },
        },
        DisplayBar: {
            tooltip: {
                title: "Bar/LED Display",
                ValueUnknown: "Its state is undefined because its input is unknown.",
                ValueZ: "Its state is undefined because its input is floating (high impedance).",
                Value1: tuple("It is currently on because its input is ", "."),
                Value0: tuple("It is currently off because its input is ", "."),
            },
            contextMenu: {
                TransparentWhenOff: "Transparent When Off",

                Display: "Display",
                DisplayVerticalBar: "Vertical Bar",
                DisplayHorizontalBar: "Horizontal Bar",
                DisplaySmallSquare: "Small Square",
                DisplayLargeSquare: "Large Square",
                DisplayChangeDesc: "Change display types with a double-click on the component",

                Color: "Color",
                ColorGreen: "Green",
                ColorRed: "Red",
                ColorYellow: "Yellow",
            },
        },
        Display: {
            tooltip: {
                title: template("${numBits}-Bit Display"),
                desc: tuple(template("Displays the ${radixStr} value of its ${numBits} input$s{numBits}, which is currently "), "."),

                RadixBinary: "binary",
                RadixDecimal: "decimal",
                RadixSignedDecimal: "signed decimal",
                RadixHexadecimal: "hexadecimal",
                RadixGeneric: template("base-${radix}"),

                CurrentlyUndefined: "As not all inputs are known, this value is currently undefined.",
            },
            contextMenu: {
                DisplayAs: "Display as",
                DisplayNone: "None",
                DisplayAsBinary: "Binary (Base 2)",
                DisplayAsDecimal: "Decimal (Base 10)",
                DisplayAsSignedDecimal: "Signed Decimal",
                DisplayAsOctal: "Octal (Base 8)",
                DisplayAsHexadecimal: "Hexadecimal (Base 16)",
                DisplayAsUnknown: "Unkown",
            },
        },
        ShiftDisplay: {
            tooltip: "Shift Buffer Display",
            contextMenu: {
                Decoding: "Decoding",
                DecodingNone: "None",
                DecodingOctal: "Octal",
                DecodingHex: "Hexadecimal",
                DecodingAscii7: "ASCII (on 7 bits)",
                DecodingAscii8: "ASCII (on 8 bits)",
                DecodingUint4: "4-Bit Integer",
                DecodingInt4: "4-Bit Signed Integer",
                DecodingUint8: "8-Bit Integer",
                DecodingInt8: "8-Bit Signed Integer",
                DecodingUint16: "16-Bit Integer",
                DecodingInt16: "16-Bit Signed Integer",
                DecodingChangeWarning: "Changing the decoding may truncate the stored value.",

                Grouping: "Group Data",
                GroupingNone: "No Grouping",
                GroupBy: template("By ${n}"),
            },
            EmptyCaption: "(empty)",
        },
        Passthrough: {
            tooltip: "Passthrough. Only used to arrange wires.",
            contextMenu: {
                Slant: "Slant",
                SlantNone: "None",
                SlantRight: "Rightward By 45°",
                SlantLeft: "Leftward By 45°",
            },
        },
        GateArray: {
            tooltip: {
                title: "Gate Array",
                desc: template("Computes in parallel several times the chosen logical operation, which currently is ${op}."),
            },
            contextMenu: {
                Type: "Type",
                ShowAsUnknown: "Hide Type",
            },
        },
        TristateBufferArray: {
            tooltip: {
                title: "Tristate Buffer Array",
                desc: "Represents multiple tristate buffers switched by a single control bit.",
            },
        },
        RAM: {
            tooltip: {
                title: "RAM (Random-Access Memory)",
                desc: template("Stores ${numWords} row$s{numWords} of ${numDataBits} bit$s{numDataBits}."),
            },
            contextMenu: {
                SelectedDataDisplay: "Addressed Data Display",
                EditContent: "Edit Content…",
                EditContentPrompt: "Type in the new memory content, separating lines with spaces. If there are as many characters as bits, the input is parsed as a binary string, and otherwise as a hexadecimal string.",
                SaveContent: "Save Content",
                LoadContent: "Load Content…",
                SwapROMRAM: "Swap ROM/RAM",
            },
        },
        ROM: {
            tooltip: {
                title: "ROM (Read-Only Memory)",
                desc: template("Stores ${numWords} row$s{numWords} of ${numDataBits} bit$s{numDataBits}."),
            },
        },
        Register: {
            tooltip: {
                title: "Register",
                desc: template("Stores ${numBits} bit$s{numBits}."),
            },
            contextMenu: {
                ParamHasIncDec: "With Increment/Decrement",
                Saturating: "Saturating",
            },
        },
        ShiftRegister: {
            tooltip: {
                title: "Shift Register",
                desc: template("Stores ${numBits} bit$s{numBits} and shifts them left or right at each activation."),
            },
        },
        ControlledInverter: {
            tooltip: {
                title: "Switched Inverter",
                desc: "Inverts its inputs when the control bit S is on; otherwise, just outputs the inputs.",
            },
        },
        TristateBuffer: {
            tooltip: "Tristate Buffer",
        },
        Wire: {
            contextMenu: {
                AddMiddlePoint: "Add Middle Point",
                AddPassthrough: "Add Passthrough",

                CustomPropagationDelay: template("Specific Propagation Delay${current}…"),
                CustomPropagationDelayDesc: template("Specific propagation delay in milliseconds for this connection (leave empty to use the default value for the circuit, which currently is ${current} ms):"),

                WireColor: "Wire Color",
                WireColorBlack: "Black (default)",
                WireColorRed: "Red",
                WireColorGreen: "Green",
                WireColorBlue: "Blue",
                WireColorYellow: "Yellow",
                WireColorWhite: "White",

                WireStyle: "Style",
                WireStyleDefault: "By Default",
                WireStyleAuto: "Auto",
                WireStyleStraight: "Straight",
                WireStyleSquareHV: "H then V",
                WireStyleSquareVH: "V then H",
                WireStyleCurved: "Curve",

                HiddenWire: "Hide Wire",
            },
            timeline: {
                PropagatingValue: template("Propagation of value ${val} on wire"),
            },
        },
    },
    Dialogs: {
        Generic: {
            Close: "Close",
        },
        Share: {
            title: "Share Circuit",
            URL: "URL:",
            EmbedInIframe: "Embed using <iframe>:",
            EmbedWithWebComp: "Embed with a web component:",
            EmbedInMarkdown: "Embed in Markdown/Myst:",
        },
    },
}


const langs = {
    fr: Strings_fr,
    en: Strings_en,
}

export type Lang = keyof typeof langs

export function isLang(lang: string): lang is Lang {
    return lang in langs
}

export function setLang(l: Lang) {
    // console.log(`Setting language to '${l}'`)
    S = langs[l]
    _lang = l
}

export function getLang(): Lang {
    return _lang
}

export const DefaultLang: Lang = "en"

/** The current language strings. */
export let S: Strings = langs[DefaultLang]
let _lang: Lang = DefaultLang
