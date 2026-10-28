import React, { useState } from 'react';
import {
  FolderArchive,
  ArrowLeft,
  Play,
  Trash2,
  Clock,
  User,
  ShoppingBag,
  FileText,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { HeldOrder, StoreInfo, ScreenView } from '../../types/pos';
import { Header } from './Header';
import { Footer } from './Footer';

interface HeldOrdersScreenProps {
  heldOrders: HeldOrder[];
  onResumeOrder: (order: HeldOrder) => void;
  onDeleteOrder: (orderId: string) => void;
  onNavigate: (screen: ScreenView) => void;
  onOpenScanner: () => void;
  onOpenShortcuts: () => void;
  onResetSale: () => void;
  storeInfo: StoreInfo;
  cartCount: number;
}

export const HeldOrdersScreen: React.FC<HeldOrdersScreenProps> = ({
  heldOrders,
  onResumeOrder,
  onDeleteOrder,
  onNavigate,
  onOpenScanner,
  onOpenShortcuts,
  onResetSale,
  storeInfo,
  cartCount,
}) => {
  const [selectedOrder, setSelectedOrder] = useState<HeldOrder | null>(
    heldOrders[0] || null
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full overflow-hidden bg-[#fdfbf7]">
      {/* 1. Header on every screen */}
      <Header
        currentScreen="held-orders"
        onNavigate={onNavigate}
        heldOrdersCount={heldOrders.length}
        onOpenScanner={onOpenScanner}
        onOpenShortcuts={onOpenShortcuts}
        onResetSale={onResetSale}
        storeInfo={storeInfo}
        cartCount={cartCount}
      />

      {/* 2. Main Content Area */}
      <main className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden max-w-[1920px] mx-auto w-full">
        {/* Left List of Held Orders */}
        <div className="w-full md:w-1/2 lg:w-5/12 bg-white border-r border-[#e6dfd5] flex flex-col min-h-0 overflow-hidden">
          <div className="p-4 border-b border-[#e6dfd5] flex items-center justify-between shrink-0">
            <div>
              <h2 className="font-extrabold text-base text-stone-900 flex items-center gap-2">
                <FolderArchive className="w-5 h-5 text-amber-700" aria-hidden="true" />
                <span>Held &amp; Open Orders</span>
              </h2>
              <p className="text-xs text-stone-500">
                {heldOrders.length} parked transactions waiting to be resumed
              </p>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('checkout')}
              aria-label="Return to active checkout register"
              className="min-h-[44px] px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold transition"
            >
              Back to Register
            </button>
          </div>

          {/* Scrollable Held Orders List */}
          <div className="flex-1 min-h-0 overflow-y-auto touch-scroll overscroll-contain p-3 space-y-2">
            {heldOrders.length === 0 ? (
              <div className="py-12 text-center text-stone-400 p-4">
                <FolderArchive className="w-12 h-12 mx-auto mb-2 opacity-40 text-stone-500" aria-hidden="true" />
                <h3 className="text-sm font-bold text-stone-700">No held orders right now</h3>
                <p className="text-xs text-stone-500 mt-1">
                  You can park an active cart anytime using the Actions menu or pressing F4.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('checkout')}
                  className="mt-4 min-h-[44px] px-4 py-2 bg-[#064e3b] text-white rounded-xl text-xs font-bold shadow-sm"
                >
                  Start New Transaction
                </button>
              </div>
            ) : (
              heldOrders.map((order) => {
                const isSelected = selectedOrder?.id === order.id;
                const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);

                return (
                  <div
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className={`p-3.5 rounded-2xl border transition cursor-pointer flex flex-col gap-2 ${
                      isSelected
                        ? 'bg-amber-50/70 border-amber-400 shadow-xs'
                        : 'bg-white hover:bg-stone-50 border-stone-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-stone-900 font-mono">
                            #{order.orderNumber}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-700" aria-hidden="true" />
                            <span>Parked</span>
                          </span>
                        </div>
                        <p className="text-xs text-stone-600 font-medium mt-0.5 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-stone-400" aria-hidden="true" />
                          <span>{order.customerName || 'Walk-in Customer'}</span>
                        </p>
                      </div>

                      <div className="text-right">
                        <div className="font-black font-mono text-sm sm:text-base text-[#064e3b]">
                          {order.total.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-stone-400 font-bold">
                          {storeInfo.currency}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-stone-100 text-xs">
                      <span className="text-stone-500 font-medium">
                        {itemCount} item(s) • {order.timestamp}
                      </span>

                      {/* Quick Resume Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onResumeOrder(order);
                        }}
                        aria-label={`Resume held order #${order.orderNumber}`}
                        className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-[#064e3b] hover:bg-[#043b2c] text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                        <span>Resume</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Details Panel of Selected Held Order */}
        <div className="flex-1 bg-[#fdfbf7] flex flex-col min-h-0 overflow-hidden">
          {selectedOrder ? (
            <div className="flex-1 flex flex-col min-h-0 p-4 sm:p-6 overflow-hidden">
              <div className="bg-white rounded-3xl border border-[#e6dfd5] p-5 shadow-xs flex flex-col flex-1 min-h-0 overflow-hidden">
                {/* Header */}
                <div className="flex items-start justify-between pb-4 border-b border-stone-200 shrink-0">
                  <div>
                    <h3 className="font-black text-lg text-stone-900">
                      Order #{selectedOrder.orderNumber}
                    </h3>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Parked on {selectedOrder.timestamp} • Assigned to:{' '}
                      <strong>{selectedOrder.customerName || 'Walk-in Customer'}</strong>
                    </p>
                    {selectedOrder.notes && (
                      <div className="mt-2 text-xs bg-amber-50 border border-amber-200 text-amber-900 px-3 py-1.5 rounded-xl">
                        <strong>Notes:</strong> {selectedOrder.notes}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onDeleteOrder(selectedOrder.id)}
                    aria-label={`Delete held order #${selectedOrder.orderNumber}`}
                    className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 border border-rose-200 text-xs font-bold flex items-center gap-1.5 transition"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                    <span>Delete</span>
                  </button>
                </div>

                {/* Items in Held Order */}
                <div className="flex-1 min-h-0 overflow-y-auto touch-scroll overscroll-contain py-3 space-y-2">
                  {selectedOrder.items.map((item) => (
                    <div
                      key={item.product.id}
                      className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between text-xs"
                    >
                      <div>
                        <h4 className="font-bold text-stone-900">{item.product.name}</h4>
                        <div className="text-stone-500 font-mono text-[11px]">
                          {item.quantity} × {item.product.price.toFixed(2)} {storeInfo.currency}
                        </div>
                      </div>
                      <div className="font-black font-mono text-sm text-stone-900">
                        {(item.product.price * item.quantity).toFixed(2)} {storeInfo.currency}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Financial Totals & Resume Footer */}
                <div className="pt-4 border-t border-stone-200 shrink-0 space-y-3">
                  <div className="flex justify-between items-baseline text-xs">
                    <span className="font-extrabold uppercase text-stone-900">Total Order Amount</span>
                    <span className="text-2xl font-black font-mono text-[#064e3b]">
                      {selectedOrder.total.toFixed(2)} {storeInfo.currency}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onResumeOrder(selectedOrder)}
                    aria-label={`Resume order #${selectedOrder.orderNumber} and load into active cart`}
                    className="w-full min-h-[48px] py-3.5 px-4 bg-[#064e3b] hover:bg-[#043b2c] active:scale-[0.99] text-white font-extrabold text-sm rounded-2xl shadow-sm flex items-center justify-center gap-2 transition"
                  >
                    <Play className="w-4 h-4 fill-current" aria-hidden="true" />
                    <span>Resume Order to Register (Restore Cart)</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-stone-400 p-4">
              <p className="text-sm">Select a held order from the list to view its summary.</p>
            </div>
          )}
        </div>
      </main>

      {/* 3. Footer on every screen */}
      <Footer storeInfo={storeInfo} />
    </div>
  );
};
