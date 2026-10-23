import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCart } from '../context/cart';
import { createOrder, type CreateOrderPayload } from '../services/orderService';
import { ApiError } from '../services/apiClient';
import type { ConfirmedOrder, QueuedOrder } from './Confirmation';
import { formatDateTime } from '../data/dates';
import { BUSINESS_TIMEZONE } from '../data/constants';
import { useDraft } from '../offline/useDraft';
import { loadPaymentMethods } from '../offline/paymentMethods';
import { useAuth } from '../context/auth';
import { draftOwner } from '../offline/drafts';
import { isOffline, sendOrQueue } from '../offline/outbox';
import { useOutbox } from '../offline/outboxContext';
import { recoverCart } from '../offline/cartRecovery';

// type (no interface): useDraft exige un objeto indexable por string.
type ShippingData = {
  name: string;
  email: string;
  address: string;
  city: string;
  phone: string;
  paymentMethod: string;
};

const Checkout = () => {
  const { cart, totalPrice, clearCart, replaceCart } = useCart();
  const { user } = useAuth();
  // Sin conexión el pedido se guarda en el outbox y se envía al volver la red.
  const { online } = useOutbox();
  const navigate = useNavigate();
  // Aviso al volver de un pedido rechazado (vista de pendientes): carrito actualizado.
  const notice = (useLocation().state as { notice?: string } | null)?.notice;

  // Datos de envío con borrador local: sobreviven a recargas, cierres y falta de conexión.
  const [shipping, setShipping, clearDraft] = useDraft<ShippingData>("checkout", {
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

  // Métodos de pago desde la BD (tabla payment_methods), con la última lista guardada
  // como respaldo sin conexión; se preselecciona el primero
  useEffect(() => {
    loadPaymentMethods()
      .then((methods) => {
        setPaymentMethods(methods);
        setShipping((prev) => (prev.paymentMethod ? prev : { ...prev, paymentMethod: methods[0] ?? "" }));
      })
      .catch(() => setError("No se pudieron cargar los métodos de pago"));
  }, [setShipping]);

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

    // El backend registra el pedido en una transacción: descuenta stock y usa
    // los precios de la BD. El comprador se toma del JWT, no del formulario.
    const order: CreateOrderPayload = {
      payment_method: shipping.paymentMethod,
      shipping_address: shipping.address,
      city: shipping.city,
      phone: shipping.phone,
      items: cart.map((item) => ({ product_id: item.id, quantity: item.quantity })),
    };
    // Guardado sin conexión: viaja el total que el cliente aceptó. Si al sincronizar los
    // precios cambiaron, el servidor responde 409 en lugar de cobrar otro monto (Fase 7).
    // Con red se envía sin él (el total del servidor se muestra en la confirmación).
    const payload: CreateOrderPayload = isOffline()
      ? { ...order, expected_total: Math.round(totalPrice * 100) / 100 }
      : order;
    const units = cart.reduce((sum, item) => sum + item.quantity, 0);

    try {
      // Con red se envía con Idempotency-Key (un doble clic o un reintento no duplica el
      // pedido); sin red, o si la red cae a mitad del envío, queda en el outbox.
      const outcome = await sendOrQueue(
        {
          userId: draftOwner(user?.email),
          type: 'checkout',
          method: 'POST',
          path: '/api/checkout',
          payload,
          label: `Pedido de ${units} ${units === 1 ? 'producto' : 'productos'} ($${totalPrice.toFixed(2)})`,
        },
        (key) => createOrder(payload, key),
      );

      if (outcome.status === 'queued') {
        const queued: QueuedOrder = {
          items: cart.map((item) => ({ name: item.name, quantity: item.quantity, price: item.price })),
          total: totalPrice,
          customer: { name: shipping.name, email: shipping.email, city: shipping.city },
        };
        await clearDraft();
        clearCart();
        navigate("/confirmation", { state: { queued } });
        return;
      }
      const created = outcome.result;

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
        date: formatDateTime(created.created_at, BUSINESS_TIMEZONE),
      };

      // Vaciamos el carrito y el borrador, y pasamos los datos del pedido a la confirmación
      await clearDraft();
      clearCart();
      navigate("/confirmation", { state: { order } });
    } catch (err) {
      // p. ej. "Stock insuficiente" (409) o "Producto no disponible" (422) con su detalle
      if (err instanceof ApiError) {
        const detail = typeof err.details === "string" ? ` (${err.details})` : "";
        let notes: string[] = [];
        // Stock, precio o producto cambiaron: el carrito se actualiza con los datos
        // vigentes y el cliente revisa y confirma de nuevo (nunca se reenvía solo).
        if (err.status === 409 || err.status === 422) {
          const recovered = await recoverCart(order.items);
          replaceCart(recovered.items);
          notes = recovered.notes;
        }
        setError([`${err.message}${detail}`, ...notes, ...(notes.length ? ["Revisa el carrito actualizado y confirma de nuevo."] : [])].join(". "));
      } else {
        setError("No se pudo conectar con el servidor");
      }
      setProcessing(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Finalizar Compra</h1>
      {notice && (
        <div className="bg-amber-50 text-amber-800 p-3 rounded-lg text-sm mb-6 border border-amber-200">{notice}</div>
      )}

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
            {processing ? "Procesando pago..." : online ? "Confirmar Pedido" : "Guardar pedido"}
          </button>
          {!online && (
            <p className="text-sm text-amber-700 text-center">
              Sin conexión: el pedido se guardará en este dispositivo y se enviará automáticamente al volver la conexión.
            </p>
          )}
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