from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Float, Enum
from sqlalchemy.orm import relationship
import enum
from datetime import datetime
from .database import Base
from sqlalchemy import Table

user_locations = Table(
    'user_locations', Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id')),
    Column('location_id', Integer, ForeignKey('locations.id'))
)

class RoleEnum(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    SUPERVISOR = "supervisor"
    PHARMACIST = "pharmacist"
    FINANCE = "finance"
    REGIONAL_MANAGER = "regional_manager"

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(Enum(RoleEnum), default=RoleEnum.PHARMACIST)
    is_active = Column(Boolean, default=False)
    # Replaced single assigned_location_id with Many-To-Many locations
    locations = relationship("Location", secondary=user_locations)

class LocationType(str, enum.Enum):
    WAREHOUSE = "warehouse"
    PHARMACY = "pharmacy"

class Location(Base):
    __tablename__ = "locations"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    type = Column(Enum(LocationType))
    address = Column(String)

class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String)
    is_controlled = Column(Boolean, default=False)
    base_price = Column(Float)

class StockBatch(Base):
    __tablename__ = "stock_batches"
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"))
    location_id = Column(Integer, ForeignKey("locations.id"))
    quantity = Column(Integer)
    batch_number = Column(String, index=True)
    expiry_date = Column(DateTime)
    
    product = relationship("Product")
    location = relationship("Location")

class Order(Base):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id")) # Pharmacy where order happened
    created_by_id = Column(Integer, ForeignKey("users.id"))
    total_amount = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    location = relationship("Location")
    created_by = relationship("User")
    items = relationship("OrderItem", back_populates="order")

class OrderItem(Base):
    __tablename__ = "order_items"
    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"))
    product_id = Column(Integer, ForeignKey("products.id"))
    quantity = Column(Integer)
    price_at_time = Column(Float)
    
    order = relationship("Order", back_populates="items")
    product = relationship("Product")
