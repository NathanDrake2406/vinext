import type { CSSProperties } from "react";
import { LandingMotion } from "./_components/landing-motion";
import { formatKb, formatMultiple, getLandingStats } from "./lib/landing-stats";

// ISR: headline numbers come from the same D1 data as /compatibility and
// /benchmarks; 5 minutes of staleness matches those pages.
export const revalidate = 300;

/**
 * Mechanical JSX port of vinext-frontend/vinext-landing.edit.html. Preserve
 * inline style values and data-* hooks: the light theme and motion controller
 * intentionally select against them.
 */
type LandingStyle = CSSProperties & Partial<Record<`--${string}`, string | number>>;

const landingRootStyle = {
  "--t": ".48s var(--ease-out)",
  position: "relative",
  background: "var(--bg)",
  color: "var(--ink)",
  fontFamily: "'Geist',system-ui,-apple-system,sans-serif",
} satisfies LandingStyle;

export default async function HomePage() {
  const stats = await getLandingStats();
  const buildMultiple = formatMultiple(stats.buildSeconds.nextjs / stats.buildSeconds.vinext);
  const bundleReductionPct = Math.round(
    (1 - stats.bundleBytes.vinext / stats.bundleBytes.nextjs) * 100,
  );

  return (
    <>
      <LandingMotion race={stats.buildSeconds} />
      <div id="app" className="landing-root" style={landingRootStyle}>
        <div
          aria-hidden="true"
          style={
            {
              position: "fixed",
              inset: "0",
              zIndex: "70",
              pointerEvents: "none",
              opacity: ".05",
              mixBlendMode: "overlay",
              backgroundImage: 'url("/img/icon-01.svg")',
            } satisfies LandingStyle
          }
        />

        <div
          data-el="heroBg"
          aria-hidden="true"
          style={
            {
              position: "fixed",
              inset: "0",
              zIndex: "0",
              opacity: "0",
              pointerEvents: "none",
              overflow: "hidden",
            } satisfies LandingStyle
          }
        >
          <div
            style={
              {
                position: "absolute",
                left: "64%",
                top: "8%",
                width: "90vmax",
                height: "90vmax",
                margin: "-45vmax 0 0 -45vmax",
                background:
                  "radial-gradient(closest-side,rgba(var(--orange-rgb),.13),rgba(var(--orange-rgb),.05) 42%,transparent 68%)",
                animation: "aur1 47s ease-in-out infinite alternate",
              } satisfies LandingStyle
            }
          />
          <div
            style={
              {
                position: "absolute",
                left: "18%",
                top: "80%",
                width: "110vmax",
                height: "110vmax",
                margin: "-55vmax 0 0 -55vmax",
                background:
                  "radial-gradient(closest-side,rgba(var(--aur2-rgb),.17),rgba(var(--aur2-rgb),.07) 45%,transparent 70%)",
                animation: "aur2 61s ease-in-out infinite alternate",
              } satisfies LandingStyle
            }
          />
          <div
            style={
              {
                position: "absolute",
                left: "83%",
                top: "72%",
                width: "60vmax",
                height: "60vmax",
                margin: "-30vmax 0 0 -30vmax",
                background: "radial-gradient(closest-side,rgba(251,173,65,.07),transparent 65%)",
                animation: "aur3 53s ease-in-out infinite alternate",
              } satisfies LandingStyle
            }
          />
          <div
            style={
              {
                position: "absolute",
                inset: "0",
                background:
                  "radial-gradient(120% 100% at 50% 45%,transparent 44%,rgba(var(--bg-rgb),.66) 100%)",
              } satisfies LandingStyle
            }
          />
        </div>

        <div style={{ position: "relative", zIndex: "2" } satisfies LandingStyle}>
          <section
            id="hero"
            data-el="hero"
            data-screen-label="Hero"
            style={{ position: "relative", zIndex: "2", height: "125vh" } satisfies LandingStyle}
          >
            <div
              className="landing-viewport-height"
              style={
                {
                  position: "sticky",
                  top: "0",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  padding: "0 24px",
                  overflow: "hidden",
                } satisfies LandingStyle
              }
            >
              <div
                data-el="heroTop"
                style={{ willChange: "transform,opacity" } satisfies LandingStyle}
              />
              <h1
                style={
                  {
                    margin: "0",
                    fontFamily: "'Geist',system-ui,sans-serif",
                    fontWeight: "700",
                    fontSize: "clamp(58px,11.5vw,178px)",
                    lineHeight: ".9",
                    letterSpacing: "-.045em",
                    color: "var(--ink)",
                  } satisfies LandingStyle
                }
              >
                <div
                  data-el="l1"
                  style={{ willChange: "transform,opacity" } satisfies LandingStyle}
                >
                  <span
                    data-intro=""
                    style={
                      {
                        display: "block",
                        opacity: "0",
                        transform: "translateY(50px)",
                        transition:
                          "opacity 1s cubic-bezier(.2,1,.25,1) .2s,transform 1s cubic-bezier(.2,1,.25,1) .2s",
                      } satisfies LandingStyle
                    }
                  >
                    Run Next.js
                  </span>
                </div>
                <div
                  data-el="l2"
                  style={{ willChange: "transform,opacity" } satisfies LandingStyle}
                >
                  <span
                    data-intro=""
                    style={
                      {
                        display: "block",
                        opacity: "0",
                        transform: "translateY(50px)",
                        transition:
                          "opacity 1s cubic-bezier(.2,1,.25,1) .34s,transform 1s cubic-bezier(.2,1,.25,1) .34s",
                      } satisfies LandingStyle
                    }
                  >
                    <span style={{ color: "var(--mute)" } satisfies LandingStyle}>on</span>{" "}
                    <span
                      style={
                        {
                          color: "var(--orange)",
                          textShadow: "0 0 80px var(--orange-glow)",
                        } satisfies LandingStyle
                      }
                    >
                      Vite.
                    </span>
                  </span>
                </div>
              </h1>
              <div
                data-el="heroBottom"
                style={
                  {
                    willChange: "transform,opacity",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  } satisfies LandingStyle
                }
              >
                <p
                  data-intro=""
                  style={
                    {
                      opacity: "0",
                      transform: "translateY(26px)",
                      transition:
                        "opacity .9s cubic-bezier(.2,1,.25,1) .5s,transform .9s cubic-bezier(.2,1,.25,1) .5s",
                      margin: "42px 0 0",
                      maxWidth: "54ch",
                      fontSize: "17.5px",
                      lineHeight: "1.6",
                      color: "var(--sub)",
                    } satisfies LandingStyle
                  }
                >
                  Your code stays exactly the same.
                  <br />
                  Faster dev loop, smaller bundles, deploy anywhere.
                </p>
                <div
                  data-intro=""
                  style={
                    {
                      opacity: "0",
                      transform: "translateY(26px)",
                      transition:
                        "opacity .9s cubic-bezier(.2,1,.25,1) .62s,transform .9s cubic-bezier(.2,1,.25,1) .62s",
                      marginTop: "64px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "18px",
                    } satisfies LandingStyle
                  }
                >
                  <div
                    style={
                      {
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: "10px",
                        letterSpacing: ".2em",
                        textTransform: "uppercase",
                        color: "var(--mute)",
                      } satisfies LandingStyle
                    }
                  >
                    deploys anywhere
                  </div>

                  <div
                    style={
                      {
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexWrap: "wrap",
                        gap: "18px 30px",
                        color: "var(--ink)",
                        opacity: ".92",
                      } satisfies LandingStyle
                    }
                  >
                    <img
                      src="/img/brand-cloudflare.svg"
                      alt="Cloudflare Workers"
                      width="22"
                      height="22"
                      style={{ display: "block" } satisfies LandingStyle}
                    />
                    <svg
                      role="img"
                      aria-label="Vercel"
                      viewBox="0 0 24 24"
                      width="18"
                      height="18"
                      fill="currentColor"
                    >
                      <path d="m12 1.608 12 20.784H0Z" />
                    </svg>
                    <img
                      src="/img/brand-netlify.svg"
                      alt="Netlify"
                      width="19"
                      height="19"
                      style={{ display: "block" } satisfies LandingStyle}
                    />
                    <span
                      role="img"
                      aria-label="AWS Lambda"
                      style={
                        {
                          font: "600 17px/1 'JetBrains Mono',monospace",
                          color: "#ff9900",
                        } satisfies LandingStyle
                      }
                    >
                      λ
                    </span>
                    <svg
                      role="img"
                      aria-label="Deno Deploy"
                      viewBox="0 0 24 24"
                      width="19"
                      height="19"
                      fill="currentColor"
                    >
                      <path d="M1.105 18.02A11.9 11.9 0 0 1 0 12.985q0-.698.078-1.376a12 12 0 0 1 .231-1.34A12 12 0 0 1 4.025 4.02a12 12 0 0 1 5.46-2.771 12 12 0 0 1 3.428-.23c1.452.112 2.825.477 4.077 1.05a12 12 0 0 1 2.78 1.774 12.02 12.02 0 0 1 4.053 7.078A12 12 0 0 1 24 12.985q0 .454-.036.914a12 12 0 0 1-.728 3.305 12 12 0 0 1-2.38 3.875c-1.33 1.357-3.02 1.962-4.43 1.936a4.4 4.4 0 0 1-2.724-1.024c-.99-.853-1.391-1.83-1.53-2.919a5 5 0 0 1 .128-1.518c.105-.38.37-1.116.76-1.437-.455-.197-1.04-.624-1.226-.829-.045-.05-.04-.13 0-.183a.155.155 0 0 1 .177-.053c.392.134.869.267 1.372.35.66.111 1.484.25 2.317.292 2.03.1 4.153-.813 4.812-2.627s.403-3.609-1.96-4.685-3.454-2.356-5.363-3.128c-1.247-.505-2.636-.205-4.06.582-3.838 2.121-7.277 8.822-5.69 15.032a.191.191 0 0 1-.315.19 12 12 0 0 1-1.25-1.634 12 12 0 0 1-.769-1.404M11.57 6.087c.649-.051 1.214.501 1.31 1.236.13.979-.228 1.99-1.41 2.013-1.01.02-1.315-.997-1.248-1.614.066-.616.574-1.575 1.35-1.635" />
                    </svg>
                    <img
                      src="/img/brand-nodedotjs.svg"
                      alt="Node.js"
                      width="20"
                      height="20"
                      style={{ display: "block" } satisfies LandingStyle}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div
            aria-hidden="true"
            style={
              {
                position: "relative",
                zIndex: "2",
                padding: "22px 0 14px",
                overflow: "hidden",
              } satisfies LandingStyle
            }
          >
            <div
              data-el="mq"
              style={
                {
                  whiteSpace: "nowrap",
                  willChange: "transform",
                  fontFamily: "'Geist',system-ui,sans-serif",
                  fontWeight: "700",
                  fontSize: "clamp(54px,7.5vw,110px)",
                  letterSpacing: "-.02em",
                  lineHeight: "1",
                  textTransform: "uppercase",
                } satisfies LandingStyle
              }
            >
              <span
                style={
                  {
                    color: "transparent",
                    WebkitTextStroke: "1.5px rgba(var(--ink-rgb),.2)",
                  } satisfies LandingStyle
                }
              >
                Same code · 
              </span>
              <span
                style={
                  {
                    color: "var(--orange)",
                    textShadow: "0 0 50px rgba(var(--orange-rgb),.35)",
                  } satisfies LandingStyle
                }
              >
                New engine · 
              </span>
              <span
                style={
                  {
                    color: "transparent",
                    WebkitTextStroke: "1.5px rgba(var(--ink-rgb),.2)",
                  } satisfies LandingStyle
                }
              >
                Same code · 
              </span>
              <span
                style={
                  {
                    color: "var(--orange)",
                    textShadow: "0 0 50px rgba(var(--orange-rgb),.35)",
                  } satisfies LandingStyle
                }
              >
                New engine · 
              </span>
              <span
                style={
                  {
                    color: "transparent",
                    WebkitTextStroke: "1.5px rgba(var(--ink-rgb),.2)",
                  } satisfies LandingStyle
                }
              >
                Same code · 
              </span>
              <span
                style={
                  {
                    color: "var(--orange)",
                    textShadow: "0 0 50px rgba(var(--orange-rgb),.35)",
                  } satisfies LandingStyle
                }
              >
                New engine · 
              </span>
              <span
                style={
                  {
                    color: "transparent",
                    WebkitTextStroke: "1.5px rgba(var(--ink-rgb),.2)",
                  } satisfies LandingStyle
                }
              >
                Same code · 
              </span>
              <span
                style={
                  {
                    color: "var(--orange)",
                    textShadow: "0 0 50px rgba(var(--orange-rgb),.35)",
                  } satisfies LandingStyle
                }
              >
                New engine · 
              </span>
            </div>
          </div>

          <section
            id="swap"
            data-el="swapOuter"
            data-screen-label="The engine swap"
            style={{ position: "relative", zIndex: "2", height: "115vh" } satisfies LandingStyle}
          >
            <div
              className="landing-viewport-height"
              style={
                {
                  position: "sticky",
                  top: "0",
                  display: "flex",
                  alignItems: "center",
                  overflow: "hidden",
                } satisfies LandingStyle
              }
            >
              <div
                style={
                  {
                    maxWidth: "1180px",
                    margin: "0 auto",
                    padding: "0 32px",
                    width: "100%",
                    textAlign: "center",
                  } satisfies LandingStyle
                }
              >
                <h2
                  data-rv=""
                  style={
                    {
                      opacity: "0",
                      transform: "translateY(24px)",
                      transition: "opacity var(--t),transform var(--t)",
                      transitionDelay: ".06s",
                      margin: "0",
                      fontFamily: "'Geist',system-ui,sans-serif",
                      fontWeight: "700",
                      fontSize: "clamp(32px,5.4vw,64px)",
                      lineHeight: "1.02",
                      letterSpacing: "-.03em",
                    } satisfies LandingStyle
                  }
                >
                  Nothing to rewrite.
                </h2>
                <p
                  data-rv=""
                  style={
                    {
                      opacity: "0",
                      transform: "translateY(24px)",
                      transition: "opacity var(--t),transform var(--t)",
                      transitionDelay: ".12s",
                      margin: "24px auto 0",
                      maxWidth: "56ch",
                      fontSize: "16px",
                      lineHeight: "1.65",
                      color: "var(--ink-sub)",
                    } satisfies LandingStyle
                  }
                >
                  Every{" "}
                  <code
                    style={
                      {
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: ".85em",
                        background: "rgba(var(--ink-rgb),.06)",
                        padding: "1px 6px",
                        borderRadius: "5px",
                        color: "var(--orange-soft)",
                      } satisfies LandingStyle
                    }
                  >
                    next/*
                  </code>{" "}
                  import resolves to a vinext shim on{" "}
                  <code
                    style={
                      {
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: ".85em",
                        background: "rgba(var(--ink-rgb),.06)",
                        padding: "1px 6px",
                        borderRadius: "5px",
                        color: "var(--orange-soft)",
                        whiteSpace: "nowrap",
                      } satisfies LandingStyle
                    }
                  >
                    @vitejs/plugin-rsc
                  </code>
                  .
                </p>

                <div
                  style={
                    {
                      marginTop: "48px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                    } satisfies LandingStyle
                  }
                >
                  <div
                    style={
                      {
                        display: "flex",
                        gap: "14px",
                        justifyContent: "center",
                        flexWrap: "wrap",
                      } satisfies LandingStyle
                    }
                  >
                    <div
                      style={
                        {
                          padding: "13px 20px",
                          border: "1px solid var(--line)",
                          borderRadius: "13px",
                          background: "rgba(var(--surface-rgb),.65)",
                          backdropFilter: "blur(6px)",
                          fontFamily: "'JetBrains Mono',monospace",
                          fontSize: "14px",
                          color: "var(--ink-sub)",
                        } satisfies LandingStyle
                      }
                    >
                      app/
                    </div>
                    <div
                      style={
                        {
                          padding: "13px 20px",
                          border: "1px solid var(--line)",
                          borderRadius: "13px",
                          background: "rgba(var(--surface-rgb),.65)",
                          backdropFilter: "blur(6px)",
                          fontFamily: "'JetBrains Mono',monospace",
                          fontSize: "14px",
                          color: "var(--ink-sub)",
                        } satisfies LandingStyle
                      }
                    >
                      pages/
                    </div>
                    <div
                      style={
                        {
                          padding: "13px 20px",
                          border: "1px solid var(--line)",
                          borderRadius: "13px",
                          background: "rgba(var(--surface-rgb),.65)",
                          backdropFilter: "blur(6px)",
                          fontFamily: "'JetBrains Mono',monospace",
                          fontSize: "14px",
                          color: "var(--ink-sub)",
                        } satisfies LandingStyle
                      }
                    >
                      next.config.js
                    </div>
                  </div>
                  <div
                    style={
                      {
                        marginTop: "12px",
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: "10.5px",
                        letterSpacing: ".16em",
                        textTransform: "uppercase",
                        color: "var(--mute)",
                      } satisfies LandingStyle
                    }
                  >
                    your code · unchanged
                  </div>
                  <div
                    data-el="conn"
                    style={
                      {
                        width: "2px",
                        height: "48px",
                        margin: "14px 0",
                        background:
                          "linear-gradient(180deg,rgba(var(--orange-rgb),.3),transparent)",
                        opacity: ".3",
                      } satisfies LandingStyle
                    }
                  />
                  <div
                    className="engine-plate"
                    data-el="plate"
                    style={
                      {
                        position: "relative",
                        minWidth: "min(360px,82vw)",
                        padding: "26px 44px 22px",
                        border: "1px solid rgba(var(--orange-rgb),.12)",
                        borderRadius: "18px",
                        background:
                          "linear-gradient(180deg,rgba(var(--surface-rgb),.9),rgba(var(--surface-2-rgb),.9))",
                        boxShadow: "0 0 20px rgba(var(--orange-rgb),.05)",
                      } satisfies LandingStyle
                    }
                  >
                    <div
                      style={
                        {
                          fontFamily: "'JetBrains Mono',monospace",
                          fontSize: "10.5px",
                          letterSpacing: ".2em",
                          textTransform: "uppercase",
                          color: "var(--mute)",
                        } satisfies LandingStyle
                      }
                    >
                      engine
                    </div>
                    <div
                      style={
                        {
                          position: "relative",
                          height: "1.05em",
                          margin: "8px 0 4px",
                          fontFamily: "'Geist',system-ui,sans-serif",
                          fontWeight: "700",
                          fontSize: "clamp(40px,6vw,76px)",
                          letterSpacing: "-.03em",
                          lineHeight: "1",
                        } satisfies LandingStyle
                      }
                    >
                      <span
                        data-el="plateGhost"
                        aria-hidden="true"
                        style={{ visibility: "hidden" } satisfies LandingStyle}
                      >
                        Turbopack
                      </span>
                      <span
                        data-el="nextLabel"
                        style={
                          {
                            position: "absolute",
                            left: "0",
                            right: "0",
                            top: "0",
                            color: "var(--ink)",
                          } satisfies LandingStyle
                        }
                      >
                        Turbopack
                      </span>
                      <span
                        data-el="viteLabel"
                        style={
                          {
                            position: "absolute",
                            left: "0",
                            right: "0",
                            top: "0",
                            color: "var(--orange)",
                            opacity: "0",
                            transform: "translateY(44px)",
                            textShadow: "0 0 50px var(--orange-glow)",
                          } satisfies LandingStyle
                        }
                      >
                        Vite
                        <svg
                          aria-hidden="true"
                          style={
                            {
                              width: ".62em",
                              height: ".58em",
                              marginLeft: ".18em",
                              verticalAlign: "-.02em",
                            } satisfies LandingStyle
                          }
                          viewBox="4 0 15 14"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M12.0135 13.6771C11.815 13.9297 11.4089 13.7892 11.4089 13.4682V10.3853C11.4089 10.0114 11.106 9.70846 10.7321 9.70846H7.32818C7.05295 9.70846 6.89245 9.39713 7.05295 9.17347L9.29089 6.04023C9.61124 5.59225 9.29089 4.9696 8.73979 4.9696H4.62036C4.34513 4.9696 4.18463 4.65828 4.34512 4.43461L7.24632 0.372548C7.31013 0.283598 7.41262 0.230743 7.52155 0.230743H16.1671C16.4424 0.230743 16.6029 0.542069 16.4424 0.765734L14.2044 3.89897C13.8841 4.34695 14.2044 4.9696 14.7555 4.9696H18.1595C18.4418 4.9696 18.6004 5.29511 18.4257 5.51748L12.0142 13.6777L12.0135 13.6771Z"
                            fill="#863BFF"
                          />
                          <mask
                            id="mask0_127_17274"
                            style={{ maskType: "alpha" } satisfies LandingStyle}
                            maskUnits="userSpaceOnUse"
                            x="4"
                            y="0"
                            width="15"
                            height="14"
                          >
                            <path
                              d="M11.9823 13.677C11.7838 13.9296 11.3777 13.7891 11.3777 13.4681V10.3852C11.3777 10.0113 11.0747 9.70837 10.7009 9.70837H7.29693C7.0217 9.70837 6.8612 9.39704 7.0217 9.17338L9.25964 6.04014C9.57999 5.59216 9.25964 4.96951 8.70854 4.96951H4.58911C4.31388 4.96951 4.15338 4.65818 4.31387 4.43452L7.21507 0.372457C7.27888 0.283506 7.38137 0.230652 7.4903 0.230652H16.1359C16.4111 0.230652 16.5716 0.541978 16.4111 0.765643L14.1732 3.89888C13.8528 4.34686 14.1732 4.96951 14.7243 4.96951H18.1282C18.4106 4.96951 18.5691 5.29502 18.3944 5.51739L11.9829 13.6776L11.9823 13.677Z"
                              fill="black"
                            />
                          </mask>
                          <g mask="url(#mask0_127_17274)">
                            <g filter="url(#filter0_f_127_17274)">
                              <ellipse
                                cx="1.6481"
                                cy="4.39979"
                                rx="1.6481"
                                ry="4.39979"
                                transform="matrix(0.00324134 0.999995 0.999995 -0.00324134 2.91309 9.66077)"
                                fill="#EDE6FF"
                              />
                            </g>
                            <g filter="url(#filter1_f_127_17274)">
                              <ellipse
                                cx="3.11172"
                                cy="8.9321"
                                rx="3.11172"
                                ry="8.9321"
                                transform="matrix(0.00324134 0.999995 0.999995 -0.00324134 -7.51758 2.58936)"
                                fill="#EDE6FF"
                              />
                            </g>
                            <g filter="url(#filter2_f_127_17274)">
                              <ellipse
                                cx="1.6481"
                                cy="9.12221"
                                rx="1.6481"
                                ry="9.12221"
                                transform="matrix(0.00324134 0.999995 0.999995 -0.00324134 -7.8584 3.61816)"
                                fill="#7E14FF"
                              />
                            </g>
                            <g filter="url(#filter3_f_127_17274)">
                              <ellipse
                                cx="1.6481"
                                cy="9.15566"
                                rx="1.6481"
                                ry="9.15566"
                                transform="matrix(0.00324134 0.999995 0.999995 -0.00324134 -6.4834 9.00391)"
                                fill="#7E14FF"
                              />
                            </g>
                            <g filter="url(#filter4_f_127_17274)">
                              <ellipse
                                cx="1.6481"
                                cy="9.15566"
                                rx="1.6481"
                                ry="9.15566"
                                transform="matrix(0.00324134 0.999995 0.999995 -0.00324134 -6.02441 9.34766)"
                                fill="#7E14FF"
                              />
                            </g>
                            <g filter="url(#filter5_f_127_17274)">
                              <ellipse
                                cx="4.21045"
                                cy="6.60625"
                                rx="4.21045"
                                ry="6.60625"
                                transform="matrix(0.0584509 -0.99829 -0.99829 -0.0584509 26.4971 8.26871)"
                                fill="#EDE6FF"
                              />
                            </g>
                            <g filter="url(#filter6_f_127_17274)">
                              <ellipse
                                cx="1.03839"
                                cy="6.43346"
                                rx="1.03839"
                                ry="6.43346"
                                transform="matrix(-0.0172986 -0.99985 -0.99985 0.0172986 26.9297 5.63535)"
                                fill="#7E14FF"
                              />
                            </g>
                            <g filter="url(#filter7_f_127_17274)">
                              <ellipse
                                cx="1.03839"
                                cy="6.43346"
                                rx="1.03839"
                                ry="6.43346"
                                transform="matrix(-0.0172986 -0.99985 -0.99985 0.0172986 26.9297 5.63535)"
                                fill="#7E14FF"
                              />
                            </g>
                            <g filter="url(#filter8_f_127_17274)">
                              <ellipse
                                cx="4.36576"
                                cy="2.91514"
                                rx="1.31855"
                                ry="8.70955"
                                transform="rotate(39.5103 4.36576 2.91514)"
                                fill="#7E14FF"
                              />
                            </g>
                            <g filter="url(#filter9_f_127_17274)">
                              <ellipse
                                cx="18.4697"
                                cy="-1.59207"
                                rx="1.31855"
                                ry="8.70955"
                                transform="rotate(37.8923 18.4697 -1.59207)"
                                fill="#7E14FF"
                              />
                            </g>
                            <g filter="url(#filter10_f_127_17274)">
                              <ellipse
                                cx="16.6417"
                                cy="2.12577"
                                rx="1.78679"
                                ry="2.89199"
                                transform="rotate(37.8923 16.6417 2.12577)"
                                fill="#47BFFF"
                              />
                            </g>
                            <g filter="url(#filter11_f_127_17274)">
                              <ellipse
                                cx="3.68841"
                                cy="11.7003"
                                rx="1.31855"
                                ry="8.70955"
                                transform="rotate(37.8923 3.68841 11.7003)"
                                fill="#7E14FF"
                              />
                            </g>
                            <g filter="url(#filter12_f_127_17274)">
                              <ellipse
                                cx="3.68841"
                                cy="11.7003"
                                rx="1.31855"
                                ry="8.70955"
                                transform="rotate(37.8923 3.68841 11.7003)"
                                fill="#7E14FF"
                              />
                            </g>
                            <g filter="url(#filter13_f_127_17274)">
                              <ellipse
                                cx="14.9179"
                                cy="9.17936"
                                rx="1.31855"
                                ry="8.70955"
                                transform="rotate(37.8923 14.9179 9.17936)"
                                fill="#7E14FF"
                              />
                            </g>
                            <g filter="url(#filter14_f_127_17274)">
                              <ellipse
                                cx="15.7453"
                                cy="9.92533"
                                rx="1.78679"
                                ry="4.57726"
                                transform="rotate(37.8923 15.7453 9.92533)"
                                fill="#47BFFF"
                              />
                            </g>
                          </g>
                          <defs>
                            <filter
                              id="filter0_f_127_17274"
                              x="-1.66562"
                              y="5.06287"
                              width="17.967"
                              height="12.4635"
                              filterUnits="userSpaceOnUse"
                              colorInterpolationFilters="sRGB"
                            >
                              <feFlood floodOpacity="0" result="BackgroundImageFix" />
                              <feBlend
                                mode="normal"
                                in="SourceGraphic"
                                in2="BackgroundImageFix"
                                result="shape"
                              />
                              <feGaussianBlur
                                stdDeviation="2.29179"
                                result="effect1_foregroundBlur_127_17274"
                              />
                            </filter>
                            <filter
                              id="filter1_f_127_17274"
                              x="-12.0914"
                              y="-2.02332"
                              width="27.0314"
                              height="15.3908"
                              filterUnits="userSpaceOnUse"
                              colorInterpolationFilters="sRGB"
                            >
                              <feFlood floodOpacity="0" result="BackgroundImageFix" />
                              <feBlend
                                mode="normal"
                                in="SourceGraphic"
                                in2="BackgroundImageFix"
                                result="shape"
                              />
                              <feGaussianBlur
                                stdDeviation="2.29179"
                                result="effect1_foregroundBlur_127_17274"
                              />
                            </filter>
                            <filter
                              id="filter2_f_127_17274"
                              x="-10.6037"
                              y="0.838165"
                              width="23.7454"
                              height="8.79703"
                              filterUnits="userSpaceOnUse"
                              colorInterpolationFilters="sRGB"
                            >
                              <feFlood floodOpacity="0" result="BackgroundImageFix" />
                              <feBlend
                                mode="normal"
                                in="SourceGraphic"
                                in2="BackgroundImageFix"
                                result="shape"
                              />
                              <feGaussianBlur
                                stdDeviation="1.37508"
                                result="effect1_foregroundBlur_127_17274"
                              />
                            </filter>
                            <filter
                              id="filter3_f_127_17274"
                              x="-9.22867"
                              y="6.22382"
                              width="23.8118"
                              height="8.79703"
                              filterUnits="userSpaceOnUse"
                              colorInterpolationFilters="sRGB"
                            >
                              <feFlood floodOpacity="0" result="BackgroundImageFix" />
                              <feBlend
                                mode="normal"
                                in="SourceGraphic"
                                in2="BackgroundImageFix"
                                result="shape"
                              />
                              <feGaussianBlur
                                stdDeviation="1.37508"
                                result="effect1_foregroundBlur_127_17274"
                              />
                            </filter>
                            <filter
                              id="filter4_f_127_17274"
                              x="-8.76968"
                              y="6.56757"
                              width="23.8118"
                              height="8.79703"
                              filterUnits="userSpaceOnUse"
                              colorInterpolationFilters="sRGB"
                            >
                              <feFlood floodOpacity="0" result="BackgroundImageFix" />
                              <feBlend
                                mode="normal"
                                in="SourceGraphic"
                                in2="BackgroundImageFix"
                                result="shape"
                              />
                              <feGaussianBlur
                                stdDeviation="1.37508"
                                result="effect1_foregroundBlur_127_17274"
                              />
                            </filter>
                            <filter
                              id="filter5_f_127_17274"
                              x="8.96524"
                              y="-5.12549"
                              width="22.3664"
                              height="17.6096"
                              filterUnits="userSpaceOnUse"
                              colorInterpolationFilters="sRGB"
                            >
                              <feFlood floodOpacity="0" result="BackgroundImageFix" />
                              <feBlend
                                mode="normal"
                                in="SourceGraphic"
                                in2="BackgroundImageFix"
                                result="shape"
                              />
                              <feGaussianBlur
                                stdDeviation="2.29179"
                                result="effect1_foregroundBlur_127_17274"
                              />
                            </filter>
                            <filter
                              id="filter6_f_127_17274"
                              x="11.2967"
                              y="0.91397"
                              width="18.3655"
                              height="7.58884"
                              filterUnits="userSpaceOnUse"
                              colorInterpolationFilters="sRGB"
                            >
                              <feFlood floodOpacity="0" result="BackgroundImageFix" />
                              <feBlend
                                mode="normal"
                                in="SourceGraphic"
                                in2="BackgroundImageFix"
                                result="shape"
                              />
                              <feGaussianBlur
                                stdDeviation="1.37508"
                                result="effect1_foregroundBlur_127_17274"
                              />
                            </filter>
                            <filter
                              id="filter7_f_127_17274"
                              x="11.2967"
                              y="0.91397"
                              width="18.3655"
                              height="7.58884"
                              filterUnits="userSpaceOnUse"
                              colorInterpolationFilters="sRGB"
                            >
                              <feFlood floodOpacity="0" result="BackgroundImageFix" />
                              <feBlend
                                mode="normal"
                                in="SourceGraphic"
                                in2="BackgroundImageFix"
                                result="shape"
                              />
                              <feGaussianBlur
                                stdDeviation="1.37508"
                                result="effect1_foregroundBlur_127_17274"
                              />
                            </filter>
                            <filter
                              id="filter8_f_127_17274"
                              x="-4.01871"
                              y="-6.60739"
                              width="16.7698"
                              height="19.045"
                              filterUnits="userSpaceOnUse"
                              colorInterpolationFilters="sRGB"
                            >
                              <feFlood floodOpacity="0" result="BackgroundImageFix" />
                              <feBlend
                                mode="normal"
                                in="SourceGraphic"
                                in2="BackgroundImageFix"
                                result="shape"
                              />
                              <feGaussianBlur
                                stdDeviation="1.37508"
                                result="effect1_foregroundBlur_127_17274"
                              />
                            </filter>
                            <filter
                              id="filter9_f_127_17274"
                              x="10.2694"
                              y="-11.2637"
                              width="16.4007"
                              height="19.3433"
                              filterUnits="userSpaceOnUse"
                              colorInterpolationFilters="sRGB"
                            >
                              <feFlood floodOpacity="0" result="BackgroundImageFix" />
                              <feBlend
                                mode="normal"
                                in="SourceGraphic"
                                in2="BackgroundImageFix"
                                result="shape"
                              />
                              <feGaussianBlur
                                stdDeviation="1.37508"
                                result="effect1_foregroundBlur_127_17274"
                              />
                            </filter>
                            <filter
                              id="filter10_f_127_17274"
                              x="11.6239"
                              y="-3.15738"
                              width="10.0355"
                              height="10.5663"
                              filterUnits="userSpaceOnUse"
                              colorInterpolationFilters="sRGB"
                            >
                              <feFlood floodOpacity="0" result="BackgroundImageFix" />
                              <feBlend
                                mode="normal"
                                in="SourceGraphic"
                                in2="BackgroundImageFix"
                                result="shape"
                              />
                              <feGaussianBlur
                                stdDeviation="1.37508"
                                result="effect1_foregroundBlur_127_17274"
                              />
                            </filter>
                            <filter
                              id="filter11_f_127_17274"
                              x="-4.51187"
                              y="2.02869"
                              width="16.4007"
                              height="19.3433"
                              filterUnits="userSpaceOnUse"
                              colorInterpolationFilters="sRGB"
                            >
                              <feFlood floodOpacity="0" result="BackgroundImageFix" />
                              <feBlend
                                mode="normal"
                                in="SourceGraphic"
                                in2="BackgroundImageFix"
                                result="shape"
                              />
                              <feGaussianBlur
                                stdDeviation="1.37508"
                                result="effect1_foregroundBlur_127_17274"
                              />
                            </filter>
                            <filter
                              id="filter12_f_127_17274"
                              x="-4.51187"
                              y="2.02869"
                              width="16.4007"
                              height="19.3433"
                              filterUnits="userSpaceOnUse"
                              colorInterpolationFilters="sRGB"
                            >
                              <feFlood floodOpacity="0" result="BackgroundImageFix" />
                              <feBlend
                                mode="normal"
                                in="SourceGraphic"
                                in2="BackgroundImageFix"
                                result="shape"
                              />
                              <feGaussianBlur
                                stdDeviation="1.37508"
                                result="effect1_foregroundBlur_127_17274"
                              />
                            </filter>
                            <filter
                              id="filter13_f_127_17274"
                              x="6.71762"
                              y="-0.49228"
                              width="16.4007"
                              height="19.3433"
                              filterUnits="userSpaceOnUse"
                              colorInterpolationFilters="sRGB"
                            >
                              <feFlood floodOpacity="0" result="BackgroundImageFix" />
                              <feBlend
                                mode="normal"
                                in="SourceGraphic"
                                in2="BackgroundImageFix"
                                result="shape"
                              />
                              <feGaussianBlur
                                stdDeviation="1.37508"
                                result="effect1_foregroundBlur_127_17274"
                              />
                            </filter>
                            <filter
                              id="filter14_f_127_17274"
                              x="9.84946"
                              y="3.39893"
                              width="11.7913"
                              height="13.0528"
                              filterUnits="userSpaceOnUse"
                              colorInterpolationFilters="sRGB"
                            >
                              <feFlood floodOpacity="0" result="BackgroundImageFix" />
                              <feBlend
                                mode="normal"
                                in="SourceGraphic"
                                in2="BackgroundImageFix"
                                result="shape"
                              />
                              <feGaussianBlur
                                stdDeviation="1.37508"
                                result="effect1_foregroundBlur_127_17274"
                              />
                            </filter>
                          </defs>
                        </svg>
                      </span>
                    </div>
                    <div
                      data-el="plateSub"
                      style={
                        {
                          fontFamily: "'JetBrains Mono',monospace",
                          fontSize: "12px",
                          color: "var(--mute)",
                          transition: "color .3s",
                        } satisfies LandingStyle
                      }
                    >
                      next build · next.js 16
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section
            id="speed"
            data-el="raceOuter"
            data-screen-label="Speed / benchmark race"
            style={{ position: "relative", zIndex: "2", padding: "64px 0" } satisfies LandingStyle}
          >
            <div
              style={
                { maxWidth: "1180px", margin: "0 auto", padding: "0 32px" } satisfies LandingStyle
              }
            >
              <div style={{ maxWidth: "820px" } satisfies LandingStyle}>
                <h2
                  data-rv=""
                  style={
                    {
                      opacity: "0",
                      transform: "translateY(24px)",
                      transition: "opacity var(--t),transform var(--t)",
                      transitionDelay: ".06s",
                      margin: "0",
                      fontFamily: "'Geist',system-ui,sans-serif",
                      fontWeight: "700",
                      fontSize: "clamp(32px,5.4vw,64px)",
                      lineHeight: "1.03",
                      letterSpacing: "-.03em",
                    } satisfies LandingStyle
                  }
                >
                  <span style={{ color: "var(--orange)" } satisfies LandingStyle}>
                    {buildMultiple} faster build time.
                  </span>
                </h2>{" "}
              </div>

              <div
                style={
                  {
                    marginTop: "48px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "24px",
                  } satisfies LandingStyle
                }
              >
                <div>
                  <div
                    style={
                      {
                        display: "flex",
                        alignItems: "baseline",
                        justifyContent: "space-between",
                        marginBottom: "10px",
                      } satisfies LandingStyle
                    }
                  >
                    <span
                      style={
                        {
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          fontFamily: "'JetBrains Mono',monospace",
                          fontSize: "14px",
                          color: "var(--ink)",
                        } satisfies LandingStyle
                      }
                    >
                      vinext
                      <span
                        data-el="vinextDone"
                        style={
                          {
                            opacity: "0",
                            transition: "opacity .3s",
                            fontSize: "11px",
                            color: "var(--ok)",
                            border: "1px solid rgba(70,211,154,.3)",
                            borderRadius: "999px",
                            padding: "2px 9px",
                          } satisfies LandingStyle
                        }
                      >
                        ✓ done
                      </span>
                    </span>
                    <span
                      data-el="vinextTime"
                      style={
                        {
                          fontFamily: "'JetBrains Mono',monospace",
                          fontSize: "22px",
                          fontWeight: "600",
                          color: "var(--orange)",
                          fontVariantNumeric: "tabular-nums",
                        } satisfies LandingStyle
                      }
                    >
                      0.0s
                    </span>
                  </div>
                  <div
                    style={
                      {
                        position: "relative",
                        height: "16px",
                        borderRadius: "999px",
                        background: "rgba(var(--ink-rgb),.05)",
                        overflow: "hidden",
                      } satisfies LandingStyle
                    }
                  >
                    <div
                      data-el="vinextFill"
                      style={
                        {
                          position: "absolute",
                          top: "0",
                          left: "0",
                          bottom: "0",
                          width: "100%",
                          transform: "scaleX(0)",
                          background: "linear-gradient(90deg,var(--orange),var(--amber))",
                          borderRadius: "999px",
                          boxShadow: "0 0 20px rgba(var(--orange-rgb),.4)",
                        } satisfies LandingStyle
                      }
                    />
                  </div>
                </div>
                <div>
                  <div
                    style={
                      {
                        display: "flex",
                        alignItems: "baseline",
                        justifyContent: "space-between",
                        marginBottom: "10px",
                      } satisfies LandingStyle
                    }
                  >
                    <span
                      style={
                        {
                          fontFamily: "'JetBrains Mono',monospace",
                          fontSize: "14px",
                          color: "var(--sub)",
                        } satisfies LandingStyle
                      }
                    >
                      Next.js 16 · turbopack
                    </span>
                    <span
                      data-el="nextTime"
                      style={
                        {
                          fontFamily: "'JetBrains Mono',monospace",
                          fontSize: "22px",
                          fontWeight: "600",
                          color: "var(--mute)",
                          fontVariantNumeric: "tabular-nums",
                        } satisfies LandingStyle
                      }
                    >
                      0.0s
                    </span>
                  </div>
                  <div
                    style={
                      {
                        position: "relative",
                        height: "16px",
                        borderRadius: "999px",
                        background: "rgba(var(--ink-rgb),.05)",
                        overflow: "hidden",
                      } satisfies LandingStyle
                    }
                  >
                    <div
                      data-el="nextFill"
                      style={
                        {
                          position: "absolute",
                          top: "0",
                          left: "0",
                          bottom: "0",
                          width: "100%",
                          transform: "scaleX(0)",
                          background: "linear-gradient(90deg,var(--next-bar-1),var(--next-bar-2))",
                          borderRadius: "999px",
                        } satisfies LandingStyle
                      }
                    />
                  </div>
                </div>
              </div>

              <div
                data-el="payoff"
                style={
                  {
                    opacity: "0",
                    transform: "translateY(16px)",
                    transition: "opacity .5s ease,transform .5s ease",
                    marginTop: "32px",
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "16px 40px",
                  } satisfies LandingStyle
                }
              >
                <div
                  style={
                    { display: "flex", alignItems: "center", gap: "14px" } satisfies LandingStyle
                  }
                >
                  <span
                    style={
                      {
                        fontFamily: "'Geist',system-ui,sans-serif",
                        fontWeight: "700",
                        fontSize: "clamp(48px,7vw,84px)",
                        lineHeight: "1",
                        letterSpacing: "-.03em",
                        color: "var(--orange)",
                        textShadow: "0 0 40px rgba(var(--orange-rgb),.3)",
                      } satisfies LandingStyle
                    }
                  >
                    {buildMultiple}
                  </span>
                  <span
                    style={
                      {
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: "13px",
                        color: "var(--sub)",
                        maxWidth: "16ch",
                        lineHeight: "1.4",
                      } satisfies LandingStyle
                    }
                  >
                    faster production builds
                  </span>
                </div>
                <div
                  style={
                    {
                      width: "1px",
                      height: "56px",
                      background: "var(--line-soft)",
                    } satisfies LandingStyle
                  }
                />
                <div
                  style={
                    { display: "flex", alignItems: "center", gap: "14px" } satisfies LandingStyle
                  }
                >
                  <span
                    style={
                      {
                        fontFamily: "'Geist',system-ui,sans-serif",
                        fontWeight: "700",
                        fontSize: "clamp(48px,7vw,84px)",
                        lineHeight: "1",
                        letterSpacing: "-.03em",
                        color: "var(--ink)",
                      } satisfies LandingStyle
                    }
                  >
                    ~{bundleReductionPct}%
                  </span>
                  <span
                    style={
                      {
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: "13px",
                        color: "var(--sub)",
                        maxWidth: "20ch",
                        lineHeight: "1.4",
                      } satisfies LandingStyle
                    }
                  >
                    smaller client bundle · {formatKb(stats.bundleBytes.nextjs)} → 
                    {formatKb(stats.bundleBytes.vinext)} gzipped
                  </span>
                </div>
                <a
                  className="text-link"
                  href="/benchmarks"
                  style={
                    {
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: "12px",
                      color: "var(--orange-soft)",
                      textDecoration: "none",
                      borderBottom: "1px solid transparent",
                      transition: "border-color .2s,color .2s",
                    } satisfies LandingStyle
                  }
                >
                  see live benchmarks
                </a>
              </div>
            </div>
          </section>
        </div>

        <section
          id="compat"
          data-screen-label="Compatibility"
          style={{ position: "relative", zIndex: "2", padding: "64px 0" } satisfies LandingStyle}
        >
          <div
            style={
              { maxWidth: "1180px", margin: "0 auto", padding: "0 32px" } satisfies LandingStyle
            }
          >
            <h2
              data-rv=""
              style={
                {
                  opacity: "0",
                  transform: "translateY(24px)",
                  transition: "opacity var(--t),transform var(--t)",
                  transitionDelay: ".06s",
                  margin: "0",
                  fontFamily: "'Geist',system-ui,sans-serif",
                  fontWeight: "700",
                  fontSize: "clamp(32px,5.4vw,64px)",
                  lineHeight: "1.03",
                  letterSpacing: "-.03em",
                  maxWidth: "20ch",
                } satisfies LandingStyle
              }
            >
              {stats.compatPassRate}% Next.JS API surface
            </h2>
            <div
              id="compatGrid"
              style={
                {
                  marginTop: "48px",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "24px",
                } satisfies LandingStyle
              }
            >
              <div
                data-rv=""
                style={
                  {
                    opacity: "0",
                    transform: "translateY(24px)",
                    transition: "opacity var(--t),transform var(--t)",
                    border: "1px solid var(--line)",
                    borderRadius: "16px",
                    background: "var(--surface)",
                    overflow: "hidden",
                  } satisfies LandingStyle
                }
              >
                <div
                  style={
                    {
                      padding: "16px 24px",
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: "11px",
                      color: "var(--mute)",
                      letterSpacing: ".06em",
                      textTransform: "uppercase",
                      borderBottom: "1px solid var(--line-soft)",
                    } satisfies LandingStyle
                  }
                >
                  Core routing &amp; components
                </div>
                <div
                  style={
                    {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "16px",
                      padding: "17px 24px",
                      borderBottom: "1px solid var(--line-soft)",
                    } satisfies LandingStyle
                  }
                >
                  <span style={{ fontSize: "15px", color: "var(--ink)" } satisfies LandingStyle}>
                    App Router
                    <small
                      style={
                        {
                          display: "block",
                          color: "var(--mute)",
                          fontSize: "11.5px",
                          marginTop: "4px",
                          fontFamily: "'JetBrains Mono',monospace",
                        } satisfies LandingStyle
                      }
                    >
                      layouts · server components · streaming
                    </small>
                  </span>
                  <span
                    style={
                      {
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: "12px",
                        color: "var(--ok)",
                        whiteSpace: "nowrap",
                      } satisfies LandingStyle
                    }
                  >
                    <span
                      style={
                        {
                          width: "7px",
                          height: "7px",
                          borderRadius: "50%",
                          background: "var(--ok)",
                        } satisfies LandingStyle
                      }
                    />
                    Supported
                  </span>
                </div>
                <div
                  style={
                    {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "16px",
                      padding: "17px 24px",
                      borderBottom: "1px solid var(--line-soft)",
                    } satisfies LandingStyle
                  }
                >
                  <span style={{ fontSize: "15px", color: "var(--ink)" } satisfies LandingStyle}>
                    Pages Router
                    <small
                      style={
                        {
                          display: "block",
                          color: "var(--mute)",
                          fontSize: "11.5px",
                          marginTop: "4px",
                          fontFamily: "'JetBrains Mono',monospace",
                        } satisfies LandingStyle
                      }
                    >
                      getServerSideProps · API routes
                    </small>
                  </span>
                  <span
                    style={
                      {
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: "12px",
                        color: "var(--ok)",
                        whiteSpace: "nowrap",
                      } satisfies LandingStyle
                    }
                  >
                    <span
                      style={
                        {
                          width: "7px",
                          height: "7px",
                          borderRadius: "50%",
                          background: "var(--ok)",
                        } satisfies LandingStyle
                      }
                    />
                    Supported
                  </span>
                </div>
                <div
                  style={
                    {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "16px",
                      padding: "17px 24px",
                      borderBottom: "1px solid var(--line-soft)",
                    } satisfies LandingStyle
                  }
                >
                  <span style={{ fontSize: "15px", color: "var(--ink)" } satisfies LandingStyle}>
                    React Server Components
                  </span>
                  <span
                    style={
                      {
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: "12px",
                        color: "var(--ok)",
                        whiteSpace: "nowrap",
                      } satisfies LandingStyle
                    }
                  >
                    <span
                      style={
                        {
                          width: "7px",
                          height: "7px",
                          borderRadius: "50%",
                          background: "var(--ok)",
                        } satisfies LandingStyle
                      }
                    />
                    Supported
                  </span>
                </div>
                <div
                  style={
                    {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "16px",
                      padding: "17px 24px",
                      borderBottom: "1px solid var(--line-soft)",
                    } satisfies LandingStyle
                  }
                >
                  <span style={{ fontSize: "15px", color: "var(--ink)" } satisfies LandingStyle}>
                    Server Actions
                  </span>
                  <span
                    style={
                      {
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: "12px",
                        color: "var(--ok)",
                        whiteSpace: "nowrap",
                      } satisfies LandingStyle
                    }
                  >
                    <span
                      style={
                        {
                          width: "7px",
                          height: "7px",
                          borderRadius: "50%",
                          background: "var(--ok)",
                        } satisfies LandingStyle
                      }
                    />
                    Supported
                  </span>
                </div>
                <div
                  style={
                    {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "16px",
                      padding: "17px 24px",
                    } satisfies LandingStyle
                  }
                >
                  <span style={{ fontSize: "15px", color: "var(--ink)" } satisfies LandingStyle}>
                    next/font
                    <small
                      style={
                        {
                          display: "block",
                          color: "var(--mute)",
                          fontSize: "11.5px",
                          marginTop: "4px",
                          fontFamily: "'JetBrains Mono',monospace",
                        } satisfies LandingStyle
                      }
                    >
                      local &amp; Google fonts
                    </small>
                  </span>
                  <span
                    style={
                      {
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: "12px",
                        color: "var(--ok)",
                        whiteSpace: "nowrap",
                      } satisfies LandingStyle
                    }
                  >
                    <span
                      style={
                        {
                          width: "7px",
                          height: "7px",
                          borderRadius: "50%",
                          background: "var(--ok)",
                        } satisfies LandingStyle
                      }
                    />
                    Supported
                  </span>
                </div>
              </div>
              <div
                data-rv=""
                style={
                  {
                    opacity: "0",
                    transform: "translateY(24px)",
                    transition: "opacity var(--t),transform var(--t)",
                    transitionDelay: ".08s",
                    border: "1px solid var(--line)",
                    borderRadius: "16px",
                    background: "var(--surface)",
                    overflow: "hidden",
                  } satisfies LandingStyle
                }
              >
                <div
                  style={
                    {
                      padding: "16px 24px",
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: "11px",
                      color: "var(--mute)",
                      letterSpacing: ".06em",
                      textTransform: "uppercase",
                      borderBottom: "1px solid var(--line-soft)",
                    } satisfies LandingStyle
                  }
                >
                  Advanced tooling &amp; optimization
                </div>
                <div
                  style={
                    {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "16px",
                      padding: "17px 24px",
                      borderBottom: "1px solid var(--line-soft)",
                    } satisfies LandingStyle
                  }
                >
                  <span style={{ fontSize: "15px", color: "var(--ink)" } satisfies LandingStyle}>
                    Middleware
                    <small
                      style={
                        {
                          display: "block",
                          color: "var(--mute)",
                          fontSize: "11.5px",
                          marginTop: "4px",
                          fontFamily: "'JetBrains Mono',monospace",
                        } satisfies LandingStyle
                      }
                    >
                      rewrites · headers · redirects
                    </small>
                  </span>
                  <span
                    style={
                      {
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: "12px",
                        color: "var(--ok)",
                        whiteSpace: "nowrap",
                      } satisfies LandingStyle
                    }
                  >
                    <span
                      style={
                        {
                          width: "7px",
                          height: "7px",
                          borderRadius: "50%",
                          background: "var(--ok)",
                        } satisfies LandingStyle
                      }
                    />
                    Supported
                  </span>
                </div>
                <div
                  style={
                    {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "16px",
                      padding: "17px 24px",
                      borderBottom: "1px solid var(--line-soft)",
                    } satisfies LandingStyle
                  }
                >
                  <span style={{ fontSize: "15px", color: "var(--ink)" } satisfies LandingStyle}>
                    ISR / revalidate
                  </span>
                  <span
                    style={
                      {
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: "12px",
                        color: "var(--ok)",
                        whiteSpace: "nowrap",
                      } satisfies LandingStyle
                    }
                  >
                    <span
                      style={
                        {
                          width: "7px",
                          height: "7px",
                          borderRadius: "50%",
                          background: "var(--ok)",
                        } satisfies LandingStyle
                      }
                    />
                    Supported
                  </span>
                </div>
                <div
                  style={
                    {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "16px",
                      padding: "17px 24px",
                      borderBottom: "1px solid var(--line-soft)",
                    } satisfies LandingStyle
                  }
                >
                  <span style={{ fontSize: "15px", color: "var(--ink)" } satisfies LandingStyle}>
                    Parallel &amp; intercepting routes
                  </span>
                  <span
                    style={
                      {
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: "12px",
                        color: "var(--ok)",
                        whiteSpace: "nowrap",
                      } satisfies LandingStyle
                    }
                  >
                    <span
                      style={
                        {
                          width: "7px",
                          height: "7px",
                          borderRadius: "50%",
                          background: "var(--ok)",
                        } satisfies LandingStyle
                      }
                    />
                    Supported
                  </span>
                </div>
                <div
                  style={
                    {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "16px",
                      padding: "17px 24px",
                      borderBottom: "1px solid var(--line-soft)",
                    } satisfies LandingStyle
                  }
                >
                  <span style={{ fontSize: "15px", color: "var(--ink)" } satisfies LandingStyle}>
                    Image optimization
                    <small
                      style={
                        {
                          display: "block",
                          color: "var(--mute)",
                          fontSize: "11.5px",
                          marginTop: "4px",
                          fontFamily: "'JetBrains Mono',monospace",
                        } satisfies LandingStyle
                      }
                    >
                      Cloudflare Images
                    </small>
                  </span>
                  <span
                    style={
                      {
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: "12px",
                        color: "var(--ok)",
                        whiteSpace: "nowrap",
                      } satisfies LandingStyle
                    }
                  >
                    <span
                      style={
                        {
                          width: "7px",
                          height: "7px",
                          borderRadius: "50%",
                          background: "var(--ok)",
                        } satisfies LandingStyle
                      }
                    />
                    Supported
                  </span>
                </div>
                <div
                  style={
                    {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "16px",
                      padding: "17px 24px",
                    } satisfies LandingStyle
                  }
                >
                  <span style={{ fontSize: "15px", color: "var(--ink)" } satisfies LandingStyle}>
                    Traffic-aware Pre-Rendering
                    <small
                      style={
                        {
                          display: "block",
                          color: "var(--mute)",
                          fontSize: "11.5px",
                          marginTop: "4px",
                          fontFamily: "'JetBrains Mono',monospace",
                        } satisfies LandingStyle
                      }
                    >
                      zone analytics at deploy time
                    </small>
                  </span>
                  <span
                    style={
                      {
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: "12px",
                        color: "var(--partial)",
                        whiteSpace: "nowrap",
                      } satisfies LandingStyle
                    }
                  >
                    <span
                      style={
                        {
                          width: "7px",
                          height: "7px",
                          borderRadius: "50%",
                          border: "1.4px solid var(--partial)",
                        } satisfies LandingStyle
                      }
                    />
                    Experimental
                  </span>
                </div>
              </div>
            </div>
            <a
              className="text-link"
              href="/compatibility"
              style={
                {
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: "12px",
                  color: "var(--orange-soft)",
                  textDecoration: "none",
                  borderBottom: "1px solid transparent",
                  transition: "border-color .2s,color .2s",
                } satisfies LandingStyle
              }
            >
              full compatibility report
            </a>
          </div>
        </section>

        <section
          id="deploy"
          data-screen-label="Deploy anywhere"
          style={
            {
              position: "relative",
              zIndex: "2",
              padding: "64px 0",
              overflow: "hidden",
            } satisfies LandingStyle
          }
        >
          <div
            data-el="globe"
            aria-hidden="true"
            style={
              {
                position: "absolute",
                left: "44vw",
                bottom: "-6vw",
                width: "58vw",
                pointerEvents: "none",
                userSelect: "none",
                willChange: "transform",
              } satisfies LandingStyle
            }
          >
            <img className="globe-art" src="/img/globe.svg" alt="" loading="lazy" />

            <div
              data-gpin=""
              style={
                {
                  position: "absolute",
                  left: "47.9%",
                  top: "28%",
                  width: "12px",
                  height: "12px",
                  opacity: "0",
                  transform: "translateY(12px) scale(.8)",
                  transition: "opacity .6s ease .15s,transform .7s cubic-bezier(.2,1,.25,1) .15s",
                } satisfies LandingStyle
              }
            >
              <span
                style={
                  {
                    position: "absolute",
                    inset: "0",
                    borderRadius: "50%",
                    background: "var(--orange)",
                    boxShadow:
                      "0 0 0 3px rgba(var(--bg-rgb),.7),0 0 0 5px rgba(var(--orange-rgb),.55),0 0 18px var(--orange-glow-hover)",
                  } satisfies LandingStyle
                }
              />
              <span
                style={
                  {
                    position: "absolute",
                    left: "8px",
                    bottom: "14px",
                    width: "46px",
                    height: "46px",
                    borderRadius: "13px",
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    boxShadow: "var(--pin-shadow)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  } satisfies LandingStyle
                }
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="#f38020">
                  <path d="M16.5088 16.8447c.1475-.5068.0908-.9707-.1553-1.3154-.2246-.3164-.6045-.499-1.0615-.5205l-8.6592-.1123a.1559.1559 0 0 1-.1333-.0713c-.0283-.042-.0351-.0986-.021-.1553.0278-.084.1123-.1484.2036-.1562l8.7359-.1123c1.0351-.0489 2.1601-.8868 2.5537-1.9136l.499-1.3013c.0215-.0561.0293-.1128.0147-.168-.5625-2.5463-2.835-4.4453-5.5499-4.4453-2.5039 0-4.6284 1.6177-5.3876 3.8614-.4927-.3658-1.1187-.5625-1.794-.499-1.2026.119-2.1665 1.083-2.2861 2.2856-.0283.31-.0069.6128.0635.894C1.5683 13.171 0 14.7754 0 16.752c0 .1748.0142.3515.0352.5273.0141.083.0844.1475.1689.1475h15.9814c.0909 0 .1758-.0645.2032-.1553l.12-.4268zm2.7568-5.5634c-.0771 0-.1611 0-.2383.0112-.0566 0-.1054.0415-.127.0976l-.3378 1.1744c-.1475.5068-.0918.9707.1543 1.3164.2256.3164.6055.498 1.0625.5195l1.8437.1133c.0557 0 .1055.0263.1329.0703.0283.043.0351.1074.0214.1562-.0283.084-.1132.1485-.204.1553l-1.921.1123c-1.041.0488-2.1582.8867-2.5527 1.914l-.1406.3585c-.0283.0713.0215.1416.0986.1416h6.5977c.0771 0 .1474-.0489.169-.126.1122-.4082.1757-.837.1757-1.2803 0-2.6025-2.125-4.727-4.7344-4.727" />
                </svg>
              </span>
            </div>
            <div
              data-gpin=""
              style={
                {
                  position: "absolute",
                  left: "88.6%",
                  top: "40.6%",
                  width: "12px",
                  height: "12px",
                  opacity: "0",
                  transform: "translateY(12px) scale(.8)",
                  transition: "opacity .6s ease .3s,transform .7s cubic-bezier(.2,1,.25,1) .3s",
                } satisfies LandingStyle
              }
            >
              <span
                style={
                  {
                    position: "absolute",
                    inset: "0",
                    borderRadius: "50%",
                    background: "var(--orange)",
                    boxShadow:
                      "0 0 0 3px rgba(var(--bg-rgb),.7),0 0 0 5px rgba(var(--orange-rgb),.55),0 0 18px var(--orange-glow-hover)",
                  } satisfies LandingStyle
                }
              />

              <span
                style={
                  {
                    position: "absolute",
                    right: "8px",
                    bottom: "14px",
                    width: "46px",
                    height: "46px",
                    borderRadius: "13px",
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    boxShadow: "var(--pin-shadow)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  } satisfies LandingStyle
                }
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="currentColor"
                >
                  <path d="m12 1.608 12 20.784H0Z" />
                </svg>
              </span>
            </div>
            <div
              data-gpin=""
              style={
                {
                  position: "absolute",
                  left: "72.5%",
                  top: "62.6%",
                  width: "12px",
                  height: "12px",
                  opacity: "0",
                  transform: "translateY(12px) scale(.8)",
                  transition: "opacity .6s ease .45s,transform .7s cubic-bezier(.2,1,.25,1) .45s",
                } satisfies LandingStyle
              }
            >
              <span
                style={
                  {
                    position: "absolute",
                    inset: "0",
                    borderRadius: "50%",
                    background: "var(--orange)",
                    boxShadow:
                      "0 0 0 3px rgba(var(--bg-rgb),.7),0 0 0 5px rgba(var(--orange-rgb),.55),0 0 18px var(--orange-glow-hover)",
                  } satisfies LandingStyle
                }
              />
              <span
                style={
                  {
                    position: "absolute",
                    left: "8px",
                    bottom: "14px",
                    width: "46px",
                    height: "46px",
                    borderRadius: "13px",
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    boxShadow: "var(--pin-shadow)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  } satisfies LandingStyle
                }
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" width="23" height="23" fill="#00c7b7">
                  <path d="M6.49 19.04h-.23L5.13 17.9v-.23l1.73-1.71h1.2l.15.15v1.2L6.5 19.04ZM5.13 6.31V6.1l1.13-1.13h.23L8.2 6.68v1.2l-.15.15h-1.2L5.13 6.31Zm9.96 9.09h-1.65l-.14-.13v-3.83c0-.68-.27-1.2-1.1-1.23-.42 0-.9 0-1.43.02l-.07.08v4.96l-.14.14H8.9l-.13-.14V8.73l.13-.14h3.7a2.6 2.6 0 0 1 2.61 2.6v4.08l-.13.14Zm-8.37-2.44H.14L0 12.82v-1.64l.14-.14h6.58l.14.14v1.64l-.14.14Zm17.14 0h-6.58l-.14-.14v-1.64l.14-.14h6.58l.14.14v1.64l-.14.14ZM11.05 6.55V1.64l.14-.14h1.65l.14.14v4.9l-.14.14h-1.65l-.14-.13Zm0 15.81v-4.9l.14-.14h1.65l.14.13v4.91l-.14.14h-1.65l-.14-.14Z" />
                </svg>
              </span>
            </div>

            <div
              data-gpin=""
              style={
                {
                  position: "absolute",
                  left: "78%",
                  top: "20%",
                  width: "12px",
                  height: "12px",
                  opacity: "0",
                  transform: "translateY(12px) scale(.8)",
                  transition: "opacity .6s ease .6s,transform .7s cubic-bezier(.2,1,.25,1) .6s",
                } satisfies LandingStyle
              }
            >
              <span
                style={
                  {
                    position: "absolute",
                    inset: "0",
                    borderRadius: "50%",
                    background: "var(--orange)",
                    boxShadow:
                      "0 0 0 3px rgba(var(--bg-rgb),.7),0 0 0 5px rgba(var(--orange-rgb),.55),0 0 18px var(--orange-glow-hover)",
                  } satisfies LandingStyle
                }
              />
              <span
                style={
                  {
                    position: "absolute",
                    left: "8px",
                    bottom: "14px",
                    width: "46px",
                    height: "46px",
                    borderRadius: "13px",
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    boxShadow: "var(--pin-shadow)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  } satisfies LandingStyle
                }
              >
                <span
                  aria-hidden="true"
                  style={
                    {
                      font: "600 22px/1 'JetBrains Mono',monospace",
                      color: "#ff9900",
                    } satisfies LandingStyle
                  }
                >
                  λ
                </span>
              </span>
            </div>
            <div
              data-gpin=""
              style={
                {
                  position: "absolute",
                  left: "26%",
                  top: "57%",
                  width: "12px",
                  height: "12px",
                  opacity: "0",
                  transform: "translateY(12px) scale(.8)",
                  transition: "opacity .6s ease .75s,transform .7s cubic-bezier(.2,1,.25,1) .75s",
                } satisfies LandingStyle
              }
            >
              <span
                style={
                  {
                    position: "absolute",
                    inset: "0",
                    borderRadius: "50%",
                    background: "var(--orange)",
                    boxShadow:
                      "0 0 0 3px rgba(var(--bg-rgb),.7),0 0 0 5px rgba(var(--orange-rgb),.55),0 0 18px var(--orange-glow-hover)",
                  } satisfies LandingStyle
                }
              />
              <span
                style={
                  {
                    position: "absolute",
                    left: "8px",
                    bottom: "14px",
                    width: "46px",
                    height: "46px",
                    borderRadius: "13px",
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    boxShadow: "var(--pin-shadow)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  } satisfies LandingStyle
                }
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="currentColor"
                >
                  <path d="M1.105 18.02A11.9 11.9 0 0 1 0 12.985q0-.698.078-1.376a12 12 0 0 1 .231-1.34A12 12 0 0 1 4.025 4.02a12 12 0 0 1 5.46-2.771 12 12 0 0 1 3.428-.23c1.452.112 2.825.477 4.077 1.05a12 12 0 0 1 2.78 1.774 12.02 12.02 0 0 1 4.053 7.078A12 12 0 0 1 24 12.985q0 .454-.036.914a12 12 0 0 1-.728 3.305 12 12 0 0 1-2.38 3.875c-1.33 1.357-3.02 1.962-4.43 1.936a4.4 4.4 0 0 1-2.724-1.024c-.99-.853-1.391-1.83-1.53-2.919a5 5 0 0 1 .128-1.518c.105-.38.37-1.116.76-1.437-.455-.197-1.04-.624-1.226-.829-.045-.05-.04-.13 0-.183a.155.155 0 0 1 .177-.053c.392.134.869.267 1.372.35.66.111 1.484.25 2.317.292 2.03.1 4.153-.813 4.812-2.627s.403-3.609-1.96-4.685-3.454-2.356-5.363-3.128c-1.247-.505-2.636-.205-4.06.582-3.838 2.121-7.277 8.822-5.69 15.032a.191.191 0 0 1-.315.19 12 12 0 0 1-1.25-1.634 12 12 0 0 1-.769-1.404M11.57 6.087c.649-.051 1.214.501 1.31 1.236.13.979-.228 1.99-1.41 2.013-1.01.02-1.315-.997-1.248-1.614.066-.616.574-1.575 1.35-1.635" />
                </svg>
              </span>
            </div>
            <div
              data-gpin=""
              style={
                {
                  position: "absolute",
                  left: "44%",
                  top: "66%",
                  width: "12px",
                  height: "12px",
                  opacity: "0",
                  transform: "translateY(12px) scale(.8)",
                  transition: "opacity .6s ease .9s,transform .7s cubic-bezier(.2,1,.25,1) .9s",
                } satisfies LandingStyle
              }
            >
              <span
                style={
                  {
                    position: "absolute",
                    inset: "0",
                    borderRadius: "50%",
                    background: "var(--orange)",
                    boxShadow:
                      "0 0 0 3px rgba(var(--bg-rgb),.7),0 0 0 5px rgba(var(--orange-rgb),.55),0 0 18px var(--orange-glow-hover)",
                  } satisfies LandingStyle
                }
              />
              <span
                style={
                  {
                    position: "absolute",
                    left: "8px",
                    bottom: "14px",
                    width: "46px",
                    height: "46px",
                    borderRadius: "13px",
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    boxShadow: "var(--pin-shadow)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  } satisfies LandingStyle
                }
              >
                <img
                  src="/img/brand-nodedotjs.svg"
                  alt=""
                  aria-hidden="true"
                  width="22"
                  height="22"
                  style={{ display: "block" } satisfies LandingStyle}
                />
              </span>
            </div>
          </div>
          <div
            style={
              {
                position: "relative",
                maxWidth: "1180px",
                margin: "0 auto",
                padding: "0 32px",
              } satisfies LandingStyle
            }
          >
            <h2
              data-rv=""
              style={
                {
                  opacity: "0",
                  transform: "translateY(24px)",
                  transition: "opacity var(--t),transform var(--t)",
                  transitionDelay: ".06s",
                  margin: "0",
                  fontFamily: "'Geist',system-ui,sans-serif",
                  fontWeight: "700",
                  fontSize: "clamp(32px,5.4vw,64px)",
                  lineHeight: "1.03",
                  letterSpacing: "-.03em",
                } satisfies LandingStyle
              }
            >
              <span style={{ color: "var(--orange)" } satisfies LandingStyle}>
                Deploy anywhere.
              </span>
            </h2>
            <p
              data-rv=""
              style={
                {
                  opacity: "0",
                  transform: "translateY(24px)",
                  transition: "opacity var(--t),transform var(--t)",
                  transitionDelay: ".12s",
                  margin: "24px 0 0",
                  maxWidth: "52ch",
                  fontSize: "16.5px",
                  lineHeight: "1.65",
                  color: "var(--ink-sub)",
                } satisfies LandingStyle
              }
            >
              vinext emits a standard server build. Cloudflare Workers is first-class; everything
              else runs through Nitro adapters.
            </p>

            <div
              data-el="deployGrid"
              data-rv=""
              style={
                {
                  opacity: "0",
                  transform: "translateY(24px)",
                  transition: "opacity var(--t),transform var(--t)",
                  transitionDelay: ".16s",
                  marginTop: "48px",
                  maxWidth: "520px",
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: "13.5px",
                } satisfies LandingStyle
              }
            >
              <div
                style={
                  {
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "0 2px 10px",
                    fontSize: "10.5px",
                    letterSpacing: ".16em",
                    textTransform: "uppercase",
                    color: "var(--mute)",
                  } satisfies LandingStyle
                }
              >
                <span>target</span>
                <span>status</span>
              </div>
              <div
                data-el="dcell"
                style={
                  {
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: "14px",
                    padding: "13px 2px",
                    borderTop: "1px solid var(--line-soft)",
                  } satisfies LandingStyle
                }
              >
                <span
                  data-name=""
                  style={{ color: "var(--sub)", transition: "color .5s" } satisfies LandingStyle}
                >
                  <img
                    src="/img/brand-cloudflare.svg"
                    alt=""
                    aria-hidden="true"
                    width="15"
                    height="15"
                    style={{ marginRight: "11px", verticalAlign: "-2px" } satisfies LandingStyle}
                  />
                  Cloudflare Workers
                </span>
                <span
                  data-tag=""
                  style={{ color: "var(--ok)", transition: "color .5s" } satisfies LandingStyle}
                >
                  first-class
                </span>
              </div>
              <div
                data-el="dcell"
                style={
                  {
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: "14px",
                    padding: "13px 2px",
                    borderTop: "1px solid var(--line-soft)",
                  } satisfies LandingStyle
                }
              >
                <span
                  data-name=""
                  style={{ color: "var(--sub)", transition: "color .5s" } satisfies LandingStyle}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    width="13"
                    height="13"
                    fill="currentColor"
                    style={{ marginRight: "11px", verticalAlign: "-1px" } satisfies LandingStyle}
                  >
                    <path d="m12 1.608 12 20.784H0Z" />
                  </svg>
                  Vercel
                </span>
                <span
                  data-tag=""
                  style={{ color: "var(--mute)", transition: "color .5s" } satisfies LandingStyle}
                >
                  adapter
                </span>
              </div>
              <div
                data-el="dcell"
                style={
                  {
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: "14px",
                    padding: "13px 2px",
                    borderTop: "1px solid var(--line-soft)",
                  } satisfies LandingStyle
                }
              >
                <span
                  data-name=""
                  style={{ color: "var(--sub)", transition: "color .5s" } satisfies LandingStyle}
                >
                  <img
                    src="/img/brand-netlify.svg"
                    alt=""
                    aria-hidden="true"
                    width="14"
                    height="14"
                    style={{ marginRight: "11px", verticalAlign: "-2px" } satisfies LandingStyle}
                  />
                  Netlify
                </span>
                <span
                  data-tag=""
                  style={{ color: "var(--mute)", transition: "color .5s" } satisfies LandingStyle}
                >
                  adapter
                </span>
              </div>
              <div
                data-el="dcell"
                style={
                  {
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: "14px",
                    padding: "13px 2px",
                    borderTop: "1px solid var(--line-soft)",
                  } satisfies LandingStyle
                }
              >
                <span
                  data-name=""
                  style={{ color: "var(--sub)", transition: "color .5s" } satisfies LandingStyle}
                >
                  <span
                    aria-hidden="true"
                    style={
                      {
                        display: "inline-block",
                        width: "15px",
                        marginRight: "11px",
                        fontWeight: "600",
                        textAlign: "center",
                        color: "#ff9900",
                      } satisfies LandingStyle
                    }
                  >
                    λ
                  </span>
                  AWS Lambda
                </span>
                <span
                  data-tag=""
                  style={{ color: "var(--mute)", transition: "color .5s" } satisfies LandingStyle}
                >
                  adapter
                </span>
              </div>
              <div
                data-el="dcell"
                style={
                  {
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: "14px",
                    padding: "13px 2px",
                    borderTop: "1px solid var(--line-soft)",
                  } satisfies LandingStyle
                }
              >
                <span
                  data-name=""
                  style={{ color: "var(--sub)", transition: "color .5s" } satisfies LandingStyle}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="currentColor"
                    style={{ marginRight: "11px", verticalAlign: "-2px" } satisfies LandingStyle}
                  >
                    <path d="M1.105 18.02A11.9 11.9 0 0 1 0 12.985q0-.698.078-1.376a12 12 0 0 1 .231-1.34A12 12 0 0 1 4.025 4.02a12 12 0 0 1 5.46-2.771 12 12 0 0 1 3.428-.23c1.452.112 2.825.477 4.077 1.05a12 12 0 0 1 2.78 1.774 12.02 12.02 0 0 1 4.053 7.078A12 12 0 0 1 24 12.985q0 .454-.036.914a12 12 0 0 1-.728 3.305 12 12 0 0 1-2.38 3.875c-1.33 1.357-3.02 1.962-4.43 1.936a4.4 4.4 0 0 1-2.724-1.024c-.99-.853-1.391-1.83-1.53-2.919a5 5 0 0 1 .128-1.518c.105-.38.37-1.116.76-1.437-.455-.197-1.04-.624-1.226-.829-.045-.05-.04-.13 0-.183a.155.155 0 0 1 .177-.053c.392.134.869.267 1.372.35.66.111 1.484.25 2.317.292 2.03.1 4.153-.813 4.812-2.627s.403-3.609-1.96-4.685-3.454-2.356-5.363-3.128c-1.247-.505-2.636-.205-4.06.582-3.838 2.121-7.277 8.822-5.69 15.032a.191.191 0 0 1-.315.19 12 12 0 0 1-1.25-1.634 12 12 0 0 1-.769-1.404M11.57 6.087c.649-.051 1.214.501 1.31 1.236.13.979-.228 1.99-1.41 2.013-1.01.02-1.315-.997-1.248-1.614.066-.616.574-1.575 1.35-1.635" />
                  </svg>
                  Deno Deploy
                </span>
                <span
                  data-tag=""
                  style={{ color: "var(--mute)", transition: "color .5s" } satisfies LandingStyle}
                >
                  adapter
                </span>
              </div>
              <div
                data-el="dcell"
                style={
                  {
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: "14px",
                    padding: "13px 2px",
                    borderTop: "1px solid var(--line-soft)",
                    borderBottom: "1px solid var(--line-soft)",
                  } satisfies LandingStyle
                }
              >
                <span
                  data-name=""
                  style={{ color: "var(--sub)", transition: "color .5s" } satisfies LandingStyle}
                >
                  <img
                    src="/img/brand-nodedotjs.svg"
                    alt=""
                    aria-hidden="true"
                    width="15"
                    height="15"
                    style={{ marginRight: "11px", verticalAlign: "-2px" } satisfies LandingStyle}
                  />
                  Node (standalone)
                </span>
                <span
                  data-tag=""
                  style={{ color: "var(--mute)", transition: "color .5s" } satisfies LandingStyle}
                >
                  adapter
                </span>
              </div>
            </div>
          </div>
        </section>

        <section
          id="start"
          data-screen-label="Get started"
          style={
            { position: "relative", zIndex: "2", padding: "64px 0 96px" } satisfies LandingStyle
          }
        >
          <div
            style={
              { maxWidth: "1180px", margin: "0 auto", padding: "0 32px" } satisfies LandingStyle
            }
          >
            <h2
              data-rv=""
              style={
                {
                  opacity: "0",
                  transform: "translateY(24px)",
                  transition: "opacity var(--t),transform var(--t)",
                  transitionDelay: ".06s",
                  margin: "0",
                  fontFamily: "'Geist',system-ui,sans-serif",
                  fontWeight: "700",
                  fontSize: "clamp(32px,5.4vw,64px)",
                  lineHeight: "1.03",
                  letterSpacing: "-.03em",
                } satisfies LandingStyle
              }
            >
              Migrate in one command.
            </h2>
            <p
              data-rv=""
              style={
                {
                  opacity: "0",
                  transform: "translateY(24px)",
                  transition: "opacity var(--t),transform var(--t)",
                  transitionDelay: ".12s",
                  margin: "24px 0 0",
                  maxWidth: "52ch",
                  fontSize: "16.5px",
                  lineHeight: "1.65",
                  color: "var(--ink-sub)",
                } satisfies LandingStyle
              }
            >
              Run{" "}
              <code
                style={
                  {
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: ".85em",
                    background: "rgba(var(--ink-rgb),.06)",
                    padding: "1px 6px",
                    borderRadius: "5px",
                    color: "var(--orange-soft)",
                  } satisfies LandingStyle
                }
              >
                npx vinext init
              </code>
              . It installs vinext, writes your Vite config, and adds the scripts. Your{" "}
              <code
                style={
                  {
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: ".85em",
                    background: "rgba(var(--ink-rgb),.06)",
                    padding: "1px 6px",
                    borderRadius: "5px",
                    color: "var(--orange-soft)",
                  } satisfies LandingStyle
                }
              >
                next.config.js
              </code>{" "}
              is read as-is.
            </p>

            <div
              data-rv=""
              style={
                {
                  opacity: "0",
                  transform: "translateY(24px)",
                  transition: "opacity var(--t),transform var(--t)",
                  transitionDelay: ".16s",
                  marginTop: "32px",
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  maxWidth: "460px",
                  padding: "16px 18px",
                  border: "1px solid var(--line)",
                  borderRadius: "12px",
                  background: "var(--surface)",
                } satisfies LandingStyle
              }
            >
              <span
                style={
                  {
                    flex: "none",
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: "14px",
                    color: "var(--mute)",
                  } satisfies LandingStyle
                }
              >
                $
              </span>
              <code
                style={
                  {
                    flex: "1",
                    minWidth: "0",
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: "14px",
                    letterSpacing: "-.01em",
                    color: "var(--ink)",
                    overflowX: "auto",
                  } satisfies LandingStyle
                }
              >
                npx vinext init
              </code>
              <button
                className="text-link"
                data-copy="npx vinext init"
                aria-label="Copy command"
                aria-live="polite"
                style={
                  {
                    flex: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: "78px",
                    fontFamily: "'JetBrains Mono',monospace",
                    color: "var(--mute)",
                    fontSize: "10.5px",
                    letterSpacing: ".1em",
                    textTransform: "uppercase",
                    padding: "7px 13px",
                    borderRadius: "8px",
                    border: "1px solid var(--line-soft)",
                    background: "none",
                    cursor: "pointer",
                    transition: "color .2s,border-color .2s,background .2s",
                  } satisfies LandingStyle
                }
              >
                copy
              </button>
            </div>

            <div
              data-rv=""
              style={
                {
                  opacity: "0",
                  transform: "translateY(24px)",
                  transition: "opacity var(--t),transform var(--t)",
                  position: "relative",
                  overflow: "hidden",
                  marginTop: "24px",
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  gap: "32px",
                  border: "1px solid var(--line)",
                  borderRadius: "18px",
                  padding: "38px",
                  background:
                    "radial-gradient(130% 200% at 100% 0,rgba(var(--orange-rgb),.1),transparent 55%),var(--surface)",
                } satisfies LandingStyle
              }
            >
              <div style={{ minWidth: "0" } satisfies LandingStyle}>
                <p
                  style={
                    {
                      margin: "0",
                      fontFamily: "'Geist',system-ui,sans-serif",
                      fontWeight: "700",
                      fontSize: "clamp(22px,2.8vw,32px)",
                      lineHeight: "1.25",
                      letterSpacing: "-.02em",
                      maxWidth: "22ch",
                      color: "var(--ink)",
                    } satisfies LandingStyle
                  }
                >
                  Try it on a branch. If something breaks, open an issue.
                </p>
                <div
                  style={
                    {
                      marginTop: "24px",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "24px",
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: "13px",
                    } satisfies LandingStyle
                  }
                >
                  <a
                    className="text-link"
                    href="https://github.com/cloudflare/vinext#quick-start"
                    style={
                      {
                        color: "var(--orange-soft)",
                        textDecoration: "none",
                        borderBottom: "1px solid transparent",
                        transition: "border-color .2s,color .2s",
                      } satisfies LandingStyle
                    }
                  >
                    Quick start
                  </a>
                  <a
                    className="text-link"
                    href="https://github.com/cloudflare/vinext"
                    style={
                      {
                        color: "var(--orange-soft)",
                        textDecoration: "none",
                        borderBottom: "1px solid transparent",
                        transition: "border-color .2s,color .2s",
                      } satisfies LandingStyle
                    }
                  >
                    GitHub
                  </a>
                  <a
                    className="subtle-link"
                    href="https://discord.cloudflare.com/"
                    style={
                      {
                        color: "var(--sub)",
                        textDecoration: "none",
                        transition: "color .2s",
                      } satisfies LandingStyle
                    }
                  >
                    Discord
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
