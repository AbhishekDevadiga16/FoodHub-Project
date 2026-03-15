import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ArrowLeft, ShoppingCart, Star, Clock, Plus, Minus } from 'lucide-react';

const RestaurantPage = ({ user, setUser }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [restaurant, setRestaurant] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRestaurantData();
  }, [id]);

  const fetchRestaurantData = async () => {
    try {
      const [restaurantRes, menuRes] = await Promise.all([
        axios.get(`${API}/restaurants/${id}`),
        axios.get(`${API}/restaurants/${id}/menu`)
      ]);
      setRestaurant(restaurantRes.data);
      setMenuItems(menuRes.data);
    } catch (error) {
      console.error('Error fetching restaurant data:', error);
      toast.error('Failed to load restaurant');
    } finally {
      setLoading(false);
    }
  };

  const handleQuantityChange = (itemId, delta) => {
    setQuantities(prev => ({
      ...prev,
      [itemId]: Math.max(0, (prev[itemId] || 0) + delta)
    }));
  };

  const handleAddToCart = async (item) => {
    if (!user) {
      toast.error('Please login to add items to cart');
      navigate('/');
      return;
    }

    const quantity = quantities[item.id] || 1;
    try {
      await axios.post(`${API}/cart/add`, {
        menu_item_id: item.id,
        restaurant_id: id,
        quantity
      });
      toast.success(`${item.name} added to cart!`);
      setQuantities(prev => ({ ...prev, [item.id]: 0 }));
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add to cart');
    }
  };

  const groupedMenuItems = menuItems.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lg">Loading...</p>
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lg">Restaurant not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="relative h-72 overflow-hidden">
        <img
          src={restaurant.image}
          alt={restaurant.name}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute top-4 left-4">
          <Button
            variant="secondary"
            onClick={() => navigate('/')}
            data-testid="back-btn"
            className="rounded-full"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
          <h1 className="text-4xl font-bold mb-2" data-testid="restaurant-name">{restaurant.name}</h1>
          <p className="text-base mb-3">{restaurant.description}</p>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              {restaurant.rating}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {restaurant.delivery_time}
            </span>
            <span className="px-3 py-1 bg-white/20 backdrop-blur rounded-full">
              {restaurant.cuisine_type}
            </span>
          </div>
        </div>
      </div>

      {/* Menu */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {Object.keys(groupedMenuItems).length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg" data-testid="no-menu-msg">No menu items available</p>
          </div>
        ) : (
          Object.entries(groupedMenuItems).map(([category, items]) => (
            <div key={category} className="mb-10">
              <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b-2 border-[#FF6B6B] pb-2 inline-block">
                {category}
              </h2>
              <div className="grid gap-6">
                {items.map((item) => (
                  <div
                    key={item.id}
                    data-testid={`menu-item-${item.id}`}
                    className="bg-white rounded-xl shadow-md p-4 flex gap-4 hover:shadow-lg transition-shadow"
                  >
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-32 h-32 object-cover rounded-lg flex-shrink-0"
                    />
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="text-xl font-semibold text-gray-800">{item.name}</h3>
                          {!item.is_available && (
                            <span className="text-xs text-red-500 font-medium">Currently Unavailable</span>
                          )}
                        </div>
                        <span className="text-xl font-bold text-[#FF6B6B]">Rs.{item.price.toFixed(2)}</span>
                      </div>
                      <p className="text-gray-600 text-sm mb-4">{item.description}</p>
                      
                      {item.is_available && (
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2 bg-gray-100 rounded-full px-2 py-1">
                            <button
                              onClick={() => handleQuantityChange(item.id, -1)}
                              disabled={!quantities[item.id]}
                              data-testid={`decrease-qty-${item.id}`}
                              className="p-1 hover:bg-gray-200 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-8 text-center font-semibold" data-testid={`quantity-${item.id}`}>
                              {quantities[item.id] || 0}
                            </span>
                            <button
                              onClick={() => handleQuantityChange(item.id, 1)}
                              data-testid={`increase-qty-${item.id}`}
                              className="p-1 hover:bg-gray-200 rounded-full"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                          <Button
                            onClick={() => handleAddToCart(item)}
                            disabled={!quantities[item.id]}
                            data-testid={`add-to-cart-${item.id}`}
                            className="bg-[#FF6B6B] hover:bg-[#EE5A52] text-white rounded-full"
                          >
                            <ShoppingCart className="w-4 h-4 mr-2" />
                            Add to Cart
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Floating Cart Button */}
      {user && (
        <div className="fixed bottom-6 right-6 z-50">
          <Button
            onClick={() => navigate('/cart')}
            data-testid="floating-cart-btn"
            className="bg-[#FF6B6B] hover:bg-[#EE5A52] text-white rounded-full shadow-lg px-6 py-6 text-lg"
          >
            <ShoppingCart className="w-5 h-5 mr-2" />
            View Cart
          </Button>
        </div>
      )}
    </div>
  );
};

export default RestaurantPage;
