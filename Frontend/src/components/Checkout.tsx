import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/cart';
import { createOrder, getPaymentMethods } from '../services/orderService';
import { ApiError } from '../services/apiClient';
import type { ConfirmedOrder } from './Confirmation';

interface ShippingData {
  name: string;
  email: string;
  address: string;
  city: string;
  phone: string;
  paymentMethod: string;
}

const Checkout = () => {
  const { cart, totalPrice, clearCart } = useCart();
  const navigate = useNavigate();

  const [shipping, setShipping] = useState<ShippingData>({
    name: "",
    email: "",
    address: "",
    city: "",
    phone: "",
    paymentMethod: "",
  });
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [processing, setProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  // Métodos de pago desde la BD (tabla payment_methods); se preselecciona el primero
  useEffect(() => {
    getPaymentMethods()
      .then((methods) => {
        setPaymentMethods(methods);
        setShipping((prev) => (prev.paymentMethod ? prev : { ...prev, paymentMethod: methods[0] ?? "" }));
      })
      .catch(() => setError("No se pudieron cargar los métodos de pago"));
  }, []);

  // Si el carrito está vacío, mostramos un aviso en lugar del formulario
  if (cart.length === 0) {
    return (
      <div className="bg-white p-10 rounded-lg border border-slate-200 text-center">
        <p className="text-slate-600 text-lg mb-4">No tienes productos en el carrito.</p>
        <Link to="/catalog" className="text-indigo-600 font-semibold hover:underline">
          ← Ir al catálogo
        </Link>
      </div>
    );
  }

  const handleChange = (field: keyof ShippingData, value: string) => {
    setShipping((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setProcessing(true);
    setError("");

    try {
      // El backend registra el pedido en una transacción: descuenta stock y usa
      // los precios de la BD. El comprador se toma del JWT, no del formulario.
      const created = await createOrder({
        payment_method: shipping.paymentMethod,
        shipping_address: shipping.address,
        city: shipping.city,
        phone: shipping.phone,
        items: cart.map((item) => ({ product_id: item.id, quantity: item.quantity })),
      });

      // Los datos de la confirmación salen de la respuesta del servidor (no del carrito local)
      const order: ConfirmedOrder = {
        number: `MC-${created.id.toString().padStart(6, "0")}`,
        items: created.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.unit_price,
        })),
        total: created.total,
        customer: { name: shipping.name, email: shipping.email, city: shipping.city },
        date: new Date(created.created_at).toLocaleString("es-EC"),
      };

      // Vaciamos el carrito y pasamos los datos del pedido a la confirmación
      clearCart();
      navigate("/confirmation", { state: { order } });
    } catch (err) {
      // p. ej. "Stock insuficiente" (409) o "Referencia inválida" (422) con su detalle
      if (err instanceof ApiError) {
        const detail = typeof err.details === "string" ? ` (${err.details})` : "";
        setError(`${err.message}${detail}`);
      } else {
        setError("No se pudo conectar con el servidor");
      }
      setProcessing(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Finalizar Compra</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ===== FORMULARIO DE ENVÍO ===== */}
        <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-5">
          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Datos de Envío</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre completo *
                </label>
                <input
                  type="text"
                  required
                  value={shipping.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#20b2aa] outline-none transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Correo electrónico *
                </label>
                <input
                  type="email"
                  required
                  value={shipping.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#20b2aa] outline-none transition"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Dirección *
                </label>
                <input
                  type="text"
                  required
                  value={shipping.address}
                  onChange={(e) => handleChange("address", e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#20b2aa] outline-none transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Ciudad *
                </label>
                <input
                  type="text"
                  required
                  value={shipping.city}
                  onChange={(e) => handleChange("city", e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#20b2aa] outline-none transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Teléfono *
                </label>
                <input
                  type="tel"
                  required
                  value={shipping.phone}
                  onChange={(e) => handleChange("phone", e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#20b2aa] outline-none transition"
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Método de Pago</h2>
            <div className="space-y-3">
              {paymentMethods.map((method) => (
                <label
                  key={method}
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:border-indigo-300 transition"
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={method}
                    checked={shipping.paymentMethod === method}
                    onChange={(e) => handleChange("paymentMethod", e.target.value)}
                    className="accent-[#20b2aa]"
                  />
                  <span className="text-sm text-slate-700">{method}</span>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm text-center border border-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={processing || !shipping.paymentMethod}
            className="w-full bg-[#20b2aa] text-white py-3 rounded-lg font-semibold hover:bg-[#008080] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? "Procesando pago..." : "Confirmar Pedido"}
          </button>
        </form>

        {/* ===== RESUMEN DEL PEDIDO ===== */}
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm h-fit">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Resumen del Pedido</h2>
          <div className="space-y-3 border-b border-slate-100 pb-4 mb-4">
            {cart.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-slate-600">
                  {item.name} × {item.quantity}
                </span>
                <span className="font-semibold text-slate-800">
                  ${(item.price * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-800 font-bold">Total</span>
            <span className="text-2xl font-bold text-indigo-600">
              ${totalPrice.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;