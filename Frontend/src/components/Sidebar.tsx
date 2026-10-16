import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, PackageSearch, Contact, Store, Users } from 'lucide-react';
import { useAuth } from '../context/auth';
import { ICON_SIZES } from '../constants/ui';
import { ROLE_LABELS } from '../data/constants';

// Definimos las opciones de navegación según el rol (Tema 5)
interface NavItem {
  to: string;
  label: string;
  title: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

interface SidebarProps {
  isOpen: boolean;
  isCollapsed: boolean;
  onCloseSidebar: () => void;
}

const Sidebar = ({ isOpen, isCollapsed, onCloseSidebar }: SidebarProps) => {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const showTitle = !isCollapsed;

  const NAV_ITEMS: NavItem[] = [
    {
      to: "/",
      label: "Dashboard",
      title: "Dashboard",
      adminOnly: true,
      icon: <LayoutDashboard size={ICON_SIZES.SIDEBAR} className="flex-shrink-0" />,
    },
    {
      to: "/store",
      label: "Tienda",
      title: "Tienda",
      icon: <Store size={ICON_SIZES.SIDEBAR} className="flex-shrink-0" />,
    },
    {
      to: "/catalog",
      label: "Catálogo",
      title: "Catálogo",
      icon: <PackageSearch size={ICON_SIZES.SIDEBAR} className="flex-shrink-0" />,
    },
    {
      to: "/my-network",
      label: "Mi Red",
      title: "Mi Red",
      adminOnly: true,
      icon: <Contact size={ICON_SIZES.SIDEBAR} className="flex-shrink-0" />,
    },
    {
      to: "/admin/users",
      label: "Usuarios",
      title: "Usuarios",
      adminOnly: true,
      icon: <Users size={ICON_SIZES.SIDEBAR} className="flex-shrink-0" />,
    },
  ];

  // Filtramos las opciones según el rol del usuario
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || user?.role === "admin");

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
      <aside className={`${isOpen ? "w-64" : "w-0"} fixed lg:static left-0 top-0 h-screen lg:h-auto bg-[#40d9d8] text-white flex flex-col transition-all duration-300 overflow-hidden border-r-2 border-[#20b2aa] z-40 ${isCollapsed ? "lg:w-20" : "lg:w-64"}`}>
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
          {items.map((item) => {
            // Resaltamos la opción activa según la ruta actual
            const isActive =
              item.to === "/"
                ? pathname === "/"
                : pathname.startsWith(item.to);

            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onCloseSidebar}
                className={`flex items-center gap-3 ${isCollapsed ? "lg:flex lg:justify-center lg:gap-0" : "lg:flex lg:items-center lg:gap-3"} p-3 rounded transition-all duration-200 group relative ${
                  isActive
                    ? "bg-[#20b2aa] text-white"
                    : "hover:bg-[#40e5e8]"
                }`}
                title={item.title}
              >
                {item.icon}
                <span className="whitespace-nowrap lg:hidden">{item.label}</span>
                {!isCollapsed && <span className="hidden lg:inline whitespace-nowrap">{item.label}</span>}
                {isCollapsed && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none hidden lg:block">
                    {item.title}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer: mostrar rol del usuario */}
        <div className="p-3 border-t border-[#20b2aa] text-xs text-white">
          {isCollapsed ? (
            <p className="text-center uppercase">{user ? ROLE_LABELS[user.role] : ""}</p>
          ) : (
            <p>
              Conectado como <span className="font-semibold uppercase">{user ? ROLE_LABELS[user.role] : ""}</span>
            </p>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;