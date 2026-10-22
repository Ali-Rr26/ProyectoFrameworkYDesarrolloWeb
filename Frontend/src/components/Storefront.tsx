import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/auth';
import { useCatalog } from '../offline/useCatalog';

const Storefront = () => {
  const { user } = useAuth();
  // Catálogo desde la copia local (IndexedDB), refrescada con la red: funciona sin conexión.
  const { products, loading } = useCatalog();
  const featured = products.slice(0, 4);
  const categories = useMemo(
    () => Array.from(new Set(products.map((product) => product.category))).sort(),
    [products],
  );

  return (
    <div>
      {/* ===== HERO: ocupa toda la pantalla (min-h-screen) ===== */}
      <section className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-[#338b85] via-[#5dc1b9] to-[#005954] text-white overflow-hidden">
        {/* Decoración de fondo (círculos difuminados) */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-[#9ce0db]/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-24 w-[28rem] h-[28rem] bg-[#5dc1b9]/30 rounded-full blur-3xl" />

        <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
          <p className="text-sm md:text-base uppercase tracking-widest text-white mb-4">
            Catálogo de venta multinivel
          </p>
          <h1 className="text-4xl md:text-6xl font-extrabold leading-tight mb-6">
            Belleza que se comparte,{" "}
            <span className="text-[#b9e4df]">
              ganancias que crecen
            </span>
          </h1>
          <p className="text-lg md:text-xl text-white mb-10 max-w-2xl mx-auto">
            Explora nuestra línea de cosméticos premium y descubre cómo tu red de
            referidos genera comisiones en cada nivel.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/catalog"
              className="bg-white text-[#338b85] font-bold px-8 py-4 rounded-lg hover:bg-slate-100 transition shadow-lg"
            >
              Ver Catálogo Completo
            </Link>
            {/* La red multinivel (Mi Red) es exclusiva del administrador:
                no se muestra a los clientes para evitar enlaces no funcionales */}
            {user?.role === "admin" && (
              <Link
                to="/my-network"
                className="border-2 border-white/60 text-white font-bold px-8 py-4 rounded-lg hover:bg-white/10 transition"
              >
                Conocer el Plan Multinivel
              </Link>
            )}
          </div>
        </div>

        {/* Indicador de scroll */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-indigo-200 animate-bounce">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </section>

      {/* ===== SECCIÓN DE CATEGORÍAS ===== */}
      <section className="py-16 px-6 max-w-6xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-800 text-center mb-10">
          Explora por Categoría
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {categories.map((category) => (
            <Link
              key={category}
              to={`/catalog?category=${encodeURIComponent(category)}`}
              className="bg-white border border-slate-200 rounded-xl p-6 text-center shadow-sm hover:shadow-md hover:border-[#5dc1b9] hover:-translate-y-1 transition-all"
            >
              <p className="font-semibold text-slate-700">{category}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ===== PRODUCTOS DESTACADOS ===== */}
      <section className="py-16 px-6 bg-slate-100">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-800 text-center mb-10">
            Productos Destacados
          </h2>

          {loading ? (
            <p className="text-center text-slate-500">Cargando destacados...</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {featured.map((product) => (
                <Link
                  key={product.id}
                  to={`/product/${product.id}`}
                  className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all group"
                >
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-48 object-cover group-hover:scale-105 transition-transform"
                  />
                  <div className="p-4">
                    <p className="text-xs uppercase tracking-wide text-[#40d9d8] font-semibold">
                      {product.category}
                    </p>
                    <h3 className="font-semibold text-slate-800 mt-1">{product.name}</h3>
                    <p className="text-[#20b2aa] font-bold mt-2">${product.price.toFixed(2)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ===== CÓMO FUNCIONA (PLAN MULTINIVEL) ===== */}
      <section className="py-16 px-6 max-w-6xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-800 text-center mb-12">
          ¿Cómo funciona el plan multinivel?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              step: "1",
              title: "Explora y compra",
              text: "Elige tus productos favoritos del catálogo y genera tu primera venta.",
            },
            {
              step: "2",
              title: "Invita a tu red",
              text: "Comparte tu enlace de referido. Cada invitado suma un nivel en tu red.",
            },
            {
              step: "3",
              title: "Gana comisiones",
              text: "Recibe 10 %, 5 % y 2 % de las ventas de tus niveles 1, 2 y 3.",
            },
          ].map((item) => (
            <div
              key={item.step}
              className="bg-white border border-slate-200 rounded-xl p-8 text-center shadow-sm"
            >
              <div className="w-12 h-12 mx-auto rounded-full bg-[#20b2aa] text-white font-bold text-xl flex items-center justify-center mb-4">
                {item.step}
              </div>
              <h3 className="font-bold text-slate-800 mb-2">{item.title}</h3>
              <p className="text-slate-500 text-sm">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== LLAMADA FINAL ===== */}
      <section className="py-20 px-6 bg-[#338b85] text-center">
        <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
          Comienza tu propia red hoy
        </h2>
        <p className="text-slate-300 mb-8 max-w-xl mx-auto">
          Únete a MultiCatálogo y transforma tu red de contactos en un negocio
          de cosméticos premium.
        </p>
        {/* El texto del botón debe reflejar su destino: ya estamos en /store */}
        <Link
          to="/catalog"
          className="inline-block bg-[#5dc1b9] text-white font-bold px-10 py-4 rounded-lg hover:bg-[#20b2aa] transition shadow-lg"
        >
          Explorar el Catálogo
        </Link>
      </section>
    </div>
  );
};

export default Storefront;