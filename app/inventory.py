from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timedelta
import os
import smtplib
from email.message import EmailMessage
import io
import csv
import asyncio
from fastapi.responses import StreamingResponse
from . import models, schemas, database

async def run_automated_expiry_scanner():
    while True:
        await asyncio.sleep(60) # Simulate daily loop using 60 second timer
        db = database.SessionLocal()
        try:
            # Data Hygiene Sweep
            zero_batches = db.query(models.StockBatch).filter(models.StockBatch.quantity <= 0).all()
            if zero_batches:
                for zb in zero_batches:
                    db.delete(zb)
                db.commit()
                
            now = datetime.utcnow()
            threshold = now + timedelta(days=2)
            expiring_stock = db.query(models.StockBatch).filter(models.StockBatch.expiry_date <= threshold, models.StockBatch.quantity > 0).all()
            if expiring_stock:
                dead_stock = []
                dying_stock = []
                for stock in expiring_stock:
                    if stock.expiry_date < now:
                        dead_stock.append(stock)
                    else:
                        dying_stock.append(stock)
                
                if dying_stock:
                    dying_stock_filtered = []
                    for stock in dying_stock:
                        existing_auto = db.query(models.StockBatch).filter(
                            models.StockBatch.product_id == stock.product_id,
                            models.StockBatch.location_id == stock.location_id,
                            models.StockBatch.batch_number.like('AUTO_%')
                        ).first()
                        if not existing_auto:
                            dying_stock_filtered.append(stock)
                else:
                    dying_stock_filtered = []
                    
                if not dying_stock_filtered and not dead_stock:
                    db.commit()
                    db.close()
                    continue
                
                content = "AUTOMATED ALERT: The following medicine batches across the network are expiring in <= 2 days.\n\n"
                
                if dying_stock_filtered:
                    for stock in dying_stock_filtered:
                        content += f"- Batch #{stock.batch_number} (Loc {stock.location_id}): {stock.quantity} units left.\n"
                    
                    content += "\nRESTOCK CONFIRMATION: No stock is less! The Automated ERP Module has securely injected +100 units of fresh cargo mapped to the 'AUTO_xxx' tag sequences to balance the pipeline.\n"
                    
                    for stock in dying_stock_filtered:
                        restock = models.StockBatch(
                            product_id=stock.product_id,
                            location_id=stock.location_id,
                            quantity=100,
                            batch_number=f"AUTO_{int(now.timestamp())}_{stock.product_id}",
                            expiry_date=now + timedelta(days=365)
                        )
                        db.add(restock)
                        
                if dead_stock:
                    content += "\nDELETION CONFIRMATION: The following specific batches have fully expired and have successfully been deleted out of the physical database mapping:\n"
                    for stock in dead_stock:
                        content += f"- Batch #{stock.batch_number} (Loc {stock.location_id}) - PURGED.\n"
                        db.delete(stock)
                
                db.commit()

                msg = EmailMessage()
                msg['Subject'] = '[AUTOMATED DAILY SCAN] - Impending Stock Expiry & Auto-Healing'
                msg['From'] = 'xyz67728@gmail.com'
                msg['To'] = 'xyz67728@gmail.com' # Represents Supervisor/Regional Manager/Admin
                content += "\nDistribution List: Admin, Supervisor, Regional Manager"
                msg.set_content(content)
                
                gmail_pass = os.getenv("GMAIL_PASSWORD")
                if gmail_pass:
                    server = smtplib.SMTP('smtp.gmail.com', 587)
                    server.starttls()
                    server.login("xyz67728@gmail.com", gmail_pass)
                    server.send_message(msg)
                    server.quit()
        except:
            pass
        finally:
            db.close()

router = APIRouter(prefix="/api/v1/inventory", tags=["inventory"])

@router.post("/locations", response_model=schemas.LocationResponse)
def create_location(location: schemas.LocationCreate, db: Session = Depends(database.get_db)):
    db_location = models.Location(**location.model_dump())
    db.add(db_location)
    db.commit()
    db.refresh(db_location)
    return db_location

