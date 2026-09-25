import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { ShoppingBag, Search, Heart, User, Menu, X, MessageCircle, ArrowRight, Sparkles, Plus, Trash2, Pencil, Tag, Package, Users, ShoppingCart, Settings, LayoutDashboard, ChevronRight, TicketPercent, Minus, Check, Star, Upload, Image as ImageIcon, LoaderCircle, SlidersHorizontal, RotateCcw, MessageSquare, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./lib_supabase";

const logo = `${import.meta.env.BASE_URL}logo/hafiz-mart-logo.png`;
const AuthContext = createContext(null);
function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (user) => {
    if (!user) { setProfile(null); return; }
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    setProfile(data || null);
  };

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadProfile(data.session?.user || null);
      if (mounted) setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      await loadProfile(nextSession?.user || null);
      setLoading(false);
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  const signOut = () => supabase.auth.signOut();
  return <AuthContext.Provider value={{ session, user: session?.user || null, profile, loading, signOut, refreshProfile: () => loadProfile(session?.user || null) }}>{children}</AuthContext.Provider>;
}
const useAuth = () => useContext(AuthContext);

const emptyStore = { products: [], categories: [], banners: [], cart: [], wishlist: [] };
const STORE_KEY = "hafiz-mart-cart";

function readCart() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{"cart":[],"wishlist":[]}'); } catch { return { cart: [], wishlist: [] }; }
}

function mapProduct(p) {
  return { ...p, salePrice: p.sale_price ?? '', image: p.main_image || '', images: Array.isArray(p.images) ? p.images : [], stock: p.stock_quantity ?? 0, categoryId: p.category_id, shortDescription: p.short_description || '', description: p.description || '', createdAt: p.created_at };
}
function mapCategory(c) { return { ...c, image: c.image_url || '', createdAt: c.created_at }; }
function mapBanner(b) { return { ...b, buttonText: b.button_text || '', buttonLink: b.button_link || '/deals', startDate: b.start_date || '', endDate: b.end_date || '', imageUrl: b.image_url || '', createdAt: b.created_at }; }

const StoreContext = createContext(null);
function StoreProvider({ children }) {
  const [store, setStore] = useState({ ...emptyStore, ...readCart() });
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const refresh = async () => {
    setLoading(true);
    const [productsRes, categoriesRes, bannersRes] = await Promise.all([
      supabase.from('products').select('*').order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('created_at', { ascending: false }),
      supabase.from('banners').select('*').eq('status', 'active').order('created_at', { ascending: false })
    ]);
    if (!productsRes.error && !categoriesRes.error && !bannersRes.error) {
      const mappedCategories = (categoriesRes.data || []).map(mapCategory); const catMap = new Map(mappedCategories.map(c => [c.id, c.name])); const mappedProducts = (productsRes.data || []).map(p => ({ ...mapProduct(p), category: catMap.get(p.category_id) || '' })); setStore(s => ({ ...s, products: mappedProducts, categories: mappedCategories, banners: (bannersRes.data || []).map(mapBanner) }));
    } else {
      console.error('Supabase load error', productsRes.error || categoriesRes.error || bannersRes.error);
    }
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [user]);
  useEffect(() => { localStorage.setItem(STORE_KEY, JSON.stringify({ cart: store.cart, wishlist: store.wishlist })); }, [store.cart, store.wishlist]);

  const update = (patch) => setStore(s => ({ ...s, ...patch }));
  const addToCart = (product, qty = 1) => {
    const maxStock = Number(product.stock || 0); if (maxStock < 1) return;
    const existing = store.cart.find(x => x.productId === product.id);
    const nextQty = Math.min(maxStock, Math.max(1, (existing?.qty || 0) + qty));
    const cart = existing ? store.cart.map(x => x.productId === product.id ? { ...x, qty: nextQty } : x) : [...store.cart, { productId: product.id, qty: Math.min(maxStock, Math.max(1, qty)) }];
    update({ cart });
  };
  const cartItems = useMemo(() => store.cart.map((line, index) => ({ ...line, index, product: store.products.find(p => p.id === line.productId) })).filter(x => x.product), [store.cart, store.products]);
  const subtotal = cartItems.reduce((sum, x) => sum + (Number(x.product.salePrice || x.product.price) * x.qty), 0);
  const value = { store, update, addToCart, cartItems, subtotal, refresh, loading };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
const useStore = () => useContext(StoreContext);

function Toast({ message, onClose }) {
  useEffect(() => { if (!message) return; const t = setTimeout(onClose, 2500); return () => clearTimeout(t); }, [message, onClose]);
  if (!message) return null;
  return <motion.div className="toast" initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:20 }}><Check size={16}/>{message}</motion.div>;
}

function WhatsAppButton() {
  const number = import.meta.env.VITE_WHATSAPP_NUMBER || "923000000000";
  return <a className="whatsapp" href={`https://wa.me/${number}`} target="_blank" rel="noreferrer" aria-label="Contact Hafiz Mart on WhatsApp"><MessageCircle size={22}/><span>WhatsApp</span></a>;
}

function Navbar() {
  const { store, cartItems } = useStore(); const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const search = (e) => { e.preventDefault(); if (query.trim()) { navigate(`/shop?search=${encodeURIComponent(query.trim())}`); setSearchOpen(false); setOpen(false); } };
  return <>
    <header className="navbar">
      <div className="container nav-inner">
        <Link to="/" className="brand" onClick={() => setOpen(false)}><img src={logo} alt="Hafiz Mart" /></Link>
        <nav className={`nav-links ${open ? "open" : ""}`}>
          <Link to="/" onClick={() => setOpen(false)}>Home</Link><Link to="/shop" onClick={() => setOpen(false)}>Shop</Link><Link to="/categories" onClick={() => setOpen(false)}>Categories</Link><Link to="/deals" onClick={() => setOpen(false)}>Deals</Link>
        </nav>
        <div className="nav-actions">
          <button aria-label="Search" onClick={() => setSearchOpen(v=>!v)}><Search size={19}/></button>
          <Link to="/wishlist" aria-label="Wishlist"><Heart size={19}/><span className="nav-count">{store.wishlist.length}</span></Link>
          <Link to="/cart" className="cart-icon" aria-label="Cart"><ShoppingBag size={20}/><span>{cartItems.reduce((n,x)=>n+x.qty,0)}</span></Link>
          <Link to={user?"/account":"/login"} aria-label="Account"><User size={19}/></Link>
          <button className="menu-btn" onClick={() => setOpen(!open)} aria-label="Menu">{open ? <X size={22}/> : <Menu size={22}/>}</button>
        </div>
      </div>
      <AnimatePresence>{searchOpen && <motion.form className="search-panel" onSubmit={search} initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}><div className="container search-box"><Search size={18}/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search products..."/><button type="submit">Search</button></div></motion.form>}</AnimatePresence>
    </header>
  </>;
}

function SaleBanner() {
  const { store } = useStore();
  const now = new Date();
  const active = store.banners.find(b => b.status === "active" && (!b.startDate || new Date(b.startDate) <= now) && (!b.endDate || new Date(b.endDate) >= now));
  if (!active) return null;
  return <motion.section className="sale-hero" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}}><div className="container sale-hero-inner">{active.imageUrl && <img src={active.imageUrl} alt=""/>}<div className="sale-hero-copy"><p className="eyebrow"><Sparkles size={14}/> LIMITED OFFER</p><h2>{active.title}</h2>{active.subtitle && <p>{active.subtitle}</p>}{active.buttonText && <Link className="gold-btn" to={active.buttonLink || "/deals"}>{active.buttonText}<ArrowRight size={15}/></Link>}</div></div></motion.section>;
}

function EmptyState({ title, text, action, to, icon: Icon = ShoppingBag }) {
  return <motion.div className="empty-state" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}><div className="empty-icon"><Icon size={30}/></div><h3>{title}</h3><p>{text}</p>{action && <Link className="gold-btn" to={to}>{action}<ArrowRight size={17}/></Link>}</motion.div>;
}

function ProductCard({ product, onToast }) {
  const { store, update, addToCart } = useStore();
  const wished = store.wishlist.includes(product.id);
  const price = Number(product.salePrice || product.price || 0);
  const toggleWish = () => update({ wishlist: wished ? store.wishlist.filter(id=>id!==product.id) : [...store.wishlist, product.id] });
  return <motion.article className="product-card" layout whileHover={{ y:-5 }}>
    <div className="product-image-wrap"><Link to={`/product/${product.id}`}><img src={product.image || logo} alt={product.name}/></Link><button className={`wish-btn ${wished ? "active" : ""}`} onClick={toggleWish}><Heart size={18} fill={wished ? "currentColor" : "none"}/></button>{product.salePrice && <span className="product-badge">SALE</span>}</div>
    <div className="product-info"><p className="product-category">{product.category || "Uncategorized"}</p><Link to={`/product/${product.id}`}><h3>{product.name}</h3></Link><div className="product-price"><strong>Rs. {price.toLocaleString()}</strong>{product.salePrice && <del>Rs. {Number(product.price).toLocaleString()}</del>}</div><button className="add-cart" onClick={()=>{addToCart(product); onToast?.("Product cart mein add ho gaya")}}><ShoppingBag size={15}/> Add to Cart</button></div>
  </motion.article>;
}

