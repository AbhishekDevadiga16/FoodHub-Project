from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
from jwt.exceptions import PyJWTError, ExpiredSignatureError
from dotenv import load_dotenv
from pathlib import Path
import os
import razorpay
import uuid

load_dotenv(Path(__file__).parent / ".env")

# MongoDB connection (defaults to local dev values)
mongo_url = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.getenv('DB_NAME', 'food_order_dev')
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

# JWT Settings
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'f63e063ca06f5e0e9d75766d4214d55f83484889b3765db6b0519eec92b6c8c1')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# Razorpay Settings
RAZORPAY_KEY_ID = os.getenv('KEY_ID','rzp_test_RrWSkDJorIeJtu')
RAZORPAY_KEY_SECRET = os.getenv('KEY_SECRET','CIkAuwGeTRkCnInzKc8aVrx2')

if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
    raise Exception("Razorpay keys not found in environment variables")

razorpay_client = razorpay.Client(
    auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)
)


# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# Models
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    is_admin: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Restaurant(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    image: str
    cuisine_type: str
    rating: float = 4.0
    delivery_time: str = "30-40 min"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RestaurantCreate(BaseModel):
    name: str
    description: str
    image: str
    cuisine_type: str
    rating: Optional[float] = 4.0
    delivery_time: Optional[str] = "30-40 min"

class MenuItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    restaurant_id: str
    name: str
    description: str
    price: float
    image: str
    category: str
    is_available: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MenuItemCreate(BaseModel):
    restaurant_id: str
    name: str
    description: str
    price: float
    image: str
    category: str
    is_available: Optional[bool] = True

class CartItem(BaseModel):
    menu_item_id: str
    quantity: int
    name: str
    price: float
    image: str

class Cart(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    restaurant_id: str
    items: List[CartItem] = Field(default_factory=list)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AddToCart(BaseModel):
    menu_item_id: str
    restaurant_id: str
    quantity: int = 1

class UpdateCartItem(BaseModel):
    menu_item_id: str
    quantity: int

class OrderItem(BaseModel):
    menu_item_id: str
    name: str
    price: float
    quantity: int

class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    restaurant_id: str
    restaurant_name: str
    items: List[OrderItem]
    total: float
    status: str = "pending"  # pending, confirmed, preparing, out_for_delivery, delivered, cancelled
    delivery_address: str
    razorpay_order_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CreateOrder(BaseModel):
    delivery_address: str

class UpdateOrderStatus(BaseModel):
    status: str

# Helper functions
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")

        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        return user

    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_admin_user(current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

# Auth endpoints
@api_router.post("/auth/register")
async def register(user_data: UserRegister):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user = User(
        email=user_data.email,
        name=user_data.name,
        phone=user_data.phone,
        address=user_data.address
    )
    
    user_dict = user.model_dump()
    user_dict['password'] = hash_password(user_data.password)
    user_dict['created_at'] = user_dict['created_at'].isoformat()
    
    await db.users.insert_one(user_dict)
    
    # Create token
    token = create_access_token({"sub": user.id})
    
    return {
        "token": token,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "is_admin": user.is_admin
        }
    }

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user['password']):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    token = create_access_token({"sub": user['id']})
    
    return {
        "token": token,
        "user": {
            "id": user['id'],
            "email": user['email'],
            "name": user['name'],
            "is_admin": user.get('is_admin', False)
        }
    }

# Restaurant endpoints
@api_router.get("/restaurants", response_model=List[Restaurant])
async def get_restaurants():
    restaurants = await db.restaurants.find({}, {"_id": 0}).to_list(1000)
    for restaurant in restaurants:
        if isinstance(restaurant.get('created_at'), str):
            restaurant['created_at'] = datetime.fromisoformat(restaurant['created_at'])
    return restaurants

@api_router.get("/restaurants/{restaurant_id}", response_model=Restaurant)
async def get_restaurant(restaurant_id: str):
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    if isinstance(restaurant.get('created_at'), str):
        restaurant['created_at'] = datetime.fromisoformat(restaurant['created_at'])
    return restaurant

@api_router.post("/restaurants", response_model=Restaurant)
async def create_restaurant(restaurant_data: RestaurantCreate, admin: dict = Depends(get_admin_user)):
    restaurant = Restaurant(**restaurant_data.model_dump())
    doc = restaurant.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.restaurants.insert_one(doc)
    return restaurant

@api_router.put("/restaurants/{restaurant_id}", response_model=Restaurant)
async def update_restaurant(restaurant_id: str, restaurant_data: RestaurantCreate, admin: dict = Depends(get_admin_user)):
    existing = await db.restaurants.find_one({"id": restaurant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    
    update_data = restaurant_data.model_dump()
    await db.restaurants.update_one({"id": restaurant_id}, {"$set": update_data})
    
    updated = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if isinstance(updated.get('created_at'), str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    return updated

@api_router.delete("/restaurants/{restaurant_id}")
async def delete_restaurant(restaurant_id: str, admin: dict = Depends(get_admin_user)):
    result = await db.restaurants.delete_one({"id": restaurant_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    # Also delete associated menu items
    await db.menu_items.delete_many({"restaurant_id": restaurant_id})
    return {"message": "Restaurant deleted successfully"}

# Menu Item endpoints
@api_router.get("/restaurants/{restaurant_id}/menu", response_model=List[MenuItem])
async def get_restaurant_menu(restaurant_id: str):
    menu_items = await db.menu_items.find({"restaurant_id": restaurant_id}, {"_id": 0}).to_list(1000)
    for item in menu_items:
        if isinstance(item.get('created_at'), str):
            item['created_at'] = datetime.fromisoformat(item['created_at'])
    return menu_items

@api_router.post("/menu-items", response_model=MenuItem)
async def create_menu_item(item_data: MenuItemCreate, admin: dict = Depends(get_admin_user)):
    menu_item = MenuItem(**item_data.model_dump())
    doc = menu_item.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.menu_items.insert_one(doc)
    return menu_item

@api_router.put("/menu-items/{item_id}", response_model=MenuItem)
async def update_menu_item(item_id: str, item_data: MenuItemCreate, admin: dict = Depends(get_admin_user)):
    existing = await db.menu_items.find_one({"id": item_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Menu item not found")
    
    update_data = item_data.model_dump()
    await db.menu_items.update_one({"id": item_id}, {"$set": update_data})
    
    updated = await db.menu_items.find_one({"id": item_id}, {"_id": 0})
    if isinstance(updated.get('created_at'), str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    return updated

@api_router.delete("/menu-items/{item_id}")
async def delete_menu_item(item_id: str, admin: dict = Depends(get_admin_user)):
    result = await db.menu_items.delete_one({"id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Menu item not found")
    return {"message": "Menu item deleted successfully"}

# Cart endpoints
@api_router.get("/cart")
async def get_cart(current_user: dict = Depends(get_current_user)):
    cart = await db.carts.find_one({"user_id": current_user['id']}, {"_id": 0})
    if not cart:
        return {"items": [], "restaurant_id": None}
    if isinstance(cart.get('updated_at'), str):
        cart['updated_at'] = datetime.fromisoformat(cart['updated_at'])
    return cart

@api_router.post("/cart/add")
async def add_to_cart(cart_data: AddToCart, current_user: dict = Depends(get_current_user)):
    menu_item = await db.menu_items.find_one({"id": cart_data.menu_item_id}, {"_id": 0})
    if not menu_item:
        raise HTTPException(status_code=404, detail="Menu item not found")

    restaurant_id = menu_item["restaurant_id"]
    quantity = int(cart_data.quantity)

    cart = await db.carts.find_one({"user_id": current_user["id"]})

    if cart:
        if cart["restaurant_id"] != restaurant_id:
            cart["items"] = []
            cart["restaurant_id"] = restaurant_id

        for item in cart["items"]:
            if item["menu_item_id"] == cart_data.menu_item_id:
                item["quantity"] += quantity
                break
        else:
            cart["items"].append({
                "menu_item_id": cart_data.menu_item_id,
                "quantity": quantity,
                "name": menu_item["name"],
                "price": menu_item["price"],
                "image": menu_item["image"]
            })

        cart["updated_at"] = datetime.now(timezone.utc).isoformat()
        cart.pop("_id", None)

        await db.carts.update_one(
            {"user_id": current_user["id"]},
            {"$set": cart}
        )
    else:
        new_cart = {
            "id": str(uuid.uuid4()),
            "user_id": current_user["id"],
            "restaurant_id": restaurant_id,
            "items": [{
                "menu_item_id": cart_data.menu_item_id,
                "quantity": quantity,
                "name": menu_item["name"],
                "price": menu_item["price"],
                "image": menu_item["image"]
            }],
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.carts.insert_one(new_cart)

    return {"message": "Item added to cart"}

@api_router.put("/cart/update")
async def update_cart_item(update_data: UpdateCartItem, current_user: dict = Depends(get_current_user)):
    cart = await db.carts.find_one({"user_id": current_user['id']})
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")
    
    if update_data.quantity <= 0:
        # Remove item
        cart['items'] = [item for item in cart['items'] if item['menu_item_id'] != update_data.menu_item_id]
    else:
        # Update quantity
        for item in cart['items']:
            if item['menu_item_id'] == update_data.menu_item_id:
                item['quantity'] = update_data.quantity
                break
    
    cart['updated_at'] = datetime.now(timezone.utc).isoformat()
    await db.carts.update_one({"user_id": current_user['id']}, {"$set": cart})
    return {"message": "Cart updated"}

@api_router.delete("/cart/clear")
async def clear_cart(current_user: dict = Depends(get_current_user)):
    await db.carts.delete_one({"user_id": current_user['id']})
    return {"message": "Cart cleared"}

# Order endpoints
@api_router.post("/orders/create-payment")
async def create_payment(order_data: CreateOrder, current_user: dict = Depends(get_current_user)):

    cart = await db.carts.find_one({"user_id": current_user["id"]}, {"_id": 0})
    if not cart or not cart.get("items"):
        raise HTTPException(status_code=400, detail="Cart is empty")

    if not cart.get("restaurant_id"):
        raise HTTPException(status_code=400, detail="Invalid cart")

    subtotal = sum(item["price"] * item["quantity"] for item in cart["items"])
    delivery_fee = 15.0
    total_amount = subtotal + delivery_fee

    amount_in_paise = int(total_amount * 100)

    receipt = str(uuid.uuid4())[:40]

    try:
        razorpay_order = razorpay_client.order.create({
            "amount": amount_in_paise,
            "currency": "INR",
            "receipt": receipt
        })

        return {
            "key": RAZORPAY_KEY_ID,
            "amount": amount_in_paise,
            "currency": "INR",
            "razorpay_order_id": razorpay_order["id"]
        }

    except Exception as e:
        logger.error(f"Create payment failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to create payment")

@api_router.post("/orders/payment-success", response_model=Order)
async def payment_success(response: dict, current_user: dict = Depends(get_current_user)):
    try:
        payment_data = {
            "razorpay_order_id": response["razorpay_order_id"],
            "razorpay_payment_id": response["razorpay_payment_id"],
            "razorpay_signature": response["razorpay_signature"]
        }

        razorpay_client.utility.verify_payment_signature(payment_data)

    except Exception as e:
        logger.error(f"Payment verification failed: {e}")
        raise HTTPException(status_code=400, detail="Payment verification failed")

    cart = await db.carts.find_one({"user_id": current_user['id']}, {"_id": 0})
    if not cart or not cart.get('items'):
        raise HTTPException(status_code=400, detail="Cart is empty")

    restaurant = await db.restaurants.find_one({"id": cart['restaurant_id']}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    subtotal = sum(item['price'] * item['quantity'] for item in cart['items'])
    total = subtotal + 15.0

    order = Order(
        user_id=current_user['id'],
        restaurant_id=cart['restaurant_id'],
        restaurant_name=restaurant['name'],
        items=[OrderItem(**item) for item in cart['items']],
        total=total,
        status="confirmed",
        delivery_address=response.get("delivery_address", "Not provided"),
        razorpay_order_id=response["razorpay_order_id"],
        razorpay_payment_id=response["razorpay_payment_id"]
    )

    doc = order.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.orders.insert_one(doc)

    await db.carts.delete_one({"user_id": current_user['id']})

    return order

@api_router.get("/orders", response_model=List[Order])
async def get_orders(current_user: dict = Depends(get_current_user)):
    if current_user.get('is_admin', False):
        # Admin gets all orders
        orders = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    else:
        # User gets only their orders
        orders = await db.orders.find({"user_id": current_user['id']}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    for order in orders:
        if isinstance(order.get('created_at'), str):
            order['created_at'] = datetime.fromisoformat(order['created_at'])
    return orders

@api_router.get("/orders/{order_id}", response_model=Order)
async def get_order(order_id: str, current_user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Check if user owns the order or is admin
    if order['user_id'] != current_user['id'] and not current_user.get('is_admin', False):
        raise HTTPException(status_code=403, detail="Access denied")
    
    if isinstance(order.get('created_at'), str):
        order['created_at'] = datetime.fromisoformat(order['created_at'])
    return order

@api_router.put("/orders/{order_id}/status")
async def update_order_status(order_id: str, status_data: UpdateOrderStatus, admin: dict = Depends(get_admin_user)):
    result = await db.orders.update_one(
        {"id": order_id},
        {"$set": {"status": status_data.status}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    return {"message": "Order status updated"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.getenv('CORS_ORIGINS', 'http://localhost:3000').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
