from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from .models import RoleEnum, LocationType

class UserBase(BaseModel):
    username: str
    role: RoleEnum
    is_active: Optional[bool] = True

class UserCreate(UserBase):
    password: str

class LocationBase(BaseModel):
    name: str
    type: LocationType
    address: str

class LocationResponse(LocationBase):
    id: int
    class Config:
        from_attributes = True

class UserResponse(UserBase):
    id: int
    locations: List[LocationResponse] = []
    class Config:
        from_attributes = True

class ApprovalSchema(BaseModel):
    location_ids: List[int]

class Token(BaseModel):
    access_token: str
    token_type: str

class LocationCreate(LocationBase):
    pass

class ProductBase(BaseModel):
    name: str
    description: str
    is_controlled: bool
    base_price: float

class ProductCreate(ProductBase):
    pass

class ProductResponse(ProductBase):
    id: int
    class Config:
        from_attributes = True

class StockBatchBase(BaseModel):
    product_id: int
    location_id: int
    quantity: int
    batch_number: str
    expiry_date: datetime

class StockBatchCreate(StockBatchBase):
    pass

class StockBatchResponse(StockBatchBase):
    id: int
    class Config:
        from_attributes = True

class OrderItemBase(BaseModel):
    product_id: int
    quantity: int

class OrderItemCreate(OrderItemBase):
    pass

class OrderCreate(BaseModel):
    location_id: int # pharmacy making the order
    items: List[OrderItemCreate]

class OrderResponse(BaseModel):
    id: int
    total_amount: float
    created_at: datetime
    po_triggered: bool = False
    
    class Config:
        from_attributes = True
