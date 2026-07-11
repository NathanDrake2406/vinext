import type { LandingStyle } from "./landing-styles";

export function HeroSection() {
  return (
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
        <div data-el="heroTop" style={{ willChange: "transform,opacity" } satisfies LandingStyle} />
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
          <div data-el="l1" style={{ willChange: "transform,opacity" } satisfies LandingStyle}>
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
          <div data-el="l2" style={{ willChange: "transform,opacity" } satisfies LandingStyle}>
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
            Keep your app structure.
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
                gap: "16px",
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
                  gap: "16px 32px",
                  color: "var(--ink)",
                  opacity: ".92",
                } satisfies LandingStyle
              }
            >
              <img
                src="/img/brand-cloudflare.svg"
                alt="Cloudflare Workers"
                style={
                  { display: "block", width: "1.75em", height: "1.75em" } satisfies LandingStyle
                }
              />
              <svg
                role="img"
                aria-label="Vercel"
                viewBox="0 0 24 24"
                fill="currentColor"
                style={{ width: "1.4375em", height: "1.4375em" } satisfies LandingStyle}
              >
                <path d="m12 1.608 12 20.784H0Z" />
              </svg>
              <img
                src="/img/brand-netlify.svg"
                alt="Netlify"
                style={{ display: "block", width: "1.5em", height: "1.5em" } satisfies LandingStyle}
              />
              <span
                role="img"
                aria-label="AWS Lambda"
                style={
                  {
                    font: "600 1.375em/1 'JetBrains Mono',monospace",
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
                fill="currentColor"
                style={{ width: "1.5em", height: "1.5em" } satisfies LandingStyle}
              >
                <path d="M1.105 18.02A11.9 11.9 0 0 1 0 12.985q0-.698.078-1.376a12 12 0 0 1 .231-1.34A12 12 0 0 1 4.025 4.02a12 12 0 0 1 5.46-2.771 12 12 0 0 1 3.428-.23c1.452.112 2.825.477 4.077 1.05a12 12 0 0 1 2.78 1.774 12.02 12.02 0 0 1 4.053 7.078A12 12 0 0 1 24 12.985q0 .454-.036.914a12 12 0 0 1-.728 3.305 12 12 0 0 1-2.38 3.875c-1.33 1.357-3.02 1.962-4.43 1.936a4.4 4.4 0 0 1-2.724-1.024c-.99-.853-1.391-1.83-1.53-2.919a5 5 0 0 1 .128-1.518c.105-.38.37-1.116.76-1.437-.455-.197-1.04-.624-1.226-.829-.045-.05-.04-.13 0-.183a.155.155 0 0 1 .177-.053c.392.134.869.267 1.372.35.66.111 1.484.25 2.317.292 2.03.1 4.153-.813 4.812-2.627s.403-3.609-1.96-4.685-3.454-2.356-5.363-3.128c-1.247-.505-2.636-.205-4.06.582-3.838 2.121-7.277 8.822-5.69 15.032a.191.191 0 0 1-.315.19 12 12 0 0 1-1.25-1.634 12 12 0 0 1-.769-1.404M11.57 6.087c.649-.051 1.214.501 1.31 1.236.13.979-.228 1.99-1.41 2.013-1.01.02-1.315-.997-1.248-1.614.066-.616.574-1.575 1.35-1.635" />
              </svg>
              <img
                src="/img/brand-nodedotjs.svg"
                alt="Node.js"
                style={
                  { display: "block", width: "1.5625em", height: "1.5625em" } satisfies LandingStyle
                }
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
