// Fechas en la zona horaria del negocio (funciones puras). La base guarda UTC; la interfaz
// muestra y calcula los días con la misma zona que usa el backend (APP_TIMEZONE), así
// todos los usuarios ven las mismas fechas sin importar la zona de su navegador.

// Fecha y hora: "18/10/2026, 22:15"
export const formatDateTime = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat('es-EC', { timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));

// Solo la fecha: "18/10/2026"
export const formatDate = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat('es-EC', { timeZone, dateStyle: 'short' }).format(new Date(iso));

// Día de hoy en la zona dada, como AAAA-MM-DD (el formato de <input type="date">).
export const todayIn = (timeZone: string, now: Date = new Date()): string =>
  // en-CA formatea las fechas como AAAA-MM-DD
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

// Suma días de calendario a una fecha AAAA-MM-DD (sin horas: no la afecta el cambio de horario).
export const addDays = (day: string, days: number): string => {
  const [y, m, d] = day.split('-').map(Number);
  const result = new Date(Date.UTC(y, m - 1, d + days));
  return result.toISOString().slice(0, 10);
};

// AAAA-MM-DD → DD/MM/AAAA para mostrarla.
export const formatDay = (day: string): string => {
  const [y, m, d] = day.split('-');
  return d && m && y ? `${d}/${m}/${y}` : day;
};
