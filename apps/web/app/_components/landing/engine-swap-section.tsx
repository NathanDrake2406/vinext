import type { LandingStyle } from "./landing-styles";

export function EngineSwapSection() {
  return (
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
            Start with the app you have.
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
            vinext keeps your app structure and maps supported{" "}
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
            APIs to Vite-compatible shims on{" "}
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
            . Run vinext check to flag known behavior gaps before migrating.
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
                  gap: "16px",
                  justifyContent: "center",
                  flexWrap: "wrap",
                } satisfies LandingStyle
              }
            >
              <div
                style={
                  {
                    padding: "12px 20px",
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
                    padding: "12px 20px",
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
                    padding: "12px 20px",
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
              app structure · preserved
            </div>
            <div
              data-el="conn"
              style={
                {
                  width: "2px",
                  height: "48px",
                  margin: "16px 0",
                  background: "linear-gradient(180deg,rgba(var(--orange-rgb),.3),transparent)",
                  opacity: "1",
                } satisfies LandingStyle
              }
            />
            <div
              className="engine-plate is-swapped"
              data-el="plate"
              style={
                {
                  position: "relative",
                  // Floor is set by the "Vite" wordmark + lightning logo
                  // at the clamped 76px max: ~203px of ink + 64px padding.
                  // Below this the logo wraps onto the caption at wide
                  // viewports, so do not drop it without shrinking the mark.
                  minWidth: "min(285px,82vw)",
                  padding: "24px 32px",
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
                    // 1.1875 × the section h2 (5.4vw) so both hit their
                    // min/max at the same 593–1185px viewports and the
                    // plate:heading ratio stays constant while fluid.
                    fontSize: "clamp(38px,6.4vw,76px)",
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
                  Vite
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
                      opacity: "0",
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
                      opacity: "1",
                      transform: "none",
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
                    color: "var(--orange-soft)",
                    transition: "color .3s",
                  } satisfies LandingStyle
                }
              >
                vite + @vitejs/plugin-rsc
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
