// src/components/Catalogo.tsx
import { useCart } from '../context/CartContext';
import { useState, useEffect } from 'react';

interface Producto {
  id: number;
  nombre: string;
  precio: number;
  img: string;
}

const Catalogo = () => {
  const { addToCart } = useCart();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const fetchProductos = async () => {
      try {
        const response = await fetch('http://localhost:4000/api/productos');
        if (!response.ok) {
          throw new Error('Error al traer productos');
        }
        const data = await response.json();
        console.log('Datos del backend:', data);
        if (data && Array.isArray(data)) {
          setProductos(data);
        } else {
          setError('Formato de datos inválido');
        }
      } catch (err) {
        setError('No se pudieron cargar los productos');
        console.error('Error fetch:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProductos();
  }, []);

  /* Productos hardcodeados anterior
  const productos = [
    { id: 1, nombre: "Serum Revitalizante", precio: 45.00, img: "https://picsum.photos/seed/serum/150" },
    { id: 2, nombre: "Crema Hidratante Pro", precio: 32.50, img: "https://picsum.photos/seed/crema/150" },
    { id: 3, nombre: "Tónico Purificante", precio: 28.00, img: "https://picsum.photos/seed/tonico/150" },
    { id: 4, nombre: "Mascarilla Nocturna", precio: 50.00, img: "https://picsum.photos/seed/mascarilla/150" },
  ];
  */

  if (loading) {
    return <div className="text-center text-slate-600">Cargando productos...</div>;
  }

  if (error) {
    return <div className="text-center text-red-600">{error}</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Catálogo de Productos</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {productos.map((prod) => (
          <div key={prod.id} className="bg-white rounded-lg overflow-hidden border border-slate-200 shadow-sm flex flex-col">
            <img src={prod.img} alt={prod.nombre} className="w-full h-40 object-cover" />
            <div className="p-4 flex flex-col flex-1">
              <h3 className="font-semibold text-slate-700">{prod.nombre}</h3>
              <p className="text-[#20b2aa] font-bold mt-2 mb-4">${prod.precio ? prod.precio.toFixed(2) : 'N/A'}</p>

              <button
                onClick={() => addToCart({ id: prod.id, nombre: prod.nombre, precio: prod.precio, img: prod.img })}
                className="mt-auto w-full bg-[#20b2aa] text-white py-2 rounded text-sm hover:bg-[#008080] transition"
              >
                Añadir al Carrito
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Catalogo;