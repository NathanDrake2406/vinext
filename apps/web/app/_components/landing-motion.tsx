"use client";

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { getRaceFrame, type RaceFrame, type RaceSeconds } from "../lib/landing-race";

type RootRef = RefObject<HTMLDivElement | null>;
type CopyStatus = "copied" | "error";
type LandingElementName =
  | "conn"
  | "deployGrid"
  | "dcell"
  | "globe"
  | "hero"
  | "heroBg"
  | "heroBottom"
  | "heroTop"
  | "l1"
  | "l2"
  | "mq"
  | "nextFill"
  | "nextjsDone"
  | "nextLabel"
  | "nextTime"
  | "payoff"
  | "plate"
  | "plateGhost"
  | "plateSub"
  | "raceOuter"
  | "ready"
  | "scrollHint"
  | "swapOuter"
  | "vinextDone"
  | "vinextFill"
  | "vinextTime"
  | "viteLabel";

function findElement<T extends HTMLElement = HTMLElement>(
  root: HTMLElement,
  name: LandingElementName,
): T | null {
  return root.querySelector<T>(`[data-el="${name}"]`);
}

function findElements<T extends HTMLElement = HTMLElement>(
  root: HTMLElement,
  name: LandingElementName,
): T[] {
  return [...root.querySelectorAll<T>(`[data-el="${name}"]`)];
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clamp(value: number) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smooth(value: number) {
  const clamped = clamp(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function reveal(element: HTMLElement) {
  element.style.opacity = "1";
  element.style.transform = "none";
}

function applyRaceFrame(root: HTMLElement, frame: RaceFrame, race: RaceSeconds) {
  const vinextFill = findElement(root, "vinextFill");
  const nextFill = findElement(root, "nextFill");
  const vinextTime = findElement(root, "vinextTime");
  const nextTime = findElement(root, "nextTime");
  const vinextDone = findElement(root, "vinextDone");
  const nextjsDone = findElement(root, "nextjsDone");

  if (vinextFill) vinextFill.style.transform = `scaleX(${frame.vinextFill.toFixed(4)})`;
  if (nextFill) nextFill.style.transform = `scaleX(${frame.nextjsFill.toFixed(4)})`;
  if (vinextTime) vinextTime.textContent = `${frame.vinextTime.toFixed(1)}s`;
  if (nextTime) nextTime.textContent = `${frame.nextjsTime.toFixed(1)}s`;
  if (vinextDone) {
    vinextDone.style.opacity = frame.vinextDone && race.vinext < race.nextjs ? "1" : "0";
  }
  if (nextjsDone) {
    nextjsDone.style.opacity = frame.nextjsDone && race.nextjs < race.vinext ? "1" : "0";
  }
}

function useMotionFoundation() {
  useLayoutEffect(() => {
    if (prefersReducedMotion()) return;
    document.documentElement.classList.add("motion-ready");
    return () => document.documentElement.classList.remove("motion-ready");
  }, []);
}

function useIntroAndRevealMotion(rootRef: RootRef) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const intro = [...root.querySelectorAll<HTMLElement>("[data-intro]")];
    const reveals = [...root.querySelectorAll<HTMLElement>("[data-rv]")];
    const ready = findElement(root, "ready");
    if (prefersReducedMotion()) {
      intro.forEach(reveal);
      reveals.forEach(reveal);
      if (ready) ready.style.opacity = "1";
      return;
    }

    let innerFrame = 0;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => intro.forEach(reveal));
    });
    const readyTimer = window.setTimeout(() => {
      if (ready) ready.style.opacity = "1";
    }, 1100);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) continue;
          reveal(entry.target);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    for (const element of reveals) {
      if (element.getBoundingClientRect().top < window.innerHeight * 0.92) reveal(element);
      else observer.observe(element);
    }

    return () => {
      cancelAnimationFrame(outerFrame);
      cancelAnimationFrame(innerFrame);
      clearTimeout(readyTimer);
      observer.disconnect();
    };
  }, [rootRef]);
}

