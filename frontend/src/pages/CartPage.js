import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ArrowLeft, Trash2, Plus, Minus } from 'lucide-react';

const CartPage = ({ user }) => {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [cart, setCart] = useState({ items: [], restaurant_id: null });
  const [deliveryAddress, setDeliveryAddress] = useState(user?.address || '');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCart();
  }, []);

  const fetchCart = async () => {
    try {
      const response = await axios.get(`${API}/cart`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      setCart(response.data);
    } catch (error) {
      console.error('Error fetching cart:', error);
    }
  };

  const updateQuantity = async (menuItemId, quantity) => {
    try {
      await axios.put(
        `${API}/cart/update`,
        {
          menu_item_id: menuItemId,
          quantity
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      fetchCart();
      if (quantity === 0) toast.success('Item removed from cart');
    } catch {
      toast.error('Failed to update cart');
    }
  };

  const clearCart = async () => {
    try {
      await axios.delete(`${API}/cart/clear`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      setCart({ items: [], restaurant_id: null });
      toast.success('Cart cleared');
    } catch {
      toast.error('Failed to clear cart');
    }
  };

  const loadRazorpay = () => {
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

 const placeOrder = async () => {
    if (!deliveryAddress.trim()) {
      toast.error('Please enter delivery address');
      return;
    }

    const loaded = await loadRazorpay();
    if (!loaded) {
      toast.error("Razorpay failed to load");
      return;
    }

    setLoading(true);
    try {
     const res = await axios.post(
        `${API}/orders/create-payment`,
        { delivery_address: deliveryAddress },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const { key, amount, currency, razorpay_order_id } = res.data;

      const options = {
        key,
        amount,
        currency,
        name: "FoodHUB",
        description: "Food Order Payment",
        order_id: razorpay_order_id,
        handler: async function (response) {
          try {
            await axios.post(
              `${API}/orders/payment-success`,
              {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                delivery_address: deliveryAddress
              },
              {
                headers: {
                  Authorization: `Bearer ${token}`
                }
              }
            );
            toast.success("Order placed successfully! Redirecting to orders.");
            navigate('/orders');
          } catch (error) {
            toast.error(error.response?.data?.detail || "Order failed to verify on server.");
          } finally {
            setLoading(false);
          }
        },
        modal: {
            ondismiss: function() {
                toast.warning("Payment canceled. Your order was not placed.");
                setLoading(false); 
            }
        },
        prefill: {
          name: user?.name,
          email: user?.email,
          contact: user?.phone || ''
        },
        theme: { color: "#FF6B6B" }
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
      
     } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to initiate payment');
      setLoading(false);
    }
  };

  const total = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FFF5EE] to-[#FFE4E1]">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" onClick={() => navigate('/')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-3xl font-bold text-gray-800">Your Cart</h1>
        </div>

        {cart.items.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-md p-12 text-center">
            <p className="text-gray-500 text-lg mb-6">Your cart is empty</p>
            <Button onClick={() => navigate('/')} className="bg-[#FF6B6B] text-white">
              Browse Restaurants
            </Button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white rounded-2xl shadow-md p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Items</h2>
                  <Button variant="ghost" onClick={clearCart} className="text-red-500">
                    <Trash2 className="w-4 h-4 mr-2" /> Clear Cart
                  </Button>
                </div>

                {cart.items.map(item => (
                  <div key={item.menu_item_id} className="flex gap-4 p-3 hover:bg-gray-50 rounded-lg">
                    <img src={item.image} className="w-20 h-20 rounded-lg object-cover" />
                    <div className="flex-1">
                      <h3 className="font-semibold">{item.name}</h3>
                      <p className="text-[#FF6B6B] font-bold">Rs.{item.price}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <button onClick={() => updateQuantity(item.menu_item_id, item.quantity - 1)}>
                          <Minus />
                        </button>
                        <span>{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.menu_item_id, item.quantity + 1)}>
                          <Plus />
                        </button>
                      </div>
                    </div>
                    <p className="font-bold">Rs.{(item.price * item.quantity).toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="bg-white rounded-2xl shadow-md p-6 sticky top-4">
                <h2 className="text-xl font-semibold mb-4">Order Summary</h2>
                <p>Subtotal: Rs.{total.toFixed(2)}</p>
                <p>Delivery Fee: Rs.15</p>
                <p className="font-bold text-lg text-[#FF6B6B]">
                  Total: Rs.{(total + 15).toFixed(2)}
                </p>

                <Input
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Enter delivery address"
                  className="mt-4"
                />

                <Button
                  onClick={placeOrder}
                  disabled={loading}
                  className="w-full mt-4 bg-[#FF6B6B] text-white py-6 rounded-full"
                >
                  {loading ? "Placing Order..." : "Place Order"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CartPage;
