import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LandingScene } from "@/components/manifold/LandingScene";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [{ title: "MANIFOLD — Cislunar Dynamics Explorer" }],
  }),
});

const INACTIVITY_MS = 30_000;

function Landing() {
  const navigate = useNavigate();
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("manifold:visited")) {
      void navigate({ to: "/explore" });
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

    function resetTimer() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        sessionStorage.setItem("manifold:visited", "1");
        setExiting(true);
        setTimeout(() => void navigate({ to: "/explore" }), 400);
      }, INACTIVITY_MS);
    }

    resetTimer();
    window.addEventListener("mousemove", resetTimer);
    window.addEventListener("keydown", resetTimer);
    window.addEventListener("touchstart", resetTimer);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("keydown", resetTimer);
      window.removeEventListener("touchstart", resetTimer);
    };
  }, [navigate]);

  function handleExplore() {
    sessionStorage.setItem("manifold:visited", "1");
    setExiting(true);
    setTimeout(() => void navigate({ to: "/explore" }), 400);
  }

  return (
    <div
      className={`landing-root${exiting ? " exiting" : ""}`}
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#000000",
      }}
    >
      <LandingScene />

      <div
        className="landing-overlay"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          className="landing-title"
          style={{ animationDelay: "0ms" }}
        >
          MANIFOLD
        </div>

        <div
          className="landing-subtitle"
          style={{ animationDelay: "200ms" }}
        >
          YOUR CISLUNAR DYNAMICS EXPLORER
        </div>

        <div
          className="landing-divider"
          style={{ animationDelay: "400ms" }}
        />

        <div
          className="landing-stats"
          style={{ animationDelay: "500ms" }}
        >
          6 SYSTEMS &nbsp;·&nbsp; 25+ ORBIT FAMILIES &nbsp;·&nbsp; REAL CR3BP DYNAMICS &nbsp;·&nbsp; JPL Initial Conditions
        </div>

        <p
          className="landing-description"
          style={{ animationDelay: "600ms" }}
        >
          Explore the gravitational architecture of the solar system.
          Visualize periodic orbits, invariant manifolds, and low-energy
          transfer corridors across six CR3BP systems — from Earth-Moon
          to Jupiter-Europa.
        </p>

        <button
          className="landing-btn"
          onClick={handleExplore}
          style={{ animationDelay: "800ms" }}
        >
          EXPLORE &nbsp;→
        </button>
      </div>

      <div className="landing-attribution">
        Built on NASA/JPL Three-Body Periodic Orbit Catalog
      </div>
    </div>
  );
}