function useHeroMotion(rootRef: RootRef) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const heroBg = findElement(root, "heroBg");
    if (prefersReducedMotion()) {
      if (heroBg) heroBg.style.opacity = "0";
      return;
    }

    const hero = findElement(root, "hero");
    const lineOne = findElement(root, "l1");
    const lineTwo = findElement(root, "l2");
    const heroTop = findElement(root, "heroTop");
    const heroBottom = findElement(root, "heroBottom");
    const scrollHint = findElement(root, "scrollHint");
    const marquee = findElement(root, "mq");
    const globe = findElement(root, "globe");
    const deployGrid = findElement(root, "deployGrid");
    if (heroBg) heroBg.style.opacity = "1";

    let frame: number | null = null;
    let lastNow = 0;
    let scrollY = window.scrollY;
    let previousScrollY = scrollY;
    let dead = false;

    const loop = (now: number) => {
      if (dead || document.hidden) {
        frame = null;
        return;
      }

      let delta = now - (lastNow || now);
      lastNow = now;
      if (delta <= 0 || delta > 100) delta = 16.7;
      const target = window.scrollY;
      scrollY += (target - scrollY) * (1 - Math.pow(0.86, delta / 16.7));
      if (Math.abs(target - scrollY) < 0.05) scrollY = target;
      const velocity = (scrollY - previousScrollY) * (16.7 / delta);
      previousScrollY = scrollY;
      const viewportHeight = window.innerHeight;

      let heroProgress = 0;
      if (hero) {
        heroProgress = clamp(scrollY / Math.max(1, hero.offsetHeight - viewportHeight));
        const eased = smooth(heroProgress);
        const distance = eased * window.innerWidth * 0.55;
        const opacity = String(Math.max(0, 1 - eased * eased * 1.15));
        const scale = `scale(${(1 - eased * 0.08).toFixed(4)})`;
        if (lineOne) {
          lineOne.style.transform = `translate3d(${-distance}px,0,0) ${scale}`;
          lineOne.style.opacity = opacity;
        }
        if (lineTwo) {
          lineTwo.style.transform = `translate3d(${distance}px,0,0) ${scale}`;
          lineTwo.style.opacity = opacity;
        }
        const fade = clamp(heroProgress * 1.6);
        const fadeOpacity = String(1 - fade);
        if (heroTop) {
          heroTop.style.opacity = fadeOpacity;
          heroTop.style.transform = `translate3d(0,${-fade * 70}px,0)`;
        }
        if (heroBottom) {
          heroBottom.style.opacity = fadeOpacity;
          heroBottom.style.transform = `translate3d(0,${fade * 70}px,0)`;
        }
        if (scrollHint) scrollHint.style.opacity = String(1 - clamp(heroProgress * 4));
      }

      if (marquee) {
        const relativeTop = marquee.getBoundingClientRect().top - viewportHeight;
        const skew = Math.max(-5, Math.min(5, velocity * 0.08));
        marquee.style.transform = `translate3d(${relativeTop * 0.42}px,0,0) skewX(${skew}deg)`;
      }
      if (globe && deployGrid) {
        const rect = deployGrid.getBoundingClientRect();
        const progress = clamp((viewportHeight - rect.top) / (viewportHeight + rect.height));
        globe.style.transform = `translate3d(0,${((0.5 - progress) * 70).toFixed(1)}px,0)`;
      }
      if (heroBg) {
        const progress = clamp(heroProgress * 1.15);
        heroBg.style.opacity = String(1 - progress * progress * (3 - 2 * progress));
      }

      if (Math.abs(target - scrollY) > 0.05 || Math.abs(velocity) > 0.01) {
        frame = requestAnimationFrame(loop);
      } else {
        frame = null;
      }
    };

    const wake = () => {
      if (dead || document.hidden || frame !== null) return;
      lastNow = performance.now();
      frame = requestAnimationFrame(loop);
    };
    const onVisibilityChange = () => {
      if (document.hidden && frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      } else {
        wake();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", wake, { passive: true });
    wake();
    return () => {
      dead = true;
      if (frame !== null) cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", wake);
    };
  }, [rootRef]);
}

