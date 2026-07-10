import type { LandingStyle } from "./landing-styles";

export function HeroMarquee() {
  return (
    <div
      aria-hidden="true"
      style={
        {
          position: "relative",
          zIndex: "2",
          padding: "24px 0 16px",
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
          Same structure · 
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
          Same structure · 
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
          Same structure · 
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
          Same structure · 
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
  );
}