function Home() {
  const { store } = useStore(); const [toast,setToast]=useState("");
  const products = store.products.filter(p=>p.status !== "inactive").slice(0,4);
  const cats = store.categories.slice(0,6);
  return <><SaleBanner/><main>
    <section className="hero"><div className="hero-glow"/><div className="container hero-grid"><motion.div className="hero-copy" initial={{opacity:0,x:-25}} animate={{opacity:1,x:0}} transition={{duration:.6}}><p className="eyebrow">WELCOME TO HAFIZ MART</p><h1>Your trusted place for <span>better shopping.</span></h1><p className="hero-text">A modern online store built to grow with your business. Products, offers and orders — all managed from one place.</p><div className="hero-buttons"><Link className="gold-btn" to="/shop">Explore Shop <ArrowRight size={18}/></Link><Link className="ghost-btn" to="/categories">Browse Categories</Link></div></motion.div><motion.div className="hero-card" initial={{opacity:0,scale:.95}} animate={{opacity:1,scale:1}} transition={{duration:.7}}><img src={logo} alt="Hafiz Mart logo"/><div><span>NEW STORE</span><strong>{store.products.length ? `${store.products.length} products live` : "Ready for your first product."}</strong></div></motion.div></div></section>
    <section className="section container"><div className="section-heading"><div><p className="eyebrow">SHOP</p><h2>Featured Products</h2></div>{products.length>0&&<Link className="text-link" to="/shop">View all <ArrowRight size={15}/></Link>}</div>{products.length ? <div className="product-grid">{products.map(p=><ProductCard key={p.id} product={p} onToast={setToast}/>)}</div> : <EmptyState title="No Products Yet" text="Your store is fresh and empty. Add your first product from the admin panel and it will appear here." action="Open Admin" to="/admin"/>}</section>
    <section className="section section-soft"><div className="container"><div className="section-heading"><div><p className="eyebrow">DISCOVER</p><h2>Categories</h2></div>{cats.length>0&&<Link className="text-link" to="/categories">View all <ArrowRight size={15}/></Link>}</div>{cats.length ? <div className="category-grid">{cats.map(c=><Link className="category-card" key={c.id} to={`/shop?category=${encodeURIComponent(c.name)}`}><div><Tag size={19}/></div><strong>{c.name}</strong><span>{store.products.filter(p=>p.category===c.name).length} products</span></Link>)}</div> : <EmptyState title="No Categories Yet" text="Create your first category from the admin panel to start organizing your store." action="Manage Categories" to="/admin/categories" icon={Tag}/>}</div></section>
    <section className="trust-section container"><div><strong>Secure & Simple</strong><span>Built for a clean shopping experience.</span></div><div><strong>WhatsApp Ordering</strong><span>Customers can order directly through WhatsApp.</span></div><div><strong>Ready to Grow</strong><span>Payments and advanced features can be added later.</span></div></section>
  </main><Toast message={toast} onClose={()=>setToast("")}/></>;
}

function Shop() {
  const { store } = useStore(); const [toast,setToast]=useState("");
  const params = new URLSearchParams(window.location.search);
  const [query,setQuery]=useState(params.get("search")||"");
  const [category,setCategory]=useState(params.get("category")||"");
  const [sort,setSort]=useState("newest");
  const [minPrice,setMinPrice]=useState(""); const [maxPrice,setMaxPrice]=useState("");
  const [saleOnly,setSaleOnly]=useState(false); const [inStock,setInStock]=useState(false);
  const [filtersOpen,setFiltersOpen]=useState(false);
  const reset=()=>{setQuery("");setCategory("");setSort("newest");setMinPrice("");setMaxPrice("");setSaleOnly(false);setInStock(false)};
  let products=store.products.filter(p=>p.status!=="inactive")
    .filter(p=>!category||p.category===category)
    .filter(p=>!query||`${p.name} ${p.brand||""} ${p.sku||""} ${p.shortDescription||""}`.toLowerCase().includes(query.toLowerCase()))
    .filter(p=>!minPrice||Number(p.salePrice||p.price)>=Number(minPrice))
    .filter(p=>!maxPrice||Number(p.salePrice||p.price)<=Number(maxPrice))
    .filter(p=>!saleOnly||Boolean(p.salePrice))
    .filter(p=>!inStock||Number(p.stock||0)>0);
  products=[...products].sort((a,b)=>sort==="price-low"?(Number(a.salePrice||a.price)-Number(b.salePrice||b.price)):sort==="price-high"?(Number(b.salePrice||b.price)-Number(a.salePrice||a.price)):sort==="name"?a.name.localeCompare(b.name):new Date(b.createdAt)-new Date(a.createdAt));
  return <main className="page"><div className="container"><div className="page-head"><div><p className="eyebrow">CATALOG</p><h1>Shop</h1><p>Browse the live products in Hafiz Mart.</p></div><span className="result-count">{products.length} products</span></div>
    <div className="filters"><div className="filter-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search products, brand or SKU..."/></div><select value={category} onChange={e=>setCategory(e.target.value)}><option value="">All categories</option>{store.categories.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}</select><select value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Newest</option><option value="name">Name A–Z</option><option value="price-low">Price: Low to High</option><option value="price-high">Price: High to Low</option></select><button className="ghost-btn filter-toggle" onClick={()=>setFiltersOpen(v=>!v)}><SlidersHorizontal size={16}/> Filters</button></div>
    <AnimatePresence>{filtersOpen&&<motion.div className="advanced-filters" initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}><label>Min Price<input type="number" min="0" value={minPrice} onChange={e=>setMinPrice(e.target.value)} placeholder="Rs. 0"/></label><label>Max Price<input type="number" min="0" value={maxPrice} onChange={e=>setMaxPrice(e.target.value)} placeholder="No limit"/></label><label className="check-filter"><input type="checkbox" checked={saleOnly} onChange={e=>setSaleOnly(e.target.checked)}/> Sale only</label><label className="check-filter"><input type="checkbox" checked={inStock} onChange={e=>setInStock(e.target.checked)}/> In stock only</label><button className="text-link" onClick={reset}><RotateCcw size={14}/> Reset filters</button></motion.div>}</AnimatePresence>
    {products.length?<div className="product-grid">{products.map(p=><ProductCard key={p.id} product={p} onToast={setToast}/>)}</div>:<EmptyState title="No Products Found" text={store.products.length?"Search/filter change karke dobara try karein.":"Abhi store mein koi product nahi hai."} action="Reset Filters" to="/shop" icon={Search}/>}</div><Toast message={toast} onClose={()=>setToast("")}/></main>;
}
function StarRating({value=0,size=16}){
  return <span className="stars" aria-label={`${value} out of 5 stars`}>{[1,2,3,4,5].map(n=><Star key={n} size={size} fill={n<=Math.round(value)?"currentColor":"none"}/>)}</span>;
}

