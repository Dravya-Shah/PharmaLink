from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from . import database, models

router = APIRouter(prefix="/api/v1/bi", tags=["business-intelligence"])

@router.get("/daily-close")
def get_daily_close(user_id: int, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    loc_ids = [l.id for l in user.locations]
    is_global = user.role in [models.RoleEnum.SUPER_ADMIN, models.RoleEnum.FINANCE]
    
    # Filter orders based on network visibility
    orders_query = db.query(models.Order)
    if not is_global:
        orders_query = orders_query.filter(models.Order.location_id.in_(loc_ids))
        
    orders = orders_query.all()
    
    total_revenue = sum([o.total_amount for o in orders])
    total_orders = len(orders)
    
    # Low stock alerts, bound strictly to their visibility 
    low_stock_query = db.query(models.StockBatch).filter(models.StockBatch.quantity < 10)
    if not is_global:
        low_stock_query = low_stock_query.filter(models.StockBatch.location_id.in_(loc_ids))
    low_stock_batches = low_stock_query.all()
    
    # Granular shop_breakdowns Dictionary 
    shop_breakdowns = {}
    
    for order in orders:
        lid = order.location_id
        if lid not in shop_breakdowns:
            shop_breakdowns[lid] = {
                "location_id": lid,
                "location_name": order.location.name if order.location else "Unknown",
                "shop_total_revenue": 0.0,
                "shop_total_orders": 0,
                "product_breakdown": {}
            }
        
        shop_breakdowns[lid]["shop_total_revenue"] += order.total_amount
        shop_breakdowns[lid]["shop_total_orders"] += 1
        
        for item in order.items:
            p_name = item.product.name if item.product else "Unknown"
            if p_name not in shop_breakdowns[lid]["product_breakdown"]:
                shop_breakdowns[lid]["product_breakdown"][p_name] = 0
            shop_breakdowns[lid]["product_breakdown"][p_name] += item.quantity

    return {
        "status": "success",
        "data": {
            "total_revenue": total_revenue,
            "total_orders": total_orders,
            "low_stock_warnings": len(low_stock_batches),
            "shop_breakdowns": list(shop_breakdowns.values())
        }
    }
