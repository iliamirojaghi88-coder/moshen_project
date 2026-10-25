"""WOFF 1.0 -> sfnt (TTF/OTF): inflate each table and rewrite the directory."""
import struct, sys, zlib

src, dst = sys.argv[1], sys.argv[2]
d = open(src, "rb").read()
sig, flavor, length, num, _, total_sfnt = struct.unpack(">4sIIHHI", d[:20])
assert sig == b"wOFF"
tables = []
for i in range(num):
    tag, off, clen, olen, csum = struct.unpack(">4sIIII", d[44 + 20 * i:64 + 20 * i])
    data = d[off:off + clen]
    if clen < olen:
        data = zlib.decompress(data)
    tables.append((tag, csum, data))
tables.sort(key=lambda t: t[0])
es = max(k for k in range(16) if 2 ** k <= num)
head = struct.pack(">IHHHH", flavor, num, 16 * 2 ** es, es, num * 16 - 16 * 2 ** es)
offset = 12 + 16 * num
dirs, body = b"", b""
for tag, csum, data in tables:
    dirs += struct.pack(">4sIII", tag, csum, offset + len(body), len(data))
    body += data + b"\0" * ((4 - len(data) % 4) % 4)
open(dst, "wb").write(head + dirs + body)
print(dst)
