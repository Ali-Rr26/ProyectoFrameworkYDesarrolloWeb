// src/components/Catalog.tsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { getProducts } from '../services/productService';
import CustomSelect from './CustomSelect';
import type { Product } from '../data/products';

// Opción del filtro que muestra todas las categorías (texto visible en la interfaz)
const ALL_CATEGORIES = 'Todas';

const Catalog = () => {
  const { addToCart } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Lectura del query string (?category=...) enviado desde el Storefront
  const [searchParams, setSearchParams] = useSearchParams();

  // Estado de los filtros
  const [search, setSearch] = useState<string>('');
  const [category, setCategory] = useState<string>(searchParams.get('category') ?? ALL_CATEGORIES);

  // Extraer categorías únicas del backend
  const categories = useMemo(() => {
    const names = products.map((product) => product.category);
    return Array.from(new Set(names)).sort();
  }, [products]);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const data = await getProducts();
        setProducts(data);
      } catch (err) {
        setError('No se pudieron cargar los productos');
        console.error('Error fetch:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  // Filtrado con useMemo: solo se recalcula cuando cambian search/category/products
  const filteredProducts = useMemo(() => {
    const text = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = category === ALL_CATEGORIES || product.category === category;
      const matchesText =
        text === '' ||
        product.name.toLowerCase().includes(text) ||
        product.description.toLowerCase().includes(text);
      return matchesCategory && matchesText;
    });
  }, [products, search, category]);

  const handleCategoryChange = (value: string) => {
    setCategory(value);
    // Sincronizamos el query string para que la URL sea compartible
    if (value === ALL_CATEGORIES) {
      setSearchParams({});
    } else {
      setSearchParams({ category: value });
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
        {filteredProducts.length} producto(s) encontrado(s)
      </p>

      {/* ===== BARRA DE BÚSQUEDA Y FILTROS ===== */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o descripción..."
          className="flex-1 px-4 py-3 rounded-lg border border-slate-300 bg-slate-50 focus:border-2 focus:border-[#20b2aa] focus:bg-white outline-none transition"
        />
        <div className="w-full md:w-64">
          <CustomSelect
            value={category}
            onChange={handleCategoryChange}
            options={[ALL_CATEGORIES, ...categories]}
            placeholder="Todas las categorías"
          />
        </div>
      </div>

      {/* ===== GRILLA DE PRODUCTOS ===== */}
      {filteredProducts.length === 0 ? (
        <div className="bg-white p-10 rounded-lg border border-slate-200 text-center">
          <p className="text-slate-500">
            No hay productos que coincidan con tu búsqueda.
          </p>
          <button
            onClick={() => {
              setSearch('');
              setCategory(ALL_CATEGORIES);
              setSearchParams({});
            }}
            className="mt-4 text-[#20b2aa] font-semibold hover:underline"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className="bg-white rounded-lg overflow-hidden border border-slate-200 shadow-sm flex flex-col"
            >
              <Link to={`/product/${product.id}`}>
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-40 object-cover hover:opacity-90 transition"
                />
              </Link>
              <div className="p-4 flex flex-col flex-1">
                <p className="text-xs uppercase tracking-wide text-[#20b2aa] font-semibold">
                  {product.category}
                </p>
                <Link to={`/product/${product.id}`}>
                  <h3 className="font-semibold text-slate-700 hover:text-[#20b2aa] transition">
                    {product.name}
                  </h3>
                </Link>
                <p className="text-[#20b2aa] font-bold mt-2 mb-4">
                  ${product.price.toFixed(2)}
                </p>

                <button
                  onClick={() => addToCart(product)}
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

export default Catalog;
