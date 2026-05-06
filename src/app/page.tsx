import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import WarRoomLayout from "@/components/WarRoomLayout";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Suspense boundary requerido por `useSearchParams` en App Router
  // (ver `useNavegacion` — vista y empresa abierta viven en la URL).
  return (
    <Suspense fallback={null}>
      <WarRoomLayout />
    </Suspense>
  );
}
