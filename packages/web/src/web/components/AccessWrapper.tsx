import React from "react";
import { useLocation } from "wouter";

interface Props {
  blocked: boolean;
  reason?: string;
  children: React.ReactNode;
}

export default function AccessWrapper({ blocked, children }: Props) {
  const [, navigate] = useLocation();

  return (
    <div style={{ position: "relative" }}>
      {children}
      {blocked && (
        <div style={{
          position: "absolute",
          inset: 0,
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          background: "rgba(10,12,16,0.55)",
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <div style={{
            background: "var(--surface, #1c1f23)",
            border: "1px solid var(--border, #2a2d33)",
            borderRadius: 16,
            padding: "36px 40px",
            textAlign: "center",
            maxWidth: 340,
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text, #e5e7eb)", marginBottom: 10 }}>
              Manage your plan
            </div>
            <div style={{ fontSize: 14, color: "var(--text2, #8b9098)", marginBottom: 24, lineHeight: 1.6 }}>
              Subscribe to get full access to the platform.
            </div>
            <button
              onClick={() => navigate("/subscription")}
              style={{
                padding: "10px 28px",
                borderRadius: 8,
                border: "none",
                background: "#7eb8f7",
                color: "#0a0c10",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Subscription
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
