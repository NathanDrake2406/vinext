"use client";

import { useEffect } from "react";

type Accent = { r: number; g: number; b: number };
type CopyStatus = "copied" | "error";

export type RaceSeconds = { vinext: number; nextjs: number };

type RaceFrame = {
  durationMs: number;
  vinextTime: number;
  nextjsTime: number;
  vinextFill: number;
  nextjsFill: number;
  vinextDone: boolean;
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
  };
}

class Landing {
  readonly props = { accent: "#f6821f", motion: true };
  /** Median production-build times driving the benchmark race; the server
      page passes measured values, these are only the pre-hydration default. */
  race: RaceSeconds = { vinext: 3.1, nextjs: 6.2 };
  root: HTMLElement | null = null;
  reduce = false;
  hero: HTMLElement | null = null;
  heroBg: HTMLElement | null = null;
  l1: HTMLElement | null = null;
  l2: HTMLElement | null = null;
  heroTop: HTMLElement | null = null;
  heroBottom: HTMLElement | null = null;
  scrollHint: HTMLElement | null = null;
  ready: HTMLElement | null = null;
  mq: HTMLElement | null = null;
  swapOuter: HTMLElement | null = null;
  nextLabel: HTMLElement | null = null;
  viteLabel: HTMLElement | null = null;
  plate: HTMLElement | null = null;
  plateGhost: HTMLElement | null = null;
  plateSub: HTMLElement | null = null;
  conn: HTMLElement | null = null;
  raceOuter: HTMLElement | null = null;
  vFill: HTMLElement | null = null;
  nFill: HTMLElement | null = null;
  vTime: HTMLElement | null = null;
  nTime: HTMLElement | null = null;
  vDone: HTMLElement | null = null;
  payoff: HTMLElement | null = null;
  deployGrid: HTMLElement | null = null;
  dcells: HTMLElement[] = [];
  globe: HTMLElement | null = null;
  gpins: HTMLElement[] = [];
  _rv: HTMLElement[] = [];
  _intro: HTMLElement[] = [];
  _raf: number | null = null;
  _dead = false;
  _lastNow = 0;
  _sy = 0;
  _prevSy = 0;
  _swapRun = false;
  _raceRun = false;
  _deployRun = false;
  _loop: ((now: number) => void) | null = null;
  _wake: (() => void) | null = null;
  _visibilityChange: (() => void) | null = null;
  _copyHandler: ((event: MouseEvent) => void) | null = null;
  _copyResetTimer: ReturnType<typeof setTimeout> | null = null;
  _drawParticles: ((now: number, heroProgress: number) => void) | null = null;

