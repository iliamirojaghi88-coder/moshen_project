import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT_FA } from "../lib/fonts";

type Props = {
  /** Words in reading order; the word at `highlight` gets the accent block. */
  words: string[];
  highlight?: number;
  accent?: string;
  color?: string;
  fontSize?: number;
};

// Ref-1 caption grammar: heavy Persian sans, centred, scale-pop on entry,
// one keyword sitting on a solid accent block.
export const PersianCaption: React.FC<Props> = ({
  words,
  highlight,
  accent = "#b3121f",
  color = "#ffffff",
  fontSize = 92,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 220 } });
  const scale = interpolate(pop, [0, 1], [1.1, 1]);
  const opacity = interpolate(frame, [0, 4], [0, 1], { extrapolateRight: "clamp" });

  return (
    <div
      dir="rtl"
      style={{
        fontFamily: FONT_FA,
        fontWeight: 900,
        fontSize,
        lineHeight: 1.35,
        color,
        textAlign: "center",
        transform: `scale(${scale})`,
        opacity,
        textShadow: "0 6px 24px rgba(0,0,0,0.45)",
      }}
    >
      {words.map((w, i) => (
        <React.Fragment key={i}>
          <span
            style={
              i === highlight
                ? { background: accent, padding: "0 0.18em", borderRadius: 6 }
                : undefined
            }
          >
            {w}
          </span>
          {i < words.length - 1 ? " " : null}
        </React.Fragment>
      ))}
    </div>
  );
};
