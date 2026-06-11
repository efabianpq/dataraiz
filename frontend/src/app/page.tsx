import { Suspense } from "react";
import { DashboardClient } from "@/components/DashboardClient";

export default function Home() {
  return (
    <div className="flex h-screen flex-col">
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center text-neutral-400">
            Cargando dashboard…
          </div>
        }
      >
        <DashboardClient />
      </Suspense>
    </div>
  );
}
