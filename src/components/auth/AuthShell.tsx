import type { ReactNode } from "react";
import { Playfair_Display } from "next/font/google";

/**
 * Marco común de las pantallas de acceso del War Room y del portal de finders
 * (login, recuperar y elegir contraseña). Copia el de dataroom.fontiber.com/login y el del panel
 * del chatbot: fondo navy, logotipo Playfair «Fontiber» + nombre en cobre y
 * tarjeta blanca. Como allí, es solo en claro: no hay variante oscura.
 *
 * La Playfair se carga aquí y no en el layout raíz para no añadirla al resto
 * de la app, que no la usa.
 */
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
});

/** Clases de los campos y botones de la tarjeta, compartidas por las tres pantallas.
 *  El campo no lleva el `mt-1` puesto: el de contraseña va dentro de un
 *  `<div className="relative mt-1">` para que el ojo de `PasswordToggle` quede
 *  centrado, y los demás lo añaden ellos. */
export const authInput =
  "min-h-[44px] sm:min-h-0 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base sm:text-sm text-neutral-900 outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900";
export const authLabel = "block text-sm font-medium text-neutral-700";
export const authButton =
  "min-h-[44px] sm:min-h-0 w-full rounded-lg bg-fontiber-navy px-3 py-2 text-sm font-medium text-white hover:bg-fontiber-navy-light disabled:opacity-50 disabled:cursor-not-allowed";
export const authCard = "rounded-xl border border-neutral-200 bg-white p-6 shadow-sm";
/** Enlace bajo la tarjeta, sobre el navy. */
export const authLink = "text-fontiber-sand/70 hover:text-white";

/** Qué app es: el nombre que va en cobre tras «Fontiber». */
export type AuthBrand = "War Room" | "Finders";

export function BrandLogo({
  brand = "War Room",
  className = "",
}: {
  brand?: AuthBrand;
  className?: string;
}) {
  return (
    <span className={`font-display whitespace-nowrap tracking-tight ${className}`}>
      Fontiber{" "}
      <span className="text-fontiber-copper">{brand}</span>
    </span>
  );
}

/** Aviso verde (p. ej. contraseña guardada) en el estilo del Data Room. */
export function AuthNotice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-center text-sm text-green-700"
    >
      {children}
    </p>
  );
}

export function AuthShell({
  brand = "War Room",
  title,
  subtitle,
  footer,
  children,
}: {
  brand?: AuthBrand;
  /** Sin título, el logotipo es el `h1` (como en el login del Data Room). */
  title?: string;
  subtitle?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main
      className={`${playfair.variable} flex min-h-dvh items-center justify-center bg-fontiber-navy px-4 py-8 font-sans`}
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {title ? (
            <>
              <BrandLogo brand={brand} className="text-2xl text-white" />
              <h1 className="mt-3 text-lg font-medium text-white">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-fontiber-sand/70">{subtitle}</p>}
            </>
          ) : (
            <>
              <h1 className="text-3xl text-white">
                <BrandLogo brand={brand} />
              </h1>
              {subtitle && <p className="mt-2 text-sm text-fontiber-sand/80">{subtitle}</p>}
            </>
          )}
        </div>
        {children}
        {footer}
      </div>
    </main>
  );
}
