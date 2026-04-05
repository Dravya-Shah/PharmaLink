import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, Activity, Package, AlertTriangle, LogOut, ShoppingCart, MessageSquare, Link, PlusCircle, Users, Mail, FlaskConical, FileText } from 'lucide-react';
import BarcodeScannerComponent from "react-qr-barcode-scanner";
import './index.css';

const API_URL = 'http://localhost:8000/api/v1';

function Dashboard({ token, role, userId, userLocs, onLogout }) {
  // Normalize role string 
  const userRole = role?.replace('RoleEnum.', '') || 'pharmacist';

  // RBAC Permission Logic
  const canSeeBI = ['super_admin', 'finance', 'regional_manager', 'supervisor'].includes(userRole);
  const canSeeInventory = ['super_admin', 'supervisor', 'pharmacist', 'regional_manager'].includes(userRole);
  const canSeeSales = ['super_admin', 'pharmacist', 'supervisor'].includes(userRole);
  const canSeeAI = ['super_admin', 'finance', 'regional_manager'].includes(userRole);
  const canSeeAdmin = ['super_admin'].includes(userRole);

  const [activeTab, setActiveTab] = useState(canSeeAdmin ? 'admin' : (canSeeBI ? 'overview' : 'inventory'));

  // Data States
  const [biData, setBiData] = useState(null);
  const [anomalies, setAnomalies] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Sales/POS States
  const [sellLoc, setSellLoc] = useState('');
  const [sellProd, setSellProd] = useState('');
  const [sellQty, setSellQty] = useState(1);
  const [checkoutMsg, setCheckoutMsg] = useState(null);

  // Advanced UX constraints
  const [erpLogs, setErpLogs] = useState([]);
  const [scanning, setScanning] = useState(false);

  // Inventory Replenishment States
  const [inboundLoc, setInboundLoc] = useState('');
  const [inboundProd, setInboundProd] = useState('');
  const [inboundQty, setInboundQty] = useState(100);
  const [inboundBatch, setInboundBatch] = useState('B-NEW');
  const [inboundExpiry, setInboundExpiry] = useState(new Date().toISOString().split('T')[0]);
  const [inboundMsg, setInboundMsg] = useState(null);

  // Filter State
  const [inventoryFilter, setInventoryFilter] = useState('');

  // Product Launch States
  const [newProdName, setNewProdName] = useState('');
  const [newProdDesc, setNewProdDesc] = useState('');
  const [newProdPrice, setNewProdPrice] = useState(10);
  const [newProdControlled, setNewProdControlled] = useState(false);
  const [catalogMsg, setCatalogMsg] = useState(null);

  // Facility Registration States
  const [locName, setLocName] = useState('');
  const [locType, setLocType] = useState('pharmacy');
  const [locAddress, setLocAddress] = useState('');
  const [locMsg, setLocMsg] = useState(null);

  // Expiry Logic
  const [expiryMsg, setExpiryMsg] = useState(null);

  // Agentic Chat States
  const [chatInput, setChatInput] = useState('');
  const [chatLog, setChatLog] = useState([{ role: 'ai', msg: 'Hello! I am the LangChain Agent mapped to your PostgreSQL database. Ask me anything about stock, products, or sales!' }]);
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'overview') {
        const biRes = await fetch(`${API_URL}/bi/daily-close?user_id=${userId}`);
        setBiData((await biRes.json()).data);
      }

      // Load locations & products globally if we are looking at inventory, sales, or admin
      if (['inventory', 'sales', 'admin'].includes(activeTab)) {
        const prodRes = await fetch(`${API_URL}/inventory/products`);
        setProducts(await prodRes.json());
        const locRes = await fetch(`${API_URL}/inventory/locations`);
        setLocations(await locRes.json());
      }

      if (activeTab === 'inventory' || activeTab === 'sales') {
        const invRes = await fetch(`${API_URL}/inventory/stock`);
        setInventory(await invRes.json());
      }
      if (activeTab === 'ai') {
        const aiRes = await fetch(`${API_URL}/ai/anomaly-detection`);
        setAnomalies(await aiRes.json());
      }
      if (activeTab === 'admin') {
        const usersRes = await fetch(`${API_URL}/auth/users`);
        setAdminUsers(await usersRes.json());
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleCheckout = async (e) => {
    e.preventDefault();
    setCheckoutMsg('Processing...');
    if (!sellLoc || !sellProd) { setCheckoutMsg('Select Location and Product.'); return; }

    try {
      const res = await fetch(`${API_URL}/sales/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_id: parseInt(sellLoc),
          items: [{ product_id: parseInt(sellProd), quantity: parseInt(sellQty) }]
        })
      });
      if (res.ok) {
        const data = await res.json();
        setCheckoutMsg('Success! POS Invoice Generated.');
        
        const locNameStr = getLocationName(parseInt(sellLoc));
        const prodNameStr = getProductName(parseInt(sellProd));
        const logMsg = `ERP Payload Sent: Node [${locNameStr}] processed sale of ${sellQty}x [${prodNameStr}].`;
        
        setErpLogs(prev => {
            if (data.po_triggered) {
               return [`⚠️ [STOCK DIP <20]: ERP executed live physical injection (+100 units). Supervisor Alert Emailed!`, logMsg, ...prev];
            }
            return [logMsg, ...prev];
        });

        fetchData();
        setTimeout(() => setCheckoutMsg(null), 4000);
      } else {
        const err = await res.json();
        setCheckoutMsg('Error: ' + err.detail);
      }
    } catch (e) { setCheckoutMsg('Checkout Failed.'); }
  };

  const handleAddStock = async (e) => {
    e.preventDefault();
    setInboundMsg('Adding batch...');
    if (!inboundLoc || !inboundProd) { setInboundMsg('Select Location and Product.'); return; }

    try {
      const res = await fetch(`${API_URL}/inventory/stock?user_id=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_id: parseInt(inboundLoc),
          product_id: parseInt(inboundProd),
          quantity: parseInt(inboundQty),
          batch_number: inboundBatch,
          expiry_date: new Date(inboundExpiry).toISOString()
        })
      });
      if (res.ok) {
        setInboundMsg('Success! Medicine stock replenished safely.');
        fetchData();
        setTimeout(() => setInboundMsg(null), 3000);
      } else {
        const err = await res.json();
        setInboundMsg('Error: ' + err.detail);
      }
    } catch (e) { setInboundMsg('Failed to process addition.'); }
  };

  const handleLaunchProduct = async (e) => {
    e.preventDefault();
    setCatalogMsg('Enrolling...');
    try {
      const res = await fetch(`${API_URL}/inventory/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProdName,
          description: newProdDesc || "Newly launched product entry",
          is_controlled: newProdControlled,
          base_price: parseFloat(newProdPrice)
        })
      });
      if (res.ok) {
        setCatalogMsg('Success! Medicine added to platform catalog.');
        setNewProdName('');
        setNewProdPrice(10);
        fetchData();
        setTimeout(() => setCatalogMsg(null), 3000);
      } else {
        const err = await res.json();
        setCatalogMsg('Error: ' + err.detail);
      }
    } catch (e) { setCatalogMsg('Failed to create new catalog entry.'); }
  };

  const handleCreateLocation = async (e) => {
    e.preventDefault();
    setLocMsg('Registering...');
    try {
      const res = await fetch(`${API_URL}/inventory/locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: locName,
          type: locType,
          address: locAddress
        })
      });
      if (res.ok) {
        setLocMsg('Success! Regional facility operational.');
        setLocName(''); setLocAddress('');
        fetchData();
        setTimeout(() => setLocMsg(null), 3000);
      } else {
        const err = await res.json();
        setLocMsg('Error: ' + err.detail);
      }
    } catch (e) { setLocMsg('Failed to register facility.'); }
  };

  const handleApproveUser = async (userId) => {
    const checkboxes = document.querySelectorAll(`.assign-loc-checkbox-${userId}:checked`);
    const locIds = Array.from(checkboxes).map(cb => parseInt(cb.value));

    if (locIds.length === 0) { alert("Please select at least one facility assignment!"); return; }

    try {
      const res = await fetch(`${API_URL}/auth/users/${userId}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_ids: locIds })
      });
      if (res.ok) {
        fetchData();
      } else {
        alert("Failed to approve user.");
      }
    } catch (e) { alert("Network error."); }
  };

  const handleRevokeUser = async (userId) => {
    if (!window.confirm("Are you sure you want to revoke this agent's access?")) return;
    try {
      const res = await fetch(`${API_URL}/auth/users/${userId}/revoke`, { method: 'PUT' });
      if (res.ok) fetchData();
    } catch (e) { alert("Network error."); }
  };

  const triggerExpiryAudit = async () => {
    setExpiryMsg('Scanning backend AI model for expiring drugs...');
    try {
      const res = await fetch(`${API_URL}/inventory/trigger-expiry-audit/${userId}`, { method: 'POST' });
      const data = await res.json();
      setExpiryMsg(data.message);
    } catch {
      setExpiryMsg('Failed to connect to expiry engine.');
    }
  };

  const handleRemoveStock = async (batchId) => {
    if (!window.confirm("CRITICAL WARNING: Are you sure you want to completely discard this batch instance from the warehouse pipeline?")) return;
    
    try {
      const res = await fetch(`${API_URL}/inventory/stock/${batchId}?user_id=${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        fetchData(); // Reload strictly from server context
      } else {
        alert("Action Restricted: " + data.detail);
      }
    } catch {
      alert("System fault: Unable to connect to backend ERP node.");
    }
  };

  const handleDownloadCompliance = () => {
    window.open(`${API_URL}/inventory/compliance-report`, '_blank');
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput;
    setChatLog(prev => [...prev, { role: 'user', msg }]);
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await fetch(`${API_URL}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: msg })
      });
      const data = await res.json();
      if (data.error) setChatLog(prev => [...prev, { role: 'ai', msg: `Agent Error: ${data.error}` }]);
      else setChatLog(prev => [...prev, { role: 'ai', msg: data.response }]);
    } catch (e) {
      setChatLog(prev => [...prev, { role: 'ai', msg: "Network error connecting to AI backend." }]);
    }
    setChatLoading(false);
  };

  const getProductName = (id) => products.find(p => p.id === id)?.name || 'Unknown';
  const getLocationName = (id) => locations.find(l => l.id === id)?.name || 'Unknown';

  const visibleLocations = (canSeeAdmin || userRole === 'finance') 
    ? locations 
    : locations.filter(l => userLocs.includes(l.id));

  const visibleInventory = (canSeeAdmin || userRole === 'finance') 
    ? inventory 
    : inventory.filter(s => userLocs.includes(s.location_id));

  return (
    <>
      <div className="blob" style={{ top: '-10%', left: '-10%' }} />
      <div className="blob" style={{ bottom: '-10%', right: '-10%', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }} />

      <div className="dashboard-container">
        <nav className="sidebar">
          <h2 className="title" style={{ fontSize: '22px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shield color="#8b5cf6" size={28} /> PharmaLink
          </h2>
          <div className="role-badge" style={{ marginTop: '5px' }}>{userRole}</div>

          <div style={{ marginTop: '40px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {canSeeAdmin && (
              <button className={`nav-btn ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => setActiveTab('admin')}>
                <Users size={18} /> Admin Console
              </button>
            )}
            {canSeeBI && (
              <button className={`nav-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
                <Activity size={18} /> BI Overview
              </button>
            )}
            {canSeeInventory && (
              <button className={`nav-btn ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>
                <Package size={18} /> Inventory & Batches
              </button>
            )}
            {canSeeSales && (
              <button className={`nav-btn ${activeTab === 'sales' ? 'active' : ''}`} onClick={() => setActiveTab('sales')}>
                <ShoppingCart size={18} /> Sales & ERP Workflow
              </button>
            )}
            {canSeeAI && (
              <button className={`nav-btn ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => setActiveTab('ai')}>
                <AlertTriangle size={18} /> AI & Anomaly Engine
              </button>
            )}
          </div>

          <button className="nav-btn" onClick={onLogout} style={{ marginTop: 'auto', color: '#ef4444' }}>
            <LogOut size={18} /> Logout
          </button>
        </nav>

        <main className="main-content">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <h3 style={{ color: '#94a3b8' }}>Executing Backend Subroutines...</h3>
            </div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="dashboard-view">

              {/* --- ADMIN CONSOLE --- */}
              {activeTab === 'admin' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>

                  {/* Regional Facility Registration */}
                  <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                    <div className="glass-panel" style={{ flex: 1, minWidth: '350px', boxSizing: 'border-box', borderLeft: '4px solid #eab308' }}>
                      <h3 style={{ margin: '0 0 15px 0' }}><Link size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> Commission New Facility</h3>

                      {locMsg && (
                        <div className={locMsg.includes('Success') ? 'success-msg' : 'error-msg'} style={{ marginBottom: '15px' }}>{locMsg}</div>
                      )}

                      <form onSubmit={handleCreateLocation} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <input type="text" className="input-field" placeholder="Facility Name (e.g., Northside Pharmacy)" value={locName} onChange={e => setLocName(e.target.value)} required />

                        <select className="input-field" value={locType} onChange={e => setLocType(e.target.value)} required>
                          <option value="pharmacy">Retail Pharmacy</option>
                          <option value="warehouse">Central Warehouse</option>
                        </select>

                        <input type="text" className="input-field" placeholder="Physical Address" value={locAddress} onChange={e => setLocAddress(e.target.value)} required />

                        <button type="submit" className="primary-btn" style={{ background: '#eab308', color: '#000' }}>Register to Network</button>
                      </form>
                    </div>

                    {/* Active Locations Directory */}
                    <div className="glass-panel" style={{ flex: 2, minWidth: '350px', boxSizing: 'border-box' }}>
                      <h3 style={{ margin: '0 0 15px 0' }}>Network Locations Directory</h3>
                      <div style={{ overflowX: 'auto', maxHeight: '250px' }}>
                        <table>
                          <thead>
                            <tr><th>ID</th><th>Facility Name</th><th>Classification</th><th>Location</th></tr>
                          </thead>
                          <tbody>
                            {locations.map(loc => (
                              <tr key={loc.id}>
                                <td>{loc.id}</td>
                                <td style={{ fontWeight: 600 }}>{loc.name}</td>
                                <td><span className="role-badge" style={{ background: loc.type === 'warehouse' ? '#6366f1' : '#4211e5ff' }}>{loc.type.toUpperCase()}</span></td>
                                <td style={{ color: '#94a3b8' }}>{loc.address}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div className="glass-panel" style={{ width: '100%', padding: '30px', boxSizing: 'border-box' }}>
                    <h3 style={{ margin: '0 0 20px 0', fontSize: '20px' }}><Users style={{ verticalAlign: 'middle', marginRight: '10px' }} /> Staff & Agent Directory</h3>
                    <div style={{ overflowX: 'auto' }}>
                      <table>
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>Username</th>
                            <th>Role / Access Level</th>
                            <th>Account Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminUsers.map(u => (
                            <tr key={u.id}>
                              <td>{u.id}</td>
                              <td style={{ fontWeight: 600 }}>{u.username}</td>
                              <td><span className="role-badge">{u.role.replace('RoleEnum.', '')}</span></td>
                              <td>
                                {u.is_active ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                      <Shield size={14} /> Active {u.locations && u.locations.length > 0 && `(Locs: ${u.locations.map(l => l.id).join(', ')})`}
                                    </span>
                                    {/* Don't let the super admin delete themselves */}
                                    {u.username !== 'admin' && (
                                      <button onClick={() => handleRevokeUser(u.id)} className="primary-btn" style={{ padding: '4px 8px', fontSize: '11px', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444' }}>
                                        Revoke
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <span style={{ color: '#ef4444', fontSize: '12px', fontWeight: 'bold' }}>PENDING</span>
                                    <div style={{ maxHeight: '70px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.1)', padding: '5px', borderRadius: '4px', background: 'rgba(0,0,0,0.2)', width: '160px', textAlign: 'left' }}>
                                      {locations.map(l => (
                                        <label key={l.id} style={{ display: 'block', fontSize: '11px', marginBottom: '4px', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                          <input type="checkbox" className={`assign-loc-checkbox-${u.id}`} value={l.id} style={{ marginRight: '5px', verticalAlign: 'middle' }} />
                                          {l.name}
                                        </label>
                                      ))}
                                    </div>
                                    <button onClick={() => handleApproveUser(u.id)} className="primary-btn" style={{ padding: '6px 12px', fontSize: '12px', background: '#3b82f6', height: 'fit-content' }}>Approve</button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* --- BI OVERVIEW --- */}
              {activeTab === 'overview' && biData && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: '0 0 30px 0', fontWeight: '400' }}>Live Operational BI</h2>
                    <div style={{ display: 'flex', gap: '15px' }}>
                      <button className="primary-btn" onClick={handleDownloadCompliance} style={{ background: '#8b5cf6', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileText size={16} /> Export Compliance CSV
                      </button>
                      <button className="primary-btn" onClick={triggerExpiryAudit} style={{ background: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Mail size={16} /> Audit Expiry alerts
                      </button>
                    </div>
                  </div>

                  {expiryMsg && (
                    <div className="success-msg" style={{ marginBottom: '15px', textAlign: 'left', padding: '15px', borderLeft: '4px solid #10b981' }}>
                      {expiryMsg}
                    </div>
                  )}

                  <div className="card-grid">
                    <div className="stat-card glass-panel" style={{ width: 'auto' }}>
                      <h3>Daily Revenue</h3>
                      <h2>${biData.total_revenue.toFixed(2)}</h2>
                    </div>
                    <div className="stat-card glass-panel" style={{ width: 'auto' }}>
                      <h3>Orders Processed</h3>
                      <h2>{biData.total_orders}</h2>
                    </div>
                    <div className="stat-card glass-panel" style={{ width: 'auto', borderBottom: '4px solid #ef4444' }}>
                      <h3>Low Stock Batches</h3>
                      <h2>{biData.low_stock_warnings}</h2>
                    </div>
                  </div>

                  {/* Regional Shop Breakdowns */}
                  {biData.shop_breakdowns && biData.shop_breakdowns.length > 0 && (
                     <div style={{ marginTop: '30px' }}>
                        <h3 style={{ margin: '0 0 15px 0' }}>Facility Financial Segmentation</h3>
                        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                           {biData.shop_breakdowns.map(shop => (
                              <div key={shop.location_id} className="glass-panel" style={{ flex: 1, minWidth: '250px' }}>
                                 <h4 style={{ margin: '0 0 10px 0', color: '#10b981' }}>{shop.location_name}</h4>
                                 <div style={{ marginBottom: '10px' }}>
                                    <span style={{ color: '#94a3b8' }}>Revenue Node:</span> <strong style={{ fontSize: '18px' }}>${shop.shop_total_revenue.toFixed(2)}</strong>
                                 </div>
                                 <div style={{ color: '#94a3b8', fontSize: '12px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '10px' }}>
                                    <strong>Volume by Product:</strong>
                                    {Object.entries(shop.product_breakdown).map(([prod, qty]) => (
                                       <div key={prod} style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                                          <span>{prod}</span>
                                          <span style={{ color: '#fff' }}>{qty}x units</span>
                                       </div>
                                    ))}
                                 </div>
                              </div>
                           ))}
                        </div>
                     </div>
                  )}

                </div>
              )}

              {/* --- INVENTORY LIST & REPLENISHMENT --- */}
              {activeTab === 'inventory' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>

                  <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                    {/* Replenishment Form Panel - RESTRICTED */}
                    {['super_admin', 'supervisor'].includes(userRole) && (
                    <div className="glass-panel" style={{ flex: 1, minWidth: '350px', boxSizing: 'border-box', background: 'rgba(15, 23, 42, 0.8)', borderLeft: '4px solid #10b981' }}>
                      <h3 style={{ margin: '0 0 15px 0' }}><PlusCircle size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> Replenish Active Stock</h3>

                      {inboundMsg && (
                        <div className={inboundMsg.includes('Success') ? 'success-msg' : 'error-msg'} style={{ marginBottom: '15px' }}>
                          {inboundMsg}
                        </div>
                      )}

                      <form onSubmit={handleAddStock} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      <select className="input-field" value={inboundLoc} onChange={e => setInboundLoc(e.target.value)} required>
                        <option value="">-- Select Destination Facility --</option>
                        {visibleLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>

                        <select className="input-field" value={inboundProd} onChange={e => setInboundProd(e.target.value)} required>
                          <option value="">-- Select Product --</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>

                        <div style={{ display: 'flex', gap: '10px' }}>
                          <input type="text" className="input-field" style={{ flex: 1 }} placeholder="Batch No (ex: BX-102)" value={inboundBatch} onChange={e => setInboundBatch(e.target.value)} required />
                          <input type="number" className="input-field" style={{ width: '80px' }} min="1" placeholder="Qty" value={inboundQty} onChange={e => setInboundQty(e.target.value)} required />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '13px', color: '#94a3b8' }}>Exp:</span>
                          <input type="date" className="input-field" value={inboundExpiry} onChange={e => setInboundExpiry(e.target.value)} required />
                        </div>

                        <button type="submit" className="primary-btn">Add Cargo</button>
                      </form>
                    </div>
                    )}

                    {/* Launch New Product Form - ADMIN ONLY */}
                    {canSeeAdmin && (
                    <div className="glass-panel" style={{ flex: 1, minWidth: '350px', boxSizing: 'border-box', background: 'rgba(15, 23, 42, 0.8)', borderLeft: '4px solid #6366f1' }}>
                      <h3 style={{ margin: '0 0 15px 0' }}><FlaskConical size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> Register New Drug to Catalog</h3>

                      {catalogMsg && (
                        <div className={catalogMsg.includes('Success') ? 'success-msg' : 'error-msg'} style={{ marginBottom: '15px' }}>
                          {catalogMsg}
                        </div>
                      )}

                      <form onSubmit={handleLaunchProduct} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <input type="text" className="input-field" placeholder="Medicine Name (e.g., Codeine 20mg)" value={newProdName} onChange={e => setNewProdName(e.target.value)} required />

                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <span style={{ fontSize: '14px', color: '#94a3b8' }}>Base Price $:</span>
                          <input type="number" step="0.01" className="input-field" style={{ flex: 1 }} placeholder="25.50" value={newProdPrice} onChange={e => setNewProdPrice(e.target.value)} required />
                        </div>

                        <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px', color: '#94a3b8' }}>
                          <input type="checkbox" checked={newProdControlled} onChange={e => setNewProdControlled(e.target.checked)} />
                          Is heavily regulated (Narcotic/Controlled)
                        </label>

                        <button type="submit" className="primary-btn" style={{ background: '#6366f1' }}>Launch to Global Catalog</button>
                      </form>
                    </div>
                    )}
                  </div>

                  {/* Dynamic Table */}
                  <div className="glass-panel" style={{ width: '100%', padding: '30px', boxSizing: 'border-box' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                      <h3 style={{ margin: 0, fontSize: '20px' }}>Global Inventory Tracker</h3>
                      <select className="input-field" value={inventoryFilter} onChange={e => setInventoryFilter(e.target.value)} style={{ width: '250px', background: 'rgba(15, 23, 42, 0.9)' }}>
                        <option value="">-- View All Facilities --</option>
                        {locations.map(l => <option key={l.id} value={l.id}>{l.name} - {l.type.toUpperCase()}</option>)}
                      </select>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Batch No.</th>
                            <th>Product</th>
                            <th>Location</th>
                            <th>Quantity Remaining</th>
                            <th>Expiry (Tracking)</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(inventoryFilter ? visibleInventory.filter(s => s.location_id.toString() === inventoryFilter) : visibleInventory).map(stock => (
                            <tr key={stock.id}>
                              <td style={{ color: '#8b5cf6', fontFamily: 'monospace' }}>{stock.batch_number}</td>
                              <td>{getProductName(stock.product_id)}</td>
                              <td>{getLocationName(stock.location_id)}</td>
                              <td style={{ color: stock.quantity < 100 ? '#ef4444' : 'inherit', fontWeight: stock.quantity < 100 ? 'bold' : 'normal' }}>
                                {stock.quantity} Units
                              </td>
                              <td>{new Date(stock.expiry_date).toLocaleDateString()}</td>
                              <td>
                                 <button 
                                   className="primary-btn" 
                                   style={{ background: '#ef4444', padding: '4px 10px', fontSize: '11px', borderRadius: '4px' }}
                                   onClick={() => handleRemoveStock(stock.id)}
                                 >
                                    Discard
                                 </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* --- SALES & ERP COMBO --- */}
              {activeTab === 'sales' && (
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                  <div className="glass-panel" style={{ flex: 1, boxSizing: 'border-box' }}>
                    <h3 style={{ margin: '0 0 20px 0' }}><ShoppingCart size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> Generate POS Invoice</h3>

                    <button type="button" onClick={() => setScanning(!scanning)} className="primary-btn" style={{ background: '#10b981', marginBottom: '15px' }}>
                      {scanning ? 'Close Scanner' : '📷 WebCam Barcode Scan'}
                    </button>

                    {scanning && (
                      <div style={{ border: '2px solid #10b981', padding: '5px', borderRadius: '8px', marginBottom: '15px', background: '#000' }}>
                        <BarcodeScannerComponent
                          width="100%"
                          height={200}
                          onUpdate={(err, result) => {
                            if (result) {
                              setSellProd(result.text);
                              setScanning(false);
                              setCheckoutMsg(`Scanned Product #${result.text} successfully!`);
                            }
                          }}
                        />
                      </div>
                    )}

                    {checkoutMsg && (
                      <div className={checkoutMsg.includes('Success') ? 'success-msg' : 'error-msg'} style={{ marginBottom: '15px' }}>
                        {checkoutMsg}
                      </div>
                    )}

                    <form onSubmit={handleCheckout} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      <select className="input-field" value={sellLoc} onChange={e => setSellLoc(e.target.value)} required>
                        <option value="">-- Select Point of Sale Location --</option>
                        {visibleLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>

                      <select className="input-field" value={sellProd} onChange={e => setSellProd(e.target.value)} required>
                        <option value="">-- Scan / Select Product --</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name} - ${p.base_price}</option>)}
                      </select>

                      <input type="number" className="input-field" min="1" placeholder="Quantity" value={sellQty} onChange={e => setSellQty(e.target.value)} required />

                      <button type="submit" className="primary-btn" style={{ marginTop: '10px' }}>Process Checkout & Sync Replenishment</button>
                    </form>
                  </div>

                  <div className="glass-panel" style={{ flex: 1, boxSizing: 'border-box', background: 'rgba(15, 23, 42, 0.8)' }}>
                    <h3 style={{ margin: '0 0 10px 0', color: '#10b981' }}><Link size={20} style={{ verticalAlign: 'middle' }} /> ERP Integration Visualizer</h3>
                    <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.6' }}>
                      When a checkout occurs, our FastAPI uses <code>BackgroundTasks</code> to push transaction details to external ERP/purchasing modules.
                    </p>
                    <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: '4px', padding: '10px', height: '160px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '12px', marginTop: '15px' }}>
                      {erpLogs.length === 0 ? (
                        <span style={{ color: '#64748b' }}>Awaiting POST invoice to simulate asynchronous background thread dispatch...</span>
                      ) : (
                        erpLogs.map((log, i) => (
                          <div key={i} style={{ color: '#34d399', marginBottom: '5px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '3px' }}>
                            <span style={{ color: '#fff' }}>[{new Date().toLocaleTimeString()}]</span> {log}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* --- AGENTIC AI & CHAT --- */}
              {activeTab === 'ai' && anomalies && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                  <div className="glass-panel" style={{ width: '100%', boxSizing: 'border-box' }}>
                    <h3 style={{ margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <MessageSquare color="#6366f1" /> Agentic SQL Explainer (LangChain)
                    </h3>
                    <div className="chat-window">
                      {chatLog.map((chat, idx) => (
                        <div key={idx} className={`msg ${chat.role}`}>
                          {chat.msg}
                        </div>
                      ))}
                      {chatLoading && <div className="msg ai" style={{ fontStyle: 'italic', opacity: 0.7 }}>Agent is thinking and executing SQL...</div>}
                    </div>
                    <div className="chat-input">
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Ask me 'What is the sum of orders today?'"
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && sendChatMessage()}
                      />
                      <button className="primary-btn" onClick={sendChatMessage}>Send</button>
                    </div>
                  </div>

                  <div className="glass-panel" style={{ width: '100%', boxSizing: 'border-box', borderLeft: '4px solid #ef4444' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0, fontSize: '20px' }}>
                      <AlertTriangle color="#ef4444" size={24} /> Scikit-learn Anomaly Detection
                    </h3>
                    <p style={{ color: '#94a3b8', lineHeight: '1.6', fontSize: '14px' }}>
                      Scanned <strong>{anomalies.total_transactions_analyzed}</strong> historical transactions. Detected <strong>{anomalies.anomalies_detected}</strong> anomalous bulk orders using Isolation Forests.
                    </p>

                    {anomalies.critical_controlled_substance_anomalies?.length > 0 ? (
                      <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '15px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                        <h4 style={{ color: '#ef4444', margin: '0 0 10px 0', fontSize: '14px' }}>⚠️ Anomalous Controlled Substance Activity:</h4>
                        <pre style={{ color: '#f8fafc', margin: 0, fontSize: '12px', overflowX: 'auto' }}>
                          {JSON.stringify(anomalies.critical_controlled_substance_anomalies, null, 2)}
                        </pre>
                      </div>
                    ) : (
                      <p style={{ margin: 0, color: '#10b981' }}>No critical controlled substance violations tracked.</p>
                    )}
                  </div>

                </div>
              )}
            </motion.div>
          )}
        </main>
      </div>
    </>
  );
}

function AuthScreen({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('pharmacist');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const endpoint = isLogin ? '/auth/login' : '/auth/register';
    const payload = isLogin
      // role satisfies Pydantic validation for UserCreate for our hackathon demo
      ? { username, password, role: 'pharmacist' }
      : { username, password, role };

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.detail || 'An error occurred.');
      } else {
        if (isLogin) {
          onLogin(data.access_token, data.role, data.user_id, data.location_ids);
        } else {
          setIsLogin(true);
          setUsername('');
          setPassword('');
        }
      }
    } catch (err) {
      setError('Connection refused. Is the FastAPI backend running on port 8000?');
    }
  };

  return (
    <>
      <div className="blob" style={{ top: '-10%', left: '-10%' }} />
      <div className="blob" style={{ bottom: '-10%', right: '-10%', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }} />

      <motion.div
        className="glass-panel"
        style={{ width: '350px' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
          <Shield size={40} color="#8b5cf6" />
        </div>

        <h2 className="title">PharmaLink</h2>
        <p className="subtitle">{isLogin ? 'Secure Agentic Platform' : 'Create New Account'}</p>

        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <input
            type="text"
            className="input-field"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            type="password"
            className="input-field"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {!isLogin && (
            <select className="input-field" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="pharmacist">Pharmacist</option>
              <option value="supervisor">Supervisor</option>
              <option value="regional_manager">Regional Manager</option>
              <option value="finance">Finance</option>
              <option value="super_admin">Super Admin</option>
            </select>
          )}

          <button type="submit" className="primary-btn">
            {isLogin ? 'Authenticate' : 'Register Agent'}
          </button>
        </form>

        <div className="toggle-text" onClick={() => { setIsLogin(!isLogin); setError(''); }}>
          {isLogin ? "Don't have an account? " : "Already registered? "}
          <span>{isLogin ? "Register here" : "Login"}</span>
        </div>
      </motion.div>
    </>
  );
}

function App() {
  const [token, setToken] = useState(null);
  const [role, setRole] = useState(null);
  const [userId, setUserId] = useState(null);
  const [locationIds, setLocationIds] = useState([]);

  if (token) {
    return <Dashboard token={token} role={role} userId={userId} userLocs={locationIds} onLogout={() => setToken(null)} />;
  }

  return <AuthScreen onLogin={(t, r, uId, locs) => { setToken(t); setRole(r); setUserId(uId); setLocationIds(locs || []); }} />;
}

export default App;
