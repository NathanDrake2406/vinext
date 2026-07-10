import { formatUtcDateTime } from "../../benchmarks/components/format";
import type { LandingStats } from "../../lib/landing-stats";
import { provenanceStyle, type LandingStyle } from "./landing-styles";

export function CompatibilitySection({ stats }: { stats: LandingStats }) {
  const source = stats.provenance.compatibility;
  const compatibilityProvenance =
    source.source === "live"
      ? `Latest deploy-suite run${source.commitSha ? ` · commit ${source.commitSha.slice(0, 7)}` : ""} · ${formatUtcDateTime(source.measuredAt)}`
      : "Reference snapshot · live deploy-suite data unavailable";

  return (
    <section
      id="compat"
      data-screen-label="Compatibility"
      style={{ position: "relative", zIndex: "2", padding: "64px 0" } satisfies LandingStyle}
    >
      <div
        style={{ maxWidth: "1180px", margin: "0 auto", padding: "0 32px" } satisfies LandingStyle}
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
          {stats.compatPassRate}% deploy-suite test pass rate
        </h2>
        <p data-rv="" style={provenanceStyle}>
          {compatibilityProvenance}
        </p>
        <div
          id="compatGrid"
          style={
            {
              marginTop: "40px",
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
                  padding: "16px 24px",
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
                  padding: "16px 24px",
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
                  padding: "16px 24px",
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
                  padding: "16px 24px",
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
                  padding: "16px 24px",
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
                  padding: "16px 24px",
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
                  padding: "16px 24px",
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
                  padding: "16px 24px",
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
                  padding: "16px 24px",
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
                  padding: "16px 24px",
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
              display: "inline-block",
              marginTop: "48px",
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: "12px",
              textDecoration: "none",
            } satisfies LandingStyle
          }
        >
          full compatibility report
        </a>
      </div>
    </section>
  );
}
