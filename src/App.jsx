import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { ShoppingBag, Search, Heart, User, Menu, X, MessageCircle, ArrowRight, Sparkles, Plus, Trash2, Pencil, Tag, Package, Users, ShoppingCart, Settings, LayoutDashboard, ChevronRight, TicketPercent, Minus, Check, Star, Upload, Image as ImageIcon, LoaderCircle, SlidersHorizontal, RotateCcw, MessageSquare, ShieldCheck, LogOut, Eye, EyeOff, Bell, BarChart3, Download, Send, UserCheck, UserX, DollarSign, FileText, Store, Truck, Megaphone, CreditCard, Boxes, Save } from "lucide-react";
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

const DEFAULT_ADMIN_SETTINGS = {
  general: { storeName: 'Hafiz Mart', tagline: 'Everything You Need, Delivered', supportEmail: '', supportPhone: '', whatsapp: '', address: '', currency: 'PKR', timezone: 'Asia/Karachi', facebook: '', instagram: '', tiktok: '' },
  shipping: { enabled: true, defaultRate: 300, freeDeliveryThreshold: 10000, minDays: 2, maxDays: 5, cityRates: [{ city: 'Multan', rate: 270 }] },
  storefront: { announcementEnabled: true, announcementText: 'Shop your favourites at Hafiz Mart', announcementLink: '/deals', announcementButton: 'Shop Deals', announcementTheme: 'gold', maintenanceMode: false, maintenanceMessage: 'We are improving your shopping experience. Please check back soon.' },
  payments: { codEnabled: true, onlinePaymentsEnabled: false },
  policies: { cancellationWindowHours: 2, returnWindowDays: 7, returnsPolicy: '', shippingPolicy: '', privacyPolicy: '', terms: '' },
  notifications: { inAppEnabled: true, emailEnabled: false, whatsappEnabled: false, notifyOnNewOrder: true, notifyOnNewCustomer: true, notifyOnComplaint: true, notifyOnReview: true, notifyOnOrderStatus: true, notifyOnComplaintResponse: true, notifyOnTransactionFailure: true, notifyOnRefund: true, notifyOnLowStock: true },
  inventory: { lowStockThreshold: 5, hideOutOfStock: true, allowBackorders: false, reviewsRequireApproval: false, maxReviewImages: 5 },
  content: { showCategoriesOnHome: true, showDealsSection: true, featuredProductsLimit: 8 },
  users: { requireManualVerification: false, allowGuestCheckout: false, defaultAccountStatus: 'active' },
  reports: { defaultRange: '30', includeCustomerPhone: false }
};

function mergeAdminSettings(base, incoming) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return base;
  const out = { ...base };
  Object.keys(incoming).forEach(key => {
    const v = incoming[key];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) out[key] = mergeAdminSettings(base[key], v);
    else if (v !== undefined && v !== null) out[key] = v;
  });
  return out;
}

function userHasPermission(profile, permission) {
  if (!profile || profile.role !== 'admin') return false;
  const teamRole = profile.team_role || 'owner';
  if (teamRole === 'owner') return true;
  return Boolean(profile.permissions && profile.permissions[permission]);
}

function NotificationBell({ admin = false }) {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!user) { setCount(0); return undefined; }
    let active = true;
    const load = async () => {
      const { count: unread, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('recipient_user_id', user.id).eq('is_read', false);
      if (active && !error) setCount(unread || 0);
    };
    load();
    const channel = supabase.channel(`notifications-${user.id}-${admin ? 'admin' : 'customer'}`).on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_user_id=eq.${user.id}` }, load).subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [user, admin]);
  if (!user) return null;
  const to = admin ? '/admin/notifications' : '/notifications';
  return <Link className="notification-bell" to={to} aria-label="Notifications"><Bell size={18}/>{count > 0 && <span>{count > 99 ? '99+' : count}</span>}</Link>;
}


function readCart() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{"cart":[],"wishlist":[]}'); } catch { return { cart: [], wishlist: [] }; }
}

function mapProduct(p) {
  return { ...p, salePrice: p.sale_price ?? '', image: p.main_image || '', images: Array.isArray(p.images) ? p.images : [], stock: p.stock_quantity ?? 0, categoryId: p.category_id, shortDescription: p.short_description || '', description: p.description || '', createdAt: p.created_at };
}
function mapCategory(c) { return { ...c, image: c.image_url || '', createdAt: c.created_at }; }
function mapBanner(b) { return { ...b, buttonText: b.button_text || '', buttonLink: b.button_link || '/deals', startDate: b.start_date || '', endDate: b.end_date || '', imageUrl: b.image_url || '', createdAt: b.created_at }; }

function getCategoryDescendantIds(categories, categoryId) {
  const result = new Set([String(categoryId)]);
  let frontier = [String(categoryId)];
  while (frontier.length) {
    const next = [];
    for (const parentId of frontier) {
      categories.forEach(category => {
        if (category.parent_category_id && String(category.parent_category_id) === parentId && !result.has(String(category.id))) {
          result.add(String(category.id));
          next.push(String(category.id));
        }
      });
    }
    frontier = next;
  }
  return [...result];
}

function getCategoryProductCount(categories, products, categoryId) {
  const ids = new Set(getCategoryDescendantIds(categories, categoryId));
  return products.filter(product => product.status !== 'inactive' && ids.has(String(product.categoryId))).length;
}

function categoryOrder(name = '') {
  const n = String(name).trim().toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ');
  const preferred = [
    ['women', 'womens'], ['men', 'mens'], ['fragrances'], ['other'],
    ['cosmetics'], ['jewelry', 'jewellery'], ['islamic accessories'], ['bags'], ['home decoration']
  ];
  const index = preferred.findIndex(aliases => aliases.includes(n));
  return index < 0 ? 100 : index;
}

function sortMainCategories(categories = []) {
  return [...categories].filter(category => !category.parent_category_id).sort((a, b) => {
    const orderDiff = categoryOrder(a.name) - categoryOrder(b.name);
    if (orderDiff) return orderDiff;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

function getCategoryArtworkInfo(name = '') {
  const value = String(name).toLowerCase();
  if (/cosmetic|beauty|makeup|skin care|skincare|lipstick/.test(value)) return { theme: 'cosmetics', Icon: Sparkles };
  if (/jewel|jewell|ring|necklace|bracelet|earring|watch/.test(value)) return { theme: 'jewelry', Icon: Heart };
  if (/islam|prayer|quran|tasbih|hijab|faith/.test(value)) return { theme: 'islamic', Icon: Star };
  if (/bag|purse|wallet|backpack/.test(value)) return { theme: 'bags', Icon: ShoppingBag };
  if (/home|decor|kitchen|living|furniture/.test(value)) return { theme: 'home', Icon: Store };
  if (/fragrance|perfume|scent|attar/.test(value)) return { theme: 'fragrance', Icon: Sparkles };
  if (/women|female|ladies|girl/.test(value)) return { theme: 'women', Icon: Heart };
  if (/men|male|gents|boy|wear|clothing|fashion/.test(value)) return { theme: 'men', Icon: Package };
  if (/mobile|tech|car|electronic|accessories/.test(value)) return { theme: 'tech', Icon: Boxes };
  if (/other|misc|general/.test(value)) return { theme: 'other', Icon: Tag };
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  const palettes = ['custom-rose', 'custom-sage', 'custom-blue', 'custom-sand', 'custom-lilac'];
  return { theme: palettes[hash % palettes.length], Icon: Tag };
}

function CategoryArtwork({ category, image = '', compact = false }) {
  const { theme, Icon } = getCategoryArtworkInfo(category?.name || '');
  const safeImage = String(image || '').trim();
  const artworkStyle = safeImage
    ? { backgroundImage: `linear-gradient(135deg, rgba(17,17,17,.04), rgba(17,17,17,.28)), url(${JSON.stringify(safeImage)})` }
    : undefined;
  const initial = String(category?.name || 'H').trim().charAt(0).toUpperCase() || 'H';
  return (
    <div
      className={`category-artwork category-artwork-${theme}${safeImage ? ' has-image' : ''}${compact ? ' compact' : ''}`}
      style={artworkStyle}
      aria-hidden="true"
    >
      <span className="category-artwork-orbit" />
      <span className="category-artwork-initial">{initial}</span>
      <Icon className="category-artwork-icon" size={compact ? 25 : 58} strokeWidth={1.15} />
    </div>
  );
}

const StoreContext = createContext(null);
function StoreProvider({ children }) {
  const [store, setStore] = useState({ ...emptyStore, ...readCart(), adminSettings: DEFAULT_ADMIN_SETTINGS });
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const refresh = async () => {
    setLoading(true);
    const [productsRes, categoriesRes, bannersRes, settingsRes] = await Promise.all([
      supabase.from('products').select('*').order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('created_at', { ascending: false }),
      supabase.from('banners').select('*').eq('status', 'active').order('created_at', { ascending: false }),
      supabase.from('admin_store_settings').select('settings').eq('id', 'default').maybeSingle()
    ]);
    if (!productsRes.error && !categoriesRes.error && !bannersRes.error) {
      const mappedCategories = (categoriesRes.data || []).map(mapCategory); const catMap = new Map(mappedCategories.map(c => [c.id, c.name])); const mappedProducts = (productsRes.data || []).map(p => ({ ...mapProduct(p), category: catMap.get(p.category_id) || '' })); const adminSettings = settingsRes.error ? DEFAULT_ADMIN_SETTINGS : mergeAdminSettings(DEFAULT_ADMIN_SETTINGS, settingsRes.data?.settings || {}); setStore(s => ({ ...s, products: mappedProducts, categories: mappedCategories, banners: (bannersRes.data || []).map(mapBanner), adminSettings })); if (settingsRes.error) console.error('Admin settings load error', settingsRes.error);
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

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}

// Lightweight scroll-reveal effects: no extra animation library required.
function ScrollReveal() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    const selector = [
      ".home-section",
      ".home-promo-section",
      ".trust-section",
      ".page-head",
      ".product-card",
      ".category-card",
      ".home-category-card",
      ".cart-layout",
      ".checkout-layout",
      ".product-detail",
      ".auth-card",
      ".form-card",
      ".admin-head",
      ".panel",
      ".stat-card",
      ".admin-review-card",
      ".track-items"
    ].join(",");

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -32px 0px" });

    const attachRevealTargets = () => {
      document.querySelectorAll(selector).forEach((element) => {
        if (element.dataset.scrollRevealReady === "true") return;
        element.dataset.scrollRevealReady = "true";
        element.classList.add("scroll-reveal");
        observer.observe(element);
      });
    };

    attachRevealTargets();
    const mutationObserver = new MutationObserver(attachRevealTargets);
    const appRoot = document.querySelector(".app");
    if (appRoot) mutationObserver.observe(appRoot, { childList: true, subtree: true });

    return () => {
      mutationObserver.disconnect();
      observer.disconnect();
      document.querySelectorAll(".scroll-reveal").forEach((element) => {
        delete element.dataset.scrollRevealReady;
        element.classList.remove("scroll-reveal", "is-visible");
      });
    };
  }, [pathname, search]);

  return null;
}


const SEO_DEFAULTS = {
  siteName: "Hafiz Mart",
  defaultTitle: "Hafiz Mart — Everything You Need, Delivered",
  defaultDescription: "Shop products, deals and everyday essentials from Hafiz Mart with easy ordering, delivery and customer support.",
};

function upsertMeta(nameOrProperty, key, content) {
  if (!content) return;
  const selector = nameOrProperty === "name"
    ? `meta[name="${key}"]`
    : `meta[property="${key}"]`;
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute(nameOrProperty, key);
    document.head.appendChild(node);
  }
  node.setAttribute("content", content);
}

function upsertCanonical(href) {
  let node = document.head.querySelector('link[rel="canonical"]');
  if (!node) {
    node = document.createElement("link");
    node.setAttribute("rel", "canonical");
    document.head.appendChild(node);
  }
  node.setAttribute("href", href);
}

function SeoManager() {
  const { pathname } = useLocation();
  const { store } = useStore();

  useEffect(() => {
    const normalized = pathname.replace(/\/+$/, "") || "/";
    const productId = normalized.startsWith("/product/")
      ? decodeURIComponent(normalized.split("/")[2] || "")
      : "";
    const product = productId
      ? store.products.find(p => String(p.id) === productId)
      : null;

    const pageMeta = {
      "/": ["Hafiz Mart — Everything You Need, Delivered", "Shop Hafiz Mart products, discover deals and order everyday essentials with easy delivery and customer support."],
      "/shop": ["Shop — Hafiz Mart", "Browse Hafiz Mart products, categories and everyday essentials available for online ordering."],
      "/categories": ["Categories — Hafiz Mart", "Explore Hafiz Mart product categories and discover products by department."],
      "/deals": ["Deals & Offers — Hafiz Mart", "Explore current Hafiz Mart deals, sale products and promotional offers."],
      "/wishlist": ["Wishlist — Hafiz Mart", "View and manage your saved Hafiz Mart products."],
      "/cart": ["Cart — Hafiz Mart", "Review your Hafiz Mart cart items, quantities and order subtotal before checkout."],
      "/checkout": ["Checkout — Hafiz Mart", "Complete your Hafiz Mart order with delivery details and payment method."],
      "/account": ["My Account — Hafiz Mart", "Manage your Hafiz Mart account, profile and order history."],
      "/track-order": ["Track Order — Hafiz Mart", "Track your Hafiz Mart order status and delivery progress."],
      "/complaints": ["Complaints & Support — Hafiz Mart", "Submit and follow up on customer support complaints with Hafiz Mart."],
      "/notifications": ["Notifications — Hafiz Mart", "View your latest Hafiz Mart order, offer and support notifications."],
      "/login": ["Login — Hafiz Mart", "Log in to your Hafiz Mart customer account."],
      "/forgot-password": ["Forgot Password — Hafiz Mart", "Reset your Hafiz Mart account password securely."],
      "/reset-password": ["Reset Password — Hafiz Mart", "Set a new password for your Hafiz Mart account."],
      "/faq": ["FAQ — Hafiz Mart", "Find answers to common Hafiz Mart questions about orders, delivery, payments, returns and support."],
      "/privacy-policy": ["Privacy Policy — Hafiz Mart", "Read the Hafiz Mart privacy policy and learn how customer information is handled."],
      "/thank-you": ["Thank You — Hafiz Mart", "Thank you for contacting Hafiz Mart. Your request has been received."],
    };

    let title = SEO_DEFAULTS.defaultTitle;
    let description = SEO_DEFAULTS.defaultDescription;

    if (product) {
      title = `${product.name} — Hafiz Mart`;
      description = String(
        product.shortDescription ||
        product.description ||
        `Shop ${product.name} at Hafiz Mart.`
      ).replace(/\s+/g, " ").slice(0, 155);
    } else if (normalized.startsWith("/admin")) {
      title = "Admin — Hafiz Mart";
      description = "Hafiz Mart admin dashboard and store management.";
    } else if (pageMeta[normalized]) {
      [title, description] = pageMeta[normalized];
    }

    const canonical = new URL(
      import.meta.env.BASE_URL || "/",
      window.location.origin
    );
    canonical.pathname =
      `${canonical.pathname.replace(/\/+$/, "")}${normalized === "/" ? "/" : normalized}`;
    const canonicalHref = canonical.toString().replace(/([^:]\/)\/+/g, "$1");

    const shareImage = new URL(
      import.meta.env.BASE_URL || "/",
      window.location.origin
    );
    shareImage.pathname =
      `${shareImage.pathname.replace(/\/+$/, "")}/logo/hafiz-mart-logo.png`;
    const shareImageHref = shareImage.toString().replace(/([^:]\/)\/+/g, "$1");

    document.title = title;
    upsertMeta("name", "description", description);
    upsertMeta(
      "name",
      "robots",
      normalized.startsWith("/admin") ||
      ["/checkout", "/account", "/login", "/forgot-password", "/reset-password"].includes(normalized)
        ? "noindex,nofollow"
        : "index,follow"
    );
    upsertMeta("name", "theme-color", "#080808");
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:site_name", SEO_DEFAULTS.siteName);
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:url", canonicalHref);
    upsertMeta("property", "og:image", shareImageHref);
    upsertMeta("property", "og:image:alt", `${title} — Hafiz Mart`);
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", shareImageHref);
    upsertCanonical(canonicalHref);
  }, [pathname, store.products]);

  return null;
}

function GoogleAnalytics() {
  const measurementId = String(import.meta.env.VITE_GA_MEASUREMENT_ID || "").trim();

  useEffect(() => {
    if (!measurementId || typeof window === "undefined") return undefined;

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function() {
      window.dataLayer.push(arguments);
    };

    if (!document.getElementById("hafiz-mart-ga-script")) {
      const script = document.createElement("script");
      script.id = "hafiz-mart-ga-script";
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
      document.head.appendChild(script);
    }

    window.gtag("js", new Date());
    window.gtag("config", measurementId, { anonymize_ip: true });
    return undefined;
  }, [measurementId]);

  return null;
}

function HomeTestimonials() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("id,reviewer_name,rating,title,comment,created_at")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(3);

      if (!active) return;

      if (error) {
        console.error("Home testimonials load error:", error);
        setRows([]);
      } else {
        setRows(data || []);
      }

      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  if (loading || !rows.length) return null;

  return (
    <section className="home-section home-testimonials">
      <div className="container">
        <div className="home-section-heading home-testimonials-heading">
          <div className="home-testimonials-heading-copy">
            <p className="eyebrow">CUSTOMER VOICE</p>
            <h2>What Our Customers Say</h2>
          </div>
          <Link className="text-link home-testimonials-cta" to="/shop">
            Shop now <ArrowRight aria-hidden="true" size={14}/>
          </Link>
        </div>

        <div className={`home-testimonial-grid${rows.length === 1 ? " single" : ""}`}>
          {rows.map(review => {
            const rating = Math.max(0, Math.min(5, Math.round(Number(review.rating || 0))));
            return (
              <article className="home-testimonial-card" key={review.id}>
                <div className="testimonial-stars" role="img" aria-label={`${rating} out of 5 stars`}>
                  {"★".repeat(rating)}
                  {"☆".repeat(5 - rating)}
                </div>
                {review.title && <h3>{review.title}</h3>}
                {review.comment && <p>“{review.comment}”</p>}
                <div className="home-testimonial-meta">
                  <strong>{review.reviewer_name || "Customer"}</strong>
                  <small>Verified customer review</small>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const FAQ_ITEMS = [
  ["How can I place an order?", "Add your products to the cart, open Checkout, enter the delivery details and select an available payment method. COD is available when enabled by Hafiz Mart."],
  ["How much is delivery?", "Delivery charges depend on the store's shipping settings and city. The checkout page shows the final delivery fee before you place the order."],
  ["Can I track my order?", "Yes. Use the Track Order page to check your order number and current delivery status."],
  ["Can I submit a complaint?", "Yes. Logged-in customers can open Complaints & Support, select the relevant order and send the issue with optional evidence images."],
  ["How do product reviews work?", "Customers can submit product ratings and reviews after logging in. Reviews may be published immediately or moderated first according to the store's review settings."],
  ["Can I request a return or exchange?", "Use Complaints & Support to contact Hafiz Mart about a return or exchange request. The applicable policy is shown by the store."],
  ["Do you accept online card payments?", "Online payments depend on the active payment gateway and store configuration. Cash on Delivery can be used when enabled."],
  ["How do I contact Hafiz Mart?", "Use the contact details published by Hafiz Mart in the storefront or send a support complaint from your customer account."],
];

function FAQPage() {
  return (
    <main className="page">
      <div className="container faq-page">
        <div className="page-head">
          <div>
            <p className="eyebrow">HELP CENTRE</p>
            <h1>Frequently Asked Questions</h1>
            <p>Common answers about shopping, orders, delivery and support.</p>
          </div>
        </div>

        <section className="faq-list" aria-label="Frequently asked questions">
          {FAQ_ITEMS.map(([question, answer]) => (
            <details className="faq-item" key={question}>
              <summary>
                {question}
                <span>+</span>
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </section>
      </div>
    </main>
  );
}

const DEFAULT_PRIVACY_POLICY = [
  {
    id: "overview",
    number: "01",
    navLabel: "Overview",
    title: "Privacy is part of your shopping experience",
    lead: "This notice explains what information Hafiz Mart may collect, why it is needed, how it is used, and the choices available to you when you browse our store or place an order.",
    paragraphs: [
      "This policy applies to the Hafiz Mart website, customer account, shopping and checkout features, product reviews, newsletter sign-up, and customer-support workflows. It should be read together with any shipping, returns, refund and terms pages that apply to your purchase.",
      "We aim to request information that is relevant to running the store, completing your order, communicating with you, protecting the service and meeting applicable legal obligations. Please do not submit information that is not needed for your request."
    ]
  },
  {
    id: "information",
    number: "02",
    navLabel: "Information we collect",
    title: "Information you share and information created through use",
    lead: "The type of information depends on which Hafiz Mart features you use. You can browse product pages without creating a customer account, but placing an order or using certain account features requires more information.",
    items: [
      { title: "Account and profile details", text: "Details such as your name, email address, phone number, account identifier and profile information that you provide or maintain when registering, signing in or updating your profile. Authentication is provided through the store's configured Supabase service." },
      { title: "Order, billing and delivery details", text: "Items purchased, product names or SKUs, quantities, order number, order status, subtotal, discounts, delivery charges, selected payment method, recipient details, phone number and shipping or billing address that you submit at checkout." },
      { title: "Reviews and customer support", text: "Ratings, review text, images, complaint type, subject, message, optional order reference and images you choose to attach to a support request. Please check photos for addresses, identity documents or other personal details before uploading." },
      { title: "Newsletter subscription", text: "If you subscribe to the newsletter, the email address you submit is recorded so the store can manage the subscription and related updates." },
      { title: "Shopping preferences and browser storage", text: "Your cart and wishlist may be saved in your browser so they can remain available when you return. The sign-in service may also maintain an authentication session on your device." },
      { title: "Technical and service information", text: "The website, its hosting platform or service providers may process routine technical information required to deliver, secure and troubleshoot the service, such as connection, browser or device details and service logs, depending on the provider's configuration." }
    ]
  },
  {
    id: "use",
    number: "03",
    navLabel: "How we use it",
    title: "Information is used for clear business purposes",
    items: [
      { title: "Run your account and the store", text: "Create and authenticate accounts, remember your session, display saved cart or wishlist items, and maintain your profile and order history." },
      { title: "Process and deliver purchases", text: "Confirm orders, calculate totals and delivery charges, prepare receipts, coordinate delivery, track order status and handle cancellation, return, refund or other order-related requests." },
      { title: "Provide support and keep the store reliable", text: "Reply to questions and complaints, review customer-submitted content, manage service notifications, investigate suspicious activity, prevent misuse and improve store operations." },
      { title: "Send requested updates", text: "Use the details you provide to communicate about an order, account, complaint or other request. Newsletter or promotional use is associated with your newsletter subscription and any preferences you communicate to us." },
      { title: "Meet legal and operational needs", text: "Keep appropriate business records, respond to valid legal requests, enforce store terms, resolve disputes and protect customers, the store and the public where necessary." }
    ]
  },
  {
    id: "orders-delivery",
    number: "04",
    navLabel: "Orders & delivery",
    title: "What happens to order information",
    paragraphs: [
      "When you place an order, the store needs the contact and address details required to confirm the purchase and get it to the intended recipient. Relevant order information may be made available to authorised store staff and, where a delivery service is used, the courier or delivery partner responsible for fulfilling the order.",
      "If you choose an order or contact option that opens WhatsApp, the prepared message may include the details relevant to that request, such as your name, phone or email, order number, products, totals and delivery address. The message is not sent until you choose to send it. WhatsApp then processes the message under its own terms and privacy practices; review the draft before sending it.",
      "Please make sure the contact and delivery details you provide are accurate and that you have permission to provide another person's details when placing an order for them."
    ]
  },
  {
    id: "reviews-uploads",
    number: "05",
    navLabel: "Reviews & uploads",
    title: "Content you choose to publish or submit",
    paragraphs: [
      "Product reviews may appear on public product pages so other shoppers can read customer feedback. A review may display the name or display identifier associated with your submission, your rating, written feedback and any image you attach. Avoid including private contact details or sensitive information in public reviews.",
      "Images submitted with reviews or complaints are stored by the configured file-storage service. How a file can be accessed depends in part on the store's storage and access configuration. Do not upload passwords, payment-card details, identity documents or information about another person unless it is genuinely required and you are authorised to share it.",
      "If you need a review or an uploaded image corrected or removed, contact the store through the support details below. Some copies may remain in operational backups or records for a limited period where retention is necessary."
    ]
  },
  {
    id: "storage-cookies",
    number: "06",
    navLabel: "Browser storage",
    title: "Essential storage, sessions and cookies",
    paragraphs: [
      "Hafiz Mart uses browser storage for basic shopping continuity, including saving cart and wishlist information on your device. The configured authentication service may also store or maintain the session needed to keep you signed in. These functions help the site remember choices you made and provide account features.",
      "You can clear site data or change your browser settings. Clearing stored data may remove a locally saved cart or wishlist, sign you out, or affect other website functions. The current storefront code does not itself establish that third-party advertising pixels or an analytics platform are active; if optional tracking technologies are added later, this notice should be updated to describe them and any choices that apply."
    ]
  },
  {
    id: "marketing",
    number: "07",
    navLabel: "Marketing choices",
    title: "Newsletter and promotional communications",
    paragraphs: [
      "If you enter your email address in the newsletter form, it is recorded as a subscription. You can ask Hafiz Mart to stop newsletter communications or remove your subscription by contacting support. We may still send essential messages about an order, account security or a support request where they are needed to provide the service.",
      "The channel and delivery of any email or other notification depend on which communication services are actually configured by the store. We do not promise that a message will be sent through a channel that has not been enabled."
    ]
  },
  {
    id: "sharing",
    number: "08",
    navLabel: "When data is shared",
    title: "Sharing only where the store needs it",
    paragraphs: [
      "Hafiz Mart does not offer personal information for sale as a product. Information may be disclosed to the following categories of recipients only where reasonably needed for the purposes described in this policy, when you request it, or where the law permits or requires it:",
    ],
    items: [
      { title: "Store technology providers", text: "Services that host or deliver the website and provide configured account authentication, database or file storage. The current application uses Supabase for these backend functions." },
      { title: "Delivery and fulfilment providers", text: "A courier, delivery partner or other service involved in getting an order to you, where such a provider is used for your order." },
      { title: "Services you choose to use", text: "For example, WhatsApp when you open and send a prepared message from the site, subject to the information in that message and the third party's own terms." },
      { title: "Payment providers", text: "If a third-party online payment service is enabled and integrated, information needed to process the transaction may be handled by that provider under its own terms. Available payment methods are shown at checkout." },
      { title: "Legal, safety and business matters", text: "Competent authorities or professional advisers where required by law, to establish or defend legal claims, investigate fraud, protect safety or enforce store terms. A business transfer may also require a controlled transfer of relevant records, subject to appropriate protections." }
    ]
  },
  {
    id: "payments-security",
    number: "09",
    navLabel: "Payments & security",
    title: "Payment information and safeguards",
    paragraphs: [
      "The checkout records your selected payment method and the transaction details needed to manage an order. The standard storefront order form is not intended to collect a full payment-card number, card security code (CVV), PIN or one-time password. Do not send these secrets to Hafiz Mart through ordinary email, chat or WhatsApp.",
      "Where an external payment gateway is enabled, review that provider's payment and privacy terms before submitting payment information. The provider may process data independently for payment authorisation, fraud prevention and regulatory purposes.",
      "We use the technical and organisational controls available to the store and its providers to help protect information. No website, transmission method or storage system can be guaranteed to be completely secure, so keep your login details private, use a device you trust and tell us promptly if you suspect unauthorised access to your account."
    ]
  },
  {
    id: "retention",
    number: "10",
    navLabel: "Data retention",
    title: "How long information is kept",
    paragraphs: [
      "We keep personal information for as long as it is reasonably needed to provide the requested service, maintain an account and its order history, respond to support requests, manage reviews and subscriptions, meet applicable record-keeping requirements, resolve disputes or protect the store from misuse.",
      "The appropriate period depends on the type of information and why it was collected. When information is no longer needed, it may be deleted, anonymised or otherwise handled in line with the available systems and applicable requirements. Cart and wishlist information saved only in your browser can generally be removed by clearing this site's browser storage."
    ]
  },
  {
    id: "your-rights",
    number: "11",
    navLabel: "Your choices & rights",
    title: "You remain in control of your information",
    items: [
      { title: "Access and correction", text: "You can review account information available in your account and ask us to correct information that is inaccurate or incomplete." },
      { title: "Removal and account requests", text: "You may ask us to delete or restrict information where appropriate. Some information may need to be retained for a completed transaction, legal requirement, security purpose or dispute." },
      { title: "Newsletter preferences", text: "You may request to unsubscribe from newsletter or promotional communications. Service messages relating to an existing order or account may still be necessary." },
      { title: "Reviews and support content", text: "You can contact support to request a review or uploaded item be corrected or removed, subject to reasonable verification and any required record retention." },
      { title: "How to make a request", text: "Use the support channels shown on this page or the site's Support page. We may ask for sufficient information to verify that the request concerns your account before taking action." }
    ]
  },
  {
    id: "children",
    number: "12",
    navLabel: "Children's privacy",
    title: "Protecting younger users",
    paragraphs: [
      "Hafiz Mart is a general shopping service and is not intended to encourage children to submit personal information independently. If you are below the age at which you can legally make an online purchase in your location, use the store with the involvement of a parent or legal guardian.",
      "If a parent or guardian believes a child has provided personal information inappropriately, please contact us so we can review the request and take appropriate steps where possible and legally required."
    ]
  },
  {
    id: "third-party-links",
    number: "13",
    navLabel: "Third-party services",
    title: "External websites and provider policies",
    paragraphs: [
      "The store may link to, or allow you to use, services operated by other organisations, including WhatsApp, hosting and infrastructure providers, delivery services and any payment service enabled in the future. Their websites, apps and services are governed by their own terms and privacy notices.",
      "Third-party providers may process information in locations outside your city or country, depending on their systems and configuration. Their handling of information is subject to their own policies and applicable requirements. Hafiz Mart cannot control the privacy practices of a service that it does not operate, so please review the relevant provider's notice when you use it."
    ]
  },
  {
    id: "changes",
    number: "14",
    navLabel: "Policy updates",
    title: "Updates to this notice",
    paragraphs: [
      "We may update this policy when store features, service providers, business processes or applicable requirements change. The current version will be published on this page with its latest-update date. Please review this page periodically, especially when you use a new feature.",
      "A material change should be communicated through an appropriate store channel where required. Continuing to use the store does not remove any rights that cannot legally be waived."
    ]
  },
  {
    id: "contact",
    number: "15",
    navLabel: "Contact us",
    title: "Questions, requests or privacy concerns?",
    paragraphs: [
      "For a privacy question, account-data request, correction, newsletter removal or concern about a review or support upload, contact Hafiz Mart using the verified store contact details below. Please do not include passwords, card details, PINs or one-time passcodes in your message."
    ]
  }
];

function PrivacyPolicyPage() {
  const { store } = useStore();
  const configured = String(store.adminSettings?.policies?.privacyPolicy || "").trim();
  const general = store.adminSettings?.general || {};
  const contactMethods = [
    general.supportEmail && { label: "Email support", value: general.supportEmail, href: `mailto:${general.supportEmail}` },
    general.supportPhone && { label: "Call support", value: general.supportPhone, href: `tel:${String(general.supportPhone).replace(/[^+\d]/g, "")}` },
    general.whatsapp && { label: "WhatsApp support", value: general.whatsapp, href: `https://wa.me/${String(general.whatsapp).replace(/\D/g, "")}` },
    general.address && { label: "Store address", value: general.address, href: "" },
  ].filter(Boolean);
  const sections = configured
    ? [{ id: "store-policy", number: "", navLabel: "Published policy", title: "Store privacy policy" }, { id: "contact", number: "", navLabel: "Contact us", title: "Questions or privacy concerns?" }]
    : DEFAULT_PRIVACY_POLICY;

  return (
    <main className="page hm-privacy-page">
      <div className="container hm-privacy-shell">
        <header className="hm-privacy-hero">
          <div className="hm-privacy-hero-meta">
            <span className="hm-privacy-kicker"><ShieldCheck size={15} aria-hidden="true" /> PRIVACY CENTRE</span>
            <span className="hm-privacy-updated">Last updated: 9 October 2026</span>
          </div>
          <h1>Privacy Policy</h1>
          <p className="hm-privacy-hero-copy">Your trust matters. Understand what information is used when you shop with Hafiz Mart, how it helps us serve your order, and how you can make a privacy request.</p>
          <div className="hm-privacy-highlights">
            <div><span className="hm-privacy-highlight-number">01</span><div><strong>Clear purpose</strong><small>Information supports accounts, orders and customer care.</small></div></div>
            <div><span className="hm-privacy-highlight-number">02</span><div><strong>Relevant sharing</strong><small>Service partners receive details only when needed for their role.</small></div></div>
            <div><span className="hm-privacy-highlight-number">03</span><div><strong>Your choices</strong><small>You can ask us to update or review your information.</small></div></div>
          </div>
        </header>

        <div className="hm-privacy-layout">
          <aside className="hm-privacy-toc" aria-label="Privacy policy contents">
            <p className="hm-privacy-toc-title">ON THIS PAGE</p>
            <nav>
              {sections.map(section => (
                <a key={section.id} href={`#hm-privacy-${section.id}`}>
                  {section.number && <span>{section.number}</span>}
                  <span>{section.navLabel}</span>
                </a>
              ))}
            </nav>
            <div className="hm-privacy-toc-help">
              <ShieldCheck size={18} aria-hidden="true" />
              <p><strong>Need help?</strong><span>Contact us to ask a question or make a privacy request.</span></p>
              <Link to="/complaints">Contact support <ArrowRight size={13} aria-hidden="true" /></Link>
            </div>
          </aside>

          <article className="hm-privacy-document">
            {configured ? (
              <section className="hm-privacy-section" id="hm-privacy-store-policy">
                <div className="hm-privacy-section-heading"><span className="hm-privacy-section-number">PUBLISHED</span><div><h2>Store privacy policy</h2><p>Policy published by the store administrator.</p></div></div>
                <div className="hm-privacy-prose">
                  {configured.split(/\n{2,}/).map((block, index) => <p key={index}>{block}</p>)}
                </div>
              </section>
            ) : DEFAULT_PRIVACY_POLICY.map(section => (
              <section className="hm-privacy-section" id={`hm-privacy-${section.id}`} key={section.id}>
                <div className="hm-privacy-section-heading">
                  <span className="hm-privacy-section-number">{section.number}</span>
                  <div><h2>{section.title}</h2>{section.lead && <p>{section.lead}</p>}</div>
                </div>
                <div className="hm-privacy-prose">
                  {section.paragraphs?.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                  {section.items?.length > 0 && (
                    <div className="hm-privacy-detail-list">
                      {section.items.map(item => (
                        <div className="hm-privacy-detail" key={item.title}>
                          <span className="hm-privacy-detail-mark" aria-hidden="true">✓</span>
                          <div><h3>{item.title}</h3><p>{item.text}</p></div>
                        </div>
                      ))}
                    </div>
                  )}
                  {section.id === "contact" && (
                    <div className="hm-privacy-contact-grid">
                      {contactMethods.map(method => (
                        <div className="hm-privacy-contact-card" key={method.label}>
                          <span>{method.label}</span>
                          {method.href ? <a href={method.href} target={method.href.startsWith("https://") ? "_blank" : undefined} rel={method.href.startsWith("https://") ? "noreferrer" : undefined}>{method.value}</a> : <strong>{method.value}</strong>}
                        </div>
                      ))}
                      {!contactMethods.length && <div className="hm-privacy-contact-empty"><strong>Contact Hafiz Mart Support</strong><p>Open the Support page on this website to submit your request. Store contact details can be configured by the administrator.</p><Link to="/complaints">Go to Support <ArrowRight size={14} aria-hidden="true" /></Link></div>}
                    </div>
                  )}
                </div>
              </section>
            ))}
            {configured && (
              <section className="hm-privacy-section" id="hm-privacy-contact">
                <div className="hm-privacy-section-heading"><span className="hm-privacy-section-number">HELP</span><div><h2>Questions or privacy concerns?</h2><p>Use the verified contact options below to request access, correction, removal or help with your subscription.</p></div></div>
                <div className="hm-privacy-contact-grid">
                  {contactMethods.map(method => <div className="hm-privacy-contact-card" key={method.label}><span>{method.label}</span>{method.href ? <a href={method.href} target={method.href.startsWith("https://") ? "_blank" : undefined} rel={method.href.startsWith("https://") ? "noreferrer" : undefined}>{method.value}</a> : <strong>{method.value}</strong>}</div>)}
                  {!contactMethods.length && <div className="hm-privacy-contact-empty"><strong>Contact Hafiz Mart Support</strong><p>Open the Support page on this website to submit your request. Store contact details can be configured by the administrator.</p><Link to="/complaints">Go to Support <ArrowRight size={14} aria-hidden="true" /></Link></div>}
                </div>
              </section>
            )}
            <div className="hm-privacy-disclaimer"><ShieldCheck size={19} aria-hidden="true"/><p><strong>A note about this policy</strong><span>This is a store-specific privacy notice based on the current storefront features. The store owner should verify actual provider settings, retention practices, contact information and applicable local legal requirements before treating it as final legal advice.</span></p></div>
          </article>
        </div>
      </div>
    </main>
  );
}

