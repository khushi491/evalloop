import type { Metadata } from "next";
import "./globals.css";
import { RestaurantProvider } from "@/context/RestaurantContext";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "Restaurant OS",
  description: "Modern restaurant reservation and floor management system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <RestaurantProvider>
          <div className="app-container">
            <Sidebar />
            <main className="main-content">
              <Header />
              <div className="page-container">
                {children}
              </div>
            </main>
          </div>
        </RestaurantProvider>
      </body>
    </html>
  );
}
