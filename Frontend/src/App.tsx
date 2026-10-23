import { type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Layout from './components/Layout';
import ReloadPrompt from './components/ReloadPrompt';
import Dashboard from './components/Dashboard';
import Catalog from './components/Catalog';
import Storefront from './components/Storefront';
import ProductDetail from './components/ProductDetail';
import MyNetwork from './components/MyNetwork';
import Cart from './components/Cart';
import Checkout from './components/Checkout';
import Confirmation from './components/Confirmation';
import Login from './components/Login';
import Register from './components/Register';
import AdminUsers from './components/AdminUsers';
import AdminProducts from './components/AdminProducts';
import AdminOrders from './components/AdminOrders';
import AdminPayouts from './components/AdminPayouts';
import MyOrders from './components/MyOrders';
import PendingSync from './components/PendingSync';
import { CartProvider } from './context/CartContext';
import { AuthProvider } from './context/AuthContext';
import { OutboxProvider } from './offline/OutboxProvider';
import { useAuth } from './context/auth';

// Componente para proteger las rutas privadas: exige estar autenticado
const ProtectedRoute = () => {
  const { isAuthenticated } = useAuth();

  // Si no está autenticado, lo enviamos al login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Si está autenticado, renderiza las rutas hijas (Outlet)
  return <Outlet />;
};

// Componente para rutas exclusivas del administrador (Tema 5: roles)
const AdminRoute = () => {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Si el usuario no es admin, lo enviamos a la tienda (su vista por defecto)
  if (user?.role !== 'admin') {
    return <Navigate to="/store" replace />;
  }

  return <Outlet />;
};

// Proveedor intermedio del carrito: al cambiar de usuario se remonta con key,
// de modo que cada cuenta lea y persista SU propio carrito en localStorage.
const CartBoundary = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  return (
    <CartProvider key={user?.email ?? "anonymous"}>
      {children}
    </CartProvider>
  );
};

function App() {
  return (
    <AuthProvider> {/* Proveedor de Autenticación */}
      <OutboxProvider> {/* Pendientes guardados sin conexión y su sincronización */}
      <CartBoundary> {/* Proveedor del Carrito (uno por usuario) */}
        <BrowserRouter>
          {/* Registra el service worker y avisa de versiones nuevas en TODAS las páginas
              (también login y registro, sin sesión): injectRegister está desactivado. */}
          <ReloadPrompt />
          <Routes>
            {/* Ruta pública */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Rutas protegidas (requieren login) */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Layout />}>
                {/* Solo administrador: Dashboard y paneles de gestión */}
                <Route element={<AdminRoute />}>
                  <Route index element={<Dashboard />} />
                  <Route path="admin/users" element={<AdminUsers />} />
                  <Route path="admin/products" element={<AdminProducts />} />
                  <Route path="admin/orders" element={<AdminOrders />} />
                  <Route path="admin/payouts" element={<AdminPayouts />} />
                </Route>

                {/* Ambos roles: compra, pedidos y red de referidos */}
                <Route path="store" element={<Storefront />} />
                <Route path="catalog" element={<Catalog />} />
                <Route path="product/:id" element={<ProductDetail />} />
                <Route path="cart" element={<Cart />} />
                <Route path="checkout" element={<Checkout />} />
                <Route path="confirmation" element={<Confirmation />} />
                <Route path="my-orders" element={<MyOrders />} />
                <Route path="my-network" element={<MyNetwork />} />
                <Route path="pending" element={<PendingSync />} />
              </Route>
            </Route>

            {/* Ruta comodín para capturar 404 y redirigir */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </CartBoundary>
      </OutboxProvider>
    </AuthProvider>
  );
}

export default App;