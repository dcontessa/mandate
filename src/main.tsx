import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "@/lib/auth-context";
import { MandateApp } from "@/components/mandate/workspace";
import "@/app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <MandateApp />
    </AuthProvider>
  </StrictMode>,
);
