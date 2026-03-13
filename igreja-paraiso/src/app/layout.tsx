import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Igreja Paraíso",
  description: "Site oficial da Igreja Paraíso",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
