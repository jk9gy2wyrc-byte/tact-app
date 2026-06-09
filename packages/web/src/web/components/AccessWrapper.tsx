import React from "react";

interface Props {
  blocked: boolean;
  reason?: string;
  children: React.ReactNode;
}

export default function AccessWrapper({ children }: Props) {
  return (
    <div style={{ position: "relative" }}>
      {children}
    </div>
  );
}
