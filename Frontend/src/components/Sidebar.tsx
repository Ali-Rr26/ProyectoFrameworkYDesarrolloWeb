import { Link } from "react-router-dom";
import { LayoutDashboard, PackageSearch, Contact, Store } from 'lucide-react';
import { ICON_SIZES } from '../constants/ui';

interface SidebarProps {
  isOpen: boolean;
  isCollapsed: boolean;
  onCloseSidebar: () => void;
}

const Sidebar = ({ isOpen, isCollapsed, onCloseSidebar }: SidebarProps) => {
  const showTitle = !isCollapsed;

  return (
    <>
      {/* Overlay en móvil - Fondo borroso */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          style={{
            backdropFilter: 'blur(4px)',
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
          }}
          onClick={onCloseSidebar}
        />
      )}

      {/* Sidebar */}
      <aside className={`${isOpen ? "w-64" : "w-0"} fixed lg:static left-0 top-0 h-screen lg:h-auto bg-[#00ced1] text-white flex flex-col transition-all duration-300 overflow-hidden border-r-2 border-[#009DA6] z-40 ${isCollapsed ? "lg:w-20" : "lg:w-64"}`}>
      <div className={`p-6 ${isCollapsed ? "lg:p-3" : ""} border-b border-[#20b2aa] flex items-center justify-center group relative`}>
        <Store size={32} className="flex-shrink-0" />
        <span className="text-2xl font-bold whitespace-nowrap ml-3 lg:hidden">MultiCatálogo</span>
        {showTitle && (
          <span className="hidden lg:inline text-2xl font-bold whitespace-nowrap ml-3">MultiCatálogo</span>
        )}
        {isCollapsed && (
          <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none hidden lg:block">
            MultiCatálogo
          </div>
        )}
      </div>

      <nav className="flex-1 p-2 space-y-2 flex flex-col">

        <Link
          to="/"
          onClick={onCloseSidebar}
          className={`flex items-center gap-3 ${isCollapsed ? "lg:flex lg:justify-center lg:gap-0" : "lg:flex lg:items-center lg:gap-3"} p-3 rounded hover:bg-white hover:bg-opacity-20 transition-all duration-200 group relative`}
          title="Dashboard"
        >
          <LayoutDashboard size={ICON_SIZES.SIDEBAR} className="flex-shrink-0" />
          <span className="whitespace-nowrap lg:hidden">Dashboard</span>
          {!isCollapsed && <span className="hidden lg:inline whitespace-nowrap">Dashboard</span>}
          {isCollapsed && (
            <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none hidden lg:block">
              Dashboard
            </div>
          )}
        </Link>

        <Link
          to="/catalogo"
          onClick={onCloseSidebar}
          className={`flex items-center gap-3 ${isCollapsed ? "lg:flex lg:justify-center lg:gap-0" : "lg:flex lg:items-center lg:gap-3"} p-3 rounded hover:bg-white hover:bg-opacity-20 transition-all duration-200 group relative`}
          title="Catálogo"
        >
          <PackageSearch size={ICON_SIZES.SIDEBAR} className="flex-shrink-0" />
          <span className="whitespace-nowrap lg:hidden">Catálogo</span>
          {!isCollapsed && <span className="hidden lg:inline whitespace-nowrap">Catálogo</span>}
          {isCollapsed && (
            <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none hidden lg:block">
              Catálogo
            </div>
          )}
        </Link>

        <Link
          to="/mi-red"
          onClick={onCloseSidebar}
          className={`flex items-center gap-3 ${isCollapsed ? "lg:flex lg:justify-center lg:gap-0" : "lg:flex lg:items-center lg:gap-3"} p-3 rounded hover:bg-white hover:bg-opacity-20 transition-all duration-200 group relative`}
          title="Mi Red"
        >
          <Contact size={ICON_SIZES.SIDEBAR} className="flex-shrink-0" />
          <span className="whitespace-nowrap lg:hidden">Mi Red</span>
          {!isCollapsed && <span className="hidden lg:inline whitespace-nowrap">Mi Red</span>}
          {isCollapsed && (
            <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none hidden lg:block">
              Mi Red
            </div>
          )}
        </Link>
      </nav>
    </aside>
    </>
  );
};

export default Sidebar;