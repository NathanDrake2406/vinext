import type { LandingStyle } from "./landing-styles";

/* Mirrors the flow the repo itself recommends (README quick start and the
   bundled migrate-to-vinext Agent Skill), so the prompt never promises
   behavior the tooling does not have. Update it alongside those docs. */
const agentPrompt = `Migrate this Next.js app to vinext (Next.js on Vite: vinext.dev).

Preferred path: run \`npx skills add cloudflare/vinext\` to install the official migrate-to-vinext Agent Skill, then follow it. If the skills CLI is unavailable, migrate directly:

1. Run \`npx vinext check\` and read the scored report. Stop and show me anything it flags as blocking before changing the project.
2. Run \`npx vinext init\`. It is non-destructive: it installs vinext and Vite tooling, adds "type": "module", renames CJS config files to .cjs, adds dev:vinext / build:vinext / start:vinext scripts, and generates vite.config.ts. It leaves next.config.js and source files untouched, and the existing next scripts keep working.
3. Run the dev:vinext script and fix anything it errors on.
4. Run build:vinext, then start:vinext. Verify the key routes render, then run the test suite.

Feature status: vinext.dev/compatibility. If something behaves differently than it did under Next.js, treat it as a vinext bug and file it at github.com/cloudflare/vinext/issues.`;

export function GetStartedSection() {
  return (
    <section
      id="start"
      data-screen-label="Get started"
      style={{ position: "relative", zIndex: "2", padding: "96px 0 120px" } satisfies LandingStyle}
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

        {/* Agent path, as a twin of the command box above: same shell, but
            the sigil is a sparkle and the payload is the migration prompt.
            The parallel structure is what explains it — command for you,
            prompt for your agent — so the full text never has to render.
            Truncation is fine: the copy payload is the data-copy attribute. */}
        <div
          data-rv=""
          style={
            {
              opacity: "0",
              transform: "translateY(24px)",
              transition: "opacity var(--t),transform var(--t)",
              transitionDelay: ".18s",
              margin: "12px 0 0 16px",
              maxWidth: "460px",
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: "11px",
              color: "var(--mute)",
            } satisfies LandingStyle
          }
        >
          or
        </div>

        <div
          data-rv=""
          style={
            {
              opacity: "0",
              transform: "translateY(24px)",
              transition: "opacity var(--t),transform var(--t)",
              transitionDelay: ".2s",
              marginTop: "12px",
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
            aria-hidden="true"
            style={
              {
                flex: "none",
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: "14px",
                color: "var(--orange-soft)",
              } satisfies LandingStyle
            }
          >
            ✦
          </span>
          <span
            style={
              {
                flex: "1",
                minWidth: "0",
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: "14px",
                letterSpacing: "-.01em",
                color: "var(--ink)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              } satisfies LandingStyle
            }
          >
            prompt for your coding agent
          </span>
          <button
            className="text-link"
            data-copy={agentPrompt}
            aria-label="Copy migration prompt for your coding agent"
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
