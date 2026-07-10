import type { LandingStyle } from "./landing-styles";

export function LandingAtmosphere() {
  return (
    <>
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

      {/* Static atmosphere. These blobs used to drift on 47–61s infinite
            alternating keyframes; three full-viewport gradients repainting
            forever bought no meaning, so only the scroll-linked fade remains. */}
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
    </>
  );
}
