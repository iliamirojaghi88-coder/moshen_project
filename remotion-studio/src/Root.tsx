import React from "react";
import { Composition, continueRender, delayRender } from "remotion";
import { StackTest } from "./compositions/StackTest";
import { ClipSheet } from "./sleep/ClipSheet";
import { HeadProbe } from "./sleep/HeadProbe";
import { FILM_FRAMES, SleepFilm } from "./sleep/Film";
import { fontsReady } from "./lib/fonts";

const fontHandle = delayRender("Loading Vazirmatn");
fontsReady.then(() => continueRender(fontHandle));

// House default: 1080×1920 @ 30 fps (see render-profiles.json at repo root).
export const RemotionRoot: React.FC = () => {
  return (
    <>
    <Composition
      id="SleepFilm"
      component={SleepFilm}
      durationInFrames={FILM_FRAMES}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ withAudio: true }}
    />
    <Composition
      id="FilmProbe"
      component={SleepFilm}
      durationInFrames={60}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ withAudio: false, at: [0] as number[] }}
    />
    <Composition
      id="ClipSheet"
      component={ClipSheet}
      durationInFrames={1}
      fps={30}
      width={1080}
      height={1080}
      defaultProps={{ clip: "m_sit_chair_idle_yawn" as const, t0: 0, t1: 7.6 }}
    />
    <Composition id="HeadProbe" component={HeadProbe} durationInFrames={1} fps={30} width={200} height={200} defaultProps={{ poses: [] as never[] }} />
    <Composition
      id="StackTest"
      component={StackTest}
      durationInFrames={90}
      fps={30}
      width={1080}
      height={1920}
    />
    </>
  );
};
