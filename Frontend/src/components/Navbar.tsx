import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { Menu, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { ICON_SIZES } from '../constants/ui';
import { ROLE_LABELS } from '../data/constants';

interface NavbarProps {
  onMenuClick: () => void;
  onToggleCollapse: () => void;
  isCollapsed: boolean;
}

const Navbar = ({ onMenuClick, onToggleCollapse, isCollapsed }: NavbarProps) => {
  const { totalItems } = useCart();
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8">

      <div className="flex items-center gap-2 sm:gap-4">
        <button
          onClick={onMenuClick}
          className="p-2 hover:bg-slate-100 rounded transition lg:hidden"
          aria-label="Abrir/cerrar menú"
        >
          <Menu size={ICON_SIZES.NAVBAR} />
        </button>

        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex p-2 hover:bg-slate-100 rounded transition"
          aria-label="Colapsar/expandir sidebar"
          title={isCollapsed ? "Expandir" : "Colapsar"}
        >
          {isCollapsed ? (
            <ChevronsRight size={ICON_SIZES.NAVBAR} />
          ) : (
            <ChevronsLeft size={ICON_SIZES.NAVBAR} />
          )}
        </button>

        <h2 className="text-slate-600 font-medium text-sm sm:text-lg hidden sm:block">
          {user?.role === "admin" ? "Panel de Administración" : "Tienda MultiCatálogo"}
        </h2>
      </div>
      <div className="flex items-center gap-2 sm:gap-6">
        <Link
          to="/cart"
          className="relative p-2 hover:bg-slate-100 rounded-full transition"
          title="Carrito"
        >
          <span className="text-lg sm:text-xl">🛒</span>
          {totalItems > 0 && (
            <span className="absolute top-0 right-0 bg-[#00ced1] text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full transform translate-x-1 -translate-y-1">
              {totalItems}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-2 sm:gap-4">
          <span className="hidden sm:block text-xs sm:text-sm text-slate-500 truncate max-w-xs">
            {user?.email}
          </span>

          <span
            className={`hidden md:inline-block text-xs font-semibold px-2 py-1 rounded-full uppercase ${
              user?.role === "admin"
                ? "bg-[#40d9d8] text-white"
                : "bg-sky-100 text-sky-700"
            }`}
          >
            {user ? ROLE_LABELS[user.role] : ""}
          </span>

          <div className="relative group cursor-pointer pb-2" ref={dropdownRef}>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden border border-slate-300 flex items-center justify-center flex-shrink-0 hover:bg-slate-300 transition"
              aria-label="Menú de usuario"
            >
              <img
                src="https://fastly.picsum.photos/id/64/4326/2884.jpg?hmac=9_SzX666YRpR_fOyYStXpfSiJ_edO3ghlSRnH2w09Kg"
                alt="Avatar del usuario"
                className="w-full h-full object-cover"
              />
            </button>

            <div className={`absolute right-0 top-full mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-lg transition-all duration-200 z-50 ${
              isOpen ? "opacity-100 visible" : "opacity-0 invisible group-hover:opacity-100 group-hover:visible"
            }`}>
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 text-sm text-red-600 font-semibold hover:bg-red-50 rounded-md transition-colors"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
