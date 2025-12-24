class Utfx {
    constructor() {
        this.MAX_CODEPOINT = 0x10FFFF;
    };
    encodeUTF8(src, dst) {
        var cp = null;
        if (typeof src === 'number')
            cp = src,
                src = function() {
                return null;
            };
        while (cp !== null || (cp = src()) !== null) {
            if (cp < 0x80)
                dst(cp & 0x7F);
            else if (cp < 0x800)
                dst(((cp >> 6) & 0x1F) | 0xC0),
                    dst((cp & 0x3F) | 0x80);
            else if (cp < 0x10000)
                dst(((cp >> 12) & 0x0F) | 0xE0),
                    dst(((cp >> 6) & 0x3F) | 0x80),
                    dst((cp & 0x3F) | 0x80);
            else
                dst(((cp >> 18) & 0x07) | 0xF0),
                    dst(((cp >> 12) & 0x3F) | 0x80),
                    dst(((cp >> 6) & 0x3F) | 0x80),
                    dst((cp & 0x3F) | 0x80);
            cp = null;
        };
    };
    decodeUTF8(src, dst) {
        var a, b, c, d, fail = function(b) {
            b = b.slice(0, b.indexOf(null));
            var err = Error(b.toString());
            err.name = "TruncatedError";
            err['bytes'] = b;
            throw err;
        };
        while ((a = src()) !== null) {
            if ((a & 0x80) === 0)
                dst(a);
            else if ((a & 0xE0) === 0xC0)
                ((b = src()) === null) && fail([a, b]),
                    dst(((a & 0x1F) << 6) | (b & 0x3F));
            else if ((a & 0xF0) === 0xE0)
                ((b = src()) === null ||
                 (c = src()) === null) &&
                    fail([a, b, c]),
                    dst(((a & 0x0F) << 12) | ((b & 0x3F) << 6) | (c & 0x3F));
            else if ((a & 0xF8) === 0xF0)
                ((b = src()) === null ||
                 (c = src()) === null || (d = src()) === null) &&
                    fail([a, b, c, d]),
                    dst(((a & 0x07) << 18) | ((b & 0x3F) << 12) | ((c & 0x3F) << 6) | (d & 0x3F));
            else throw RangeError("Illegal starting byte: " + a);
        };
    };
    UTF16toUTF8(src, dst) {
        var c1, c2 = null;
        while (true) {
            if ((c1 = c2 !== null ? c2 : src()) === null) break;
            if (c1 >= 0xD800 && c1 <= 0xDFFF) {
                if ((c2 = src()) !== null) {
                    if (c2 >= 0xDC00 && c2 <= 0xDFFF) {
                        dst((c1 - 0xD800) * 0x400 + c2 - 0xDC00 + 0x10000);
                        c2 = null;
                        continue;
                    };
                };
            };
            dst(c1);
        };
        if (c2 !== null) dst(c2);
    };
    UTF8toUTF16 = function(src, dst) {
        var cp = null;
        if (typeof src === 'number')
            cp = src, src = function() {
                return null;
            };
        while (cp !== null || (cp = src()) !== null) {
            if (cp <= 0xFFFF)
                dst(cp);
            else
                cp -= 0x10000,
                    dst((cp >> 10) + 0xD800),
                    dst((cp % 0x400) + 0xDC00);
            cp = null;
        };
    };
    encodeUTF16toUTF8(src, dst) {
        utfx.UTF16toUTF8(src, (cp) => {
            utfx.encodeUTF8(cp, dst);
        });
    };
    decodeUTF8toUTF16(src, dst) {
        utfx.decodeUTF8(src, (cp) => {
            utfx.UTF8toUTF16(cp, dst);
        });
    };
    calculateCodePoint(cp) {
        return (cp < 0x80) ? 1 : (cp < 0x800) ? 2 : (cp < 0x10000) ? 3 : 4;
    };
    calculateUTF8(src) {
        var cp, l = 0;
        while ((cp = src()) !== null)
            l += (cp < 0x80) ? 1 : (cp < 0x800) ? 2 : (cp < 0x10000) ? 3 : 4;
        return l;
    };
    calculateUTF16asUTF8(src) {
        var n = 0,
            l = 0;
        utfx.UTF16toUTF8(src, (cp) => {
            ++n;
            l += (cp < 0x80) ? 1 : (cp < 0x800) ? 2 : (cp < 0x10000) ? 3 : 4;
        });
        return [n, l];
    };
}

let utfx = new Utfx();