  componentDidMount() {
    const root = this.root;
    if (!root) return;

    this.reduce =
      !this.props.motion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.applyAccent();

    const $ = (selector: string) => root.querySelector<HTMLElement>(selector);
    const $$ = (selector: string) => [...root.querySelectorAll<HTMLElement>(selector)];

    this.hero = $('[data-el="hero"]');
    this.heroBg = $('[data-el="heroBg"]');
    this.l1 = $('[data-el="l1"]');
    this.l2 = $('[data-el="l2"]');
    this.heroTop = $('[data-el="heroTop"]');
    this.heroBottom = $('[data-el="heroBottom"]');
    this.scrollHint = $('[data-el="scrollHint"]');
    this.ready = $('[data-el="ready"]');
    this.mq = $('[data-el="mq"]');
    this.swapOuter = $('[data-el="swapOuter"]');
    this.nextLabel = $('[data-el="nextLabel"]');
    this.viteLabel = $('[data-el="viteLabel"]');
    this.plate = $('[data-el="plate"]');
    this.plateGhost = $('[data-el="plateGhost"]');
    this.plateSub = $('[data-el="plateSub"]');
    this.conn = $('[data-el="conn"]');
    this.raceOuter = $('[data-el="raceOuter"]');
    this.vFill = $('[data-el="vinextFill"]');
    this.nFill = $('[data-el="nextFill"]');
    this.vTime = $('[data-el="vinextTime"]');
    this.nTime = $('[data-el="nextTime"]');
    this.vDone = $('[data-el="vinextDone"]');
    this.payoff = $('[data-el="payoff"]');
    this.deployGrid = $('[data-el="deployGrid"]');
    this.dcells = $$('[data-el="dcell"]');
    this.globe = $('[data-el="globe"]');
    this.gpins = $$("[data-gpin]");
    this._rv = $$("[data-rv]");
    this._intro = $$("[data-intro]");

    this.setupCopy(root);

    if (this.reduce) {
      this.staticFinish();
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this._intro.forEach((element) => {
          element.style.opacity = "1";
          element.style.transform = "translateY(0)";
        });
      });
    });

    this.setupParticles();
    this.runHeroSwap();
    this._sy = window.scrollY;
    this._prevSy = this._sy;
    this._loop = this.loop.bind(this);
    this._wake = () => {
      if (this._dead || document.hidden || this._raf !== null || !this._loop) return;
      this._lastNow = performance.now();
      this._raf = requestAnimationFrame(this._loop);
    };
    this._visibilityChange = () => {
      if (document.hidden && this._raf !== null) {
        cancelAnimationFrame(this._raf);
        this._raf = null;
      } else {
        this._wake?.();
      }
    };

    document.addEventListener("visibilitychange", this._visibilityChange);
    window.addEventListener("scroll", this._wake, { passive: true });
    window.addEventListener("resize", this._wake, { passive: true });
    this._wake();
  }

  destroy() {
    this._dead = true;
    if (this._raf !== null) cancelAnimationFrame(this._raf);
    if (this._visibilityChange) {
      document.removeEventListener("visibilitychange", this._visibilityChange);
    }
    if (this._wake) {
      window.removeEventListener("scroll", this._wake);
      window.removeEventListener("resize", this._wake);
    }
    if (this._copyHandler && this.root) {
      this.root.removeEventListener("click", this._copyHandler);
    }
    if (this._copyResetTimer !== null) clearTimeout(this._copyResetTimer);
  }

  hexToRgb(hex: string): Accent {
    let normalized = hex.replace("#", "");
    if (normalized.length === 3) {
      normalized = normalized
        .split("")
        .map((character) => character + character)
        .join("");
    }
    const numeric = Number.parseInt(normalized || "f6821f", 16);
    return { r: (numeric >> 16) & 255, g: (numeric >> 8) & 255, b: numeric & 255 };
  }

  applyAccent() {
    if (!this.root) return;
    const hex = this.props.accent;
    const color = this.hexToRgb(hex);
    this.root.style.setProperty("--orange", hex);
    this.root.style.setProperty("--orange-rgb", `${color.r},${color.g},${color.b}`);
    this.root.style.setProperty(
      "--amber",
      `rgb(${Math.min(255, color.r + 8)},${Math.min(255, color.g + 43)},${Math.min(255, color.b + 34)})`,
    );
  }

  clamp(value: number) {
    return value < 0 ? 0 : value > 1 ? 1 : value;
  }

  smooth(value: number) {
    const clamped = this.clamp(value);
    return clamped * clamped * (3 - 2 * clamped);
  }

  staticFinish() {
    const frame = getRaceFrame(this.race, 1);

    this._intro.forEach((element) => {
      element.style.opacity = "1";
      element.style.transform = "none";
    });
    this._rv.forEach((element) => {
      element.style.opacity = "1";
      element.style.transform = "none";
    });
    if (this.viteLabel) {
      this.viteLabel.style.opacity = "1";
      this.viteLabel.style.transform = "none";
    }
    if (this.ready) this.ready.style.opacity = "1";
    if (this.nextLabel) this.nextLabel.style.opacity = "0";
    this.plate?.classList.add("is-swapped");
    if (this.plateSub) {
      this.plateSub.textContent = "vite + @vitejs/plugin-rsc";
      this.plateSub.style.color = "var(--orange-soft)";
    }
    if (this.plateGhost) this.plateGhost.textContent = "Vite";
    if (this.vFill) {
      this.vFill.style.transform = `scaleX(${frame.vinextFill.toFixed(4)})`;
    }
    if (this.nFill) this.nFill.style.transform = `scaleX(${frame.nextjsFill.toFixed(4)})`;
    if (this.vTime) this.vTime.textContent = `${frame.vinextTime.toFixed(1)}s`;
    if (this.nTime) this.nTime.textContent = `${frame.nextjsTime.toFixed(1)}s`;
    if (this.vDone) this.vDone.style.opacity = frame.vinextDone ? "1" : "0";
    if (this.payoff) {
      this.payoff.style.opacity = "1";
      this.payoff.style.transform = "none";
    }
    this.lightDeploy(true);
    this.globe?.classList.add("tether-done");
    if (this.heroBg) this.heroBg.style.opacity = "0";
  }

  runHeroSwap() {
    setTimeout(() => {
      if (!this._dead && this.ready) this.ready.style.opacity = "1";
    }, 1100);
  }

  setupCopy(root: HTMLElement) {
    const setStatus = (
      button: HTMLButtonElement,
      message: string,
      state: CopyStatus,
      label: string,
    ) => {
      if (this._copyResetTimer !== null) clearTimeout(this._copyResetTimer);
      button.textContent = message;
      button.setAttribute("data-copy-state", state);
      button.setAttribute("aria-label", label);
      this._copyResetTimer = setTimeout(() => {
        button.textContent = "copy";
        button.removeAttribute("data-copy-state");
        button.setAttribute("aria-label", "Copy command");
      }, 1500);
    };

    this._copyHandler = (event) => {
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

    root.addEventListener("click", this._copyHandler);
  }

  loop(now: number) {
    if (this._dead || document.hidden) {
      this._raf = null;
      return;
    }

    let delta = now - (this._lastNow || now);
    this._lastNow = now;
    if (delta <= 0 || delta > 100) delta = 16.7;
    const target = window.scrollY;
    this._sy += (target - this._sy) * (1 - Math.pow(0.86, delta / 16.7));
    if (Math.abs(target - this._sy) < 0.05) this._sy = target;
    const velocity = (this._sy - this._prevSy) * (16.7 / delta);
    this._prevSy = this._sy;
    const viewportHeight = window.innerHeight;

    let heroProgress = 0;
    if (this.hero) {
      const heroHeight = this.hero.offsetHeight - viewportHeight;
      heroProgress = this.clamp(this._sy / Math.max(1, heroHeight));
      const eased = this.smooth(heroProgress);
      const distance = eased * window.innerWidth * 0.55;
      const opacity = String(Math.max(0, 1 - eased * eased * 1.15));
      const scale = `scale(${(1 - eased * 0.08).toFixed(4)})`;
      if (this.l1) {
        this.l1.style.transform = `translate3d(${-distance}px,0,0) ${scale}`;
        this.l1.style.opacity = opacity;
      }
      if (this.l2) {
        this.l2.style.transform = `translate3d(${distance}px,0,0) ${scale}`;
        this.l2.style.opacity = opacity;
      }
      const fade = this.clamp(heroProgress * 1.6);
      const fadeOpacity = String(1 - fade);
      if (this.heroTop) {
        this.heroTop.style.opacity = fadeOpacity;
        this.heroTop.style.transform = `translate3d(0,${-fade * 70}px,0)`;
      }
      if (this.heroBottom) {
        this.heroBottom.style.opacity = fadeOpacity;
        this.heroBottom.style.transform = `translate3d(0,${fade * 70}px,0)`;
      }
      if (this.scrollHint) {
        this.scrollHint.style.opacity = String(1 - this.clamp(heroProgress * 4));
      }
    }

    if (this.mq) {
      const rect = this.mq.getBoundingClientRect();
      const relativeTop = rect.top - viewportHeight;
      const skew = Math.max(-5, Math.min(5, velocity * 0.08));
      this.mq.style.transform = `translate3d(${relativeTop * 0.42}px,0,0) skewX(${skew}deg)`;
    }

    if (
      !this._swapRun &&
      this.swapOuter &&
      this.swapOuter.getBoundingClientRect().top < -viewportHeight * 0.075
    ) {
      this.runSwap();
    }

    if (this._rv.length) {
      this._rv = this._rv.filter((element) => {
        if (element.getBoundingClientRect().top < viewportHeight * 0.92) {
          element.style.opacity = "1";
          element.style.transform = "none";
          return false;
        }
        return true;
      });
    }

    if (this.globe && this.deployGrid) {
      const gridRect = this.deployGrid.getBoundingClientRect();
      const progress = this.clamp(
        (viewportHeight - gridRect.top) / (viewportHeight + gridRect.height),
      );
      this.globe.style.transform = `translate3d(0,${((0.5 - progress) * 70).toFixed(1)}px,0)`;
    }

    if (
      !this._raceRun &&
      this.raceOuter &&
      this.raceOuter.getBoundingClientRect().top < viewportHeight * 0.55
    ) {
      this.runRace();
    }
    if (
      !this._deployRun &&
      this.deployGrid &&
      this.deployGrid.getBoundingClientRect().top < viewportHeight * 0.8
    ) {
      this._deployRun = true;
      this.lightDeploy(false);
      this.globe?.classList.add("tether-run");
    }

    this._drawParticles?.(now, heroProgress);

    if (Math.abs(target - this._sy) > 0.05 || Math.abs(velocity) > 0.01) {
      if (this._loop) this._raf = requestAnimationFrame(this._loop);
    } else {
      this._raf = null;
    }
  }

  runRace() {
    if (this._raceRun) return;
    this._raceRun = true;
    const start = performance.now();
    // Play the race in real time so the counters are honest stopwatches
    // (linear, no easing — a second on screen is a build second). Capped so
    // a slow ingest or a heavier benchmark suite can't drag the animation
    // past attention span; beyond the cap it compresses proportionally.
    const duration = getRaceFrame(this.race, 0).durationMs;

    const step = (now: number) => {
      if (this._dead) return;
      const time = Math.min(1, (now - start) / duration);
      const frame = getRaceFrame(this.race, time);
      if (this.vFill) {
        this.vFill.style.transform = `scaleX(${frame.vinextFill.toFixed(4)})`;
      }
      if (this.nFill) {
        this.nFill.style.transform = `scaleX(${frame.nextjsFill.toFixed(4)})`;
      }
      if (this.vTime) this.vTime.textContent = `${frame.vinextTime.toFixed(1)}s`;
      if (this.nTime) this.nTime.textContent = `${frame.nextjsTime.toFixed(1)}s`;
      if (this.vDone) this.vDone.style.opacity = frame.vinextDone ? "1" : "0";
      if (time < 1) {
        requestAnimationFrame(step);
      } else if (this.payoff) {
        this.payoff.style.opacity = "1";
        this.payoff.style.transform = "none";
      }
    };

    requestAnimationFrame(step);
  }

  applySwap(progress: number) {
    if (this.nextLabel) {
      this.nextLabel.style.opacity = String(1 - Math.min(1, progress * 1.25));
    }
    if (this.viteLabel) {
      this.viteLabel.style.opacity = String(Math.max(0, (progress - 0.15) / 0.85));
      this.viteLabel.style.transform = `translateY(${(1 - progress) * 44}px)`;
    }
    if (this.plateSub) {
      const swapped = progress > 0.5;
      this.plateSub.textContent = swapped ? "vite + @vitejs/plugin-rsc" : "next build · next.js 16";
      this.plateSub.style.color = swapped ? "var(--orange-soft)" : "var(--mute)";
    }
    if (this.conn) this.conn.style.opacity = String(0.3 + progress * 0.7);
  }

  runSwap() {
    if (this._swapRun) return;
    this._swapRun = true;
    this.plate?.classList.add("is-swapped");
    const start = performance.now();
    const duration = 1100;

    const step = (now: number) => {
      if (this._dead) return;
      const time = Math.min(1, (now - start) / duration);
      this.applySwap(this.smooth(time));
      if (time < 1) requestAnimationFrame(step);
      else this.contractPlate();
    };

    requestAnimationFrame(step);
  }

  contractPlate() {
    if (!this.plate || !this.plateGhost) return;
    const initialWidth = this.plate.offsetWidth;
    this.plateGhost.textContent = "Vite";
    const finalWidth = this.plate.offsetWidth;
    if (finalWidth === initialWidth) return;
    this.plate.style.width = `${initialWidth}px`;
    void this.plate.offsetWidth;
    this.plate.style.transition = "width .6s var(--ease-out)";
    this.plate.style.width = `${finalWidth}px`;
    const plate = this.plate;
    setTimeout(() => {
      plate.style.width = "";
      plate.style.transition = "";
    }, 700);
  }

  lightDeploy(instant: boolean) {
    this.gpins.forEach((pin) => {
      pin.style.opacity = "1";
      pin.style.transform = "none";
    });
    this.dcells.forEach((cell, index) => {
      const illuminate = () => {
        const name = cell.querySelector<HTMLElement>("[data-name]");
        const tag = cell.querySelector<HTMLElement>("[data-tag]");
        if (name) name.style.color = "var(--ink)";
        if (tag) tag.style.color = index === 0 ? "var(--orange-soft)" : "var(--ink-sub)";
      };
      if (instant) illuminate();
      else setTimeout(illuminate, index * 110);
    });
  }

  setupParticles() {
    if (!this.heroBg) return;
    const heroBg = this.heroBg;
    heroBg.style.opacity = "1";
    this._drawParticles = (_now, heroProgress) => {
      const progress = this.clamp(heroProgress * 1.15);
      heroBg.style.opacity = String(1 - progress * progress * (3 - 2 * progress));
    };
  }
}

export function LandingMotion({ race }: { race?: RaceSeconds }) {
  const vinextSeconds = race?.vinext;
  const nextjsSeconds = race?.nextjs;

  useEffect(() => {
    const landing = new Landing();
    if (vinextSeconds && nextjsSeconds) {
      landing.race = { vinext: vinextSeconds, nextjs: nextjsSeconds };
    }
    landing.root = document.getElementById("app");
    landing.componentDidMount();
    return () => landing.destroy();
    // Primitive deps: a fresh `race` object with equal values must not tear
    // down and rebuild the scroll/animation controller.
  }, [vinextSeconds, nextjsSeconds]);

  return null;
}
