// src/components/AdminProducts.tsx
import { useEffect, useState } from 'react';
import type { Page } from '../data/orders';
import type { Product, ProductInput } from '../data/products';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { ApiError } from '../services/apiClient';
import {
  createProduct,
  deactivateProduct,
  getAdminProducts,
  getCategories,
  updateProduct,
} from '../services/productService';
import Pagination from './Pagination';
import ProductForm, { type ProductFieldErrors } from './ProductForm';
import SearchInput from './SearchInput';

const PAGE_SIZE = 10;

// Estado del formulario: cerrado, creando o editando un producto
type FormState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; product: Product };

// /admin/products: productos paginados (incluidos los dados de baja) con búsqueda en el
// servidor (?q=) y alta, edición y baja lógica.
const AdminProducts = () => {
  const [search, setSearch] = useState<string>('');
  const q = useDebouncedValue(search.trim());
  // La página pertenece a una búsqueda: al cambiar el texto se vuelve a la primera.
  const [paging, setPaging] = useState<{ q: string; page: number }>({ q: '', page: 1 });
  const page = paging.q === q ? paging.page : 1;
  // Se incrementa tras crear un producto para volver a pedir la página actual.
  const [version, setVersion] = useState<number>(0);
  const key = `${q}|${page}|${version}`;

  const [result, setResult] = useState<{ key: string; products: Page<Product> } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState<string>('');
  const [form, setForm] = useState<FormState>({ mode: 'closed' });
  const [fieldErrors, setFieldErrors] = useState<ProductFieldErrors>({});
  const [saving, setSaving] = useState<boolean>(false);
  // ID del producto que se está activando/desactivando
  const [togglingId, setTogglingId] = useState<number | null>(null);

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudieron cargar las categorías'));
  }, []);

  useEffect(() => {
    let active = true;
    getAdminProducts(page, PAGE_SIZE, q)
      .then((products) => active && setResult({ key, products }))
      .catch((err) => active && setFailure({
        key,
        message: err instanceof ApiError ? err.message : 'No se pudo cargar el catálogo',
      }));
    return () => {
      active = false;
    };
  }, [key, page, q]);

  const loadError = failure?.key === key ? failure.message : '';
  const products = result?.products;

  // Reemplaza en la página el producto devuelto por el servidor
  const replace = (saved: Product) =>
    setResult((prev) => prev && {
      ...prev,
      products: { ...prev.products, data: prev.products.data.map((p) => (p.id === saved.id ? saved : p)) },
    });

  const openForm = (next: FormState) => {
    setFieldErrors({});
    setError('');
    setForm(next);
  };

  // Devuelve true si se guardó: ProductForm borra entonces su borrador local.
  const handleSubmit = async (input: ProductInput): Promise<boolean> => {
    setSaving(true);
    setError('');
    setFieldErrors({});
    try {
      if (form.mode === 'edit') {
        replace(await updateProduct(form.product.id, input));
      } else {
        // El nuevo producto puede caer en otra página o fuera de la búsqueda: se recarga.
        await createProduct(input);
        setVersion((v) => v + 1);
      }
      setForm({ mode: 'closed' });
      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.details && typeof err.details === 'object') setFieldErrors(err.details as ProductFieldErrors);
      } else {
        setError('No se pudo guardar el producto');
      }
      return false;
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (product: Product) => {
    const action = product.active ? 'dar de baja' : 'reactivar';
    if (!window.confirm(`¿Seguro que deseas ${action} "${product.name}"?`)) return;
    setTogglingId(product.id);
    setError('');
    try {
      // Baja lógica con DELETE; la reactivación es una edición de "active"
      replace(product.active ? await deactivateProduct(product.id) : await updateProduct(product.id, { active: true }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar el producto');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Productos</h1>
          <p className="text-slate-500">Crea, edita y da de baja productos del catálogo.</p>
        </div>
        {form.mode === 'closed' && (
          <button type="button" onClick={() => openForm({ mode: 'create' })}
            className="min-h-11 px-6 bg-[#20b2aa] text-white font-semibold rounded-lg hover:bg-[#008080] transition">
            + Nuevo producto
          </button>
        )}
      </div>

      {(error || loadError) && (
        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 border border-red-200">{error || loadError}</div>
      )}

      {form.mode !== 'closed' && (
        <ProductForm
          // key remonta el formulario al cambiar de producto (estado inicial nuevo)
          key={form.mode === 'edit' ? form.product.id : 'new'}
          product={form.mode === 'edit' ? form.product : undefined}
          categories={categories}
          saving={saving}
          fieldErrors={fieldErrors}
          onSubmit={handleSubmit}
          onCancel={() => setForm({ mode: 'closed' })}
        />
      )}

      <SearchInput id="product-search" label="Buscar" placeholder="Nombre o categoría"
        value={search} onChange={setSearch} />

      {!products && !loadError && <p className="text-slate-500">Cargando productos...</p>}
      {products && products.data.length === 0 && (
        <p className="text-slate-500">{q ? `No hay productos que coincidan con "${q}".` : 'No hay productos registrados.'}</p>
      )}
      {products && products.data.length > 0 && (
        <>
          <ul className={`space-y-3 ${result?.key === key ? '' : 'opacity-60 transition-opacity'}`}>
            {products.data.map((product) => (
              <li key={product.id}
                className={`bg-white rounded-lg border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-4 ${product.active ? '' : 'opacity-60'}`}>
                <img src={product.image} alt={product.name} className="w-16 h-16 rounded object-cover bg-slate-100 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{product.name}</p>
                  <p className="text-sm text-slate-500">
                    {product.category} · ${product.price.toFixed(2)} · Stock: {product.stock}
                  </p>
                  <span className={`inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                    product.active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
                    {product.active ? 'Activo' : 'Dado de baja'}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button type="button" onClick={() => openForm({ mode: 'edit', product })}
                    className="min-h-11 px-4 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition">
                    Editar
                  </button>
                  <button type="button" disabled={togglingId === product.id} onClick={() => toggleActive(product)}
                    className={`min-h-11 px-4 rounded-lg font-semibold transition disabled:opacity-50 ${
                      product.active ? 'border border-red-300 text-red-600 hover:bg-red-50' : 'bg-[#20b2aa] text-white hover:bg-[#008080]'}`}>
                    {togglingId === product.id ? 'Guardando...' : product.active ? 'Dar de baja' : 'Reactivar'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={products.page} limit={products.limit} total={products.total}
            onChange={(next) => setPaging({ q, page: next })} />
        </>
      )}
    </div>
  );
};

export default AdminProducts;
