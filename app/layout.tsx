import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mandate — Corporate actions, properly authorised",
  description:
    "A workspace for professional review, exact-version approval and controlled document release. Synthetic demonstration.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