function ProductReviews({productId}){
  const {user,profile}=useAuth();
  const [reviews,setReviews]=useState([]); const [loading,setLoading]=useState(true); const [rating,setRating]=useState(5); const [title,setTitle]=useState(""); const [comment,setComment]=useState(""); const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
  const load=async()=>{setLoading(true);const {data,error}=await supabase.from('reviews').select('id,user_id,reviewer_name,rating,title,comment,status,created_at').eq('product_id',productId).eq('status','approved').order('created_at',{ascending:false});if(!error)setReviews(data||[]);setLoading(false)};
  useEffect(()=>{load()},[productId]);
  const mine=reviews.some(r=>r.user_id===user?.id);
  const submit=async e=>{e.preventDefault();if(!user){setMessage('Review dene ke liye customer account mein login karein.');return;}setBusy(true);setMessage('');const {error}=await supabase.from('reviews').insert({product_id:productId,user_id:user.id,reviewer_name:profile?.full_name||user.email?.split('@')[0]||'Customer',rating,title:title.trim()||null,comment:comment.trim()||null,status:'pending'});if(error)setMessage(error.code==='23505'?'Aap is product ko already review kar chuke hain.':error.message);else{setTitle('');setComment('');setMessage('Review submit ho gaya. Admin approval ke baad storefront par show hoga.');}setBusy(false);load()};
  const avg=reviews.length?reviews.reduce((n,r)=>n+Number(r.rating||0),0)/reviews.length:0;
  return <section className="reviews-section"><div className="section-heading"><div><p className="eyebrow">CUSTOMER VOICE</p><h2>Reviews {reviews.length>0&&<small>({reviews.length})</small>}</h2></div>{reviews.length>0&&<div className="review-summary"><StarRating value={avg}/><strong>{avg.toFixed(1)}</strong></div>}</div>{loading?<div className="mini-empty">Reviews load ho rahe hain...</div>:reviews.length?<div className="review-list">{reviews.map(r=><article className="review-card" key={r.id}><div className="review-card-head"><div><strong>{r.reviewer_name||'Customer'}</strong><span>{new Date(r.created_at).toLocaleDateString()}</span></div><StarRating value={r.rating}/></div>{r.title&&<h3>{r.title}</h3>}{r.comment&&<p>{r.comment}</p>}</article>)}</div>:<div className="mini-empty"><MessageSquare size={24}/><strong>No approved reviews yet</strong><span>Is product par pehla review aap de sakte hain.</span></div>}
    <div className="review-form-wrap"><div><p className="eyebrow">WRITE A REVIEW</p><h3>Apna experience share karein</h3><p className="muted">Reviews admin approval ke baad public hoti hain.</p></div>{user&&!mine?<form className="review-form" onSubmit={submit}><div className="star-picker"><span>Rating</span><div>{[1,2,3,4,5].map(n=><button type="button" key={n} onClick={()=>setRating(n)} className={n<=rating?'active':''} aria-label={`${n} stars`}><Star size={22} fill={n<=rating?'currentColor':'none'}/></button>)}</div></div><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Review title (optional)" maxLength={80}/><textarea value={comment} onChange={e=>setComment(e.target.value)} placeholder="Aapka review..." rows="4" maxLength={500}/><button className="gold-btn" disabled={busy}>{busy?'Submitting...':'Submit Review'} <Star size={16}/></button></form>:<div className="review-login"><ShieldCheck size={20}/><span>{user?(mine?'Aapka review already submit ho chuka hai.':''): 'Login karke review submit karein.'}</span>{!user&&<Link className="text-link" to="/login">Login <ArrowRight size={14}/></Link>}</div>}{message&&<p className="review-message">{message}</p>}</div></section>;
}

function ProductDetails() {
  const { id } = useParams(); const { store, addToCart, update }=useStore(); const product=store.products.find(p=>p.id===id); const [qty,setQty]=useState(1); const [toast,setToast]=useState(""); const [selectedImage,setSelectedImage]=useState(0);
  if(!product) return <main className="page container"><EmptyState title="Product Not Found" text="Yeh product available nahi hai." action="Back to Shop" to="/shop"/></main>;
  const gallery=[...(product.images||[])]; if(product.image&&!gallery.includes(product.image))gallery.unshift(product.image); const images=gallery.length?gallery:[logo]; const currentImage=images[Math.min(selectedImage,images.length-1)];
  const price=Number(product.salePrice||product.price||0); const wished=store.wishlist.includes(product.id); const waNumber=import.meta.env.VITE_WHATSAPP_NUMBER||"923000000000"; const waText=`Assalam o Alaikum, mujhe Hafiz Mart se yeh product order karna hai:\n\nProduct: ${product.name}\nSKU: ${product.sku||"N/A"}\nQuantity: ${qty}\nPrice: Rs. ${price.toLocaleString()}\nTotal: Rs. ${(price*qty).toLocaleString()}`;
  return <main className="page"><div className="container product-detail"><div className="detail-gallery"><div className="detail-image"><img src={currentImage} alt={product.name}/></div>{images.length>1&&<div className="thumbnail-row">{images.map((src,i)=><button key={src+i} className={i===selectedImage?'active':''} onClick={()=>setSelectedImage(i)}><img src={src} alt={`${product.name} ${i+1}`}/></button>)}</div>}</div><div className="detail-copy"><p className="eyebrow">{product.category||"PRODUCT"}</p><h1>{product.name}</h1><div className="detail-price"><strong>Rs. {price.toLocaleString()}</strong>{product.salePrice&&<del>Rs. {Number(product.price).toLocaleString()}</del>}</div><p className="detail-description">{product.description||product.shortDescription||"Is product ki detailed description abhi add nahi ki gayi."}</p><div className="stock-line">{Number(product.stock||0)>0?<><Check size={16}/> In stock — {product.stock} available</>:"Out of stock"}</div><div className="detail-actions"><div className="qty"><button onClick={()=>setQty(Math.max(1,qty-1))}><Minus size={15}/></button><strong>{qty}</strong><button onClick={()=>setQty(Math.min(Number(product.stock||1),qty+1))}><Plus size={15}/></button></div><button className="gold-btn" disabled={!Number(product.stock||0)} onClick={()=>{addToCart(product,qty);setToast("Product cart mein add ho gaya")}}><ShoppingBag size={17}/> Add to Cart</button><button className={`icon-btn ${wished?"active":""}`} onClick={()=>update({wishlist:wished?store.wishlist.filter(x=>x!==id):[...store.wishlist,id]})}><Heart size={19} fill={wished?"currentColor":"none"}/></button></div><a className="whatsapp-order" href={`https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noreferrer"><MessageCircle size={18}/> Order on WhatsApp</a><Toast message={toast} onClose={()=>setToast("")}/></div></div><div className="container"><ProductReviews productId={product.id}/></div></main>;
}
function Categories() { const {store}=useStore(); return <main className="page"><div className="container"><div className="page-head"><div><p className="eyebrow">DISCOVER</p><h1>Categories</h1><p>Explore products by category.</p></div></div>{store.categories.length?<div className="category-grid large">{store.categories.map(c=><Link className="category-card" key={c.id} to={`/shop?category=${encodeURIComponent(c.name)}`}><div><Tag size={22}/></div><strong>{c.name}</strong><span>{store.products.filter(p=>p.category===c.name).length} products</span></Link>)}</div>:<EmptyState title="No Categories Yet" text="Admin panel se apni first category create karein." action="Open Admin" to="/admin/categories" icon={Tag}/>}</div></main>; }
function Deals(){ const {store}=useStore(); const deals=store.products.filter(p=>p.salePrice); return <main className="page"><div className="container"><div className="page-head"><div><p className="eyebrow">OFFERS</p><h1>Deals</h1><p>Products with an active sale price.</p></div></div>{deals.length?<div className="product-grid">{deals.map(p=><ProductCard key={p.id} product={p}/>)}</div>:<EmptyState title="No Active Deals" text="Jab aap kisi product par sale price set karenge to woh yahan show hoga." action="Manage Products" to="/admin/products" icon={Tag}/>}</div></main>; }
function Wishlist(){ const {store}=useStore(); const products=store.products.filter(p=>store.wishlist.includes(p.id)); return <main className="page"><div className="container"><div className="page-head"><div><p className="eyebrow">SAVED</p><h1>Wishlist</h1><p>Your saved products.</p></div></div>{products.length?<div className="product-grid">{products.map(p=><ProductCard key={p.id} product={p}/>)}</div>:<EmptyState title="Wishlist Empty" text="Product cards par heart icon press karke items save karein." action="Start Shopping" to="/shop" icon={Heart}/>}</div></main>; }

function Cart(){ const {store,cartItems,subtotal,update}=useStore(); const delivery=0; const total=subtotal+delivery; const waNumber=import.meta.env.VITE_WHATSAPP_NUMBER||"923000000000"; const changeQty=(index,delta)=>{const cart=[...store.cart]; cart[index]={...cart[index],qty:Math.max(1,cart[index].qty+delta)};update({cart})}; const remove=(index)=>update({cart:store.cart.filter((_,i)=>i!==index)}); const message=`Assalam o Alaikum, Hafiz Mart se order place karna hai.\n\n${cartItems.map(x=>`• ${x.product.name} x${x.qty} — Rs. ${(Number(x.product.salePrice||x.product.price)*x.qty).toLocaleString()}`).join("\n")}\n\nSubtotal: Rs. ${subtotal.toLocaleString()}\nDelivery: Rs. ${delivery.toLocaleString()}\nTotal: Rs. ${total.toLocaleString()}`; return <main className="page"><div className="container"><div className="page-head"><div><p className="eyebrow">YOUR BAG</p><h1>Cart</h1><p>Review your items before ordering.</p></div></div>{cartItems.length?<div className="cart-layout"><div className="cart-list">{cartItems.map(x=><div className="cart-row" key={x.index}><img src={x.product.image||logo} alt=""/><div className="cart-main"><Link to={`/product/${x.product.id}`}><strong>{x.product.name}</strong></Link><span>Rs. {Number(x.product.salePrice||x.product.price).toLocaleString()}</span></div><div className="qty"><button onClick={()=>changeQty(x.index,-1)}><Minus size={14}/></button><strong>{x.qty}</strong><button onClick={()=>changeQty(x.index,1)}><Plus size={14}/></button></div><strong className="line-total">Rs. {(Number(x.product.salePrice||x.product.price)*x.qty).toLocaleString()}</strong><button className="remove-btn" onClick={()=>remove(x.index)}><Trash2 size={16}/></button></div>)}</div><aside className="summary"><p className="eyebrow">SUMMARY</p><h2>Order Total</h2><div><span>Subtotal</span><strong>Rs. {subtotal.toLocaleString()}</strong></div><div><span>Delivery</span><strong>Rs. {delivery.toLocaleString()}</strong></div><div className="summary-total"><span>Total</span><strong>Rs. {total.toLocaleString()}</strong></div><Link className="gold-btn full" to="/checkout">Checkout</Link><a className="whatsapp-order full" href={`https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"><MessageCircle size={18}/> Order on WhatsApp</a></aside></div>:<EmptyState title="Your Cart is Empty" text="Shop se products add karein, phir yahan order summary dekhein." action="Start Shopping" to="/shop"/>}</div></main>; }

function Checkout(){
  const { cartItems, subtotal, update } = useStore();
  const { user } = useAuth();
  const [form,setForm]=useState({name:'',phone:'',email:user?.email||'',address:'',city:''});
  const [couponCode,setCouponCode]=useState(''); const [coupon,setCoupon]=useState(null);
  const [busy,setBusy]=useState(false); const [couponBusy,setCouponBusy]=useState(false); const [error,setError]=useState(''); const [couponError,setCouponError]=useState(''); const [order,setOrder]=useState(null);
  const waNumber=import.meta.env.VITE_WHATSAPP_NUMBER||'923000000000';
  useEffect(()=>{ if(user?.email) setForm(f=>({...f,email:f.email||user.email})); },[user]);
  const applyCoupon=async()=>{
    setCouponBusy(true); setCouponError(''); setCoupon(null);
    if(!couponCode.trim()){setCouponError('Coupon code enter karein.');setCouponBusy(false);return;}
    const {data,error}=await supabase.rpc('validate_hafiz_coupon',{p_code:couponCode.trim(),p_subtotal:subtotal});
    const result=Array.isArray(data)?data[0]:data;
    if(error){setCouponError(error.message);} else if(!result || Number(result.discount||0)<=0){setCouponError(result?.message||'Coupon apply nahi hua.');} else {setCoupon({code:result.coupon_code||result.code||couponCode.trim().toUpperCase(),discount:Number(result.discount||0)});}
    setCouponBusy(false);
  };
  const discount=Number(coupon?.discount||0); const total=Math.max(0,subtotal-discount);
  if(order) return <main className="page container"><EmptyState title="Order Placed Successfully" text={`Aapka order ${order.order_number} successfully create ho gaya hai. WhatsApp mein order details bhi open ho rahi hain.`} action="Continue Shopping" to="/shop" icon={Check}/><div className="order-success-card"><span>ORDER NUMBER</span><strong>{order.order_number}</strong><small>Total: Rs. {Number(order.total).toLocaleString()}</small></div></main>;
  if(!cartItems.length) return <main className="page container"><EmptyState title="Cart Empty" text="Checkout se pehle cart mein product add karein." action="Go to Shop" to="/shop"/> </main>;
  const submit=async e=>{
    e.preventDefault(); setBusy(true); setError('');
    const items=cartItems.map(x=>({product_id:x.product.id,quantity:x.qty}));
    const {data,error:rpcError}=await supabase.rpc('create_hafiz_order',{p_customer:form,p_items:items,p_coupon_code:coupon?.code||null});
    if(rpcError){setError(rpcError.message);setBusy(false);return;}
    const created=Array.isArray(data)?data[0]:data;
    if(!created){setError('Order create nahi hua. Dobara try karein.');setBusy(false);return;}
    const lines=cartItems.map(x=>`• ${x.product.name} x${x.qty} — Rs. ${(Number(x.product.salePrice||x.product.price)*x.qty).toLocaleString()}`).join('\n');
    const couponLine=coupon?`\nCoupon: ${coupon.code} (-Rs. ${Number(created.discount||0).toLocaleString()})`:'';
    const text=`Assalam o Alaikum, Hafiz Mart se order confirm karna hai.\n\nOrder: ${created.order_number}\nCustomer: ${form.name}\nPhone: ${form.phone}\nEmail: ${form.email||'N/A'}\nAddress: ${form.address}, ${form.city}\n\n${lines}${couponLine}\n\nTotal: Rs. ${Number(created.total).toLocaleString()}`;
    update({cart:[]}); setOrder(created); setBusy(false);
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`,'_blank','noopener,noreferrer');
  };
  return <main className="page"><div className="container checkout-layout"><div><p className="eyebrow">CHECKOUT</p><h1>Customer Details</h1><p className="muted">Order pehle Hafiz Mart database mein save hoga, phir WhatsApp par confirmation message open hoga.</p><form className="form-card" onSubmit={submit}>{[['name','Full Name',true],['phone','Phone',true],['email','Email',false],['address','Delivery Address',true],['city','City',true]].map(([key,label,required])=><label key={key}>{label}<input required={required} type={key==='email'?'email':'text'} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} placeholder={label}/></label>)}<div className="coupon-box"><div><strong>Have a coupon?</strong><span>Discount code apply karein.</span></div><div className="coupon-row"><input value={couponCode} onChange={e=>{setCouponCode(e.target.value.toUpperCase());setCoupon(null);setCouponError('')}} placeholder="e.g. SAVE10"/><button type="button" className="ghost-btn" disabled={couponBusy} onClick={applyCoupon}>{couponBusy?'Checking...':'Apply'}</button></div>{coupon&&<div className="coupon-success"><Check size={15}/> {coupon.code} applied — Rs. {coupon.discount.toLocaleString()} off</div>}{couponError&&<div className="coupon-error"><Tag size={14}/> {couponError}</div>}</div>{error&&<div className="error-box">{error}</div>}<button className="gold-btn full" type="submit" disabled={busy}>{busy?'Placing Order...':'Place Order & Continue to WhatsApp'} <MessageCircle size={17}/></button></form></div><aside className="summary"><p className="eyebrow">ORDER</p><h2>Summary</h2>{cartItems.map(x=><div key={x.index} className="mini-line"><span>{x.product.name} × {x.qty}</span><strong>Rs. {(Number(x.product.salePrice||x.product.price)*x.qty).toLocaleString()}</strong></div>)}<div><span>Subtotal</span><strong>Rs. {subtotal.toLocaleString()}</strong></div><div><span>Discount</span><strong className={discount?'discount-text':''}>{discount?`- Rs. ${discount.toLocaleString()}`:'Rs. 0'}</strong></div><div><span>Delivery</span><strong>Rs. 0</strong></div><div className="summary-total"><span>Total</span><strong>Rs. {total.toLocaleString()}</strong></div></aside></div></main>;
}

function Account(){
  const { user, profile, refreshProfile }=useAuth(); const [orders,setOrders]=useState([]); const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [message,setMessage]=useState("");
  const [form,setForm]=useState({full_name:profile?.full_name||"",phone:profile?.phone||""});
  useEffect(()=>{setForm({full_name:profile?.full_name||"",phone:profile?.phone||""})},[profile]);
  useEffect(()=>{ if(!user){setLoading(false);return;} (async()=>{const {data,error}=await supabase.from('orders').select('*').eq('user_id',user.id).order('created_at',{ascending:false}); if(error) console.error(error); else setOrders(data||[]); setLoading(false);})()},[user]);
  const saveProfile=async e=>{e.preventDefault();setSaving(true);setMessage('');const {error}=await supabase.from('profiles').update({full_name:form.full_name.trim(),phone:form.phone.trim()}).eq('id',user.id);if(error)setMessage(error.message);else{setMessage('Profile update ho gaya.');refreshProfile()}setSaving(false)};
  if(!user) return <main className="page container"><EmptyState title="Login Required" text="Apni profile aur order history dekhne ke liye customer account mein login karein." action="Login" to="/login" icon={User}/></main>;
  return <main className="page"><div className="container"><div className="page-head"><div><p className="eyebrow">MY ACCOUNT</p><h1>{profile?.full_name||'Account'}</h1><p>{user.email}</p></div></div><div className="account-grid"><section className="form-card"><div className="panel-head-row"><div><p className="eyebrow">PROFILE</p><h2>Your details</h2></div><User size={20}/></div><form onSubmit={saveProfile}><label>Full Name<input value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})} placeholder="Your name"/></label><label>Phone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="03xx..."/></label><label>Email<input value={user.email||''} disabled/></label><button className="gold-btn" disabled={saving}>{saving?'Saving...':'Save Profile'}</button>{message&&<p className="review-message">{message}</p>}</form></section><section><div className="section-heading"><div><p className="eyebrow">ORDERS</p><h2>Order History</h2></div><Link className="text-link" to="/shop">Shop more <ArrowRight size={15}/></Link></div>{loading?<div className="mini-empty">Orders load ho rahe hain...</div>:orders.length?<div className="account-orders">{orders.map(o=><div className="account-order" key={o.id}><div><strong>{o.order_number||o.id.slice(0,8)}</strong><span>{new Date(o.created_at).toLocaleString()}</span></div><div><b>Rs. {Number(o.total||0).toLocaleString()}</b><em className={`status status-${o.status}`}>{String(o.status||'pending').replaceAll('_',' ')}</em></div></div>)}</div>:<EmptyState title="No Orders Yet" text="Aapki placed orders yahan appear hongi." action="Start Shopping" to="/shop" icon={ShoppingCart}/>}</section></div></div></main>;
}
function Login(){
  const { user, profile } = useAuth(); const navigate = useNavigate();
  const [mode,setMode]=useState('login'); const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [name,setName]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [message,setMessage]=useState('');
  useEffect(()=>{ if(user && profile) navigate(profile.role==='admin'?'/admin':'/account'); },[user,profile,navigate]);
  const submit=async e=>{ e.preventDefault(); setBusy(true); setError(''); setMessage('');
    const result = mode==='login' ? await supabase.auth.signInWithPassword({email,password}) : await supabase.auth.signUp({email,password,options:{data:{full_name:name}}});
    if(result.error) setError(result.error.message); else if(mode==='register' && !result.data.session) setMessage('Account create ho gaya. Agar email confirmation enabled hai to email confirm karein.');
    setBusy(false);
  };
  return <main className="auth-page"><div className="auth-card"><img src={logo} alt="Hafiz Mart"/><p className="eyebrow">ACCOUNT</p><h1>{mode==='login'?'Welcome back':'Create account'}</h1><p className="muted">{mode==='login'?'Hafiz Mart admin/customer account mein sign in karein.':'Hafiz Mart par apna account create karein.'}</p>
    {mode==='register'&&<label>Full Name<input value={name} onChange={e=>setName(e.target.value)} required/></label>}
    <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={6}/></label>
    {error&&<p className="muted" style={{color:'#d66'}}>{error}</p>}{message&&<p className="muted">{message}</p>}
    <button className="gold-btn full" type="button" disabled={busy} onClick={submit}>{busy?'Please wait...':mode==='login'?'Login':'Create Account'} <ArrowRight size={17}/></button>
    <button className="text-link center" type="button" onClick={()=>{setMode(mode==='login'?'register':'login');setError('');setMessage('')}}>{mode==='login'?'Create a new account':'Already have an account? Login'}</button>
    <Link className="text-link center" to="/">Back to store</Link></div></main>; }

function AdminLayout({children}){
  const { profile, loading, signOut } = useAuth();
  if(loading) return <main className="page container"><EmptyState title="Loading admin..." text="Authentication aur store data verify ho raha hai."/> </main>;
  if(!profile || profile.role!=='admin') return <main className="page container"><EmptyState title="Admin access required" text="Is section ke liye admin account se login karein." action="Login" to="/login" icon={User}/></main>;
  const links=[['/admin',LayoutDashboard,'Dashboard'],['/admin/products',Package,'Products'],['/admin/categories',Tag,'Categories'],['/admin/banners',Sparkles,'Sale Banners'],['/admin/coupons',TicketPercent,'Coupons'],['/admin/orders',ShoppingCart,'Orders'],['/admin/customers',Users,'Customers'],['/admin/reviews',Star,'Reviews'],['/admin/settings',Settings,'Settings']];
  return <main className="admin-shell"><aside className="admin-sidebar"><Link to="/admin" className="admin-logo"><img src={logo} alt="Hafiz Mart"/></Link><nav>{links.map(([to,I,label])=><Link key={to} to={to}><I size={17}/>{label}</Link>)}</nav><Link className="store-link" to="/"><ArrowRight size={15}/> View Store</Link><button className="store-link" onClick={signOut}>Sign out</button></aside><section className="admin-content">{children}</section></main>;
}

function Admin(){
  const {store}=useStore(); const [stats,setStats]=useState({orders:0,customers:0,revenue:0}); const [recent,setRecent]=useState([]);
  useEffect(()=>{ let active=true; (async()=>{ const [orders,customers]=await Promise.all([supabase.from('orders').select('id,total,status,created_at,customer_name,order_number').order('created_at',{ascending:false}),supabase.from('profiles').select('id,role',{count:'exact',head:true}).eq('role','customer')]); if(!active)return; const rows=orders.data||[]; setStats({orders:rows.length,customers:customers.count||0,revenue:rows.filter(o=>o.status!=='cancelled').reduce((n,o)=>n+Number(o.total||0),0)}); setRecent(rows.slice(0,5)); })(); return()=>{active=false}; },[]);
  return <AdminLayout><div className="admin-head"><div><p className="eyebrow">ADMIN PANEL</p><h1>Dashboard</h1><p>Real Supabase-backed Hafiz Mart control center.</p></div><Link className="gold-btn" to="/admin/products/new"><Plus size={17}/> Add Product</Link></div><div className="stats-grid six">{[[Package,'Products',store.products.length,'Live catalog'],[Tag,'Categories',store.categories.length,'Live categories'],[ShoppingCart,'Orders',stats.orders,'Database orders'],[Users,'Customers',stats.customers,'Registered customers'],[Sparkles,'Active Sales',store.banners.length,'Promotional banners'],[ShoppingBag,'Revenue',`Rs. ${stats.revenue.toLocaleString()}`,'Non-cancelled orders']].map(([I,n,v,small],i)=><motion.div className="stat-card" key={n} initial={{opacity:0,y:15}} animate={{opacity:1,y:0}} transition={{delay:i*.04}}><I size={18}/><span>{n}</span><strong>{v}</strong><small>{small}</small></motion.div>)}</div><div className="admin-grid"><div className="panel"><div className="panel-head-row"><div><p className="eyebrow">RECENT ORDERS</p><h2>Latest Activity</h2></div><Link className="text-link" to="/admin/orders">View all <ArrowRight size={15}/></Link></div>{recent.length?<div className="recent-orders">{recent.map(o=><Link to="/admin/orders" className="recent-order" key={o.id}><div><strong>{o.order_number||o.id.slice(0,8)}</strong><span>{o.customer_name||'Customer'} · {new Date(o.created_at).toLocaleString()}</span></div><div><b>Rs. {Number(o.total||0).toLocaleString()}</b><em className={`status status-${o.status}`}>{o.status}</em></div></Link>)}</div>:<div className="mini-empty"><ShoppingCart size={25}/><strong>No orders yet</strong><span>Customer checkout complete hone ke baad orders yahan appear honge.</span></div>}</div><div className="panel"><p className="eyebrow">QUICK START</p><h2>Store Setup</h2><div className="check-row"><span>01</span><div><strong>Add products</strong><small>Real catalog items with images and stock.</small></div><Link to="/admin/products"><ChevronRight size={16}/></Link></div><div className="check-row"><span>02</span><div><strong>Manage orders</strong><small>Confirm, pack, ship and deliver customer orders.</small></div><Link to="/admin/orders"><ChevronRight size={16}/></Link></div><div className="check-row"><span>03</span><div><strong>Create a sale</strong><small>Publish promotional banners from admin.</small></div><Link to="/admin/banners"><ChevronRight size={16}/></Link></div></div></div></AdminLayout>;
}

function AdminProducts(){ const {store,refresh}=useStore(); const remove=async id=>{if(!confirm('Delete this product?'))return; const {error}=await supabase.from('products').delete().eq('id',id); if(error) alert(error.message); else refresh();}; return <AdminLayout><div className="admin-head"><div><p className="eyebrow">CATALOG</p><h1>Products</h1><p>{store.products.length} product(s) in your Supabase catalog.</p></div><Link className="gold-btn" to="/admin/products/new"><Plus size={17}/> Add Product</Link></div>{store.products.length?<div className="admin-table"><div className="table-head"><span>Product</span><span>Category</span><span>Price</span><span>Stock</span><span>Actions</span></div>{store.products.map(p=><div className="table-row" key={p.id}><div className="table-product"><img src={p.image||logo} alt=""/><strong>{p.name}</strong><small>{p.sku||"No SKU"}</small></div><span>{store.categories.find(c=>c.id===p.categoryId)?.name||"—"}</span><span>Rs. {Number(p.salePrice||p.price||0).toLocaleString()}</span><span>{p.stock||0}</span><div className="row-actions"><Link to={`/admin/products/${p.id}/edit`}><Pencil size={15}/></Link><button onClick={()=>remove(p.id)}><Trash2 size={15}/></button></div></div>)}</div>:<EmptyState title="No Products Yet" text="Aapka database catalog abhi empty hai. Apna pehla product add karein." action="Add First Product" to="/admin/products/new" icon={Package}/>}</AdminLayout>; }

function ProductImageUploader({images, setImages}){
  const [uploading,setUploading]=useState(false);
  const [error,setError]=useState('');
  const uploadFiles=async files=>{
    const selected=Array.from(files||[]);
    if(!selected.length)return;
    setError('');
    const allowed=['image/jpeg','image/png','image/webp','image/gif'];
    const invalid=selected.find(f=>!allowed.includes(f.type));
    if(invalid){setError('Sirf JPG, PNG, WEBP ya GIF images upload karein.');return;}
    const tooLarge=selected.find(f=>f.size>5*1024*1024);
    if(tooLarge){setError('Har image maximum 5MB ho sakti hai.');return;}
    setUploading(true);
    const uploaded=[];
    for(const file of selected){
      const safe=file.name.toLowerCase().replace(/[^a-z0-9.]+/g,'-');
      const path=`products/${crypto.randomUUID()}-${safe}`;
      const {error:uploadError}=await supabase.storage.from('product-images').upload(path,file,{upsert:false,contentType:file.type,cacheControl:'3600'});
      if(uploadError){setError(uploadError.message);break;}
      const {data}=supabase.storage.from('product-images').getPublicUrl(path);
      if(data?.publicUrl) uploaded.push(data.publicUrl);
    }
    if(uploaded.length)setImages(prev=>[...prev,...uploaded]);
    setUploading(false);
  };
  const removeImage=url=>setImages(prev=>prev.filter(x=>x!==url));
  return <div className="image-uploader span-2">
    <div className="upload-head"><div><strong>Product Images</strong><small>Multiple images upload karein. Pehli image main product image hogi.</small></div><label className="gold-btn upload-btn"><Upload size={16}/>{uploading?'Uploading...':'Upload Images'}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden disabled={uploading} onChange={e=>{uploadFiles(e.target.files);e.target.value='';}}/></label></div>
    {error&&<p className="upload-error">{error}</p>}
    {uploading&&<div className="upload-progress"><LoaderCircle size={17} className="spin"/> Images upload ho rahi hain...</div>}
    {images.length?<div className="image-preview-grid">{images.map((url,i)=><div className={`image-preview ${i===0?'main':''}`} key={`${url}-${i}`}><img src={url} alt={`Product ${i+1}`}/><div className="image-preview-bar"><span>{i===0?'Main Image':`Image ${i+1}`}</span><button type="button" onClick={()=>removeImage(url)}><Trash2 size={14}/></button></div></div>)}</div>:<div className="upload-empty"><ImageIcon size={24}/><span>Abhi koi product image upload nahi hui.</span></div>}
    <label className="manual-url">Or image URL<input value={images[0]||''} onChange={e=>setImages(prev=>e.target.value?[e.target.value,...prev.slice(1)]:prev.slice(1))} placeholder="https://..."/></label>
  </div>;
}

function ProductForm(){ const {id}=useParams(); const {store,refresh}=useStore(); const editing=Boolean(id); const existing=store.products.find(p=>p.id===id); const [form,setForm]=useState({name:'',sku:'',categoryId:'',brand:'',shortDescription:'',description:'',price:'',salePrice:'',stock:'',status:'active'}); const [images,setImages]=useState([]); const [busy,setBusy]=useState(false); const navigate=useNavigate(); useEffect(()=>{if(existing){let gallery=Array.isArray(existing.images)?existing.images:[];if(existing.image&&!gallery.includes(existing.image))gallery=[existing.image,...gallery];setForm({name:existing.name||'',sku:existing.sku||'',categoryId:existing.categoryId||'',brand:existing.brand||'',shortDescription:existing.shortDescription||'',description:existing.description||'',price:existing.price||'',salePrice:existing.salePrice||'',stock:existing.stock||0,status:existing.status||'active'});setImages(gallery)}},[existing]); const submit=async e=>{e.preventDefault();setBusy(true); const cleanImages=images.filter(Boolean); const slug=(form.name||'product').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')+'-'+(id||crypto.randomUUID().slice(0,8)); const payload={name:form.name,slug,sku:form.sku||null,category_id:form.categoryId||null,brand:form.brand||null,short_description:form.shortDescription||null,description:form.description||null,price:Number(form.price||0),sale_price:form.salePrice?Number(form.salePrice):null,stock_quantity:Number(form.stock||0),main_image:cleanImages[0]||null,images:cleanImages,status:form.status}; const result=editing?await supabase.from('products').update(payload).eq('id',id).select().single():await supabase.from('products').insert(payload).select().single(); if(result.error) alert(result.error.message); else {await refresh();navigate('/admin/products');} setBusy(false);}; return <AdminLayout><div className="admin-head"><div><p className="eyebrow">CATALOG</p><h1>{editing?'Edit Product':'Add Product'}</h1><p>Product data ab directly Supabase database mein save hogi.</p></div></div><form className="admin-form" onSubmit={submit}><div className="form-grid"><label>Product Name*<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>SKU<input value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})}/></label><label>Category<select value={form.categoryId} onChange={e=>setForm({...form,categoryId:e.target.value})}><option value="">Select category</option>{store.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Brand<input value={form.brand} onChange={e=>setForm({...form,brand:e.target.value})}/></label><label>Price*<input required type="number" min="0" value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></label><label>Sale Price<input type="number" min="0" value={form.salePrice} onChange={e=>setForm({...form,salePrice:e.target.value})}/></label><label>Stock<input type="number" min="0" value={form.stock} onChange={e=>setForm({...form,stock:e.target.value})}/></label><label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label><ProductImageUploader images={images} setImages={setImages}/><label className="span-2">Short Description<textarea rows="3" value={form.shortDescription} onChange={e=>setForm({...form,shortDescription:e.target.value})}/></label><label className="span-2">Full Description<textarea rows="7" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label></div><div className="form-actions"><Link className="ghost-btn" to="/admin/products">Cancel</Link><button className="gold-btn" type="submit" disabled={busy}>{busy?'Saving...':editing?'Save Changes':'Create Product'}</button></div></form></AdminLayout>; }

function AdminCategories(){ const {store,refresh}=useStore(); const [name,setName]=useState(''); const add=async e=>{e.preventDefault();if(!name.trim())return;const slug=name.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');const {error}=await supabase.from('categories').insert({name:name.trim(),slug}).select().single();if(error)alert(error.message);else{setName('');refresh();}}; const remove=async id=>{if(!confirm('Delete this category?'))return;const {error}=await supabase.from('categories').delete().eq('id',id);if(error)alert(error.message);else refresh();}; return <AdminLayout><div className="admin-head"><div><p className="eyebrow">CATALOG</p><h1>Categories</h1><p>Create and manage database categories.</p></div></div><form className="inline-form" onSubmit={add}><input value={name} onChange={e=>setName(e.target.value)} placeholder="New category name"/><button className="gold-btn"><Plus size={17}/> Add Category</button></form>{store.categories.length?<div className="simple-list">{store.categories.map(c=><div key={c.id}><div><Tag size={17}/><strong>{c.name}</strong><span>{store.products.filter(p=>p.categoryId===c.id).length} products</span></div><button onClick={()=>remove(c.id)}><Trash2 size={16}/></button></div>)}</div>:<EmptyState title="No Categories Yet" text="First category create karne ke liye upar form use karein." icon={Tag}/>}</AdminLayout>; }

function BannerImageUploader({value,setValue}){
  const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const upload=async file=>{ if(!file)return; setBusy(true);setError(''); const ext=(file.name.split('.').pop()||'jpg').toLowerCase(); const path=`banners/${crypto.randomUUID()}.${ext}`; const {error}=await supabase.storage.from('banner-images').upload(path,file,{upsert:false,contentType:file.type,cacheControl:'3600'}); if(error){setError(error.message);setBusy(false);return;} const {data}=supabase.storage.from('banner-images').getPublicUrl(path);setValue(data.publicUrl);setBusy(false); };
  return <div className="image-uploader span-2"><div className="upload-head"><div><strong>Banner Image</strong><small>Optional promotional image. JPG, PNG or WEBP, max 5MB.</small></div><label className="gold-btn upload-btn"><Upload size={16}/>{busy?'Uploading...':'Upload Image'}<input hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{upload(e.target.files?.[0]);e.target.value='';}}/></label></div>{error&&<p className="upload-error">{error}</p>}{value?<div className="banner-image-preview"><img src={value} alt="Banner preview"/><button type="button" className="remove-btn" onClick={()=>setValue('')}><Trash2 size={15}/></button></div>:<div className="upload-empty"><ImageIcon size={24}/><span>No banner image selected.</span></div>}</div>;
}

function AdminBanners(){ const {store,refresh}=useStore(); const blank={title:'',subtitle:'',buttonText:'Shop Now',buttonLink:'/deals',startDate:'',endDate:'',status:'active',imageUrl:''}; const [form,setForm]=useState(blank); const [editing,setEditing]=useState(null);
  const save=async e=>{e.preventDefault();if(!form.title.trim())return;const payload={title:form.title.trim(),subtitle:form.subtitle||null,button_text:form.buttonText||null,button_link:form.buttonLink||'/deals',start_date:form.startDate||null,end_date:form.endDate||null,status:form.status,image_url:form.imageUrl||null};const result=editing?await supabase.from('banners').update(payload).eq('id',editing).select().single():await supabase.from('banners').insert(payload).select().single();if(result.error)alert(result.error.message);else{setForm(blank);setEditing(null);refresh();}};
  const beginEdit=b=>{setEditing(b.id);editForm(b)};
  const editForm=b=>setForm({title:b.title||'',subtitle:b.subtitle||'',buttonText:b.buttonText||'Shop Now',buttonLink:b.buttonLink||'/deals',startDate:b.startDate?new Date(b.startDate).toISOString().slice(0,16):'',endDate:b.endDate?new Date(b.endDate).toISOString().slice(0,16):'',status:b.status||'active',imageUrl:b.imageUrl||''});
  const remove=async id=>{if(!confirm('Delete this banner?'))return;const {error}=await supabase.from('banners').delete().eq('id',id);if(error)alert(error.message);else refresh();};
  return <AdminLayout><div className="admin-head"><div><p className="eyebrow">PROMOTIONS</p><h1>Sale Banners</h1><p>Homepage promotional banner — dates ke bahar automatically hide ho jata hai.</p></div></div><form className="admin-form" onSubmit={save}><div className="form-grid"><label>Title*<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Mega Sale"/></label><label>Subtitle<input value={form.subtitle} onChange={e=>setForm({...form,subtitle:e.target.value})} placeholder="Up to 30% off"/></label><label>Button Text<input value={form.buttonText} onChange={e=>setForm({...form,buttonText:e.target.value})}/></label><label>Button Link<input value={form.buttonLink} onChange={e=>setForm({...form,buttonLink:e.target.value})}/></label><label>Start Date<input type="datetime-local" value={form.startDate} onChange={e=>setForm({...form,startDate:e.target.value})}/></label><label>End Date<input type="datetime-local" value={form.endDate} onChange={e=>setForm({...form,endDate:e.target.value})}/></label><label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="active">Active</option><option value="inactive">Inactive</option></select></label><BannerImageUploader value={form.imageUrl} setValue={v=>setForm({...form,imageUrl:v})}/></div><div className="form-actions"><button type="button" className="ghost-btn" onClick={()=>{setForm(blank);setEditing(null)}}>{editing?'Cancel Edit':'Reset'}</button><button className="gold-btn">{editing?<Pencil size={16}/>:<Plus size={17}/>} {editing?'Save Banner':'Create Sale Banner'}</button></div></form>{store.banners.length?<div className="simple-list">{store.banners.map(b=><div key={b.id}><div>{b.imageUrl?<img className="list-thumb" src={b.imageUrl} alt=""/>:<Sparkles size={17}/>}<strong>{b.title}</strong><span>{b.status}{b.endDate?` · ends ${new Date(b.endDate).toLocaleString()}`:''}</span></div><div className="row-actions"><button onClick={()=>beginEdit(b)}><Pencil size={15}/></button><button onClick={()=>remove(b.id)}><Trash2 size={16}/></button></div></div>)}</div>:<EmptyState title="No Sale Banners" text="Abhi koi promotional banner nahi hai." icon={Sparkles}/>}</AdminLayout>;
}

function AdminCoupons(){
  const blank={code:'',discountType:'percent',discountValue:'',minOrderAmount:'0',maxDiscount:'',usageLimit:'',startsAt:'',expiresAt:'',status:'active'};
  const [form,setForm]=useState(blank); const [rows,setRows]=useState([]); const [editing,setEditing]=useState(null); const [loading,setLoading]=useState(true);
  const load=async()=>{setLoading(true);const {data,error}=await supabase.from('coupons').select('*').order('created_at',{ascending:false});if(error)alert(error.message);else setRows(data||[]);setLoading(false);};
  useEffect(()=>{load()},[]);
  const save=async e=>{e.preventDefault();const payload={code:form.code.trim().toLowerCase(),discount_type:form.discountType,discount_value:Number(form.discountValue||0),min_order_amount:Number(form.minOrderAmount||0),max_discount:form.maxDiscount?Number(form.maxDiscount):null,usage_limit:form.usageLimit?Number(form.usageLimit):null,starts_at:form.startsAt||null,expires_at:form.expiresAt||null,status:form.status,updated_at:new Date().toISOString()};const result=editing?await supabase.from('coupons').update(payload).eq('id',editing):await supabase.from('coupons').insert(payload);if(result.error)alert(result.error.message);else{setForm(blank);setEditing(null);load();}};
  const beginEdit=c=>{setEditing(c.id);setForm({code:c.code||'',discountType:c.discount_type||'percent',discountValue:c.discount_value||'',minOrderAmount:c.min_order_amount||0,maxDiscount:c.max_discount||'',usageLimit:c.usage_limit||'',startsAt:c.starts_at?new Date(c.starts_at).toISOString().slice(0,16):'',expiresAt:c.expires_at?new Date(c.expires_at).toISOString().slice(0,16):'',status:c.status||'active'});window.scrollTo({top:0,behavior:'smooth'});};
  const remove=async id=>{if(!confirm('Delete this coupon?'))return;const {error}=await supabase.from('coupons').delete().eq('id',id);if(error)alert(error.message);else load();};
  return <AdminLayout><div className="admin-head"><div><p className="eyebrow">PROMOTIONS</p><h1>Coupons</h1><p>Create percentage or fixed-amount discounts with limits and dates.</p></div></div><form className="admin-form" onSubmit={save}><div className="form-grid"><label>Coupon Code*<input required value={form.code} onChange={e=>setForm({...form,code:e.target.value.toUpperCase()})} placeholder="SAVE10"/></label><label>Discount Type<select value={form.discountType} onChange={e=>setForm({...form,discountType:e.target.value})}><option value="percent">Percentage (%)</option><option value="fixed">Fixed (Rs.)</option></select></label><label>Discount Value*<input required type="number" min="0" step="0.01" value={form.discountValue} onChange={e=>setForm({...form,discountValue:e.target.value})}/></label><label>Minimum Order (Rs.)<input type="number" min="0" value={form.minOrderAmount} onChange={e=>setForm({...form,minOrderAmount:e.target.value})}/></label><label>Max Discount (Rs.)<input type="number" min="0" value={form.maxDiscount} onChange={e=>setForm({...form,maxDiscount:e.target.value})} placeholder="Optional"/></label><label>Usage Limit<input type="number" min="1" value={form.usageLimit} onChange={e=>setForm({...form,usageLimit:e.target.value})} placeholder="Unlimited if blank"/></label><label>Starts At<input type="datetime-local" value={form.startsAt} onChange={e=>setForm({...form,startsAt:e.target.value})}/></label><label>Expires At<input type="datetime-local" value={form.expiresAt} onChange={e=>setForm({...form,expiresAt:e.target.value})}/></label><label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="active">Active</option><option value="inactive">Inactive</option></select></label></div><div className="form-actions"><button type="button" className="ghost-btn" onClick={()=>{setForm(blank);setEditing(null)}}>Reset</button><button className="gold-btn">{editing?<Pencil size={16}/>:<Plus size={17}/>} {editing?'Save Coupon':'Create Coupon'}</button></div></form>{loading?<EmptyState title="Loading coupons..." text="Supabase se coupons fetch ho rahe hain." icon={TicketPercent}/>:rows.length?<div className="coupon-list">{rows.map(c=><div className="coupon-card" key={c.id}><div className="coupon-code"><TicketPercent size={18}/><strong>{c.code.toUpperCase()}</strong><span>{c.discount_type==='percent'?`${c.discount_value}% off`:`Rs. ${Number(c.discount_value).toLocaleString()} off`}</span></div><div className="coupon-meta"><span>Min: Rs. {Number(c.min_order_amount||0).toLocaleString()}</span><span>Used: {c.used_count}{c.usage_limit?` / ${c.usage_limit}`:''}</span><span className={`status status-${c.status}`}>{c.status}</span></div><div className="row-actions"><button onClick={()=>beginEdit(c)}><Pencil size={15}/></button><button onClick={()=>remove(c.id)}><Trash2 size={15}/></button></div></div>)}</div>:<EmptyState title="No Coupons Yet" text="Pehla coupon create karein; checkout par customer code apply kar sakega." icon={TicketPercent}/>}</AdminLayout>;
}

function AdminOrders(){
  const [orders,setOrders]=useState([]); const [items,setItems]=useState([]); const [loading,setLoading]=useState(true); const [selected,setSelected]=useState(null); const [filter,setFilter]=useState('all'); const [saving,setSaving]=useState(null);
  const load=async()=>{setLoading(true); const [o,i]=await Promise.all([supabase.from('orders').select('*').order('created_at',{ascending:false}),supabase.from('order_items').select('*')]); if(o.error) alert(o.error.message); else setOrders(o.data||[]); if(i.error) alert(i.error.message); else setItems(i.data||[]); setLoading(false);};
  useEffect(()=>{load()},[]);
  const updateStatus=async(id,status)=>{setSaving(id); const {error}=await supabase.from('orders').update({status}).eq('id',id); if(error) alert(error.message); else setOrders(rows=>rows.map(o=>o.id===id?{...o,status}:o)); setSaving(null);};
  const visible=filter==='all'?orders:orders.filter(o=>o.status===filter);
  return <AdminLayout><div className="admin-head"><div><p className="eyebrow">ORDERS</p><h1>Orders</h1><p>{orders.length} real order(s) from Supabase.</p></div><button className="ghost-btn" onClick={load}>Refresh</button></div><div className="order-filters">{['all','pending','confirmed','packed','shipped','out_for_delivery','delivered','cancelled'].map(s=><button className={filter===s?'active':''} key={s} onClick={()=>setFilter(s)}>{s==='all'?'All':s.replaceAll('_',' ')}</button>)}</div>{loading?<EmptyState title="Loading orders..." text="Supabase se orders fetch ho rahe hain."/>:visible.length?<div className="order-list">{visible.map(o=>{const oi=items.filter(x=>x.order_id===o.id);return <motion.div className="order-card" key={o.id} layout><div className="order-card-head"><div><span className="order-number">{o.order_number||o.id.slice(0,8)}</span><strong>{o.customer_name||'Customer'}</strong><small>{new Date(o.created_at).toLocaleString()} · {o.phone||'No phone'}</small></div><div className="order-total"><strong>Rs. {Number(o.total||0).toLocaleString()}</strong><select disabled={saving===o.id} value={o.status||'pending'} onChange={e=>updateStatus(o.id,e.target.value)}>{['pending','confirmed','packed','shipped','out_for_delivery','delivered','cancelled'].map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select></div></div><button className="order-detail-toggle" onClick={()=>setSelected(selected===o.id?null:o.id)}>{selected===o.id?'Hide details':'View order details'} <ChevronRight size={15} className={selected===o.id?'rotate':''}/></button>{selected===o.id&&<div className="order-details"><div className="order-customer"><div><span>Phone</span><strong>{o.phone||'—'}</strong></div><div><span>Email</span><strong>{o.email||'—'}</strong></div><div><span>Address</span><strong>{o.address||'—'}, {o.city||''}</strong></div></div><div className="order-items">{oi.length?oi.map(x=><div key={x.id}><span>{x.product_name||'Product'} × {x.quantity}</span><strong>Rs. {(Number(x.unit_price||0)*Number(x.quantity||0)).toLocaleString()}</strong></div>):<div><span>Items snapshot</span><strong>See order record</strong></div>}</div><div className="order-breakdown"><span>Subtotal</span><strong>Rs. {Number(o.subtotal||0).toLocaleString()}</strong><span>Discount</span><strong>Rs. {Number(o.discount||0).toLocaleString()}</strong><span>Delivery</span><strong>Rs. {Number(o.delivery_fee||0).toLocaleString()}</strong><span className="grand">Total</span><strong className="grand">Rs. {Number(o.total||0).toLocaleString()}</strong></div></div>}</motion.div>})}</div>:<EmptyState title="No Orders Yet" text="Abhi koi real customer order nahi hai. Checkout complete hone ke baad order yahan show hoga." action="View Store" to="/" icon={ShoppingCart}/>}</AdminLayout>;
}

function AdminCustomers(){
  const [customers,setCustomers]=useState([]); const [loading,setLoading]=useState(true);
  useEffect(()=>{(async()=>{const {data,error}=await supabase.from('profiles').select('*').eq('role','customer').order('created_at',{ascending:false}); if(error) alert(error.message); else setCustomers(data||[]); setLoading(false);})()},[]);
  return <AdminLayout><div className="admin-head"><div><p className="eyebrow">CUSTOMERS</p><h1>Customers</h1><p>Registered customer profiles from Supabase.</p></div></div>{loading?<EmptyState title="Loading customers..." text="Customer profiles fetch ho rahe hain."/>:customers.length?<div className="simple-list">{customers.map(c=><div key={c.id}><div><User size={17}/><strong>{c.full_name||c.name||'Customer'}</strong><span>{c.email||'Email unavailable'}{c.phone?` · ${c.phone}`:''}</span></div><span>{c.created_at?new Date(c.created_at).toLocaleDateString():''}</span></div>)}</div>:<EmptyState title="No Customers Yet" text="Customer account create hone ke baad profiles yahan show hongi." icon={Users}/>}</AdminLayout>;
}
function AdminReviews(){
  const [rows,setRows]=useState([]); const [loading,setLoading]=useState(true); const [filter,setFilter]=useState('pending');
  const load=async()=>{setLoading(true);const {data,error}=await supabase.from('reviews').select('*').order('created_at',{ascending:false});if(error)alert(error.message);else setRows(data||[]);setLoading(false)};
  useEffect(()=>{load()},[]);
  const moderate=async(id,status)=>{const {error}=await supabase.from('reviews').update({status,updated_at:new Date().toISOString()}).eq('id',id);if(error)alert(error.message);else setRows(r=>r.map(x=>x.id===id?{...x,status}:x))};
  const visible=filter==='all'?rows:rows.filter(r=>r.status===filter);
  return <AdminLayout><div className="admin-head"><div><p className="eyebrow">CUSTOMER VOICE</p><h1>Reviews</h1><p>Customer reviews ko approve, reject aur manage karein.</p></div><button className="ghost-btn" onClick={load}>Refresh</button></div><div className="order-filters">{['pending','approved','rejected','all'].map(s=><button className={filter===s?'active':''} key={s} onClick={()=>setFilter(s)}>{s}</button>)}</div>{loading?<EmptyState title="Loading reviews..." text="Reviews fetch ho rahi hain." icon={Star}/>:visible.length?<div className="admin-review-list">{visible.map(r=><article className="admin-review-card" key={r.id}><div className="review-card-head"><div><strong>{r.reviewer_name||'Customer'}</strong><span>{new Date(r.created_at).toLocaleString()}</span></div><StarRating value={r.rating}/></div><small>Product ID: {r.product_id}</small>{r.title&&<h3>{r.title}</h3>}{r.comment&&<p>{r.comment}</p>}<div className="row-actions"><span className={`status status-${r.status}`}>{r.status}</span>{r.status!=='approved'&&<button onClick={()=>moderate(r.id,'approved')}><Check size={15}/> Approve</button>}{r.status!=='rejected'&&<button onClick={()=>moderate(r.id,'rejected')}><X size={15}/> Reject</button>}</div></article>)}</div>:<EmptyState title={`No ${filter} reviews`} text="Is moderation queue mein abhi koi review nahi hai." icon={Star}/>}</AdminLayout>;
}

function AdminPlaceholder({title,icon:Icon=Settings}){return <AdminLayout><div className="admin-head"><div><p className="eyebrow">ADMIN</p><h1>{title}</h1><p>Is module ka workflow abhi next phase mein expand hoga.</p></div></div><EmptyState title={`${title} is empty`} text="No dummy records have been added." icon={Icon}/></AdminLayout>}

export default function App(){ return <AuthProvider><StoreProvider><div className="app"><Navbar/><Routes><Route path="/" element={<Home/>}/><Route path="/shop" element={<Shop/>}/><Route path="/product/:id" element={<ProductDetails/>}/><Route path="/categories" element={<Categories/>}/><Route path="/deals" element={<Deals/>}/><Route path="/wishlist" element={<Wishlist/>}/><Route path="/cart" element={<Cart/>}/><Route path="/checkout" element={<Checkout/>}/><Route path="/account" element={<Account/>}/><Route path="/login" element={<Login/>}/><Route path="/admin" element={<Admin/>}/><Route path="/admin/products" element={<AdminProducts/>}/><Route path="/admin/products/new" element={<ProductForm/>}/><Route path="/admin/products/:id/edit" element={<ProductForm/>}/><Route path="/admin/categories" element={<AdminCategories/>}/><Route path="/admin/banners" element={<AdminBanners/>}/><Route path="/admin/coupons" element={<AdminCoupons/>}/><Route path="/admin/orders" element={<AdminOrders/>}/><Route path="/admin/customers" element={<AdminCustomers/>}/><Route path="/admin/reviews" element={<AdminReviews/>}/><Route path="/admin/settings" element={<AdminPlaceholder title="Settings"/>}/><Route path="*" element={<main className="page container"><EmptyState title="Page Not Found" text="Yeh page exist nahi karta." action="Back Home" to="/"/></main>}/></Routes><WhatsAppButton/><footer className="footer"><div className="container footer-inner"><img src={logo} alt="Hafiz Mart"/><span>© {new Date().getFullYear()} Hafiz Mart. All rights reserved.</span></div></footer></div></StoreProvider></AuthProvider>; }