function useEngineSwapMotion(rootRef: RootRef) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const outer = findElement(root, "swapOuter");
    const nextLabel = findElement(root, "nextLabel");
    const viteLabel = findElement(root, "viteLabel");
    const plate = findElement(root, "plate");
    const plateGhost = findElement(root, "plateGhost");
    const plateSub = findElement(root, "plateSub");
    const connector = findElement(root, "conn");

    const applySwap = (progress: number) => {
      if (nextLabel) nextLabel.style.opacity = String(1 - Math.min(1, progress * 1.25));
      if (viteLabel) {
        viteLabel.style.opacity = String(Math.max(0, (progress - 0.15) / 0.85));
        viteLabel.style.transform = `translateY(${(1 - progress) * 44}px)`;
      }
      if (plateSub) {
        const swapped = progress > 0.5;
        plateSub.textContent = swapped ? "vite + @vitejs/plugin-rsc" : "next build · next.js 16";
        plateSub.style.color = swapped ? "var(--orange-soft)" : "var(--mute)";
      }
      if (connector) connector.style.opacity = String(0.3 + progress * 0.7);
    };
    const finish = () => {
      if (viteLabel) reveal(viteLabel);
      if (nextLabel) nextLabel.style.opacity = "0";
      plate?.classList.add("is-swapped");
      if (plateSub) {
        plateSub.textContent = "vite + @vitejs/plugin-rsc";
        plateSub.style.color = "var(--orange-soft)";
      }
      if (plateGhost) plateGhost.textContent = "Vite";
      if (connector) connector.style.opacity = "1";
    };
    if (prefersReducedMotion()) {
      finish();
      return;
    }

    plate?.classList.remove("is-swapped");
    if (plateGhost) plateGhost.textContent = "Turbopack";
    if (nextLabel) nextLabel.style.opacity = "1";
    if (viteLabel) {
      viteLabel.style.opacity = "0";
      viteLabel.style.transform = "translateY(44px)";
    }
    if (plateSub) {
      plateSub.textContent = "next build · next.js 16";
      plateSub.style.color = "var(--mute)";
    }
    if (connector) connector.style.opacity = ".3";

    let animationFrame: number | null = null;
    let widthTimer: number | null = null;
    let started = false;
    let dead = false;
    const contractPlate = () => {
      if (!plate || !plateGhost) return;
      const initialWidth = plate.offsetWidth;
      plateGhost.textContent = "Vite";
      const finalWidth = plate.offsetWidth;
      if (finalWidth === initialWidth) return;
      plate.style.width = `${initialWidth}px`;
      void plate.offsetWidth;
      plate.style.transition = "width .6s var(--ease-out)";
      plate.style.width = `${finalWidth}px`;
      widthTimer = window.setTimeout(() => {
        plate.style.width = "";
        plate.style.transition = "";
      }, 700);
    };
    const run = () => {
      if (started) return;
      started = true;
      plate?.classList.add("is-swapped");
      const start = performance.now();
      const step = (now: number) => {
        if (dead) return;
        const time = Math.min(1, (now - start) / 1100);
        applySwap(smooth(time));
        if (time < 1) animationFrame = requestAnimationFrame(step);
        else contractPlate();
      };
      animationFrame = requestAnimationFrame(step);
    };
    const check = () => {
      if (outer && outer.getBoundingClientRect().top < -window.innerHeight * 0.075) run();
    };

    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    check();
    return () => {
      dead = true;
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      if (widthTimer !== null) clearTimeout(widthTimer);
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [rootRef]);
}

function useRaceMotion(rootRef: RootRef, race: RaceSeconds) {
  const vinextSeconds = race.vinext;
  const nextjsSeconds = race.nextjs;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const raceOuter = findElement(root, "raceOuter");
    const payoff = findElement(root, "payoff");
    const values = { vinext: vinextSeconds, nextjs: nextjsSeconds };
    if (prefersReducedMotion()) {
      applyRaceFrame(root, getRaceFrame(values, 1), values);
      if (payoff) reveal(payoff);
      return;
    }

    applyRaceFrame(root, getRaceFrame(values, 0), values);
    if (payoff) {
      payoff.style.opacity = "0";
      payoff.style.transform = "translateY(16px)";
    }

    let frame: number | null = null;
    let started = false;
    let dead = false;
    const run = () => {
      if (started) return;
      started = true;
      const start = performance.now();
      const duration = getRaceFrame(values, 0).durationMs;
      const step = (now: number) => {
        if (dead) return;
        const time = Math.min(1, (now - start) / duration);
        applyRaceFrame(root, getRaceFrame(values, time), values);
        if (time < 1) frame = requestAnimationFrame(step);
        else if (payoff) reveal(payoff);
      };
      frame = requestAnimationFrame(step);
    };
    if (!raceOuter) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          run();
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -45% 0px" },
    );
    observer.observe(raceOuter);
    if (raceOuter.getBoundingClientRect().top < window.innerHeight * 0.55) run();

    return () => {
      dead = true;
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [nextjsSeconds, rootRef, vinextSeconds]);
}

