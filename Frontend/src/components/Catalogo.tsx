// src/components/Catalogo.tsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { getProductos } from '../services/productosService';
import CustomSelect from './CustomSelect';
import type { Producto } from '../data/productos';

const Catalogo = () => {
  const { addToCart } = useCart();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Lectura del query string (?categoria=...) enviado desde el Storefront
  const [searchParams, setSearchParams] = useSearchParams();

  // Estado de los filtros
  const [busqueda, setBusqueda] = useState<string>('');
  const [categoria, setCategoria] = useState<string>(searchParams.get('categoria') ?? 'Todas');

  // Extraer categorías únicas del backend
  const categorias = useMemo(() => {
    const cats = productos.map((prod) => prod.categoria);
    return Array.from(new Set(cats)).sort();
  }, [productos]);

  useEffect(() => {
    const fetchProductos = async () => {
      try {
        const data = await getProductos();
        setProductos(data);
      } catch (err) {
        setError('No se pudieron cargar los productos');
        console.error('Error fetch:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProductos();
  }, []);

  // Filtrado con useMemo: solo se recalcula cuando cambian busqueda/categoria/productos
  const productosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return productos.filter((prod) => {
      const coincideCategoria = categoria === 'Todas' || prod.categoria === categoria;
      const coincideTexto =
        texto === '' ||
        prod.nombre.toLowerCase().includes(texto) ||
        prod.descripcion.toLowerCase().includes(texto);
      return coincideCategoria && coincideTexto;
    });
  }, [productos, busqueda, categoria]);

  const handleCategoriaChange = (value: string) => {
    setCategoria(value);
    // Sincronizamos el query string para que la URL sea compartible
    if (value === 'Todas') {
      setSearchParams({});
    } else {
      setSearchParams({ categoria: value });
    }
  };

  if (loading) {
    return <div className="text-center p-8">Cargando catálogo...</div>;
  }

  if (error) {
    return <div className="text-center text-red-600">{error}</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">Catálogo de Productos</h1>
      <p className="text-slate-500 mb-6">
        {productosFiltrados.length} producto(s) encontrado(s)
      </p>

      {/* ===== BARRA DE BÚSQUEDA Y FILTROS ===== */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o descripción..."
          className="flex-1 px-4 py-3 rounded-lg border border-slate-300 bg-slate-50 focus:border-2 focus:border-[#20b2aa] focus:bg-white outline-none transition"
        />
        <div className="w-full md:w-64">
          <CustomSelect
            value={categoria}
            onChange={handleCategoriaChange}
            options={['Todas', ...categorias]}
            placeholder="Todas las categorías"
          />
        </div>
      </div>

      {/* ===== GRILLA DE PRODUCTOS ===== */}
      {productosFiltrados.length === 0 ? (
        <div className="bg-white p-10 rounded-lg border border-slate-200 text-center">
          <p className="text-slate-500">
            No hay productos que coincidan con tu búsqueda.
          </p>
          <button
            onClick={() => {
              setBusqueda('');
              setCategoria('Todas');
              setSearchParams({});
            }}
            className="mt-4 text-[#20b2aa] font-semibold hover:underline"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {productosFiltrados.map((prod) => (
            <div
              key={prod.id}
              className="bg-white rounded-lg overflow-hidden border border-slate-200 shadow-sm flex flex-col"
            >
              <Link to={`/producto/${prod.id}`}>
                <img
                  src={prod.img}
                  alt={prod.nombre}
                  className="w-full h-40 object-cover hover:opacity-90 transition"
                />
              </Link>
              <div className="p-4 flex flex-col flex-1">
                <p className="text-xs uppercase tracking-wide text-[#20b2aa] font-semibold">
                  {prod.categoria}
                </p>
                <Link to={`/producto/${prod.id}`}>
                  <h3 className="font-semibold text-slate-700 hover:text-[#20b2aa] transition">
                    {prod.nombre}
                  </h3>
                </Link>
                <p className="text-[#20b2aa] font-bold mt-2 mb-4">
                  ${prod.precio.toFixed(2)}
                </p>

                <button
                  onClick={() => addToCart(prod)}
                  className="mt-auto w-full bg-[#20b2aa] text-white py-2 rounded text-sm hover:bg-[#008080] transition"
                >
                  Añadir al Carrito
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Catalogo;