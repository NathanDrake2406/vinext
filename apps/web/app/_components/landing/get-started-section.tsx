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
              marginTop: "32px",
              maxWidth: "460px",
            } satisfies LandingStyle
          }
        >
          <p
            style={
              {
                margin: "0",
                fontSize: "16.5px",
                lineHeight: "1.65",
                color: "var(--ink-sub)",
              } satisfies LandingStyle
            }
          >
            Try it on a branch. If something breaks, open an issue.
          </p>
          <a
            className="text-link"
            href="https://github.com/cloudflare/vinext#quick-start"
            style={
              {
                display: "inline-block",
                marginTop: "16px",
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: "13px",
                textDecoration: "none",
              } satisfies LandingStyle
            }
          >
            Quick start
          </a>
        </div>
      </div>
    </section>
  );
}
