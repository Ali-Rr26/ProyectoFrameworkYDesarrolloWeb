import { Link } from "react-router-dom";
import { LayoutDashboard, PackageSearch, Contact } from 'lucide-react';
import { ICON_SIZES } from '../constants/ui';

interface SidebarProps {
  isOpen: boolean;
  isCollapsed: boolean;
}

const Sidebar = ({ isOpen, isCollapsed }: SidebarProps) => {
  const sidebarWidth = isCollapsed ? "w-20" : "w-64";
  const mobileHidden = "hidden lg:flex";

  return (
    <aside className={`${isOpen ? sidebarWidth : "w-0"} ${mobileHidden} bg-purple-400 text-white flex flex-col transition-all duration-300 overflow-hidden border-r-4 border-purple-600`}>
      <div className={`${isCollapsed ? "p-3" : "p-6"} text-2xl font-bold border-b border-purple-500 whitespace-nowrap flex items-center justify-center`}>
        {!isCollapsed && "MultiCatálogo"}
      </div>

      <nav className="flex-1 p-2 space-y-2 flex flex-col">

        <Link
          to="/"
          className={`${isCollapsed ? "flex justify-center" : "flex items-center gap-3"} p-3 rounded hover:bg-purple-500 transition group relative`}
          title="Dashboard"
        >
          <LayoutDashboard size={ICON_SIZES.SIDEBAR} className="flex-shrink-0" />
          {!isCollapsed && <span className="whitespace-nowrap">Dashboard</span>}
          {isCollapsed && (
            <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none">
              Dashboard
            </div>
          )}
        </Link>

        <Link
          to="/catalogo"
          className={`${isCollapsed ? "flex justify-center" : "flex items-center gap-3"} p-3 rounded hover:bg-purple-500 transition group relative`}
          title="Catálogo"
        >
          <PackageSearch size={ICON_SIZES.SIDEBAR} className="flex-shrink-0" />
          {!isCollapsed && <span className="whitespace-nowrap">Catálogo</span>}
          {isCollapsed && (
            <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none">
              Catálogo
            </div>
          )}
        </Link>

        <Link
          to="/mi-red"
          className={`${isCollapsed ? "flex justify-center" : "flex items-center gap-3"} p-3 rounded hover:bg-purple-500 transition group relative`}
          title="Mi Red"
        >
          <Contact size={ICON_SIZES.SIDEBAR} className="flex-shrink-0" />
          {!isCollapsed && <span className="whitespace-nowrap">Mi Red</span>}
          {isCollapsed && (
            <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none">
              Mi Red
            </div>
          )}
        </Link>
      </nav>
    </aside>
  );
};

export default Sidebar;