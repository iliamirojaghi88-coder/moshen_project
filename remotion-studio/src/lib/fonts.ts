import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Vazirmatn ships as separate Arabic-script and Latin subsets; unicode-range
// lets the browser pick per glyph, so mixed fa/en lines render in one family.
const ARABIC =
  "U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0898-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC";
const LATIN =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";

export const FONT_FA = "Vazirmatn";

export const fontsReady = Promise.all(
  (["400", "900"] as const).flatMap((weight) =>
    (
      [
        ["arabic", ARABIC],
        ["latin", LATIN],
      ] as const
    ).map(([subset, unicodeRange]) =>
      loadFont({
        family: FONT_FA,
        url: staticFile(`fonts/vazirmatn-${subset}-${weight}-normal.woff2`),
        weight,
        unicodeRange,
      }),
    ),
  ),
);
