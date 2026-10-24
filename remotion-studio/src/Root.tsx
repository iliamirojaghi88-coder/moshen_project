import React from "react";
import { Composition, continueRender, delayRender } from "remotion";
import { StackTest } from "./compositions/StackTest";
import { fontsReady } from "./lib/fonts";

const fontHandle = delayRender("Loading Vazirmatn");
fontsReady.then(() => continueRender(fontHandle));

// House default: 1080×1920 @ 30 fps (see render-profiles.json at repo root).
export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="StackTest"
      component={StackTest}
      durationInFrames={90}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
