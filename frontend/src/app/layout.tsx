import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Ontology Agent Console",
  description:
    "Consola para consultar una ontología con lenguaje natural, SPARQL trazable y resultados verificables.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
