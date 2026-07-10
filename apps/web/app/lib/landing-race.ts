export type RaceSeconds = { vinext: number; nextjs: number };

export type RaceFrame = {
  durationMs: number;
  vinextTime: number;
  nextjsTime: number;
  vinextFill: number;
  nextjsFill: number;
  vinextDone: boolean;
  nextjsDone: boolean;
};

export function getRaceFrame(race: RaceSeconds, progress: number): RaceFrame {
  const longest = Math.max(race.vinext, race.nextjs);
  const simTime = Math.min(1, Math.max(0, progress)) * longest;
  const vinextTime = Math.min(race.vinext, simTime);
  const nextjsTime = Math.min(race.nextjs, simTime);

  return {
    durationMs: Math.min(longest, 5) * 1000,
    vinextTime,
    nextjsTime,
    vinextFill: vinextTime / longest,
    nextjsFill: nextjsTime / longest,
    vinextDone: simTime >= race.vinext,
    nextjsDone: simTime >= race.nextjs,
  };
}
