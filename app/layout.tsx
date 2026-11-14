import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jóvenes que Unen al Barrio | Escuinapa",
  description: "Plataforma de seguimiento de horas, asistencia y actividades del programa Jóvenes que Unen al Barrio.",
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
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
