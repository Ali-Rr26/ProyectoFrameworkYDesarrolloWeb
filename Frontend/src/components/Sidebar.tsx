import { Link } from "react-router-dom";
import { LayoutDashboard, PackageSearch, Contact   } from 'lucide-react';

const Sidebar = () => {
  return (
    <aside className="w-64 bg-purple-400 text-white flex flex-col">
      <div className="p-6 text-2xl font-bold border-b border-slate-700">
        MultiCatálogo
      </div>

      <nav className="flex-1 p-4 space-y-2">
        
        <Link
          to="/"
          className="block p-3 rounded hover:bg-slate-800 transition"
        >
          <LayoutDashboard />
          Dashboard
        </Link>

        <Link
          to="/catalogo"
          className="block p-3 rounded hover:bg-slate-800 transition"
        >
          <PackageSearch />
          Catálogo
        </Link>

        <Link
          to="/mi-red"
          className="block p-3 rounded hover:bg-slate-800 transition"
        >
          <Contact />
          Mi Red
        </Link>
      </nav>
    </aside>
  );
};

export default Sidebar;