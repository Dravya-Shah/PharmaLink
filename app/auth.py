from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from . import models, schemas, database
import hashlib

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

def get_password_hash(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return get_password_hash(plain_password) == hashed_password

@router.post("/register", response_model=schemas.UserResponse)
def register_user(user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_password = get_password_hash(user.password)
    # Default is_active to False. We allow super_admin direct access for Hackathon demo setup purposes.
    initial_active_state = True if user.role == "super_admin" else False
    
    db_user = models.User(username=user.username, role=user.role, hashed_password=hashed_password, is_active=initial_active_state)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@router.post("/login")
def login(user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if not db_user:
        raise HTTPException(status_code=400, detail="Incorrect username or password")
        
    if not db_user.is_active:
        raise HTTPException(status_code=403, detail="Your account is pending Super Admin approval. Please wait for authorization.")
        
    if db_user.hashed_password == "fakehash":
        # Handle the seeded users safely without crashing passlib
        # Accept 'admin' or any password for prototyping, usually we'd re-hash here.
        pass
    else:
        try:
            if not verify_password(user.password, db_user.hashed_password):
                raise HTTPException(status_code=400, detail="Incorrect username or password")
        except Exception:
            # Catch passlib.exc.UnknownHashError to avoid 500 errors
            raise HTTPException(status_code=400, detail="Stored password hash is invalid.")
    
    # For Hackathon speed, we'll return a fake token representing successful login
    loc_ids = [l.id for l in db_user.locations] if db_user.locations else []
    return {
        "access_token": f"token-{db_user.id}-{db_user.role}", 
        "token_type": "bearer", 
        "user_id": db_user.id,
        "user": db_user.username, 
        "role": db_user.role,
        "location_ids": loc_ids
    }

@router.get("/users", response_model=List[schemas.UserResponse])
def get_users(db: Session = Depends(database.get_db)):
    return db.query(models.User).all()

@router.put("/users/{user_id}/approve", response_model=schemas.UserResponse)
def approve_user(user_id: int, request: schemas.ApprovalSchema, db: Session = Depends(database.get_db)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    db_user.is_active = True
    assigned_locs = db.query(models.Location).filter(models.Location.id.in_(request.location_ids)).all()
    db_user.locations = assigned_locs
    db.commit()
    db.refresh(db_user)
    return db_user

@router.put("/users/{user_id}/revoke", response_model=schemas.UserResponse)
def revoke_user(user_id: int, db: Session = Depends(database.get_db)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # We set is_active=False instead of hard-deleting to preserve historical Order foreign keys
    db_user.is_active = False
    db_user.locations.clear()
    db.commit()
    db.refresh(db_user)
    return db_user
