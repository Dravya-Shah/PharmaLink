import sys
import os
import random
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.database import engine, SessionLocal, Base
from app import models

def seed_db():
    print("Flushing and creating tables...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()

    print("Generating Hierarchy Users...")
    admin = models.User(username="admin", hashed_password="fakehash", role=models.RoleEnum.SUPER_ADMIN, is_active=True)
    regional_manager = models.User(username="rm_john", hashed_password="fakehash", role=models.RoleEnum.REGIONAL_MANAGER, is_active=True)
    supervisor = models.User(username="sup_sarah", hashed_password="fakehash", role=models.RoleEnum.SUPERVISOR, is_active=True)
    pharmacist = models.User(username="jane_doe", hashed_password="fakehash", role=models.RoleEnum.PHARMACIST, is_active=True)
    db.add_all([admin, regional_manager, supervisor, pharmacist])
    db.flush()

    print("Generating 6 Regional Warehouses & 18 Urban Pharmacies (Hackathon Prompt Alignment)...")
    warehouses = []
    for i in range(1, 7):
        w = models.Location(name=f"MedAxis Central Warehouse 0{i}", type=models.LocationType.WAREHOUSE, address=f"{i}00 Industrial Sector")
        warehouses.append(w)
        db.add(w)
        
    pharmacies = []
    for i in range(1, 19):
        p = models.Location(name=f"Urban Node Pharmacy #{i}", type=models.LocationType.PHARMACY, address=f"{i}00 City Center Ave")
        pharmacies.append(p)
        db.add(p)
        
    db.flush()
    
    # Assign specific locations to lower-tier users
    # Supervisor Sarah gets Pharmacy 1, 2 and Warehouse 1
    supervisor.locations.extend([pharmacies[0], pharmacies[1], warehouses[0]])
    # RM John gets Pharmacies 1-9 and Warehouses 1-3
    regional_manager.locations.extend(pharmacies[0:9] + warehouses[0:3])
    # Pharmacist Jane gets Pharmacy 1
    pharmacist.locations.append(pharmacies[0])
    
    db.flush()

    print("Seeding Pharmaceutical Products...")
    products = [
        models.Product(name="Amoxicillin 500mg", description="Antibiotic", is_controlled=False, base_price=12.50),
        models.Product(name="Oxycodone 10mg", description="High-risk Painkiller", is_controlled=True, base_price=45.00),
        models.Product(name="Ibuprofen 200mg", description="NSAID", is_controlled=False, base_price=5.99),
        models.Product(name="Lisinopril 20mg", description="Blood Pressure", is_controlled=False, base_price=18.00),
        models.Product(name="Adderall 20mg", description="ADHD Management", is_controlled=True, base_price=65.00)
    ]
    db.add_all(products)
    db.flush()

    print("Scattering 24-Node Distributed Database Inventory...")
    for loc in (warehouses + pharmacies):
        for prod in products:
            # Warehouses hold massive bulk, Pharmacies hold retail amounts
            base_qty = random.randint(5000, 10000) if loc.type == models.LocationType.WAREHOUSE else random.randint(50, 400)
            
            # Create a healthy batch
            healthy_batch = models.StockBatch(
                product_id=prod.id, 
                location_id=loc.id, 
                quantity=base_qty, 
                batch_number=f"BATCH-{loc.id}-{prod.id}-A", 
                expiry_date=datetime.utcnow() + timedelta(days=random.randint(100, 500))
            )
            db.add(healthy_batch)
            
            # Create a randomly expiring batch for some locations so the AI scanner has work to do
            if random.random() > 0.8:
                danger_batch = models.StockBatch(
                    product_id=prod.id, 
                    location_id=loc.id, 
                    quantity=random.randint(5, 50), 
                    batch_number=f"BATCH-{loc.id}-{prod.id}-EXPIRE", 
                    expiry_date=datetime.utcnow() + timedelta(days=random.randint(0, 3)) # Impending expiry
                )
                db.add(danger_batch)

    print("Generating B2B Sales Anomalies...")
    roles = [admin.id, pharmacist.id, supervisor.id]
    
    for i in range(150): # 150 historical orders
        prod = random.choice(products)
        loc = random.choice(pharmacies)
        qty = random.randint(1, 10) if not prod.is_controlled else random.randint(1, 3)
        
        # Inject an anomaly: huge order of controlled substance
        if i == 50:
            prod = products[1] # Oxy
            qty = 400 # Massive Outlier!
            
        order = models.Order(
            location_id=loc.id,
            created_by_id=random.choice(roles),
            total_amount=prod.base_price * qty
        )
        db.add(order)
        db.flush()
        
        order_item = models.OrderItem(
            order_id=order.id,
            product_id=prod.id,
            quantity=qty,
            price_at_time=prod.base_price
        )
        db.add(order_item)

    db.commit()
    db.close()
    print("Database aligned precisely to High-Scale Enterprise specifications.")

if __name__ == "__main__":
    seed_db()
