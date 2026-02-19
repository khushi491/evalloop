import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EvalLoop",
  description: "Self-improving agent that evaluates and patches its own policy",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-50 antialiased">
        {children}
      </body>
    </html>
  );
}