function ThankYouPage() {
  const location = useLocation();
  const isComplaint = new URLSearchParams(location.search).get("type") === "complaint";

  return (
    <main className="page">
      <div className="container">
        <section className="form-thank-you">
          <div className="receipt-check"><Check size={24}/></div>
          <p className="eyebrow">{isComplaint ? "SUPPORT REQUEST RECEIVED" : "THANK YOU"}</p>
          <h1>{isComplaint ? "Your complaint has been submitted." : "Thank you for contacting Hafiz Mart."}</h1>
          <p>{isComplaint ? "Your support request is now in the customer support workflow. You can continue browsing or view your complaint history from your account." : "Your request has been received successfully."}</p>
          <div className="form-thank-you-actions">
            <Link className="gold-btn" to={isComplaint ? "/complaints" : "/"}>
              {isComplaint ? "View Complaint History" : "Back to Home"} <ArrowRight size={16}/>
            </Link>
            <Link className="ghost-btn" to="/shop">Continue Shopping</Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function TurnstileWidget({ onToken }) {
  const siteKey = String(import.meta.env.VITE_TURNSTILE_SITE_KEY || "").trim();
  const holderRef = useRef(null);
  const tokenRef = useRef(onToken);
  tokenRef.current = onToken;

  useEffect(() => {
    if (!siteKey || !holderRef.current) return undefined;

    const render = () => {
      if (!holderRef.current || !window.turnstile) return;
      holderRef.current.innerHTML = "";
      window.turnstile.render(holderRef.current, {
        sitekey: siteKey,
        callback: token => tokenRef.current?.(token || ""),
        "expired-callback": () => tokenRef.current?.(""),
        "error-callback": () => tokenRef.current?.(""),
      });
    };

    const existing = document.getElementById("hafiz-mart-turnstile-script");
    if (existing) {
      render();
    } else {
      const script = document.createElement("script");
      script.id = "hafiz-mart-turnstile-script";
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = render;
      document.head.appendChild(script);
    }

    return () => {
      if (holderRef.current) holderRef.current.innerHTML = "";
    };
  }, [siteKey]);

  if (!siteKey) return null;

  return (
    <div className="turnstile-wrap">
      <div ref={holderRef} />
      <small>Spam protection enabled for this form.</small>
    </div>
  );
}

function Navbar() {
  const { store, cartItems } = useStore();
  const { user, profile } = useAuth();

  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const navigate = useNavigate();

  const search = (e) => {
    e.preventDefault();

    if (query.trim()) {
      navigate(`/shop?search=${encodeURIComponent(query.trim())}`);
      setSearchOpen(false);
      setOpen(false);
    }
  };

  const closeMenu = () => setOpen(false);

  const menuGroups = sortMainCategories(store.categories).map(root => {
    const children = store.categories
      .filter(category => String(category.parent_category_id || '') === String(root.id))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    const rootPath = `/shop?category=${encodeURIComponent(root.name)}`;
    const rootCount = getCategoryProductCount(store.categories, store.products, root.id);
    return {
      id: root.id,
      title: root.name,
      path: rootPath,
      productCount: rootCount,
      items: children.map(category => {
        const productCount = getCategoryProductCount(store.categories, store.products, category.id);
        return {
          id: category.id,
          label: category.name,
          productCount,
          available: productCount > 0,
          path: `/shop?category=${encodeURIComponent(category.name)}`
        };
      })
    };
  });


  return (
    <>
      <header className="navbar">
        <div className="container nav-inner">

          {/* Logo */}
          <Link
            to="/"
            className="brand"
            onClick={closeMenu}
          >
            <img src={logo} alt="Hafiz Mart" />
          </Link>

          {/* Desktop Navigation */}
          <nav className="nav-links">

            <Link to="/" onClick={closeMenu}>
              Home
            </Link>

            <Link to="/shop" onClick={closeMenu}>
              Shop
            </Link>

            <div className="nav-dropdown">
              <button type="button">
                Categories
              </button>

              <div className="nav-dropdown-menu">
                {menuGroups.map((group) => (
                  <div className="nav-dropdown-column" key={group.id}>
                    <Link className="nav-category-heading" to={group.path} onClick={closeMenu}>
                      <strong>{group.title}</strong>
                      {group.productCount === 0 && group.items.length === 0 && <small>Coming Soon</small>}
                    </Link>
                    {group.items.length > 0 ? group.items.map(item => (
                      item.available ? (
                        <Link key={item.id} to={item.path} onClick={closeMenu}>{item.label}</Link>
                      ) : (
                        <span key={item.id} className="category-menu-coming-soon">{item.label}<small>Coming Soon</small></span>
                      )
                    )) : <span className="category-menu-hint">Explore this collection</span>}
                  </div>
                ))}
              </div>
            </div>

            <Link to="/deals" onClick={closeMenu}>
              Deals
            </Link>

          </nav>

          {/* Actions */}
          <div className="nav-actions">

            <button
              type="button"
              aria-label="Search"
              onClick={() => setSearchOpen(v => !v)}
            >
              <Search size={19} />
            </button>

            <Link
              to="/wishlist"
              aria-label="Wishlist"
              onClick={closeMenu}
            >
              <Heart size={19} />
              <span className="nav-count">
                {store.wishlist.length}
              </span>
            </Link>

            <Link
              to="/cart"
              className="cart-icon"
              aria-label="Cart"
              onClick={closeMenu}
            >
              <ShoppingBag size={20} />
              <span>
                {cartItems.reduce((n, x) => n + x.qty, 0)}
              </span>
            </Link>

            {user && <NotificationBell admin={profile?.role === "admin"} />}

            <Link
              to={user ? "/account" : "/login"}
              aria-label="Account"
              onClick={closeMenu}
            >
              <User size={19} />
            </Link>

            {/* Mobile Menu */}
            <button
              type="button"
              className="menu-btn"
              onClick={() => setOpen(v => !v)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="mobile-navigation"
            >
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>

          </div>
        </div>

        {/* Mobile Menu Panel */}
        <AnimatePresence>
          {open && (
            <motion.div
              id="mobile-navigation"
              className="mobile-menu"
              role="navigation"
              aria-label="Mobile navigation"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div className="container mobile-menu-inner">

                <Link to="/" onClick={closeMenu}>
                  Home
                </Link>

                <Link to="/shop" onClick={closeMenu}>
                  Shop All
                </Link>

                <Link
                  className="mobile-account-link"
                  to={user ? "/account" : "/login"}
                  onClick={closeMenu}
                >
                  <User size={17} />
                  {user ? "My Account" : "Login / Sign Up"}
                </Link>

                {menuGroups.map(group => (
                  <div className="mobile-menu-section" key={group.id}>
                    <Link className="mobile-main-category" to={group.path} onClick={closeMenu}>
                      {group.title}
                      {group.productCount === 0 && group.items.length === 0 && <small>Coming Soon</small>}
                    </Link>
                    {group.items.map(item => item.available ? (
                      <Link key={item.id} to={item.path} onClick={closeMenu}>{item.label}</Link>
                    ) : (
                      <span key={item.id} className="category-menu-coming-soon">{item.label}<small>Coming Soon</small></span>
                    ))}
                  </div>
                ))}

                <Link to="/deals" onClick={closeMenu}>
                  Deals
                </Link>

              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search */}
        <AnimatePresence>
          {searchOpen && (
            <motion.form
              className="search-panel"
              onSubmit={search}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <div className="container search-box">
                <Search size={18} />

                <input
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search products..."
                />

                <button type="submit">
                  Search
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

      </header>
    </>
  );
}

function SaleBanner() {
  const { store } = useStore();
  const now = new Date();
  const active = store.banners.find(b => b.status === "active" && (!b.startDate || new Date(b.startDate) <= now) && (!b.endDate || new Date(b.endDate) >= now));
  if (!active) return null;
  return <motion.section className="sale-hero" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}}><div className="container sale-hero-inner">{active.imageUrl && <img src={active.imageUrl} alt={active.title || "Hafiz Mart promotion"}/>}<div className="sale-hero-copy"><p className="eyebrow"><Sparkles size={14}/> LIMITED OFFER</p><h2>{active.title}</h2>{active.subtitle && <p>{active.subtitle}</p>}{active.buttonText && <Link className="gold-btn" to={active.buttonLink || "/deals"}>{active.buttonText}<ArrowRight size={15}/></Link>}</div></div></motion.section>;
}

function EmptyState({ title, text, action, to, icon: Icon = ShoppingBag }) {
  return <motion.div className="empty-state" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}><div className="empty-icon"><Icon size={30}/></div><h3>{title}</h3><p>{text}</p>{action && <Link className="gold-btn" to={to}>{action}<ArrowRight size={17}/></Link>}</motion.div>;
}

function ProductCard({ product, onToast }) {
  const { store, update, addToCart } = useStore();
  const wished = store.wishlist.includes(product.id);
  const price = Number(product.salePrice || product.price || 0);
  const toggleWish = () => update({ wishlist: wished ? store.wishlist.filter(id=>id!==product.id) : [...store.wishlist, product.id] });
  return <motion.article className="product-card" layout whileHover={{ y:-5, scale:1.015 }}>
    <div className="product-image-wrap"><Link to={`/product/${product.id}`}><img src={product.image || logo} alt={product.name}/></Link><button type="button" className={`wish-btn ${wished ? "active" : ""}`} onClick={toggleWish} aria-pressed={wished} aria-label={wished ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`} title={wished ? "Remove from wishlist" : "Add to wishlist"}><Heart aria-hidden="true" size={18} fill={wished ? "currentColor" : "none"}/></button>{product.salePrice && <span className="product-badge">SALE</span>}</div>
    <div className="product-info"><p className="product-category">{product.category || "Uncategorized"}</p><Link to={`/product/${product.id}`}><h3>{product.name}</h3></Link><div className="product-price"><strong>Rs. {price.toLocaleString()}</strong>{product.salePrice && <del>Rs. {Number(product.price).toLocaleString()}</del>}</div><button className="add-cart" onClick={()=>{addToCart(product); onToast?.("Product cart mein add ho gaya")}}><ShoppingBag size={15}/> Add to Cart</button></div>
  </motion.article>;
}

function Home() {
  const { store } = useStore();
  const [toast, setToast] = useState("");
  const [newsletterEmail, setNewsletterEmail] = useState("");
const [newsletterBusy, setNewsletterBusy] = useState(false);
const [newsletterMessage, setNewsletterMessage] = useState("");

  const activeProducts = store.products.filter(
    p => p.status !== "inactive"
  );
  const contentSettings = store.adminSettings?.content || DEFAULT_ADMIN_SETTINGS.content;
  const featuredLimit = Math.max(0, Number(contentSettings.featuredProductsLimit || 8));

  // Keep the homepage sections mutually exclusive while making
  // New Arrivals truly represent the newest products from Supabase.
  // Products are already ordered newest-first in StoreProvider.refresh().
  // A new product therefore appears in New Arrivals immediately after refresh.
  const newArrivalsLimit = 4;
  const newArrivals = activeProducts.slice(0, newArrivalsLimit);
  const productsAfterNewArrivals = activeProducts.slice(newArrivals.length);
  const trendingProducts = productsAfterNewArrivals.slice(0, 8);
  const featuredProducts = productsAfterNewArrivals.slice(8, 8 + featuredLimit);
  const heroProduct = activeProducts[0] || null;

const mainCategories = sortMainCategories(store.categories);
const categoryCards = mainCategories.map(category => {
  const descendants = new Set(getCategoryDescendantIds(store.categories, category.id));
  const productCount = getCategoryProductCount(store.categories, activeProducts, category.id);
  const childCategories = store.categories.filter(child => String(child.parent_category_id || '') === String(category.id));
  const firstChildImage = childCategories.find(child => child.image)?.image || '';
  const productImage = activeProducts.find(product => descendants.has(String(product.categoryId)) && product.image)?.image || '';
  return {
    ...category,
    image: category.image || firstChildImage || productImage || '',
    productCount,
    childCount: childCategories.length
  };
});

const availableCats = categoryCards;

  return (
    <>
      <SaleBanner />

      <main className="home-page">

        {/* HERO */}
        <section className="home-hero">
          <div className="container home-hero-grid">

            <motion.div
              className="home-hero-copy"
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <p className="eyebrow">WELCOME TO HAFIZ MART</p>

              <h1>
                Better shopping.
                <span> Simply better.</span>
              </h1>

              <p>
                Discover quality products, fresh arrivals and exclusive
                offers — all in one place.
              </p>

              <div className="hero-buttons">
                <Link className="gold-btn" to="/shop">
                  Shop Now
                  <ArrowRight size={17} />
                </Link>

                <Link className="ghost-btn" to="/categories">
                  Explore Categories
                </Link>
              </div>
            </motion.div>

            <motion.div
              className="home-hero-visual"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7 }}
            >
              <div className="home-hero-product-stage">
                <span className="home-hero-product-kicker">HAFIZ MART EDIT</span>
                <img
                  src={heroProduct?.image || logo}
                  alt={heroProduct?.name || "Hafiz Mart"}
                />
                {heroProduct && (
                  <div className="home-hero-product-tag">
                    <strong>{heroProduct.name}</strong>
                    <span>Rs. {Number(heroProduct.salePrice || heroProduct.price || 0).toLocaleString()}</span>
                  </div>
                )}
              </div>

              <div className="hero-visual-info">
                <span>HAFIZ MART</span>
                <strong>
                  {activeProducts.length
                    ? `${activeProducts.length} products available`
                    : "Your shopping destination"}
                </strong>
              </div>
            </motion.div>

          </div>
        </section>

        {/* CATEGORIES */}
        {contentSettings.showCategoriesOnHome !== false && <section className="home-section">
          <div className="container">

            <div className="home-section-heading">
              <div>
                <p className="eyebrow">EXPLORE</p>
                <h2>Shop by Category</h2>
              </div>

              {(availableCats.length > 0) && (
                <Link className="text-link" to="/categories">
                  View All <ArrowRight size={15} />
                </Link>
              )}
            </div>
{availableCats.length ? (
  <div className="home-category-grid">
    {availableCats.map((c, index) => (
      <Link
        className="home-category-card"
        key={c.id}
        to={`/shop?category=${encodeURIComponent(c.name)}`}
        aria-label={`View ${c.name} category`}
      >
        <CategoryArtwork category={c} image={c.image} />
        <div className="home-category-copy">
          <span className="category-card-kicker">COLLECTION {String(index + 1).padStart(2, "0")}</span>
          <strong>{c.name}</strong>
          <span>
            {c.productCount > 0
              ? `${c.productCount} ${c.productCount === 1 ? "product" : "products"}`
              : c.childCount > 0
                ? `${c.childCount} ${c.childCount === 1 ? "collection" : "collections"}`
                : "Coming soon"}
          </span>
        </div>
        <span className="category-card-arrow"><ArrowRight aria-hidden="true" size={17} /></span>
      </Link>
    ))}
  </div>
) : (
  <div className="home-category-coming-soon">
    <span className="category-more-icon" aria-hidden="true">+</span>
    <strong>Categories Coming Soon</strong>
    <span>
      New categories will appear here as they are added.
    </span>
  </div>
)}

          </div>
        </section>}

        {/* NEW ARRIVALS */}
        {newArrivals.length > 0 && (
          <section className="home-section">
            <div className="container">

              <div className="home-section-heading">
                <div>
                  <p className="eyebrow">JUST IN</p>
                  <h2>New Arrivals</h2>
                </div>

                <Link className="text-link" to="/shop">
                  View All <ArrowRight size={15} />
                </Link>
              </div>

              <div className="home-product-grid">
                {newArrivals.map(product => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onToast={setToast}
                  />
                ))}
              </div>

            </div>
          </section>
        )}

        {/* TRENDING */}
        <section className="home-section home-section-dark">
          <div className="container">

            <div className="home-section-heading">
              <div>
                <p className="eyebrow">TRENDING NOW</p>
                <h2>Popular Products</h2>
              </div>

              {trendingProducts.length > 0 && (
                <Link className="text-link" to="/shop">
                  Shop more <ArrowRight size={15}/>
                </Link>
              )}
            </div>

            {trendingProducts.length ? (
              <div className="home-product-grid">
                {trendingProducts.map(product => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onToast={setToast}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="More Products Coming Soon"
                text="As the catalog grows, additional products will appear in Popular Products."
              />
            )}

          </div>
        </section>

        {/* PROMO */}
        {contentSettings.showDealsSection !== false && <section className="home-promo-section">
          <div className="container">

            <div className="home-promo">
              <div>
                <p className="eyebrow">SPECIAL OFFER</p>

                <h2>Good products.<br />Better prices.</h2>

                <p>
                  Explore our latest offers and discover something
                  worth adding to your cart.
                </p>

                <Link className="gold-btn" to="/deals">
                  View Deals
                  <ArrowRight size={17} />
                </Link>
              </div>

              <div className="promo-badge">
                <strong>DEALS</strong>
                <span>FOR YOU</span>
              </div>
            </div>

          </div>
        </section>}

        {/* FEATURED */}
        {featuredProducts.length > 0 && (
          <section className="home-section home-section-dark">
            <div className="container">

              <div className="home-section-heading">
                <div>
                  <p className="eyebrow">OUR PICKS</p>
                  <h2>Featured Products</h2>
                </div>

                <Link className="text-link" to="/shop">
                  View All <ArrowRight size={15} />
                </Link>
              </div>

              <div className="home-product-grid featured-grid">
                {featuredProducts.map(product => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onToast={setToast}
                  />
                ))}
              </div>

            </div>
          </section>
        )}
                {/* STAY UPDATED */}
        <section className="home-section home-newsletter-section">
          <div className="container">

            <div className="home-newsletter">
              <div className="home-newsletter-content">
                <p className="eyebrow">STAY CONNECTED</p>

                <h2>Stay Updated</h2>

                <p>
                  Get updates about new products, special offers
                  and the latest deals from Hafiz Mart.
                </p>
              </div>

              <form
  className="home-newsletter-form"
  onSubmit={async (e) => {
    e.preventDefault();

    const email = newsletterEmail.trim().toLowerCase();

    if (!email) return;

    setNewsletterBusy(true);
    setNewsletterMessage("");

    const { error } = await supabase
      .from("newsletter_subscribers")
      .insert({
        email
      });

    if (error) {

      if (error.code === "23505") {
        setNewsletterMessage(
          "You're already subscribed. Thank you!"
        );
      } else {
        console.error(
          "Newsletter subscription error:",
          error
        );

        setNewsletterMessage(
          "Something went wrong. Please try again."
        );
      }

    } else {

      setNewsletterMessage(
        "Thank you for subscribing!"
      );

      setNewsletterEmail("");
    }

    setNewsletterBusy(false);
  }}
>
  <input
    type="email"
    value={newsletterEmail}
    onChange={(e) => {
      setNewsletterEmail(e.target.value);
      setNewsletterMessage("");
    }}
    placeholder="Enter your email address"
    required
  />

  <button
    type="submit"
    className="gold-btn"
    disabled={newsletterBusy}
  >
    {newsletterBusy
      ? "Subscribing..."
      : "Subscribe"}
  </button>
</form>

{newsletterMessage && (
  <p className="newsletter-message" role="status" aria-live="polite">
    {newsletterMessage}
  </p>
)}
            </div>

          </div>
        </section>
                <HomeTestimonials />

        {/* TRUST */}
        <section className="home-trust">
          <div className="container home-trust-grid">

            <div className="home-trust-item">
              <div>🚚</div>
              <strong>Fast Delivery</strong>
              <span>
                Reliable delivery across Pakistan.
              </span>
            </div>

            <div className="home-trust-item">
              <div>🔒</div>
              <strong>Secure Shopping</strong>
              <span>
                Your shopping experience stays simple and secure.
              </span>
            </div>

            <div className="home-trust-item">
              <div>💬</div>
              <strong>WhatsApp Support</strong>
              <span>
                Get help and order assistance through WhatsApp.
              </span>
            </div>

          </div>
        </section>

      </main>

      <Toast
        message={toast}
        onClose={() => setToast("")}
      />
    </>
  );
}


function StarRating({value=0,size=16}){
  return <span className="stars" role="img" aria-label={`${value} out of 5 stars`}>{[1,2,3,4,5].map(n=><Star key={n} size={size} fill={n<=Math.round(value)?"currentColor":"none"}/>)}</span>;
}

function ProductReviews({ productId }) {
  const { user, profile } = useAuth();
  const { store } = useStore();
  const reviewSettings = store.adminSettings?.inventory || DEFAULT_ADMIN_SETTINGS.inventory;
  const reviewRequiresApproval = reviewSettings.reviewsRequireApproval === true;
  const maxReviewImages = Math.max(1, Number(reviewSettings.maxReviewImages || 5));

  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");

  const [reviewImages, setReviewImages] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    if (!productId) {
      setReviews([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("reviews")
      .select(
        "id,user_id,product_id,reviewer_name,rating,title,comment,image_urls,status,created_at"
      )
      .eq("product_id", productId)
      .neq("status", "rejected")
      .order("created_at", {
        ascending: false
      });

    if (error) {
      console.error("Reviews load error:", error);
      setReviews([]);
    } else {
      setReviews(data || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [productId]);

  const mine = reviews.some(
    review => review.user_id === user?.id
  );

  const uploadReviewImages = async files => {
    const selected = Array.from(files || []);

    if (!selected.length) return;

    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    const invalid = selected.find(
      file => !allowed.includes(file.type)
    );

    if (invalid) {
      setMessage(
        "Sirf JPG, PNG ya WEBP images upload karein."
      );
      return;
    }

    const tooLarge = selected.find(
      file => file.size > 5 * 1024 * 1024
    );

    if (tooLarge) {
      setMessage(
        "Har review image maximum 5MB ho sakti hai."
      );
      return;
    }

    if (reviewImages.length + selected.length > maxReviewImages) {
      setMessage(
        `Maximum ${maxReviewImages} images per review upload kar sakte hain.`
      );
      return;
    }

    setUploadingImages(true);
    setMessage("");

    const uploaded = [];

    for (const file of selected) {
      const safeName = file.name
        .toLowerCase()
        .replace(/[^a-z0-9.]+/g, "-");

      const path =
        `reviews/${productId}/${user.id}/${crypto.randomUUID()}-${safeName}`;

      const {
        error: uploadError
      } = await supabase.storage
        .from("review-images")
        .upload(
          path,
          file,
          {
            upsert: false,
            contentType: file.type,
            cacheControl: "3600"
          }
        );

      if (uploadError) {
        console.error(
          "Review image upload error:",
          uploadError
        );

        setMessage(
          "Review image upload nahi ho saki. Dobara try karein."
        );

        break;
      }

      const {
        data
      } = supabase.storage
        .from("review-images")
        .getPublicUrl(path);

      if (data?.publicUrl) {
        uploaded.push(data.publicUrl);
      }
    }

    if (uploaded.length) {
      setReviewImages(prev => [
        ...prev,
        ...uploaded
      ]);
    }

    setUploadingImages(false);
  };

  const removeReviewImage = url => {
    setReviewImages(prev =>
      prev.filter(image => image !== url)
    );
  };

  const submit = async e => {
    e.preventDefault();

    if (!user) {
      setMessage(
        "Review dene ke liye customer account mein login karein."
      );
      return;
    }

    if (!rating) {
      setMessage(
        "Please product rating select karein."
      );
      return;
    }

    setBusy(true);
    setMessage("");

    const {
      error
    } = await supabase
      .from("reviews")
      .insert({
        product_id: productId,
        user_id: user.id,
        reviewer_name:
          profile?.full_name ||
          user.email?.split("@")[0] ||
          "Customer",

        rating,

        title:
          title.trim() || null,

        comment:
          comment.trim() || null,

        image_urls:
          reviewImages,

        status: reviewRequiresApproval ? "pending" : "approved"
      });

    if (error) {

      console.error(
        "Review submit error:",
        error
      );

      if (error.code === "23505") {
        setMessage(
          "Aap is product ko already review de chuke hain."
        );
      } else {
        setMessage(
          "Review submit nahi ho saka. Dobara try karein."
        );
      }

    } else {

      setTitle("");
      setComment("");
      setRating(5);
      setReviewImages([]);

      setMessage(
        "Thank you! Aapka review ab product par show ho raha hai."
      );

      await load();
    }

    setBusy(false);
  };

  const avg =
    reviews.length
      ? reviews.reduce(
          (sum, review) =>
            sum + Number(review.rating || 0),
          0
        ) / reviews.length
      : 0;

  return (
    <section className="reviews-section">

      <div className="section-heading">

        <div>

          <p className="eyebrow">
            CUSTOMER VOICE
          </p>

          <h2>
            Reviews{" "}

            {reviews.length > 0 && (
              <small>
                ({reviews.length})
              </small>
            )}
          </h2>

        </div>

        {reviews.length > 0 && (
          <div className="review-summary">
            <StarRating value={avg} />
            <strong>
              {avg.toFixed(1)}
            </strong>
          </div>
        )}

      </div>

      {loading ? (

        <div className="mini-empty">
          Reviews load ho rahe hain...
        </div>

      ) : reviews.length ? (

        <div className="review-list">

          {reviews.map(review => (

            <article
              className="review-card"
              key={review.id}
            >

              <div className="review-card-head">

                <div>

                  <strong>
                    {review.reviewer_name ||
                      "Customer"}
                  </strong>

                  <span>
                    {new Date(
                      review.created_at
                    ).toLocaleDateString()}
                  </span>

                </div>

                <StarRating
                  value={review.rating}
                />

              </div>

              {review.title && (
                <h3>
                  {review.title}
                </h3>
              )}

              {review.comment && (
                <p>
                  {review.comment}
                </p>
              )}

              {Array.isArray(
                review.image_urls
              ) &&
                review.image_urls.length > 0 && (

                <div className="review-images">

                  {review.image_urls.map(
                    (image, index) => (

                      <a
                        key={`${review.id}-${index}`}
                        href={image}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          src={image}
                          alt={`Review ${index + 1}`}
                        />
                      </a>

                    )
                  )}

                </div>

              )}

            </article>

          ))}

        </div>

      ) : (

        <div className="mini-empty">

          <MessageSquare size={24} />

          <strong>
            No reviews yet
          </strong>

          <span>
            Is product par pehla review aap de sakte hain.
          </span>

        </div>

      )}

      <div className="review-form-wrap">

        <div>

          <p className="eyebrow">
            WRITE A REVIEW
          </p>

          <h3>
            Apna experience share karein
          </h3>

          <p className="muted">
            Aapka review submit hote hi product par show ho jayega.
          </p>

        </div>

        {user && !mine ? (

          <form
            className="review-form"
            onSubmit={submit}
          >

            <div className="star-picker">

              <span>
                Rating
              </span>

              <div>

                {[1, 2, 3, 4, 5].map(
                  number => (

                    <button
                      type="button"
                      key={number}
                      onClick={() =>
                        setRating(number)
                      }
                      className={
                        number <= rating
                          ? "active"
                          : ""
                      }
                      aria-label={`${number} stars`}
                    >

                      <Star
                        size={22}
                        fill={
                          number <= rating
                            ? "currentColor"
                            : "none"
                        }
                      />

                    </button>

                  )
                )}

              </div>

            </div>

            <input
              value={title}
              onChange={e =>
                setTitle(e.target.value)
              }
              placeholder="Review title (optional)"
              maxLength={80}
            />

            <textarea
              value={comment}
              onChange={e =>
                setComment(e.target.value)
              }
              placeholder="Aapka review..."
              rows="4"
              maxLength={500}
            />

            <div className="review-image-uploader">

              <div className="review-upload-head">

                <div>

                  <strong>
                    Add Product Photos
                  </strong>

                  <span>
                    Optional — maximum 5 photos
                  </span>

                </div>

                <label className="ghost-btn review-upload-btn">

                  <ImageIcon size={16} />

                  {uploadingImages
                    ? "Uploading..."
                    : "Add Photos"}

                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    hidden
                    disabled={uploadingImages}
                    onChange={e => {
                      uploadReviewImages(
                        e.target.files
                      );

                      e.target.value = "";
                    }}
                  />

                </label>

              </div>

              {reviewImages.length > 0 && (

                <div className="review-upload-preview">

                  {reviewImages.map(
                    (image, index) => (

                      <div
                        className="review-upload-thumb"
                        key={`${image}-${index}`}
                      >

                        <img
                          src={image}
                          alt={`Selected review ${index + 1}`}
                        />

                        <button
                          type="button"
                          onClick={() =>
                            removeReviewImage(image)
                          }
                          aria-label="Remove image"
                        >
                          <X size={14} />
                        </button>

                      </div>

                    )
                  )}

                </div>

              )}

            </div>

            <button
              className="gold-btn"
              disabled={
                busy ||
                uploadingImages
              }
            >

              {busy
                ? "Submitting..."
                : "Submit Review"}

              <Star size={16} />

            </button>

          </form>

        ) : (

          <div className="review-login">

            <ShieldCheck size={20} />

            <span>

              {user
                ? "Aap is product ko already review de chuke hain."
                : "Login karke review submit karein."}

            </span>

            {!user && (
              <Link
                className="text-link"
                to="/login"
              >
                Login
                <ArrowRight size={14} />
              </Link>
            )}

          </div>

        )}

        {message && (
          <p className="review-message">
            {message}
          </p>
        )}

      </div>

    </section>
  );
}

function ProductDetails() {
  const { id } = useParams(); const { store, addToCart, update }=useStore(); const product=store.products.find(p=>p.id===id); const [qty,setQty]=useState(1); const [toast,setToast]=useState(""); const [selectedImage,setSelectedImage]=useState(0);
  if(!product) return <main className="page container"><EmptyState title="Product Not Found" text="Yeh product available nahi hai." action="Back to Shop" to="/shop"/></main>;
  const gallery=[...(product.images||[])]; if(product.image&&!gallery.includes(product.image))gallery.unshift(product.image); const images=gallery.length?gallery:[logo]; const currentImage=images[Math.min(selectedImage,images.length-1)];
  const price=Number(product.salePrice||product.price||0); const wished=store.wishlist.includes(product.id); const waNumber=import.meta.env.VITE_WHATSAPP_NUMBER||"923000000000"; const waText=`Assalam o Alaikum, mujhe Hafiz Mart se yeh product order karna hai:\n\nProduct: ${product.name}\nSKU: ${product.sku||"N/A"}\nQuantity: ${qty}\nPrice: Rs. ${price.toLocaleString()}\nTotal: Rs. ${(price*qty).toLocaleString()}`;
  return <main className="page"><div className="container product-detail"><div className="detail-gallery"><div className="detail-image"><img src={currentImage} alt={product.name}/></div>{images.length>1&&<div className="thumbnail-row" aria-label={`${product.name} images`}>{images.map((src,i)=><button type="button" key={src+i} className={i===selectedImage?'active':''} onClick={()=>setSelectedImage(i)} aria-label={`View ${product.name} image ${i+1}`} aria-current={i===selectedImage?'true':undefined}><img src={src} alt="" /></button>)}</div>}</div><div className="detail-copy"><p className="eyebrow">{product.category||"PRODUCT"}</p><h1>{product.name}</h1><div className="detail-price"><strong>Rs. {price.toLocaleString()}</strong>{product.salePrice&&<del>Rs. {Number(product.price).toLocaleString()}</del>}</div><p className="detail-description">{product.description||product.shortDescription||"Is product ki detailed description abhi add nahi ki gayi."}</p><div className="stock-line">{Number(product.stock||0)>0?<><Check size={16}/> In stock — {product.stock} available</>:"Out of stock"}</div><div className="detail-actions"><div className="qty" aria-label={`Quantity for ${product.name}`}><button type="button" onClick={()=>setQty(Math.max(1,qty-1))} aria-label={`Decrease ${product.name} quantity`}><Minus aria-hidden="true" size={15}/></button><strong aria-live="polite">{qty}</strong><button type="button" onClick={()=>setQty(Math.min(Number(product.stock||1),qty+1))} aria-label={`Increase ${product.name} quantity`}><Plus aria-hidden="true" size={15}/></button></div><button className="gold-btn" type="button" disabled={!Number(product.stock||0)} onClick={()=>{addToCart(product,qty);setToast("Product cart mein add ho gaya")}}><ShoppingBag aria-hidden="true" size={17}/> Add to Cart</button><button type="button" className={`icon-btn ${wished?"active":""}`} aria-pressed={wished} aria-label={wished ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`} title={wished ? "Remove from wishlist" : "Add to wishlist"} onClick={()=>update({wishlist:wished?store.wishlist.filter(x=>x!==id):[...store.wishlist,id]})}><Heart aria-hidden="true" size={19} fill={wished?"currentColor":"none"}/></button></div><a className="whatsapp-order" href={`https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noreferrer"><MessageCircle size={18}/> Order on WhatsApp</a><Toast message={toast} onClose={()=>setToast("")}/></div></div><div className="container"><ProductReviews productId={product.id}/></div></main>;
}
function Categories() {
  const { store } = useStore();
  const mainCategories = sortMainCategories(store.categories);
  return (
    <main className="page">
      <div className="container">
        <div className="page-head">
          <div><p className="eyebrow">DISCOVER</p><h1>Categories</h1><p>Explore Hafiz Mart collections and their subcategories.</p></div>
        </div>
        {mainCategories.length ? (
          <div className="category-grid large category-directory-grid">
            {mainCategories.map(category => {
              const children = store.categories.filter(child => String(child.parent_category_id || '') === String(category.id));
              const count = getCategoryProductCount(store.categories, store.products, category.id);
              const descendants = new Set(getCategoryDescendantIds(store.categories, category.id));
              const image = category.image || children.find(child => child.image)?.image || store.products.find(product => descendants.has(String(product.categoryId)) && product.image)?.image || '';
              return (
                <Link className="category-directory-card" key={category.id} to={`/shop?category=${encodeURIComponent(category.name)}`}>
                  <CategoryArtwork category={category} image={image} />
                  <div className="category-directory-copy">
                    <span className="category-directory-kicker">COLLECTION</span>
                    <h2>{category.name}</h2>
                    <p>{count > 0 ? `${count} ${count === 1 ? 'product' : 'products'} available` : children.length ? `${children.length} subcategories` : 'Coming soon'}</p>
                    {children.length > 0 && <div className="category-directory-subcats">{children.slice(0, 3).map(child => <span key={child.id}>{child.name}</span>)}{children.length > 3 && <span>+{children.length - 3} more</span>}</div>}
                    <span className="category-directory-arrow"><ArrowRight size={17} /></span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Categories Coming Soon" text="New collections will appear here as they are added." icon={Tag} />
        )}
      </div>
    </main>
  );
}
function Deals(){ const {store}=useStore(); const deals=store.products.filter(p=>p.salePrice); return <main className="page"><div className="container"><div className="page-head"><div><p className="eyebrow">OFFERS</p><h1>Deals</h1><p>Products with an active sale price.</p></div></div>{deals.length?<div className="product-grid">{deals.map(p=><ProductCard key={p.id} product={p}/>)}</div>:<EmptyState title="No Active Deals" text="Fresh offers will appear here when products have an active sale price." icon={Tag}/>}</div></main>; }
function Wishlist(){ const {store}=useStore(); const products=store.products.filter(p=>store.wishlist.includes(p.id)); return <main className="page"><div className="container"><div className="page-head"><div><p className="eyebrow">SAVED</p><h1>Wishlist</h1><p>Your saved products.</p></div></div>{products.length?<div className="product-grid">{products.map(p=><ProductCard key={p.id} product={p}/>)}</div>:<EmptyState title="Wishlist Empty" text="Product cards par heart icon press karke items save karein." action="Start Shopping" to="/shop" icon={Heart}/>}</div></main>; }

function Cart(){ const {store,cartItems,subtotal,update}=useStore(); const delivery=0; const total=subtotal+delivery; const waNumber=import.meta.env.VITE_WHATSAPP_NUMBER||"923000000000"; const changeQty=(index,delta)=>{const cart=[...store.cart]; cart[index]={...cart[index],qty:Math.max(1,cart[index].qty+delta)};update({cart})}; const remove=(index)=>update({cart:store.cart.filter((_,i)=>i!==index)}); const message=`Assalam o Alaikum, Hafiz Mart se order place karna hai.\n\n${cartItems.map(x=>`• ${x.product.name} x${x.qty} — Rs. ${(Number(x.product.salePrice||x.product.price)*x.qty).toLocaleString()}`).join("\n")}\n\nSubtotal: Rs. ${subtotal.toLocaleString()}\nDelivery: Rs. ${delivery.toLocaleString()}\nTotal: Rs. ${total.toLocaleString()}`; return <main className="page"><div className="container"><div className="page-head"><div><p className="eyebrow">YOUR BAG</p><h1>Shopping Cart</h1><p>Review your items before ordering.</p></div></div>{cartItems.length?<div className="cart-layout"><div className="cart-list">{cartItems.map(x=><div className="cart-row" key={x.index}><img src={x.product.image||logo} alt={x.product.name || "Hafiz Mart product"}/><div className="cart-main"><Link to={`/product/${x.product.id}`}><strong>{x.product.name}</strong></Link><span>Rs. {Number(x.product.salePrice||x.product.price).toLocaleString()}</span></div><div className="qty" aria-label={`Quantity for ${x.product.name}`}><button type="button" onClick={()=>changeQty(x.index,-1)} aria-label={`Decrease ${x.product.name} quantity`}><Minus aria-hidden="true" size={14}/></button><strong aria-live="polite">{x.qty}</strong><button type="button" onClick={()=>changeQty(x.index,1)} aria-label={`Increase ${x.product.name} quantity`}><Plus aria-hidden="true" size={14}/></button></div><strong className="line-total">Rs. {(Number(x.product.salePrice||x.product.price)*x.qty).toLocaleString()}</strong><button type="button" className="remove-btn" aria-label={`Remove ${x.product.name} from cart`} title="Remove from cart" onClick={()=>remove(x.index)}><Trash2 aria-hidden="true" size={16}/></button></div>)}</div><aside className="summary"><p className="eyebrow">SUMMARY</p><h2>Order Total</h2><div><span>Subtotal</span><strong>Rs. {subtotal.toLocaleString()}</strong></div><div><span>Delivery</span><strong>Rs. {delivery.toLocaleString()}</strong></div><div className="summary-total"><span>Total</span><strong>Rs. {total.toLocaleString()}</strong></div><Link className="gold-btn full" to="/checkout">Checkout</Link><a className="whatsapp-order full" href={`https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"><MessageCircle size={18}/> Order on WhatsApp</a></aside></div>:<EmptyState title="Your Cart is Empty" text="Shop se products add karein, phir yahan order summary dekhein." action="Start Shopping" to="/shop"/>}</div></main>; }

function Shop() {
  const { store } = useStore();
  const location = useLocation();
  const navigate = useNavigate();

  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");

  const [saleOnly, setSaleOnly] = useState(false);
  const [inStock, setInStock] = useState(false);
  const [freeDeliveryOnly, setFreeDeliveryOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  /*
    HashRouter URL:

    #/shop?category=Men's%20Modern%20Wear

    React Router:
    location.pathname = /shop
    location.search  = ?category=Men's%20Modern%20Wear
  */

  const params = new URLSearchParams(location.search);

  const category = params.get("category") || "";
  const urlSearch = params.get("search") || "";
  const selectedCategory = store.categories.find(item => item.name === category);
  const selectedCategoryIds = selectedCategory
    ? new Set(getCategoryDescendantIds(store.categories, selectedCategory.id))
    : null;

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [category]);

  /*
    URL change hone par search box bhi sync rahe.
  */
  useEffect(() => {
    setQuery(urlSearch);
  }, [urlSearch]);

  /*
    Shop ke andar category dropdown se category change karne par
    sirf state nahi, actual Router URL bhi change hoga.
  */
  const handleCategoryChange = (value) => {
    const nextParams = new URLSearchParams();

    if (value) {
      nextParams.set("category", value);
    }

    if (query.trim()) {
      nextParams.set("search", query.trim());
    }

    const nextUrl = nextParams.toString()
      ? `/shop?${nextParams.toString()}`
      : "/shop";

    navigate(nextUrl);
  };

  const handleSearchChange = (value) => {
    setQuery(value);

    const nextParams = new URLSearchParams(location.search);

    if (value.trim()) {
      nextParams.set("search", value);
    } else {
      nextParams.delete("search");
    }

    const nextUrl = nextParams.toString()
      ? `/shop?${nextParams.toString()}`
      : "/shop";

    navigate(nextUrl, { replace: true });
  };

  const reset = () => {
    setQuery("");
    setSort("newest");
    setSaleOnly(false);
    setInStock(false);
    setFreeDeliveryOnly(false);

    navigate("/shop");
  };

  const freeDeliveryThreshold = Number(store.adminSettings?.shipping?.freeDeliveryThreshold ?? 10000);

  let products = store.products
    .filter((p) => p.status !== "inactive")
    .filter((p) => !category || (selectedCategoryIds ? selectedCategoryIds.has(String(p.categoryId)) : p.category === category))
    .filter(
      (p) =>
        !query ||
        `${p.name} ${p.brand || ""} ${p.sku || ""} ${
          p.shortDescription || ""
        }`
          .toLowerCase()
          .includes(query.toLowerCase())
    )
    .filter((p) => !saleOnly || Boolean(p.salePrice))
    .filter((p) => !inStock || Number(p.stock || 0) > 0)
    .filter((p) => !freeDeliveryOnly || Boolean(p.free_delivery || p.freeDelivery) || Number(p.salePrice || p.price || 0) >= freeDeliveryThreshold);

  products = [...products].sort((a, b) =>
    sort === "price-low"
      ? Number(a.salePrice || a.price) -
        Number(b.salePrice || b.price)
      : sort === "price-high"
      ? Number(b.salePrice || b.price) -
        Number(a.salePrice || a.price)
      : sort === "name"
      ? a.name.localeCompare(b.name)
      : sort === "name-desc"
      ? b.name.localeCompare(a.name)
      : new Date(b.createdAt) - new Date(a.createdAt)
  );

  return (
    <main className="page">
      <div className="container">

        <div className="page-head">
          <div>
            <p className="eyebrow">CATALOG</p>

            <h1>
              {category || "Shop"}
            </h1>

            <p>
              Browse the live products in Hafiz Mart.
            </p>
          </div>

          <span className="result-count">
            {products.length} products
          </span>
        </div>

        <div className="filters">

          <div className="filter-search">
            <Search size={17} />

            <input
              value={query}
              onChange={(e) =>
                handleSearchChange(e.target.value)
              }
              placeholder="Search products, brand or SKU..."
            />
          </div>

          <select
            value={category}
            onChange={(e) =>
              handleCategoryChange(e.target.value)
            }
          >
            <option value="">All categories</option>

            {store.categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>

          <button
            className="filter-btn filter-toggle"
            onClick={() =>
              setFiltersOpen((v) => !v)
            }
          >
            <SlidersHorizontal size={16} />
            Filters
          </button>

        </div>

        <AnimatePresence>
          {filtersOpen && (
            <motion.div
              className="advanced-filters"
              initial={{
                opacity: 0,
                height: 0
              }}
              animate={{
                opacity: 1,
                height: "auto"
              }}
              exit={{
                opacity: 0,
                height: 0
              }}
            >

              <label className="price-sort-filter">
                Sort Products
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  aria-label="Sort products by price or newest"
                >
                  <option value="newest">Newest First</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="name">Name A–Z</option>
                  <option value="name-desc">Name Z–A</option>
                </select>
              </label>

              <div className="shop-filter-toggle-group" role="group" aria-label="Additional product filters">
                <label className={`check-filter check-filter-card${saleOnly ? " is-active" : ""}`}>
                  <input
                    type="checkbox"
                    checked={saleOnly}
                    onChange={(e) => setSaleOnly(e.target.checked)}
                  />
                  <span className="check-filter-card-copy">
                    <strong>Sale only</strong>
                    <small>Show discounted products</small>
                  </span>
                </label>

                <label className={`check-filter check-filter-card${inStock ? " is-active" : ""}`}>
                  <input
                    type="checkbox"
                    checked={inStock}
                    onChange={(e) => setInStock(e.target.checked)}
                  />
                  <span className="check-filter-card-copy">
                    <strong>In stock only</strong>
                    <small>Hide unavailable products</small>
                  </span>
                </label>

                <label className={`check-filter check-filter-card${freeDeliveryOnly ? " is-active" : ""}`} title={`Shows products whose single-item price qualifies for the current free delivery threshold of Rs. ${freeDeliveryThreshold.toLocaleString()}.`}>
                  <input
                    type="checkbox"
                    checked={freeDeliveryOnly}
                    onChange={(e) => setFreeDeliveryOnly(e.target.checked)}
                  />
                  <span className="check-filter-card-copy">
                    <strong>Free delivery</strong>
                    <small>Eligible at current store threshold</small>
                  </span>
                </label>
              </div>

              <button
                className="text-link"
                onClick={reset}
              >
                <RotateCcw size={14} />
                Reset filters
              </button>

            </motion.div>
          )}
        </AnimatePresence>

        {products.length ? (
          <div className="product-grid">

            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                onToast={setToast}
              />
            ))}

          </div>
        ) : (
          <EmptyState
            title="No Products Found"
            text={
              store.products.length
                ? "Search/filter change karke dobara try karein."
                : "Abhi store mein koi product nahi hai."
            }
            action="Reset Filters"
            to="/shop"
            icon={Search}
          />
        )}

      </div>

      <Toast
        message={toast}
        onClose={() => setToast("")}
      />
    </main>
  );
}

function Checkout(){
  const { cartItems, subtotal, update, store } = useStore();
  const appSettings = store.adminSettings || DEFAULT_ADMIN_SETTINGS;
  const shippingSettings = appSettings.shipping || DEFAULT_ADMIN_SETTINGS.shipping;
  const paymentSettings = appSettings.payments || DEFAULT_ADMIN_SETTINGS.payments;
  const cardPaymentsEnabled = paymentSettings.onlinePaymentsEnabled === true;
  const storefrontSettings = appSettings.storefront || DEFAULT_ADMIN_SETTINGS.storefront;
  const { user } = useAuth();

  const [step,setStep]=useState(1);

  const [form,setForm]=useState({
    email:user?.email||'',
    firstName:'',
    lastName:'',
    phone:'',
    address1:'',
    address2:'',
    country:'Pakistan',
    province:'',
    city:'',
    postalCode:''
  });

  const [billingSame,setBillingSame]=useState(true);

  const [billing,setBilling]=useState({
    address1:'',
    address2:'',
    country:'Pakistan',
    province:'',
    city:'',
    postalCode:''
  });

  const [deliveryMethod,setDeliveryMethod]=useState('standard');
  const [paymentMethod,setPaymentMethod]=useState('');

  const [card,setCard]=useState({
    name:'',
    number:'',
    expiry:'',
    cvv:''
  });

  const [couponCode,setCouponCode]=useState('');
  const [coupon,setCoupon]=useState(null);

  const [busy,setBusy]=useState(false);
  const [couponBusy,setCouponBusy]=useState(false);
  const [error,setError]=useState('');
  const [couponError,setCouponError]=useState('');
  const [order,setOrder]=useState(null);
  const [receipt,setReceipt]=useState(null);

  const waNumber=
    import.meta.env.VITE_WHATSAPP_NUMBER||'923000000000';

  const provinces={
    Punjab:[
      'Multan',
      'Lahore',
      'Faisalabad',
      'Rawalpindi',
      'Gujranwala',
      'Sialkot',
      'Bahawalpur',
      'Sargodha',
      'Gujrat',
      'Rahim Yar Khan'
    ],

    Sindh:[
      'Karachi',
      'Hyderabad',
      'Sukkur',
      'Larkana',
      'Nawabshah',
      'Mirpur Khas'
    ],

    'Khyber Pakhtunkhwa':[
      'Peshawar',
      'Mardan',
      'Abbottabad',
      'Mingora',
      'Kohat',
      'Dera Ismail Khan'
    ],

    Balochistan:[
      'Quetta',
      'Gwadar',
      'Turbat',
      'Khuzdar',
      'Chaman',
      'Sibi'
    ],

    'Islamabad Capital Territory':[
      'Islamabad'
    ],

    'Gilgit-Baltistan':[
      'Gilgit',
      'Skardu',
      'Hunza'
    ],

    'Azad Jammu and Kashmir':[
      'Muzaffarabad',
      'Mirpur',
      'Rawalakot'
    ]
  };

  useEffect(()=>{
    if(user?.email){
      setForm(f=>({
        ...f,
        email:f.email||user.email
      }));
    }
  },[user]);

  const updateField=(key,value)=>{
    setForm(f=>({
      ...f,
      [key]:value
    }));
  };

  const updateBilling=(key,value)=>{
    setBilling(b=>({
      ...b,
      [key]:value
    }));
  };

  const normalizedCity = String(form.city || '').trim().toLowerCase();
  const cityRate = (shippingSettings.cityRates || []).find(row => String(row.city || '').trim().toLowerCase() === normalizedCity);
  const freeThreshold = Number(shippingSettings.freeDeliveryThreshold ?? 10000);
  const deliveryFee = freeThreshold > 0 && subtotal >= freeThreshold
    ? 0
    : Math.max(0, Number(cityRate?.rate ?? shippingSettings.defaultRate ?? (normalizedCity === 'multan' ? 270 : 300)));

  const discount=Number(coupon?.discount||0);
  const freeShippingCoupon=Boolean(coupon?.freeShipping);
  const finalDeliveryFee=freeShippingCoupon ? 0 : deliveryFee;
  const total=Math.max(0,subtotal-discount+finalDeliveryFee);

  const validateWhatsApp=(phone)=>{
    const cleaned=
      phone.replace(/[\s\-()]/g,'');

    return /^(?:\+92|0092|92|0)3\d{9}$/.test(cleaned);
  };

  const formatCardNumber=(value)=>{
    const digits=
      value.replace(/\D/g,'').slice(0,16);

    return digits.replace(
      /(.{4})/g,
      '$1 '
    ).trim();
  };

  const formatExpiry=(value)=>{
    const digits=
      value.replace(/\D/g,'').slice(0,4);

    if(digits.length>2){
      return `${digits.slice(0,2)}/${digits.slice(2)}`;
    }

    return digits;
  };

  const applyCoupon=async()=>{
    setCouponBusy(true);
    setCouponError('');
    setCoupon(null);

    if(!couponCode.trim()){
      setCouponError(
        'Coupon code enter karein.'
      );
      setCouponBusy(false);
      return;
    }

    const {
      data,
      error
    }=await supabase.rpc(
      'validate_hafiz_coupon',
      {
        p_code:couponCode.trim(),
        p_subtotal:subtotal
      }
    );

    const result=
      Array.isArray(data)
        ? data[0]
        : data;

    if(error){
      setCouponError(error.message);
    }else if(
      !result ||
      (Number(result.discount||0)<=0 && !result.free_shipping)
    ){
      setCouponError(
        result?.message||
        'Coupon apply nahi hua.'
      );
    }else{
      setCoupon({
        code:
          result.coupon_code||
          result.code||
          couponCode
            .trim()
            .toUpperCase(),

        discount:Number(result.discount||0),
        freeShipping:Boolean(result.free_shipping),
        displayName:result.display_name||''
      });
    }

    setCouponBusy(false);
  };

  const validateStep=()=>{
    setError('');

    if(step===1){

      if(!form.email.trim()){
        setError(
          'Email address required hai.'
        );
        return false;
      }

      if(
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
          .test(form.email)
      ){
        setError(
          'Valid email address enter karein.'
        );
        return false;
      }

      return true;
    }

    if(step===2){

      if(!form.firstName.trim()){
        setError(
          'First name required hai.'
        );
        return false;
      }

      if(!form.lastName.trim()){
        setError(
          'Last name required hai.'
        );
        return false;
      }

      if(!form.phone.trim()){
        setError(
          'WhatsApp number required hai.'
        );
        return false;
      }

      if(!validateWhatsApp(form.phone)){
        setError(
          'Valid Pakistani WhatsApp number enter karein. Example: 03001234567'
        );
        return false;
      }

      if(!form.address1.trim()){
        setError(
          'Address Line 1 required hai.'
        );
        return false;
      }

      if(!form.country){
        setError(
          'Country select karein.'
        );
        return false;
      }

      if(!form.province){
        setError(
          'Province select karein.'
        );
        return false;
      }

      if(!form.city){
        setError(
          'City select karein.'
        );
        return false;
      }

      if(!form.postalCode.trim()){
        setError(
          'Postal code required hai.'
        );
        return false;
      }

      return true;
    }

    if(step===3){

      if(!deliveryMethod){
        setError(
          'Delivery method select karein.'
        );
        return false;
      }

      return true;
    }

    if(step===4){

      if(!paymentMethod){
        setError(paymentSettings.codEnabled ? 'Payment method select karein.' : 'Filhaal koi payment method available nahi hai.');
        return false;
      }

      if(paymentMethod==='cod' && !paymentSettings.codEnabled){
        setError('Cash on Delivery filhaal available nahi hai.');
        return false;
      }

      if(paymentMethod==='card'){

        if(!cardPaymentsEnabled){
          setError(
            'Debit / Credit Card payment gateway abhi configure nahi hai.'
          );
          return false;
        }

        if(!card.name.trim()){
          setError(
            'Cardholder name required hai.'
          );
          return false;
        }

        const cardDigits=
          card.number.replace(/\D/g,'');

        if(cardDigits.length!==16){
          setError(
            'Valid 16-digit card number enter karein.'
          );
          return false;
        }

        if(!/^\d{2}\/\d{2}$/.test(card.expiry)){
          setError(
            'Expiry date MM/YY format mein enter karein.'
          );
          return false;
        }

        if(!/^\d{3,4}$/.test(card.cvv)){
          setError(
            'Valid CVV enter karein.'
          );
          return false;
        }

        /*
          IMPORTANT:
          Actual card charging requires a payment gateway.
          Card details are intentionally NOT sent to Supabase.
        */

        setError(
          'Card payment gateway abhi connect nahi hai. Filhaal Cash on Delivery select karein.'
        );

        return false;
      }

      if(!billingSame){

        if(!billing.address1.trim()){
          setError(
            'Billing address required hai.'
          );
          return false;
        }

        if(!billing.country){
          setError(
            'Billing country select karein.'
          );
          return false;
        }

        if(!billing.province){
          setError(
            'Billing province select karein.'
          );
          return false;
        }

        if(!billing.city){
          setError(
            'Billing city select karein.'
          );
          return false;
        }

        if(!billing.postalCode.trim()){
          setError(
            'Billing postal code required hai.'
          );
          return false;
        }
      }

      return true;
    }

    return true;
  };

  const nextStep=()=>{
    if(validateStep()){
      setStep(
        s=>Math.min(4,s+1)
      );

      window.scrollTo({
        top:0,
        behavior:'smooth'
      });
    }
  };

  const previousStep=()=>{
    setError('');

    setStep(
      s=>Math.max(1,s-1)
    );

    window.scrollTo({
      top:0,
      behavior:'smooth'
    });
  };

  const submit=async e=>{
    e.preventDefault();

    if(!validateStep()) return;
    if(storefrontSettings.maintenanceMode){
      setError(storefrontSettings.maintenanceMessage || 'Store maintenance mein hai. Baad mein dobara koshish karein.');
      return;
    }

    setBusy(true);
    setError('');

    const customerName=
      `${form.firstName.trim()} ${form.lastName.trim()}`
        .trim();

    const fullAddress=[
      form.address1.trim(),
      form.address2.trim(),
      form.city,
      form.province,
      form.country,
      form.postalCode
    ]
      .filter(Boolean)
      .join(', ');

    const billingAddress=!billingSame
      ? [
          billing.address1.trim(),
          billing.address2.trim(),
          billing.city,
          billing.province,
          billing.country,
          billing.postalCode
        ]
          .filter(Boolean)
          .join(', ')
      : fullAddress;

    const items=cartItems.map(x=>({
      product_id:x.product.id,
      quantity:x.qty
    }));

    const {
      data,
      error:rpcError
    }=await supabase.rpc(
      'create_hafiz_order',
      {
        p_customer:{
          name:customerName,
          phone:form.phone.trim(),
          email:form.email.trim(),
          address:fullAddress,
          city:form.city,
          payment_method:paymentMethod
        },

        p_items:items,

        p_coupon_code:
          coupon?.code||null
      }
    );

    if(rpcError){
      setError(
        rpcError.message
      );
      setBusy(false);
      return;
    }

    const created=
      Array.isArray(data)
        ? data[0]
        : data;

    if(!created){
      setError(
        'Order create nahi hua. Dobara try karein.'
      );
      setBusy(false);
      return;
    }

    const receiptItems = cartItems.map(x => ({ productId:x.product.id, name:x.product.name, image:x.product.image||'', quantity:x.qty, unitPrice:Number(x.product.salePrice||x.product.price), lineTotal:Number(x.product.salePrice||x.product.price)*x.qty }));
    const billingLine = billingSame ? 'Billing Address: Same as Shipping' : `Billing Address: ${billingAddress}`;

    // The order RPC is authoritative for the final total. Some RPC responses may
    // omit the discount field even though the discount has already been applied
    // to the returned total. Keep the receipt consistent with that server total
    // by deriving the applied discount when the explicit field is unavailable/zero.
    const receiptSubtotal = Number(created.subtotal ?? subtotal);
    const receiptDeliveryFee = Number(created.delivery_fee ?? finalDeliveryFee);
    const receiptTotal = Number(created.total ?? total);
    const explicitDiscount = Number(created.discount ?? created.discount_amount ?? created.coupon_discount ?? 0);
    const derivedDiscount = Math.max(0, receiptSubtotal + receiptDeliveryFee - receiptTotal);
    const receiptDiscount = derivedDiscount > 0 ? derivedDiscount : Math.max(0, explicitDiscount);

    const receiptData = { orderNumber:created.order_number, customerName, phone:form.phone, email:form.email, shippingAddress:fullAddress, billingAddress:billingLine.replace('Billing Address: ','').trim(), paymentMethod:paymentMethod==='cod'?'Cash on Delivery':paymentMethod, items:receiptItems, subtotal:receiptSubtotal, discount:receiptDiscount, deliveryFee:receiptDeliveryFee, total:receiptTotal, createdAt:new Date().toISOString() };
    const whatsappLines = receiptItems.map(item => `• ${item.name} x${item.quantity} — Rs. ${item.lineTotal.toLocaleString()}`).join('\n');
    const whatsappText = `Assalam o Alaikum, Hafiz Mart se order confirm karna hai.\n\nOrder: ${receiptData.orderNumber}\nCustomer: ${receiptData.customerName}\nWhatsApp: ${receiptData.phone}\nEmail: ${receiptData.email}\n\nShipping Address:\n${receiptData.shippingAddress}\n\nBilling Address: ${receiptData.billingAddress}\nPayment Method: ${receiptData.paymentMethod}\n\n${whatsappLines}\n\nSubtotal: Rs. ${receiptData.subtotal.toLocaleString()}\nDiscount: Rs. ${receiptData.discount.toLocaleString()}\nDelivery: Rs. ${receiptData.deliveryFee.toLocaleString()}\nTotal: Rs. ${receiptData.total.toLocaleString()}`;
    update({cart:[]});
    setReceipt({...receiptData,whatsappText});
    setOrder(created);
    setBusy(false);
  };

  if(order && receipt){
    return (
      <main className="page">
        <div className="container">
          <div className="receipt-page">
            <div className="receipt-success"><div className="receipt-check"><Check size={24}/></div><p className="eyebrow">ORDER CONFIRMED</p><h1>Thank you for your order!</h1><p>Your order has been successfully placed. Neeche complete receipt hai.</p><div className="receipt-number">Order #{receipt.orderNumber}</div></div>
            <section className="receipt-card">
              <div className="receipt-card-head"><div><p className="eyebrow">HAFIZ MART</p><h2>Order Receipt</h2></div><div className="receipt-meta"><span>Order Date</span><strong>{new Date(receipt.createdAt).toLocaleString()}</strong></div></div>
              <div className="receipt-info-grid"><div><span>Customer</span><strong>{receipt.customerName}</strong></div><div><span>Phone</span><strong>{receipt.phone}</strong></div><div><span>Email</span><strong>{receipt.email||'—'}</strong></div><div><span>Payment</span><strong>{receipt.paymentMethod}</strong></div><div className="receipt-info-wide"><span>Shipping Address</span><strong>{receipt.shippingAddress}</strong></div><div className="receipt-info-wide"><span>Billing Address</span><strong>{receipt.billingAddress}</strong></div></div>
              <div className="receipt-items">{receipt.items.map(item=><div className="receipt-item" key={item.productId}><div className="receipt-item-main">{item.image?<img src={item.image} alt={item.name || "Hafiz Mart product"}/>:<div className="receipt-item-placeholder"><ShoppingBag size={16}/></div>}<div><strong>{item.name}</strong><span>Qty {item.quantity} × Rs. {item.unitPrice.toLocaleString()}</span></div></div><strong>Rs. {item.lineTotal.toLocaleString()}</strong></div>)}</div>
              <div className="receipt-total-box"><div><span>Subtotal</span><strong>Rs. {receipt.subtotal.toLocaleString()}</strong></div><div><span>Discount</span><strong>- Rs. {receipt.discount.toLocaleString()}</strong></div><div><span>Delivery</span><strong>{receipt.deliveryFee===0?'FREE':`Rs. ${receipt.deliveryFee.toLocaleString()}`}</strong></div><div className="receipt-grand"><span>Grand Total</span><strong>Rs. {receipt.total.toLocaleString()}</strong></div></div>
              <div className="receipt-actions"><button className="gold-btn" onClick={()=>window.print()}><FileText size={16}/> Print / Save Receipt</button><a className="ghost-btn" href={`https://wa.me/${waNumber}?text=${encodeURIComponent(receipt.whatsappText)}`} target="_blank" rel="noreferrer"><MessageCircle size={16}/> Send on WhatsApp</a><Link className="ghost-btn" to="/track-order">Track Order</Link><Link className="ghost-btn" to="/shop">Continue Shopping</Link></div>
            </section>
          </div>
        </div>
      </main>
    );
  }
  if(!cartItems.length){
    return (
      <main className="page container">

        <EmptyState
          title="Cart Empty"
          text="Checkout se pehle cart mein product add karein."
          action="Go to Shop"
          to="/shop"
        />

      </main>
    );
  }

  return (
    <main className="page">

      <div className="container checkout-modern">

        <div className="checkout-header">

          <p className="eyebrow">
            SECURE CHECKOUT
          </p>

          <h1>
            Complete Your Order
          </h1>

          <p className="muted">
            Apni information complete karein aur order place karein.
          </p>

        </div>


      <div className="checkout-steps">

  <div
    className="checkout-progress-line"
    aria-hidden="true"
  >
    <div
      className="checkout-progress-fill"
      style={{
        width: `${((step - 1) / 3) * 100}%`
      }}
    />
  </div>

  {[
    [1,'Contact'],
    [2,'Shipping'],
    [3,'Delivery'],
    [4,'Payment']
  ].map(([number,label])=>(
    <div
      key={number}
      className={
        `checkout-step ${
          step===number?'active':''
        } ${
          step>number?'completed':''
        }`
      }
    >

      <span className="checkout-step-circle">

        {step>number ? (
          <Check size={15}/>
        ) : (
          number
        )}

      </span>

      <strong>
        {label}
      </strong>

    </div>
  ))}

</div>


        <div className="checkout-grid">

          <form
            className="checkout-card"
            onSubmit={submit}
          >

            {/* CONTACT */}

            {step===1 && (
              <section>

                <div className="checkout-section-head">

                  <div>
                    <p className="eyebrow">
                      STEP 1
                    </p>

                    <h2>
                      Contact Information
                    </h2>
                  </div>

                </div>

                <label>
                  Email Address

                  <input
                    type="email"
                    value={form.email}
                    onChange={e=>
                      updateField(
                        'email',
                        e.target.value
                      )
                    }
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </label>

                <p className="checkout-hint">
                  Order confirmation aur important updates ke liye email use hoga.
                </p>

              </section>
            )}


            {/* SHIPPING */}

            {step===2 && (
              <section>

                <div className="checkout-section-head">

                  <div>
                    <p className="eyebrow">
                      STEP 2
                    </p>

                    <h2>
                      Shipping Information
                    </h2>
                  </div>

                </div>


                <div className="checkout-form-grid">

                  <label>
                    First Name

                    <input
                      value={form.firstName}
                      onChange={e=>
                        updateField(
                          'firstName',
                          e.target.value
                        )
                      }
                      placeholder="First name"
                      autoComplete="given-name"
                      required
                    />
                  </label>


                  <label>
                    Last Name

                    <input
                      value={form.lastName}
                      onChange={e=>
                        updateField(
                          'lastName',
                          e.target.value
                        )
                      }
                      placeholder="Last name"
                      autoComplete="family-name"
                      required
                    />
                  </label>


                  <label className="span-2">
                    WhatsApp Number

                    <input
                      value={form.phone}
                      onChange={e=>
                        updateField(
                          'phone',
                          e.target.value
                        )
                      }
                      placeholder="03001234567"
                      autoComplete="tel"
                      inputMode="tel"
                      required
                    />

                    <small>
                      Pakistani WhatsApp number enter karein.
                    </small>
                  </label>


                  <label className="span-2">
                    Address Line 1

                    <input
                      value={form.address1}
                      onChange={e=>
                        updateField(
                          'address1',
                          e.target.value
                        )
                      }
                      placeholder="House / Flat / Street"
                      autoComplete="address-line1"
                      required
                    />
                  </label>


                  <label className="span-2">
                    Address Line 2

                    <input
                      value={form.address2}
                      onChange={e=>
                        updateField(
                          'address2',
                          e.target.value
                        )
                      }
                      placeholder="Apartment, landmark etc. (optional)"
                      autoComplete="address-line2"
                    />
                  </label>


                  <label>
                    Country

                    <select
                      value={form.country}
                      onChange={e=>
                        updateField(
                          'country',
                          e.target.value
                        )
                      }
                    >
                      <option value="Pakistan">
                        Pakistan
                      </option>
                    </select>
                  </label>


                  <label>
                    Province

                    <select
                      value={form.province}
                      onChange={e=>{
                        updateField(
                          'province',
                          e.target.value
                        );

                        updateField(
                          'city',
                          ''
                        );
                      }}
                      required
                    >
                      <option value="">
                        Select province
                      </option>

                      {Object.keys(provinces).map(
                        province=>(
                          <option
                            key={province}
                            value={province}
                          >
                            {province}
                          </option>
                        )
                      )}

                    </select>
                  </label>


                  <label>
                    City

                    <select
                      value={form.city}
                      onChange={e=>
                        updateField(
                          'city',
                          e.target.value
                        )
                      }
                      disabled={!form.province}
                      required
                    >

                      <option value="">
                        {form.province
                          ? 'Select city'
                          : 'Select province first'
                        }
                      </option>

                      {(provinces[form.province]||[])
                        .map(city=>(
                          <option
                            key={city}
                            value={city}
                          >
                            {city}
                          </option>
                        ))
                      }

                    </select>

                    {form.city && (
                      <small>
                        Delivery charges: {
                          form.city.toLowerCase()==='multan'
                            ? 'Rs. 270'
                            : 'Rs. 300'
                        }
                      </small>
                    )}

                  </label>


                  <label>
                    Postal Code

                    <input
                      value={form.postalCode}
                      onChange={e=>
                        updateField(
                          'postalCode',
                          e.target.value
                        )
                      }
                      placeholder="60000"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      required
                    />
                  </label>

                </div>

              </section>
            )}


            {/* DELIVERY */}

            {step===3 && (
              <section>

                <div className="checkout-section-head">

                  <div>
                    <p className="eyebrow">
                      STEP 3
                    </p>

                    <h2>
                      Delivery
                    </h2>
                  </div>

                </div>


                <label
                  className={`checkout-choice ${
                    deliveryMethod==='standard'
                      ? 'selected'
                      : ''
                  }`}
                >

                  <input
                    type="radio"
                    name="delivery"
                    value="standard"
                    checked={
                      deliveryMethod==='standard'
                    }
                    onChange={e=>
                      setDeliveryMethod(
                        e.target.value
                      )
                    }
                  />

                  <div>

                    <strong>
                      Standard Shipping
                    </strong>

                    <span>
                      {form.city
                        ? `${form.city} delivery — Rs. ${deliveryFee}`
                        : 'City ke hisaab se delivery charges calculate honge.'
                      }
                    </span>

                  </div>

                  <b>
                    Rs. {deliveryFee}
                  </b>

                </label>

              </section>
            )}


            {/* PAYMENT */}

            {step===4 && (
              <section>

                <div className="checkout-section-head">

                  <div>
                    <p className="eyebrow">
                      STEP 4
                    </p>

                    <h2>
                      Payment
                    </h2>
                  </div>

                </div>


                {/* COD */}

                <label
                  className={`checkout-choice ${
                    paymentMethod==='cod'
                      ? 'selected'
                      : ''
                  }`}
                >

                  <input
                    type="radio"
                    name="paymentMethod"
                    value="cod"
                    checked={
                      paymentMethod==='cod'
                    }
                    onChange={e=>
                      setPaymentMethod(
                        e.target.value
                      )
                    }
                    required
                  />

                  <div>

                    <strong>
                      Cash on Delivery
                    </strong>

                    <span>
                      Order receive karte waqt cash payment karein.
                    </span>

                  </div>

                </label>


                {/* CARD */}

                <label
                  className={`checkout-choice ${
                    paymentMethod==='card'
                      ? 'selected'
                      : ''
                  } ${!cardPaymentsEnabled ? 'disabled' : ''}`}
                  aria-disabled={!cardPaymentsEnabled}
                >

                  <input
                    type="radio"
                    name="paymentMethod"
                    value="card"
                    checked={
                      paymentMethod==='card'
                    }
                    disabled={!cardPaymentsEnabled}
                    onChange={e=>{
                      setError('');
                      setPaymentMethod(
                        e.target.value
                      );
                    }}
                  />

                  <div>

                    <strong>
                      Debit / Credit Card
                    </strong>

                    <span>
                      {cardPaymentsEnabled
                        ? 'Secure card payment.'
                        : 'Online card payment gateway abhi connected nahi hai.'
                      }
                    </span>

                  </div>

                  {!cardPaymentsEnabled && (
                    <small className="payment-gateway-status">
                      Unavailable
                    </small>
                  )}

                </label>

                {!cardPaymentsEnabled && (
                  <div className="payment-gateway-notice">
                    <CreditCard size={17}/>
                    <div>
                      <strong>Card payment setup required</strong>
                      <span>
                        Hafiz Mart mein card payment tabhi process hogi jab
                        payment gateway configure karke Admin → Settings →
                        Payments mein Online payments enable ki jaye.
                      </span>
                    </div>
                  </div>
                )}

                {paymentMethod==='card' && cardPaymentsEnabled && (
                  <div className="card-payment-box">

                    <div className="card-payment-note">
                      Card details gateway ke secure payment flow mein process honi chahiye. Hafiz Mart database mein raw card number ya CVV save nahi kiya jayega.
                    </div>

                    <div className="checkout-form-grid">

                      <label className="span-2">
                        Cardholder Name

                        <input
                          value={card.name}
                          onChange={e=>
                            setCard(c=>({
                              ...c,
                              name:e.target.value
                            }))
                          }
                          placeholder="Name on card"
                          autoComplete="cc-name"
                        />
                      </label>


                      <label className="span-2">
                        Card Number

                        <input
                          value={card.number}
                          onChange={e=>
                            setCard(c=>({
                              ...c,
                              number:formatCardNumber(
                                e.target.value
                              )
                            }))
                          }
                          placeholder="1234 5678 9012 3456"
                          inputMode="numeric"
                          autoComplete="cc-number"
                          maxLength={19}
                        />
                      </label>


                      <label>
                        Expiry Date

                        <input
                          value={card.expiry}
                          onChange={e=>
                            setCard(c=>({
                              ...c,
                              expiry:formatExpiry(
                                e.target.value
                              )
                            }))
                          }
                          placeholder="MM/YY"
                          inputMode="numeric"
                          autoComplete="cc-exp"
                          maxLength={5}
                        />
                      </label>


                      <label>
                        CVV

                        <input
                          type="password"
                          value={card.cvv}
                          onChange={e=>
                            setCard(c=>({
                              ...c,
                              cvv:e.target.value
                                .replace(/\D/g,'')
                                .slice(0,4)
                            }))
                          }
                          placeholder="CVV"
                          inputMode="numeric"
                          autoComplete="cc-csc"
                          maxLength={4}
                        />
                      </label>

                    </div>

                  </div>
                )}


                {/* BILLING */}

                <div className="billing-box">

                  <div className="billing-head">

                    <div>
                      <strong>
                        Billing Address
                      </strong>

                      <span>
                        Payment billing details.
                      </span>
                    </div>

                  </div>


                  <label className="billing-option">

                    <input
                      type="radio"
                      name="billingAddress"
                      checked={billingSame}
                      onChange={()=>
                        setBillingSame(true)
                      }
                    />

                    <span>
                      Same as shipping address
                    </span>

                  </label>


                  <label className="billing-option">

                    <input
                      type="radio"
                      name="billingAddress"
                      checked={!billingSame}
                      onChange={()=>
                        setBillingSame(false)
                      }
                    />

                    <span>
                      Use a different billing address
                    </span>

                  </label>


                  {!billingSame && (
                    <div className="billing-form">

                      <div className="billing-form-title">
                        <strong>
                          Enter your new address
                        </strong>

                        <span>
                          Enter the address you want to use for billing.
                        </span>
                      </div>


                      <label>
                        Billing Address Line 1

                        <input
                          value={billing.address1}
                          onChange={e=>
                            updateBilling(
                              'address1',
                              e.target.value
                            )
                          }
                          placeholder="House / Flat / Street"
                          autoComplete="billing address-line1"
                        />
                      </label>


                      <label>
                        Billing Address Line 2

                        <input
                          value={billing.address2}
                          onChange={e=>
                            updateBilling(
                              'address2',
                              e.target.value
                            )
                          }
                          placeholder="Apartment, landmark etc. (optional)"
                          autoComplete="billing address-line2"
                        />
                      </label>


                      <div className="checkout-form-grid">

                        <label>
                          Billing Country

                          <select
                            value={billing.country}
                            onChange={e=>
                              updateBilling(
                                'country',
                                e.target.value
                              )
                            }
                          >
                            <option value="Pakistan">
                              Pakistan
                            </option>
                          </select>
                        </label>


                        <label>
                          Billing Province

                          <select
                            value={billing.province}
                            onChange={e=>{
                              updateBilling(
                                'province',
                                e.target.value
                              );

                              updateBilling(
                                'city',
                                ''
                              );
                            }}
                          >

                            <option value="">
                              Select province
                            </option>

                            {Object.keys(provinces)
                              .map(province=>(
                                <option
                                  key={province}
                                  value={province}
                                >
                                  {province}
                                </option>
                              ))
                            }

                          </select>
                        </label>


                        <label>
                          Billing City

                          <select
                            value={billing.city}
                            onChange={e=>
                              updateBilling(
                                'city',
                                e.target.value
                              )
                            }
                            disabled={!billing.province}
                          >

                            <option value="">
                              {billing.province
                                ? 'Select city'
                                : 'Select province first'
                              }
                            </option>

                            {(provinces[billing.province]||[])
                              .map(city=>(
                                <option
                                  key={city}
                                  value={city}
                                >
                                  {city}
                                </option>
                              ))
                            }

                          </select>

                        </label>


                        <label>
                          Billing Postal Code

                          <input
                            value={billing.postalCode}
                            onChange={e=>
                              updateBilling(
                                'postalCode',
                                e.target.value
                              )
                            }
                            placeholder="60000"
                            inputMode="numeric"
                            autoComplete="billing postal-code"
                          />
                        </label>

                      </div>

                    </div>
                  )}

                </div>


                {/* COUPON */}

                <div className="coupon-box">

                  <div>
                    <strong>
                      Have a coupon?
                    </strong>

                    <span>
                      Discount code apply karein.
                    </span>
                  </div>


                  <div className="coupon-row">

                    <input
                      value={couponCode}
                      onChange={e=>{
                        setCouponCode(
                          e.target.value.toUpperCase()
                        );

                        setCoupon(null);
                        setCouponError('');
                      }}
                      placeholder="e.g. SAVE10"
                    />

                    <button
                      type="button"
                      className="coupon-apply-btn"
                      disabled={couponBusy}
                      onClick={applyCoupon}
                    >
                      {couponBusy
                        ? 'Checking...'
                        : 'Apply'
                      }
                    </button>

                  </div>


                  {coupon && (
                    <div className="coupon-success">

                      <Check size={15}/>

                      {coupon.code} applied —
                      Rs. {coupon.discount.toLocaleString()} off

                    </div>
                  )}


                  {couponError && (
                    <div className="coupon-error">

                      <Tag size={14}/>

                      {couponError}

                    </div>
                  )}

                </div>

              </section>
            )}


            {error && (
              <div className="error-box">
                {error}
              </div>
            )}


            <div className="checkout-actions">

              {step>1 && (
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={previousStep}
                  disabled={busy}
                >
                  Back
                </button>
              )}


              {step<4 ? (

                <button
                  type="button"
                  className="gold-btn"
                  onClick={nextStep}
                >
                  Continue
                  <ArrowRight size={17}/>
                </button>

              ) : (

                <button
                  className="gold-btn"
                  type="submit"
                  disabled={
                    busy ||
                    !paymentMethod ||
                    (paymentMethod==='card' && !cardPaymentsEnabled)
                  }
                >
                  {busy
                    ? 'Placing Order...'
                    : 'Place Order'
                  }

                  <Check size={17}/>

                </button>

              )}

            </div>

          </form>


          {/* ORDER SUMMARY */}

          <aside className="summary checkout-summary">

            <p className="eyebrow">
              YOUR ORDER
            </p>

            <h2>
              Summary
            </h2>


            <div className="checkout-products">

              {cartItems.map(x=>(
                <div
                  key={x.index}
                  className="mini-line"
                >

                  <span>
                    {x.product.name} × {x.qty}
                  </span>

                  <strong>
                    Rs. {
                      (
                        Number(
                          x.product.salePrice||
                          x.product.price
                        )*x.qty
                      ).toLocaleString()
                    }
                  </strong>

                </div>
              ))}

            </div>


            <div>
              <span>
                Subtotal
              </span>

              <strong>
                Rs. {subtotal.toLocaleString()}
              </strong>
            </div>


            <div>
              <span>
                Discount
              </span>

              <strong
                className={
                  discount
                    ? 'discount-text'
                    : ''
                }
              >
                {discount
                  ? `- Rs. ${discount.toLocaleString()}`
                  : 'Rs. 0'
                }
              </strong>
            </div>


            <div>
              <span>
                Delivery
              </span>

              <strong>
                Rs. {deliveryFee.toLocaleString()}
              </strong>
            </div>


            <div className="summary-total">

              <span>
                Total
              </span>

              <strong>
                Rs. {total.toLocaleString()}
              </strong>

            </div>

          </aside>

        </div>

      </div>

    </main>
  );
}

function Account(){
  const { user, profile, refreshProfile, signOut }=useAuth();
  const [orders,setOrders]=useState([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");

  const [form,setForm]=useState({
    full_name:profile?.full_name||"",
    phone:profile?.phone||""
  });

  useEffect(()=>{
    setForm({
      full_name:profile?.full_name||"",
      phone:profile?.phone||""
    })
  },[profile]);

  useEffect(()=>{
    if(!user){
      setLoading(false);
      return;
    }

    (async()=>{
      const {data,error}=await supabase
        .from('orders')
        .select('*')
        .eq('user_id',user.id)
        .order('created_at',{ascending:false});

      if(error) console.error(error);
      else setOrders(data||[]);

      setLoading(false);
    })()
  },[user]);

  const saveProfile=async e=>{
    e.preventDefault();
    setSaving(true);
    setMessage('');

    const {error}=await supabase
      .from('profiles')
      .update({
        full_name:form.full_name.trim(),
        phone:form.phone.trim()
      })
      .eq('id',user.id);

    if(error){
      setMessage(error.message);
    }else{
      setMessage('Profile update ho gaya.');
      refreshProfile();
    }

    setSaving(false)
  };

  if (!user) return (
    <main className="page container account-login-page">
      <section className="account-login-panel" aria-labelledby="account-login-title">
        <div className="account-login-glow" aria-hidden="true" />

        <div className="account-login-icon">
          <User size={29} strokeWidth={1.7} />
        </div>

        <p className="eyebrow">YOUR HAFIZ MART ACCOUNT</p>
        <h1 id="account-login-title">
          Your Shopping Journey <span>Starts Here</span>
        </h1>
        <p className="account-login-copy">
          Sign in to manage your orders, track deliveries and enjoy a personalized shopping experience.
        </p>

        <div className="account-login-actions">
          <Link className="gold-btn account-login-primary" to="/login">
            <User size={17} />
            Sign In to Your Account
            <ArrowRight size={17} />
          </Link>
          <Link className="account-register-link" to="/login?mode=register">
            New to Hafiz Mart? <strong>Create an Account</strong>
          </Link>
        </div>

        <div className="account-login-benefits">
          <span><ShieldCheck size={16} /> Secure Login</span>
          <span><Package size={16} /> Order Tracking</span>
        </div>
      </section>
    </main>
  );

  return (
    <main className="page">
      <div className="container">

        <div className="page-head">
          <div>
            <p className="eyebrow">MY ACCOUNT</p>
            <h1>{profile?.full_name||'Account'}</h1>
            <p>{user.email}</p>
          </div>

          <div className="account-head-actions">
            {profile?.role === 'admin' && <Link className="gold-btn account-admin-dashboard" to="/admin"><LayoutDashboard size={16}/> Admin Dashboard <ArrowRight size={15}/></Link>}
            <button type="button" className="logout-btn" onClick={async ()=>{await signOut();}}><LogOut size={16}/> Logout</button>
          </div>
        </div>

        <div className="account-grid">

          <section className="form-card">
            <div className="panel-head-row">
              <div>
                <p className="eyebrow">PROFILE</p>
                <h2>Your details</h2>
              </div>
              <User size={20}/>
            </div>

            <form onSubmit={saveProfile}>
              <label>
                Full Name
                <input
                  value={form.full_name}
                  onChange={e=>setForm({
                    ...form,
                    full_name:e.target.value
                  })}
                  placeholder="Your name"
                />
              </label>

              <label>
                Phone
                <input
                  value={form.phone}
                  onChange={e=>setForm({
                    ...form,
                    phone:e.target.value
                  })}
                  placeholder="03xx..."
                />
              </label>

              <label>
                Email
                <input
                  value={user.email||''}
                  disabled
                />
              </label>

              <button
                className="gold-btn"
                disabled={saving}
              >
                {saving?'Saving...':'Save Profile'}
              </button>

              {message&&(
                <p className="review-message">
                  {message}
                </p>
              )}
            </form>
          </section>

          <section>

            {/* ORDER TRACKER */}
            <div className="account-track-card">
              <div>
                <p className="eyebrow">ORDER TRACKING</p>
                <h2>Track Your Order</h2>
                <p>
                  Apna order number enter karke latest order status aur delivery progress dekhein.
                </p>
              </div>

              <div className="account-track-actions">
                <Link className="gold-btn" to="/track-order">Track Order <ArrowRight size={17}/></Link>
                <Link className="support-btn" to="/complaints"><MessageSquare size={16}/> Complaints & Support</Link>
                <Link className="ghost-btn" to="/notifications"><Bell size={16}/> Notifications</Link>
              </div>
            </div>

            {/* ORDER HISTORY */}
            <div className="section-heading">
              <div>
                <p className="eyebrow">ORDERS</p>
                <h2>Order History</h2>
              </div>

              <Link
                className="text-link"
                to="/shop"
              >
                Shop more
                <ArrowRight size={15}/>
              </Link>
            </div>

            {loading ? (
              <div className="mini-empty">
                Orders load ho rahe hain...
              </div>
            ) : orders.length ? (
              <div className="account-orders">
                {orders.map(o=>(
                  <div
                    className="account-order"
                    key={o.id}
                  >
                    <div>
                      <strong>
                        {o.order_number||o.id.slice(0,8)}
                      </strong>

                      <span>
                        {new Date(
                          o.created_at
                        ).toLocaleString()}
                      </span>
                    </div>

                    <div>
                      <b>
                        Rs. {Number(
                          o.total||0
                        ).toLocaleString()}
                      </b>

                      <em
                        className={`status status-${o.status}`}
                      >
                        {String(
                          o.status||'pending'
                        ).replaceAll('_',' ')}
                      </em>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No Orders Yet"
                text="Aapki placed orders yahan appear hongi."
                action="Start Shopping"
                to="/shop"
                icon={ShoppingCart}
              />
            )}

          </section>

        </div>
      </div>
    </main>
  );
}
function OrderTracker() {
  const { user } = useAuth();

  const [orderNumber, setOrderNumber] = useState("");
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const statuses = [
    "pending",
    "confirmed",
    "packed",
    "shipped",
    "out_for_delivery",
    "delivered"
  ];

  const statusLabels = {
    pending: "Order Placed",
    confirmed: "Confirmed",
    packed: "Packed",
    shipped: "Shipped",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered"
  };

  const trackOrder = async (e) => {
    e.preventDefault();

    if (!user) {
      setError("Order track karne ke liye pehle login karein.");
      return;
    }

    const number = orderNumber.trim();

    if (!number) {
      setError("Order number enter karein.");
      return;
    }

    setLoading(true);
    setError("");
    setOrder(null);
    setItems([]);

    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", user.id)
      .eq("order_number", number)
      .maybeSingle();

    if (orderError) {
      setError(orderError.message);
      setLoading(false);
      return;
    }

    if (!orderData) {
      setError(
        "Is order number ka order aapke account mein nahi mila."
      );
      setLoading(false);
      return;
    }

    const { data: itemData, error: itemError } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderData.id)
      .order("created_at", { ascending: true });

    if (itemError) {
      setError(itemError.message);
    } else {
      setOrder(orderData);
      setItems(itemData || []);
    }

    setLoading(false);
  };

  const currentStatus = order?.status || "pending";

  const currentIndex =
    statuses.indexOf(currentStatus);

  return (
    <main className="page">
      <div className="container">

        <div className="page-head">
          <div>
            <p className="eyebrow">ORDER TRACKING</p>
            <h1>Track Your Order</h1>
            <p>
              Apne order ka latest status aur details yahan dekhein.
            </p>
          </div>
        </div>

        {!user ? (
          <EmptyState
            title="Login Required"
            text="Apne orders securely track karne ke liye customer account mein login karein."
            action="Login"
            to="/login"
            icon={ShoppingCart}
          />
        ) : (
          <>
            <section className="track-order-card">

              <form
                className="track-order-form"
                onSubmit={trackOrder}
              >
                <label>
                  Order Number
                  <input
                    value={orderNumber}
                    onChange={(e) =>
                      setOrderNumber(e.target.value)
                    }
                    placeholder="e.g. HM-123456"
                  />
                </label>

                <button
                  className="gold-btn"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? "Checking..." : "Track Order"}
                  <ArrowRight size={17} />
                </button>
              </form>

              {error && (
                <div className="track-order-error">
                  {error}
                </div>
              )}

            </section>

            {order && (
              <section className="track-order-result">

                <div className="track-order-head">
                  <div>
                    <p className="eyebrow">ORDER</p>
                    <h2>
                      {order.order_number ||
                        order.id.slice(0, 8)}
                    </h2>
                    <span>
                      {new Date(
                        order.created_at
                      ).toLocaleString()}
                    </span>
                  </div>

                  <strong className="track-order-total">
                    Rs.{" "}
                    {Number(
                      order.total || 0
                    ).toLocaleString()}
                  </strong>
                </div>

                {currentStatus === "cancelled" ? (
                  <div className="track-cancelled">
                    <strong>Order Cancelled</strong>
                    <span>
                      Ye order cancel kar diya gaya hai.
                    </span>
                  </div>
                ) : (
                  <div className="track-timeline">

                    {statuses.map((status, index) => {
                      const done =
                        currentIndex >= index;

                      const active =
                        currentStatus === status;

                      return (
                        <div
                          className={`track-step ${
                            done ? "done" : ""
                          } ${
                            active ? "active" : ""
                          }`}
                          key={status}
                        >
                          <div className="track-step-dot">
                            {done ? "✓" : index + 1}
                          </div>

                          <div>
                            <strong>
                              {statusLabels[status]}
                            </strong>

                            {active && (
                              <span>
                                Current status
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                  </div>
                )}

                <div className="track-order-info">

                  <div>
                    <span>Customer</span>
                    <strong>
                      {order.customer_name ||
                        "Customer"}
                    </strong>
                  </div>

                  <div>
                    <span>Phone</span>
                    <strong>
                      {order.phone || "—"}
                    </strong>
                  </div>

                  <div>
                    <span>City</span>
                    <strong>
                      {order.city || "—"}
                    </strong>
                  </div>

                  <div>
                    <span>Payment</span>
                    <strong>
                      {String(
                        order.payment_method ||
                        "cod"
                      ).toUpperCase()}
                    </strong>
                  </div>

                </div>

                <div className="track-items">

                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">
                        ORDER ITEMS
                      </p>
                      <h2>Items</h2>
                    </div>
                  </div>

                  {items.length ? (
                    <div className="track-item-list">
                      {items.map((item) => (
                        <div
                          className="track-item"
                          key={item.id}
                        >
                          <div>
                            <strong>
                              {item.product_name ||
                                "Product"}
                            </strong>

                            <span>
                              Quantity:{" "}
                              {item.quantity}
                            </span>
                          </div>

                          <strong>
                            Rs.{" "}
                            {(
                              Number(
                                item.unit_price || 0
                              ) *
                              Number(
                                item.quantity || 0
                              )
                            ).toLocaleString()}
                          </strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mini-empty">
                      Order items available nahi hain.
                    </div>
                  )}

                </div>

                <div className="track-breakdown">
                  <div>
                    <span>Subtotal</span>
                    <strong>
                      Rs.{" "}
                      {Number(
                        order.subtotal || 0
                      ).toLocaleString()}
                    </strong>
                  </div>

                  <div>
                    <span>Discount</span>
                    <strong>
                      Rs.{" "}
                      {Number(
                        order.discount || 0
                      ).toLocaleString()}
                    </strong>
                  </div>

                  <div>
                    <span>Delivery</span>
                    <strong>
                      Rs.{" "}
                      {Number(
                        order.delivery_fee || 0
                      ).toLocaleString()}
                    </strong>
                  </div>

                  <div className="track-total">
                    <span>Total</span>
                    <strong>
                      Rs.{" "}
                      {Number(
                        order.total || 0
                      ).toLocaleString()}
                    </strong>
                  </div>
                </div>

              </section>
            )}
          </>
        )}

      </div>
    </main>
  );
}
function Login() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState(() =>
    new URLSearchParams(location.search).get("mode") === "register"
      ? "register"
      : "login"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (user && profile) {
      navigate(
        profile.role === "admin"
          ? "/admin"
          : "/account"
      );
    }
  }, [user, profile, navigate]);

  const submit = async (e) => {
    e.preventDefault();

    setBusy(true);
    setError("");
    setMessage("");

    const cleanEmail = email.trim().toLowerCase();

    const result =
      mode === "login"
        ? await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password
          })
        : await supabase.auth.signUp({
            email: cleanEmail,
            password,
            options: {
              data: {
                full_name: name.trim()
              },
              emailRedirectTo:
                `${window.location.origin}${window.location.pathname}?auth=confirmed#/`
            }
          });

    if (result.error) {

      if (mode === "login") {

        setError(
          "Email ya password ghalat hai. Apni details check karein ya naya account create karein."
        );

      } else {

        const errorMessage =
          String(result.error.message || "")
            .toLowerCase();

        if (
          errorMessage.includes("already registered") ||
          errorMessage.includes("already been registered") ||
          errorMessage.includes("user already registered")
        ) {
          setError(
            "Ye email pehle se registered hai. Login karein ya doosra email use karein."
          );
        } else if (
          errorMessage.includes("password")
        ) {
          setError(
            "Password kam az kam 6 characters ka hona chahiye."
          );
        } else {
          setError(
            "Account create nahi ho saka. Details check karke dobara try karein."
          );
        }
      }

    } else if (
      mode === "register" &&
      !result.data.session
    ) {

      setMessage(
        "Account create ho gaya. Agar email confirmation enabled hai to apni email confirm karein."
      );

    } else if (mode === "login") {

      setMessage(
        "Login successful. Aapka account open ho raha hai..."
      );
    }

    setBusy(false);
  };

  return (
    <main className="auth-page">

      <div className="auth-card">

        <img
          src={logo}
          alt="Hafiz Mart"
        />

        <p className="eyebrow">
          ACCOUNT
        </p>

        <h1>
          {mode === "login"
            ? "Login to your account"
            : "Create account"}
        </h1>

        <p className="muted">
          {mode === "login"
            ? "Apne Hafiz Mart account mein sign in karein."
            : "Hafiz Mart par apna account create karein."}
        </p>

        {mode === "register" && (
          <label>
            Full Name

            <input
              value={name}
              onChange={(e) =>
                setName(e.target.value)
              }
              required
            />
          </label>
        )}

        <label>
          Email

          <input
            type="email"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
            required
          />
        </label>

        <label>
          Password

          <div className="password-wrap">

            <input
              type={
                showPassword
                  ? "text"
                  : "password"
              }
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              required
              minLength={6}
            />

            <button
              type="button"
              className="password-toggle"
              onClick={() =>
                setShowPassword(!showPassword)
              }
              aria-label={
                showPassword
                  ? "Hide password"
                  : "Show password"
              }
            >
              {showPassword ? (
                <EyeOff size={16} />
              ) : (
                <Eye size={16} />
              )}
            </button>

          </div>
        </label>

        {error && (
          <p
            className="muted"
            style={{
              color: "#d66"
            }}
          >
            {error}
          </p>
        )}

        {message && (
          <p className="muted">
            {message}
          </p>
        )}

        <button
          className="gold-btn full"
          type="button"
          disabled={busy}
          onClick={submit}
        >
          {busy
            ? "Please wait..."
            : mode === "login"
            ? "Login"
            : "Create Account"}

          <ArrowRight size={17} />
        </button>

        <button
          className="text-link center"
          type="button"
          onClick={() => {
            setMode(
              mode === "login"
                ? "register"
                : "login"
            );

            setError("");
            setMessage("");
          }}
        >
          {mode === "login"
            ? "Create a new account"
            : "Already have an account? Login"}
        </button>

        <Link
          className="text-link center"
          to="/"
        >
          Back to store
        </Link>

      </div>

    </main>
  );
}

function ForgotPassword(){
  const [email,setEmail]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');

  const submit=async e=>{
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');

    const redirectTo =
  `${window.location.origin}${window.location.pathname}?reset=1#/reset-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo
    });

    if(error){
      setError(error.message);
    }else{
      setMessage(
        'Password reset link aapke email par bhej diya gaya hai. Inbox ke saath spam/junk folder bhi check karein.'
      );
    }

    setBusy(false);
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <img src={logo} alt="Hafiz Mart"/>

        <p className="eyebrow">ACCOUNT RECOVERY</p>

        <h1>Forgot Password?</h1>

        <p className="muted">
          Apna account email enter karein. Hum aapko password reset link bhej denge.
        </p>

        <form onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={e=>setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>

          {error && (
            <p className="muted" style={{color:'#d66'}}>
              {error}
            </p>
          )}

          {message && (
            <p className="muted">
              {message}
            </p>
          )}

          <button
            className="gold-btn full"
            type="submit"
            disabled={busy}
          >
            {busy ? 'Please wait...' : 'Send Reset Link'}
            <ArrowRight size={17}/>
          </button>
        </form>

        <Link className="text-link center" to="/login">
          Back to Login
        </Link>

        <Link className="text-link center" to="/">
          Back to store
        </Link>
      </div>
    </main>
  );
}
function ResetPassword(){
  const [password,setPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [showConfirm,setShowConfirm]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');

  const submit=async e=>{
    e.preventDefault();

    setError('');
    setMessage('');

    if(password.length < 6){
      setError('Password kam az kam 6 characters ka hona chahiye.');
      return;
    }

    if(password !== confirmPassword){
      setError('Passwords match nahi kar rahe.');
      return;
    }

    setBusy(true);

    const { error } = await supabase.auth.updateUser({
      password
    });

    if(error){
      setError(error.message);
    }else{
      setMessage(
        'Password successfully update ho gaya. Ab aap naye password se login kar sakte hain.'
      );
      setPassword('');
      setConfirmPassword('');
    }

    setBusy(false);
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <img src={logo} alt="Hafiz Mart"/>

        <p className="eyebrow">ACCOUNT RECOVERY</p>

        <h1>Reset Password</h1>

        <p className="muted">
          Apna naya password set karein.
        </p>

        <form onSubmit={submit}>
          <label>
            New Password

            <div className="password-wrap">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e=>setPassword(e.target.value)}
                minLength={6}
                required
              />

              <button
                type="button"
                className="password-toggle"
                onClick={()=>setShowPassword(!showPassword)}
                aria-label={
                  showPassword ? "Hide password" : "Show password"
                }
              >
                {showPassword
                  ? <EyeOff size={16}/>
                  : <Eye size={16}/>
                }
              </button>
            </div>
          </label>

          <label>
            Confirm Password

            <div className="password-wrap">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={e=>setConfirmPassword(e.target.value)}
                minLength={6}
                required
              />

              <button
                type="button"
                className="password-toggle"
                onClick={()=>setShowConfirm(!showConfirm)}
                aria-label={
                  showConfirm ? "Hide password" : "Show password"
                }
              >
                {showConfirm
                  ? <EyeOff size={16}/>
                  : <Eye size={16}/>
                }
              </button>
            </div>
          </label>

          {error && (
            <p className="muted" style={{color:'#d66'}}>
              {error}
            </p>
          )}

          {message && (
            <p className="muted">
              {message}
            </p>
          )}

          <button
            className="gold-btn full"
            type="submit"
            disabled={busy}
          >
            {busy ? 'Updating...' : 'Update Password'}
            <ArrowRight size={17}/>
          </button>
        </form>

        <Link className="text-link center" to="/login">
          Back to Login
        </Link>
      </div>
    </main>
  );
}
function AdminLayout({children}){
  const { profile, user, loading, signOut } = useAuth();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const links = [
    ['/admin',LayoutDashboard,'Dashboard','view_dashboard'],
    ['/admin/products',Package,'Products','manage_products'],
    ['/admin/categories',Tag,'Categories','manage_content'],
    ['/admin/banners',Sparkles,'Sale Banners','manage_content'],
    ['/admin/coupons',TicketPercent,'Coupons','manage_marketing'],
    ['/admin/orders',ShoppingCart,'Orders','manage_orders'],
    ['/admin/complaints',MessageSquare,'Complaints','manage_support'],
    ['/admin/customers',Users,'Users','manage_users'],
    ['/admin/reviews',Star,'Reviews','manage_reviews'],
    ['/admin/transactions',DollarSign,'Transactions','view_transactions'],
    ['/admin/reports',BarChart3,'Reports','view_reports'],
    ['/admin/notifications',Bell,'Notifications','view_notifications'],
    ['/admin/settings',Settings,'Settings','manage_settings']
  ];
  const visibleLinks = links.filter(([, , , permission]) => userHasPermission(profile, permission));
  const routePermission = pathname => {
    if(pathname==='/admin') return 'view_dashboard';
    if(pathname.startsWith('/admin/products')) return 'manage_products';
    if(pathname.startsWith('/admin/categories') || pathname.startsWith('/admin/banners')) return 'manage_content';
    if(pathname.startsWith('/admin/coupons')) return 'manage_marketing';
    if(pathname.startsWith('/admin/orders')) return 'manage_orders';
    if(pathname.startsWith('/admin/complaints')) return 'manage_support';
    if(pathname.startsWith('/admin/customers')) return 'manage_users';
    if(pathname.startsWith('/admin/reviews')) return 'manage_reviews';
    if(pathname.startsWith('/admin/transactions')) return 'view_transactions';
    if(pathname.startsWith('/admin/reports')) return 'view_reports';
    if(pathname.startsWith('/admin/notifications')) return 'view_notifications';
    if(pathname.startsWith('/admin/settings')) return 'manage_settings';
    return 'view_dashboard';
  };
  useEffect(()=>{
    if(!user){setUnread(0);return undefined;}
    let active=true;
    const load=async()=>{
      const {count,error}=await supabase.from('notifications').select('id',{count:'exact',head:true}).eq('recipient_user_id',user.id).eq('is_read',false);
      if(active&&!error)setUnread(count||0);
    };
    load();
    const channel=supabase.channel(`admin-notifications-${user.id}`).on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:`recipient_user_id=eq.${user.id}`},load).subscribe();
    return()=>{active=false;supabase.removeChannel(channel)};
  },[user]);
  if(loading) return <main className="page container"><EmptyState title="Loading admin..." text="Authentication aur store data verify ho raha hai."/></main>;
  if(!profile || !visibleLinks.length) return <main className="page container"><EmptyState title="Admin access required" text="Is section ke liye authorized team account chahiye." action="Login" to="/login" icon={User}/></main>;
  const required=routePermission(location.pathname);
  if(!userHasPermission(profile,required)) return <main className="page container"><EmptyState title="Access restricted" text="Aapke current role ke paas is section ki permission nahi hai." action="Back to Dashboard" to="/admin" icon={ShieldCheck}/></main>;
  return <main className="admin-shell"><aside className="admin-sidebar"><Link to="/admin" className="admin-logo"><img src={logo} alt="Hafiz Mart"/></Link><nav>{visibleLinks.map(([to,I,label,permission])=><Link key={to} to={to} className={location.pathname===to?'active':''}><I size={17}/><span>{label}</span>{permission==='view_notifications'&&unread>0&&<b className="admin-notification-badge">{unread>99?'99+':unread}</b>}</Link>)}</nav><Link className="store-link" to="/"><ArrowRight size={15}/> View Store</Link><button className="store-link" onClick={signOut}>Sign out</button></aside><section className="admin-content">{children}</section></main>;
}

function Admin(){
  const {store}=useStore(); const [stats,setStats]=useState({orders:0,customers:0,revenue:0}); const [recent,setRecent]=useState([]);
  useEffect(()=>{ let active=true; (async()=>{ const [orders,customers]=await Promise.all([supabase.from('orders').select('id,total,status,created_at,customer_name,order_number').order('created_at',{ascending:false}),supabase.from('profiles').select('id,role',{count:'exact',head:true}).eq('role','customer')]); if(!active)return; const rows=orders.data||[]; setStats({orders:rows.length,customers:customers.count||0,revenue:rows.filter(o=>o.status!=='cancelled').reduce((n,o)=>n+Number(o.total||0),0)}); setRecent(rows.slice(0,5)); })(); return()=>{active=false}; },[]);
  return <AdminLayout><div className="admin-head"><div><p className="eyebrow">ADMIN PANEL</p><h1>Dashboard</h1><p>Real Supabase-backed Hafiz Mart control center.</p></div><Link className="gold-btn" to="/admin/products/new"><Plus size={17}/> Add Product</Link></div><div className="stats-grid six">{[[Package,'Products',store.products.length,'Live catalog'],[Tag,'Categories',store.categories.length,'Live categories'],[ShoppingCart,'Orders',stats.orders,'Database orders'],[Users,'Customers',stats.customers,'Registered customers'],[Sparkles,'Active Sales',store.banners.length,'Promotional banners'],[ShoppingBag,'Revenue',`Rs. ${stats.revenue.toLocaleString()}`,'Non-cancelled orders']].map(([I,n,v,small],i)=><motion.div className="stat-card" key={n} initial={{opacity:0,y:15}} animate={{opacity:1,y:0}} transition={{delay:i*.04}}><I size={18}/><span>{n}</span><strong>{v}</strong><small>{small}</small></motion.div>)}</div><div className="admin-grid"><div className="panel"><div className="panel-head-row"><div><p className="eyebrow">RECENT ORDERS</p><h2>Latest Activity</h2></div><Link className="text-link" to="/admin/orders">View all <ArrowRight size={15}/></Link></div>{recent.length?<div className="recent-orders">{recent.map(o=><Link to="/admin/orders" className="recent-order" key={o.id}><div><strong>{o.order_number||o.id.slice(0,8)}</strong><span>{o.customer_name||'Customer'} · {new Date(o.created_at).toLocaleString()}</span></div><div><b>Rs. {Number(o.total||0).toLocaleString()}</b><em className={`status status-${o.status}`}>{o.status}</em></div></Link>)}</div>:<div className="mini-empty"><ShoppingCart size={25}/><strong>No orders yet</strong><span>Customer checkout complete hone ke baad orders yahan appear honge.</span></div>}</div><div className="panel"><p className="eyebrow">QUICK START</p><h2>Store Setup</h2><div className="check-row"><span>01</span><div><strong>Add products</strong><small>Real catalog items with images and stock.</small></div><Link to="/admin/products"><ChevronRight size={16}/></Link></div><div className="check-row"><span>02</span><div><strong>Manage orders</strong><small>Confirm, pack, ship and deliver customer orders.</small></div><Link to="/admin/orders"><ChevronRight size={16}/></Link></div><div className="check-row"><span>03</span><div><strong>Create a sale</strong><small>Publish promotional banners from admin.</small></div><Link to="/admin/banners"><ChevronRight size={16}/></Link></div></div></div></AdminLayout>;
}

function AdminProducts(){ const {store,refresh}=useStore(); const remove=async id=>{if(!confirm('Delete this product?'))return; const {error}=await supabase.from('products').delete().eq('id',id); if(error) alert(error.message); else refresh();}; return <AdminLayout><div className="admin-head"><div><p className="eyebrow">CATALOG</p><h1>Products</h1><p>{store.products.length} product(s) in your Supabase catalog.</p></div><Link className="gold-btn" to="/admin/products/new"><Plus size={17}/> Add Product</Link></div>{store.products.length?<div className="admin-table"><div className="table-head"><span>Product</span><span>Category</span><span>Price</span><span>Stock</span><span>Actions</span></div>{store.products.map(p=><div className="table-row" key={p.id}><div className="table-product"><img src={p.image||logo} alt={p.name || "Hafiz Mart product"}/><strong>{p.name}</strong><small>{p.sku||"No SKU"}</small></div><span>{store.categories.find(c=>c.id===p.categoryId)?.name||"—"}</span><span>Rs. {Number(p.salePrice||p.price||0).toLocaleString()}</span><span>{p.stock||0}</span><div className="row-actions"><Link to={`/admin/products/${p.id}/edit`} aria-label={`Edit ${p.name}`} title="Edit product"><Pencil aria-hidden="true" size={15}/></Link><button type="button" onClick={()=>remove(p.id)} aria-label={`Delete ${p.name}`} title="Delete product"><Trash2 aria-hidden="true" size={15}/></button></div></div>)}</div>:<EmptyState title="No Products Yet" text="Aapka database catalog abhi empty hai. Apna pehla product add karein." action="Add First Product" to="/admin/products/new" icon={Package}/>}</AdminLayout>; }

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

function ProductForm(){ const {id}=useParams(); const {store,refresh}=useStore(); const editing=Boolean(id); const existing=store.products.find(p=>p.id===id); const [form,setForm]=useState({name:'',sku:'',categoryId:'',brand:'',shortDescription:'',description:'',price:'',salePrice:'',stock:'',status:'active'}); const [images,setImages]=useState([]); const [busy,setBusy]=useState(false); const navigate=useNavigate(); useEffect(()=>{if(existing){let gallery=Array.isArray(existing.images)?existing.images:[];if(existing.image&&!gallery.includes(existing.image))gallery=[existing.image,...gallery];setForm({name:existing.name||'',sku:existing.sku||'',categoryId:existing.categoryId||'',brand:existing.brand||'',shortDescription:existing.shortDescription||'',description:existing.description||'',price:existing.price||'',salePrice:existing.salePrice||'',stock:existing.stock||0,status:existing.status||'active'});setImages(gallery)}},[existing]); const submit=async e=>{e.preventDefault();setBusy(true); const cleanImages=images.filter(Boolean); const slug=(form.name||'product').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')+'-'+(id||crypto.randomUUID().slice(0,8)); const payload={name:form.name,slug,sku:form.sku||null,category_id:form.categoryId||null,brand:form.brand||null,short_description:form.shortDescription||null,description:form.description||null,price:Number(form.price||0),sale_price:form.salePrice?Number(form.salePrice):null,stock_quantity:Number(form.stock||0),main_image:cleanImages[0]||null,images:cleanImages,status:form.status}; const result=editing?await supabase.from('products').update(payload).eq('id',id).select().single():await supabase.from('products').insert(payload).select().single(); if(result.error) alert(result.error.message); else {await refresh();navigate('/admin/products');} setBusy(false);}; return <AdminLayout><div className="admin-head"><div><p className="eyebrow">CATALOG</p><h1>{editing?'Edit Product':'Add Product'}</h1><p>Product data ab directly Supabase database mein save hogi.</p></div></div><form className="admin-form" onSubmit={submit}><div className="form-grid"><label>Product Name*<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>SKU<input value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})}/></label><label>Category<select value={form.categoryId} onChange={e=>setForm({...form,categoryId:e.target.value})}><option value="">Select category</option>{store.categories.map(c=>{const parent=store.categories.find(item=>String(item.id)===String(c.parent_category_id||''));return <option key={c.id} value={c.id}>{parent?`${parent.name} / ${c.name}`:`${c.name} — Main category`}</option>})}</select></label><label>Brand<input value={form.brand} onChange={e=>setForm({...form,brand:e.target.value})}/></label><label>Price*<input required type="number" min="0" value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></label><label>Sale Price<input type="number" min="0" value={form.salePrice} onChange={e=>setForm({...form,salePrice:e.target.value})}/></label><label>Stock<input type="number" min="0" value={form.stock} onChange={e=>setForm({...form,stock:e.target.value})}/></label><label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label><ProductImageUploader images={images} setImages={setImages}/><label className="span-2">Short Description<textarea rows="3" value={form.shortDescription} onChange={e=>setForm({...form,shortDescription:e.target.value})}/></label><label className="span-2">Full Description<textarea rows="7" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label></div><div className="form-actions"><Link className="ghost-btn" to="/admin/products">Cancel</Link><button className="gold-btn" type="submit" disabled={busy}>{busy?'Saving...':editing?'Save Changes':'Create Product'}</button></div></form></AdminLayout>; }

function AdminCategories() {
  const { store, refresh } = useStore();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('main');
  const [parentId, setParentId] = useState('');
  const [busy, setBusy] = useState(false);
  const mainCategories = sortMainCategories(store.categories);
  const slugify = (value = '') => value.toLowerCase().trim().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const legacySectionFor = value => {
    const normalized = String(value || '').toLowerCase();
    if (/women|ladies/.test(normalized)) return 'women';
    if (/men|gents/.test(normalized)) return 'men';
    if (/fragrance|perfume|attar|scent/.test(normalized)) return 'fragrances';
    return 'other';
  };

  const add = async e => {
    e.preventDefault();
    const cleanName = name.trim();
    const slug = slugify(cleanName);
    if (!cleanName || !slug) { alert('Valid category name enter karein.'); return; }
    if (kind === 'subcategory' && !parentId) { alert('Subcategory ke liye parent/main category select karein.'); return; }
    const duplicate = store.categories.find(c => slugify(c.name || '') === slug || String(c.slug || '').toLowerCase() === slug);
    if (duplicate) { alert(`Ye category already exist karti hai: "${duplicate.name}"`); return; }
    const parent = kind === 'subcategory' ? mainCategories.find(c => String(c.id) === String(parentId)) : null;
    if (kind === 'subcategory' && !parent) { alert('Valid main category select karein.'); return; }
    setBusy(true);
    const payload = {
      name: cleanName,
      slug,
      nav_section: parent?.nav_section || legacySectionFor(cleanName),
      parent_category_id: parent?.id || null
    };
    const { error } = await supabase.from('categories').insert(payload);
    if (error) {
      console.error('Category create error:', error);
      alert(`Category create nahi ho saki.\n\n${error.message}\n\nAgar parent_category_id missing ho to supplied category migration SQL pehle run karein.`);
      setBusy(false);
      return;
    }
    setName('');
    setKind('main');
    setParentId('');
    await refresh();
    setBusy(false);
  };

  const remove = async category => {
    const children = store.categories.filter(c => String(c.parent_category_id || '') === String(category.id));
    if (children.length) { alert('Is main category ki subcategories pehle move ya delete karein. Parent ko abhi delete nahi kiya ja sakta.'); return; }
    const productCount = store.products.filter(p => String(p.categoryId) === String(category.id)).length;
    if (productCount) { alert(`Is category se ${productCount} product(s) linked hain. Pehle products ko doosri category mein move karein.`); return; }
    if (!confirm(`"${category.name}" delete karni hai?`)) return;
    const { error } = await supabase.from('categories').delete().eq('id', category.id);
    if (error) { alert(error.message); return; }
    await refresh();
  };

  const getOwnProductCount = id => store.products.filter(p => String(p.categoryId) === String(id) && p.status !== 'inactive').length;
  const rowsByParent = mainCategories.map(parent => ({ parent, children: store.categories.filter(c => String(c.parent_category_id || '') === String(parent.id)).sort((a,b) => String(a.name||'').localeCompare(String(b.name||''))) }));

  return (
    <AdminLayout>
      <div className="admin-head">
        <div><p className="eyebrow">CATALOG</p><h1>Categories</h1><p>Main categories aur unke andar subcategories create karein. Store navigation, category cards aur product filters automatically update honge.</p></div>
      </div>
      <form className="admin-form category-manager-form" onSubmit={add}>
        <div className="form-grid">
          <label>Category Name*<input required value={name} onChange={e=>setName(e.target.value)} placeholder={kind === 'main' ? 'e.g. Cosmetics' : 'e.g. Makeup Brushes'} disabled={busy}/></label>
          <label>Category Type<select value={kind} onChange={e=>{setKind(e.target.value);setParentId('')}} disabled={busy}><option value="main">Main category</option><option value="subcategory">Subcategory</option></select></label>
          {kind === 'subcategory' && <label>Parent / Main Category<select required value={parentId} onChange={e=>setParentId(e.target.value)} disabled={busy}><option value="">Select main category</option>{mainCategories.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>}
        </div>
        {kind === 'subcategory' && <p className="category-form-hint">Yeh category selected main category ke neeche navigation aur category directory mein automatically appear hogi.</p>}
        <div className="form-actions"><button type="submit" className="gold-btn" disabled={busy}><Plus size={17}/>{busy ? 'Creating...' : kind === 'main' ? 'Create Main Category' : 'Create Subcategory'}</button></div>
      </form>
      {rowsByParent.length ? (
        <div className="category-admin-tree">
          {rowsByParent.map(({parent, children}) => {
            const productCount = getCategoryProductCount(store.categories, store.products, parent.id);
            return (
              <section className="category-admin-group" key={parent.id}>
                <div className="category-admin-group-head">
                  <CategoryArtwork category={parent} image={parent.image} compact />
                  <div><span className="category-type-label">MAIN CATEGORY</span><strong>{parent.name}</strong><small>{productCount} product(s) · {children.length} subcategory(ies)</small></div>
                  <button type="button" className="category-delete-btn" onClick={()=>remove(parent)} aria-label={`Delete main category ${parent.name}`} title="Delete main category"><Trash2 size={15}/></button>
                </div>
                {children.length ? <div className="category-admin-children">{children.map(child=><div className="category-admin-child" key={child.id}><div><span className="category-child-marker">↳</span><div><strong>{child.name}</strong><small>{getOwnProductCount(child.id)} product(s)</small></div></div><button type="button" className="category-delete-btn" onClick={()=>remove(child)} aria-label={`Delete subcategory ${child.name}`} title="Delete subcategory"><Trash2 size={15}/></button></div>)}</div> : <p className="category-admin-nochildren">No subcategories yet. Use the form above to add the first one.</p>}
              </section>
            );
          })}
        </div>
      ) : <EmptyState title="No Categories Yet" text="Upar se apni first main category create karein." icon={Tag}/>}
    </AdminLayout>
  );
}
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
  return <AdminLayout><div className="admin-head"><div><p className="eyebrow">PROMOTIONS</p><h1>Sale Banners</h1><p>Homepage promotional banner — dates ke bahar automatically hide ho jata hai.</p></div></div><form className="admin-form" onSubmit={save}><div className="form-grid"><label>Title*<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Mega Sale"/></label><label>Subtitle<input value={form.subtitle} onChange={e=>setForm({...form,subtitle:e.target.value})} placeholder="Up to 30% off"/></label><label>Button Text<input value={form.buttonText} onChange={e=>setForm({...form,buttonText:e.target.value})}/></label><label>Button Link<input value={form.buttonLink} onChange={e=>setForm({...form,buttonLink:e.target.value})}/></label><label>Start Date<input type="datetime-local" value={form.startDate} onChange={e=>setForm({...form,startDate:e.target.value})}/></label><label>End Date<input type="datetime-local" value={form.endDate} onChange={e=>setForm({...form,endDate:e.target.value})}/></label><label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="active">Active</option><option value="inactive">Inactive</option></select></label><BannerImageUploader value={form.imageUrl} setValue={v=>setForm({...form,imageUrl:v})}/></div><div className="form-actions"><button type="button" className="ghost-btn" onClick={()=>{setForm(blank);setEditing(null)}}>{editing?'Cancel Edit':'Reset'}</button><button className="gold-btn">{editing?<Pencil size={16}/>:<Plus size={17}/>} {editing?'Save Banner':'Create Sale Banner'}</button></div></form>{store.banners.length?<div className="simple-list">{store.banners.map(b=><div key={b.id}><div>{b.imageUrl?<img className="list-thumb" src={b.imageUrl} alt={b.title || "Hafiz Mart banner"}/>:<Sparkles size={17}/>}<strong>{b.title}</strong><span>{b.status}{b.endDate?` · ends ${new Date(b.endDate).toLocaleString()}`:''}</span></div><div className="row-actions"><button onClick={()=>beginEdit(b)}><Pencil size={15}/></button><button onClick={()=>remove(b.id)}><Trash2 size={16}/></button></div></div>)}</div>:<EmptyState title="No Sale Banners" text="Abhi koi promotional banner nahi hai." icon={Sparkles}/>}</AdminLayout>;
}

function AdminCoupons(){
  const blank={code:'',displayName:'',discountType:'percent',discountValue:'',minOrderAmount:'0',maxDiscount:'',usageLimit:'',startsAt:'',expiresAt:'',status:'active'};
  const [form,setForm]=useState(blank); const [rows,setRows]=useState([]); const [editing,setEditing]=useState(null); const [loading,setLoading]=useState(true);
  const load=async()=>{setLoading(true);const {data,error}=await supabase.from('coupons').select('*').order('created_at',{ascending:false});if(error)alert(error.message);else setRows(data||[]);setLoading(false);};
  useEffect(()=>{load()},[]);
  const save=async e=>{e.preventDefault();const payload={code:form.code.trim().toLowerCase(),display_name:form.displayName.trim()||null,discount_type:form.discountType,discount_value:form.discountType==='free_shipping'?0:Number(form.discountValue||0),min_order_amount:Number(form.minOrderAmount||0),max_discount:form.maxDiscount?Number(form.maxDiscount):null,usage_limit:form.usageLimit?Number(form.usageLimit):null,starts_at:form.startsAt||null,expires_at:form.expiresAt||null,status:form.status,updated_at:new Date().toISOString()};const result=editing?await supabase.from('coupons').update(payload).eq('id',editing):await supabase.from('coupons').insert(payload);if(result.error)alert(result.error.message);else{setForm(blank);setEditing(null);load();}};
  const beginEdit=c=>{setEditing(c.id);setForm({code:c.code||'',displayName:c.display_name||'',discountType:c.discount_type||'percent',discountValue:c.discount_value||'',minOrderAmount:c.min_order_amount||0,maxDiscount:c.max_discount||'',usageLimit:c.usage_limit||'',startsAt:c.starts_at?new Date(c.starts_at).toISOString().slice(0,16):'',expiresAt:c.expires_at?new Date(c.expires_at).toISOString().slice(0,16):'',status:c.status||'active'});window.scrollTo({top:0,behavior:'smooth'});};
  const remove=async id=>{if(!confirm('Delete this coupon?'))return;const {error}=await supabase.from('coupons').delete().eq('id',id);if(error)alert(error.message);else load();};
  return <AdminLayout><div className="admin-head"><div><p className="eyebrow">PROMOTIONS</p><h1>Coupons</h1><p>Create percentage or fixed-amount discounts with limits and dates.</p></div></div><form className="admin-form" onSubmit={save}><div className="form-grid"><label>Coupon Code*<input required value={form.code} onChange={e=>setForm({...form,code:e.target.value.toUpperCase()})} placeholder="WELCOME"/></label><label>Customer-facing Offer Name<input value={form.displayName} onChange={e=>setForm({...form,displayName:e.target.value})} placeholder="Hafiz VIP Offer"/></label><label>Discount Type<select value={form.discountType} onChange={e=>setForm({...form,discountType:e.target.value})}><option value="percent">Percentage (%)</option><option value="fixed">Fixed (Rs.)</option><option value="free_shipping">Free Delivery</option></select></label><label>Discount Value{form.discountType==='free_shipping'&&<small className="form-hint">Free Delivery voucher ke liye 0 use hoga.</small>}<input required={form.discountType!=='free_shipping'} disabled={form.discountType==='free_shipping'} type="number" min="0" step="0.01" value={form.discountType==='free_shipping'?0:form.discountValue} onChange={e=>setForm({...form,discountValue:e.target.value})}/></label><label>Minimum Order (Rs.)<input type="number" min="0" value={form.minOrderAmount} onChange={e=>setForm({...form,minOrderAmount:e.target.value})}/></label><label>Max Discount (Rs.)<input type="number" min="0" value={form.maxDiscount} onChange={e=>setForm({...form,maxDiscount:e.target.value})} placeholder="Optional"/></label><label>Usage Limit<input type="number" min="1" value={form.usageLimit} onChange={e=>setForm({...form,usageLimit:e.target.value})} placeholder="Unlimited if blank"/></label><label>Starts At<input type="datetime-local" value={form.startsAt} onChange={e=>setForm({...form,startsAt:e.target.value})}/></label><label>Expires At<input type="datetime-local" value={form.expiresAt} onChange={e=>setForm({...form,expiresAt:e.target.value})}/></label><label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="active">Active</option><option value="inactive">Inactive</option></select></label></div><div className="form-actions"><button type="button" className="ghost-btn" onClick={()=>{setForm(blank);setEditing(null)}}>Reset</button><button className="gold-btn">{editing?<Pencil size={16}/>:<Plus size={17}/>} {editing?'Save Coupon':'Create Coupon'}</button></div></form>{loading?<EmptyState title="Loading coupons..." text="Supabase se coupons fetch ho rahe hain." icon={TicketPercent}/>:rows.length?<div className="coupon-list">{rows.map(c=><div className="coupon-card" key={c.id}><div className="coupon-code"><TicketPercent size={18}/><strong>{c.code.toUpperCase()}</strong><span>{c.discount_type==='percent'?`${c.discount_value}% off`:c.discount_type==='free_shipping'?'Free Delivery':`Rs. ${Number(c.discount_value).toLocaleString()} off`}</span><small className="coupon-display-name">{c.display_name||'Custom offer'}</small></div><div className="coupon-meta"><span>Min: Rs. {Number(c.min_order_amount||0).toLocaleString()}</span><span>Used: {c.used_count}{c.usage_limit?` / ${c.usage_limit}`:''}</span><span className={`status status-${c.status}`}>{c.status}</span></div><div className="row-actions"><button onClick={()=>beginEdit(c)}><Pencil size={15}/></button><button onClick={()=>remove(c.id)}><Trash2 size={15}/></button></div></div>)}</div>:<EmptyState title="No Coupons Yet" text="Pehla coupon create karein; checkout par customer code apply kar sakega." icon={TicketPercent}/>}</AdminLayout>;
}

function AdminOrders(){
  const [orders,setOrders]=useState([]);
  const [items,setItems]=useState([]);
  const [products,setProducts]=useState([]);
  const [loading,setLoading]=useState(true);
  const [selected,setSelected]=useState(null);
  const [receiptOrder,setReceiptOrder]=useState(null);
  const [filter,setFilter]=useState('all');
  const [search,setSearch]=useState('');
  const [saving,setSaving]=useState(null);
  const [deleting,setDeleting]=useState(null);

  const load=async()=>{
    setLoading(true);
    const [o,i]=await Promise.all([
      supabase.from('orders').select('*').order('created_at',{ascending:false}),
      supabase.from('order_items').select('*')
    ]);
    if(o.error) alert(o.error.message); else setOrders(o.data||[]);
    if(i.error) alert(i.error.message); else setItems(i.data||[]);

    const productIds=[...new Set((i.data||[]).map(item=>item.product_id).filter(Boolean))];
    if(productIds.length){
      const {data:p,error:pError}=await supabase.from('products').select('id,name,sku').in('id',productIds);
      if(pError) alert(pError.message); else setProducts(p||[]);
    } else setProducts([]);
    setLoading(false);
  };
  useEffect(()=>{load()},[]);

  const updateStatus=async(id,status)=>{
    setSaving(id);
    const {error}=await supabase.from('orders').update({status}).eq('id',id);
    if(error) alert(error.message); else setOrders(r=>r.map(o=>o.id===id?{...o,status}:o));
    setSaving(null);
  };

  const deleteOrder=async(order)=>{
    if(!confirm(`Order ${order.order_number||order.id.slice(0,8)} permanently delete karna hai? Ye action undo nahi hoga.`))return;
    setDeleting(order.id);
    const {error}=await supabase.rpc('admin_delete_order',{p_order_id:order.id});
    if(error) alert(error.message);
    else{
      setOrders(r=>r.filter(o=>o.id!==order.id));
      setItems(r=>r.filter(x=>x.order_id!==order.id));
      setSelected(null);
      setReceiptOrder(null);
    }
    setDeleting(null);
  };

  const productMap=useMemo(()=>Object.fromEntries(products.map(p=>[String(p.id),p])),[products]);
  const itemsForOrder=orderId=>items.filter(x=>x.order_id===orderId);
  const normalizedSearch=search.trim().toLowerCase();
  const visible=(filter==='all'?orders:orders.filter(o=>o.status===filter)).filter(o=>{
    if(!normalizedSearch) return true;
    const oi=itemsForOrder(o.id);
    const itemText=oi.map(item=>{
      const product=productMap[String(item.product_id)];
      return `${item.product_name||product?.name||''} ${item.sku||product?.sku||''}`;
    }).join(' ');
    const haystack=`${o.order_number||''} ${o.customer_name||''} ${o.email||''} ${o.phone||''} ${o.city||''} ${itemText}`.toLowerCase();
    return haystack.includes(normalizedSearch);
  });

  return <AdminLayout>
    <div className="admin-head">
      <div><p className="eyebrow">ORDERS</p><h1>Orders</h1><p>{orders.length} real order(s) from Supabase.</p></div>
      <button className="ghost-btn" type="button" onClick={load}><RotateCcw size={15}/> Refresh</button>
    </div>

    <div className="order-filters">
      {['all','pending','confirmed','packed','shipped','out_for_delivery','delivered','cancelled'].map(s=><button type="button" className={filter===s?'active':''} key={s} onClick={()=>{setFilter(s);setSelected(null);setReceiptOrder(null)}}>{s==='all'?'All':s.replaceAll('_',' ')}</button>)}
    </div>

    <div className="order-search-row">
      <input
        className="order-search"
        value={search}
        onChange={e=>setSearch(e.target.value)}
        placeholder="Search order, customer, product or SKU..."
        aria-label="Search orders by order number, customer, product name or SKU"
      />
      {search && <button className="ghost-btn" type="button" onClick={()=>setSearch('')}>Clear</button>}
    </div>

    {loading?<EmptyState title="Loading orders..." text="Supabase se orders fetch ho rahe hain."/>:visible.length?<div className="order-list">{visible.map(o=>{
      const oi=itemsForOrder(o.id);
      const customer={id:o.user_id,full_name:o.customer_name,email:o.email,phone:o.phone};
      return <motion.div className="order-card" key={o.id} layout>
        <div className="order-card-head">
          <div><span className="order-number">{o.order_number||o.id.slice(0,8)}</span><strong>{o.customer_name||'Customer'}</strong><small>{new Date(o.created_at).toLocaleString()} · {o.phone||'No phone'}</small></div>
          <div className="order-total"><strong>Rs. {Number(o.total||0).toLocaleString()}</strong><select aria-label={`Order status for ${o.order_number||o.id.slice(0,8)}`} disabled={saving===o.id} value={o.status||'pending'} onChange={e=>updateStatus(o.id,e.target.value)}>{['pending','confirmed','packed','shipped','out_for_delivery','delivered','cancelled'].map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select></div>
        </div>
        <button className="order-detail-toggle" type="button" onClick={()=>{setSelected(selected===o.id?null:o.id);if(selected===o.id)setReceiptOrder(null)}}>{selected===o.id?'Hide details':'View order details'} <ChevronRight size={15} className={selected===o.id?'rotate':''}/></button>
        {selected===o.id&&<div className="order-details">
          <div className="order-customer"><div><span>Customer</span><strong>{o.customer_name||'Customer'}</strong></div><div><span>Email</span><strong>{o.email||'—'}</strong></div><div><span>Phone</span><strong>{o.phone||'—'}</strong></div><div><span>Address</span><strong>{o.address||'—'}, {o.city||''}</strong></div><div><span>Payment</span><strong>{o.payment_method||'COD'}</strong></div><div><span>Order Date</span><strong>{new Date(o.created_at).toLocaleString()}</strong></div></div>
          <div className="order-items">{oi.length?oi.map(x=>{
            const product=productMap[String(x.product_id)];
            const sku=x.sku||product?.sku||'No SKU';
            const name=x.product_name||product?.name||'Product';
            return <div key={x.id}><span className="order-item-main"><strong>{name}</strong><small>SKU: {sku} · Qty: {Number(x.quantity||0)}</small></span><strong>Rs. {(Number(x.unit_price||0)*Number(x.quantity||0)).toLocaleString()}</strong></div>;
          }):<div><span>Items snapshot</span><strong>See order record</strong></div>}</div>
          <div className="order-breakdown"><span>Subtotal</span><strong>Rs. {Number(o.subtotal||0).toLocaleString()}</strong><span>Discount</span><strong>Rs. {Number(o.discount||0).toLocaleString()}</strong><span>Delivery</span><strong>Rs. {Number(o.delivery_fee||0).toLocaleString()}</strong><span className="grand">Total</span><strong className="grand">Rs. {Number(o.total||0).toLocaleString()}</strong></div>
          <div className="order-admin-actions"><button className="ghost-btn" type="button" onClick={()=>setReceiptOrder(receiptOrder?.id===o.id?null:o)}>{receiptOrder?.id===o.id?'Hide Receipt':'View Receipt'} <FileText size={15}/></button><button className="danger-btn" type="button" disabled={deleting===o.id} onClick={()=>deleteOrder(o)}><Trash2 size={15}/>{deleting===o.id?'Deleting...':'Delete Order'}</button></div>
          {receiptOrder?.id===o.id&&<AdminCustomerReceipt customer={customer} order={o} items={oi} productMap={productMap} onClose={()=>setReceiptOrder(null)}/>}
        </div>}
      </motion.div>})}</div>:<EmptyState title="No Orders Found" text={normalizedSearch?'Search ko order number, customer, product name ya SKU se try karein.':'Abhi koi real customer order nahi hai.'} action="View Store" to="/" icon={ShoppingCart}/>}</AdminLayout>;
}

function AdminCustomerReceipt({ customer, order, items, productMap={}, onClose }) {
  const money = value => `Rs. ${Number(value || 0).toLocaleString()}`;
  const printReceipt = () => {
    const itemRows = (items || []).map(item => `
      <tr>
        <td>${String(item.product_name || productMap[String(item.product_id)]?.name || 'Product').replace(/</g, '&lt;')}</td>
        <td>${String(item.sku || productMap[String(item.product_id)]?.sku || 'N/A').replace(/</g, '&lt;')}</td>
        <td>${Number(item.quantity || 0)}</td>
        <td>${money(item.unit_price)}</td>
        <td>${money(Number(item.unit_price || 0) * Number(item.quantity || 0))}</td>
      </tr>
    `).join('');
    const safe = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const win = window.open('', '_blank', 'width=820,height=920');
    if (!win) return;
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${safe(order.order_number || order.id.slice(0,8))} — Hafiz Mart</title><style>
      *{box-sizing:border-box}body{margin:0;background:#f4f1ea;color:#171717;font-family:Arial,Helvetica,sans-serif;padding:32px}
      .sheet{max-width:760px;margin:auto;background:#fff;border:1px solid #ddd7cb;border-radius:18px;padding:32px}
      .brand{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;border-bottom:1px solid #e5e0d8;padding-bottom:22px;margin-bottom:22px}
      h1{margin:0 0 7px;font-size:26px}.muted{color:#666;font-size:12px;line-height:1.5}.order-no{font-weight:700;font-size:13px}
      .customer{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px}.customer div{border:1px solid #ece7df;border-radius:12px;padding:12px}.label{display:block;text-transform:uppercase;font-size:9px;letter-spacing:.12em;color:#8a806f;margin-bottom:6px}.value{font-size:12px;font-weight:600}
      table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:11px 8px;border-bottom:1px solid #eee;text-align:left}th{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#756c5f}td:nth-child(n+2),th:nth-child(n+2){text-align:right}
      .totals{margin-top:20px;margin-left:auto;max-width:310px}.row{display:flex;justify-content:space-between;gap:20px;padding:7px 0;font-size:12px}.grand{border-top:1px solid #ddd3c3;margin-top:6px;padding-top:12px;font-size:16px;font-weight:800}.footer{margin-top:26px;padding-top:18px;border-top:1px solid #e5e0d8}.print{margin-top:22px;padding:11px 15px;border:0;border-radius:9px;background:#171717;color:#fff;font-weight:700;cursor:pointer}@media print{body{background:#fff;padding:0}.sheet{border:0;border-radius:0;padding:0}.print{display:none}}
    </style></head><body><main class="sheet"><div class="brand"><div><h1>Hafiz Mart</h1><div class="muted">Customer order receipt</div></div><div style="text-align:right"><div class="order-no">${safe(order.order_number || order.id.slice(0,8))}</div><div class="muted">${safe(new Date(order.created_at).toLocaleString())}</div></div></div><section class="customer"><div><span class="label">Customer</span><span class="value">${safe(customer.full_name || customer.name || order.customer_name || 'Customer')}</span></div><div><span class="label">Email</span><span class="value">${safe(customer.email || order.email || '—')}</span></div><div><span class="label">Phone</span><span class="value">${safe(customer.phone || order.phone || '—')}</span></div><div><span class="label">Payment</span><span class="value">${safe(order.payment_method || 'COD')}</span></div><div style="grid-column:1/-1"><span class="label">Delivery Address</span><span class="value">${safe(order.address || '—')}${order.city ? `, ${safe(order.city)}` : ''}</span></div></section><table><thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>${itemRows || '<tr><td colspan="5">No item lines available.</td></tr>'}</tbody></table><section class="totals"><div class="row"><span>Subtotal</span><strong>${money(order.subtotal)}</strong></div><div class="row"><span>Discount</span><strong>${money(order.discount)}</strong></div><div class="row"><span>Delivery</span><strong>${money(order.delivery_fee)}</strong></div><div class="row grand"><span>Total</span><strong>${money(order.total)}</strong></div></section><div class="footer"><div class="muted">Status: ${safe(order.status || 'pending')}</div><div class="muted">Customer record: ${safe(customer.email || customer.id)}</div><button class="print" onclick="window.print()">Print / Save as PDF</button></div></main></body></html>`);
    win.document.close();
    win.focus();
  };
  return <div className="customer-receipt-panel"><div className="customer-receipt-head"><div><p className="eyebrow">ORDER RECEIPT</p><h3>{order.order_number || order.id.slice(0,8)}</h3><span>{new Date(order.created_at).toLocaleString()}</span></div><button className="ghost-btn" type="button" onClick={onClose}>Close</button></div><div className="customer-receipt-summary"><div><span>Customer</span><strong>{customer.full_name || customer.name || order.customer_name || 'Customer'}</strong><small>{customer.email || order.email || '—'}</small></div><div><span>Status</span><strong>{String(order.status || 'pending').replaceAll('_',' ')}</strong><small>{order.payment_method || 'COD'}</small></div><div><span>Total</span><strong>{money(order.total)}</strong><small>{(items || []).length} item line(s)</small></div></div><div className="customer-receipt-items">{(items || []).length ? items.map(item=><div key={item.id}><div><strong>{item.product_name || productMap[String(item.product_id)]?.name || 'Product'}</strong><span>SKU: {item.sku || productMap[String(item.product_id)]?.sku || 'N/A'} · {item.quantity} × {money(item.unit_price)}</span></div><strong>{money(Number(item.unit_price || 0) * Number(item.quantity || 0))}</strong></div>) : <div className="mini-empty">No item lines found for this order.</div>}</div><div className="customer-receipt-totals"><span>Subtotal</span><strong>{money(order.subtotal)}</strong><span>Discount</span><strong>{money(order.discount)}</strong><span>Delivery</span><strong>{money(order.delivery_fee)}</strong><span className="grand">Total</span><strong className="grand">{money(order.total)}</strong></div><button className="gold-btn" type="button" onClick={printReceipt}><FileText size={15}/> Print / Save Receipt</button></div>;
}

function AdminCustomers(){
  const { profile: currentProfile } = useAuth();
  const { store } = useStore();
  const [rows,setRows]=useState([]);const [loading,setLoading]=useState(true);const [tab,setTab]=useState('customers');const [search,setSearch]=useState('');const [saving,setSaving]=useState(null);const [expanded,setExpanded]=useState(null);const [customerOrders,setCustomerOrders]=useState({});const [customerItems,setCustomerItems]=useState({});const [ordersLoading,setOrdersLoading]=useState(null);const [receiptOrder,setReceiptOrder]=useState(null);
  const permissionKeys=['view_dashboard','manage_products','manage_content','manage_marketing','manage_orders','manage_support','manage_users','manage_reviews','view_transactions','view_reports','view_notifications','manage_notifications','manage_settings'];
  const load=async()=>{setLoading(true);const {data,error}=await supabase.from('profiles').select('*').order('created_at',{ascending:false});if(error)alert(error.message);else setRows(data||[]);setLoading(false)};
  useEffect(()=>{load()},[]);
  const updateUser=async(id,patch)=>{if(id===currentProfile?.id)return;setSaving(id);const {data,error}=await supabase.rpc('admin_update_user',{p_user_id:id,p_patch:patch});if(error)alert(error.message);else setRows(r=>r.map(x=>x.id===id?{...x,...(data||patch)}:x));setSaving(null)};
  const loadCustomerOrders=async(customer)=>{
    setOrdersLoading(customer.id);
    const {data,error}=await supabase.from('orders').select('*').eq('user_id',customer.id).order('created_at',{ascending:false});
    if(error){alert(error.message);setOrdersLoading(null);return}
    const orders=data||[];
    setCustomerOrders(prev=>({...prev,[customer.id]:orders}));
    const ids=orders.map(o=>o.id);
    if(ids.length){
      const {data:itemRows,error:itemError}=await supabase.from('order_items').select('*').in('order_id',ids);
      if(itemError) alert(itemError.message);
      else setCustomerItems(prev=>({...prev,[customer.id]:itemRows||[]}));
    } else setCustomerItems(prev=>({...prev,[customer.id]:[]}));
    setOrdersLoading(null);
  };
  const toggleCustomerOrders=async(customer)=>{
    const next=expanded===customer.id?null:customer.id;
    setExpanded(next);setReceiptOrder(null);
    if(next===customer.id&&!Object.prototype.hasOwnProperty.call(customerOrders,customer.id)) await loadCustomerOrders(customer);
  };
  const filtered=rows.filter(r=>tab==='customers'?r.role==='customer':r.role==='admin').filter(r=>`${r.full_name||''} ${r.email||''} ${r.phone||''}`.toLowerCase().includes(search.toLowerCase()));
  return <AdminLayout><div className="admin-head"><div><p className="eyebrow">USER MANAGEMENT</p><h1>{tab==='customers'?'Customers':'Team & Roles'}</h1><p>Users ko view, verify, block aur permissions ke saath manage karein.</p></div><button className="ghost-btn" onClick={load}><RotateCcw size={15}/> Refresh</button></div><div className="admin-user-toolbar"><div className="order-filters"><button className={tab==='customers'?'active':''} onClick={()=>{setTab('customers');setExpanded(null);setReceiptOrder(null)}}>Customers</button><button className={tab==='team'?'active':''} onClick={()=>{setTab('team');setExpanded(null);setReceiptOrder(null)}}>Team & Roles</button></div><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, email or phone..."/></div>{loading?<EmptyState title="Loading users..." text="User profiles fetch ho rahe hain." icon={Users}/>:filtered.length?<div className="admin-user-list">{filtered.map(c=>{const perms=c.permissions||{};const orders=customerOrders[c.id]||[];const items=customerItems[c.id]||[];const spent=orders.filter(o=>o.status!=='cancelled').reduce((sum,o)=>sum+Number(o.total||0),0);return <article className="admin-user-card" key={c.id}><div className="admin-user-main"><div className="admin-user-avatar"><User size={18}/></div><div><strong>{c.full_name||c.name||'Customer'}</strong><span>{c.email||'Email unavailable'}{c.phone?` · ${c.phone}`:''}</span><small>{c.created_at?new Date(c.created_at).toLocaleDateString():''}</small></div><div className="admin-user-statuses"><span className={`status status-${c.account_status||'active'}`}>{c.account_status||'active'}</span>{c.is_verified&&<span className="verified-pill"><UserCheck size={12}/> Verified</span>}</div></div>{expanded===c.id&&<div className="admin-user-editor"><label>Account Status<select disabled={c.id===currentProfile?.id||tab==='team'&&c.team_role==='owner'} value={c.account_status||'active'} onChange={e=>updateUser(c.id,{account_status:e.target.value})}><option value="active">Active</option><option value="blocked">Blocked</option><option value="suspended">Suspended</option></select></label><label className="admin-user-check"><input type="checkbox" disabled={c.id===currentProfile?.id} checked={!!c.is_verified} onChange={e=>updateUser(c.id,{is_verified:e.target.checked})}/><span>Store verification</span></label>{tab==='team'&&<><label>Team Role<select disabled={c.id===currentProfile?.id||c.team_role==='owner'} value={c.team_role||'manager'} onChange={e=>updateUser(c.id,{team_role:e.target.value})}><option value="owner">Owner</option><option value="manager">Manager</option><option value="editor">Content Editor</option><option value="support">Support</option></select></label><div className="permissions-grid"><h4>Permissions</h4>{permissionKeys.map(key=><label key={key}><input type="checkbox" checked={c.team_role==='owner'||!!perms[key]} disabled={c.team_role==='owner'||c.id===currentProfile?.id} onChange={e=>updateUser(c.id,{permissions:{...perms,[key]:e.target.checked}})}/><span>{key.replaceAll('_',' ')}</span></label>)}</div></>}{tab==='customers'&&<section className="customer-orders-section"><div className="customer-orders-head"><div><p className="eyebrow">CUSTOMER HISTORY</p><h3>Orders & Receipts</h3><p>Is customer ke orders, purchased items aur receipts ek jagah.</p></div><div className="customer-order-stats"><span><strong>{orders.length}</strong> orders</span><span><strong>Rs. {spent.toLocaleString()}</strong> spent</span></div></div>{ordersLoading===c.id?<div className="mini-empty">Customer orders load ho rahe hain...</div>:orders.length?<div className="customer-order-list">{orders.map(order=>{const orderItems=items.filter(i=>i.order_id===order.id);return <div className="customer-order-card" key={order.id}><div className="customer-order-main"><div><strong>{order.order_number||order.id.slice(0,8)}</strong><span>{new Date(order.created_at).toLocaleString()}</span><small>{order.customer_name||c.full_name||'Customer'} · {order.email||c.email||'No email'}</small></div><div><span className={`status status-${order.status||'pending'}`}>{String(order.status||'pending').replaceAll('_',' ')}</span><strong>Rs. {Number(order.total||0).toLocaleString()}</strong></div></div><div className="customer-order-items"><span>{orderItems.length ? orderItems.map(i=>`${i.product_name||store.products.find(p=>String(p.id)===String(i.product_id))?.name||'Product'} · SKU: ${i.sku||store.products.find(p=>String(p.id)===String(i.product_id))?.sku||'N/A'} × ${i.quantity}`).join(' · ') : 'Item snapshot unavailable'}</span><strong>{orderItems.length} item line{orderItems.length===1?'':'s'}</strong></div><div className="customer-order-actions"><button className="ghost-btn" type="button" onClick={()=>setReceiptOrder(receiptOrder?.id===order.id?null:order)}>{receiptOrder?.id===order.id?'Hide Receipt':'View Receipt'} <FileText size={15}/></button></div>{receiptOrder?.id===order.id&&<AdminCustomerReceipt customer={c} order={order} items={orderItems} productMap={Object.fromEntries(store.products.map(p=>[String(p.id),p]))} onClose={()=>setReceiptOrder(null)}/>}</div>})}</div>:<div className="mini-empty">Is customer ke naam par abhi koi linked order nahi hai.</div>}</section>}</div>}<div className="admin-user-actions">{tab==='customers'&&<button className="ghost-btn" type="button" onClick={()=>toggleCustomerOrders(c)}>{expanded===c.id?'Close Customer':'Orders & Receipts'} <ChevronRight size={15} className={expanded===c.id?'rotate':''}/></button>}{tab==='team'&&<button className="ghost-btn" type="button" onClick={()=>setExpanded(expanded===c.id?null:c.id)}>{expanded===c.id?'Close':'Manage User'} <ChevronRight size={15} className={expanded===c.id?'rotate':''}/></button>}{c.id!==currentProfile?.id&&tab==='customers'&&<button className={c.account_status==='blocked'?'gold-btn':'danger-btn'} disabled={saving===c.id} onClick={()=>updateUser(c.id,{account_status:c.account_status==='blocked'?'active':'blocked'})}>{c.account_status==='blocked'?<><UserCheck size={15}/> Unblock</>:<><UserX size={15}/> Block</>}</button>}</div></article>})}</div>:<EmptyState title="No users found" text="Search ya tab change karke dobara try karein." icon={Users}/>}</AdminLayout>;
}

function AdminComplaints(){
  const [rows,setRows]=useState([]);const [loading,setLoading]=useState(true);const [filter,setFilter]=useState('all');const [saving,setSaving]=useState(null);
  const load=async()=>{setLoading(true);const {data,error}=await supabase.from('complaints').select('*').order('created_at',{ascending:false});if(error)alert(error.message);else setRows(data||[]);setLoading(false)};useEffect(()=>{load()},[]);
  const updateComplaint=async(id,status,response)=>{setSaving(id);const {error}=await supabase.from('complaints').update({status,admin_response:response.trim()||null,updated_at:new Date().toISOString()}).eq('id',id);if(error)alert(error.message);else setRows(r=>r.map(x=>x.id===id?{...x,status,admin_response:response.trim()||null}:x));setSaving(null)};
  const visible=filter==='all'?rows:rows.filter(r=>r.status===filter);
  return <AdminLayout><div className="admin-head"><div><p className="eyebrow">CUSTOMER SUPPORT</p><h1>Complaints</h1><p>{rows.length} support ticket(s) from customers.</p></div><button className="ghost-btn" onClick={load}><RotateCcw size={15}/> Refresh</button></div><div className="order-filters">{['all','pending','in_progress','resolved','closed'].map(s=><button className={filter===s?'active':''} key={s} onClick={()=>setFilter(s)}>{s.replaceAll('_',' ')}</button>)}</div>{loading?<EmptyState title="Loading complaints..." text="Complaints fetch ho rahi hain." icon={MessageSquare}/>:visible.length?<div className="complaint-admin-list">{visible.map(c=><ComplaintAdminCard key={c.id} complaint={c} saving={saving===c.id} onSave={updateComplaint}/>)}</div>:<EmptyState title={`No ${filter} complaints`} text="Is queue mein abhi koi complaint nahi hai." icon={MessageSquare}/>}</AdminLayout>;
}
function ComplaintAdminCard({complaint,saving,onSave}){const [status,setStatus]=useState(complaint.status||'pending');const [response,setResponse]=useState(complaint.admin_response||'');useEffect(()=>{setStatus(complaint.status||'pending');setResponse(complaint.admin_response||'')},[complaint.status,complaint.admin_response]);return <article className="complaint-admin-card"><div className="complaint-card-head"><div><strong>{complaint.subject}</strong><span>{complaint.order_number?`Order ${complaint.order_number}`:'General complaint'} · {new Date(complaint.created_at).toLocaleString()}</span></div><em className={`status status-${complaint.status}`}>{String(complaint.status||'pending').replaceAll('_',' ')}</em></div><div className="complaint-admin-meta"><span>Type: <strong>{complaint.type||'Other'}</strong></span><span>User: <strong>{complaint.user_id}</strong></span></div><p>{complaint.message}</p>{Array.isArray(complaint.image_urls)&&complaint.image_urls.length>0&&<div className="complaint-images admin-complaint-images">{complaint.image_urls.map((url,i)=><a key={`${complaint.id}-${i}`} href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Evidence ${i+1}`}/></a>)}</div>}<div className="complaint-admin-controls"><label>Status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></label><label>Admin Response<textarea rows="3" value={response} onChange={e=>setResponse(e.target.value)} placeholder="Response for customer..."/></label><button className="gold-btn" disabled={saving} onClick={()=>onSave(complaint.id,status,response)}>{saving?'Saving...':'Save Response'} <Check size={15}/></button></div></article>}

function AdminNotifications(){
  const { user, profile }=useAuth();
  const [rows,setRows]=useState([]);
  const [users,setUsers]=useState([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [form,setForm]=useState({audience:'all',userId:'',type:'announcement',title:'',message:'',priority:'normal'});

  const load=async()=>{
    if(!user) return;
    setLoading(true);
    const [n,u]=await Promise.all([
      supabase.from('notifications').select('*').eq('recipient_user_id',user.id).order('created_at',{ascending:false}),
      supabase.from('profiles').select('id,full_name,email').eq('role','customer').order('created_at',{ascending:false})
    ]);
    if(n.error) alert(n.error.message); else setRows(n.data||[]);
    if(!u.error) setUsers(u.data||[]);
    setLoading(false);
  };

  useEffect(()=>{load()},[user]);

  const markRead=async id=>{
    const {error}=await supabase.from('notifications').update({is_read:true,read_at:new Date().toISOString()}).eq('id',id).eq('recipient_user_id',user.id);
    if(error) alert(error.message); else setRows(r=>r.map(x=>x.id===id?{...x,is_read:true,read_at:new Date().toISOString()}:x));
  };

  const markAll=async()=>{
    const {error}=await supabase.from('notifications').update({is_read:true,read_at:new Date().toISOString()}).eq('recipient_user_id',user.id).eq('is_read',false);
    if(error) alert(error.message); else setRows(r=>r.map(x=>({...x,is_read:true})));
  };

  const send=async e=>{
    e.preventDefault();
    if(!userHasPermission(profile,'manage_notifications')){alert('Notifications send karne ki permission nahi hai.');return;}
    if(!form.title.trim()||!form.message.trim()){alert('Title aur message required hain.');return;}
    setBusy(true);
    const recipients=users.filter(u=>form.audience==='all'||u.id===form.userId);
    if(!recipients.length){alert('Customer select karein.');setBusy(false);return;}
    const payload=recipients.map(u=>({recipient_user_id:u.id,type:form.type,title:form.title.trim(),message:form.message.trim(),priority:form.priority,is_read:false}));
    const {error}=await supabase.from('notifications').insert(payload);
    if(error) alert(error.message);
    else {setForm({audience:'all',userId:'',type:'announcement',title:'',message:'',priority:'normal'});alert('Notification send ho gayi.');}
    setBusy(false);
  };

  return <AdminLayout><div className="admin-head"><div><p className="eyebrow">NOTIFICATIONS</p><h1>Notifications</h1><p>Offers, announcements aur important customer updates bhejein.</p></div><button className="ghost-btn" onClick={markAll}><Check size={15}/> Mark all seen</button></div><form className="admin-form notification-compose" onSubmit={send}><div className="form-grid"><label>Audience<select value={form.audience} onChange={e=>setForm({...form,audience:e.target.value})}><option value="all">All customers</option><option value="one">One customer</option></select></label><label>Type<select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option value="announcement">Announcement</option><option value="offer">Offer</option><option value="support">Support</option><option value="order">Order</option></select></label>{form.audience==='one'&&<label>Customer<select required value={form.userId} onChange={e=>setForm({...form,userId:e.target.value})}><option value="">Select customer</option>{users.map(u=><option key={u.id} value={u.id}>{u.full_name||u.email} — {u.email}</option>)}</select></label>}<label>Priority<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option></select></label><label className="span-2">Title<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label><label className="span-2">Message<textarea required rows="4" value={form.message} onChange={e=>setForm({...form,message:e.target.value})}/></label></div><div className="form-actions"><button className="gold-btn" disabled={busy}><Send size={15}/>{busy?'Sending...':'Send Notification'}</button></div></form><div className="notification-inbox"><div className="section-heading"><div><p className="eyebrow">ADMIN INBOX</p><h2>Your alerts</h2></div></div>{loading?<div className="mini-empty">Notifications load ho rahi hain...</div>:rows.length?<div className="notification-list">{rows.map(n=><article onClick={()=>!n.is_read&&markRead(n.id)} className={`notification-card ${n.priority||'normal'} ${n.is_read?'read':'unread'}`} key={n.id}><div className="notification-icon"><Bell size={17}/></div><div><strong>{n.title}</strong><span>{new Date(n.created_at).toLocaleString()} · {n.type}</span><p>{n.message}</p></div>{!n.is_read&&<i>NEW</i>}</article>)}</div>:<div className="mini-empty"><Bell size={24}/><strong>No notifications</strong><span>New orders, complaints aur system alerts yahan appear hongi.</span></div>}</div></AdminLayout>;
}

function CustomerNotifications(){
  const { user }=useAuth();const [rows,setRows]=useState([]);const [loading,setLoading]=useState(true);
  const load=async()=>{if(!user){setLoading(false);return}setLoading(true);const {data,error}=await supabase.from('notifications').select('*').eq('recipient_user_id',user.id).order('created_at',{ascending:false});if(error)console.error(error.message);else setRows(data||[]);setLoading(false)};useEffect(()=>{load()},[user]);
  const markRead=async id=>{await supabase.from('notifications').update({is_read:true,read_at:new Date().toISOString()}).eq('id',id).eq('recipient_user_id',user.id);setRows(r=>r.map(x=>x.id===id?{...x,is_read:true}:x))};
  const markAll=async()=>{await supabase.from('notifications').update({is_read:true,read_at:new Date().toISOString()}).eq('recipient_user_id',user.id).eq('is_read',false);setRows(r=>r.map(x=>({...x,is_read:true})))};
  if(!user)return <main className="page container"><EmptyState title="Login Required" text="Notifications dekhne ke liye login karein." action="Login" to="/login" icon={Bell}/></main>;
  return <main className="page"><div className="container"><div className="page-head"><div><p className="eyebrow">YOUR INBOX</p><h1>Notifications</h1><p>Offers, order updates aur support responses.</p></div><button className="ghost-btn" onClick={markAll}>Mark all as read</button></div>{loading?<div className="mini-empty">Notifications load ho rahi hain...</div>:rows.length?<div className="notification-list customer-notifications">{rows.map(n=><article onClick={()=>!n.is_read&&markRead(n.id)} className={`notification-card ${n.priority||'normal'} ${n.is_read?'read':'unread'}`} key={n.id}><div className="notification-icon"><Bell size={17}/></div><div><strong>{n.title}</strong><span>{new Date(n.created_at).toLocaleString()}</span><p>{n.message}</p></div>{!n.is_read&&<i>NEW</i>}</article>)}</div>:<div className="mini-empty"><Bell size={24}/><strong>No notifications</strong><span>Jab koi update aaye ga to yahan dikhega.</span></div>}</div></main>;
}

function AdminReports(){
  const { store }=useStore();
  const [orders,setOrders]=useState([]);const [customers,setCustomers]=useState(0);const [loading,setLoading]=useState(true);const [range,setRange]=useState('all');
  useEffect(()=>{(async()=>{setLoading(true);const [o,c]=await Promise.all([supabase.from('orders').select('*').order('created_at',{ascending:false}),supabase.from('profiles').select('id',{count:'exact',head:true}).eq('role','customer')]);if(o.error)alert(o.error.message);setOrders(o.data||[]);setCustomers(c.count||0);setLoading(false)})()},[]);
  const startDate=range==='7'?Date.now()-7*86400000:range==='30'?Date.now()-30*86400000:range==='90'?Date.now()-90*86400000:null;
  const filtered=orders.filter(o=>!startDate||new Date(o.created_at).getTime()>=startDate);const revenue=filtered.filter(o=>o.status!=='cancelled').reduce((n,o)=>n+Number(o.total||0),0);const delivered=filtered.filter(o=>o.status==='delivered').length;const active=filtered.filter(o=>['pending','confirmed','packed','shipped','out_for_delivery'].includes(o.status)).length;
  const exportCsv=()=>{const includePhone=Boolean(store.adminSettings?.reports?.includeCustomerPhone);const headers=includePhone?['Order Number','Customer','Phone','City','Status','Subtotal','Discount','Delivery Fee','Total','Created At']:['Order Number','Customer','City','Status','Subtotal','Discount','Delivery Fee','Total','Created At'];const data=filtered.map(o=>includePhone?[o.order_number||'',o.customer_name||'',o.phone||'',o.city||'',o.status||'',o.subtotal||0,o.discount||0,o.delivery_fee||0,o.total||0,new Date(o.created_at).toISOString()]:[o.order_number||'',o.customer_name||'',o.city||'',o.status||'',o.subtotal||0,o.discount||0,o.delivery_fee||0,o.total||0,new Date(o.created_at).toISOString()]);const csv=[headers,...data].map(row=>row.map(v=>`"${String(v).replaceAll('\"','\"\"')}"`).join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`hafiz-mart-report-${range}.csv`;a.click();URL.revokeObjectURL(url)};
  return <AdminLayout><div className="admin-head"><div><p className="eyebrow">REPORTS</p><h1>Business Reports</h1><p>Orders, revenue aur customer metrics.</p></div><div className="report-head-actions"><select value={range} onChange={e=>setRange(e.target.value)}><option value="all">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select><button className="gold-btn" onClick={exportCsv}><Download size={15}/> Export CSV</button></div></div>{loading?<div className="mini-empty">Reports calculate ho rahi hain...</div>:<><div className="stats-grid six"><div className="stat-card"><BarChart3 size={18}/><span>Orders</span><strong>{filtered.length}</strong><small>Selected period</small></div><div className="stat-card"><DollarSign size={18}/><span>Revenue</span><strong>Rs. {revenue.toLocaleString()}</strong><small>Non-cancelled</small></div><div className="stat-card"><Users size={18}/><span>Customers</span><strong>{customers}</strong><small>Registered</small></div><div className="stat-card"><Check size={18}/><span>Delivered</span><strong>{delivered}</strong><small>Orders delivered</small></div><div className="stat-card"><LoaderCircle size={18}/><span>In Progress</span><strong>{active}</strong><small>Active orders</small></div><div className="stat-card"><ShoppingBag size={18}/><span>Average Order</span><strong>Rs. {filtered.length?Math.round(revenue/Math.max(1,filtered.filter(o=>o.status!=='cancelled').length)).toLocaleString():'0'}</strong><small>Average value</small></div></div><div className="panel report-table"><div className="section-heading"><div><p className="eyebrow">ORDER DATA</p><h2>Recent report rows</h2></div></div>{filtered.slice(0,30).map(o=><div className="report-row" key={o.id}><span>{o.order_number||o.id.slice(0,8)}</span><span>{o.customer_name||'Customer'}</span><span>{o.status}</span><strong>Rs. {Number(o.total||0).toLocaleString()}</strong></div>)}</div></>}</AdminLayout>;
}

function AdminTransactions(){
  const [rows,setRows]=useState([]);const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(null);
  const load=async()=>{setLoading(true);const {data,error}=await supabase.from('transactions').select('*').order('created_at',{ascending:false});if(error)alert(error.message);else setRows(data||[]);setLoading(false)};useEffect(()=>{load()},[]);
  const update=async(id,patch)=>{setSaving(id);const {error}=await supabase.from('transactions').update({...patch,updated_at:new Date().toISOString()}).eq('id',id);if(error)alert(error.message);else setRows(r=>r.map(x=>x.id===id?{...x,...patch}:x));setSaving(null)};
  return <AdminLayout><div className="admin-head"><div><p className="eyebrow">PAYMENTS & TRANSACTIONS</p><h1>Transactions</h1><p>Payment status, refunds aur commission tracking.</p></div><button className="ghost-btn" onClick={load}><RotateCcw size={15}/> Refresh</button></div>{loading?<div className="mini-empty">Transactions load ho rahi hain...</div>:rows.length?<div className="transaction-list">{rows.map(r=><article className="transaction-card" key={r.id}><div className="transaction-head"><div><strong>{r.transaction_number||r.id.slice(0,8)}</strong><span>{r.order_number||r.order_id||'Order'} · {new Date(r.created_at).toLocaleString()}</span></div><strong>Rs. {Number(r.amount||0).toLocaleString()}</strong></div><div className="transaction-grid"><label>Status<select disabled={saving===r.id} value={r.status||'pending'} onChange={e=>update(r.id,{status:e.target.value})}><option value="pending">Pending</option><option value="completed">Completed</option><option value="failed">Failed</option><option value="refunded">Refunded</option><option value="cancelled">Cancelled</option></select></label><label>Refund Amount<input type="number" min="0" value={r.refund_amount||0} onChange={e=>update(r.id,{refund_amount:Number(e.target.value||0)})}/></label><label>Commission<input type="number" min="0" value={r.commission_amount||0} onChange={e=>update(r.id,{commission_amount:Number(e.target.value||0)})}/></label><div className="transaction-method"><span>Method</span><strong>{r.payment_method||'COD'}</strong></div></div></article>)}</div>:<EmptyState title="No transactions yet" text="New orders ke saath transaction records yahan appear hongi." icon={DollarSign}/>}</AdminLayout>;
}

function Complaints(){
  const { user }=useAuth(); const navigate=useNavigate();const [orders,setOrders]=useState([]);const [complaints,setComplaints]=useState([]);const [form,setForm]=useState({orderId:'',type:'Order Issue',subject:'',message:''});const [files,setFiles]=useState([]);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');const [turnstileToken,setTurnstileToken]=useState('');
  const load=async()=>{if(!user){setLoading(false);return}setLoading(true);const [o,c]=await Promise.all([supabase.from('orders').select('id,order_number,total,status,created_at').eq('user_id',user.id).order('created_at',{ascending:false}),supabase.from('complaints').select('*').eq('user_id',user.id).order('created_at',{ascending:false})]);if(!o.error)setOrders(o.data||[]);if(!c.error)setComplaints(c.data||[]);else setNotice(c.error.message);setLoading(false)};useEffect(()=>{load()},[user]);
  const submit=async e=>{e.preventDefault();if(!user)return;if(!form.subject.trim()||!form.message.trim()){setNotice('Subject aur complaint details dono required hain.');return};const turnstileEnabled=Boolean(String(import.meta.env.VITE_TURNSTILE_SITE_KEY||'').trim());if(turnstileEnabled&&!turnstileToken){setNotice('Spam protection complete karein, phir complaint submit karein.');return}const selectedFiles=Array.from(files||[]);if(selectedFiles.length>5){setNotice('Maximum 5 complaint images upload kar sakte hain.');return}if(selectedFiles.some(f=>!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>5*1024*1024)){setNotice('Sirf JPG, PNG, WEBP images (max 5MB each) upload karein.');return}setBusy(true);setNotice('');if(String(import.meta.env.VITE_TURNSTILE_SITE_KEY||'').trim()){const {data:turnstileResult,error:turnstileError}=await supabase.functions.invoke('verify-turnstile',{body:{token:turnstileToken}});if(turnstileError||!turnstileResult?.success){setNotice('Spam verification failed. Dobara try karein.');setBusy(false);return}}const uploaded=[];for(const file of selectedFiles){const safe=file.name.toLowerCase().replace(/[^a-z0-9.]+/g,'-');const path=`complaints/${user.id}/${crypto.randomUUID()}-${safe}`;const {error:uploadError}=await supabase.storage.from('complaint-images').upload(path,file,{upsert:false,contentType:file.type,cacheControl:'3600'});if(uploadError){setNotice('Complaint image upload nahi ho saki.');setBusy(false);return}const {data}=supabase.storage.from('complaint-images').getPublicUrl(path);if(data?.publicUrl)uploaded.push(data.publicUrl)}const selected=orders.find(o=>o.id===form.orderId);const {error}=await supabase.from('complaints').insert({user_id:user.id,order_id:form.orderId||null,order_number:selected?.order_number||null,type:form.type,subject:form.subject.trim(),message:form.message.trim(),image_urls:uploaded,status:'pending'});if(error)setNotice(error.message);else{setForm({orderId:'',type:'Order Issue',subject:'',message:''});setFiles([]);setTurnstileToken('');navigate('/thank-you?type=complaint')}setBusy(false)};
  if(!user)return <main className="page container"><EmptyState title="Login Required" text="Complaint submit karne ke liye login karein." action="Login" to="/login" icon={MessageSquare}/></main>;
  return <main className="page"><div className="container"><div className="page-head"><div><p className="eyebrow">CUSTOMER SUPPORT</p><h1>Complaints & Support</h1><p>Issue ho to complaint submit karein aur response yahin dekhein.</p></div></div><div className="complaint-layout"><form className="form-card complaint-form" onSubmit={submit}><div className="panel-head-row"><div><p className="eyebrow">NEW COMPLAINT</p><h2>How can we help?</h2></div><MessageSquare size={20}/></div><label>Related Order<select value={form.orderId} onChange={e=>setForm({...form,orderId:e.target.value})}><option value="">General / No specific order</option>{orders.map(o=><option key={o.id} value={o.id}>{o.order_number} — Rs. {Number(o.total||0).toLocaleString()}</option>)}</select></label><label>Complaint Type<select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option>Order Issue</option><option>Product Issue</option><option>Delivery Issue</option><option>Payment Issue</option><option>Return / Exchange</option><option>Other</option></select></label><label>Subject<input required value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})} placeholder="Short summary"/></label><label>Details<textarea required rows="6" value={form.message} onChange={e=>setForm({...form,message:e.target.value})} placeholder="Explain your issue..."/></label><label className="complaint-file-field">Evidence images (optional)<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>setFiles(Array.from(e.target.files||[]).slice(0,5))}/><small>{files.length?`${files.length} image(s) selected.`:'Up to 5 images, 5MB each.'}</small></label><TurnstileWidget onToken={setTurnstileToken}/>{notice&&<p className="review-message" role="status" aria-live="polite">{notice}</p>}<button className="gold-btn" disabled={busy}>{busy?'Submitting...':'Submit Complaint'} <ArrowRight size={16}/></button></form><section className="complaint-history"><div className="section-heading"><div><p className="eyebrow">MY TICKETS</p><h2>Complaint History</h2></div></div>{loading?<div className="mini-empty">Complaints load ho rahi hain...</div>:complaints.length?<div className="complaint-list">{complaints.map(c=><article className="complaint-card" key={c.id}><div className="complaint-card-head"><div><strong>{c.subject}</strong><span>{c.order_number?`Order ${c.order_number}`:'General'} · {new Date(c.created_at).toLocaleString()}</span></div><em className={`status status-${c.status}`}>{String(c.status||'pending').replaceAll('_',' ')}</em></div><p>{c.message}</p>{Array.isArray(c.image_urls)&&c.image_urls.length>0&&<div className="complaint-images">{c.image_urls.map((url,i)=><a key={`${c.id}-${i}`} href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Complaint evidence ${i+1}`}/></a>)}</div>}{c.admin_response&&<div className="complaint-response"><span>Admin Response</span><p>{c.admin_response}</p></div>}</article>)}</div>:<div className="mini-empty"><MessageSquare size={24}/><strong>No complaints yet</strong><span>Submitted complaints yahan appear hongi.</span></div>}</section></div></div></main>;
}

function AdminReviews(){
  const { store } = useStore();
  const [rows,setRows]=useState([]); const [loading,setLoading]=useState(true); const [filter,setFilter]=useState('pending');
  const load=async()=>{setLoading(true);const {data,error}=await supabase.from('reviews').select('*').order('created_at',{ascending:false});if(error)alert(error.message);else setRows(data||[]);setLoading(false)};
  useEffect(()=>{load()},[]);
  const moderate=async(id,status)=>{const {error}=await supabase.from('reviews').update({status,updated_at:new Date().toISOString()}).eq('id',id);if(error)alert(error.message);else setRows(r=>r.map(x=>x.id===id?{...x,status}:x))};
  const visible=filter==='all'?rows:rows.filter(r=>r.status===filter);
  return <AdminLayout><div className="admin-head"><div><p className="eyebrow">CUSTOMER VOICE</p><h1>Reviews</h1><p>Customer reviews ko approve, reject aur manage karein.</p></div><button className="ghost-btn" onClick={load}><RotateCcw size={15}/> Refresh</button></div><div className="order-filters">{['pending','approved','rejected','all'].map(s=><button className={filter===s?'active':''} key={s} onClick={()=>setFilter(s)}>{s.charAt(0).toUpperCase()+s.slice(1)}</button>)}</div>{loading?<EmptyState title="Loading reviews..." text="Reviews fetch ho rahi hain." icon={Star}/>:visible.length?<div className="admin-review-list">{visible.map(r=>{const reviewedProduct=store.products.find(p=>String(p.id)===String(r.product_id));return <article className="admin-review-card" key={r.id}><div className="review-card-head"><div><strong className="reviewer-display-name">{r.reviewer_name||'Customer'}</strong><span>{new Date(r.created_at).toLocaleString()}</span></div><StarRating value={r.rating}/></div><small className="review-product-ref">Product: <strong>{reviewedProduct?.name || 'Product unavailable'}</strong>{reviewedProduct?.sku ? ` · SKU ${reviewedProduct.sku}` : ''}</small>{r.title&&<h3>{r.title}</h3>}{r.comment&&<p>{r.comment}</p>}<div className="row-actions"><span className={`status review-status-pill status-${r.status}`}>{String(r.status||'pending').replace(/^./,value=>value.toUpperCase())}</span>{r.status!=='approved'&&<button type="button" className="review-approve-btn" onClick={()=>moderate(r.id,'approved')}><Check size={15}/> Approve</button>}{r.status!=='rejected'&&<button type="button" className="review-reject-btn" onClick={()=>moderate(r.id,'rejected')}><X size={15}/> Reject</button>}</div></article>})}</div>:<EmptyState title={`No ${filter} reviews`} text="Is moderation queue mein abhi koi review nahi hai." icon={Star}/>}</AdminLayout>;
}

function AdminSettings(){
  const { user }=useAuth();
  const { update }=useStore();
  const [settings,setSettings]=useState(DEFAULT_ADMIN_SETTINGS);
  const [saved,setSaved]=useState(DEFAULT_ADMIN_SETTINGS);
  const [section,setSection]=useState('general');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState('');

  const sections=[
    ['general','General',Store],['shipping','Shipping',Truck],['storefront','Storefront',Megaphone],
    ['payments','Payments',CreditCard],['policies','Policies & Legal',FileText],['notifications','Notifications',Bell],
    ['inventory','Inventory',Boxes],['content','Content',Sparkles],['users','Users & Roles',Users],['reports','Reports & Data',BarChart3],['security','Security',ShieldCheck]
  ];

  useEffect(()=>{(async()=>{setLoading(true);const {data,error}=await supabase.from('admin_store_settings').select('settings').eq('id','default').maybeSingle();if(error)setNotice(error.message);else{const merged=mergeAdminSettings(DEFAULT_ADMIN_SETTINGS,data?.settings||{});setSettings(merged);setSaved(merged)}setLoading(false)})()},[]);

  const setField=(group,key,value)=>setSettings(s=>({...s,[group]:{...s[group],[key]:value}}));
  const save=async e=>{e.preventDefault();setSaving(true);setNotice('');const payload={id:'default',settings,updated_at:new Date().toISOString(),updated_by:user?.id||null};const {error}=await supabase.from('admin_store_settings').upsert(payload,{onConflict:'id'});if(error)setNotice(`Save failed: ${error.message}`);else{setSaved(settings);update({adminSettings:settings});setNotice('Settings successfully saved.')}setSaving(false)};
  const field=(label,value,onChange,type='text')=><label className="settings-field"><span>{label}</span><input type={type} min={type==='number'?0:undefined} value={value??''} onChange={e=>onChange(e.target.value)}/></label>;
  const area=(label,value,onChange)=> <label className="settings-field settings-field-wide"><span>{label}</span><textarea rows="4" value={value??''} onChange={e=>onChange(e.target.value)}/></label>;
  const toggle=(label,value,onChange,hint='')=> <label className="settings-toggle"><span><strong>{label}</strong>{hint&&<small>{hint}</small>}</span><input type="checkbox" checked={!!value} onChange={e=>onChange(e.target.checked)}/><i/></label>;
  const current=settings[section]||{};

  return <AdminLayout><div className="admin-head settings-page-head"><div><p className="eyebrow">STORE CONTROL CENTRE</p><h1>Admin Settings</h1><p>Store, users, payments, notifications aur reporting controls.</p></div><span className="settings-save-state"><ShieldCheck size={16}/> Supabase-backed</span></div><div className="settings-layout"><aside className="settings-tabs">{sections.map(([id,label,Icon])=><button type="button" className={`settings-tab ${section===id?'active':''}`} key={id} onClick={()=>{setSection(id);setNotice('')}}><Icon size={17}/><span>{label}</span></button>)}</aside><form className="settings-panel" onSubmit={save}>
    {loading?<div className="settings-loading"><LoaderCircle size={22}/><span>Settings load ho rahi hain...</span></div>:<>
      <div className="settings-panel-heading"><div><p className="eyebrow">SETTINGS / {section.toUpperCase()}</p><h2>{sections.find(x=>x[0]===section)?.[1]}</h2></div></div>
      {section==='general'&&<div className="settings-grid">{field('Store name',current.storeName,v=>setField('general','storeName',v))}{field('Tagline',current.tagline,v=>setField('general','tagline',v))}{field('Support email',current.supportEmail,v=>setField('general','supportEmail',v),'email')}{field('Support phone',current.supportPhone,v=>setField('general','supportPhone',v))}{field('WhatsApp number',current.whatsapp,v=>setField('general','whatsapp',v))}{field('Currency',current.currency,v=>setField('general','currency',v))}{field('Timezone',current.timezone,v=>setField('general','timezone',v))}{field('Facebook URL',current.facebook,v=>setField('general','facebook',v))}{field('Instagram URL',current.instagram,v=>setField('general','instagram',v))}{field('TikTok URL',current.tiktok,v=>setField('general','tiktok',v))}{field('YouTube URL',current.youtube,v=>setField('general','youtube',v))}{area('Store address',current.address,v=>setField('general','address',v))}</div>}
      {section==='shipping'&&<div className="settings-stack">{toggle('Shipping enabled',current.enabled,v=>setField('shipping','enabled',v))}<div className="settings-grid">{field('Default delivery fee (PKR)',current.defaultRate,v=>setField('shipping','defaultRate',v),'number')}{field('Free delivery threshold (PKR)',current.freeDeliveryThreshold,v=>setField('shipping','freeDeliveryThreshold',v),'number')}{field('Minimum delivery days',current.minDays,v=>setField('shipping','minDays',v),'number')}{field('Maximum delivery days',current.maxDays,v=>setField('shipping','maxDays',v),'number')}</div><div className="settings-subheading"><div><h3>City-wise rates</h3><p>Multan Rs.270; fallback default Rs.300.</p></div></div><div className="settings-city-list">{(current.cityRates||[]).map((row,i)=><div className="settings-city-row" key={i}>{field('City',row.city,v=>setSettings(x=>({...x,shipping:{...x.shipping,cityRates:x.shipping.cityRates.map((r,j)=>j===i?{...r,city:v}:r)}})))}{field('Rate (PKR)',row.rate,v=>setSettings(x=>({...x,shipping:{...x.shipping,cityRates:x.shipping.cityRates.map((r,j)=>j===i?{...r,rate:v}:r)}})),'number')}<button type="button" className="settings-remove" onClick={()=>setSettings(x=>({...x,shipping:{...x.shipping,cityRates:x.shipping.cityRates.filter((_,j)=>j!==i)}}))} aria-label={`Remove city rate ${row.city || i+1}`} title="Remove city"><Trash2 aria-hidden="true" size={15}/></button></div>)}</div><button type="button" className="ghost-btn" onClick={()=>setSettings(x=>({...x,shipping:{...x.shipping,cityRates:[...(x.shipping.cityRates||[]),{city:'',rate:x.shipping.defaultRate||300}]}}))}><Plus size={15}/> Add city</button></div>}
      {section==='storefront'&&<div className="settings-stack">{toggle('Announcement bar',current.announcementEnabled,v=>setField('storefront','announcementEnabled',v))}<div className="settings-grid">{area('Announcement text',current.announcementText,v=>setField('storefront','announcementText',v))}{field('Button text',current.announcementButton,v=>setField('storefront','announcementButton',v))}{field('Button link',current.announcementLink,v=>setField('storefront','announcementLink',v))}<label className="settings-field"><span>Theme</span><select value={current.announcementTheme||'gold'} onChange={e=>setField('storefront','announcementTheme',e.target.value)}><option value="gold">Gold</option><option value="dark">Dark</option><option value="light">Light</option></select></label></div>{toggle('Maintenance mode',current.maintenanceMode,v=>setField('storefront','maintenanceMode',v),'Customer storefront ko maintenance screen dikhayega.')}{area('Maintenance message',current.maintenanceMessage,v=>setField('storefront','maintenanceMessage',v))}</div>}
      {section==='payments'&&<div className="settings-stack">{toggle('Cash on Delivery',current.codEnabled,v=>setField('payments','codEnabled',v))}{toggle('Online payments',current.onlinePaymentsEnabled,v=>setField('payments','onlinePaymentsEnabled',v),'Gateway integration complete hone ke baad enable karein.')}<div className="settings-info-card"><CreditCard size={22}/><div><strong>Payment & Transaction tracking</strong><p>Failed payments, refunds aur commission ko Admin → Transactions se track karein. Real gateway data provider integration par depend karega.</p><span className="settings-status-pill">GATEWAY DEPENDENT</span></div></div></div>}
      {section==='policies'&&<div className="settings-stack"><div className="settings-grid">{field('Cancellation window (hours)',current.cancellationWindowHours,v=>setField('policies','cancellationWindowHours',v),'number')}{field('Return window (days)',current.returnWindowDays,v=>setField('policies','returnWindowDays',v),'number')}</div>{area('Returns & refunds policy',current.returnsPolicy,v=>setField('policies','returnsPolicy',v))}{area('Shipping policy',current.shippingPolicy,v=>setField('policies','shippingPolicy',v))}{area('Privacy policy',current.privacyPolicy,v=>setField('policies','privacyPolicy',v))}{area('Terms & conditions',current.terms,v=>setField('policies','terms',v))}</div>}
      {section==='notifications'&&<div className="settings-stack">{toggle('In-app notifications',current.inAppEnabled,v=>setField('notifications','inAppEnabled',v),'Sidebar badge unread notifications ko count karega.')}{toggle('Email notification plan',current.emailEnabled,v=>setField('notifications','emailEnabled',v),'SMTP/provider integration required.')}{toggle('WhatsApp notification plan',current.whatsappEnabled,v=>setField('notifications','whatsappEnabled',v),'WhatsApp Business provider required.')}{toggle('Notify admin on new order',current.notifyOnNewOrder,v=>setField('notifications','notifyOnNewOrder',v))}{toggle('Notify admin on new customer',current.notifyOnNewCustomer,v=>setField('notifications','notifyOnNewCustomer',v))}{toggle('Notify admin on complaint',current.notifyOnComplaint,v=>setField('notifications','notifyOnComplaint',v))}{toggle('Notify admin on review',current.notifyOnReview,v=>setField('notifications','notifyOnReview',v))}{toggle('Notify admin on transaction failure',current.notifyOnTransactionFailure,v=>setField('notifications','notifyOnTransactionFailure',v))}{toggle('Notify admin on refund',current.notifyOnRefund,v=>setField('notifications','notifyOnRefund',v))}{toggle('Notify admin on low stock',current.notifyOnLowStock,v=>setField('notifications','notifyOnLowStock',v))}{toggle('Notify customer on order status',current.notifyOnOrderStatus,v=>setField('notifications','notifyOnOrderStatus',v))}{toggle('Notify customer on complaint response',current.notifyOnComplaintResponse,v=>setField('notifications','notifyOnComplaintResponse',v))}<div className="settings-info-card"><Bell size={22}/><div><strong>Unread badge behavior</strong><p>Notification ko open/seen karne tak NEW badge aur unread count rahega.</p></div></div></div>}
      {section==='inventory'&&<div className="settings-stack"><div className="settings-grid">{field('Low-stock threshold',current.lowStockThreshold,v=>setField('inventory','lowStockThreshold',v),'number')}{field('Maximum review images',current.maxReviewImages,v=>setField('inventory','maxReviewImages',v),'number')}</div>{toggle('Hide out-of-stock products',current.hideOutOfStock,v=>setField('inventory','hideOutOfStock',v))}{toggle('Allow backorders',current.allowBackorders,v=>setField('inventory','allowBackorders',v))}{toggle('Reviews require approval',current.reviewsRequireApproval,v=>setField('inventory','reviewsRequireApproval',v),'OFF rakhen to reviews immediately public list mein show hongi.')}</div>}
      {section==='content'&&<div className="settings-stack"><div className="settings-info-card"><Sparkles size={22}/><div><strong>Content Management</strong><p>Banners aur categories database-backed hain; app update ke baghair content manage kar sakte hain.</p><div className="settings-inline-links"><Link className="ghost-btn" to="/admin/banners"><Sparkles size={15}/> Manage Banners</Link><Link className="ghost-btn" to="/admin/categories"><Tag size={15}/> Manage Categories</Link><Link className="ghost-btn" to="/admin/products"><Package size={15}/> Manage Products</Link></div></div></div>{toggle('Show categories on home',current.showCategoriesOnHome,v=>setField('content','showCategoriesOnHome',v))}{toggle('Show deals section',current.showDealsSection,v=>setField('content','showDealsSection',v))}{field('Featured products limit',current.featuredProductsLimit,v=>setField('content','featuredProductsLimit',v),'number')}</div>}
      {section==='users'&&<div className="settings-stack"><div className="settings-info-card"><Users size={22}/><div><strong>User Management & Roles</strong><p>Customers ko verify/block/manage karein aur team accounts ko role + granular permissions dein.</p><div className="settings-inline-links"><Link className="ghost-btn" to="/admin/customers"><Users size={15}/> Open User Management</Link></div></div></div>{toggle('Require manual customer verification',current.requireManualVerification,v=>setField('users','requireManualVerification',v))}{toggle('Allow guest checkout',current.allowGuestCheckout,v=>setField('users','allowGuestCheckout',v))}<label className="settings-field"><span>Default account status</span><select value={current.defaultAccountStatus||'active'} onChange={e=>setField('users','defaultAccountStatus',e.target.value)}><option value="active">Active</option><option value="blocked">Blocked</option></select></label><div className="settings-permission-list"><h3>Team roles</h3><p>Actual team membership Users screen se manage hoga.</p><div><span>Owner — full access</span><span>Manager — selected operational access</span><span>Content Editor — products/categories/banners</span><span>Support — orders/complaints/notifications</span></div></div></div>}
      {section==='security'&&<div className="settings-stack"><div className="settings-info-card"><ShieldCheck size={22}/><div><strong>Security & Audit</strong><p>Admin access permissions aur database RLS se protected hain. API keys, SMTP passwords aur WhatsApp secrets yahan store na karein.</p><div className="settings-inline-links"><Link className="ghost-btn" to="/admin/customers"><Users size={15}/> Manage Roles</Link><Link className="ghost-btn" to="/admin/notifications"><Bell size={15}/> Notification Center</Link></div></div></div><div className="settings-permission-list"><h3>Security controls</h3><p>Owner ko full access dein; team members ko minimum required permissions dein.</p><div><span>Permission-based admin routes</span><span>Admin action audit log</span><span>Protected database writes</span></div></div></div>}
      {section==='reports'&&<div className="settings-stack"><div className="settings-info-card"><BarChart3 size={22}/><div><strong>Business Reports</strong><p>Revenue, orders, customers aur delivery metrics generate aur CSV export kar sakte hain.</p><div className="settings-inline-links"><Link className="ghost-btn" to="/admin/reports"><BarChart3 size={15}/> Open Reports</Link></div></div></div><label className="settings-field"><span>Default report period</span><select value={current.defaultRange||'30'} onChange={e=>setField('reports','defaultRange',e.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option></select></label>{toggle('Include customer phone in exported reports',current.includeCustomerPhone,v=>setField('reports','includeCustomerPhone',v),'Sirf zaroorat par enable karein.')}</div>}
      {notice&&<div className="settings-notice"><Check size={16}/><span>{notice}</span></div>}<div className="settings-actions"><button type="button" className="ghost-btn" onClick={()=>{setSettings(saved);setNotice('Unsaved changes discarded.')}}><RotateCcw size={15}/> Discard</button><button className="gold-btn" disabled={saving}>{saving?'Saving...':'Save settings'} <Save size={16}/></button></div>
    </>}
  </form></div></AdminLayout>;
}

function AnnouncementBar(){
  const {store}=useStore();
  const cfg=store.adminSettings?.storefront || DEFAULT_ADMIN_SETTINGS.storefront;
  if(!cfg.announcementEnabled || !String(cfg.announcementText||'').trim()) return null;
  const href=String(cfg.announcementLink||'').trim(); const button=String(cfg.announcementButton||'').trim();
  return <div className={`announcement-bar theme-${cfg.announcementTheme||'gold'}`}><div className="container announcement-inner"><span>{cfg.announcementText}</span>{href&&button?(href.startsWith('/')?<Link to={href}>{button}<ArrowRight size={13}/></Link>:<a href={href} target="_blank" rel="noreferrer">{button}<ArrowRight size={13}/></a>):null}</div></div>;
}
function MaintenancePage(){
  const {store}=useStore(); const message=store.adminSettings?.storefront?.maintenanceMessage || DEFAULT_ADMIN_SETTINGS.storefront.maintenanceMessage;
  return <main className="maintenance-page"><section className="maintenance-card"><div className="maintenance-icon"><Store size={28}/></div><p className="eyebrow">HAFIZ MART</p><h1>We’ll be back soon</h1><p>{message}</p><span className="maintenance-status"><span/> Store maintenance in progress</span></section></main>;
}
function MobileZoomLock(){
  useEffect(()=>{
    const viewport=document.querySelector('meta[name="viewport"]') || document.createElement('meta');
    const content='width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
    viewport.setAttribute('name','viewport');
    viewport.setAttribute('content',content);
    if(!viewport.parentNode) document.head.appendChild(viewport);

    const preventZoomKeys = (event) => {
      if(!(event.ctrlKey || event.metaKey)) return;
      if(['+','-','=','0'].includes(event.key)) event.preventDefault();
    };
    const preventCtrlWheel = (event) => {
      if(event.ctrlKey || event.metaKey) event.preventDefault();
    };
    const preventMultiTouch = (event) => {
      if(event.touches && event.touches.length > 1) event.preventDefault();
    };
    const preventGesture = (event) => event.preventDefault();

    document.addEventListener('keydown', preventZoomKeys, { passive:false });
    document.addEventListener('wheel', preventCtrlWheel, { passive:false });
    document.addEventListener('touchmove', preventMultiTouch, { passive:false });
    document.addEventListener('gesturestart', preventGesture, { passive:false });
    document.addEventListener('gesturechange', preventGesture, { passive:false });
    document.addEventListener('gestureend', preventGesture, { passive:false });

    return () => {
      document.removeEventListener('keydown', preventZoomKeys);
      document.removeEventListener('wheel', preventCtrlWheel);
      document.removeEventListener('touchmove', preventMultiTouch);
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
      document.removeEventListener('gestureend', preventGesture);
    };
  },[]);

  return null;
}

function AppRoutes(){
  const {store}=useStore(); const {profile}=useAuth(); const location=useLocation();
  const maintenance=Boolean(store.adminSettings?.storefront?.maintenanceMode); const isAdmin=profile?.role==='admin';
  const authAllowed=['/login','/forgot-password','/reset-password'].includes(location.pathname); const adminAllowed=location.pathname.startsWith('/admin'); const bypass=isAdmin||adminAllowed||authAllowed;
  return <><Navbar/>{(!maintenance||bypass)&&<AnnouncementBar/>}{maintenance&&!bypass?<MaintenancePage/>:<Routes>
    <Route path="/" element={<Home/>}/><Route path="/shop" element={<Shop/>}/><Route path="/product/:id" element={<ProductDetails/>}/><Route path="/categories" element={<Categories/>}/><Route path="/deals" element={<Deals/>}/><Route path="/wishlist" element={<Wishlist/>}/><Route path="/cart" element={<Cart/>}/><Route path="/checkout" element={<Checkout/>}/><Route path="/account" element={<Account/>}/><Route path="/track-order" element={<OrderTracker/>}/><Route path="/complaints" element={<Complaints/>}/><Route path="/notifications" element={<CustomerNotifications/>}/><Route path="/faq" element={<FAQPage/>}/><Route path="/privacy-policy" element={<PrivacyPolicyPage/>}/><Route path="/thank-you" element={<ThankYouPage/>}/><Route path="/login" element={<Login/>}/><Route path="/forgot-password" element={<ForgotPassword/>}/><Route path="/reset-password" element={<ResetPassword/>}/>
    <Route path="/admin" element={<Admin/>}/><Route path="/admin/products" element={<AdminProducts/>}/><Route path="/admin/products/new" element={<ProductForm/>}/><Route path="/admin/products/:id/edit" element={<ProductForm/>}/><Route path="/admin/categories" element={<AdminCategories/>}/><Route path="/admin/banners" element={<AdminBanners/>}/><Route path="/admin/coupons" element={<AdminCoupons/>}/><Route path="/admin/orders" element={<AdminOrders/>}/><Route path="/admin/complaints" element={<AdminComplaints/>}/><Route path="/admin/customers" element={<AdminCustomers/>}/><Route path="/admin/reviews" element={<AdminReviews/>}/><Route path="/admin/transactions" element={<AdminTransactions/>}/><Route path="/admin/reports" element={<AdminReports/>}/><Route path="/admin/notifications" element={<AdminNotifications/>}/><Route path="/admin/settings" element={<AdminSettings/>}/><Route path="*" element={<main className="page container"><EmptyState title="Page Not Found" text="Yeh page exist nahi karta." action="Back Home" to="/"/></main>}/>
  </Routes>}<WhatsAppButton/><footer className="footer"><div className="container footer-inner"><img src={logo} alt="Hafiz Mart"/><div className="footer-center"><span>© {new Date().getFullYear()} Hafiz Mart. All rights reserved.</span><nav className="footer-links" aria-label="Footer links"><Link to="/faq">FAQ</Link><Link to="/privacy-policy">Privacy Policy</Link><Link to="/track-order">Track Order</Link><Link to="/complaints">Support</Link></nav></div></div></footer></>;
}
export default function App(){ return <AuthProvider><StoreProvider><div className="app"><MobileZoomLock/><GoogleAnalytics/><SeoManager/><ScrollToTop/><ScrollReveal/><AppRoutes/></div></StoreProvider></AuthProvider>; }
