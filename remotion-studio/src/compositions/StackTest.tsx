import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { PersianCaption } from "../components/PersianCaption";
import { StudioObject } from "../components/StudioObject";

// Smoke test for the whole stack: R3F 3D, Persian RTL caption with keyword
// highlight, vertical 1080×1920 canvas.
export const StackTest: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 40%, #f4f7f7, #d9e4e4)" }}>
      <StudioObject />
      <Sequence from={6} layout="none">
        <AbsoluteFill style={{ justifyContent: "flex-end", paddingBottom: 360 }}>
          <PersianCaption words={["بهداشت", "دهانی", "الزامیه"]} highlight={1} color="#2a0b0d" />
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
