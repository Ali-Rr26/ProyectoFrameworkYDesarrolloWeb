// src/components/ProductForm.tsx
import { type FormEvent } from 'react';
import type { Product, ProductInput } from '../data/products';
import { useDraft } from '../offline/useDraft';

// Errores por campo que devuelve el backend en APIError.details
export type ProductFieldErrors = Record<string, string>;

interface ProductFormProps {
  // Producto a editar; sin él, el formulario crea uno nuevo
  product?: Product;
  categories: string[];
  saving: boolean;
  fieldErrors: ProductFieldErrors;
  // Resuelve true si el servidor guardó el producto (entonces se borra el borrador).
  onSubmit: (input: ProductInput) => Promise<boolean>;
  onCancel: () => void;
}

const inputClass =
  'w-full min-h-11 px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#20b2aa] focus:border-[#20b2aa] outline-none transition';

// Formulario de alta/edición de productos (mobile-first: un campo por fila).
// Valores tal como se escriben (texto); se convierten al enviar.
type ProductFormValues = {
  name: string;
  description: string;
  category: string;
  price: string;
  stock: string;
  image: string;
  // La galería se edita como una URL por línea
  gallery: string;
};

const ProductForm = ({ product, categories, saving, fieldErrors, onSubmit, onCancel }: ProductFormProps) => {
  // Borrador local por producto (o "nuevo"): lo escrito sobrevive a recargas y a la falta de conexión.
  const [values, setValues, clearDraft] = useDraft<ProductFormValues>(
    product ? `product:${product.id}` : 'product:new',
    () => ({
      name: product?.name ?? '',
      description: product?.description ?? '',
      category: product?.category ?? categories[0] ?? '',
      price: product ? String(product.price) : '',
      stock: product ? String(product.stock) : '0',
      image: product?.image ?? '',
      gallery: (product?.gallery ?? []).join('\n'),
    }),
  );
  const { name, description, category, price, stock, image, gallery } = values;
  const setField = (field: keyof ProductFormValues) => (value: string) =>
    setValues((prev) => ({ ...prev, [field]: value }));
  const setName = setField('name');
  const setDescription = setField('description');
  const setCategory = setField('category');
  const setPrice = setField('price');
  const setStock = setField('stock');
  const setImage = setField('image');
  const setGallery = setField('gallery');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const saved = await onSubmit({
      name,
      description,
      category,
      price: Number(price),
      stock: Number.parseInt(stock, 10) || 0,
      image,
      gallery: gallery.split('\n').map((url) => url.trim()).filter(Boolean),
    });
    if (saved) await clearDraft();
  };

  // Cancelar descarta el borrador.
  const handleCancel = () => {
    void clearDraft();
    onCancel();
  };

  const error = (field: string) =>
    fieldErrors[field] && <p className="text-red-600 text-xs mt-1">{fieldErrors[field]}</p>;

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4 mb-6">
      <h2 className="text-lg font-bold text-slate-800">{product ? `Editar: ${product.name}` : 'Nuevo producto'}</h2>

      <div>
        <label htmlFor="p-name" className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
        <input id="p-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
        {error('name')}
      </div>

      <div>
        <label htmlFor="p-description" className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
        <textarea id="p-description" rows={3} className={`${inputClass} py-3`} value={description}
          onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div>
        <label htmlFor="p-category" className="block text-sm font-medium text-slate-700 mb-1">Categoría *</label>
        <select id="p-category" className={`${inputClass} bg-white`} value={category} onChange={(e) => setCategory(e.target.value)} required>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {error('category')}
      </div>

      <div>
        <label htmlFor="p-price" className="block text-sm font-medium text-slate-700 mb-1">Precio (USD) *</label>
        <input id="p-price" type="number" inputMode="decimal" min="0.01" step="0.01" className={inputClass}
          value={price} onChange={(e) => setPrice(e.target.value)} required />
        {error('price')}
      </div>

      <div>
        <label htmlFor="p-stock" className="block text-sm font-medium text-slate-700 mb-1">Stock *</label>
        <input id="p-stock" type="number" inputMode="numeric" min="0" step="1" className={inputClass}
          value={stock} onChange={(e) => setStock(e.target.value)} required />
        {error('stock')}
      </div>

      <div>
        <label htmlFor="p-image" className="block text-sm font-medium text-slate-700 mb-1">URL de la imagen principal *</label>
        <input id="p-image" type="url" className={inputClass} value={image} onChange={(e) => setImage(e.target.value)}
          placeholder="https://..." maxLength={500} required />
        {error('image')}
      </div>

      <div>
        <label htmlFor="p-gallery" className="block text-sm font-medium text-slate-700 mb-1">
          Galería <span className="text-slate-400 font-normal">(una URL por línea, opcional)</span>
        </label>
        <textarea id="p-gallery" rows={3} className={`${inputClass} py-3 font-mono text-sm`} value={gallery}
          onChange={(e) => setGallery(e.target.value)} />
        {Object.keys(fieldErrors).some((k) => k.startsWith('gallery')) && (
          <p className="text-red-600 text-xs mt-1">Revisa las URLs de la galería</p>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button type="submit" disabled={saving}
          className="min-h-11 px-6 bg-[#20b2aa] text-white font-semibold rounded-lg hover:bg-[#008080] transition disabled:opacity-50">
          {saving ? 'Guardando...' : product ? 'Guardar cambios' : 'Crear producto'}
        </button>
        <button type="button" onClick={handleCancel} disabled={saving}
          className="min-h-11 px-6 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition">
          Cancelar
        </button>
      </div>
    </form>
  );
};

export default ProductForm;
