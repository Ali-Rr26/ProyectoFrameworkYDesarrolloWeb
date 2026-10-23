import { Outlet } from "react-router-dom";
import { useState } from "react";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import OfflineDataBanner from "./OfflineDataBanner";

const Layout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);

  const closeSidebar = () => setSidebarOpen(false);

  // h-dvh: alto real de la pantalla (en móvil descuenta la barra del navegador, a diferencia de 100vh).
  return (
    <div className="flex h-dvh bg-slate-50">
      <Sidebar
        isOpen={sidebarOpen}
        isCollapsed={isCollapsed}
        onCloseSidebar={closeSidebar}
      />

      {/* Área de Contenido Principal */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar
          onMenuClick={() => setSidebarOpen(!sidebarOpen)}
          onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
          isCollapsed={isCollapsed}
        />

        {/* relative: los elementos absolutos de las páginas (p. ej. etiquetas sr-only) se ubican y
            recortan dentro de esta área con scroll; sin él escapan a la página y crean una segunda
            barra de desplazamiento con una franja vacía al final. */}
        <main className="relative flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-8">
          <OfflineDataBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;