@router.get("/locations", response_model=List[schemas.LocationResponse])
def get_locations(db: Session = Depends(database.get_db)):
    return db.query(models.Location).all()

@router.post("/products", response_model=schemas.ProductResponse)
def create_product(product: schemas.ProductCreate, db: Session = Depends(database.get_db)):
    db_product = models.Product(**product.model_dump())
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return db_product

@router.get("/products", response_model=List[schemas.ProductResponse])
def get_products(db: Session = Depends(database.get_db)):
    return db.query(models.Product).all()

@router.post("/stock", response_model=schemas.StockBatchResponse)
def add_stock(batch: schemas.StockBatchCreate, user_id: int, db: Session = Depends(database.get_db)):
    if batch.expiry_date.replace(tzinfo=None) < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Cannot receive stock that is already expired.")
        
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User mapping failed.")
        
    is_global = user.role in [models.RoleEnum.SUPER_ADMIN, models.RoleEnum.FINANCE]
    loc_ids = [l.id for l in user.locations]
    
    if not is_global and batch.location_id not in loc_ids:
        raise HTTPException(status_code=403, detail="You do not have permission to resupply external facilities.")
        
    db_batch = models.StockBatch(**batch.model_dump())
    db.add(db_batch)
    db.commit()
    db.refresh(db_batch)
    return db_batch

@router.get("/stock", response_model=List[schemas.StockBatchResponse])
def get_stock(db: Session = Depends(database.get_db)):
    return db.query(models.StockBatch).all()

