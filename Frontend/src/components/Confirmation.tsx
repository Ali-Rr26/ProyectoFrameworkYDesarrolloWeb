import { Link, useLocation } from 'react-router-dom';

// Datos del pedido que Checkout envía a esta pantalla mediante el state del router
export interface ConfirmedOrder {
  number: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  customer: { name: string; email: string; city: string };
  date: string;
}

// Pedido guardado sin conexión (outbox): aún no tiene número; se envía al volver la red.
export interface QueuedOrder {
  items: { name: string; quantity: number; price: number }[];
  total: number;
  customer: { name: string; email: string; city: string };
}

const Confirmation = () => {
  const location = useLocation();
  const state = location.state as { order?: ConfirmedOrder; queued?: QueuedOrder } | null;
  const order = state?.order;
  const queued = state?.queued;

  if (queued) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-amber-500 text-white p-8 text-center">
            <div className="text-5xl mb-3">⏳</div>
            <h1 className="text-2xl font-bold">Pedido guardado</h1>
            <p className="text-amber-50 mt-1">
              Se enviará automáticamente al volver la conexión. El número de pedido se asigna al enviarse.
            </p>
          </div>
          <div className="p-8">
            <div className="space-y-2 border-b border-slate-100 pb-4 mb-4">
              {queued.items.map((item) => (
                <div key={item.name} className="flex justify-between text-sm">
                  <span className="text-slate-600">{item.name} × {item.quantity}</span>
                  <span className="font-semibold text-slate-800">${(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center mb-6">
              <span className="text-slate-800 font-bold">Total estimado</span>
              <span className="text-2xl font-bold text-slate-800">${queued.total.toFixed(2)}</span>
            </div>
            <p className="text-sm text-slate-500 mb-6">
              Si al enviarse cambió el precio o no hay stock suficiente, te avisaremos para que lo revises
              antes de confirmarlo.
            </p>
            <Link
              to="/store"
              className="inline-block bg-[#20b2aa] text-white font-semibold px-6 py-3 rounded-lg hover:bg-[#008080] transition"
            >
              Volver a la Tienda
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Si no hay datos de pedido (acceso directo a la URL), mostramos un mensaje genérico
  if (!order) {
    return (
      <div className="bg-white p-10 rounded-lg border border-slate-200 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">¡Gracias por tu compra!</h1>
        <p className="text-slate-500 mb-6">Tu pedido ha sido registrado correctamente.</p>
        <Link
          to="/store"
          className="inline-block bg-[#20b2aa] text-white font-semibold px-6 py-3 rounded-lg hover:bg-[#008080] transition"
        >
          Volver a la Tienda
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-green-600 text-white p-8 text-center">
          <div className="text-5xl mb-3">✓</div>
          <h1 className="text-2xl font-bold">¡Pedido confirmado!</h1>
          <p className="text-green-100 mt-1">
            Número de pedido: <span className="font-mono font-bold">{order.number}</span>
          </p>
        </div>

        <div className="p-8">
          <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
            <div>
              <p className="text-slate-500">Cliente</p>
              <p className="font-semibold text-slate-800">{order.customer.name}</p>
            </div>
            <div>
              <p className="text-slate-500">Fecha</p>
              <p className="font-semibold text-slate-800">{order.date}</p>
            </div>
            <div>
              <p className="text-slate-500">Correo</p>
              <p className="font-semibold text-slate-800">{order.customer.email}</p>
            </div>
            <div>
              <p className="text-slate-500">Ciudad</p>
              <p className="font-semibold text-slate-800">{order.customer.city}</p>
            </div>
          </div>

          <h2 className="font-bold text-slate-800 mb-3">Detalle del pedido</h2>
          <div className="space-y-2 border-b border-slate-100 pb-4 mb-4">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="text-slate-600">
                  {item.name} × {item.quantity}
                </span>
                <span className="font-semibold">
                  ${(item.price * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center mb-8">
            <span className="font-bold text-slate-800">Total pagado</span>
            <span className="text-2xl font-bold text-green-600">
              ${order.total.toFixed(2)}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              to="/my-orders"
              className="flex-1 min-h-11 text-center bg-[#20b2aa] text-white font-semibold py-3 rounded-lg hover:bg-[#008080] transition"
            >
              Ver mis pedidos
            </Link>
            <Link
              to="/store"
              className="flex-1 min-h-11 text-center border border-slate-300 text-slate-700 font-semibold py-3 rounded-lg hover:bg-slate-50 transition"
            >
              Seguir Comprando
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Confirmation;
