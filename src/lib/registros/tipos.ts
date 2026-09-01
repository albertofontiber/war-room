/**
 * Resultado común de sincronizar un registro del sector.
 *
 * Los tres registros —Cepreven, seguridad privada y RIPCI— se refrescan a la
 * vez y avisan juntos, así que cada uno devuelve lo mismo y el cron compone
 * un único aviso en lugar de tres correos la misma mañana.
 */

export interface EmpresaNueva {
  nombre: string;
  cif: string;
  /** Qué le aporta: áreas de Cepreven, habilitaciones, categorías… */
  detalle: string;
  /**
   * Dónde está, cuando el registro lo publica. Va en su propia columna del
   * aviso porque es lo primero por lo que se filtra al leerlo.
   */
  zona?: string;
  /**
   * Subgrupo dentro del registro, cuando la distinción importa. En Cepreven
   * separa "Calificadas" de "Asociadas": son dos cosas distintas y la
   * calificación es la que pesa.
   */
  grupo?: string;
}

export interface ResultadoRegistro {
  /** Nombre para el usuario: "Cepreven", "Seguridad privada", "RIPCI". */
  registro: string;
  /** Empresas que no estaban en la base y se han dado de alta. */
  altas: EmpresaNueva[];
  /** Empresas ya existentes cuyos datos han cambiado. */
  actualizadas: number;
  /**
   * Cosas que hay que mirar a mano: bajas, degradaciones, empresas del
   * registro que no casan con ninguna ficha.
   */
  avisos: string[];
  /** Contadores para el historial de ejecuciones. */
  resumen: Record<string, string | number | boolean | null>;
  /** Si la fuente vino ilegible; el cron no toca nada y avisa. */
  ilegible?: string;
  /**
   * Fuentes del registro que no se pudieron leer, cuando el registro son
   * varias: "seguridad privada" son en realidad tres. Si falla una, el resto
   * sigue adelante, pero la ejecución no puede darse por buena.
   */
  fuentesConProblema?: number;
}
