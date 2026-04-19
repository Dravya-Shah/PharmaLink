import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

# Use SQLite so no database installation is needed locally
if os.getenv("VERCEL"):
    # Vercel has a read-only filesystem except for /tmp/
    default_db = "sqlite:////tmp/pharmalink.db"
else:
    default_db = "sqlite:///./pharmalink.db"

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", default_db)

# Cloud providers often use postgres:// but SQLAlchemy 1.4+ needs postgresql://
if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

# SQLite demands check_same_thread=False, but PostgreSQL rejects it
connect_args = {}
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependency for FastAPI
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
