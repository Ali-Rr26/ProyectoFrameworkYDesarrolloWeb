// src/components/Pagination.tsx
interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onChange: (page: number) => void;
}

// Controles de paginación para las respuestas {data, page, limit, total} de la API.
const Pagination = ({ page, limit, total, onChange }: PaginationProps) => {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;

  const button =
    'min-h-11 px-4 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <nav className="flex items-center justify-between gap-3 mt-6" aria-label="Paginación">
      <button type="button" className={button} disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Anterior
      </button>
      <span className="text-sm text-slate-500">
        Página {page} de {pages} · {total} en total
      </span>
      <button type="button" className={button} disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Siguiente
      </button>
    </nav>
  );
};

export default Pagination;
