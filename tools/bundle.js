#!/usr/bin/env node

(async function () {
    const args = process.argv.slice(2)

    function consumeArg(arg) {
        const index = args.indexOf(arg)
        if (index !== -1) {
            args.splice(index, 1)
            return true
        }
        return false
    }

    const dev = consumeArg("--dev")
    const dist = consumeArg("--dist")

    if ((!dev && !dist)) {
        console.error("Must specify --dev or --dist")
        process.exit(1)
    }

    if (args.length > 0) {
        console.error("Unknown arguments: " + args.join(" "))
        process.exit(1)
    }

    if (dist) {
        console.log("Building dist bundle")
        await build(true)
    }

    if (dev) {
        console.log("Building dev bundle")
        const res = await build(false)
    }

})()

/**
 * @param {boolean} dist 
 * @returns {Promise<string>}
 */
async function build(dist) {

    const minify = dist
    const suffix = dist ? "" : "-dev"
    const outHtmlFile = dist ? "index-dist.html" : "index.html"

    const bundleFile = `simulator/lib/bundle${suffix}.js`

    const esbuild = require("esbuild")


    const result = await esbuild
        .build({
            minify,
            keepNames: true,
            bundle: true,
            sourcemap: true,
            loader: {
                ".html": "text",
                ".css": "text",
                ".icon.svg": "text",
                ".svg": "text",
            },
            logLevel: "info",
            entryPoints: ["simulator/src/LogicEditor.ts"],
            outfile: bundleFile,
            metafile: dist,

            // some libs want to call define() to define AMD modules, which causes problems with e.g. the Moodle plugin
            banner: {
                js: `var __savedDefine = typeof define === 'function' && define; if (typeof define === 'function') define = undefined;`,
            },
            footer: {
                js: `if (__savedDefine) define = __savedDefine;`,
            },
        })
        .then(result => {
            const fs = require("fs")
            const crypto = require("crypto")

            if (result.metafile) {
                const metafilePath = 'simulator/lib/bundlemeta.json'
                fs.writeFileSync(metafilePath, JSON.stringify(result.metafile))
                console.log("Wrote metafile to: " + metafilePath + "\n\n")
            }

            // compute md5 hash of the bundle
            const hash = crypto.createHash("md5")
            const bundle = fs.readFileSync(bundleFile)
            hash.update(bundle)
            const md5 = hash.digest("hex")
            // console.log("MD5 hash of bundle: " + md5)

            // insert md5 hash into index-template.html
            const indexTemplate = fs.readFileSync("simulator/html/index-template.html", "utf8")
            const index = indexTemplate
                .replaceAll("{{SUFFIX}}", suffix)
                .replaceAll("{{BUNDLE_MD5}}", md5)
            fs.writeFileSync(outHtmlFile, index)
            result.outHtmlFile = outHtmlFile
            return result
        })
        .catch((err) => {
            console.error(err)
            process.exit(1)
        });

}

