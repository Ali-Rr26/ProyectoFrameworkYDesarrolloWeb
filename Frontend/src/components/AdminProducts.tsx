// src/components/AdminProducts.tsx
import { useEffect, useState } from 'react';
import type { Product, ProductInput } from '../data/products';
import { ApiError } from '../services/apiClient';
import {
  createProduct,
  deactivateProduct,
  getAdminProducts,
  getCategories,
  updateProduct,
} from '../services/productService';
import ProductForm, { type ProductFieldErrors } from './ProductForm';

// Estado del formulario: cerrado, creando o editando un producto
type FormState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; product: Product };

const AdminProducts = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [form, setForm] = useState<FormState>({ mode: 'closed' });
  const [fieldErrors, setFieldErrors] = useState<ProductFieldErrors>({});
  const [saving, setSaving] = useState<boolean>(false);
  // ID del producto que se está activando/desactivando
  const [togglingId, setTogglingId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([getAdminProducts(), getCategories()])
      .then(([list, cats]) => {
        setProducts(list);
        setCategories(cats);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudo cargar el catálogo'))
      .finally(() => setLoading(false));
  }, []);

  // Reemplaza (o agrega) el producto devuelto por el servidor en la lista
  const upsert = (saved: Product) =>
    setProducts((prev) =>
      prev.some((p) => p.id === saved.id) ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved]
    );

  const openForm = (next: FormState) => {
    setFieldErrors({});
    setError('');
    setForm(next);
  };

  const handleSubmit = async (input: ProductInput) => {
    setSaving(true);
    setError('');
    setFieldErrors({});
    try {
      const saved = form.mode === 'edit' ? await updateProduct(form.product.id, input) : await createProduct(input);
      upsert(saved);
      setForm({ mode: 'closed' });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.details && typeof err.details === 'object') setFieldErrors(err.details as ProductFieldErrors);
      } else {
        setError('No se pudo guardar el producto');
      }
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
      upsert(product.active ? await deactivateProduct(product.id) : await updateProduct(product.id, { active: true }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar el producto');
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) return <p className="text-slate-500">Cargando productos...</p>;

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

      {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 border border-red-200">{error}</div>}

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

      {products.length === 0 ? (
        <p className="text-slate-500">No hay productos registrados.</p>
      ) : (
        <ul className="space-y-3">
          {products.map((product) => (
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
      )}
    </div>
  );
};

export default AdminProducts;
