import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "EvalLoop",
  description:
    "EvalLoop is a self-improving agent that runs a task, evaluates it with an LLM judge and code hard checks, patches its policy, and runs again.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className}>
      <body className="min-h-screen bg-zinc-950 text-zinc-50 antialiased">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
