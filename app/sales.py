import os
import smtplib
from email.message import EmailMessage
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timedelta
from . import models, schemas, database

router = APIRouter(prefix="/api/v1/sales", tags=["sales"])

def simulate_erp_sync(order_id: int):
    # Simulate sending data to ERP asynchronously
    print(f"Background Task: Synced Order {order_id} to external ERP system.")

def trigger_restock_po_erp(product_id: int, location_id: int, current_stock: int):
    # Simulate an external B2B call to a vendor/ERP purchasing module
    print(f"Background Task: Auto-Dispatching Purchase Order for product {product_id} at loc {location_id}. Current Stock: {current_stock}")
    try:
        msg = EmailMessage()
        msg['Subject'] = 'Supervisor Alert - Stock Auto-Replenished'
        msg['From'] = 'xyz67728@gmail.com'
        msg['To'] = 'xyz67728@gmail.com'
        msg.set_content(f"CRITICAL: Product ID {product_id} dipped heavily to {current_stock} units at Facility ID {location_id}!\n\nThe B2B ERP system has natively intercepted this shortage and executed a live Database Auto-Replenish loop. Exactly +100 units have been physically generated and injected to this facility.")
        
        gmail_pass = os.getenv("GMAIL_PASSWORD")
        if gmail_pass:
            server = smtplib.SMTP('smtp.gmail.com', 587)
            server.starttls()
            server.login("xyz67728@gmail.com", gmail_pass)
            server.send_message(msg)
            server.quit()
    except Exception as e:
        print(f"SMTP Restock Alert Failed: {e}")

@router.post("/order", response_model=schemas.OrderResponse)
def create_order(order: schemas.OrderCreate, background_tasks: BackgroundTasks, db: Session = Depends(database.get_db)):
    po_alarms_triggered = False

    # Calculate total and check stock
    total_amount = 0.0
    for item in order.items:
        # FEFO Logic: Get all batches ordered by expiry
        batches = db.query(models.StockBatch).filter(
            models.StockBatch.product_id == item.product_id,
            models.StockBatch.location_id == order.location_id,
            models.StockBatch.quantity > 0
        ).order_by(models.StockBatch.expiry_date.asc()).all()
        
        total_available = sum(b.quantity for b in batches)
        if total_available < item.quantity:
            raise HTTPException(status_code=400, detail=f"Insufficient stock for product {item.product_id} at location {order.location_id}")
            
        product = db.query(models.Product).filter(models.Product.id == item.product_id).first()
        total_amount += product.base_price * item.quantity
        
        # Deduct stock sequentially via FEFO
        remaining_to_deduct = item.quantity
        for batch in batches:
            if remaining_to_deduct <= 0:
                break
            if batch.quantity >= remaining_to_deduct:
                batch.quantity -= remaining_to_deduct
                remaining_to_deduct = 0
                if batch.quantity == 0:
                    db.delete(batch)
            else:
                remaining_to_deduct -= batch.quantity
                batch.quantity = 0
                db.delete(batch)
                
        # Proactive Auto-Restock algorithm 
        new_total = total_available - item.quantity
        if new_total < 20:
            po_alarms_triggered = True
            
            # Synchronously Generate +100 Database Units right now!
            restock_batch = models.StockBatch(
                product_id=item.product_id,
                location_id=order.location_id,
                quantity=100,
                batch_number=f"AUTO-PO-{int(datetime.utcnow().timestamp())}",
                expiry_date=datetime.utcnow() + timedelta(days=365)
            )
            db.add(restock_batch)
            
            # Asynchronously send the Email so it doesn't freeze the checkout
            background_tasks.add_task(trigger_restock_po_erp, item.product_id, order.location_id, new_total)
    
    new_order = models.Order(
        location_id=order.location_id,
        created_by_id=1, # Hardcoded for prototyping speed
        total_amount=total_amount
    )
    db.add(new_order)
    db.flush() # get ID
    
    for item in order.items:
        product = db.query(models.Product).filter(models.Product.id == item.product_id).first()
        order_item = models.OrderItem(
            order_id=new_order.id,
            product_id=item.product_id,
            quantity=item.quantity,
            price_at_time=product.base_price
        )
        db.add(order_item)
        
    db.commit()
    db.refresh(new_order)
    
    # Inject alarm states dynamically for the Pydantic outbound mapping
    setattr(new_order, 'po_triggered', po_alarms_triggered)
    
    # Simulate background task
    background_tasks.add_task(simulate_erp_sync, new_order.id)
    
    return new_order