function illuminateDeploy(root: HTMLElement, instant: boolean) {
  const timers: number[] = [];
  root.querySelectorAll<HTMLElement>("[data-gpin]").forEach(reveal);
  findElements(root, "dcell").forEach((cell, index) => {
    const illuminate = () => {
      const name = cell.querySelector<HTMLElement>("[data-name]");
      const tag = cell.querySelector<HTMLElement>("[data-tag]");
      if (name) name.style.color = "var(--ink)";
      if (tag) tag.style.color = index === 0 ? "var(--orange-soft)" : "var(--ink-sub)";
    };
    if (instant) illuminate();
    else timers.push(window.setTimeout(illuminate, index * 110));
  });
  return () => timers.forEach(clearTimeout);
}

function useDeployMotion(rootRef: RootRef) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const deployGrid = findElement(root, "deployGrid");
    const globe = findElement(root, "globe");
    if (prefersReducedMotion()) {
      illuminateDeploy(root, true);
      globe?.classList.add("tether-done");
      return;
    }
    if (!deployGrid) return;

    let stopTimers = () => {};
    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      stopTimers = illuminateDeploy(root, false);
      globe?.classList.add("tether-run");
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          run();
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -20% 0px" },
    );
    observer.observe(deployGrid);
    if (deployGrid.getBoundingClientRect().top < window.innerHeight * 0.8) run();

    return () => {
      observer.disconnect();
      stopTimers();
    };
  }, [rootRef]);
}

function useCopyCommand(rootRef: RootRef) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let resetTimer: number | null = null;
    const setStatus = (
      button: HTMLButtonElement,
      message: string,
      state: CopyStatus,
      label: string,
    ) => {
      if (resetTimer !== null) clearTimeout(resetTimer);
      button.textContent = message;
      button.setAttribute("data-copy-state", state);
      button.setAttribute("aria-label", label);
      resetTimer = window.setTimeout(() => {
        button.textContent = "copy";
        button.removeAttribute("data-copy-state");
        button.setAttribute("aria-label", "Copy command");
      }, 1500);
    };
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest("[data-copy]");
      if (!(button instanceof HTMLButtonElement) || !root.contains(button)) return;
      const text = button.dataset.copy;
      if (!text) return;

      if (!navigator.clipboard?.writeText) {
        setStatus(button, "press ⌘C", "error", "Copy command failed");
        return;
      }
      Promise.race([
        navigator.clipboard.writeText(text),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Clipboard write timed out")), 800);
        }),
      ]).then(
        () => setStatus(button, "✓ copied", "copied", "Command copied"),
        () => setStatus(button, "press ⌘C", "error", "Copy command failed"),
      );
    };

    root.addEventListener("click", onClick);
    return () => {
      root.removeEventListener("click", onClick);
      if (resetTimer !== null) clearTimeout(resetTimer);
    };
  }, [rootRef]);
}

type LandingMotionProps = {
  children: ReactNode;
  race: RaceSeconds;
  style: CSSProperties;
};

export function LandingMotion({ children, race, style }: LandingMotionProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  useMotionFoundation();
  useIntroAndRevealMotion(rootRef);
  useHeroMotion(rootRef);
  useEngineSwapMotion(rootRef);
  useRaceMotion(rootRef, race);
  useDeployMotion(rootRef);
  useCopyCommand(rootRef);

  return (
    <div ref={rootRef} id="app" className="landing-root" style={style}>
      {children}
    </div>
  );
}
