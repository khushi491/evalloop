import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI News AutoPoster",
  description: "Turn AI news into X posts automatically."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        {children}
      </body>
    </html>
  );
}

