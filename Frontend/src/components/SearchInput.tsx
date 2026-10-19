// src/components/SearchInput.tsx
interface SearchInputProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}

// Campo de búsqueda de los listados del administrador (la consulta la hace el servidor, ?q=).
const SearchInput = ({ id, label, placeholder, value, onChange }: SearchInputProps) => (
  <div className="mb-6 max-w-md">
    <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
    <input
      id={id}
      type="search"
      value={value}
      maxLength={100}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-h-11 px-3 rounded-lg border border-slate-300 bg-white"
    />
  </div>
);

export default SearchInput;