@router.post("/trigger-expiry-audit/{user_id}")
def trigger_expiry_audit(user_id: int, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    target_email = "xyz67728@gmail.com"
    # Find stock expiring within <= 2 days to satisfy "1 day prior" testing realistically
    threshold = datetime.utcnow() + timedelta(days=2)
    
    is_global = user.role in [models.RoleEnum.SUPER_ADMIN, models.RoleEnum.FINANCE]
    loc_ids = [l.id for l in user.locations]
    
    base_query = db.query(models.StockBatch).filter(models.StockBatch.expiry_date <= threshold, models.StockBatch.quantity > 0)
    
    if not is_global:
        base_query = base_query.filter(models.StockBatch.location_id.in_(loc_ids))
        
    expiring_stock = base_query.all()
    
    if not expiring_stock:
        return {"message": "All stock in your jurisdiction is healthy! Nothing is expiring in the next 1-2 days."}
        
    now = datetime.utcnow()
    dead_stock = []
    dying_stock = []
    for stock in expiring_stock:
        if stock.expiry_date < now:
            dead_stock.append(stock)
        else:
            dying_stock.append(stock)
    
    content = f"ADMIN ALERT: The following medicine batches within {user.username}'s jurisdiction are nearing complete expiration:\n\n"
    
    if dying_stock:
        dying_stock_filtered = []
        for stock in dying_stock:
            existing_auto = db.query(models.StockBatch).filter(
                models.StockBatch.product_id == stock.product_id,
                models.StockBatch.location_id == stock.location_id,
                models.StockBatch.batch_number.like('AUTO_%')
            ).first()
            if not existing_auto:
                dying_stock_filtered.append(stock)
                
        if dying_stock_filtered:
            for stock in dying_stock_filtered:
                content += f"- Batch #{stock.batch_number} (Product ID {stock.product_id}): {stock.quantity} units left.\n"
            
            content += "\nRESTOCK CONFIRMATION: No stock is less! The Automated ERP Module has securely injected +100 units of fresh cargo mapped to the 'AUTO_xxx' tag sequences.\n"
            for stock in dying_stock_filtered:
                restock = models.StockBatch(
                    product_id=stock.product_id,
                    location_id=stock.location_id,
                    quantity=100,
                    batch_number=f"AUTO_{int(now.timestamp())}_{stock.product_id}",
                    expiry_date=now + timedelta(days=365)
                )
                db.add(restock)

    if dead_stock:
        content += "\nDELETION CONFIRMATION: The following specific batches have fully expired and have successfully been deleted out of the physical database mapping:\n"
        for stock in dead_stock:
            content += f"- Batch #{stock.batch_number} (Loc {stock.location_id}) - PURGED.\n"
            db.delete(stock)
            
    db.commit()
    
    # Generate Email object
    msg = EmailMessage()
    msg['Subject'] = f'CRITICAL ALERT & AUTO-HEAL [Triggered by {user.username} ({user.role.value})]'
    msg['From'] = target_email
    msg['To'] = target_email
    msg.set_content(content)
    
    mail_status = ""
    
    # Natively parse .env because hackathon environments might not have python-dotenv installed
    env_path = os.path.join(os.getcwd(), ".env")
    if os.path.exists(env_path):
        with open(env_path, "r") as env_file:
            for line in env_file:
                if line.startswith("GMAIL_PASSWORD="):
                    os.environ["GMAIL_PASSWORD"] = line.strip().split("=")[1].strip('"\'')
    
    gmail_password = os.getenv("GMAIL_PASSWORD")
    if gmail_password:
        # App passwords normally shouldn't have spaces
        gmail_password = gmail_password.replace(" ", "")
        try:
            with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
                smtp.login(target_email, gmail_password)
                smtp.send_message(msg)
            mail_status = f"LIVE SMTP EMAIL successfully blasted to {target_email}!"
        except Exception as e:
            mail_status = f"SMTP Failed! (Did you set the Google App Password right?): {str(e)}"
    else:
        mail_status = "Skipped LIVE SMTP. (Since GMAIL_PASSWORD is not set in `.env`, saved to live_email_log.txt offline)."
        
    filepath = os.path.join(os.getcwd(), "live_email_log.txt")
    with open(filepath, "w") as f:
        f.write(content)
        
    return {"message": f"Found {len(expiring_stock)} critically un-expired batches! Status: {mail_status}"}

@router.get("/compliance-report")
def export_compliance_report(db: Session = Depends(database.get_db)):
    # Find all strictly controlled products
    controlled_prods = db.query(models.Product).filter(models.Product.is_controlled == True).all()
    prod_ids = [p.id for p in controlled_prods]
    
    # Get stock allocations    # Calculate aggregate compliance statistics
    controlled_batches = db.query(models.StockBatch).filter(models.StockBatch.product_id.in_(prod_ids)).all()
    total_controlled_batches = len(controlled_batches)
    total_physical_units = sum([b.quantity for b in controlled_batches])
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow([
        "Regulatory Alert", "This is an automatically generated audit ledger for highly regulated narcotics."
    ])
    writer.writerow(["Timestamp:", datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')])
    writer.writerow(["System Total Restricted Units:", str(total_physical_units)])
    writer.writerow([])
    
    writer.writerow([
        "Audit ID",
        "Compound Class",
        "Active Location ID",
        "Tracking Batch Sequence",
        "Physical Volume Present",
        "Mandated Expiry Threshold"
    ])
    
    for c_batch in controlled_batches:
        prod_ref = c_batch.product
        writer.writerow([
            c_batch.id,
            prod_ref.name if prod_ref else "Unknown Restricted Category",
            c_batch.location_id,
            c_batch.batch_number,
            c_batch.quantity,
            c_batch.expiry_date.strftime('%Y-%m-%d')
        ])
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=narcotics_compliance_report.csv"}
    )

@router.delete("/stock/{batch_id}")
def remove_stock_batch(batch_id: int, user_id: int, db: Session = Depends(database.get_db)):
    batch = db.query(models.StockBatch).filter(models.StockBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found.")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User mapping failed.")
        
    is_global = user.role in [models.RoleEnum.SUPER_ADMIN, models.RoleEnum.FINANCE]
    loc_ids = [l.id for l in user.locations]
    
    if not is_global and batch.location_id not in loc_ids:
        raise HTTPException(status_code=403, detail="You do not have administrative permission to delete stock from an external facility.")
        
    db.delete(batch)
    db.commit()
    return {"message": f"Success: Tracking ID #{batch.batch_number} has been permanently wiped from the active network pipeline."}