class ByteBuffer {
    constructor(capacity, littleEndian, noAssert) {
        if(typeof capacity === 'undefined')
            capacity = ByteBuffer.DEFAULT_CAPACITY;
        if(typeof littleEndian === 'undefined')
            littleEndian = ByteBuffer.DEFAULT_ENDIAN;
        if(typeof noAssert === 'undefined')
            noAssert = ByteBuffer.DEFAULT_NOASSERT;
        if(!noAssert) {
            capacity = capacity | 0;
            if(capacity < 0)
                throw RangeError("Illegal capacity");
            littleEndian = !!littleEndian;
            noAssert = !!noAssert;
        }
        var EMPTY_BUFFER = new ArrayBuffer(0);
        this.buffer = capacity === 0 ? EMPTY_BUFFER : new ArrayBuffer(capacity);
        this.view = capacity === 0 ? null : new Uint8Array(this.buffer);
        this.offset = 0;
        this.markedOffset = -1;
        this.limit = capacity;
        this.littleEndian = littleEndian;
        this.noAssert = noAssert;
    };
    stringSource(s) {
        var i = 0;
        return function() {
            return i < s.length ? s.charCodeAt(i++) : null;
        };
    }
    stringDestination() {
        var cs = [],
            ps = [];
        return function() {
            if(arguments.length === 0)
                return ps.join('') + String.fromCharCode.apply(String, cs);
            if(cs.length + arguments.length > 1024)
                ps.push(String.fromCharCode.apply(String, cs)),
                cs.length = 0;
            Array.prototype.push.apply(cs, arguments);
        };
    }
    readInt8(offset) {
        var relative = typeof offset === 'undefined';
        if(relative) offset = this.offset;
        if(!this.noAssert) {
            if(typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: " + offset + " (not an integer)");
            offset >>>= 0;
            if(offset < 0 || offset + 1 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 1 + ") <= " + this.buffer.byteLength);
        }
        var value = this.view[offset];
        if((value & 0x80) === 0x80) value = -(0xFF - value + 1); // Cast to signed
        if(relative) this.offset += 1;
        return value;
    };
    writeUint8(value, offset) {
        var relative = typeof offset === 'undefined';
        if(relative) offset = this.offset;
        if(!this.noAssert) {
            if(typeof value !== 'number' || value % 1 !== 0)
                throw TypeError("Illegal value: " + value + " (not an integer)");
            value >>>= 0;
            if(typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: " + offset + " (not an integer)");
            offset >>>= 0;
            if(offset < 0 || offset + 0 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + this.buffer.byteLength);
        }
        offset += 1;
        var capacity1 = this.buffer.byteLength;
        if(offset > capacity1)
            this.resize((capacity1 *= 2) > offset ? capacity1 : offset);
        offset -= 1;
        this.view[offset] = value;
        if(relative) this.offset += 1;
        return this;
    };
    readUint8(offset) {
        var relative = typeof offset === 'undefined';
        if(relative) offset = this.offset;
        if(!this.noAssert) {
            if(typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: " + offset + " (not an integer)");
            offset >>>= 0;
            if(offset < 0 || offset + 1 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 1 + ") <= " + this.buffer.byteLength);
        }
        var value = this.view[offset];
        if(relative) this.offset += 1;
        return value;
    };
    writeInt16(value, offset) {
        var relative = typeof offset === 'undefined';
        if(relative) offset = this.offset;
        if(!this.noAssert) {
            if(typeof value !== 'number' || value % 1 !== 0)
                throw TypeError("Illegal value: " + value + " (not an integer)");
            value |= 0;
            if(typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: " + offset + " (not an integer)");
            offset >>>= 0;
            if(offset < 0 || offset + 0 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + this.buffer.byteLength);
        }
        offset += 2;
        var capacity2 = this.buffer.byteLength;
        if(offset > capacity2)
            this.resize((capacity2 *= 2) > offset ? capacity2 : offset);
        offset -= 2;
        if(this.littleEndian) {
            this.view[offset + 1] = (value & 0xFF00) >>> 8;
            this.view[offset] = value & 0x00FF;
        } else {
            this.view[offset] = (value & 0xFF00) >>> 8;
            this.view[offset + 1] = value & 0x00FF;
        }
        if(relative) this.offset += 2;
        return this;
    };
    readInt16(offset) {
        var relative = typeof offset === 'undefined';
        if(relative) offset = this.offset;
        if(!this.noAssert) {
            if(typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: " + offset + " (not an integer)");
            offset >>>= 0;
            if(offset < 0 || offset + 2 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 2 + ") <= " + this.buffer.byteLength);
        }
        var value = 0;
        if(this.littleEndian) {
            value = this.view[offset];
            value |= this.view[offset + 1] << 8;
        } else {
            value = this.view[offset] << 8;
            value |= this.view[offset + 1];
        }
        if((value & 0x8000) === 0x8000) value = -(0xFFFF - value + 1); // Cast to signed
        if(relative) this.offset += 2;
        return value;
    };
    writeUint16(value, offset) {
        var relative = typeof offset === 'undefined';
        if(relative) offset = this.offset;
        if(!this.noAssert) {
            if(typeof value !== 'number' || value % 1 !== 0)
                throw TypeError("Illegal value: " + value + " (not an integer)");
            value >>>= 0;
            if(typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: " + offset + " (not an integer)");
            offset >>>= 0;
            if(offset < 0 || offset + 0 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + this.buffer.byteLength);
        }
        offset += 2;
        var capacity3 = this.buffer.byteLength;
        if(offset > capacity3)
            this.resize((capacity3 *= 2) > offset ? capacity3 : offset);
        offset -= 2;
        if(this.littleEndian) {
            this.view[offset + 1] = (value & 0xFF00) >>> 8;
            this.view[offset] = value & 0x00FF;
        } else {
            this.view[offset] = (value & 0xFF00) >>> 8;
            this.view[offset + 1] = value & 0x00FF;
        }
        if(relative) this.offset += 2;
        return this;
    };
    readUint16(offset) {
        var relative = typeof offset === 'undefined';
        if(relative) offset = this.offset;
        if(!this.noAssert) {
            if(typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: " + offset + " (not an integer)");
            offset >>>= 0;
            if(offset < 0 || offset + 2 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 2 + ") <= " + this.buffer.byteLength);
        }
        var value = 0;
        if(this.littleEndian) {
            value = this.view[offset];
            value |= this.view[offset + 1] << 8;
        } else {
            value = this.view[offset] << 8;
            value |= this.view[offset + 1];
        }
        if(relative) this.offset += 2;
        return value;
    };
    writeInt32(value, offset) {
        var relative = typeof offset === 'undefined';
        if(relative) offset = this.offset;
        if(!this.noAssert) {
            if(typeof value !== 'number' || value % 1 !== 0)
                throw TypeError("Illegal value: " + value + " (not an integer)");
            value |= 0;
            if(typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: " + offset + " (not an integer)");
            offset >>>= 0;
            if(offset < 0 || offset + 0 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + this.buffer.byteLength);
        }
        offset += 4;
        var capacity4 = this.buffer.byteLength;
        if(offset > capacity4)
            this.resize((capacity4 *= 2) > offset ? capacity4 : offset);
        offset -= 4;
        if(this.littleEndian) {
            this.view[offset + 3] = (value >>> 24) & 0xFF;
            this.view[offset + 2] = (value >>> 16) & 0xFF;
            this.view[offset + 1] = (value >>> 8) & 0xFF;
            this.view[offset] = value & 0xFF;
        } else {
            this.view[offset] = (value >>> 24) & 0xFF;
            this.view[offset + 1] = (value >>> 16) & 0xFF;
            this.view[offset + 2] = (value >>> 8) & 0xFF;
            this.view[offset + 3] = value & 0xFF;
        }
        if(relative) this.offset += 4;
        return this;
    };
    readInt32(offset) {
        var relative = typeof offset === 'undefined';
        if(relative) offset = this.offset;
        if(!this.noAssert) {
            if(typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: " + offset + " (not an integer)");
            offset >>>= 0;
            if(offset < 0 || offset + 4 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 4 + ") <= " + this.buffer.byteLength);
        }
        var value = 0;
        if(this.littleEndian) {
            value = this.view[offset + 2] << 16;
            value |= this.view[offset + 1] << 8;
            value |= this.view[offset];
            value += this.view[offset + 3] << 24 >>> 0;
        } else {
            value = this.view[offset + 1] << 16;
            value |= this.view[offset + 2] << 8;
            value |= this.view[offset + 3];
            value += this.view[offset] << 24 >>> 0;
        }
        value |= 0;
        if(relative) this.offset += 4;
        return value;
    };
    writeUint32(value, offset) {
        var relative = typeof offset === 'undefined';
        if(relative) offset = this.offset;
        if(!this.noAssert) {
            if(typeof value !== 'number' || value % 1 !== 0)
                throw TypeError("Illegal value: " + value + " (not an integer)");
            value >>>= 0;
            if(typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: " + offset + " (not an integer)");
            offset >>>= 0;
            if(offset < 0 || offset + 0 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + this.buffer.byteLength);
        }
        offset += 4;
        var capacity5 = this.buffer.byteLength;
        if(offset > capacity5)
            this.resize((capacity5 *= 2) > offset ? capacity5 : offset);
        offset -= 4;
        if(this.littleEndian) {
            this.view[offset + 3] = (value >>> 24) & 0xFF;
            this.view[offset + 2] = (value >>> 16) & 0xFF;
            this.view[offset + 1] = (value >>> 8) & 0xFF;
            this.view[offset] = value & 0xFF;
        } else {
            this.view[offset] = (value >>> 24) & 0xFF;
            this.view[offset + 1] = (value >>> 16) & 0xFF;
            this.view[offset + 2] = (value >>> 8) & 0xFF;
            this.view[offset + 3] = value & 0xFF;
        }
        if(relative) this.offset += 4;
        return this;
    };
    readUint32(offset) {
        var relative = typeof offset === 'undefined';
        if(relative) offset = this.offset;
        if(!this.noAssert) {
            if(typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: " + offset + " (not an integer)");
            offset >>>= 0;
            if(offset < 0 || offset + 4 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 4 + ") <= " + this.buffer.byteLength);
        }
        var value = 0;
        if(this.littleEndian) {
            value = this.view[offset + 2] << 16;
            value |= this.view[offset + 1] << 8;
            value |= this.view[offset];
            value += this.view[offset + 3] << 24 >>> 0;
        } else {
            value = this.view[offset + 1] << 16;
            value |= this.view[offset + 2] << 8;
            value |= this.view[offset + 3];
            value += this.view[offset] << 24 >>> 0;
        }
        if(relative) this.offset += 4;
        return value;
    };
    calculateVarint32(value) {
        value = value >>> 0;
        if(value < 1 << 7) return 1;
        else if(value < 1 << 14) return 2;
        else if(value < 1 << 21) return 3;
        else if(value < 1 << 28) return 4;
        else return 5;
    };
    writeVarint32(value, offset) {
        var relative = typeof offset === 'undefined';
        if(relative) offset = this.offset;
        if(!this.noAssert) {
            if(typeof value !== 'number' || value % 1 !== 0)
                throw TypeError("Illegal value: " + value + " (not an integer)");
            value |= 0;
            if(typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: " + offset + " (not an integer)");
            offset >>>= 0;
            if(offset < 0 || offset + 0 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + this.buffer.byteLength);
        }
        var size = this.calculateVarint32(value),
            b;
        offset += size;
        var capacity10 = this.buffer.byteLength;
        if(offset > capacity10)
            this.resize((capacity10 *= 2) > offset ? capacity10 : offset);
        offset -= size;
        value >>>= 0;
        while(value >= 0x80) {
            b = (value & 0x7f) | 0x80;
            this.view[offset++] = b;
            value >>>= 7;
        }
        this.view[offset++] = value;
        if(relative) {
            this.offset = offset;
            return this;
        }
        return size;
    };
    readVarint32(offset) {
        var relative = typeof offset === 'undefined';
        if(relative) offset = this.offset;
        if(!this.noAssert) {
            if(typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: " + offset + " (not an integer)");
            offset >>>= 0;
            if(offset < 0 || offset + 1 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 1 + ") <= " + this.buffer.byteLength);
        }
        var c = 0,
            value = 0 >>> 0,
            b;
        do {
            if(!this.noAssert && offset > this.limit) {
                var err = Error("Truncated");
                err['truncated'] = true;
                throw err;
            }
            b = this.view[offset++];
            if(c < 5)
                value |= (b & 0x7f) << (7 * c);
            ++c;
        } while((b & 0x80) !== 0);
        value |= 0;
        if(relative) {
            this.offset = offset;
            return value;
        }
        return {
            "value": value,
            "length": c
        };
    };
    readUTF8String(length, metrics, offset) {
        if(typeof metrics === 'number') {
            offset = metrics;
            metrics = undefined;
        }
        var relative = typeof offset === 'undefined';
        if(relative) offset = this.offset;
        if(typeof metrics === 'undefined') metrics = "c";
        if(!this.noAssert) {
            if(typeof length !== 'number' || length % 1 !== 0)
                throw TypeError("Illegal length: " + length + " (not an integer)");
            length |= 0;
            if(typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: " + offset + " (not an integer)");
            offset >>>= 0;
            if(offset < 0 || offset + 0 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + this.buffer.byteLength);
        }
        var i = 0,
            start = offset,
            sd;
        if(metrics === "c") {
            sd = this.stringDestination();
            utfx.decodeUTF8(function() {
                return i < length && offset < this.limit ? this.view[offset++] : null;
            }.bind(this), function(cp) {
                ++i;
                utfx.UTF8toUTF16(cp, sd);
            });
            if(i !== length)
                throw RangeError("Illegal range: Truncated data, " + i + " == " + length);
            if(relative) {
                this.offset = offset;
                return sd();
            } else {
                return {
                    "string": sd(),
                    "length": offset - start
                };
            }
        } else if(metrics === "b") {
            if(!this.noAssert) {
                if(typeof offset !== 'number' || offset % 1 !== 0)
                    throw TypeError("Illegal offset: " + offset + " (not an integer)");
                offset >>>= 0;
                if(offset < 0 || offset + length > this.buffer.byteLength)
                    throw RangeError("Illegal offset: 0 <= " + offset + " (+" + length + ") <= " + this.buffer.byteLength);
            }
            var k = offset + length;
            utfx.decodeUTF8toUTF16(function() {
                return offset < k ? this.view[offset++] : null;
            }.bind(this), sd = this.stringDestination(), this.noAssert);
            if(offset !== k)
                throw RangeError("Illegal range: Truncated data, " + offset + " == " + k);
            if(relative) {
                this.offset = offset;
                return sd();
            } else {
                return {
                    'string': sd(),
                    'length': offset - start
                };
            }
        } else
            throw TypeError("Unsupported metrics: " + metrics);
    };
    writeVString(str, offset) {
        var relative = typeof offset === 'undefined';
        if(relative) offset = this.offset;
        if(!this.noAssert) {
            if(typeof str !== 'string')
                throw TypeError("Illegal str: Not a string");
            if(typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: " + offset + " (not an integer)");
            offset >>>= 0;
            if(offset < 0 || offset + 0 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + this.buffer.byteLength);
        }
        var start = offset,
            k, l;
        k = utfx.calculateUTF16asUTF8(this.stringSource(str), this.noAssert)[1];
        l = this.calculateVarint32(k);
        offset += l + k;
        var capacity15 = this.buffer.byteLength;
        if(offset > capacity15)
            this.resize((capacity15 *= 2) > offset ? capacity15 : offset);
        offset -= l + k;
        offset += this.writeVarint32(k, offset);
        utfx.encodeUTF16toUTF8(this.stringSource(str), function(b) {
            this.view[offset++] = b;
        }.bind(this));
        if(offset !== start + k + l)
            throw RangeError("Illegal range: Truncated data, " + offset + " == " + (offset + k + l));
        if(relative) {
            this.offset = offset;
            return this;
        }
        return offset - start;
    };
    readVString(offset) {
        var relative = typeof offset === 'undefined';
        if(relative) offset = this.offset;
        if(!this.noAssert) {
            if(typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: " + offset + " (not an integer)");
            offset >>>= 0;
            if(offset < 0 || offset + 1 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 1 + ") <= " + this.buffer.byteLength);
        }
        var start = offset;
        var len = this.readVarint32(offset);
        var str = this.readUTF8String(len['value'], "b", offset += len['length']);
        offset += str['length'];
        if(relative) {
            this.offset = offset;
            return str['string'];
        } else {
            return {
                'string': str['string'],
                'length': offset - start
            };
        }
    };
    append(source, encoding, offset) {
        if(typeof encoding === 'number' || typeof encoding !== 'string') {
            offset = encoding;
            encoding = undefined;
        }
        var relative = typeof offset === 'undefined';
        if(relative) offset = this.offset;
        if(!this.noAssert) {
            if(typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: " + offset + " (not an integer)");
            offset >>>= 0;
            if(offset < 0 || offset + 0 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + this.buffer.byteLength);
        }
        if(!(source instanceof ByteBuffer))
            source = ByteBuffer.wrap(source, encoding);
        var length = source.limit - source.offset;
        if(length <= 0) return this;
        offset += length;
        var capacity16 = this.buffer.byteLength;
        if(offset > capacity16)
            this.resize((capacity16 *= 2) > offset ? capacity16 : offset);
        offset -= length;
        this.view.set(source.view.subarray(source.offset, source.limit), offset);
        source.offset += length;
        if(relative) this.offset += length;
        return this;
    };
    appendTo(target, offset) {
        target.append(this, offset);
        return this;
    };
    assert(assert) {
        this.noAssert = !assert;
        return this;
    };
    capacity() {
        return this.buffer.byteLength;
    };
    clear() {
        this.offset = 0;
        this.limit = this.buffer.byteLength;
        this.markedOffset = -1;
        return this;
    };
    clone(copy) {
        var bb = new ByteBuffer(0, this.littleEndian, this.noAssert);
        if(copy) {
            bb.buffer = new ArrayBuffer(this.buffer.byteLength);
            bb.view = new Uint8Array(bb.buffer);
        } else {
            bb.buffer = this.buffer;
            bb.view = this.view;
        }
        bb.offset = this.offset;
        bb.markedOffset = this.markedOffset;
        bb.limit = this.limit;
        return bb;
    };
    compact(begin, end) {
        if(typeof begin === 'undefined') begin = this.offset;
        if(typeof end === 'undefined') end = this.limit;
        if(!this.noAssert) {
            if(typeof begin !== 'number' || begin % 1 !== 0)
                throw TypeError("Illegal begin: Not an integer");
            begin >>>= 0;
            if(typeof end !== 'number' || end % 1 !== 0)
                throw TypeError("Illegal end: Not an integer");
            end >>>= 0;
            if(begin < 0 || begin > end || end > this.buffer.byteLength)
                throw RangeError("Illegal range: 0 <= " + begin + " <= " + end + " <= " + this.buffer.byteLength);
        }
        if(begin === 0 && end === this.buffer.byteLength)
            return this;
        var len = end - begin;
        if(len === 0) {
            this.buffer = EMPTY_BUFFER;
            this.view = null;
            if(this.markedOffset >= 0) this.markedOffset -= begin;
            this.offset = 0;
            this.limit = 0;
            return this;
        }
        var buffer = new ArrayBuffer(len);
        var view = new Uint8Array(buffer);
        view.set(this.view.subarray(begin, end));
        this.buffer = buffer;
        this.view = view;
        if(this.markedOffset >= 0) this.markedOffset -= begin;
        this.offset = 0;
        this.limit = len;
        return this;
    };
    copy(begin, end) {
        if(typeof begin === 'undefined') begin = this.offset;
        if(typeof end === 'undefined') end = this.limit;
        if(!this.noAssert) {
            if(typeof begin !== 'number' || begin % 1 !== 0)
                throw TypeError("Illegal begin: Not an integer");
            begin >>>= 0;
            if(typeof end !== 'number' || end % 1 !== 0)
                throw TypeError("Illegal end: Not an integer");
            end >>>= 0;
            if(begin < 0 || begin > end || end > this.buffer.byteLength)
                throw RangeError("Illegal range: 0 <= " + begin + " <= " + end + " <= " + this.buffer.byteLength);
        }
        if(begin === end)
            return new ByteBuffer(0, this.littleEndian, this.noAssert);
        var capacity = end - begin,
            bb = new ByteBuffer(capacity, this.littleEndian, this.noAssert);
        bb.offset = 0;
        bb.limit = capacity;
        if(bb.markedOffset >= 0) bb.markedOffset -= begin;
        this.copyTo(bb, 0, begin, end);
        return bb;
    };
    copyTo(target, targetOffset, sourceOffset, sourceLimit) {
        var relative,
            targetRelative;
        if(!this.noAssert) {
            if(!ByteBuffer.isByteBuffer(target))
                throw TypeError("Illegal target: Not a ByteBuffer");
        }
        targetOffset = (targetRelative = typeof targetOffset === 'undefined') ? target.offset : targetOffset | 0;
        sourceOffset = (relative = typeof sourceOffset === 'undefined') ? this.offset : sourceOffset | 0;
        sourceLimit = typeof sourceLimit === 'undefined' ? this.limit : sourceLimit | 0;
        if(targetOffset < 0 || targetOffset > target.buffer.byteLength)
            throw RangeError("Illegal target range: 0 <= " + targetOffset + " <= " + target.buffer.byteLength);
        if(sourceOffset < 0 || sourceLimit > this.buffer.byteLength)
            throw RangeError("Illegal source range: 0 <= " + sourceOffset + " <= " + this.buffer.byteLength);
        var len = sourceLimit - sourceOffset;
        if(len === 0)
            return target;
        target.ensureCapacity(targetOffset + len);
        target.view.set(this.view.subarray(sourceOffset, sourceLimit), targetOffset);
        if(relative) this.offset += len;
        if(targetRelative) target.offset += len;
        return this;
    };
    ensureCapacity(capacity) {
        var current = this.buffer.byteLength;
        if(current < capacity)
            return this.resize((current *= 2) > capacity ? current : capacity);
        return this;
    };
    fill(value, begin, end) {
        var relative = typeof begin === 'undefined';
        if(relative) begin = this.offset;
        if(typeof value === 'string' && value.length > 0)
            value = value.charCodeAt(0);
        if(typeof begin === 'undefined') begin = this.offset;
        if(typeof end === 'undefined') end = this.limit;
        if(!this.noAssert) {
            if(typeof value !== 'number' || value % 1 !== 0)
                throw TypeError("Illegal value: " + value + " (not an integer)");
            value |= 0;
            if(typeof begin !== 'number' || begin % 1 !== 0)
                throw TypeError("Illegal begin: Not an integer");
            begin >>>= 0;
            if(typeof end !== 'number' || end % 1 !== 0)
                throw TypeError("Illegal end: Not an integer");
            end >>>= 0;
            if(begin < 0 || begin > end || end > this.buffer.byteLength)
                throw RangeError("Illegal range: 0 <= " + begin + " <= " + end + " <= " + this.buffer.byteLength);
        }
        if(begin >= end)
            return this;
        while(begin < end) this.view[begin++] = value;
        if(relative) this.offset = begin;
        return this;
    };
    flip() {
        this.limit = this.offset;
        this.offset = 0;
        return this;
    };
    mark(offset) {
        offset = typeof offset === 'undefined' ? this.offset : offset;
        if(!this.noAssert) {
            if(typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: " + offset + " (not an integer)");
            offset >>>= 0;
            if(offset < 0 || offset + 0 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + this.buffer.byteLength);
        }
        this.markedOffset = offset;
        return this;
    };
    order(littleEndian) {
        if(!this.noAssert) {
            if(typeof littleEndian !== 'boolean')
                throw TypeError("Illegal littleEndian: Not a boolean");
        }
        this.littleEndian = !!littleEndian;
        return this;
    };
    LE(littleEndian) {
        this.littleEndian = typeof littleEndian !== 'undefined' ? !!littleEndian : true;
        return this;
    };
    BE(bigEndian) {
        this.littleEndian = typeof bigEndian !== 'undefined' ? !bigEndian : false;
        return this;
    };
    prepend(source, encoding, offset) {
        if(typeof encoding === 'number' || typeof encoding !== 'string') {
            offset = encoding;
            encoding = undefined;
        }
        var relative = typeof offset === 'undefined';
        if(relative) offset = this.offset;
        if(!this.noAssert) {
            if(typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: " + offset + " (not an integer)");
            offset >>>= 0;
            if(offset < 0 || offset + 0 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + this.buffer.byteLength);
        }
        if(!(source instanceof ByteBuffer))
            source = ByteBuffer.wrap(source, encoding);
        var len = source.limit - source.offset;
        if(len <= 0) return this;
        var diff = len - offset;
        if(diff > 0) {
            var buffer = new ArrayBuffer(this.buffer.byteLength + diff);
            var view = new Uint8Array(buffer);
            view.set(this.view.subarray(offset, this.buffer.byteLength), len);
            this.buffer = buffer;
            this.view = view;
            this.offset += diff;
            if(this.markedOffset >= 0) this.markedOffset += diff;
            this.limit += diff;
            offset += diff;
        } else {
            var arrayView = new Uint8Array(this.buffer);
        }
        this.view.set(source.view.subarray(source.offset, source.limit), offset - len);
        source.offset = source.limit;
        if(relative)
            this.offset -= len;
        return this;
    };
    prependTo(target, offset) {
        target.prepend(this, offset);
        return this;
    };
    printDebug(out) {
        if(typeof out !== 'function') out = console.log.bind(console);
        out(
            this.toString() + "\n" +
            "-------------------------------------------------------------------\n" +
            this.toDebug(true)
        );
    };
    remaining() {
        return this.limit - this.offset;
    };
    reset() {
        if(this.markedOffset >= 0) {
            this.offset = this.markedOffset;
            this.markedOffset = -1;
        } else {
            this.offset = 0;
        }
        return this;
    };
    resize(capacity) {
        if(!this.noAssert) {
            if(typeof capacity !== 'number' || capacity % 1 !== 0)
                throw TypeError("Illegal capacity: " + capacity + " (not an integer)");
            capacity |= 0;
            if(capacity < 0)
                throw RangeError("Illegal capacity: 0 <= " + capacity);
        }
        if(this.buffer.byteLength < capacity) {
            var buffer = new ArrayBuffer(capacity);
            var view = new Uint8Array(buffer);
            view.set(this.view);
            this.buffer = buffer;
            this.view = view;
        }
        return this;
    };
    reverse(begin, end) {
        if(typeof begin === 'undefined') begin = this.offset;
        if(typeof end === 'undefined') end = this.limit;
        if(!this.noAssert) {
            if(typeof begin !== 'number' || begin % 1 !== 0)
                throw TypeError("Illegal begin: Not an integer");
            begin >>>= 0;
            if(typeof end !== 'number' || end % 1 !== 0)
                throw TypeError("Illegal end: Not an integer");
            end >>>= 0;
            if(begin < 0 || begin > end || end > this.buffer.byteLength)
                throw RangeError("Illegal range: 0 <= " + begin + " <= " + end + " <= " + this.buffer.byteLength);
        }
        if(begin === end)
            return this;
        Array.prototype.reverse.call(this.view.subarray(begin, end));
        return this;
    };
    skip(length) {
        if(!this.noAssert) {
            if(typeof length !== 'number' || length % 1 !== 0)
                throw TypeError("Illegal length: " + length + " (not an integer)");
            length |= 0;
        }
        var offset = this.offset + length;
        if(!this.noAssert) {
            if(offset < 0 || offset > this.buffer.byteLength)
                throw RangeError("Illegal length: 0 <= " + this.offset + " + " + length + " <= " + this.buffer.byteLength);
        }
        this.offset = offset;
        return this;
    };
    slice(begin, end) {
        if(typeof begin === 'undefined') begin = this.offset;
        if(typeof end === 'undefined') end = this.limit;
        if(!this.noAssert) {
            if(typeof begin !== 'number' || begin % 1 !== 0)
                throw TypeError("Illegal begin: Not an integer");
            begin >>>= 0;
            if(typeof end !== 'number' || end % 1 !== 0)
                throw TypeError("Illegal end: Not an integer");
            end >>>= 0;
            if(begin < 0 || begin > end || end > this.buffer.byteLength)
                throw RangeError("Illegal range: 0 <= " + begin + " <= " + end + " <= " + this.buffer.byteLength);
        }
        var bb = this.clone();
        bb.offset = begin;
        bb.limit = end;
        return bb;
    };
    toArrayBuffer(forceCopy) {
        var offset = this.offset,
            limit = this.limit;
        if(!this.noAssert) {
            if(typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: Not an integer");
            offset >>>= 0;
            if(typeof limit !== 'number' || limit % 1 !== 0)
                throw TypeError("Illegal limit: Not an integer");
            limit >>>= 0;
            if(offset < 0 || offset > limit || limit > this.buffer.byteLength)
                throw RangeError("Illegal range: 0 <= " + offset + " <= " + limit + " <= " + this.buffer.byteLength);
        }
        if(!forceCopy && offset === 0 && limit === this.buffer.byteLength)
            return this.buffer;
        if(offset === limit)
            return EMPTY_BUFFER;
        var buffer = new ArrayBuffer(limit - offset);
        new Uint8Array(buffer).set(new Uint8Array(this.buffer).subarray(offset, limit), 0);
        return buffer;
    };
    toString(encoding, begin, end) {
        if(typeof encoding === 'undefined')
            return "ByteBufferAB(offset=" + this.offset + ",markedOffset=" + this.markedOffset + ",limit=" + this.limit + ",capacity=" + this.capacity() + ")";
        if(typeof encoding === 'number')
            encoding = "utf8",
            begin = encoding,
            end = begin;
        switch(encoding) {
            case "utf8":
                return this.toUTF8(begin, end);
            case "base64":
                return this.toBase64(begin, end);
            case "hex":
                return this.toHex(begin, end);
            case "binary":
                return this.toBinary(begin, end);
            case "debug":
                return this.toDebug();
            case "columns":
                return this.toColumns();
            default:
                throw Error("Unsupported encoding: " + encoding);
        }
    };
    toBase64(begin, end) {
        if(typeof begin === 'undefined')
            begin = this.offset;
        if(typeof end === 'undefined')
            end = this.limit;
        begin = begin | 0;
        end = end | 0;
        if(begin < 0 || end > this.capacity || begin > end)
            throw RangeError("begin, end");
        var sd;
        lxiv.encode(function() {
            return begin < end ? this.view[begin++] : null;
        }.bind(this), sd = this.stringDestination());
        return sd();
    };
    fromBase64(str, littleEndian) {
        if(typeof str !== 'string')
            throw TypeError("str");
        var bb = new ByteBuffer(str.length / 4 * 3, littleEndian),
            i = 0;
        lxiv.decode(this.stringSource(str), function(b) {
            bb.view[i++] = b;
        });
        bb.limit = i;
        return bb;
    };
    btoa(str) {
        return this.fromBinary(str).toBase64();
    };
    atob(b64) {
        return this.fromBase64(b64).toBinary();
    };
    toBinary(begin, end) {
        if(typeof begin === 'undefined')
            begin = this.offset;
        if(typeof end === 'undefined')
            end = this.limit;
        begin |= 0;
        end |= 0;
        if(begin < 0 || end > this.capacity() || begin > end)
            throw RangeError("begin, end");
        if(begin === end)
            return "";
        var chars = [],
            parts = [];
        while(begin < end) {
            chars.push(this.view[begin++]);
            if(chars.length >= 1024)
                parts.push(String.fromCharCode.apply(String, chars)),
                chars = [];
        }
        return parts.join('') + String.fromCharCode.apply(String, chars);
    };
    fromBinary(str, littleEndian) {
        if(typeof str !== 'string')
            throw TypeError("str");
        var i = 0,
            k = str.length,
            charCode,
            bb = new ByteBuffer(k, littleEndian);
        while(i < k) {
            charCode = str.charCodeAt(i);
            if(charCode > 0xff)
                throw RangeError("illegal char code: " + charCode);
            bb.view[i++] = charCode;
        }
        bb.limit = k;
        return bb;
    };
    toDebug(columns) {
        var i = -1,
            k = this.buffer.byteLength,
            b,
            hex = "",
            asc = "",
            out = "";
        while(i < k) {
            if(i !== -1) {
                b = this.view[i];
                if(b < 0x10) hex += "0" + b.toString(16).toUpperCase();
                else hex += b.toString(16).toUpperCase();
                if(columns)
                    asc += b > 32 && b < 127 ? String.fromCharCode(b) : '.';
            }
            ++i;
            if(columns) {
                if(i > 0 && i % 16 === 0 && i !== k) {
                    while(hex.length < 3 * 16 + 3) hex += " ";
                    out += hex + asc + "\n";
                    hex = asc = "";
                }
            }
            if(i === this.offset && i === this.limit)
                hex += i === this.markedOffset ? "!" : "|";
            else if(i === this.offset)
                hex += i === this.markedOffset ? "[" : "<";
            else if(i === this.limit)
                hex += i === this.markedOffset ? "]" : ">";
            else
                hex += i === this.markedOffset ? "'" : (columns || (i !== 0 && i !== k) ? " " : "");
        }
        if(columns && hex !== " ") {
            while(hex.length < 3 * 16 + 3)
                hex += " ";
            out += hex + asc + "\n";
        }
        return columns ? out : hex;
    };
    fromDebug(str, littleEndian, noAssert) {
        var k = str.length,
            bb = new ByteBuffer(((k + 1) / 3) | 0, littleEndian, noAssert);
        var i = 0,
            j = 0,
            ch, b,
            rs = false,
            ho = false,
            hm = false,
            hl = false,
            fail = false;
        while(i < k) {
            switch(ch = str.charAt(i++)) {
                case '!':
                    if(!noAssert) {
                        if(ho || hm || hl) {
                            fail = true;
                            break;
                        }
                        ho = hm = hl = true;
                    }
                    bb.offset = bb.markedOffset = bb.limit = j;
                    rs = false;
                    break;
                case '|':
                    if(!noAssert) {
                        if(ho || hl) {
                            fail = true;
                            break;
                        }
                        ho = hl = true;
                    }
                    bb.offset = bb.limit = j;
                    rs = false;
                    break;
                case '[':
                    if(!noAssert) {
                        if(ho || hm) {
                            fail = true;
                            break;
                        }
                        ho = hm = true;
                    }
                    bb.offset = bb.markedOffset = j;
                    rs = false;
                    break;
                case '<':
                    if(!noAssert) {
                        if(ho) {
                            fail = true;
                            break;
                        }
                        ho = true;
                    }
                    bb.offset = j;
                    rs = false;
                    break;
                case ']':
                    if(!noAssert) {
                        if(hl || hm) {
                            fail = true;
                            break;
                        }
                        hl = hm = true;
                    }
                    bb.limit = bb.markedOffset = j;
                    rs = false;
                    break;
                case '>':
                    if(!noAssert) {
                        if(hl) {
                            fail = true;
                            break;
                        }
                        hl = true;
                    }
                    bb.limit = j;
                    rs = false;
                    break;
                case "'":
                    if(!noAssert) {
                        if(hm) {
                            fail = true;
                            break;
                        }
                        hm = true;
                    }
                    bb.markedOffset = j;
                    rs = false;
                    break;
                case ' ':
                    rs = false;
                    break;
                default:
                    if(!noAssert) {
                        if(rs) {
                            fail = true;
                            break;
                        }
                    }
                    b = parseInt(ch + str.charAt(i++), 16);
                    if(!noAssert) {
                        if(isNaN(b) || b < 0 || b > 255)
                            throw TypeError("Illegal str: Not a debug encoded string");
                    }
                    bb.view[j++] = b;
                    rs = true;
            }
            if(fail)
                throw TypeError("Illegal str: Invalid symbol at " + i);
        }
        if(!noAssert) {
            if(!ho || !hl)
                throw TypeError("Illegal str: Missing offset or limit");
            if(j < bb.buffer.byteLength)
                throw TypeError("Illegal str: Not a debug encoded string (is it hex?) " + j + " < " + k);
        }
        return bb;
    };
    toHex(begin, end) {
        begin = typeof begin === 'undefined' ? this.offset : begin;
        end = typeof end === 'undefined' ? this.limit : end;
        if(!this.noAssert) {
            if(typeof begin !== 'number' || begin % 1 !== 0)
                throw TypeError("Illegal begin: Not an integer");
            begin >>>= 0;
            if(typeof end !== 'number' || end % 1 !== 0)
                throw TypeError("Illegal end: Not an integer");
            end >>>= 0;
            if(begin < 0 || begin > end || end > this.buffer.byteLength)
                throw RangeError("Illegal range: 0 <= " + begin + " <= " + end + " <= " + this.buffer.byteLength);
        }
        var out = new Array(end - begin),
            b;
        while(begin < end) {
            b = this.view[begin++];
            if(b < 0x10)
                out.push("0", b.toString(16));
            else out.push(b.toString(16));
        }
        return out.join('');
    };
    fromHex(str, littleEndian, noAssert) {
        if(!noAssert) {
            if(typeof str !== 'string')
                throw TypeError("Illegal str: Not a string");
            if(str.length % 2 !== 0)
                throw TypeError("Illegal str: Length not a multiple of 2");
        }
        var k = str.length,
            bb = new ByteBuffer((k / 2) | 0, littleEndian),
            b;
        for(var i = 0, j = 0; i < k; i += 2) {
            b = parseInt(str.substring(i, i + 2), 16);
            if(!noAssert)
                if(!isFinite(b) || b < 0 || b > 255)
                    throw TypeError("Illegal str: Contains non-hex characters");
            bb.view[j++] = b;
        }
        bb.limit = j;
        return bb;
    };
    toUTF8(begin, end) {
        if(typeof begin === 'undefined') begin = this.offset;
        if(typeof end === 'undefined') end = this.limit;
        if(!this.noAssert) {
            if(typeof begin !== 'number' || begin % 1 !== 0)
                throw TypeError("Illegal begin: Not an integer");
            begin >>>= 0;
            if(typeof end !== 'number' || end % 1 !== 0)
                throw TypeError("Illegal end: Not an integer");
            end >>>= 0;
            if(begin < 0 || begin > end || end > this.buffer.byteLength)
                throw RangeError("Illegal range: 0 <= " + begin + " <= " + end + " <= " + this.buffer.byteLength);
        }
        var sd;
        try {
            utfx.decodeUTF8toUTF16(function() {
                return begin < end ? this.view[begin++] : null;
            }.bind(this), sd = this.stringDestination());
        } catch (e) {
            if(begin !== end)
                throw RangeError("Illegal range: Truncated data, " + begin + " != " + end);
        }
        return sd();
    };
    fromUTF8(str, littleEndian, noAssert) {
        if(!noAssert)
            if(typeof str !== 'string')
                throw TypeError("Illegal str: Not a string");
        var bb = new ByteBuffer(utfx.calculateUTF16asUTF8(this.stringSource(str), true)[1], littleEndian, noAssert),
            i = 0;
        utfx.encodeUTF16toUTF8(this.stringSource(str), function(b) {
            bb.view[i++] = b;
        });
        bb.limit = i;
        return bb;
    };
}
ByteBuffer.VERSION = "5.0.1";
ByteBuffer.LITTLE_ENDIAN = true;
ByteBuffer.BIG_ENDIAN = false;
ByteBuffer.DEFAULT_CAPACITY = 16;
ByteBuffer.DEFAULT_ENDIAN = ByteBuffer.BIG_ENDIAN;
ByteBuffer.DEFAULT_NOASSERT = false;
ByteBuffer.Long = null;
ByteBuffer.accessor = function() {
    return Uint8Array;
};
ByteBuffer.allocate = function(capacity, littleEndian, noAssert) {
    return new ByteBuffer(capacity, littleEndian, noAssert);
};
ByteBuffer.concat = function(buffers, encoding, littleEndian, noAssert) {
    if(typeof encoding === 'boolean' || typeof encoding !== 'string') {
        noAssert = littleEndian;
        littleEndian = encoding;
        encoding = undefined;
    }
    var capacity = 0;
    for(var i = 0, k = buffers.length, length; i < k; ++i) {
        if(!ByteBuffer.isByteBuffer(buffers[i]))
            buffers[i] = ByteBuffer.wrap(buffers[i], encoding);
        length = buffers[i].limit - buffers[i].offset;
        if(length > 0) capacity += length;
    }
    if(capacity === 0)
        return new ByteBuffer(0, littleEndian, noAssert);
    var bb = new ByteBuffer(capacity, littleEndian, noAssert),
        bi;
    i = 0;
    while(i < k) {
        bi = buffers[i++];
        length = bi.limit - bi.offset;
        if(length <= 0) continue;
        bb.view.set(bi.view.subarray(bi.offset, bi.limit), bb.offset);
        bb.offset += length;
    }
    bb.limit = bb.offset;
    bb.offset = 0;
    return bb;
};
ByteBuffer.isByteBuffer = function(bb) {
    return (bb && bb["__isByteBuffer__"]) === true;
};
ByteBuffer.type = function() {
    return ArrayBuffer;
};
ByteBuffer.wrap = function(buffer, encoding, littleEndian, noAssert) {
    if(typeof encoding !== 'string') {
        noAssert = littleEndian;
        littleEndian = encoding;
        encoding = undefined;
    }
    if(typeof buffer === 'string') {
        if(typeof encoding === 'undefined')
            encoding = "utf8";
        switch(encoding) {
            case "base64":
                return ByteBuffer.fromBase64(buffer, littleEndian);
            case "hex":
                return ByteBuffer.fromHex(buffer, littleEndian);
            case "binary":
                return ByteBuffer.fromBinary(buffer, littleEndian);
            case "utf8":
                return ByteBuffer.fromUTF8(buffer, littleEndian);
            case "debug":
                return ByteBuffer.fromDebug(buffer, littleEndian);
            default:
                throw Error("Unsupported encoding: " + encoding);
        }
    }
    if(buffer === null || typeof buffer !== 'object')
        throw TypeError("Illegal buffer");
    var bb;
    if(ByteBuffer.isByteBuffer(buffer)) {
        bb = ByteBufferPrototype.clone.call(buffer);
        bb.markedOffset = -1;
        return bb;
    }
    if(buffer instanceof Uint8Array) {
        bb = new ByteBuffer(0, littleEndian, noAssert);
        if(buffer.length > 0) {
            bb.buffer = buffer.buffer;
            bb.offset = buffer.byteOffset;
            bb.limit = buffer.byteOffset + buffer.byteLength;
            bb.view = new Uint8Array(buffer.buffer);
        }
    } else if(buffer instanceof ArrayBuffer) {
        bb = new ByteBuffer(0, littleEndian, noAssert);
        if(buffer.byteLength > 0) {
            bb.buffer = buffer;
            bb.offset = 0;
            bb.limit = buffer.byteLength;
            bb.view = buffer.byteLength > 0 ? new Uint8Array(buffer) : null;
        }
    } else if(Object.prototype.toString.call(buffer) === "[object Array]") {
        bb = new ByteBuffer(buffer.length, littleEndian, noAssert);
        bb.limit = buffer.length;
        for(var i = 0; i < buffer.length; ++i)
            bb.view[i] = buffer[i];
    } else
        throw TypeError("Illegal buffer");
    return bb;
};

window.ByteBuffer = ByteBuffer;
