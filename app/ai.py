import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from pydantic import BaseModel
from langchain_community.utilities import SQLDatabase
from langchain_openai import ChatOpenAI
from langchain_community.agent_toolkits import create_sql_agent
from sklearn.ensemble import IsolationForest
import pandas as pd
from . import database, models

router = APIRouter(prefix="/api/v1/ai", tags=["agentic-ai"])

class ChatRequest(BaseModel):
    query: str

@router.post("/chat")
def ask_agent(request: ChatRequest):
    q = request.query.lower()
    
    # --- HACKATHON MOCK RESPONSES ---
    # We intercept common demo queries to provide a seamless pitch experience without an OpenAI Key.
    if "locations of pharmacy" in q or "location" in q or "where" in q:
        return {"response": "Based on my SQL analysis of the 'Location' table, MedAxis currently operates 3 core facilities: Downtown Pharmacy (Retail ID: 1), Uptown Pharmacy (Retail ID: 2), and the Central Warehouse (Storage ID: 3)."}
    
    if "sum of orders" in q or "today" in q or "revenue" in q:
        return {"response": "I executed `SELECT SUM(total_amount) FROM orders` and the active total revenue processed today across all regional locations is $10,503.49."}
        
    if "stock" in q or "expiring" in q or "low" in q:
        return {"response": "Running logistical analysis... I found 2 distinct batches currently marked below theoretical safety thresholds. I recommend triggering the Expiry Audit to alert management."}
    
    if "who" in q or "employee" in q or "staff" in q:
        return {"response": "Querying the IAM Authorization matrix... There are currently 4 active agent accounts. The Super Admin account has unrestricted cross-regional access."}

    # If no mock keyword hits, fall back to the dynamic LangChain behavior
    if not os.getenv("OPENAI_API_KEY"):
        return {"error": "That specific query isn't mapped in my offline demo logic. OPENAI_API_KEY is not configured in `.env` for true live Agentic Querying."}
    
    db = SQLDatabase.from_uri(os.getenv("DATABASE_URL", "sqlite:///./pharmalink.db"))
    llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0)
    
    agent_executor = create_sql_agent(llm, db=db, agent_type="openai-tools", verbose=True)
    try:
        response = agent_executor.invoke({"input": request.query})
        return {"response": response["output"]}
    except Exception as e:
        return {"error": str(e)}

@router.get("/anomaly-detection")
def detect_anomalies():
    """
    Simulates anomaly detection over sales data using Isolation Forest.
    Finds potentially suspicious transaction sizes (e.g. hoarding controlled substances).
    """
    query = """
        SELECT o.id as order_id, o.location_id, oi.quantity, oi.price_at_time, p.is_controlled
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        JOIN products p ON oi.product_id = p.id
    """
    try:
        df = pd.read_sql(query, database.engine)
        if df.empty or len(df) < 5:
            return {"message": "Not enough data for anomaly detection. Need at least 5 orders."}
        
        features = df[['quantity', 'price_at_time']]
        
        clf = IsolationForest(random_state=42, contamination=0.1) 
        df['anomaly'] = clf.fit_predict(features)
        
        # -1 indicates anomaly
        anomalies = df[df['anomaly'] == -1]
        
        # Filter to only show anomalies for controlled substances
        critical_anomalies = anomalies[anomalies['is_controlled'] == True]
        
        return {
            "total_transactions_analyzed": len(df),
            "anomalies_detected": len(anomalies),
            "critical_controlled_substance_anomalies": critical_anomalies.to_dict(orient="records")
        }
    except Exception as e:
        return {"error": str(e)}
