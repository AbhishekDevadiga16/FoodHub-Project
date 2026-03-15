import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Edit, Trash2, Store, Menu as MenuIcon, ShoppingBag } from 'lucide-react';

const AdminDashboard = ({ user }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('restaurants');
  const [restaurants, setRestaurants] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [showRestaurantModal, setShowRestaurantModal] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [editingRestaurant, setEditingRestaurant] = useState(null);
  const [editingMenuItem, setEditingMenuItem] = useState(null);
  
  const [restaurantForm, setRestaurantForm] = useState({
    name: '',
    description: '',
    image: '',
    cuisine_type: '',
    rating: 4.0,
    delivery_time: '30-40 min'
  });
  
  const [menuForm, setMenuForm] = useState({
    restaurant_id: '',
    name: '',
    description: '',
    price: 0,
    image: '',
    category: '',
    is_available: true
  });

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    try {
      if (activeTab === 'restaurants') {
        const res = await axios.get(`${API}/restaurants`);
        setRestaurants(res.data);
      } else if (activeTab === 'menu') {
        const [restaurantsRes, menuRes] = await Promise.all([
          axios.get(`${API}/restaurants`),
          Promise.all(
            (await axios.get(`${API}/restaurants`)).data.map(r => 
              axios.get(`${API}/restaurants/${r.id}/menu`)
            )
          )
        ]);
        setRestaurants(restaurantsRes.data);
        setMenuItems(menuRes.flatMap(r => r.data));
      } else if (activeTab === 'orders') {
        const res = await axios.get(`${API}/orders`);
        setOrders(res.data);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  // Restaurant CRUD
  const handleRestaurantSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingRestaurant) {
        await axios.put(`${API}/restaurants/${editingRestaurant.id}`, restaurantForm);
        toast.success('Restaurant updated successfully');
      } else {
        await axios.post(`${API}/restaurants`, restaurantForm);
        toast.success('Restaurant created successfully');
      }
      setShowRestaurantModal(false);
      resetRestaurantForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleDeleteRestaurant = async (id) => {
    if (!window.confirm('Are you sure? This will also delete all menu items.')) return;
    try {
      await axios.delete(`${API}/restaurants/${id}`);
      toast.success('Restaurant deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete restaurant');
    }
  };

  const resetRestaurantForm = () => {
    setRestaurantForm({
      name: '',
      description: '',
      image: '',
      cuisine_type: '',
      rating: 4.0,
      delivery_time: '30-40 min'
    });
    setEditingRestaurant(null);
  };

  // Menu CRUD
  const handleMenuSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingMenuItem) {
        await axios.put(`${API}/menu-items/${editingMenuItem.id}`, menuForm);
        toast.success('Menu item updated successfully');
      } else {
        await axios.post(`${API}/menu-items`, menuForm);
        toast.success('Menu item created successfully');
      }
      setShowMenuModal(false);
      resetMenuForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleDeleteMenuItem = async (id) => {
    if (!window.confirm('Are you sure?')) return;
    try {
      await axios.delete(`${API}/menu-items/${id}`);
      toast.success('Menu item deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete menu item');
    }
  };

  const resetMenuForm = () => {
    setMenuForm({
      restaurant_id: '',
      name: '',
      description: '',
      price: 0,
      image: '',
      category: '',
      is_available: true
    });
    setEditingMenuItem(null);
  };

  // Order status update
  const handleStatusUpdate = async (orderId, newStatus) => {
    try {
      await axios.put(`${API}/orders/${orderId}/status`, { status: newStatus });
      toast.success('Order status updated');
      fetchData();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FFF5EE] to-[#FFE4E1]">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/')} data-testid="back-to-home-btn">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-3xl font-bold text-gray-800">Admin Dashboard</h1>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="restaurants" data-testid="restaurants-tab">
              <Store className="w-4 h-4 mr-2" />
              Restaurants
            </TabsTrigger>
            <TabsTrigger value="menu" data-testid="menu-tab">
              <MenuIcon className="w-4 h-4 mr-2" />
              Menu
            </TabsTrigger>
            <TabsTrigger value="orders" data-testid="orders-tab">
              <ShoppingBag className="w-4 h-4 mr-2" />
              Orders
            </TabsTrigger>
          </TabsList>

          {/* Restaurants Tab */}
          <TabsContent value="restaurants" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-semibold">Manage Restaurants</h2>
              <Button
                onClick={() => {
                  resetRestaurantForm();
                  setShowRestaurantModal(true);
                }}
                data-testid="add-restaurant-btn"
                className="bg-[#FF6B6B] hover:bg-[#EE5A52] text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Restaurant
              </Button>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {restaurants.map((restaurant) => (
                <div key={restaurant.id} className="bg-white rounded-xl shadow-md p-4" data-testid={`restaurant-admin-${restaurant.id}`}>
                  <img src={restaurant.image} alt={restaurant.name} className="w-full h-32 object-cover rounded-lg mb-3" />
                  <h3 className="font-semibold text-lg mb-1">{restaurant.name}</h3>
                  <p className="text-sm text-gray-600 mb-3">{restaurant.cuisine_type}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingRestaurant(restaurant);
                        setRestaurantForm(restaurant);
                        setShowRestaurantModal(true);
                      }}
                      data-testid={`edit-restaurant-${restaurant.id}`}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteRestaurant(restaurant.id)}
                      data-testid={`delete-restaurant-${restaurant.id}`}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Menu Tab */}
          <TabsContent value="menu" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-semibold">Manage Menu Items</h2>
              <Button
                onClick={() => {
                  resetMenuForm();
                  setShowMenuModal(true);
                }}
                data-testid="add-menu-item-btn"
                className="bg-[#FF6B6B] hover:bg-[#EE5A52] text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Menu Item
              </Button>
            </div>
            <div className="space-y-3">
              {menuItems.map((item) => (
                <div key={item.id} className="bg-white rounded-xl shadow-md p-4 flex gap-4" data-testid={`menu-admin-${item.id}`}>
                  <img src={item.image} alt={item.name} className="w-24 h-24 object-cover rounded-lg" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{item.name}</h3>
                    <p className="text-sm text-gray-600">{item.category}</p>
                    <p className="text-[#FF6B6B] font-bold">Rs.{item.price.toFixed(2)}</p>
                    <span className={`text-xs ${item.is_available ? 'text-green-600' : 'text-red-600'}`}>
                      {item.is_available ? 'Available' : 'Unavailable'}
                    </span>
                  </div>
                  <div className="flex gap-2 items-start">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingMenuItem(item);
                        setMenuForm(item);
                        setShowMenuModal(true);
                      }}
                      data-testid={`edit-menu-${item.id}`}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteMenuItem(item.id)}
                      data-testid={`delete-menu-${item.id}`}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders" className="space-y-4">
            <h2 className="text-2xl font-semibold">Manage Orders</h2>
            <div className="space-y-3">
              {orders.map((order) => (
                <div key={order.id} className="bg-white rounded-xl shadow-md p-6" data-testid={`order-admin-${order.id}`}>
                  <div className="flex justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-lg">{order.restaurant_name}</h3>
                      <p className="text-sm text-gray-600">{new Date(order.created_at).toLocaleString()}</p>
                      <p className="text-sm text-gray-600">Total: ${order.total.toFixed(2)}</p>
                    </div>
                    <Select
                      value={order.status}
                      onValueChange={(value) => handleStatusUpdate(order.id, value)}
                    >
                      <SelectTrigger className="w-[200px]" data-testid={`status-select-${order.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="preparing">Preparing</SelectItem>
                        <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                        <SelectItem value="delivered">Delivered</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="border-t pt-3">
                    <p className="text-sm font-medium mb-2">Items:</p>
                    <ul className="text-sm text-gray-700">
                      {order.items.map((item, idx) => (
                        <li key={idx}>{item.name} x {item.quantity}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Restaurant Modal */}
      <Dialog open={showRestaurantModal} onOpenChange={setShowRestaurantModal}>
        <DialogContent className="sm:max-w-lg" data-testid="restaurant-modal">
          <DialogHeader>
            <DialogTitle>{editingRestaurant ? 'Edit Restaurant' : 'Add Restaurant'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRestaurantSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <Input
                required
                value={restaurantForm.name}
                onChange={(e) => setRestaurantForm({...restaurantForm, name: e.target.value})}
                data-testid="restaurant-name-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <Textarea
                required
                value={restaurantForm.description}
                onChange={(e) => setRestaurantForm({...restaurantForm, description: e.target.value})}
                data-testid="restaurant-description-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Image URL</label>
              <Input
                required
                value={restaurantForm.image}
                onChange={(e) => setRestaurantForm({...restaurantForm, image: e.target.value})}
                data-testid="restaurant-image-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Cuisine Type</label>
              <Input
                required
                value={restaurantForm.cuisine_type}
                onChange={(e) => setRestaurantForm({...restaurantForm, cuisine_type: e.target.value})}
                data-testid="restaurant-cuisine-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Rating</label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="5"
                  value={restaurantForm.rating}
                  onChange={(e) => setRestaurantForm({...restaurantForm, rating: parseFloat(e.target.value)})}
                  data-testid="restaurant-rating-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Delivery Time</label>
                <Input
                  value={restaurantForm.delivery_time}
                  onChange={(e) => setRestaurantForm({...restaurantForm, delivery_time: e.target.value})}
                  data-testid="restaurant-delivery-input"
                />
              </div>
            </div>
            <Button type="submit" data-testid="restaurant-submit-btn" className="w-full bg-[#FF6B6B] hover:bg-[#EE5A52] text-white">
              {editingRestaurant ? 'Update' : 'Create'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Menu Modal */}
      <Dialog open={showMenuModal} onOpenChange={setShowMenuModal}>
        <DialogContent className="sm:max-w-lg" data-testid="menu-modal">
          <DialogHeader>
            <DialogTitle>{editingMenuItem ? 'Edit Menu Item' : 'Add Menu Item'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleMenuSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Restaurant</label>
              <Select
                value={menuForm.restaurant_id}
                onValueChange={(value) => setMenuForm({...menuForm, restaurant_id: value})}
                required
              >
                <SelectTrigger data-testid="menu-restaurant-select">
                  <SelectValue placeholder="Select restaurant" />
                </SelectTrigger>
                <SelectContent>
                  {restaurants.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <Input
                required
                value={menuForm.name}
                onChange={(e) => setMenuForm({...menuForm, name: e.target.value})}
                data-testid="menu-name-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <Textarea
                required
                value={menuForm.description}
                onChange={(e) => setMenuForm({...menuForm, description: e.target.value})}
                data-testid="menu-description-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Image URL</label>
              <Input
                required
                value={menuForm.image}
                onChange={(e) => setMenuForm({...menuForm, image: e.target.value})}
                data-testid="menu-image-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Price</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={menuForm.price}
                  onChange={(e) => setMenuForm({...menuForm, price: parseFloat(e.target.value)})}
                  data-testid="menu-price-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <Input
                  required
                  value={menuForm.category}
                  onChange={(e) => setMenuForm({...menuForm, category: e.target.value})}
                  data-testid="menu-category-input"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={menuForm.is_available}
                onChange={(e) => setMenuForm({...menuForm, is_available: e.target.checked})}
                data-testid="menu-available-checkbox"
                className="w-4 h-4"
              />
              <label className="text-sm font-medium">Available</label>
            </div>
            <Button type="submit" data-testid="menu-submit-btn" className="w-full bg-[#FF6B6B] hover:bg-[#EE5A52] text-white">
              {editingMenuItem ? 'Update' : 'Create'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;
