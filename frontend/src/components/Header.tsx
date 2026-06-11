import Image from "next/image";
import Link from "next/link";

export function Header({ active }: { active?: "dashboard" | "watchlist" }) {
  return (
    <header className="flex h-header items-center justify-between border-b border-neutral-200 bg-white px-6">
      <Link href="/" className="flex items-center gap-2">
        <Image src="/logo.svg" alt="DataRaíz" width={26} height={35} priority />
        <span className="text-h4 font-bold text-brand-800">
          Data<span className="text-amber-500">Raíz</span>
        </span>
      </Link>
      <nav className="flex items-center gap-1 text-body-sm font-semibold">
        <Link
          href="/"
          className={
            active === "dashboard"
              ? "rounded-md bg-brand-50 px-3 py-1.5 text-brand-800"
              : "rounded-md px-3 py-1.5 text-neutral-600 hover:bg-neutral-100"
          }
        >
          Dashboard
        </Link>
        <Link
          href="/watchlist"
          className={
            active === "watchlist"
              ? "rounded-md bg-brand-50 px-3 py-1.5 text-brand-800"
              : "rounded-md px-3 py-1.5 text-neutral-600 hover:bg-neutral-100"
          }
        >
          Mis búsquedas
        </Link>
      </nav>
    </header>
  );
}
