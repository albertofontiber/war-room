"use client";

import { useCallback, useEffect, useState } from "react";
import { useWarRoomStore } from "@/store/useWarRoomStore";
import { useNavegacion } from "@/lib/navegacion";
import type { EmpresaDetalle, DealStage } from "@/types";

/**
 * Hook que centraliza el estado y mutaciones del panel de empresa.
 * Carga la ficha cuando cambia `empresaSeleccionadaId`, expone setter local
 * y handlers para cambios optimistas (stage, perímetro) que sincronizan a la
 * vez con el GeoJSON del store para que mapa y tabla reflejen los cambios.
 */
export function useEmpresaDetalle(onEmpresaChanged?: () => void) {
  const { updateEmpresaInGeoJSON } = useWarRoomStore();
  const { empresaSeleccionadaId } = useNavegacion();

  const [empresa, setEmpresa] = useState<EmpresaDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  // Fetch detail when selected empresa changes
  useEffect(() => {
    if (!empresaSeleccionadaId) return;
    setLoading(true);
    fetch(`/api/empresas/${empresaSeleccionadaId}`)
      .then((r) => r.json())
      .then((data) => setEmpresa(data))
      .catch(() => setEmpresa(null))
      .finally(() => setLoading(false));
  }, [empresaSeleccionadaId]);

  // Cambiar stage desde la ficha. Actualiza optimísticamente y persiste via PATCH.
  const handleStageChange = useCallback(
    async (nuevo: DealStage | null) => {
      if (!empresa) return;
      const prev = empresa.crmEstado;
      setEmpresa({
        ...empresa,
        crmEstado: nuevo
          ? {
              dealStage: nuevo,
              ownerUserId: prev?.ownerUserId ?? null,
              ownerUser: prev?.ownerUser ?? null,
              fechaEntradaStage:
                prev?.dealStage !== nuevo
                  ? new Date().toISOString()
                  : prev?.fechaEntradaStage ?? null,
              updatedAt: new Date().toISOString(),
            }
          : null,
      });
      try {
        const res = await fetch(`/api/empresas/${empresa.id}/stage`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dealStage: nuevo }),
        });
        if (!res.ok) throw new Error(`${res.status}`);
        // Sincroniza inmediatamente el GeoJSON del store para que mapa y
        // tabla reflejen el nuevo stage sin recargar la página.
        updateEmpresaInGeoJSON(empresa.id, { dealStage: nuevo });
        onEmpresaChanged?.();
      } catch (err) {
        console.error("[stage change]", err);
        // Rollback: recarga la ficha
        if (empresaSeleccionadaId) {
          fetch(`/api/empresas/${empresaSeleccionadaId}`)
            .then((r) => r.json())
            .then(setEmpresa)
            .catch(() => {});
        }
      }
    },
    [empresa, empresaSeleccionadaId, onEmpresaChanged, updateEmpresaInGeoJSON]
  );

  const togglePerimetro = useCallback(async () => {
    if (!empresa || toggling) return;
    setToggling(true);
    try {
      const res = await fetch(`/api/empresas/${empresa.id}/perimetro`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enPerimetro: !empresa.enPerimetro }),
      });
      if (res.ok) {
        const nuevoEnPerimetro = !empresa.enPerimetro;
        setEmpresa((prev) =>
          prev ? { ...prev, enPerimetro: nuevoEnPerimetro } : prev
        );
        updateEmpresaInGeoJSON(empresa.id, { enPerimetro: nuevoEnPerimetro });
      }
    } finally {
      setToggling(false);
    }
  }, [empresa, toggling, updateEmpresaInGeoJSON]);

  return {
    empresa,
    setEmpresa,
    loading,
    toggling,
    handleStageChange,
    togglePerimetro,
  };
}
