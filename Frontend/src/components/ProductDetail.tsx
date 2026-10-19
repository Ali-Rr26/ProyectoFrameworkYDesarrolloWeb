import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getProductById } from '../services/productService';
import type { Product } from '../data/products';
import { useCart } from '../context/cart';

const ProductDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToCart, getQuantityInCart } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeImage, setActiveImage] = useState<number>(0);
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false);
  const [added, setAdded] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    getProductById(Number(id))
      .then((data) => {
        if (!active) return;
        setProduct(data);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  // Cerrar el lightbox con la tecla Escape
  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [lightboxOpen]);

  if (loading) {
    return <div className="text-center p-8">Cargando producto...</div>;
  }

  if (!product) {
    return (
      <div className="bg-white p-10 rounded-lg border border-slate-200 text-center">
        <p className="text-slate-600 text-lg mb-4">Producto no encontrado.</p>
        <Link to="/catalog" className="text-indigo-600 font-semibold hover:underline">
          ← Volver al catálogo
        </Link>
      </div>
    );
  }

  // Todas las imágenes de la galería: principal + adicionales
  const images = [product.image, ...product.gallery];

  // Sin stock o con todas las unidades ya en el carrito no se puede agregar más
  const soldOut = product.stock <= 0;
  const limitReached = !soldOut && getQuantityInCart(product.id) >= product.stock;

  const handleAddToCart = () => {
    if (!addToCart(product)) return;
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  const handlePrev = () =>
    setActiveImage((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  const handleNext = () =>
    setActiveImage((prev) => (prev === images.length - 1 ? 0 : prev + 1));

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="text-[#20b2aa] font-semibold hover:underline mb-6"
      >
        ← Volver
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ===== GALERÍA DE IMÁGENES ===== */}
        <div>
          <img
            src={images[activeImage]}
            alt={product.name}
            onClick={() => setLightboxOpen(true)}
            className="w-full h-80 md:h-96 object-cover rounded-xl border border-slate-200 cursor-zoom-in"
          />
          <div className="flex gap-3 mt-4">
            {images.map((image, idx) => (
              <button
                key={image}
                onClick={() => setActiveImage(idx)}
                className={`rounded-lg overflow-hidden border-2 transition ${idx === activeImage
                    ? "border-[#20b2aa]"
                    : "border-transparent opacity-70 hover:opacity-100"
                  }`}
              >
                <img src={image} alt={`Vista ${idx + 1}`} className="w-20 h-16 object-cover" />
              </button>
            ))}
          </div>
        </div>

        {/* ===== INFORMACIÓN DEL PRODUCTO ===== */}
        <div>
          <p className="text-xs uppercase tracking-wide text-[#20b2aa] font-semibold">
            {product.category}
          </p>
          <h1 className="text-3xl font-bold text-slate-800 mt-1 mb-3">{product.name}</h1>
          <p className="text-3xl font-bold text-[#20b2aa] mb-2">
            ${product.price.toFixed(2)}
          </p>
          <p className={`text-sm mb-6 ${soldOut ? "text-red-600 font-semibold" : product.stock <= 5 ? "text-amber-600 font-semibold" : "text-slate-500"}`}>
            {soldOut ? "Producto agotado" : product.stock <= 5 ? `¡Solo quedan ${product.stock} unidades!` : `${product.stock} unidades disponibles`}
          </p>
          <p className="text-slate-600 leading-relaxed mb-8">{product.description}</p>

          <button
            onClick={handleAddToCart}
            disabled={soldOut || limitReached}
            className={`w-full md:w-auto px-10 py-4 rounded-lg font-bold transition shadow-md disabled:bg-slate-300 disabled:cursor-not-allowed ${added
                ? "bg-green-600 text-white"
                : "bg-[#20b2aa] text-white hover:bg-[#008080]"
              }`}
          >
            {soldOut
              ? "Agotado"
              : limitReached
                ? "Ya tienes todas las unidades disponibles"
                : added
                  ? "✓ Añadido al carrito"
                  : "Añadir al Carrito"}
          </button>
        </div>
      </div>

      {/* ===== LIGHTBOX: imagen a pantalla completa ===== */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/95 flex items-center justify-center"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            className="absolute top-5 right-5 text-white text-4xl hover:text-slate-300 transition"
            onClick={() => setLightboxOpen(false)}
            aria-label="Cerrar"
          >
            ×
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            className="absolute left-4 md:left-10 text-white text-4xl hover:text-[#5dc1b9] transition"
            aria-label="Anterior"
          >
            ‹
          </button>

          <img
            src={images[activeImage]}
            alt={product.name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-[85vw] object-contain rounded-lg"
          />

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            className="absolute right-4 md:right-10 text-white text-4xl hover:text-[#5dc1b9] transition"
            aria-label="Siguiente"
          >
            ›
          </button>

          <p className="absolute bottom-6 text-white/80 text-sm">
            {activeImage + 1} / {images.length}
          </p>
        </div>
      )}
    </div>
  );
};

export default ProductDetail;
