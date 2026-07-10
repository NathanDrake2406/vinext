import type { LandingStyle } from "./landing-styles";

export function GetStartedSection() {
  return (
    <section
      id="start"
      data-screen-label="Get started"
      style={{ position: "relative", zIndex: "2", padding: "64px 0 96px" } satisfies LandingStyle}
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
              padding: "16px",
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
                minWidth: "80px",
                fontFamily: "'JetBrains Mono',monospace",
                color: "var(--mute)",
                fontSize: "10.5px",
                letterSpacing: ".1em",
                textTransform: "uppercase",
                padding: "8px 12px",
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
              // Same 460px rail as the command box above so both cards
              // share edges at every viewport instead of this one
              // spanning the full container.
              maxWidth: "460px",
              border: "1px solid var(--line)",
              borderRadius: "18px",
              padding: "32px",
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
                style={{ textDecoration: "none" } satisfies LandingStyle}
              >
                Quick start
              </a>
              <a
                className="text-link"
                href="https://github.com/cloudflare/vinext"
                style={{ textDecoration: "none" } satisfies LandingStyle}
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
  );
}
