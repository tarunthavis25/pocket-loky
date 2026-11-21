import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig, motion } from "motion/react";
import { supabase } from "./supabase.js";
import { Vault } from "./vault.jsx";
import { Brand, ease, entrance } from "./ui.jsx";
import "./styles.css";

function SignIn({ waiting, error, onSignIn }) {
  return (
    <main className="sign-in single-panel-login">
      <motion.section
        className="sign-in-art glass"
        aria-labelledby="sign-in-title"
        {...entrance}
      >
        <Brand />

        <div className="login-content">
          <div className="sign-in-copy">
            <h1 id="sign-in-title">
              Your passwords,
              <br />
              in one place.
            </h1>
            <p>Save your logins and find them when you need them.</p>
          </div>

          <div className="login-action">
            <div className="vault-art" aria-hidden="true">
              <motion.div
                className="art-card art-back"
                initial={{ rotate: -3, y: 18 }}
                animate={{ rotate: -12, y: 0 }}
                transition={{ duration: 0.65, ease }}
              />
              <motion.div
                className="art-card art-front"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.55, ease }}
              >
                <span className="brand-icon">
                  <i />
                </span>
                <span className="art-line" />
                <span className="art-dots">••••••••</span>
              </motion.div>
              <span className="art-accent" />
            </div>

            <motion.button
              className="google-button"
              whileTap={{ scale: 0.98 }}
              onClick={onSignIn}
              disabled={waiting || !supabase}
              aria-busy={waiting}
            >
              <span aria-hidden="true" className="google-mark">
                G
              </span>
              {waiting ? "Connecting…" : "Continue with Google"}
            </motion.button>

            <p className="login-caption">
              Sign in to open your personal vault.
            </p>

            {!supabase && (
              <p className="notice" role="status">
                Connect a Supabase project to enable Google sign-in.
              </p>
            )}

            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>

        <p className="privacy">
          <svg
            width="20"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="5" y="10" width="14" height="12" rx="2" />
            <path d="M8 10V6a4 4 0 0 1 8 0v4" />
            <path d="M12 15v2" />
          </svg>
          <span>Your saved passwords are stored encrypted.</span>
        </p>
      </motion.section>
    </main>
  );
}

function App() {
  const [session, setSession] = useState(undefined);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) {
      setSession(null);
      return;
    }
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.slice(1));
    if (query.has("error") || hash.has("error"))
      setError("Google sign-in could not finish. Please try again.");
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setWaiting(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function signIn() {
    setWaiting(true);
    setError("");
    try {
      const { error: failure } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: new URL(import.meta.env.BASE_URL, location.origin).href,
        },
      });
      if (failure) throw failure;
    } catch {
      setError("Google sign-in could not start. Please try again.");
      setWaiting(false);
    }
  }

  async function signOut() {
    const { error: failure } = await supabase.auth.signOut({ scope: "local" });
    if (failure)
      throw new Error("Sign-out could not finish. Please try again.");
  }

  return (
    <MotionConfig reducedMotion="user">
      {session === undefined ? (
        <main className="loading">
          <Brand />
          <p role="status">Opening Pocket Loky…</p>
        </main>
      ) : session ? (
        <Vault key={session.user.id} user={session.user} onSignOut={signOut} />
      ) : (
        <SignIn waiting={waiting} error={error} onSignIn={signIn} />
      )}
    </MotionConfig>
  );
}

createRoot(document.getElementById("root")).render(<App />);
