"""Minimal Persian shaper: contextual presentation forms + visual (LTR) order.

Blender's text engine neither joins Arabic-script letters nor lays out RTL, so
words for 3D extrusion are pre-shaped here into Presentation Forms A/B.
"""
F = {  # isolated, final, initial, medial
    "ا": (0xFE8D, 0xFE8E), "آ": (0xFE81, 0xFE82), "د": (0xFEA9, 0xFEAA), "ذ": (0xFEAB, 0xFEAC),
    "ر": (0xFEAD, 0xFEAE), "ز": (0xFEAF, 0xFEB0), "ژ": (0xFB8A, 0xFB8B), "و": (0xFEED, 0xFEEE),
    "ب": (0xFE8F, 0xFE90, 0xFE91, 0xFE92), "پ": (0xFB56, 0xFB57, 0xFB58, 0xFB59),
    "ت": (0xFE95, 0xFE96, 0xFE97, 0xFE98), "ث": (0xFE99, 0xFE9A, 0xFE9B, 0xFE9C),
    "ج": (0xFE9D, 0xFE9E, 0xFE9F, 0xFEA0), "چ": (0xFB7A, 0xFB7B, 0xFB7C, 0xFB7D),
    "ح": (0xFEA1, 0xFEA2, 0xFEA3, 0xFEA4), "خ": (0xFEA5, 0xFEA6, 0xFEA7, 0xFEA8),
    "س": (0xFEB1, 0xFEB2, 0xFEB3, 0xFEB4), "ش": (0xFEB5, 0xFEB6, 0xFEB7, 0xFEB8),
    "ص": (0xFEB9, 0xFEBA, 0xFEBB, 0xFEBC), "ض": (0xFEBD, 0xFEBE, 0xFEBF, 0xFEC0),
    "ط": (0xFEC1, 0xFEC2, 0xFEC3, 0xFEC4), "ظ": (0xFEC5, 0xFEC6, 0xFEC7, 0xFEC8),
    "ع": (0xFEC9, 0xFECA, 0xFECB, 0xFECC), "غ": (0xFECD, 0xFECE, 0xFECF, 0xFED0),
    "ف": (0xFED1, 0xFED2, 0xFED3, 0xFED4), "ق": (0xFED5, 0xFED6, 0xFED7, 0xFED8),
    "ک": (0xFB8E, 0xFB8F, 0xFB90, 0xFB91), "گ": (0xFB92, 0xFB93, 0xFB94, 0xFB95),
    "ل": (0xFEDD, 0xFEDE, 0xFEDF, 0xFEE0), "م": (0xFEE1, 0xFEE2, 0xFEE3, 0xFEE4),
    "ن": (0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8), "ه": (0xFEE9, 0xFEEA, 0xFEEB, 0xFEEC),
    "ی": (0xFBFC, 0xFBFD, 0xFBFE, 0xFBFF),
}
LAM_ALEF = (0xFEFB, 0xFEFC)


def dual(c):
    return c in F and len(F[c]) == 4


def joins(c):
    return c in F


def shape(text):
    out, i = [], 0
    chars = list(text)
    while i < len(chars):
        c = chars[i]
        prev = chars[i - 1] if i > 0 else None
        prev_j = prev is not None and dual(prev) and joins(c)
        if c == "ل" and i + 1 < len(chars) and chars[i + 1] == "ا":
            out.append(chr(LAM_ALEF[1 if prev_j else 0]))
            i += 2
            continue
        nxt = chars[i + 1] if i + 1 < len(chars) else None
        next_j = dual(c) and nxt is not None and joins(nxt)
        if c in F:
            f = F[c]
            if len(f) == 2:
                out.append(chr(f[1] if prev_j else f[0]))
            else:
                out.append(chr(f[3] if prev_j and next_j else f[2] if next_j else f[1] if prev_j else f[0]))
        elif c != "‌":
            out.append(c)
        i += 1
    return "".join(reversed(out))
