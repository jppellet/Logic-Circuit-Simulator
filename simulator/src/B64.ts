// Inpired by http://www.webtoolkit.info/javascript-base64.html

export const B64 = {

    alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=',
    lookup: null as null | { [key: string]: number },
    ie: /MSIE /.test(navigator.userAgent),
    ieo: /MSIE [67]/.test(navigator.userAgent),

    encode: function (s: string) {
        const buffer = B64.toUtf8(s)
        const len = buffer.length
        const enc = [NaN, NaN, NaN, NaN]
        let position = -1,
            nan0, nan1, nan2
        if (B64.ie) {
            const result: Array<string> = []
            while (++position < len) {
                nan0 = buffer[position]
                nan1 = buffer[++position]
                enc[0] = nan0 >> 2
                enc[1] = ((nan0 & 3) << 4) | (nan1 >> 4)
                if (isNaN(nan1)) { enc[2] = enc[3] = 64 }
                else {
                    nan2 = buffer[++position]
                    enc[2] = ((nan1 & 15) << 2) | (nan2 >> 6)
                    enc[3] = (isNaN(nan2)) ? 64 : nan2 & 63
                }
                result.push(B64.alphabet.charAt(enc[0]), B64.alphabet.charAt(enc[1]), B64.alphabet.charAt(enc[2]), B64.alphabet.charAt(enc[3]))
            }
            return result.join('')
        } else {
            let result = ''
            while (++position < len) {
                nan0 = buffer[position]
                nan1 = buffer[++position]
                enc[0] = nan0 >> 2
                enc[1] = ((nan0 & 3) << 4) | (nan1 >> 4)
                if (isNaN(nan1)) { enc[2] = enc[3] = 64 }
                else {
                    nan2 = buffer[++position]
                    enc[2] = ((nan1 & 15) << 2) | (nan2 >> 6)
                    enc[3] = (isNaN(nan2)) ? 64 : nan2 & 63
                }
                result += B64.alphabet[enc[0]] + B64.alphabet[enc[1]] + B64.alphabet[enc[2]] + B64.alphabet[enc[3]]
            }
            return result
        }
    },

    decode: function (s: string) {
        if (s.length % 4) { throw new Error("InvalidCharacterError: 'B64.decode' failed: The string to be decoded is not correctly encoded.") }
        const buffer = B64.fromUtf8(s)
        const len = buffer.length
        let position = 0
        if (B64.ieo) {
            const result: Array<string> = []
            while (position < len) {
                if (buffer[position] < 128) { result.push(String.fromCharCode(buffer[position++])) }
                else if (buffer[position] > 191 && buffer[position] < 224) { result.push(String.fromCharCode(((buffer[position++] & 31) << 6) | (buffer[position++] & 63))) }
                else { result.push(String.fromCharCode(((buffer[position++] & 15) << 12) | ((buffer[position++] & 63) << 6) | (buffer[position++] & 63))) }
            }
            return result.join('')
        } else {
            let result = ''
            while (position < len) {
                if (buffer[position] < 128) { result += String.fromCharCode(buffer[position++]) }
                else if (buffer[position] > 191 && buffer[position] < 224) { result += String.fromCharCode(((buffer[position++] & 31) << 6) | (buffer[position++] & 63)) }
                else { result += String.fromCharCode(((buffer[position++] & 15) << 12) | ((buffer[position++] & 63) << 6) | (buffer[position++] & 63)) }
            }
            return result
        }
    },

    toUtf8: function (s: string) {
        const len = s.length
        const buffer: Array<number> = []
        let position = -1
        // eslint-disable-next-line no-control-regex
        if (/^[\x00-\x7f]*$/.test(s)) {
            while (++position < len) { buffer.push(s.charCodeAt(position)) }
        }
        else {
            while (++position < len) {
                const chr = s.charCodeAt(position)
                if (chr < 128) { buffer.push(chr) }
                else if (chr < 2048) { buffer.push((chr >> 6) | 192, (chr & 63) | 128) }
                else { buffer.push((chr >> 12) | 224, ((chr >> 6) & 63) | 128, (chr & 63) | 128) }
            }
        }
        return buffer
    },
    fromUtf8: function (s: string) {
        let position = -1
        let len
        const buffer: Array<number> = []
        const enc = [NaN, NaN, NaN, NaN]

        if (B64.lookup === null) {
            len = B64.alphabet.length
            B64.lookup = {}
            while (++position < len) { B64.lookup[B64.alphabet.charAt(position)] = position }
            position = -1
        }
        len = s.length
        while (++position < len) {
            enc[0] = B64.lookup[s.charAt(position)]
            enc[1] = B64.lookup[s.charAt(++position)]
            buffer.push((enc[0] << 2) | (enc[1] >> 4))
            enc[2] = B64.lookup[s.charAt(++position)]
            if (enc[2] === 64) { break }
            buffer.push(((enc[1] & 15) << 4) | (enc[2] >> 2))
            enc[3] = B64.lookup[s.charAt(++position)]
            if (enc[3] === 64) { break }
            buffer.push(((enc[2] & 3) << 6) | enc[3])
        }
        return buffer
    },
}
