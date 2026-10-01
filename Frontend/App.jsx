import React from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './login.css';
import { readLocal, writeLocal, removeLocal, readSession, writeSession, removeSession, sanitizeStoredArray } from './storage.js';
import { applyInventoryOperation, renameWarehouseInOperation } from './domain.js';
import { deductShipmentStock, getShipmentBlockReason } from './services/orders.js';
import { getInvoiceOutstanding, getPaymentValidationError } from './services/billing.js';
import { validateLoginCredentials } from './services/auth.js';
import { parseProductImportText } from './services/productImport.js';
import { getWarehouseCapacityStatus, normalizeWarehouseProfile, validateWarehouseCapacity } from './services/warehouses.js';
import OperationsTable from './components/OperationsTable.jsx';
import StatusBadge from './components/StatusBadge.jsx';
import './styles/design-tokens.css';
import {
  Button,
  Card,
  Col,
  Form,
  InputGroup,
  Modal,
  Row,
  Table,
} from 'react-bootstrap';

const warehouseSeed = ['Main Warehouse'];
const unitOptions = ['units', 'pieces', 'kg', 'g', 'tons', 'liters', 'ml', 'meters', 'cm', 'm²', 'm³', 'boxes', 'cartons', 'pallets', 'rolls', 'sheets', 'pairs', 'sets', 'packs', 'bottles', 'hours'];
const demoUser = { name: 'Jordan Davis', email: 'jordan.davis@northstar.co', password: 'StockSense2025!', role: 'Admin' };
const roleDefinitions = {
  Admin: { pages: ['Today', 'Dashboard', 'Products', 'Operations', 'Warehouses', 'Suppliers', 'Procurement', 'Customers', 'Sales', 'Fulfillment', 'Returns', 'Approvals', 'Reports', 'Billing', 'Access', 'Audit', 'Forecasting', 'Exceptions', 'Settings'], badge: 'Administrator' },
  'Operations Manager': { pages: ['Today', 'Dashboard', 'Products', 'Operations', 'Warehouses', 'Suppliers', 'Procurement', 'Customers', 'Sales', 'Fulfillment', 'Returns', 'Approvals', 'Reports', 'Billing', 'Audit', 'Forecasting', 'Exceptions'], badge: 'Operations' },
  'Warehouse Lead': { pages: ['Today', 'Dashboard', 'Products', 'Operations', 'Warehouses', 'Fulfillment', 'Reports', 'Audit', 'Forecasting', 'Exceptions'], badge: 'Warehouse' },
  'Finance Manager': { pages: ['Today', 'Dashboard', 'Reports', 'Billing', 'Customers', 'Sales', 'Audit', 'Forecasting', 'Exceptions'], badge: 'Finance' },
  Viewer: { pages: ['Today', 'Dashboard', 'Reports'], badge: 'Read-only' },
};
const roleOptions = Object.keys(roleDefinitions);
const currencyOptions = [
  { code: 'USD', label: 'US Dollar (USD)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'GBP', label: 'British Pound (GBP)' },
  { code: 'INR', label: 'Indian Rupee (INR)' },
  { code: 'CAD', label: 'Canadian Dollar (CAD)' },
  { code: 'AUD', label: 'Australian Dollar (AUD)' },
  { code: 'JPY', label: 'Japanese Yen (JPY)' },
  { code: 'CHF', label: 'Swiss Franc (CHF)' },
  { code: 'SGD', label: 'Singapore Dollar (SGD)' },
  { code: 'MXN', label: 'Mexican Peso (MXN)' },
  { code: 'BRL', label: 'Brazilian Real (BRL)' },
  { code: 'CNY', label: 'Chinese Yuan (CNY)' },
];

const initialProducts = [];
const initialSuppliers = [];
const initialPurchaseOrders = [];
const initialCustomers = [];
const initialSalesOrders = [];
const initialShipments = [];
const initialReturns = [];
const initialPayments = [];

const starterDocs = [];

const starterInvoices = [];

const legacyDemoNames = new Set([
  'Steel Rods',
  'Office Chair',
  'Aluminum Sheets',
  'Safety Gloves',
  'Packing Boxes',
  'Copper Wire',
]);

const legacyDemoIds = new Set(['RCV-24018', 'OUT-24009', 'INT-24006', 'ADJ-24002', 'INV-1042', 'BILL-0087', 'INV-1038']);

const readSaved = readLocal;
const writeSaved = writeLocal;
const removeSaved = removeLocal;

const totalStock = (product) => Object.values(product?.stock || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
const formatNumber = (value) => Number(value || 0).toLocaleString();
const mostCommonValue = (values) => {
  const counts = values.reduce((result, value) => {
    if (value) result[value] = (result[value] || 0) + 1;
    return result;
  }, {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || '';
};
const getRecentSalesDemand = (orders, productName, now = Date.now()) => {
  const fulfilledOrders = orders.filter((order) => (
    order.productName === productName && ['Confirmed', 'Shipped'].includes(order.status)
  ));
  const hasUndatedOrders = fulfilledOrders.some((order) => (
    typeof order.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(order.createdAt) || !Number.isFinite(Date.parse(order.createdAt))
  ));
  const cutoff = now - (30 * 86400000);
  const recentOrders = fulfilledOrders.filter((order) => {
    const timestamp = Date.parse(order.createdAt);
    return Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= now;
  });

  return {
    units: hasUndatedOrders ? null : recentOrders.reduce((sum, order) => sum + Number(order.qty || 0), 0),
    orderCount: recentOrders.length,
    hasUndatedOrders,
  };
};
const downloadCsv = (filename, rows) => {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
};

const isLowStock = (product, thresholdRule = 'At reorder point') => {
  const qty = totalStock(product);
  const reorder = Number(product.reorder) || 0;
  if (thresholdRule === 'Below reorder point') return qty < reorder;
  if (thresholdRule === 'At 10% below reorder point') return qty <= reorder * 0.9;
  return qty <= reorder;
};

function BrandLogo({ compact = false }) {
  return (
    <div className={`stockwise-brand ${compact ? 'stockwise-brand-compact' : ''}`} aria-label="Stockwise">
      <span className="stockwise-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 12.5h24v18H8z" stroke="rgba(255,255,255,.58)" strokeWidth="1.4" />
          <path d="m10.5 15 4 11 5.5-7 5.5 7 4-11" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M27.8 9.5h5.2" stroke="#b9ffe8" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
      <span className="stockwise-wordmark">Stockwise</span>
    </div>
  );
}

function Feature({ icon, title, text }) {
  return (
    <div className="feature">
      <div className="feature-icon">{icon}</div>
      <div>
        <div className="feature-title">{title}</div>
        <div className="feature-text">{text}</div>
      </div>
    </div>
  );
}

function LogoIcon() {
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 3L35 11.5V28.5L20 37L5 28.5V11.5L20 3Z" fill="white" fillOpacity="0.95" />
      <path d="M20 8L30 13.7V25.3L20 31L10 25.3V13.7L20 8Z" fill="#1769FF" />
      <path d="M20 8V31L30 25.3V13.7L20 8Z" fill="#633CFF" fillOpacity="0.8" />
      <path d="M20 15L25 17.8V23.5L20 26.3L15 23.5V17.8L20 15Z" fill="white" fillOpacity="0.95" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7L12 13L21 7" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 018 0v3" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3L20 6V11C20 16.5 16.5 20 12 22C7.5 20 4 16.5 4 11V6L12 3Z" />
      <path d="M8.5 12L11 14.5L15.5 9.5" />
    </svg>
  );
}

function InventoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 9H16M8 13H13M8 17H11" />
      <circle cx="16" cy="16" r="2" />
    </svg>
  );
}

function AutomationIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.5 11L15.5 7M8.5 13L15.5 17" />
    </svg>
  );
}

function ReportsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 19V10M12 19V5M19 19V8" />
      <path d="M3 19H21" />
    </svg>
  );
}

function SecurityIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3L20 6V11C20 16.5 16.5 20 12 22C7.5 20 4 16.5 4 11V6L12 3Z" />
      <path d="M9 12L11 14L15 10" />
    </svg>
  );
}

export default function App() {
  const [products, setProducts] = React.useState(() => {
    const saved = readSaved('stockwise-products', initialProducts);
    return sanitizeStoredArray(saved, initialProducts, (entry) => (
      typeof entry === 'object' && entry && legacyDemoNames.has(entry.name)
    ));
  });
  const [docs, setDocs] = React.useState(() => {
    const saved = readSaved('stockwise-operations', starterDocs);
    return sanitizeStoredArray(saved, starterDocs, (entry) => (
      typeof entry === 'object' && entry && legacyDemoIds.has(entry.id)
    ));
  });
  const [invoices, setInvoices] = React.useState(() => {
    const saved = readSaved('stockwise-billing', starterInvoices);
    return sanitizeStoredArray(saved, starterInvoices, (entry) => (
      typeof entry === 'object' && entry && legacyDemoIds.has(entry.id)
    ));
  });
  const [warehouseList, setWarehouseList] = React.useState(() => {
    const saved = readSaved('stockwise-locations', warehouseSeed);
    return sanitizeStoredArray(saved, warehouseSeed);
  });
  const [warehouseProfiles, setWarehouseProfiles] = React.useState(() => {
    const saved = readSaved('stockwise-warehouse-profiles', {});
    return Object.fromEntries(warehouseSeed.map((location) => [location, normalizeWarehouseProfile(saved?.[location], location)]));
  });
  const [suppliers, setSuppliers] = React.useState(() => {
    const saved = readSaved('stockwise-suppliers', initialSuppliers);
    return sanitizeStoredArray(saved, initialSuppliers);
  });
  const [purchaseOrders, setPurchaseOrders] = React.useState(() => {
    const saved = readSaved('stockwise-purchase-orders', initialPurchaseOrders);
    return sanitizeStoredArray(saved, initialPurchaseOrders);
  });
  const [customers, setCustomers] = React.useState(() => {
    const saved = readSaved('stockwise-customers', initialCustomers);
    return sanitizeStoredArray(saved, initialCustomers);
  });
  const [salesOrders, setSalesOrders] = React.useState(() => {
    const saved = readSaved('stockwise-sales-orders', initialSalesOrders);
    return sanitizeStoredArray(saved, initialSalesOrders);
  });
  const [shipments, setShipments] = React.useState(() => {
    const saved = readSaved('stockwise-shipments', initialShipments);
    return sanitizeStoredArray(saved, initialShipments);
  });
  const [returns, setReturns] = React.useState(() => {
    const saved = readSaved('stockwise-returns', initialReturns);
    return sanitizeStoredArray(saved, initialReturns);
  });
  const [payments, setPayments] = React.useState(() => {
    const saved = readSaved('stockwise-payments', initialPayments);
    return sanitizeStoredArray(saved, initialPayments);
  });
  const [settings, setSettings] = React.useState(() => {
    const saved = readSaved('stockwise-settings', {});
    return {
      alertRule: ['At reorder point', 'Below reorder point', 'At 10% below reorder point'].includes(saved?.alertRule) ? saved.alertRule : 'At reorder point',
      defaultUnit: unitOptions.includes(saved?.defaultUnit) ? saved.defaultUnit : 'units',
      currency: currencyOptions.some((item) => item.code === saved?.currency) ? saved.currency : 'USD',
    };
  });
  const getStoredSession = () => (
    readSaved('stockwise-session', false) || readSession('stockwise-session', false)
  );

  const [authenticated, setAuthenticated] = React.useState(() => getStoredSession());
  const [themeMode, setThemeMode] = React.useState(() => {
    const savedTheme = readSaved('stockwise-theme', null);
    if (savedTheme === 'dark' || savedTheme === 'light') return savedTheme;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [users, setUsers] = React.useState(() => readSaved('stockwise-users', [demoUser]));
  const [authMode, setAuthMode] = React.useState('login');
  const [loginForm, setLoginForm] = React.useState({ name: '', email: '', password: '', confirmPassword: '', role: 'Operations Manager' });
  const [loginError, setLoginError] = React.useState('');
  const [loginFieldErrors, setLoginFieldErrors] = React.useState({});
  const [showPassword, setShowPassword] = React.useState(false);
  const [remember, setRemember] = React.useState(() => readSaved('stockwise-remember', true));
  const [loading, setLoading] = React.useState(false);
  const [page, setPage] = React.useState('Today');
  const [search, setSearch] = React.useState('');
  const [globalSearch, setGlobalSearch] = React.useState('');
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);
  const [notificationOpen, setNotificationOpen] = React.useState(false);
  const [modal, setModal] = React.useState('');
  const [toast, setToast] = React.useState('');
  const [confirmState, setConfirmState] = React.useState(null);
  const [supplierForm, setSupplierForm] = React.useState({ name: '', contact: '', email: '', phone: '', leadTime: '5', slaTarget: '98', category: 'General' });
  const [purchaseForm, setPurchaseForm] = React.useState({ supplierId: '', productId: '', qty: '0', unitCost: '0', expectedDate: '', location: warehouseSeed[0], status: 'Draft' });
  const [customerForm, setCustomerForm] = React.useState({ name: '', email: '', phone: '', tier: 'Standard', region: 'North' });
  const [salesForm, setSalesForm] = React.useState({ customerId: '', productId: '', qty: '1', unitPrice: '0', status: 'Draft', location: warehouseSeed[0], expectedDate: '' });
  const [shipmentForm, setShipmentForm] = React.useState({ orderId: '', carrier: 'UPS', tracking: '', status: 'Ready', location: warehouseSeed[0] });
  const [paymentForm, setPaymentForm] = React.useState({ invoiceId: '', customer: '', amount: '0', method: 'Bank transfer', date: '' });
  const [returnForm, setReturnForm] = React.useState({ orderId: '', customerId: '', productId: '', qty: '1', reason: 'Damaged', location: warehouseSeed[0] });
  const [isOnline, setIsOnline] = React.useState(() => navigator.onLine);
  const [importPreview, setImportPreview] = React.useState([]);
  const [importMessage, setImportMessage] = React.useState('');
  const [importErrors, setImportErrors] = React.useState([]);
  const [importSources, setImportSources] = React.useState([]);
  const [importHeaders, setImportHeaders] = React.useState([]);
  const [importColumnMapping, setImportColumnMapping] = React.useState({});
  const [productForm, setProductForm] = React.useState({
    id: null,
    name: '',
    sku: '',
    barcode: '',
    description: '',
    category: 'Raw Materials',
    supplierId: '',
    material: '',
    price: '0',
    unit: 'units',
    reorder: '10',
    stock: Object.fromEntries(warehouseSeed.map((location) => [location, '0'])),
  });
  const [operationForm, setOperationForm] = React.useState({
    type: 'Receipt',
    productId: '',
    qty: '0',
    counted: '0',
    partner: '',
    location: warehouseSeed[0],
    destination: warehouseSeed[0],
  });
  const [invoiceForm, setInvoiceForm] = React.useState({ kind: 'Invoice', party: '', amount: '', dueDate: '' });
  const [warehouseForm, setWarehouseForm] = React.useState({ name: '', capacity: '', bins: '' });
  const [renameTarget, setRenameTarget] = React.useState('');
  const [renameValue, setRenameValue] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('All');
  const [statusFilter, setStatusFilter] = React.useState('All');
  const [locationFilter, setLocationFilter] = React.useState('All');
  const [categoryFilter, setCategoryFilter] = React.useState('All');
  const [productSort, setProductSort] = React.useState('name-asc');
  const [selectedProductIds, setSelectedProductIds] = React.useState([]);
  const [bulkCategory, setBulkCategory] = React.useState('');
  const [productDetails, setProductDetails] = React.useState(null);

  React.useEffect(() => {
    const handleOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);
    return () => {
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
    };
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
      if (event.key === 'Escape') {
        setCommandPaletteOpen(false);
        setNotificationOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  React.useEffect(() => {
    writeSaved('stockwise-theme', themeMode);
    writeSaved('stockwise-remember', remember);
    writeSaved('stockwise-products', products);
    writeSaved('stockwise-operations', docs);
    writeSaved('stockwise-billing', invoices);
    writeSaved('stockwise-locations', warehouseList);
    writeSaved('stockwise-warehouse-profiles', warehouseProfiles);
    writeSaved('stockwise-suppliers', suppliers);
    writeSaved('stockwise-purchase-orders', purchaseOrders);
    writeSaved('stockwise-customers', customers);
    writeSaved('stockwise-sales-orders', salesOrders);
    writeSaved('stockwise-shipments', shipments);
    writeSaved('stockwise-returns', returns);
    writeSaved('stockwise-payments', payments);
    writeSaved('stockwise-settings', settings);
    writeSaved('stockwise-users', users);
  }, [themeMode, remember, products, docs, invoices, warehouseList, warehouseProfiles, suppliers, purchaseOrders, customers, salesOrders, shipments, returns, payments, settings, users]);

  const displayUser = authenticated && typeof authenticated === 'object' ? authenticated : demoUser;
  const userRole = displayUser.role || 'Admin';
  const userInitials = displayUser.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  const currentThemeClass = themeMode === 'dark' ? 'theme-dark' : 'theme-light';
  const canAccessPage = (targetPage) => (roleDefinitions[userRole]?.pages || []).includes(targetPage);
  const canManageInventory = ['Admin', 'Operations Manager', 'Warehouse Lead'].includes(userRole);
  const canManageFinance = ['Admin', 'Finance Manager', 'Operations Manager'].includes(userRole);
  const canManageUsers = ['Admin', 'Operations Manager'].includes(userRole);
  const moneyFormatter = React.useMemo(
    () => new Intl.NumberFormat(undefined, { style: 'currency', currency: settings.currency }),
    [settings.currency]
  );

  React.useEffect(() => {
    if (authenticated && !canAccessPage(page)) {
      setPage('Today');
    }
  }, [authenticated, page, userRole]);

  const showToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2500);
  };

  const persistSession = (user) => {
    if (remember) {
      writeSaved('stockwise-session', user);
      removeSession('stockwise-session');
    } else {
      removeSaved('stockwise-session');
      writeSession('stockwise-session', user);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    const email = loginForm.email.trim().toLowerCase();
    const fieldErrors = validateLoginCredentials(loginForm);

    if (Object.keys(fieldErrors).length > 0) {
      setLoginFieldErrors(fieldErrors);
      setLoginError('');
      setLoading(false);
      return;
    }

    setLoginFieldErrors({});
    setLoading(true);
    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    if (authMode === 'register') {
      const name = loginForm.name.trim();
      if (!name) {
        setLoading(false);
        setLoginError('Please enter your name.');
        return;
      }
      if (loginForm.password.length < 8) {
        setLoading(false);
        setLoginError('Password must be at least 8 characters long.');
        return;
      }
      if (loginForm.password !== loginForm.confirmPassword) {
        setLoading(false);
        setLoginError('Passwords do not match.');
        return;
      }
      if (users.some((user) => user.email.toLowerCase() === email)) {
        setLoading(false);
        setLoginError('An account with this email already exists.');
        return;
      }
      const user = { name, email, password: loginForm.password, role: loginForm.role || 'Operations Manager' };
      setUsers((current) => [...current, user]);
      setAuthenticated(user);
      persistSession(user);
      setLoginForm({ name: '', email: '', password: '', confirmPassword: '', role: 'Operations Manager' });
      setLoginError('');
      setLoading(false);
      return;
    }

    const user = users.find((candidate) => candidate.email.toLowerCase() === email && candidate.password === loginForm.password);
    if (!user) {
      setLoading(false);
      setLoginError('Email or password is incorrect.');
      return;
    }
    setAuthenticated(user);
    persistSession(user);
    setLoginError('');
    setLoading(false);
  };

  const logout = () => {
    removeSaved('stockwise-session');
    removeSession('stockwise-session');
    setAuthenticated(false);
  };

  const openProductModal = () => {
    setProductForm({
      id: null,
      name: '',
      sku: '',
      barcode: '',
      description: '',
      category: 'Raw Materials',
      supplierId: '',
      material: '',
      price: '0',
      unit: settings.defaultUnit,
      reorder: '10',
      stock: Object.fromEntries(warehouseList.map((location) => [location, '0'])),
    });
    setModal('product');
  };

  const editProduct = (product) => {
    setProductForm({
      id: product.id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode || '',
      description: product.description || '',
      category: product.category,
      supplierId: String(product.supplierId || suppliers.find((supplier) => supplier.name === product.supplierName)?.id || ''),
      material: product.material || '',
      price: String(product.price ?? 0),
      unit: product.unit,
      reorder: String(product.reorder ?? 0),
      stock: Object.fromEntries(warehouseList.map((location) => [location, String(product.stock?.[location] || 0)])),
    });
    setModal('product');
  };

  const saveProduct = (event) => {
    event.preventDefault();
    const name = productForm.name.trim();
    const sku = productForm.sku.trim().toUpperCase();
    if (!name || !sku || !productForm.unit.trim()) {
      showToast('Product name, SKU, and unit are required.');
      return;
    }

    const duplicate = products.some((product) => product.id !== productForm.id && product.sku.toUpperCase() === sku);
    if (duplicate) {
      showToast('That SKU is already in use.');
      return;
    }

    const nextStock = Object.fromEntries(
      warehouseList.map((location) => [location, Number(productForm.stock?.[location] ?? 0)])
    );

    const nextProduct = {
      id: productForm.id ?? Date.now(),
      name,
      sku,
      barcode: productForm.barcode.trim(),
      description: productForm.description.trim(),
      category: productForm.category,
      supplierId: productForm.supplierId || '',
      supplierName: suppliers.find((supplier) => String(supplier.id) === String(productForm.supplierId))?.name || '',
      material: productForm.material.trim(),
      price: Number(productForm.price) || 0,
      unit: productForm.unit.trim(),
      reorder: Number(productForm.reorder) || 0,
      stock: nextStock,
    };

    setProducts((current) => {
      if (productForm.id) {
        return current.map((item) => (item.id === productForm.id ? nextProduct : item));
      }
      return [nextProduct, ...current];
    });

    setModal('');
    showToast(productForm.id ? 'Product updated.' : 'Product added to the catalog.');
  };

  const deleteProduct = (product) => {
    setConfirmState({
      title: 'Delete product',
      body: `Remove ${product.name} from the catalog? This does not remove the historical movement log.`,
      confirmLabel: 'Delete product',
      variant: 'danger',
      onConfirm: () => {
        setProducts((current) => current.filter((entry) => entry.id !== product.id));
        setSelectedProductIds((current) => current.filter((id) => id !== String(product.id)));
        setConfirmState(null);
        showToast('Product deleted from the catalog.');
      },
    });
  };

  const toggleProductSelection = (productId) => {
    const id = String(productId);
    setSelectedProductIds((current) => (
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
    ));
  };

  const toggleVisibleProductSelection = () => {
    const visibleIds = filteredProducts.map((product) => String(product.id));
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedProductIds.includes(id));
    setSelectedProductIds((current) => (
      allVisibleSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : [...new Set([...current, ...visibleIds])]
    ));
  };

  const updateSelectedCategory = () => {
    if (!bulkCategory) return;
    const selectedIds = new Set(selectedProductIds);
    setProducts((current) => current.map((product) => (
      selectedIds.has(String(product.id)) ? { ...product, category: bulkCategory } : product
    )));
    setSelectedProductIds([]);
    showToast(`Category updated for ${selectedIds.size} products.`);
  };

  const exportSelectedProducts = () => {
    const selectedProducts = products.filter((product) => selectedProductIds.includes(String(product.id)));
    if (!selectedProducts.length) return;
    downloadCsv('stockwise-selected-products.csv', [
      ['Name', 'SKU', 'Category', 'Material', 'Preferred supplier', 'Price', 'Unit', 'Reorder', ...warehouseList],
      ...selectedProducts.map((product) => [
        product.name,
        product.sku,
        product.category,
        product.material || '',
        product.supplierName || suppliers.find((supplier) => String(supplier.id) === String(product.supplierId))?.name || '',
        product.price,
        product.unit,
        product.reorder,
        ...warehouseList.map((location) => product.stock?.[location] || 0),
      ]),
    ]);
  };

  const saveInvoice = (event) => {
    event.preventDefault();
    if (!invoiceForm.party.trim()) {
      showToast('Enter a customer or supplier name.');
      return;
    }
    const amount = Number(invoiceForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('Enter a valid amount greater than zero.');
      return;
    }

    const prefix = invoiceForm.kind === 'Invoice' ? 'INV' : 'BILL';
    const record = {
      id: `${prefix}-${Date.now().toString().slice(-6)}`,
      kind: invoiceForm.kind,
      party: invoiceForm.party.trim(),
      amount,
      dueDate: invoiceForm.dueDate,
      status: 'Unpaid',
    };
    setInvoices((current) => [record, ...current]);
    setInvoiceForm({ kind: 'Invoice', party: '', amount: '', dueDate: '' });
    setModal('');
    showToast(`${invoiceForm.kind} recorded.`);
  };

  const toggleInvoiceStatus = (invoiceId) => {
    setInvoices((current) => current.map((invoice) => (
      invoice.id === invoiceId
        ? { ...invoice, status: invoice.status === 'Paid' ? 'Unpaid' : 'Paid' }
        : invoice
    )));
  };

  const recordPayment = (event) => {
    event.preventDefault();
    const invoice = invoices.find((entry) => String(entry.id) === String(paymentForm.invoiceId));
    const paymentAmount = Number(paymentForm.amount);
    const invoicePayments = invoice
      ? payments.filter((entry) => String(entry.invoiceId) === String(invoice.id))
      : [];
    const paymentError = getPaymentValidationError(invoice, paymentAmount, invoicePayments);
    if (paymentError) {
      if (paymentError === 'Payment exceeds the outstanding balance.') {
        const outstandingBalance = getInvoiceOutstanding(invoice.amount, invoicePayments);
        showToast(`Payment exceeds the outstanding balance of ${new Intl.NumberFormat(undefined, { style: 'currency', currency: settings.currency }).format(outstandingBalance)}.`);
      } else {
        showToast(paymentError);
      }
      return;
    }

    const payment = {
      id: `PAY-${Date.now().toString().slice(-6)}`,
      invoiceId: invoice.id,
      customer: paymentForm.customer || invoice.party,
      amount: paymentAmount,
      method: paymentForm.method,
      date: paymentForm.date || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    };

    setPayments((current) => [payment, ...current]);
    setInvoices((current) => current.map((entry) => {
      if (entry.id !== invoice.id) return entry;
      const nextBalance = getInvoiceOutstanding(
        entry.amount,
        [...payments.filter((item) => String(item.invoiceId) === String(entry.id)), payment]
      );
      return { ...entry, status: nextBalance === 0 ? 'Paid' : 'Unpaid' };
    }));
    setPaymentForm({ invoiceId: '', customer: '', amount: '0', method: 'Bank transfer', date: '' });
    setModal('');
    showToast('Payment recorded and invoice updated.');
  };

  const deleteInvoice = (invoice) => {
    setConfirmState({
      title: 'Delete billing record',
      body: `Remove ${invoice.id} from the billing ledger?`,
      confirmLabel: 'Delete record',
      variant: 'danger',
      onConfirm: () => {
        setInvoices((current) => current.filter((entry) => entry.id !== invoice.id));
        setConfirmState(null);
        showToast('Billing record deleted.');
      },
    });
  };

  const saveWarehouse = (event) => {
    event.preventDefault();
    const name = warehouseForm.name.trim();
    if (!name) {
      showToast('Enter a warehouse or location name.');
      return;
    }
    if (warehouseList.some((location) => location.toLowerCase() === name.toLowerCase())) {
      showToast('This location already exists.');
      return;
    }
    const profile = normalizeWarehouseProfile({ ...warehouseForm, name }, name);
    if (warehouseForm.capacity && !profile.capacity) {
      showToast('Enter a valid positive capacity.');
      return;
    }
    setWarehouseList((current) => [...current, name]);
    setWarehouseProfiles((current) => ({ ...current, [name]: profile }));
    setProducts((current) => current.map((product) => ({
      ...product,
      stock: { ...product.stock, [name]: 0 },
    })));
    setWarehouseForm({ name: '', capacity: '', bins: '' });
    setModal('');
    showToast('Location added.');
  };

  const renameWarehouse = () => {
    if (!renameTarget || !renameValue.trim()) return;
    const nextName = renameValue.trim();
    if (warehouseList.some((location) => location.toLowerCase() === nextName.toLowerCase() && location !== renameTarget)) {
      showToast('A location with that name already exists.');
      return;
    }
    setWarehouseList((current) => current.map((location) => (location === renameTarget ? nextName : location)));
    setWarehouseProfiles((current) => {
      const next = { ...current, [nextName]: normalizeWarehouseProfile(current[renameTarget], nextName) };
      delete next[renameTarget];
      return next;
    });
    setProducts((current) => current.map((product) => {
      const stock = { ...product.stock };
      if (Object.prototype.hasOwnProperty.call(stock, renameTarget)) {
        stock[nextName] = stock[renameTarget];
        delete stock[renameTarget];
      }
      return { ...product, stock };
    }));
    setDocs((current) => current.map((doc) => renameWarehouseInOperation(doc, renameTarget, nextName)));
    setReturns((current) => current.map((item) => ({ ...item, location: item.location === renameTarget ? nextName : item.location })));
    setPurchaseOrders((current) => current.map((order) => ({ ...order, location: order.location === renameTarget ? nextName : order.location })));
    setSalesOrders((current) => current.map((order) => ({ ...order, location: order.location === renameTarget ? nextName : order.location })));
    setShipments((current) => current.map((shipment) => ({ ...shipment, location: shipment.location === renameTarget ? nextName : shipment.location })));
    setRenameTarget('');
    setRenameValue('');
    setModal('');
    showToast('Location renamed.');
  };

  const deleteWarehouse = (location) => {
    if (warehouseList.length <= 1) {
      showToast('At least one location must remain active.');
      return;
    }
    const hasStock = products.some((product) => Number(product.stock?.[location] || 0) > 0);
    const usedInHistory = docs.some((doc) => doc.location === location || String(doc.partner || '').includes(location))
      || returns.some((item) => item.location === location)
      || purchaseOrders.some((order) => order.location === location)
      || salesOrders.some((order) => order.location === location)
      || shipments.some((shipment) => shipment.location === location);
    if (hasStock || usedInHistory) {
      showToast('Clear or relocate stock before removing this location.');
      return;
    }
    setConfirmState({
      title: 'Remove location',
      body: `Delete ${location} from the workspace? This cannot be undone.`,
      confirmLabel: 'Remove location',
      variant: 'danger',
      onConfirm: () => {
        setWarehouseList((current) => current.filter((entry) => entry !== location));
        setWarehouseProfiles((current) => {
          const next = { ...current };
          delete next[location];
          return next;
        });
        setProducts((current) => current.map((product) => {
          const stock = { ...product.stock };
          delete stock[location];
          return { ...product, stock };
        }));
        setConfirmState(null);
        showToast('Location removed from the workspace.');
      },
    });
  };

  const openOperation = (type = 'Receipt') => {
    if (products.length === 0) {
      setModal('product');
      showToast('Add a product first before creating an operation.');
      return;
    }

    const selectedProduct = products[0];
    setOperationForm({
      type,
      productId: String(selectedProduct.id),
      qty: '0',
      counted: '0',
      partner: '',
      location: warehouseList[0] || '',
      destination: warehouseList[1] || warehouseList[0] || '',
    });
    setModal('operation');
  };

  const saveOperation = (event) => {
    event.preventDefault();
    const product = products.find((entry) => entry.id === Number(operationForm.productId));
    if (!product) {
      showToast('Choose a valid product before recording an operation.');
      return;
    }

    if (!operationForm.location) {
      showToast('Choose a valid source location.');
      return;
    }

    const qty = Number(operationForm.type === 'Adjustment' ? operationForm.counted : operationForm.qty);
    if (!Number.isFinite(qty) || qty < 0 || (operationForm.type !== 'Adjustment' && qty === 0)) {
      showToast('Enter a valid non-negative quantity.');
      return;
    }

    if (operationForm.type === 'Internal' && (!operationForm.destination || operationForm.destination === operationForm.location)) {
      showToast('Choose a different destination for an internal transfer.');
      return;
    }

    const stockResult = applyInventoryOperation(product.stock, {
      type: operationForm.type,
      quantity: qty,
      location: operationForm.location,
      destination: operationForm.destination,
    });
    if (stockResult.error) {
      showToast(stockResult.error);
      return;
    }

    const affectedLocations = operationForm.type === 'Internal'
      ? [operationForm.destination]
      : [operationForm.location];
    const capacityError = affectedLocations
      .map((location) => validateWarehouseCapacity(
        Object.values(products).length
          ? products.reduce((sum, entry) => sum + Number(stockResult.stock?.[location] || entry.stock?.[location] || 0), 0)
          : 0,
        warehouseProfiles[location]?.capacity,
      ))
      .find(Boolean);
    if (capacityError) {
      showToast(capacityError);
      return;
    }

    const updatedProducts = products.map((entry) => (
      entry.id === product.id ? { ...entry, stock: stockResult.stock } : entry
    ));

    setProducts(updatedProducts);
    const reference = `${operationForm.type === 'Receipt' ? 'RCV' : operationForm.type === 'Delivery' ? 'OUT' : operationForm.type === 'Internal' ? 'INT' : 'ADJ'}-${Date.now().toString().slice(-5)}`;
    const actionDoc = {
      id: reference,
      type: operationForm.type,
      product: product.name,
      qty,
      location: operationForm.location,
      partner: operationForm.type === 'Internal' ? `${operationForm.location} → ${operationForm.destination}` : operationForm.partner || 'Manual entry',
      status: 'Done',
      actor: displayUser.name,
      date: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    };
    setDocs((current) => [actionDoc, ...current]);
    setModal('');
    showToast(`${operationForm.type} recorded successfully.`);
  };

  const processImportSources = (sources, columnMapping = {}) => {
    const validRows = [];
    let skipped = 0;
    const parseIssues = [];
    const rowIssues = [];
    const seenSkus = new Set(products.map((product) => String(product.sku || '').trim().toUpperCase()));

    for (const source of sources) {
      const extension = source.extension;
      if (!['csv', 'tsv', 'txt', 'json'].includes(extension)) {
        parseIssues.push(`${source.name} (unsupported format)`);
        continue;
      }

      try {
        if (source.error) throw source.error;
        const result = parseProductImportText(source.text, extension, settings.defaultUnit, columnMapping);
        skipped += result.skipped;
        rowIssues.push(...result.errors.map((issue) => ({ file: source.name, ...issue })));
        result.products.forEach((product) => {
          if (seenSkus.has(product.sku)) {
            skipped += 1;
            rowIssues.push({
              file: file.name,
              row: product.sourceRow ?? '—',
              issue: `SKU "${product.sku}" already exists in the catalog or another selected file.`,
            });
            return;
          }
          seenSkus.add(product.sku);
          validRows.push({ ...product, sourceFile: source.name });
        });
      } catch (error) {
        parseIssues.push(`${source.name} (${error.message || 'unable to parse'})`);
      }
    }

    setImportPreview(validRows);
    setImportErrors([
      ...rowIssues,
      ...parseIssues.map((issue) => ({ file: issue, row: '—', issue: 'File could not be imported. Check its format and contents.' })),
    ]);
    setImportMessage(
      validRows.length
        ? `${validRows.length} valid product rows ready to import${skipped ? `; ${skipped} rows skipped` : ''}.`
        : `No valid rows were detected. ${parseIssues.join(', ') || 'Review the file format and try again.'}`
    );
  };

  const previewImport = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const sources = await Promise.all(files.map(async (file) => {
      const source = { name: file.name, extension: file.name.split('.').pop()?.toLowerCase() };
      try {
        return { ...source, text: await file.text() };
      } catch (error) {
        return { ...source, error };
      }
    }));
    setImportSources(sources);
    setImportColumnMapping({});

    let headers = [];
    for (const source of sources) {
      if (!['csv', 'tsv', 'txt', 'json'].includes(source.extension) || source.error) continue;
      try {
        headers = parseProductImportText(source.text, source.extension, settings.defaultUnit).headers;
        if (headers.length) break;
      } catch {
        continue;
      }
    }
    setImportHeaders(headers);
    processImportSources(sources);
  };

  const updateImportMapping = (field, sourceHeader) => {
    const nextMapping = { ...importColumnMapping };
    if (sourceHeader) nextMapping[field] = sourceHeader;
    else delete nextMapping[field];
    setImportColumnMapping(nextMapping);
    processImportSources(importSources, nextMapping);
  };

  const openImportModal = () => {
    setImportPreview([]);
    setImportMessage('');
    setImportErrors([]);
    setImportSources([]);
    setImportHeaders([]);
    setImportColumnMapping({});
    setModal('import');
  };

  const commitImport = () => {
    if (!importPreview.length) {
      showToast('Import preview is empty.');
      return;
    }

    const existingSkus = new Set(products.map((product) => String(product.sku || '').trim().toUpperCase()));
    const inserted = [];
    let skippedDuplicates = 0;
    importPreview.forEach((item, index) => {
      if (existingSkus.has(String(item.sku || '').trim().toUpperCase())) {
        skippedDuplicates += 1;
        return;
      }
      const newProduct = {
        id: Date.now() + index,
        name: item.name,
        sku: item.sku,
        barcode: item.barcode || '',
        description: item.description || '',
        category: item.category,
        supplierId: suppliers.find((supplier) => supplier.name.trim().toLowerCase() === String(item.supplierName || '').trim().toLowerCase())?.id || '',
        supplierName: item.supplierName || '',
        material: item.material,
        price: item.price,
        unit: item.unit,
        reorder: item.reorder,
        stock: Object.fromEntries(warehouseList.map((location, locationIndex) => [location, locationIndex === 0 ? item.quantity : 0])),
      };
      inserted.push(newProduct);
      existingSkus.add(item.sku);
    });

    if (inserted.length) {
      setProducts((current) => [...inserted, ...current]);
    }

    setModal('');
    setImportPreview([]);
    setImportMessage('');
    setImportErrors([]);
    showToast(`${inserted.length} product${inserted.length === 1 ? '' : 's'} imported${skippedDuplicates ? `; ${skippedDuplicates} duplicate${skippedDuplicates === 1 ? '' : 's'} skipped` : ''}.`);
  };

  const filteredProducts = React.useMemo(() => {
    return [...products]
      .filter((product) => {
        const haystack = `${product.name} ${product.sku} ${product.barcode || ''} ${product.description || ''} ${product.category} ${product.material || ''}`.toLowerCase();
        const matchesSearch = haystack.includes(search.toLowerCase());
        const matchesCategory = categoryFilter === 'All' || product.category === categoryFilter;
        const matchesLocation = locationFilter === 'All' || Number(product.stock?.[locationFilter] || 0) > 0;
        return matchesSearch && matchesCategory && matchesLocation;
      })
      .sort((first, second) => {
        const direction = productSort.endsWith('-desc') ? -1 : 1;
        const field = productSort.replace(/-(asc|desc)/, '');
        if (field === 'stock') {
          return (totalStock(first) - totalStock(second)) * direction;
        }
        if (field === 'price') {
          return ((Number(first.price) || 0) - (Number(second.price) || 0)) * direction;
        }
        return (String(first[field] || '').localeCompare(String(second[field] || ''))) * direction;
      });
  }, [products, search, categoryFilter, locationFilter, productSort]);

  const visibleOperationDocs = React.useMemo(() => {
    return docs.filter((doc) => {
      const matchesType = typeFilter === 'All' || doc.type === typeFilter;
      const matchesStatus = statusFilter === 'All' || doc.status === statusFilter;
      const matchesLocation = locationFilter === 'All' || doc.location === locationFilter || String(doc.partner || '').includes(locationFilter);
      const matchesSearch = `${doc.id} ${doc.product} ${doc.partner || ''}`.toLowerCase().includes(search.toLowerCase());
      return matchesType && matchesStatus && matchesLocation && matchesSearch;
    });
  }, [docs, search, typeFilter, statusFilter, locationFilter]);

  const lowStockProducts = products.filter((product) => isLowStock(product, settings.alertRule));
  const outOfStockCount = products.filter((product) => totalStock(product) === 0).length;
  const totalInventoryValue = products.reduce((sum, product) => sum + totalStock(product) * Number(product.price || 0), 0);
  const outstandingInvoiceTotal = invoices
    .filter((invoice) => invoice.kind === 'Invoice' && invoice.status === 'Unpaid')
    .reduce((sum, invoice) => {
      const received = payments
        .filter((payment) => String(payment.invoiceId) === String(invoice.id))
        .reduce((paid, payment) => paid + Number(payment.amount || 0), 0);
      return sum + Math.max(Number(invoice.amount || 0) - received, 0);
    }, 0);
  const totalTrackedUnits = products.reduce((sum, product) => sum + totalStock(product), 0);
  const activeProductCount = products.filter((product) => totalStock(product) > 0).length;
  const reservedStock = React.useMemo(() => salesOrders
    .filter((order) => ['Confirmed', 'Picking', 'Packed'].includes(order.status))
    .reduce((reserved, order) => {
      const key = `${order.productId}:${order.location}`;
      reserved[key] = (reserved[key] || 0) + Number(order.qty || 0);
      return reserved;
    }, {}), [salesOrders]);
  const returnableSalesOrders = salesOrders.filter((order) => {
    if (order.status !== 'Shipped') return false;
    const alreadyReturned = returns
      .filter((item) => item.orderId === order.id && item.status !== 'Rejected')
      .reduce((sum, item) => sum + Number(item.qty || 0), 0);
    return alreadyReturned < Number(order.qty || 0);
  });
  const currentReceipts = docs.filter((doc) => doc.type === 'Receipt' && doc.status !== 'Done').length;
  const approvalQueue = React.useMemo(() => {
    const queue = [];
    returns.filter((item) => item.status === 'Pending').forEach((item) => {
      queue.push({ id: `APP-${item.id}`, type: 'Return', subject: item.productName, reference: item.id, relatedId: item.id, amount: item.qty, status: item.status, createdAt: item.createdAt });
    });
    purchaseOrders.filter((order) => order.status === 'Draft').forEach((order) => {
      queue.push({ id: `APP-PO-${order.id}`, type: 'Purchase order', subject: order.productName, reference: order.id, relatedId: order.id, amount: Number(order.total || 0), status: order.status, createdAt: order.createdAt });
    });
    salesOrders.filter((order) => order.status === 'Draft').forEach((order) => {
      queue.push({ id: `APP-SO-${order.id}`, type: 'Sales order', subject: order.productName, reference: order.id, relatedId: order.id, amount: Number(order.total || 0), status: order.status, createdAt: order.createdAt });
    });
    return queue.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [returns, purchaseOrders, salesOrders]);
  const auditTrail = React.useMemo(() => {
    const entries = [
      ...docs.map((doc) => ({
        id: `op-${doc.id}`,
        type: 'Inventory movement',
        event: `${doc.type} · ${doc.product}`,
        actor: doc.actor || 'System',
        reference: doc.id,
        status: doc.status,
        timestamp: doc.date || null,
        amount: doc.qty,
        amountType: 'quantity',
      })),
      ...purchaseOrders.map((order) => ({
        id: `po-${order.id}`,
        type: 'Purchase order',
        event: `PO ${order.status} · ${order.productName}`,
        actor: order.actor || 'Procurement',
        reference: order.id,
        status: order.status,
        timestamp: order.createdAt || null,
        amount: Number(order.total || 0),
        amountType: 'currency',
      })),
      ...salesOrders.map((order) => ({
        id: `so-${order.id}`,
        type: 'Sales order',
        event: `SO ${order.status} · ${order.productName}`,
        actor: order.actor || 'Sales',
        reference: order.id,
        status: order.status,
        timestamp: order.createdAt || null,
        amount: Number(order.total || 0),
        amountType: 'currency',
      })),
      ...returns.map((item) => ({
        id: `ret-${item.id}`,
        type: 'Return',
        event: `Return ${item.status} · ${item.productName}`,
        actor: item.actor || 'Customer service',
        reference: item.id,
        status: item.status,
        timestamp: item.createdAt || null,
        amount: Number(item.qty || 0),
        amountType: 'quantity',
      })),
      ...payments.map((payment) => ({
        id: `pay-${payment.id || payment.invoiceId}`,
        type: 'Payment',
        event: `Payment received · ${payment.customer || payment.invoiceId}`,
        actor: payment.actor || 'Finance',
        reference: payment.invoiceId || payment.id,
        status: payment.status || 'Recorded',
        timestamp: payment.date || payment.createdAt || null,
        amount: Number(payment.amount || 0),
        amountType: 'currency',
      })),
    ];

    return entries
      .filter((entry) => entry && entry.timestamp)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 24);
  }, [docs, purchaseOrders, salesOrders, returns, payments]);
  const forecastSignals = React.useMemo(() => {
    return products
      .map((product) => {
        const stock = totalStock(product);
        const reorder = Number(product.reorder) || 0;
        const demand = getRecentSalesDemand(salesOrders, product.name);
        const recentReceipts = docs
          .filter((doc) => doc.product === product.name && doc.type === 'Receipt')
          .reduce((sum, doc) => sum + Number(doc.qty || 0), 0);
        const recentDeliveries = docs
          .filter((doc) => doc.product === product.name && doc.type === 'Delivery')
          .reduce((sum, doc) => sum + Number(doc.qty || 0), 0);
        const netMovement = recentReceipts - recentDeliveries;
        const avgDailyDemand = demand.units === null ? null : demand.units / 30;
        const coverageDays = avgDailyDemand > 0 ? stock / avgDailyDemand : null;
        const evidence = demand.units === null
          ? 'Dated demand unavailable'
          : `${demand.orderCount} fulfilled order${demand.orderCount === 1 ? '' : 's'} in 30d`;
        const confidence = demand.units === null ? 'None' : demand.orderCount >= 3 ? 'Measured' : 'Limited';

        let risk = 'Stable';
        let recommendation = 'Maintain';

        if (stock <= reorder) {
          risk = 'Critical';
          recommendation = 'Reorder now';
        }

        return {
          ...product,
          stock,
          reorder,
          demand: demand.units,
          demandOrderCount: demand.orderCount,
          hasUndatedDemand: demand.hasUndatedOrders,
          evidence,
          confidence,
          netMovement,
          coverageDays,
          risk,
          recommendation,
        };
      })
      .sort((a, b) => {
        const riskOrder = { Critical: 0, Watch: 1, Stable: 2, Excess: 3 };
        return riskOrder[a.risk] - riskOrder[b.risk] || (b.coverageDays ?? -1) - (a.coverageDays ?? -1);
      })
      .slice(0, 12);
  }, [products, salesOrders, docs]);
  const measuredCoverageDays = forecastSignals
    .map((item) => item.coverageDays)
    .filter((days) => Number.isFinite(days));
  const averageCoverageDays = measuredCoverageDays.length
    ? measuredCoverageDays.reduce((sum, days) => sum + days, 0) / measuredCoverageDays.length
    : null;
  const safetyStockRecommendations = [];
  const abcSegmentation = React.useMemo(() => {
    const fulfilledOrders = salesOrders.filter((order) => order.status === 'Shipped');
    const productSales = products
      .map((product) => {
        const shippedOrderValue = fulfilledOrders
          .filter((order) => order.productName === product.name)
          .reduce((sum, order) => sum + Number(order.total || 0), 0);
        const units = fulfilledOrders
          .filter((order) => order.productName === product.name)
          .reduce((sum, order) => sum + Number(order.qty || 0), 0);
        return { ...product, shippedOrderValue, units };
      })
      .filter((item) => item.shippedOrderValue > 0 || item.units > 0)
      .sort((a, b) => b.shippedOrderValue - a.shippedOrderValue);

    const totalShippedValue = productSales.reduce((sum, item) => sum + item.shippedOrderValue, 0);

    let cumulative = 0;
    return productSales.map((item) => {
      cumulative += totalShippedValue > 0 ? item.shippedOrderValue / totalShippedValue : 0;
      let className = 'C';
      if (cumulative <= 0.7) className = 'A';
      else if (cumulative <= 0.9) className = 'B';

      return {
        ...item,
        contributionPct: totalShippedValue > 0 ? (item.shippedOrderValue / totalShippedValue) * 100 : 0,
        cumulativePct: cumulative * 100,
        className,
      };
    }).slice(0, 8);
  }, [products, salesOrders]);
  const exceptionQueue = React.useMemo(() => {
    const queue = [];

    lowStockProducts.forEach((product) => {
      queue.push({
        id: `EXC-${product.id}`,
        type: 'Low stock',
        subject: product.name,
        detail: `${formatNumber(totalStock(product))} units on hand against a reorder point of ${formatNumber(product.reorder)}`,
        severity: totalStock(product) === 0 ? 'Critical' : 'Watch',
        owner: 'Operations',
        relatedPage: 'Products',
      });
    });

    approvalQueue.forEach((item) => {
      queue.push({
        id: `EXC-${item.id}`,
        type: item.type,
        subject: item.subject,
        detail: `Reference ${item.reference} is awaiting approval`,
        severity: item.status === 'Draft' ? 'Watch' : 'Critical',
        owner: 'Approvals',
        relatedPage: 'Approvals',
      });
    });

    shipments.filter((shipment) => shipment.status !== 'Delivered').forEach((shipment) => {
      queue.push({
        id: `EXC-${shipment.id}`,
        type: 'Shipment',
        subject: shipment.orderId,
        detail: `${shipment.carrier} is ${shipment.status.toLowerCase()} for ${shipment.tracking || 'tracking not assigned'}`,
        severity: shipment.status === 'Delayed' ? 'Critical' : 'Watch',
        owner: 'Fulfillment',
        relatedPage: 'Fulfillment',
      });
    });

    invoices.filter((item) => item.status === 'Unpaid' && item.dueDate && new Date(item.dueDate) < new Date()).forEach((item) => {
      queue.push({
        id: `EXC-${item.id}`,
        type: 'Invoice',
        subject: item.party,
        detail: `${item.kind} ${item.id} is overdue`,
        severity: 'Watch',
        owner: 'Finance',
        relatedPage: 'Billing',
      });
    });

    return queue.slice(0, 12);
  }, [lowStockProducts, approvalQueue, shipments, invoices]);
  const procurementRecommendations = React.useMemo(() => {
    return products
      .map((product) => {
        const stock = totalStock(product);
        const reorder = Number(product.reorder) || 0;
        const demand = getRecentSalesDemand(salesOrders, product.name);
        const recommendedQty = Math.max(reorder - stock, 0);
        const supplier = suppliers.find((entry) => (
          String(entry.id) === String(product.supplierId)
          || entry.name === product.supplierName
          || entry.name === product.supplier
        ));
        const priority = stock === 0 ? 'Critical' : stock <= reorder ? 'High' : 'Medium';

        return {
          ...product,
          stock,
          reorder,
          demand: demand.units,
          hasUndatedDemand: demand.hasUndatedOrders,
          recommendedQty,
          supplierName: supplier?.name || 'No supplier',
          priority,
        };
      })
      .filter((item) => item.stock <= item.reorder)
      .sort((a, b) => {
        const priorityOrder = { Critical: 0, High: 1, Medium: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      })
      .slice(0, 5);
  }, [products, salesOrders, suppliers]);
  const supplierSlaSummary = React.useMemo(() => {
    return suppliers.map((supplier) => {
      const activePOrders = purchaseOrders.filter((order) => order.supplierName === supplier.name);
      const openOrders = activePOrders.filter((order) => order.status !== 'Received').length;
      const lateShipments = null;
      const completedReceipts = activePOrders.filter((order) => order.status === 'Received').length;
      const onTimeRate = null;
      const configuredLeadTime = Number(supplier.leadTime);
      const leadTime = Number.isFinite(configuredLeadTime) && configuredLeadTime > 0 ? configuredLeadTime : null;
      let riskLevel = leadTime === null ? 'Open' : 'Healthy';
      if ((leadTime !== null && leadTime > 14) || openOrders > 2) riskLevel = 'Watch';
      if ((leadTime !== null && leadTime > 21) || openOrders > 4) riskLevel = 'Critical';

      return {
        ...supplier,
        leadTime,
        activePOrders,
        openOrders,
        lateShipments,
        completedReceipts,
        onTimeRate,
        riskLevel,
      };
    }).sort((a, b) => {
              const riskRank = { Critical: 0, Watch: 1, Healthy: 2, Open: 3 };
      return riskRank[a.riskLevel] - riskRank[b.riskLevel] || b.onTimeRate - a.onTimeRate;
    });
  }, [suppliers, purchaseOrders, shipments]);
  const fulfillmentRisk = React.useMemo(() => {
    return shipments
      .map((shipment) => {
        const order = salesOrders.find((entry) => entry.id === shipment.orderId);
        const product = products.find((entry) => entry.id === shipment.productId);
        const stockNow = product ? Number(product.stock?.[shipment.location] || 0) : 0;
        const onTimeRisk = shipment.status === 'Delayed' ? 'Critical' : shipment.status === 'In Transit' ? 'Watch' : 'Healthy';
        return {
          ...shipment,
          order,
          product,
          stockNow,
          onTimeRisk,
          dispatchHealth: shipment.status === 'Ready' && stockNow >= Number(shipment.qty || 0) ? 'Ready' : shipment.status === 'In Transit' ? 'In transit' : shipment.status === 'Delayed' ? 'Delayed' : 'Check',
        };
      })
      .sort((a, b) => {
        const riskOrder = { Critical: 0, Watch: 1, Healthy: 2 };
        return riskOrder[a.onTimeRisk] - riskOrder[b.onTimeRisk] || new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });
  }, [shipments, salesOrders, products]);
  const marginSignals = React.useMemo(() => {
    return products
      .map((product) => {
        const sellPrice = Number(product.price || 0);
        if (!Number.isFinite(sellPrice) || sellPrice <= 0) return null;
        if (product.unitCost === null || product.unitCost === undefined || product.unitCost === '') return null;
        const unitCost = Number(product.unitCost);
        if (!Number.isFinite(unitCost) || unitCost < 0) return null;
        const marginPercent = sellPrice > 0 ? ((sellPrice - unitCost) / sellPrice) * 100 : 0;
        const unitsOnHand = totalStock(product);
        const unitsSold = salesOrders
          .filter((order) => order.productName === product.name && order.status === 'Shipped')
          .reduce((sum, order) => sum + Number(order.qty || 0), 0);
        const potentialGross = unitsSold * sellPrice;

        let health = 'Healthy';
        if (marginPercent < 25 || unitsOnHand === 0) health = 'Watch';
        if (marginPercent < 15 || unitsOnHand === 0 && unitsSold > 0) health = 'Critical';

        return {
          ...product,
          sellPrice,
          unitCost,
          marginPercent,
          unitsOnHand,
          unitsSold,
          potentialGross,
          health,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const healthOrder = { Critical: 0, Watch: 1, Healthy: 2 };
        return healthOrder[a.health] - healthOrder[b.health] || b.marginPercent - a.marginPercent;
      })
      .slice(0, 6);
  }, [products, salesOrders]);
  const attentionItems = lowStockProducts.length > 0 ? lowStockProducts.slice(0, 3) : products.slice(0, 3);
  const customerPerformance = React.useMemo(() => {
    return customers
      .map((customer) => {
        const customerOrders = salesOrders.filter((order) => order.customerName === customer.name);
        const revenue = customerOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
        const units = customerOrders.filter((order) => order.status === 'Shipped').reduce((sum, order) => sum + Number(order.qty || 0), 0);
        const returnedUnits = returns
          .filter((item) => item.customerName === customer.name && item.status !== 'Rejected')
          .reduce((sum, item) => sum + Number(item.qty || 0), 0);
        const avgOrderValue = customerOrders.length ? revenue / customerOrders.length : 0;
        const lastOrder = customerOrders.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
        const accountHealth = returnedUnits > 0 ? 'Returns recorded' : 'No returns';

        return {
          ...customer,
          revenue,
          units,
          avgOrderValue,
          returnedUnits,
          orderCount: customerOrders.length,
          lastOrderDate: lastOrder?.createdAt || '—',
          accountHealth,
        };
      })
      .sort((a, b) => {
        const healthOrder = { Critical: 0, Watch: 1, Stable: 2 };
        return healthOrder[a.accountHealth] - healthOrder[b.accountHealth] || b.revenue - a.revenue;
      });
  }, [customers, salesOrders, returns, products]);
  const executiveSignals = React.useMemo(() => {
    const totalRevenue = salesOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const deliveredCount = shipments.filter((shipment) => shipment.status === 'Delivered').length;
    const onTimeRate = shipments.length ? (deliveredCount / shipments.length) * 100 : null;
    const fulfilledSalesOrders = salesOrders.filter((order) => order.status === 'Shipped');
    const shippedOrderIds = new Set(fulfilledSalesOrders.map((order) => order.id));
    const productSalesUnits = fulfilledSalesOrders.reduce((sum, order) => sum + Number(order.qty || 0), 0);
    const returnedUnits = returns
      .filter((item) => item.status === 'Approved' && shippedOrderIds.has(item.orderId))
      .reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const returnRate = productSalesUnits > 0 ? (returnedUnits / productSalesUnits) * 100 : null;
    const inventoryValue = products.reduce((sum, product) => sum + totalStock(product) * Number(product.price || 0), 0);
    const supplierLeadTimes = suppliers
      .map((supplier) => Number(supplier.leadTime))
      .filter((leadTime) => Number.isFinite(leadTime) && leadTime > 0);
    const avgSupplierSla = supplierLeadTimes.length
      ? supplierLeadTimes.reduce((sum, leadTime) => sum + leadTime, 0) / supplierLeadTimes.length
      : null;

    return [
      { label: 'Sales order value', value: moneyFormatter.format(totalRevenue), status: totalRevenue > 0 ? 'Healthy' : 'Watch' },
      { label: 'Gross margin', value: 'Not tracked', status: 'Open' },
      { label: 'Shipment delivery completion', value: onTimeRate === null ? '—' : `${Math.round(onTimeRate)}%`, status: onTimeRate === null ? 'Open' : onTimeRate >= 90 ? 'Healthy' : onTimeRate >= 75 ? 'Watch' : 'Critical' },
      { label: 'Return rate', value: returnRate === null ? '—' : `${Math.round(returnRate)}%`, status: returnRate === null ? 'Open' : returnRate <= 8 ? 'Healthy' : returnRate <= 15 ? 'Watch' : 'Critical' },
      { label: 'Stock value at listed price', value: moneyFormatter.format(inventoryValue), status: inventoryValue > 0 ? 'Healthy' : 'Watch' },
      { label: 'Average supplier lead time', value: avgSupplierSla === null ? '—' : `${Math.round(avgSupplierSla)}d`, status: avgSupplierSla === null ? 'Open' : avgSupplierSla <= 10 ? 'Healthy' : avgSupplierSla <= 14 ? 'Watch' : 'Critical' },
    ];
  }, [salesOrders, shipments, returns, products, suppliers, moneyFormatter]);
  const cashCycle = React.useMemo(() => {
    const paidAmount = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const outstandingReceivables = invoices
      .filter((invoice) => invoice.kind === 'Invoice' && invoice.status === 'Unpaid')
      .reduce((sum, invoice) => {
        const received = payments
          .filter((payment) => String(payment.invoiceId) === String(invoice.id))
          .reduce((paid, payment) => paid + Number(payment.amount || 0), 0);
        return sum + Math.max(Number(invoice.amount || 0) - received, 0);
      }, 0);
    const purchaseCommitments = purchaseOrders.filter((order) => order.status !== 'Received').reduce((sum, order) => sum + Number(order.total || 0), 0);
    const knownLeadTimes = suppliers
      .map((supplier) => Number(supplier.leadTime))
      .filter((leadTime) => Number.isFinite(leadTime) && leadTime > 0);
    const supplierLeadAverage = knownLeadTimes.length
      ? knownLeadTimes.reduce((sum, leadTime) => sum + leadTime, 0) / knownLeadTimes.length
      : null;
    const collectionCycle = null;
    const serviceHealth = supplierLeadAverage === null ? 'Open' : supplierLeadAverage <= 10 ? 'Healthy' : supplierLeadAverage <= 15 ? 'Watch' : 'Critical';

    return {
      paidAmount,
      outstandingReceivables,
      purchaseCommitments,
      collectionCycle,
      supplierLeadAverage,
      serviceHealth,
    };
  }, [payments, invoices, purchaseOrders, salesOrders, suppliers]);
  const inventoryAging = React.useMemo(() => {
    return products
      .map((product) => {
        const stock = totalStock(product);
        const recentMovements = docs
          .filter((doc) => doc.product === product.name)
          .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        const lastMovementDate = recentMovements[0]?.date ? new Date(recentMovements[0].date) : null;
        const ageDays = lastMovementDate && Number.isFinite(lastMovementDate.getTime())
          ? Math.max(0, Math.round((Date.now() - lastMovementDate.getTime()) / 86400000))
          : null;
        const demand = salesOrders.filter((order) => order.productName === product.name && order.status === 'Shipped').reduce((sum, order) => sum + Number(order.qty || 0), 0);
        let agingStatus = ageDays === null ? 'Open' : 'Healthy';
        if (stock === 0 || ageDays > 45) agingStatus = 'Stale';
        if (stock > 0 && ageDays > 30 && demand === 0) agingStatus = 'Slow';
        if (stock > 0 && ageDays > 60) agingStatus = 'Critical';

        return {
          ...product,
          stock,
          ageDays,
          demand,
          agingStatus,
        };
      })
      .sort((a, b) => {
        const statusOrder = { Critical: 0, Stale: 1, Slow: 2, Healthy: 3, Open: 4 };
        return statusOrder[a.agingStatus] - statusOrder[b.agingStatus] || (b.ageDays ?? -1) - (a.ageDays ?? -1);
      })
      .slice(0, 8);
  }, [products, docs, salesOrders]);
  const replenishmentCoverage = React.useMemo(() => {
    const windowDays = 30;
    const now = Date.now();

    return products
      .map((product) => {
        const stock = totalStock(product);
        const demand = getRecentSalesDemand(salesOrders, product.name, now);
        const avgDailyDemand = demand.units === null ? null : demand.units / windowDays;
        const supplier = suppliers.find((entry) => (
          String(entry.id) === String(product.supplierId)
          || entry.name === product.supplierName
          || entry.name === product.supplier
        ));
        const supplierLead = supplier && Number.isFinite(Number(supplier.leadTime)) ? Number(supplier.leadTime) : null;
        const daysCover = avgDailyDemand > 0 ? stock / avgDailyDemand : null;

        let coverStatus = 'Healthy';
        if (demand.units === null) coverStatus = 'Open';
        else if (stock === 0 || (daysCover !== null && daysCover < 7)) coverStatus = 'Critical';
        else if ((daysCover !== null && daysCover < 14) || stock <= Number(product.reorder || 0)) coverStatus = 'Watch';

        return {
          ...product,
          stock,
          avgDailyDemand,
          daysCover,
          supplierLead,
          hasUndatedDemand: demand.hasUndatedOrders,
          coverStatus,
        };
      })
      .filter((item) => item.stock > 0 || item.avgDailyDemand > 0 || Number(item.reorder || 0) > 0)
      .sort((a, b) => {
        const statusOrder = { Critical: 0, Watch: 1, Healthy: 2, Open: 3 };
        return statusOrder[a.coverStatus] - statusOrder[b.coverStatus] || (a.daysCover ?? Infinity) - (b.daysCover ?? Infinity);
      })
      .slice(0, 8);
  }, [products, salesOrders, suppliers]);
  const supplierRiskBoard = React.useMemo(() => {
    return supplierSlaSummary
      .map((supplier) => ({
        ...supplier,
        openValue: purchaseOrders
          .filter((order) => order.supplierName === supplier.name && order.status !== 'Received')
          .reduce((sum, order) => sum + Number(order.total || 0), 0),
      }))
      .sort((a, b) => {
        const riskOrder = { Critical: 0, Watch: 1, Healthy: 2 };
        return riskOrder[a.riskLevel] - riskOrder[b.riskLevel] || b.openValue - a.openValue;
      })
      .slice(0, 6);
  }, [supplierSlaSummary, purchaseOrders]);
  const warehousePerformance = React.useMemo(() => {
    return warehouseList
      .map((location) => {
        const totalUnits = products.reduce((sum, product) => sum + Number(product.stock?.[location] || 0), 0);
        const activeProducts = products.filter((product) => Number(product.stock?.[location] || 0) > 0).length;
                                const lowStockProductsAtLocation = products.filter((product) => isLowStock(product, settings.alertRule) && Number(product.stock?.[location] || 0) > 0).length;
        const inbound = docs.filter((doc) => doc.location === location && doc.type === 'Receipt').reduce((sum, doc) => sum + Number(doc.qty || 0), 0);
        const outbound = docs.filter((doc) => doc.location === location && doc.type === 'Delivery').reduce((sum, doc) => sum + Number(doc.qty || 0), 0);
        const netFlow = inbound - outbound;
        const coverage = products.length ? (activeProducts / products.length) * 100 : 0;
        const capacityStatus = getWarehouseCapacityStatus(totalUnits, warehouseProfiles[location]?.capacity);
        let health = 'Healthy';
        if (lowStockProductsAtLocation > 3 || coverage < 35) health = 'Watch';
        if (lowStockProductsAtLocation > 6 || coverage < 20) health = 'Critical';
        if (capacityStatus.status === 'Near capacity' && health === 'Healthy') health = 'Watch';
        if (capacityStatus.status === 'Full') health = 'Critical';

        return {
          location,
          totalUnits,
          activeProducts,
          lowStockProductsAtLocation,
          inbound,
          outbound,
          netFlow,
          coverage,
          capacityStatus,
          health,
        };
      })
      .sort((a, b) => {
        const healthOrder = { Critical: 0, Watch: 1, Healthy: 2 };
        return healthOrder[a.health] - healthOrder[b.health] || b.totalUnits - a.totalUnits;
      });
  }, [warehouseList, warehouseProfiles, products, docs, settings]);
  const todayPriorityText = products.length === 0
    ? 'Your workspace is ready. Add your first item to start tracking inventory.'
    : lowStockProducts.length
      ? `${lowStockProducts.length} item${lowStockProducts.length === 1 ? '' : 's'} need attention before the next stock review.`
      : 'Everything in your catalog is within the current stock threshold.';

  const navItems = [
    { heading: 'Workspace', items: [['Today', '⌂'], ['Dashboard', '▦'], ['Products', '◫'], ['Operations', '⇄'], ['Warehouses', '⌂'], ['Suppliers', '◎'], ['Procurement', '⇣'], ['Customers', '◍'], ['Sales', '↗'], ['Fulfillment', '✦'], ['Returns', '↺'], ['Approvals', '✓'], ['Reports', '▥'], ['Billing', '$'], ['Access', '🔐'], ['Audit', '◔'], ['Forecasting', '◢'], ['Exceptions', '⚑']] },
    { heading: 'Management', items: [['Settings', '⚙']] },
  ];

  const visibleNavItems = navItems.map((group) => ({
    ...group,
    items: group.items.filter(([label]) => canAccessPage(label)),
  }));

  const commandPaletteItems = [
    { label: 'Open dashboard', page: 'Dashboard', icon: '▦' },
    { label: 'View today command center', page: 'Today', icon: '⌂' },
    { label: 'Add product', action: () => openProductModal(), icon: '＋' },
    { label: 'Add customer', action: () => { setCustomerForm({ name: '', email: '', phone: '', tier: 'Standard', region: 'North' }); setModal('customer'); }, icon: '◍' },
    { label: 'New sales order', action: () => { setSalesForm({ customerId: customers[0]?.id || '', productId: products[0]?.id || '', qty: '1', unitPrice: '0', status: 'Draft', location: warehouseList[0] || '', expectedDate: '' }); setModal('sales'); }, icon: '↗' },
    { label: 'Create shipment', action: () => { setShipmentForm({ orderId: salesOrders[0]?.id || '', carrier: 'UPS', tracking: '', status: 'Ready', location: warehouseList[0] || '' }); setModal('shipment'); }, icon: '✦' },
    { label: 'Record payment', action: () => { setPaymentForm({ invoiceId: invoices[0]?.id || '', customer: invoices[0]?.party || '', amount: String(invoices[0]?.amount || '0'), method: 'Bank transfer', date: new Date().toISOString().slice(0, 10) }); setModal('payment'); }, icon: '$' },
    { label: 'Process return', action: () => { setReturnForm({ orderId: returnableSalesOrders[0]?.id || '', customerId: returnableSalesOrders[0]?.customerId || '', productId: returnableSalesOrders[0]?.productId || '', qty: '1', reason: 'Damaged', location: returnableSalesOrders[0]?.location || warehouseList[0] || '' }); setModal('return'); }, icon: '↺' },
    { label: 'Review approvals', page: 'Approvals', icon: '✓' },
    { label: 'Access control', page: 'Access', icon: '🔐' },
    { label: 'Open audit trail', page: 'Audit', icon: '◔' },
    { label: 'View forecasting', page: 'Forecasting', icon: '◢' },
    { label: 'Open action center', page: 'Exceptions', icon: '⚑' },
    { label: 'New receipt', action: () => openOperation('Receipt'), icon: '↓' },
    { label: 'New transfer', action: () => openOperation('Internal'), icon: '⇄' },
    { label: 'Add warehouse', action: () => { setWarehouseForm({ name: '', capacity: '', bins: '' }); setModal('warehouse'); }, icon: '⌂' },
    { label: 'Import inventory', action: openImportModal, icon: '↥' },
    { label: 'Open billing', page: 'Billing', icon: '$' },
    { label: 'Open reports', page: 'Reports', icon: '▥' },
    { label: 'Workspace settings', page: 'Settings', icon: '⚙' },
  ];

  const globalSearchResults = React.useMemo(() => {
    const query = globalSearch.trim().toLowerCase();
    if (!query) {
      return {
        products: [],
        customers: [],
        warehouses: [],
        operations: [],
        salesOrders: [],
        shipments: [],
        returns: [],
        invoices: [],
        payments: [],
        approvals: [],
      };
    }

    return {
      products: products.filter((product) => `${product.name} ${product.sku} ${product.category} ${product.material || ''}`.toLowerCase().includes(query)).slice(0, 4),
      customers: customers.filter((customer) => `${customer.name} ${customer.email || ''} ${customer.phone || ''} ${customer.region}`.toLowerCase().includes(query)).slice(0, 4),
      warehouses: warehouseList.filter((location) => location.toLowerCase().includes(query)).slice(0, 3),
      operations: docs.filter((doc) => `${doc.id} ${doc.product} ${doc.partner || ''} ${doc.location || ''}`.toLowerCase().includes(query)).slice(0, 4),
      salesOrders: salesOrders.filter((order) => `${order.id} ${order.customerName} ${order.productName} ${order.location}`.toLowerCase().includes(query)).slice(0, 4),
      shipments: shipments.filter((item) => `${item.id} ${item.customerName} ${item.productName} ${item.carrier} ${item.tracking}`.toLowerCase().includes(query)).slice(0, 4),
      payments: payments.filter((item) => `${item.id} ${item.customer} ${item.invoiceId} ${item.method}`.toLowerCase().includes(query)).slice(0, 4),
      returns: returns.filter((item) => `${item.id} ${item.customerName} ${item.productName} ${item.reason}`.toLowerCase().includes(query)).slice(0, 4),
      invoices: invoices.filter((invoice) => `${invoice.id} ${invoice.party} ${invoice.kind}`.toLowerCase().includes(query)).slice(0, 4),
      approvals: approvalQueue.filter((item) => `${item.id} ${item.type} ${item.subject} ${item.reference}`.toLowerCase().includes(query)).slice(0, 4),
    };
  }, [globalSearch, products, customers, warehouseList, docs, salesOrders, shipments, payments, returns, invoices, approvalQueue]);

  const handleGlobalSearchSelect = (category, item) => {
    setCommandPaletteOpen(false);
    setNotificationOpen(false);
    setGlobalSearch('');

    if (category === 'product') {
      setPage('Products');
      setSearch(item.name);
      return;
    }
    if (category === 'customer') {
      setPage('Customers');
      setSearch(item.name);
      return;
    }
    if (category === 'warehouse') {
      setPage('Warehouses');
      setSearch(item);
      return;
    }
    if (category === 'operation') {
      setPage('Operations');
      setSearch(item.id);
      return;
    }
    if (category === 'salesOrder') {
      setPage('Sales');
      setSearch(item.id);
      return;
    }
    if (category === 'shipment') {
      setPage('Fulfillment');
      setSearch(item.id);
      return;
    }
    if (category === 'shipment') {
      setPage('Fulfillment');
      setSearch(item.id);
      return;
    }
    if (category === 'payment') {
      setPage('Billing');
      setSearch(item.invoiceId);
      return;
    }
    if (category === 'return') {
      setPage('Returns');
      setSearch(item.id);
      return;
    }
    if (category === 'invoice') {
      setPage('Billing');
      setSearch(item.id);
      return;
    }
    if (category === 'approval') {
      setPage('Approvals');
      setSearch(item.reference);
    }
  };

  const approveQueueItem = (item) => {
    if (item.type === 'Sales order') {
      setSalesOrders((current) => current.map((order) => (order.id === item.reference ? { ...order, status: 'Confirmed' } : order)));
      showToast('Sales order approved and moved to confirmed status.');
      return;
    }
    if (item.type === 'Purchase order') {
      setPurchaseOrders((current) => current.map((order) => (order.id === item.reference ? { ...order, status: 'Approved' } : order)));
      showToast('Purchase order approved.');
      return;
    }
    if (item.type === 'Return') {
      const returnRecord = returns.find((entry) => entry.id === item.reference && entry.status === 'Pending');
      const product = products.find((entry) => entry.id === returnRecord?.productId);
      if (!returnRecord || !product) {
        showToast('The pending return or its product could not be found.');
        return;
      }

      if (returnRecord.stockRestored === false) {
        setProducts((current) => current.map((entry) => {
          if (entry.id !== product.id) return entry;
          const nextStock = { ...entry.stock };
          nextStock[returnRecord.location] = (Number(nextStock[returnRecord.location]) || 0) + Number(returnRecord.qty || 0);
          return { ...entry, stock: nextStock };
        }));
        setDocs((current) => [{
          id: `RCV-${Date.now().toString().slice(-5)}`,
          type: 'Receipt',
          product: product.name,
          qty: Number(returnRecord.qty || 0),
          location: returnRecord.location,
          partner: `Return ${returnRecord.id} · ${returnRecord.customerName}`,
          status: 'Done',
          actor: displayUser.name,
          date: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
        }, ...current]);
      }
      setReturns((current) => current.map((entry) => (
        entry.id === returnRecord.id ? { ...entry, status: 'Approved', stockRestored: true } : entry
      )));
      showToast(returnRecord.stockRestored === false ? 'Return approved and stock restored.' : 'Return approved; existing stock entry retained.');
    }
  };

  const rejectQueueItem = (item) => {
    if (item.type === 'Sales order') {
      setSalesOrders((current) => current.map((order) => (order.id === item.reference ? { ...order, status: 'Draft' } : order)));
      showToast('Sales order returned to draft review.');
      return;
    }
    if (item.type === 'Purchase order') {
      setPurchaseOrders((current) => current.map((order) => (order.id === item.reference ? { ...order, status: 'Draft' } : order)));
      showToast('Purchase order returned to draft review.');
      return;
    }
    if (item.type === 'Return') {
      setReturns((current) => current.map((entry) => (entry.id === item.reference ? { ...entry, status: 'Rejected' } : entry)));
      showToast('Return was rejected and marked for follow-up.');
    }
  };

  const saveSupplier = (event) => {
    event.preventDefault();
    const name = supplierForm.name.trim();
    if (!name) {
      showToast('Supplier name is required.');
      return;
    }
    const supplier = {
      id: Date.now(),
      name,
      contact: supplierForm.contact.trim(),
      email: supplierForm.email.trim(),
      phone: supplierForm.phone.trim(),
      leadTime: Number(supplierForm.leadTime) || 5,
      slaTarget: Number(supplierForm.slaTarget) || 98,
      category: supplierForm.category,
      rating: 'Not rated',
      riskLevel: 'Unrated',
    };
    setSuppliers((current) => [supplier, ...current]);
    setSupplierForm({ name: '', contact: '', email: '', phone: '', leadTime: '5', slaTarget: '98', category: 'General' });
    setModal('');
    showToast('Supplier added.');
  };

  const savePurchaseOrder = (event) => {
    event.preventDefault();
    const product = products.find((entry) => String(entry.id) === String(purchaseForm.productId));
    const supplier = suppliers.find((entry) => String(entry.id) === String(purchaseForm.supplierId));

    if (!supplier || !product) {
      showToast('Select a valid supplier and product.');
      return;
    }

    const qty = Number(purchaseForm.qty) || 0;
    const unitCost = Number(purchaseForm.unitCost) || 0;
    if (qty <= 0 || unitCost < 0) {
      showToast('Quantity and unit cost must be valid.');
      return;
    }

    const order = {
      id: `PO-${Date.now().toString().slice(-6)}`,
      supplierId: supplier.id,
      supplierName: supplier.name,
      productId: product.id,
      productName: product.name,
      qty,
      unitCost,
      expectedDate: purchaseForm.expectedDate || 'Not scheduled',
      status: purchaseForm.status || 'Draft',
      location: purchaseForm.location || warehouseList[0],
      createdAt: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
      total: qty * unitCost,
    };

    setPurchaseOrders((current) => [order, ...current]);
    setPurchaseForm({ supplierId: '', productId: '', qty: '0', unitCost: '0', expectedDate: '', location: warehouseList[0], status: 'Draft' });
    setModal('');
    showToast('Purchase order created.');
  };

  const saveCustomer = (event) => {
    event.preventDefault();
    const name = customerForm.name.trim();
    if (!name) {
      showToast('Customer name is required.');
      return;
    }
    const customer = {
      id: Date.now(),
      name,
      email: customerForm.email.trim(),
      phone: customerForm.phone.trim(),
      tier: customerForm.tier,
      region: customerForm.region,
      orders: 0,
    };
    setCustomers((current) => [customer, ...current]);
    setCustomerForm({ name: '', email: '', phone: '', tier: 'Standard', region: 'North' });
    setModal('');
    showToast('Customer added.');
  };

  const saveSalesOrder = (event) => {
    event.preventDefault();
    const customer = customers.find((entry) => String(entry.id) === String(salesForm.customerId));
    const product = products.find((entry) => String(entry.id) === String(salesForm.productId));
    if (!customer || !product) {
      showToast('Select a valid customer and product.');
      return;
    }

    const qty = Number(salesForm.qty) || 0;
    const unitPrice = Number(salesForm.unitPrice) || 0;
    if (qty <= 0 || unitPrice < 0) {
      showToast('Quantity and unit price must be valid.');
      return;
    }

    const location = salesForm.location || warehouseList[0] || 'Main Warehouse';
    const available = Number(product.stock?.[location] || 0);
    const alreadyReserved = reservedStock[`${product.id}:${location}`] || 0;
    if ((salesForm.status === 'Shipped' || salesForm.status === 'Confirmed') && available - alreadyReserved < qty) {
      showToast('Not enough stock available to fulfill this order.');
      return;
    }

    const order = {
      id: `SO-${Date.now().toString().slice(-6)}`,
      customerId: customer.id,
      customerName: customer.name,
      productId: product.id,
      productName: product.name,
      qty,
      unitPrice,
      status: salesForm.status || 'Draft',
      location,
      expectedDate: salesForm.expectedDate || 'Not scheduled',
      total: qty * unitPrice,
      reservedQty: ['Confirmed', 'Picking', 'Packed'].includes(salesForm.status) ? qty : 0,
      createdAt: new Date().toISOString(),
    };

    if (order.status === 'Shipped') {
      setProducts((current) => current.map((entry) => {
        if (entry.id !== product.id) return entry;
        const nextStock = { ...entry.stock };
        nextStock[location] = (Number(nextStock[location]) || 0) - qty;
        return { ...entry, stock: nextStock };
      }));
      setDocs((current) => [{
        id: `OUT-${Date.now().toString().slice(-5)}`,
        type: 'Delivery',
        product: product.name,
        qty,
        location,
        partner: customer.name,
        status: 'Done',
        actor: displayUser.name,
        date: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
      }, ...current]);
    }

    setCustomers((current) => current.map((entry) => (entry.id === customer.id ? { ...entry, orders: (Number(entry.orders) || 0) + 1 } : entry)));
    setSalesOrders((current) => [order, ...current]);
    setSalesForm({ customerId: '', productId: '', qty: '1', unitPrice: '0', status: 'Draft', location: warehouseList[0], expectedDate: '' });
    setModal('');
    showToast('Sales order saved.');
  };

  const saveShipment = (event) => {
    event.preventDefault();
    const order = salesOrders.find((entry) => String(entry.id) === String(shipmentForm.orderId));
    const orderBlockReason = getShipmentBlockReason(order, shipments);
    if (orderBlockReason) {
      showToast(orderBlockReason);
      return;
    }

    const qty = Number(order.qty);

    const product = products.find((entry) => String(entry.id) === String(order.productId));
    if (!product) {
      showToast('The order product no longer exists in the catalog.');
      return;
    }

    const location = shipmentForm.location || warehouseList[0] || 'Main Warehouse';
    const shipmentStock = deductShipmentStock(product.stock, qty, location);
    if (shipmentStock.error) {
      showToast(shipmentStock.error);
      return;
    }

    const shipment = {
      id: `SH-${Date.now().toString().slice(-6)}`,
      orderId: order.id,
      customerId: order.customerId,
      customerName: order.customerName,
      productId: product.id,
      productName: product.name,
      qty,
      carrier: shipmentForm.carrier || 'UPS',
      tracking: shipmentForm.tracking || `TRACK-${Date.now().toString().slice(-7)}`,
      status: shipmentForm.status || 'Ready',
      location,
      createdAt: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    };

    setShipments((current) => [shipment, ...current]);
    setSalesOrders((current) => current.map((entry) => (entry.id === order.id ? { ...entry, status: 'Shipped' } : entry)));
    setProducts((current) => current.map((entry) => (
      entry.id === product.id ? { ...entry, stock: shipmentStock.stock } : entry
    )));
    setDocs((current) => [{
      id: `OUT-${Date.now().toString().slice(-5)}`,
      type: 'Delivery',
      product: product.name,
      qty,
      location,
      partner: order.customerName,
      status: 'Done',
      actor: displayUser.name,
      date: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    }, ...current]);
    setShipmentForm({ orderId: '', carrier: 'UPS', tracking: '', status: 'Ready', location: warehouseList[0] || 'Main Warehouse' });
    setModal('');
    showToast('Shipment created and order marked as shipped.');
  };

  const saveReturn = (event) => {
    event.preventDefault();
    const customer = customers.find((entry) => String(entry.id) === String(returnForm.customerId));
    const salesOrder = salesOrders.find((entry) => String(entry.id) === String(returnForm.orderId));
    const product = products.find((entry) => String(entry.id) === String(returnForm.productId || salesOrder?.productId));

    if (!customer || !product) {
      showToast('Select a valid customer and product before processing a return.');
      return;
    }

    const qty = Number(returnForm.qty) || 0;
    if (qty <= 0) {
      showToast('Return quantity must be greater than zero.');
      return;
    }
    if (!salesOrder || salesOrder.status !== 'Shipped') {
      showToast('Select a shipped sales order before recording a return.');
      return;
    }
    if (String(salesOrder.customerId) !== String(customer.id) || String(salesOrder.productId) !== String(product.id)) {
      showToast('The selected customer and product must match the sales order.');
      return;
    }
    const alreadyReturned = returns
      .filter((item) => item.orderId === salesOrder.id && item.status !== 'Rejected')
      .reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const returnableQty = Math.max(Number(salesOrder.qty || 0) - alreadyReturned, 0);
    if (qty > returnableQty) {
      showToast(`Return quantity exceeds the ${formatNumber(returnableQty)} units remaining on this order.`);
      return;
    }

    const location = returnForm.location || warehouseList[0] || 'Main Warehouse';
    const nextReturn = {
      id: `RT-${Date.now().toString().slice(-6)}`,
      orderId: salesOrder?.id || returnForm.orderId || '—',
      customerId: customer.id,
      customerName: customer.name,
      productId: product.id,
      productName: product.name,
      qty,
      reason: returnForm.reason || 'Damaged',
      location,
      status: 'Pending',
      stockRestored: false,
      createdAt: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    };

    setReturns((current) => [nextReturn, ...current]);
    setReturnForm({ orderId: '', customerId: '', productId: '', qty: '1', reason: 'Damaged', location: warehouseList[0] || 'Main Warehouse' });
    setModal('');
    showToast('Return recorded for approval; stock updates after approval.');
  };

  const receivePurchaseOrder = (order) => {
    if (order.status === 'Received') {
      showToast('This purchase order has already been received.');
      return;
    }

    const product = products.find((entry) => entry.id === order.productId);
    if (!product) {
      showToast('Product no longer exists.');
      return;
    }

    const nextLocation = order.location || warehouseList[0] || 'Main Warehouse';
    const nextStock = { ...product.stock };
    nextStock[nextLocation] = (Number(nextStock[nextLocation]) || 0) + Number(order.qty || 0);
    setProducts((current) => current.map((entry) => (entry.id === product.id ? { ...entry, stock: nextStock } : entry)));
    setDocs((current) => [
      {
        id: `RCV-${Date.now().toString().slice(-5)}`,
        type: 'Receipt',
        product: product.name,
        qty: Number(order.qty || 0),
        location: nextLocation,
        partner: order.supplierName,
        status: 'Done',
        actor: displayUser.name,
        date: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
      },
      ...current,
    ]);
    setPurchaseOrders((current) => current.map((entry) => (entry.id === order.id ? { ...entry, status: 'Received' } : entry)));
    showToast('Purchase order received and stock updated.');
  };

  return (
    <>
      {!authenticated ? (
        <main className="login-page">
          <div className="login-container">
            <div className="login-card">
                <div className="brand-panel">
                  <div className="warehouse-glow" />
                  <div className="brand-content">
                    <div className="brand-header">
                      <div className="logo"><LogoIcon /></div>
                      <div className="brand-name">Stockwise</div>
                    </div>

                    <div className="hero-copy">
                      <h1>
                        Smarter Inventory.
                        <span>Stronger Business.</span>
                      </h1>
                      <p>
                        Manage your stock, orders, and operations with confidence. Stockwise helps you stay organized,
                        save time, and grow faster.
                      </p>
                    </div>

                    <div className="feature-list">
                      <Feature icon={<InventoryIcon />} title="Real-time Inventory" text="Track stock across all locations" />
                      <Feature icon={<AutomationIcon />} title="Smart Automation" text="Reduce manual work" />
                      <Feature icon={<ReportsIcon />} title="Powerful Reports" text="Make data-driven decisions" />
                      <Feature icon={<SecurityIcon />} title="Browser-local demo" text="Workspace records stay in this browser" />
                    </div>

                    <div className="trusted">
                      <div className="trusted-label">Inventory workspace · browser-local demo</div>
                    </div>
                  </div>

                  <div className="analytics-card">
                    <div className="analytics-label">Stock value · listed price</div>
                    <div className="analytics-value">{products.length ? moneyFormatter.format(totalInventoryValue) : '—'}</div>
                    <div className="analytics-growth">{products.length ? 'Calculated from recorded stock' : 'Add products to see a value'}</div>
                  </div>
                </div>

                <div className="login-panel">
                  <div className="login-content">
                    <div className="mobile-brand">
                      <div className="logo"><LogoIcon /></div>
                      <div className="brand-name">Stockwise</div>
                    </div>

                    <div className="login-logo">
                      <span className="login-mark"><LogoIcon /></span>
                      <span>Stockwise</span>
                    </div>

                    <div className="login-heading">
                      <h2>{authMode === 'register' ? 'Create account' : 'Welcome back!'}</h2>
                      <p>{authMode === 'register' ? 'Set up your workspace and start managing inventory.' : 'Please sign in to your account.'}</p>
                    </div>

                    {loginError && <div className="login-alert alert alert-danger" role="alert">{loginError}</div>}

                    <Form onSubmit={handleLogin} noValidate>
                      {authMode === 'register' && (
                        <>
                          <Form.Group className="mb-3">
                            <Form.Label>Full name</Form.Label>
                            <Form.Control value={loginForm.name} onChange={(event) => setLoginForm({ ...loginForm, name: event.target.value })} placeholder="Your name" />
                          </Form.Group>
                          <Form.Group className="mb-3">
                            <Form.Label>Role</Form.Label>
                            <Form.Select value={loginForm.role} onChange={(event) => setLoginForm({ ...loginForm, role: event.target.value })}>
                              {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
                            </Form.Select>
                          </Form.Group>
                        </>
                      )}

                      <Form.Group className="mb-3">
                        <Form.Label>Email address</Form.Label>
                        <InputGroup className={loginFieldErrors.email ? 'has-validation-error' : ''}>
                          <InputGroup.Text className="mail-icon-wrap"><MailIcon /></InputGroup.Text>
                          <Form.Control type="email" placeholder="you@company.com" value={loginForm.email} onChange={(event) => { setLoginForm({ ...loginForm, email: event.target.value }); setLoginFieldErrors((current) => ({ ...current, email: '' })); setLoginError(''); }} autoComplete="email" aria-invalid={Boolean(loginFieldErrors.email)} aria-describedby={loginFieldErrors.email ? 'login-email-error' : undefined} />
                        </InputGroup>
                        {loginFieldErrors.email && <div className="login-field-error" id="login-email-error" role="alert">{loginFieldErrors.email}</div>}
                      </Form.Group>

                      <Form.Group className="mb-1">
                        <Form.Label>Password</Form.Label>
                        <InputGroup className={`password-input-group ${loginFieldErrors.password ? 'has-validation-error' : ''}`}>
                          <InputGroup.Text className="mail-icon-wrap"><LockIcon /></InputGroup.Text>
                          <Form.Control type={showPassword ? 'text' : 'password'} placeholder={authMode === 'register' ? 'At least 8 characters' : 'Enter your password'} value={loginForm.password} onChange={(event) => { setLoginForm({ ...loginForm, password: event.target.value }); setLoginFieldErrors((current) => ({ ...current, password: '' })); setLoginError(''); }} autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} aria-invalid={Boolean(loginFieldErrors.password)} aria-describedby={loginFieldErrors.password ? 'login-password-error' : undefined} />
                          <Button type="button" className="password-toggle" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                            <EyeIcon />
                          </Button>
                        </InputGroup>
                        {loginFieldErrors.password && <div className="login-field-error" id="login-password-error" role="alert">{loginFieldErrors.password}</div>}
                      </Form.Group>

                      {authMode === 'register' && (
                        <Form.Group className="mt-3">
                          <Form.Label>Confirm password</Form.Label>
                          <InputGroup>
                            <InputGroup.Text className="mail-icon-wrap"><LockIcon /></InputGroup.Text>
                            <Form.Control type={showPassword ? 'text' : 'password'} placeholder="Repeat password" value={loginForm.confirmPassword} onChange={(event) => setLoginForm({ ...loginForm, confirmPassword: event.target.value })} autoComplete="new-password" />
                          </InputGroup>
                        </Form.Group>
                      )}

                      {authMode === 'login' && (
                        <div className="login-options">
                          <label className="remember-label">
                            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                            Remember me
                          </label>
                          <button type="button" className="forgot-link">Forgot password?</button>
                        </div>
                      )}

                      <Button type="submit" className="sign-in-btn" disabled={loading}>
                        {loading ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
                            Signing in...
                          </>
                        ) : (
                          authMode === 'register' ? 'Create account' : 'Sign In'
                        )}
                      </Button>
                    </Form>

                    <div className="divider">or continue with</div>

                    <div className="social-row" aria-label="Social sign-in options">
                      <Button type="button" className="social-btn" title="Google sign-in is not configured yet."><span className="social-icon google-icon" aria-hidden="true">G</span>Google</Button>
                      <Button type="button" className="social-btn" title="Microsoft sign-in is not configured yet."><span className="social-icon microsoft-icon" aria-hidden="true"><i /><i /><i /><i /></span>Microsoft</Button>
                      <Button type="button" className="social-btn" title="Apple sign-in is not configured yet."><span className="social-icon apple-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M16.4 12.8c0-2.1 1.7-3.1 1.8-3.2a4 4 0 0 0-3.1-1.7c-1.3-.1-2.5.8-3.2.8s-1.7-.8-2.8-.8a4.2 4.2 0 0 0-3.5 2.1c-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.5 2.1 2.6 2.1s1.5-.7 2.8-.7 1.7.7 2.8.7 1.9-1 2.5-2a9 9 0 0 0 1.1-2.2 3.8 3.8 0 0 1-2.1-3.7ZM14.3 6.5A4 4 0 0 0 15.2 3a4.1 4.1 0 0 0-2.7 1.4 3.8 3.8 0 0 0-1 2.9 3.5 3.5 0 0 0 2.8-.8Z" /></svg></span>Apple</Button>
                    </div>

                    <div className="signup">
                      {authMode === 'register' ? 'Already have an account?' : "Don't have an account?"}{' '}
                      <button type="button" className="signup-link" onClick={() => { setAuthMode((current) => current === 'register' ? 'login' : 'register'); setLoginError(''); setLoginFieldErrors({}); setLoginForm((current) => ({ ...current, role: current.role || 'Operations Manager' })); }}>
                        {authMode === 'register' ? 'Log in' : 'Get started'}
                      </button>
                    </div>

                    <div className="security-note">
                      <ShieldIcon />
                      Demo sign-in · data is stored in this browser
                    </div>
                  </div>
                </div>
            </div>
          </div>
        </main>
      ) : (
        <div className={`app-shell ${currentThemeClass}`}>
          <style>{`
            :root {
              --canvas: #edf3f8;
              --canvas-2: #f7fafc;
              --panel: #ffffff;
              --panel-2: #f3f7fa;
              --line: rgba(97, 118, 146, 0.16);
              --ink: #172b4d;
              --muted: #63768d;
              --navy: #eaf1fa;
              --green: #1d8a68;
              --green-soft: rgba(29, 138, 104, 0.12);
              --orange: #d98712;
              --orange-soft: rgba(217, 135, 18, 0.12);
              --blue-soft: rgba(77, 105, 255, 0.12);
              --purple-soft: rgba(122, 90, 255, 0.12);
              --danger: #d95b5b;
              --danger-soft: rgba(217, 91, 91, 0.12);
              --shadow: 0 18px 32px rgba(15, 28, 42, 0.08);
            }
            .theme-dark {
              --canvas: #0b121c;
              --canvas-2: #0f1726;
              --panel: #111c2d;
              --panel-2: #17263b;
              --line: rgba(144, 166, 191, 0.14);
              --ink: #ecf4ff;
              --muted: #8ea3ba;
              --navy: #12253f;
              --green: #46d0a1;
              --green-soft: rgba(70, 208, 161, 0.18);
              --orange: #ffbd67;
              --orange-soft: rgba(255, 189, 103, 0.18);
              --blue-soft: rgba(106, 158, 255, 0.16);
              --purple-soft: rgba(146, 118, 255, 0.16);
              --danger: #ff7d7d;
              --danger-soft: rgba(255, 125, 125, 0.14);
              --shadow: 0 18px 32px rgba(6, 12, 20, 0.34);
            }
            .theme-dark .section-card,
            .theme-dark .kpi-card,
            .theme-dark .feature-card,
            .theme-dark .warehouse-tile,
            .theme-dark .action-card {
              background: linear-gradient(180deg, #17263a 0%, #132033 100%);
              border-color: rgba(151, 177, 207, 0.24);
              box-shadow: 0 14px 30px rgba(2, 8, 16, 0.28);
            }
            .theme-dark .section-head {
              border-bottom-color: rgba(151, 177, 207, 0.18);
            }
            .theme-dark .table {
              --bs-table-color: var(--ink);
              --bs-table-bg: var(--panel);
              --bs-table-border-color: var(--line);
              --bs-table-hover-color: #f4f8ff;
              --bs-table-hover-bg: #1b2b40;
            }
            .theme-dark .table > :not(caption) > * > * {
              color: var(--ink) !important;
              background-color: var(--panel) !important;
              border-color: var(--line) !important;
              box-shadow: none !important;
            }
            .theme-dark .table thead th {
              color: #b8c9de !important;
              background-color: var(--panel-2) !important;
            }
            .theme-dark .table tbody tr:hover > * {
              color: #f4f8ff !important;
              background-color: #1b2b40 !important;
            }
            * { box-sizing: border-box; }
            body { margin: 0; background: var(--canvas); color: var(--ink); font-family: Inter, 'Segoe UI', sans-serif; }
            button, input, select { font: inherit; }
            .app-shell { min-height: 100vh; display: flex; background: radial-gradient(circle at 80% 10%, rgba(70, 208, 161, 0.10), transparent 22%), radial-gradient(circle at 15% 22%, rgba(98, 118, 255, 0.10), transparent 30%), linear-gradient(180deg, var(--canvas) 0%, #0d1624 100%); }
            .theme-light .app-shell { background: radial-gradient(circle at 80% 12%, rgba(58, 181, 142, 0.12), transparent 20%), radial-gradient(circle at 15% 18%, rgba(140, 168, 255, 0.10), transparent 25%), linear-gradient(180deg, #f4f8fb 0%, #edf4f8 100%); }
            .theme-light .sidebar { background: linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(243,247,250,0.98) 100%); color: #1c2b3d; border-right: 1px solid rgba(118,145,175,0.16); box-shadow: inset -1px 0 0 rgba(255,255,255,0.65); }
            .theme-light .stockwise-brand { color: #172b4d; }
            .theme-light .workspace-switch { background: rgba(13,22,36,0.03); border-color: rgba(118,145,175,0.16); }
            .theme-light .workspace-switch strong { color: #152a45; }
            .theme-light .workspace-switch small { color: #617893; }
            .theme-light .nav-label { color: #6f8099; }
            .theme-light .side-link { color: #425769; }
            .theme-light .side-link.active { background: linear-gradient(90deg, rgba(29,138,104,0.10), rgba(29,138,104,0.04)); border-color: rgba(29,138,104,0.18); color: #153f32; }
            .theme-light .sidebar-user { color: #1f2f45; }
            .theme-light .mini-avatar + div strong { color: #1d2d46; }
            .theme-light .mini-avatar + div small { color: #677f9d; }
            .theme-light .main { background: rgba(245,247,250,0.8); }
            .theme-light .topbar { background: rgba(255,255,255,0.86); }
            .theme-light .topbar .crumb, .theme-light .page-sub, .theme-light .eyebrow { color: #627892; }
            .theme-light .topbar strong { color: #1a2d45; }
            .theme-light .icon-button { color: #2f4d68; background: rgba(255,255,255,0.68); border-color: rgba(113,136,165,0.22); }
            .theme-light .btn-outline-secondary { color: #2f4965; border-color: rgba(96,117,142,0.28); background: rgba(255,255,255,0.56); }
            .theme-light .section-card, .theme-light .kpi-card, .theme-light .feature-card, .theme-light .warehouse-tile, .theme-light .action-card { background: linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(245,248,251,0.98) 100%); }
            .theme-light .table thead th { background: rgba(18,28,42,0.02); color: #6a7f96; }
            .theme-light .table tbody td { color: #182d48; }
            .sidebar { width: 260px; flex: 0 0 260px; background: linear-gradient(180deg, rgba(10,16,26,0.97) 0%, rgba(17,28,45,0.98) 100%); color: #dfe9f7; min-height: 100vh; padding: 22px 15px 16px; display: flex; flex-direction: column; border-right: 1px solid var(--line); box-shadow: inset -1px 0 0 rgba(132, 160, 190, 0.12); }
            .stockwise-brand { display: flex; align-items: center; gap: 12px; padding: 6px 8px 24px; color: #fff; font-size: 20px; font-weight: 800; }
            .stockwise-brand-compact { justify-content: center; padding: 0 0 18px; font-size: 24px; }
            .stockwise-mark { width: 38px; height: 38px; border-radius: 12px; background: linear-gradient(145deg, #3ad6a4, #0f8d70); display: grid; place-items: center; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 10px 18px rgba(22,133,106,0.22); }
            .stockwise-mark svg { width: 28px; height: 28px; }
            .workspace-switch { display: flex; align-items: center; gap: 10px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid var(--line); padding: 10px 12px; margin: 0 4px 24px; }
            .workspace-avatar { width: 30px; height: 30px; border-radius: 9px; background: linear-gradient(145deg, #dffdf1, #bfe8dc); display: grid; place-items: center; color: #146d5a; font-weight: 700; }
            .workspace-switch strong { display: block; font-size: 12px; color: #fff; }
            .workspace-switch small { display: block; color: #9fb0c9; font-size: 11px; }
            .nav-section { margin-bottom: 24px; }
            .nav-label { color: #7f90aa; text-transform: uppercase; letter-spacing: 1.1px; font-size: 10px; font-weight: 700; padding: 0 12px; margin: 0 0 8px; }
            .side-link { width: 100%; display: flex; align-items: center; gap: 12px; border: 1px solid transparent; border-radius: 10px; background: transparent; color: #d3deed; padding: 10px 12px; margin: 2px 0; text-align: left; font-size: 13px; cursor: pointer; transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease; }
            .side-link:hover { background: rgba(255,255,255,0.04); transform: translateX(2px); }
            .side-link.active { background: linear-gradient(90deg, rgba(70,208,161,0.19), rgba(70,208,161,0.08)); border-color: rgba(70,208,161,0.2); box-shadow: inset 3px 0 0 #52d7ae; color: #fff; }
            .side-icon { width: 18px; text-align: center; display: inline-block; }
            .sidebar-footer { margin-top: auto; border-top: 1px solid var(--line); padding-top: 14px; }
            .sidebar-user { display: flex; align-items: center; gap: 10px; padding: 8px 6px 12px; color: #fff; }
            .mini-avatar { width: 34px; height: 34px; border-radius: 50%; background: linear-gradient(145deg, #f5dfd3, #e9d0bb); display: grid; place-items: center; color: #7d4f38; font-weight: 700; font-size: 12px; }
            .mini-avatar + div { min-width: 0; }
            .mini-avatar + div strong { display: block; font-size: 12px; }
            .mini-avatar + div small { color: #a4b5d0; font-size: 11px; }
            .main { flex: 1; min-width: 0; background: rgba(11,18,28,0.8); }
            .topbar { height: 70px; border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; background: rgba(10,18,31,0.8); backdrop-filter: blur(14px); padding: 0 28px; position: sticky; top: 0; z-index: 4; }
            .crumb { color: #8998aa; font-size: 12px; }
            .crumb strong { color: var(--ink); }
            .top-actions { display: flex; align-items: center; gap: 14px; }
            .icon-button { width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--line); background: rgba(255,255,255,0.04); color: #dfeaf8; position: relative; font-size: 18px; }
            .notification-dot { position: absolute; width: 7px; height: 7px; border-radius: 50%; background: #ea6d5d; right: 7px; top: 6px; border: 2px solid #0d1624; }
            .content { max-width: 1600px; padding: 30px 32px 56px; }
            .page-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
            .eyebrow { color: #8aa0bd; font-size: 10px; letter-spacing: 1.25px; font-weight: 700; text-transform: uppercase; }
            .page-head { margin: 0; font-size: 27px; font-weight: 800; letter-spacing: -0.8px; color: var(--ink); }
            .page-sub { color: var(--muted); margin-top: 6px; font-size: 13px; }
            .live-pill { display: inline-flex; align-items: center; gap: 8px; margin-left: 9px; border-radius: 999px; padding: 5px 10px; background: rgba(70,208,161,0.12); border: 1px solid rgba(70,208,161,0.22); color: #7ce8c3; font-size: 9px; font-weight: 700; letter-spacing: 0.5px; }
            .live-pill i { width: 6px; height: 6px; border-radius: 50%; background: #65efb4; display: inline-block; box-shadow: 0 0 0 0 rgba(101,239,180,0.45); animation: pulse 2.1s infinite; }
            @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(101,239,180,0.45); } 70% { box-shadow: 0 0 0 8px rgba(101,239,180,0); } 100% { box-shadow: 0 0 0 0 rgba(101,239,180,0); } }
            .btn { border-radius: 9px; padding: 9px 14px; font-weight: 600; font-size: 13px; }
            .btn-success { background: linear-gradient(145deg, #1eb789, #0c775c); border-color: #15936d; }
            .btn-success:hover { background: linear-gradient(145deg, #1ca781, #0b694f); border-color: #10886d; }
            .btn-outline-secondary { border-color: rgba(143, 164, 191, 0.25); color: #dfeaf8; background: rgba(255,255,255,0.02); }
            .kpi-card, .section-card, .warehouse-tile, .feature-card, .action-card { background: linear-gradient(180deg, rgba(18,28,42,0.98) 0%, rgba(13,20,30,0.98) 100%); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow); position: relative; overflow: hidden; }
            .kpi-card::before, .section-card::before, .feature-card::before, .warehouse-tile::before, .action-card::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(154, 214, 255, 0.8), transparent); opacity: 0.7; }
            .kpi-card .card-body { padding: 18px 18px 14px; }
            .kpi-top { display: flex; align-items: center; justify-content: space-between; }
            .kpi-label { color: #90a5c0; font-size: 11px; font-weight: 600; }
            .kpi-icon { width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; font-size: 18px; font-weight: 700; }
            .icon-blue { background: rgba(124, 160, 255, 0.18); color: #9fc6ff; }
            .icon-gold { background: rgba(255, 189, 103, 0.18); color: #ffbe66; }
            .icon-green { background: rgba(70,208,161,0.18); color: #7ce8c3; }
            .icon-purple { background: rgba(146,118,255,0.18); color: #b7a6ff; }
            .kpi-value { font-size: 28px; font-weight: 800; letter-spacing: -0.9px; color: var(--ink); margin: 12px 0 4px; }
            .kpi-foot { color: var(--muted); font-size: 11px; }
            .inventory-alert { border: 1px solid rgba(255, 189, 103, 0.22); background: linear-gradient(135deg, rgba(255,189,103,0.12), rgba(15,22,34,0.8)); border-radius: 11px; padding: 12px 14px; color: #ffd79d; font-size: 13px; }
            .grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
            .action-card { min-height: 110px; display: flex; align-items: center; gap: 16px; padding: 18px 16px; cursor: pointer; transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease; }
            .action-card:hover { transform: translateY(-2px); box-shadow: 0 16px 32px rgba(2, 7, 12, 0.38); border-color: rgba(70,208,161,0.25); }
            .action-icon { width: 46px; height: 46px; border-radius: 12px; display: grid; place-items: center; font-size: 20px; font-weight: 700; }
            .action-copy strong { display: block; font-size: 13px; color: var(--ink); }
            .action-copy span { color: var(--muted); font-size: 11px; }
            .section-card { overflow: hidden; }
            .section-head { padding: 18px 20px 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid rgba(145, 164, 185, 0.10); }
            .section-heading { margin: 0; font-size: 15px; font-weight: 700; color: var(--ink); }
            .soft-count { color: var(--muted); font-size: 12px; }
            .section-sub { margin-top: 4px; font-size: 11px; color: var(--muted); }
            .toolbar-wrap { flex-wrap: wrap; justify-content: flex-end; }
            .search-box { width: 250px; }
            .filter-select { min-width: 145px; background: rgba(255,255,255,0.02); color: var(--ink); border-color: var(--line); }
            .input-glyph { background: rgba(255,255,255,0.02); color: #9aaec4; border-color: var(--line); }
            .table-responsive { width: 100%; overflow-x: auto; }
            table { margin: 0; }
            .table thead th { background: rgba(255,255,255,0.02); color: var(--muted); border-bottom: 1px solid var(--line); border-top: 0; font-size: 9px; letter-spacing: 0.8px; text-transform: uppercase; padding: 12px 18px; }
            .table tbody td { color: var(--ink); padding: 14px 18px; font-size: 12px; vertical-align: middle; }
            .product-name { font-weight: 700; color: var(--ink); }
            .ref-code { color: var(--muted); }
            .badge-soft { display: inline-flex; align-items: center; justify-content: center; padding: 6px 10px; border-radius: 999px; font-size: 9px; font-weight: 700; letter-spacing: 0.45px; }
            .status-done { background: rgba(70,208,161,0.16); color: #7ce8c3; }
            .status-waiting { background: rgba(255,189,103,0.18); color: #ffd79d; }
            .status-ready { background: rgba(106,158,255,0.16); color: #a7c7ff; }
            .status-scheduled { background: rgba(146,118,255,0.16); color: #d0c0ff; }
            .status-canceled { background: rgba(255,125,125,0.14); color: #ffb0b0; }
            .status-draft { background: rgba(143, 164, 191, 0.12); color: #dce7f6; }
            .empty-state { padding: 36px 12px 26px; text-align: center; color: var(--muted); font-size: 13px; }
            .today-grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 16px; }
            .today-hero { background: linear-gradient(135deg, rgba(19, 51, 44, 0.85), rgba(14, 29, 44, 0.96)); border: 1px solid rgba(70,208,161,0.2); border-radius: 18px; padding: 26px 24px; box-shadow: 0 18px 30px rgba(5, 13, 22, 0.28); }
            .today-hero h2 { margin: 0; font-size: 26px; font-weight: 800; color: #ecf8ff; letter-spacing: -0.8px; }
            .today-hero p { margin: 8px 0 0; color: #a7bed8; }
            .today-list { list-style: none; padding: 0; margin: 18px 0 0; }
            .today-list li { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid rgba(255,255,255,0.06); padding: 10px 0; font-size: 12px; color: #dfeaf8; }
            .mini-tag { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; padding: 0 8px; border-radius: 8px; font-size: 11px; font-weight: 700; }
            .mini-tag.green { background: rgba(70,208,161,0.18); color: #7ce8c3; }
            .mini-tag.orange { background: rgba(255,189,103,0.18); color: #ffbe66; }
            .mini-tag.blue { background: rgba(124,160,255,0.18); color: #9fc6ff; }
            .mini-tag.purple { background: rgba(146,118,255,0.18); color: #cebfff; }
            .feature-card, .warehouse-tile { padding: 18px 18px 14px; }
            .feature-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
            .feature-card h4, .warehouse-card h4 { margin: 0; font-size: 14px; color: var(--ink); }
            .feature-list { list-style: none; padding: 0; margin: 0; }
            .feature-list li { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 12px; color: var(--ink); }
            .feature-list li:last-child { border-bottom: 0; }
            .link-button, .text-link-button { background: transparent; border: 0; color: #6ce0b2; font-weight: 700; padding: 0; }
            .warehouse-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
            .warehouse-card h4 { margin-bottom: 7px; }
            .warehouse-card .value { font-size: 21px; font-weight: 800; color: var(--ink); }
            .warehouse-card .small { font-size: 11px; color: var(--muted); }
            .search-overlay { position: fixed; inset: 0; background: rgba(5,12,18,0.4); z-index: 30; display: flex; align-items: flex-start; justify-content: center; padding-top: 64px; }
            .search-panel { width: min(760px, calc(100% - 24px)); background: rgba(14,21,31,0.96); border: 1px solid rgba(150,170,195,0.16); border-radius: 18px; box-shadow: 0 28px 60px rgba(4, 11, 17, 0.42); overflow: hidden; }
            .search-panel-header { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid rgba(150,170,195,0.12); }
            .search-panel-header .search-box { width: 100%; }
            .search-panel-header .search-box .form-control { background: rgba(255,255,255,0.03); color: var(--ink); border: 1px solid rgba(150,170,195,0.16); }
            .search-result-group { padding: 12px 16px 8px; }
            .search-group-label { font-size: 10px; letter-spacing: 1.1px; text-transform: uppercase; color: #91a4bf; margin: 0 0 8px; }
            .search-result-item { width: 100%; border: 1px solid rgba(150,170,195,0.08); border-radius: 10px; background: rgba(255,255,255,0.02); color: var(--ink); padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px; text-align: left; }
            .search-result-item strong { display: block; font-size: 13px; }
            .search-result-item small { color: var(--muted); font-size: 11px; }
            .search-result-item:hover { background: rgba(70,208,161,0.07); border-color: rgba(70,208,161,0.18); }
            .search-panel-footer { padding: 12px 16px 16px; border-top: 1px solid rgba(150,170,195,0.12); display: flex; justify-content: space-between; align-items: center; gap: 12px; color: #96aac2; font-size: 11px; }
            .search-panel-footer .kbd { border: 1px solid rgba(150,170,195,0.16); background: rgba(255,255,255,0.03); border-radius: 6px; padding: 3px 7px; font-size: 10px; }
            .notification-panel { position: absolute; right: 24px; top: 72px; width: min(360px, calc(100vw - 24px)); background: rgba(14,21,31,0.96); border: 1px solid rgba(150,170,195,0.16); border-radius: 18px; box-shadow: 0 24px 50px rgba(5,12,20,0.44); z-index: 25; padding: 14px 14px 8px; }
            .notification-panel h4 { margin: 0 0 8px; font-size: 13px; color: var(--ink); }
            .notification-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 10px; border-radius: 10px; border: 1px solid rgba(150,170,195,0.08); background: rgba(255,255,255,0.02); margin-bottom: 8px; }
            .notification-item strong { display: block; font-size: 12px; }
            .notification-item small { display: block; color: var(--muted); font-size: 11px; }
            .notification-badge { display: inline-flex; min-width: 24px; justify-content: center; padding: 6px 7px; border-radius: 999px; background: rgba(255,189,103,0.18); color: #ffd79d; font-size: 10px; font-weight: 700; }
            .login-page {
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              background: linear-gradient(180deg, #f6f8fb 0%, #eef3f8 100%);
              padding: 24px 16px;
            }
            .login-container {
              width: min(100%, 440px);
              display: flex;
              justify-content: center;
            }
            .login-card {
              width: 100%;
              min-height: 0;
              display: block;
              background: #ffffff;
              border: 1px solid #e5ebf2;
              border-radius: 16px;
              box-shadow: 0 16px 42px rgba(15, 23, 42, 0.08);
              overflow: hidden;
            }
            .login-card > .brand-panel { display: none; }
            .brand-panel {
              position: relative;
              background: linear-gradient(180deg, #f6fbff 0%, #edf4ff 100%);
              color: #15273d;
              padding: 26px 30px 22px;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              border-right: 1px solid rgba(146, 164, 182, 0.18);
            }
            .warehouse-glow {
              position: absolute;
              inset: 0;
              background: radial-gradient(circle at 18% 12%, rgba(72, 134, 255, 0.12), transparent 22%), radial-gradient(circle at 72% 28%, rgba(29, 141, 115, 0.08), transparent 16%);
              pointer-events: none;
            }
            .brand-content, .analytics-card {
              position: relative;
              z-index: 1;
            }
            .brand-header {
              display: flex;
              align-items: center;
              gap: 10px;
              margin-bottom: 22px;
            }
            .logo {
              width: 38px;
              height: 38px;
              border-radius: 12px;
              background: linear-gradient(135deg, #2f6cf6, #1bbd95);
              display: grid;
              place-items: center;
              box-shadow: 0 10px 18px rgba(42, 110, 230, 0.16);
            }
            .logo svg {
              width: 18px;
              height: 18px;
            }
            .brand-name {
              font-size: 20px;
              font-weight: 800;
              letter-spacing: -0.04em;
              color: #12263d;
            }
            .hero-copy h1 {
              margin: 0;
              font-size: clamp(2.1rem, 3vw, 3.3rem);
              line-height: 1.04;
              letter-spacing: -0.08em;
              max-width: 480px;
              color: #162b42;
            }
            .hero-copy h1 span { display: block; }
            .hero-copy p {
              margin: 16px 0 0;
              max-width: 460px;
              color: #536a82;
              line-height: 1.65;
              font-size: 14px;
            }
            .feature-list {
              margin-top: 24px;
              display: grid;
              gap: 12px;
            }
            .feature {
              display: flex;
              align-items: flex-start;
              gap: 10px;
              padding: 11px 12px;
              border-radius: 12px;
              background: rgba(255,255,255,0.7);
              border: 1px solid rgba(150, 165, 182, 0.18);
            }
            .feature-icon {
              width: 32px;
              height: 32px;
              border-radius: 10px;
              display: grid;
              place-items: center;
              background: rgba(47, 108, 246, 0.08);
              color: #264aa5;
              flex-shrink: 0;
            }
            .feature-icon svg {
              width: 16px;
              height: 16px;
            }
            .feature-title {
              font-size: 13px;
              font-weight: 700;
              margin-bottom: 2px;
              color: #18314d;
            }
            .feature-text {
              font-size: 12px;
              color: #5d7289;
            }
            .trusted {
              margin-top: 22px;
            }
            .trusted-label {
              color: #607796;
              font-size: 11px;
              margin-bottom: 10px;
              letter-spacing: 0.03em;
            }
            .trusted-logos {
              display: flex;
              flex-wrap: wrap;
              gap: 8px;
            }
            .trusted-logo {
              border: 1px solid rgba(145, 162, 180, 0.3);
              border-radius: 999px;
              padding: 8px 10px;
              background: rgba(255,255,255,0.5);
              color: #45607c;
              font-size: 10px;
            }
            .analytics-card {
              align-self: flex-end;
              width: min(100%, 260px);
              padding: 16px 16px 12px;
              border-radius: 16px;
              background: #ffffff;
              border: 1px solid rgba(146, 164, 182, 0.2);
              box-shadow: 0 12px 25px rgba(19, 33, 49, 0.04);
              margin-top: 18px;
            }
            .analytics-label {
              color: #6c7f96;
              font-size: 10px;
              font-weight: 700;
              letter-spacing: 0.12em;
              text-transform: uppercase;
            }
            .analytics-value {
              margin-top: 8px;
              font-size: 28px;
              font-weight: 800;
              letter-spacing: -0.06em;
              color: #12263d;
            }
            .analytics-growth {
              margin-top: 4px;
              color: #13946c;
              font-size: 11px;
              font-weight: 700;
            }
            .chart {
              width: 100%;
              height: 62px;
              margin-top: 8px;
            }
            .login-panel {
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 32px 30px;
              background: #ffffff;
            }
            .login-content {
              width: 100%;
            }
            .mobile-brand { display: none; }
            .login-logo {
              display: flex;
              align-items: center;
              gap: 9px;
              margin-bottom: 26px;
              color: #17314b;
              font-size: 16px;
              font-weight: 750;
              letter-spacing: -0.03em;
            }
            .login-mark {
              width: 28px;
              height: 28px;
              display: grid;
              place-items: center;
              border-radius: 8px;
              background: linear-gradient(135deg, #2f6cf6, #1bbd95);
            }
            .login-mark svg {
              width: 15px;
              height: 15px;
            }
            .login-heading h2 {
              margin: 0;
              color: #11263d;
              font-size: 25px;
              font-weight: 800;
              letter-spacing: -0.06em;
            }
            .login-heading p {
              margin: 8px 0 0;
              color: #607796;
              font-size: 14px;
            }
            .login-alert { margin-top: 18px; }
            .form-label {
              font-size: 12px;
              font-weight: 700;
              color: #425b76;
              margin-bottom: 8px;
            }
            .input-group-text.mail-icon-wrap {
              border-right: 0;
              background: #f5f8fc;
              color: #5a7088;
              padding: 0 12px;
            }
            .form-control, .form-select {
              border-radius: 12px;
              border: 1px solid #dfe7f1;
              background: #f9fbfd;
              color: #17314b;
              padding: 11px 12px;
              font-size: 14px;
            }
            .input-group .form-control {
              border-left: 0;
            }
            .input-group .password-toggle {
              border-radius: 0 12px 12px 0;
              border: 1px solid #dfe7f1;
              border-left: 0;
              background: #f9fbfd;
              color: #4e667e;
              width: 44px;
              padding: 0;
            }
            .input-group .password-toggle svg {
              width: 15px;
              height: 15px;
            }
            .form-control:focus, .form-select:focus {
              border-color: rgba(27, 128, 99, 0.5);
              box-shadow: 0 0 0 0.2rem rgba(27, 128, 99, 0.1);
            }
            .login-options {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
              margin: 14px 0 18px;
            }
            .remember-label {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              color: #48627c;
              font-size: 12px;
              cursor: pointer;
              margin: 0;
            }
            .remember-label input {
              width: 15px;
              height: 15px;
              accent-color: #1d8d73;
            }
            .forgot-link {
              background: transparent;
              border: 0;
              color: #178269;
              font-size: 12px;
              font-weight: 700;
              padding: 0;
            }
            .sign-in-btn {
              width: 100%;
              border: 0;
              border-radius: 12px;
              padding: 12px 14px;
              background: linear-gradient(135deg, #1a7f66, #0d5a49);
              color: white;
              font-weight: 700;
              box-shadow: 0 12px 26px rgba(15, 98, 80, 0.18);
            }
            .sign-in-btn:hover {
              background: linear-gradient(135deg, #16755f, #0b4f42);
            }
            .divider {
              display: flex;
              align-items: center;
              gap: 16px;
              margin: 22px 0 16px;
              color: #7a8ea3;
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.12em;
            }
            .divider::before, .divider::after {
              content: '';
              display: block;
              flex: 1;
              height: 1px;
              background: linear-gradient(90deg, transparent, rgba(143, 162, 185, 0.5), transparent);
            }
            .social-row {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              gap: 10px;
            }
            .social-btn {
              border: 1px solid #e2eaf2;
              border-radius: 12px;
              background: #fff;
              color: #495f7a;
              font-weight: 600;
              padding: 9px 8px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
              font-size: 12px;
            }
            .social-icon {
              width: 18px;
              height: 18px;
              border-radius: 50%;
              display: inline-grid;
              place-items: center;
              background: #f3f6fa;
              color: #213d5a;
              font-size: 10px;
              font-weight: 800;
            }
            .signup {
              margin-top: 20px;
              text-align: center;
              color: #6d7d92;
              font-size: 13px;
            }
            .signup-link {
              background: transparent;
              border: 0;
              padding: 0;
              color: #1b8d70;
              font-weight: 700;
            }
            .security-note {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              margin-top: 18px;
              color: #556d84;
              font-size: 12px;
              padding: 9px 11px;
              border-radius: 10px;
              background: #f4f8fb;
              border: 1px solid #e2ebf3;
            }
            .security-note svg {
              width: 16px;
              height: 16px;
              color: #1c8b72;
            }
            @media (max-width: 980px) {
              .login-card { min-height: 0; }
            }
            @media (max-width: 640px) {
              .login-page { padding: 16px 12px; }
              .login-panel { padding: 28px 22px; }
              .social-row { gap: 7px; }
              .social-btn { gap: 5px; padding-inline: 5px; }
            }
            .toast-message { position: fixed; right: 24px; bottom: 24px; z-index: 1000; background: rgba(17,31,56,0.92); color: #fff; border-radius: 12px; padding: 12px 14px; font-size: 12px; box-shadow: 0 14px 30px rgba(17,31,56,0.18); }
            .modal .form-label { font-weight: 700; font-size: 12px; color: #405a75; }
            .modal-body .form-text { font-size: 11px; }
            @media (max-width: 1280px) {
              .app-shell { min-height: 100vh; }
              .content { padding: 24px 20px 48px; }
              .grid-3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
              .warehouse-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            }
            @media (max-width: 1100px) {
              .today-grid { grid-template-columns: 1fr; }
              .warehouse-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
              .sidebar { width: 200px; flex-basis: 200px; }
              .content { padding: 22px 16px 40px; }
              .topbar { padding: 0 18px; }
              .top-actions { gap: 10px; }
            }
            @media (max-width: 900px) {
              .app-shell { flex-direction: column; }
              .sidebar {
                width: 100%;
                flex-basis: auto;
                min-height: auto;
                padding: 16px 12px 12px;
                border-right: 0;
                border-bottom: 1px solid var(--line);
              }
              .stockwise-brand { padding-bottom: 16px; }
              .workspace-switch { margin-bottom: 14px; }
              .nav-section { margin-bottom: 14px; }
              .nav-section .nav-label { margin-bottom: 6px; }
              .side-link { padding: 10px 12px; }
              .sidebar-footer { margin-top: 12px; }
              .main { min-height: calc(100vh - 180px); }
              .topbar { position: static; }
              .search-box { width: 220px; }
              .grid-3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            }
            @media (max-width: 700px) {
              .sidebar { width: 100%; }
              .stockwise-wordmark, .workspace-switch > div:last-child, .nav-label, .mini-avatar + div, .sidebar-user > div:last-child { display: none; }
              .workspace-switch { justify-content: center; padding: 10px 0; }
              .side-link { justify-content: center; padding: 10px 4px; }
              .side-link span:last-child { display: none; }
              .topbar {
                height: auto;
                flex-direction: column;
                align-items: stretch;
                padding: 12px 14px;
                gap: 12px;
              }
              .top-actions {
                flex-wrap: wrap;
                justify-content: space-between;
              }
              .top-actions .search-box { width: 100%; }
              .content { padding: 20px 14px 32px; }
              .grid-3, .warehouse-grid { grid-template-columns: 1fr; }
              .page-row { flex-direction: column; }
              .toolbar-wrap { justify-content: flex-start; }
              .search-box { width: 100%; }
              .section-head { flex-direction: column; align-items: flex-start; }
              .table thead th, .table tbody td { padding-left: 12px; padding-right: 12px; }
            }
            @media (max-width: 520px) {
              .top-actions { gap: 8px; }
              .icon-button { width: 32px; height: 32px; }
              .page-head { font-size: 24px; }
              .kpi-value { font-size: 22px; }
              .btn { width: 100%; }
              .toolbar-wrap .search-box { width: 100%; }
              .login-content { width: 100%; }
            }
          `}</style>

          <aside className="sidebar">
            <BrandLogo />
            <div className="workspace-switch">
              <div className="workspace-avatar">N</div>
              <div>
                <strong>My workspace</strong>
                <small>Browser-local demo</small>
              </div>
            </div>
            {visibleNavItems.map((group) => (
              <div key={group.heading} className="nav-section">
                <div className="nav-label">{group.heading}</div>
                {group.items.map(([label, icon]) => (
                  <button key={label} type="button" className={`side-link ${page === label ? 'active' : ''}`} onClick={() => setPage(label)}>
                    <span className="side-icon">{icon}</span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            ))}

            <div className="sidebar-footer">
              <div className="sidebar-user">
                <div className="mini-avatar">{userInitials}</div>
                <div>
                  <strong>{displayUser.name}</strong>
                  <small>{displayUser.email}</small>
                </div>
              </div>
              <button type="button" className="side-link" onClick={logout}>
                <span className="side-icon">↪</span>
                <span>Sign out</span>
              </button>
            </div>
          </aside>

          <main className="main">
            <header className="topbar">
              <div className="crumb">Workspace <span style={{ margin: '0 8px', color: '#c0cbd8' }}>/</span> <strong>{page}</strong></div>
              <div className="top-actions">
                <div className="search-box" style={{ width: 320 }}>
                  <InputGroup>
                    <InputGroup.Text className="input-glyph">⌕</InputGroup.Text>
                    <Form.Control value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} placeholder="Search products, customers, orders, warehouses..." />
                  </InputGroup>
                </div>
                <button type="button" className="icon-button theme-toggle-button" onClick={() => setThemeMode((current) => current === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">
                  {themeMode === 'dark' ? '☀' : '☾'}
                </button>
                <button type="button" className="icon-button" aria-label="Open command palette" onClick={() => setCommandPaletteOpen(true)}>
                  ⌘K
                </button>
                <button type="button" className="icon-button" aria-label="Notifications" onClick={() => setNotificationOpen((current) => !current)}>
                  ♡
                  <span className="notification-dot" />
                </button>
                <div className="mini-avatar">{userInitials}</div>
              </div>
            </header>

            {commandPaletteOpen && (
              <div className="search-overlay" onClick={() => setCommandPaletteOpen(false)}>
                <div className="search-panel" onClick={(event) => event.stopPropagation()}>
                  <div className="search-panel-header">
                    <div className="search-box">
                      <InputGroup>
                        <InputGroup.Text className="input-glyph">⌕</InputGroup.Text>
                        <Form.Control autoFocus value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} placeholder="Search Stockwise..." />
                      </InputGroup>
                    </div>
                  </div>

                  {globalSearch.trim() ? (
                    <>
                      {Object.entries(globalSearchResults).some(([, items]) => items.length > 0) ? (
                        <>
                          {Object.entries(globalSearchResults).map(([groupName, items]) => {
                            if (!items.length) return null;
                            const label = groupName === 'products' ? 'Products' : groupName === 'customers' ? 'Customers' : groupName === 'warehouses' ? 'Warehouses' : groupName === 'operations' ? 'Operations' : groupName === 'salesOrders' ? 'Sales orders' : 'Invoices';
                            return (
                              <div key={groupName} className="search-result-group">
                                <div className="search-group-label">{label}</div>
                                {items.map((item) => {
                                  const itemKey = groupName === 'products' ? `${item.id}-product` : groupName === 'customers' ? `${item.id}-customer` : groupName === 'warehouses' ? `${item}-warehouse` : groupName === 'operations' ? `${item.id}-op` : groupName === 'salesOrders' ? `${item.id}-sale` : groupName === 'approvals' ? `${item.id}-approval` : `${item.id}-invoice`;
                                  const title = groupName === 'products' ? item.name : groupName === 'customers' ? item.name : groupName === 'warehouses' ? item : groupName === 'operations' ? `${item.type} · ${item.product}` : groupName === 'salesOrders' ? `${item.id} · ${item.customerName}` : groupName === 'approvals' ? `${item.type} · ${item.subject}` : `${item.kind} · ${item.party}`;
                                  const subtitle = groupName === 'products' ? `${item.sku} · ${item.category}` : groupName === 'customers' ? `${item.email || 'No email'} · ${item.region}` : groupName === 'warehouses' ? 'Location' : groupName === 'operations' ? `${item.id} · ${item.location}` : groupName === 'salesOrders' ? `${item.productName} · ${item.status}` : groupName === 'approvals' ? `${item.reference} · ${item.status}` : `${item.id} · ${item.status}`;
                                  const category = groupName === 'customers' ? 'customer' : groupName === 'salesOrders' ? 'salesOrder' : groupName === 'products' ? 'product' : groupName === 'warehouses' ? 'warehouse' : groupName === 'operations' ? 'operation' : groupName === 'approvals' ? 'approval' : 'invoice';
                                  return (
                                    <button key={itemKey} type="button" className="search-result-item" onClick={() => handleGlobalSearchSelect(category, item)}>
                                      <div>
                                        <strong>{title}</strong>
                                        <small>{subtitle}</small>
                                      </div>
                                      <span className="mini-tag blue">↵</span>
                                    </button>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div className="search-result-group">
                          <div className="search-group-label">No results</div>
                          <div className="empty-state" style={{ paddingTop: 10 }}>No matching products, customers, orders, or warehouses for “{globalSearch}”. Try a SKU, customer name, or product category.</div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="search-result-group">
                        <div className="search-group-label">Actions</div>
                        {commandPaletteItems.map((item) => (
                          <button key={item.label} type="button" className="search-result-item" onClick={() => {
                            if (item.page) setPage(item.page);
                            if (item.action) item.action();
                            setCommandPaletteOpen(false);
                            setGlobalSearch('');
                          }}>
                            <div>
                              <strong>{item.label}</strong>
                              <small>{item.page ? 'Navigate' : 'Quick action'}</small>
                            </div>
                            <span className="mini-tag purple">{item.icon}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="search-panel-footer">
                    <span>Search across products, warehouses, movement records, and billing.</span>
                    <span><span className="kbd">Esc</span> to close</span>
                  </div>
                </div>
              </div>
            )}

            {notificationOpen && (
              <div className="notification-panel">
                <h4>Alerts</h4>
                {lowStockProducts.length > 0 ? (
                  lowStockProducts.slice(0, 3).map((product) => (
                    <div className="notification-item" key={product.id}>
                      <div>
                        <strong>{product.name}</strong>
                        <small>{totalStock(product)} {product.unit} remaining</small>
                      </div>
                      <span className="notification-badge">{totalStock(product) <= Number(product.reorder || 0) ? 'Low' : 'Risk'}</span>
                    </div>
                  ))
                ) : (
                  <div className="notification-item">
                    <div>
                      <strong>Inventory stable</strong>
                      <small>No stock alerts require action.</small>
                    </div>
                    <span className="notification-badge">OK</span>
                  </div>
                )}
              </div>
            )}

            {!isOnline && (
              <div style={{ background: '#fff4e6', color: '#815c2b', padding: '10px 18px', borderBottom: '1px solid #f0debc', fontSize: 12 }}>
                <strong>Offline mode</strong> · Your browser is offline. Local changes are kept until sync is available.
              </div>
            )}

            <div className="content">
              {page === 'Today' && (
                <>
                  <div className="page-row">
                    <div>
                      <div className="eyebrow">Operations center <span className="live-pill"><i />Workspace active</span></div>
                      <h1 className="page-head">Good morning, {displayUser.name.split(' ')[0]}.</h1>
                      <div className="page-sub">{todayPriorityText}</div>
                    </div>
                    <Button variant="success" onClick={() => openOperation('Receipt')}>＋ New operation</Button>
                  </div>

                  <div className="today-grid">
                    <div className="today-hero">
                      <h2>{lowStockProducts.length ? `${lowStockProducts.length} stock watch items` : 'Inventory health is strong'}</h2>
                      <ul className="today-list">
                        <li><span>{products.length} tracked products</span><span className="mini-tag green">{products.length}</span></li>
                        <li><span>{totalTrackedUnits} units on hand</span><span className="mini-tag blue">{totalTrackedUnits}</span></li>
                        <li><span>{warehouseList.length} active locations</span><span className="mini-tag purple">{warehouseList.length}</span></li>
                        <li><span>{lowStockProducts.length} low-stock alerts</span><span className="mini-tag orange">{lowStockProducts.length}</span></li>
                      </ul>
                    </div>

                    <div className="feature-card">
                      <div className="feature-head">
                        <h4>Recommended actions</h4>
                        <button className="link-button" type="button" onClick={() => setPage('Products')}>Review</button>
                      </div>
                      <ul className="feature-list">
                        {attentionItems.length > 0 && lowStockProducts.length > 0 ? (
                          attentionItems.map((item) => (
                            <li key={item.id}><span>{item.name}</span><span className="mini-tag orange">!</span></li>
                          ))
                        ) : (
                          <li><span>No stock alerts right now</span><span className="mini-tag green">✓</span></li>
                        )}
                      </ul>
                    </div>
                  </div>

                  <div className="grid-3" style={{ marginTop: 16 }}>
                    <div className="feature-card">
                      <div className="feature-head">
                        <h4>Ask Stockwise</h4>
                        <button className="link-button" type="button" onClick={() => setCommandPaletteOpen(true)}>Open</button>
                      </div>
                      <ul className="feature-list">
                        <li><span>Which products need restock?</span><span className="mini-tag orange">{lowStockProducts.length}</span></li>
                        <li><span>Where is the most stock held?</span><span className="mini-tag blue">{warehouseList.length}</span></li>
                        <li><span>Movement records in log</span><span className="mini-tag green">{docs.length}</span></li>
                      </ul>
                    </div>
                    <div className="feature-card">
                      <div className="feature-head">
                        <h4>Operational focus</h4>
                        <button className="link-button" type="button" onClick={() => setPage('Operations')}>Log</button>
                      </div>
                      <ul className="feature-list">
                        <li><span>Receipts logged</span><span>{docs.filter((doc) => doc.type === 'Receipt').length}</span></li>
                        <li><span>Transfers logged</span><span>{docs.filter((doc) => doc.type === 'Internal').length}</span></li>
                        <li><span>Products out of stock</span><span>{outOfStockCount}</span></li>
                      </ul>
                    </div>
                    <div className="feature-card">
                      <div className="feature-head">
                        <h4>Inventory health</h4>
                        <button className="link-button" type="button" onClick={() => setPage('Reports')}>View</button>
                      </div>
                      <ul className="feature-list">
                        <li><span>Stock value at listed price</span><span>{moneyFormatter.format(totalInventoryValue)}</span></li>
                        <li><span>Tracked units</span><span>{formatNumber(totalTrackedUnits)}</span></li>
                        <li><span>Product coverage</span><span>{products.length ? `${Math.round((activeProductCount / products.length) * 100)}%` : '0%'}</span></li>
                      </ul>
                    </div>
                  </div>

                  <div className="grid-3" style={{ marginTop: 16 }}>
                    <div className="feature-card">
                      <div className="feature-head">
                        <h4>Recent activity</h4>
                        <button className="link-button" type="button" onClick={() => setPage('Operations')}>Open</button>
                      </div>
                      <ul className="feature-list">
                        {docs.slice(0, 4).map((doc) => (
                          <li key={`${doc.id}-today`}><span>{doc.product}</span><span>{doc.type}</span></li>
                        ))}
                      </ul>
                    </div>
                    <div className="feature-card">
                      <div className="feature-head">
                        <h4>Inventory health</h4>
                        <button className="link-button" type="button" onClick={() => setPage('Reports')}>Details</button>
                      </div>
                      <ul className="feature-list">
                        <li><span>Stock availability</span><span>{products.length ? `${Math.max(0, Math.min(100, Math.round(((activeProductCount / products.length) * 100))))}%` : '—'}</span></li>
                        <li><span>Inventory accuracy</span><span>Not measured</span></li>
                        <li><span>Out of stock</span><span>{outOfStockCount}</span></li>
                        <li><span>Low-stock value at listed price</span><span>{moneyFormatter.format(Math.max(0, lowStockProducts.reduce((sum, product) => sum + totalStock(product) * Number(product.price || 0), 0)))}</span></li>
                      </ul>
                    </div>
                    <div className="feature-card">
                      <div className="feature-head">
                        <h4>Live operations</h4>
                        <button className="link-button" type="button" onClick={() => setPage('Operations')}>Log</button>
                      </div>
                      <ul className="feature-list">
                        <li><span>Receipts</span><span>{currentReceipts}</span></li>
                        <li><span>Transfers</span><span>{docs.filter((doc) => doc.type === 'Internal').length}</span></li>
                        <li><span>Adjustments</span><span>{docs.filter((doc) => doc.type === 'Adjustment').length}</span></li>
                        <li><span>Unpaid invoices</span><span>{invoices.filter((invoice) => invoice.status === 'Unpaid').length}</span></li>
                      </ul>
                    </div>
                  </div>
                </>
              )}

              {page === 'Dashboard' && (
                <>
                  <div className="page-row">
                    <div>
                      <div className="eyebrow">Inventory command center</div>
                      <h1 className="page-head">Operational dashboard</h1>
                      <div className="page-sub">What do you have, where is it, and what needs attention today?</div>
                    </div>
                    <Button variant="success" onClick={() => openOperation('Receipt')}>＋ New operation</Button>
                  </div>

                  <Row className="g-3 mb-4">
                    <Col sm={6} xl={3}>
                      <Card className="kpi-card">
                        <Card.Body>
                          <div className="kpi-top">
                            <span className="kpi-label">Stock value at listed price</span>
                            <span className="kpi-icon icon-blue">$</span>
                          </div>
                          <div className="kpi-value">{new Intl.NumberFormat(undefined, { style: 'currency', currency: settings.currency }).format(totalInventoryValue)}</div>
                          <div className="kpi-foot">Across {warehouseList.length} active locations</div>
                        </Card.Body>
                      </Card>
                    </Col>
                    <Col sm={6} xl={3}>
                      <Card className="kpi-card">
                        <Card.Body>
                          <div className="kpi-top">
                            <span className="kpi-label">Low stock</span>
                            <span className="kpi-icon icon-gold">!</span>
                          </div>
                          <div className="kpi-value">{lowStockProducts.length}</div>
                          <div className="kpi-foot">{outOfStockCount} items currently out of stock</div>
                        </Card.Body>
                      </Card>
                    </Col>
                    <Col sm={6} xl={3}>
                      <Card className="kpi-card">
                        <Card.Body>
                          <div className="kpi-top">
                            <span className="kpi-label">Total units</span>
                            <span className="kpi-icon icon-green">▣</span>
                          </div>
                          <div className="kpi-value">{formatNumber(products.reduce((sum, product) => sum + totalStock(product), 0))}</div>
                          <div className="kpi-foot">Across all products and warehouses</div>
                        </Card.Body>
                      </Card>
                    </Col>
                    <Col sm={6} xl={3}>
                      <Card className="kpi-card">
                        <Card.Body>
                          <div className="kpi-top">
                            <span className="kpi-label">Incoming stock</span>
                            <span className="kpi-icon icon-purple">↓</span>
                          </div>
                          <div className="kpi-value">{currentReceipts}</div>
                          <div className="kpi-foot">Receipts queued for validation</div>
                        </Card.Body>
                      </Card>
                    </Col>
                  </Row>

                  {lowStockProducts.length > 0 && (
                    <div className="inventory-alert mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <span><strong>Stock attention needed:</strong> {lowStockProducts.length} products are at or below the current alert threshold.</span>
                      <button type="button" className="link-button" onClick={() => setPage('Products')}>Review products →</button>
                    </div>
                  )}

                  <div className="grid-3" style={{ marginBottom: 16 }}>
                    {[
                      ['Receipt', '↓', 'icon-green', 'Receive incoming goods'],
                      ['Delivery', '↑', 'icon-blue', 'Dispatch or ship stock'],
                      ['Internal', '⇄', 'icon-purple', 'Transfer inventory between locations'],
                    ].map(([type, icon, tone, copy]) => (
                      <button key={type} type="button" className="action-card" onClick={() => openOperation(type)}>
                        <span className={`action-icon ${tone}`}>{icon}</span>
                        <span className="action-copy">
                          <strong>{type === 'Internal' ? 'Internal transfer' : type}</strong>
                          <span>{copy}</span>
                        </span>
                        <span style={{ marginLeft: 'auto', color: '#9aa7b8' }}>›</span>
                      </button>
                    ))}
                  </div>

                  <div className="section-card" style={{ marginBottom: 16 }}>
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Recent activity</h2>
                        <div className="section-sub">Latest inventory movements and ledger events</div>
                      </div>
                      <button type="button" className="link-button" onClick={() => setPage('Operations')}>View full log</button>
                    </div>
                    <div className="table-responsive">
                      <Table hover>
                        <thead>
                          <tr>
                            <th>Reference</th>
                            <th>Type</th>
                            <th>Product</th>
                            <th>Qty</th>
                            <th>Location</th>
                            <th>Status</th>
                            <th>Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {docs.slice(0, 5).map((doc) => (
                            <tr key={`${doc.id}-dashboard`}>
                              <td><span className="ref-code">{doc.id}</span></td>
                              <td>{doc.type}</td>
                              <td><span className="product-name">{doc.product}</span></td>
                              <td>{doc.type === 'Receipt' ? '+' : doc.type === 'Delivery' ? '−' : doc.type === 'Internal' ? '⇄' : '±'} {formatNumber(doc.qty)}</td>
                              <td>{doc.location}</td>
                              <td><StatusBadge status={doc.status} /></td>
                              <td>{doc.date}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                </>
              )}

              {page === 'Products' && (
                <>
                  <div className="page-row">
                    <div>
                      <div className="eyebrow">Catalog</div>
                      <h1 className="page-head">Products</h1>
                      <div className="page-sub">Track product records, pricing, stock health, and reorder readiness.</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Button variant="outline-secondary" onClick={openImportModal}>Import file</Button>
                      <Button variant="success" onClick={openProductModal}>＋ Add product</Button>
                    </div>
                  </div>

                  <div className="section-card">
                    <div className="section-head section-head-wrap">
                      <div>
                        <h2 className="section-heading">Catalog overview <span className="soft-count">({filteredProducts.length})</span></h2>
                        <div className="section-sub">Current stock availability and product health</div>
                      </div>
                      <div className="toolbar toolbar-wrap">
                        <InputGroup className="search-box">
                          <InputGroup.Text className="input-glyph">⌕</InputGroup.Text>
                          <Form.Control value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products or SKUs" />
                        </InputGroup>
                        <Form.Select className="filter-select" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                          <option value="All">All categories</option>
                          {[...new Set(products.map((product) => product.category))].map((category) => <option key={category} value={category}>{category}</option>)}
                        </Form.Select>
                        <Form.Select className="filter-select" value={productSort} onChange={(event) => setProductSort(event.target.value)}>
                          <option value="name-asc">Name A–Z</option>
                          <option value="name-desc">Name Z–A</option>
                          <option value="stock-desc">Stock highest</option>
                          <option value="price-asc">Price lowest</option>
                        </Form.Select>
                        <Form.Select className="filter-select" value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}>
                          <option value="All">All locations</option>
                          {warehouseList.map((location) => <option key={location} value={location}>{location}</option>)}
                        </Form.Select>
                      </div>
                    </div>

                    {selectedProductIds.length > 0 && (
                      <div className="section-head" style={{ paddingTop: 10, paddingBottom: 10 }}>
                        <span className="soft-count" aria-live="polite">{selectedProductIds.length} product{selectedProductIds.length === 1 ? '' : 's'} selected</span>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <Form.Select aria-label="Bulk update category" size="sm" value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value)} style={{ width: 'auto', minWidth: 160 }}>
                            <option value="">Change category...</option>
                            {[...new Set(products.map((product) => product.category).filter(Boolean))].map((category) => <option key={category} value={category}>{category}</option>)}
                          </Form.Select>
                          <Button size="sm" variant="outline-secondary" disabled={!bulkCategory} onClick={updateSelectedCategory}>Apply category</Button>
                          <Button size="sm" variant="outline-secondary" onClick={exportSelectedProducts}>Export selected</Button>
                          <Button size="sm" variant="outline-secondary" onClick={() => setSelectedProductIds([])}>Clear selection</Button>
                        </div>
                      </div>
                    )}

                    <div className="table-responsive">
                      <Table hover>
                        <thead>
                          <tr>
                            <th><input type="checkbox" aria-label="Select all visible products" checked={filteredProducts.length > 0 && filteredProducts.every((product) => selectedProductIds.includes(String(product.id)))} onChange={toggleVisibleProductSelection} /></th>
                            <th>Product</th>
                            <th>Category</th>
                            <th>Price</th>
                            <th>On hand</th>
                            <th>Reorder</th>
                            <th>Status</th>
                            <th>Locations</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredProducts.length === 0 ? (
                            <tr>
                              <td colSpan="9">
                                <div className="empty-state">No products match the current filters.</div>
                              </td>
                            </tr>
                          ) : (
                            filteredProducts.map((product) => {
                              const quantity = totalStock(product);
                              const status = quantity === 0 ? 'Out of stock' : isLowStock(product, settings.alertRule) ? 'Low stock' : 'Healthy';
                              return (
                                <tr key={product.id}>
                                  <td><input type="checkbox" aria-label={`Select ${product.name}`} checked={selectedProductIds.includes(String(product.id))} onChange={() => toggleProductSelection(product.id)} /></td>
                                  <td>
                                    <div className="product-name">{product.name}</div>
                                    <div style={{ color: '#8b9aad', fontSize: 10 }}>{product.sku} · {product.unit}{product.barcode ? ` · ${product.barcode}` : ''}</div>
                                  </td>
                                  <td>{product.category}</td>
                                  <td>{new Intl.NumberFormat(undefined, { style: 'currency', currency: settings.currency }).format(product.price)}</td>
                                  <td>{formatNumber(quantity)} {product.unit}</td>
                                  <td>{formatNumber(product.reorder)} {product.unit}</td>
                                  <td><StatusBadge status={status} /></td>
                                  <td>
                                    {Object.entries(product.stock || {}).map(([location, value]) => (
                                      <div key={`${product.id}-${location}`} style={{ fontSize: 11, color: '#425a74' }}>
                                        {location}: <strong>{formatNumber(value)}</strong>
                                      </div>
                                    ))}
                                  </td>
                                  <td>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                      <Button size="sm" variant="outline-secondary" onClick={() => { setProductDetails(product); setModal('product-details'); }}>Details</Button>
                                      <Button size="sm" variant="outline-secondary" onClick={() => editProduct(product)}>Edit</Button>
                                      <Button size="sm" variant="outline-danger" onClick={() => deleteProduct(product)}>Delete</Button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                </>
              )}

              {page === 'Operations' && (
                <>
                  <div className="page-row">
                    <div>
                      <div className="eyebrow">Operations</div>
                      <h1 className="page-head">Movement log</h1>
                      <div className="page-sub">Track receipts, deliveries, internal transfers, and adjustments.</div>
                    </div>
                    <Button variant="success" onClick={() => openOperation('Receipt')}>＋ New receipt</Button>
                  </div>
                  <OperationsTable docs={visibleOperationDocs} warehouseList={warehouseList} search={search} setSearch={setSearch} typeFilter={typeFilter} setTypeFilter={setTypeFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} locationFilter={locationFilter} setLocationFilter={setLocationFilter} ledger />
                </>
              )}

              {page === 'Suppliers' && (
                <>
                  <div className="page-row">
                    <div>
                      <div className="eyebrow">Partners</div>
                      <h1 className="page-head">Suppliers</h1>
                      <div className="page-sub">Manage vendor relationships, lead times, and supply continuity.</div>
                    </div>
                    <Button variant="success" onClick={() => { setSupplierForm({ name: '', contact: '', email: '', phone: '', leadTime: '5', category: 'General' }); setModal('supplier'); }}>＋ Add supplier</Button>
                  </div>

                  <Row className="g-3 mb-4">
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Active suppliers</div><div className="kpi-value">{suppliers.length}</div><div className="kpi-foot">Vendors in your network</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Avg. lead time</div><div className="kpi-value">{suppliers.length ? `${Math.round(suppliers.reduce((sum, supplier) => sum + Number(supplier.leadTime || 0), 0) / suppliers.length)}d` : '—'}</div><div className="kpi-foot">Across current supplier records</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Open PO value</div><div className="kpi-value">{moneyFormatter.format(purchaseOrders.filter((order) => order.status !== 'Received').reduce((sum, order) => sum + Number(order.total || 0), 0))}</div><div className="kpi-foot">Current procurement commitments</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Top category</div><div className="kpi-value">{suppliers.length ? mostCommonValue(suppliers.map((supplier) => supplier.category)) : '—'}</div><div className="kpi-foot">Primary supply segment</div></Card.Body></Card></Col>
                  </Row>

                  <div className="section-card" style={{ marginBottom: 16 }}>
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Supplier SLA watchlist</h2>
                        <div className="section-sub">Lead-time and open-order signals are shown from saved supplier and purchase-order records. On-time delivery is not measured because shipments are not linked to purchase orders.</div>
                      </div>
                    </div>
                    <div className="table-responsive">
                      <Table hover>
                        <thead>
                          <tr>
                            <th>Supplier</th>
                            <th>Category</th>
                            <th>Lead time</th>
                            <th>On-time rate</th>
                            <th>Open POs</th>
                            <th>Delayed</th>
                            <th>Risk</th>
                          </tr>
                        </thead>
                        <tbody>
                          {supplierSlaSummary.length === 0 ? (
                            <tr><td colSpan="7"><div className="empty-state">No suppliers are in the current watchlist.</div></td></tr>
                          ) : (
                            supplierSlaSummary.map((supplier) => (
                              <tr key={supplier.id}>
                                <td className="product-name">{supplier.name}</td>
                                <td>{supplier.category}</td>
                                <td>{supplier.leadTime === null ? 'Not recorded' : `${supplier.leadTime}d`}</td>
                                <td>{supplier.onTimeRate === null ? 'Not measured' : `${Math.round(supplier.onTimeRate)}%`}</td>
                                <td>{supplier.openOrders}</td>
                                <td>{supplier.lateShipments === null ? 'Not measured' : supplier.lateShipments}</td>
                                <td><StatusBadge status={supplier.riskLevel} /></td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </Table>
                    </div>
                  </div>

                  <div className="section-card">
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Supplier directory</h2>
                        <div className="section-sub">Key contacts, lead time, and supply profile</div>
                      </div>
                    </div>
                    <div className="table-responsive">
                      <Table hover>
                        <thead>
                          <tr>
                            <th>Supplier</th>
                            <th>Contact</th>
                            <th>Category</th>
                            <th>Lead time</th>
                            <th>Email</th>
                            <th>Phone</th>
                          </tr>
                        </thead>
                        <tbody>
                          {suppliers.length === 0 ? (
                            <tr><td colSpan="6"><div className="empty-state">No suppliers have been added yet.</div></td></tr>
                          ) : (
                            suppliers.map((supplier) => (
                              <tr key={supplier.id}>
                                <td className="product-name">{supplier.name}</td>
                                <td>{supplier.contact || '—'}</td>
                                <td>{supplier.category}</td>
                                <td>{supplier.leadTime === null ? 'Not recorded' : `${supplier.leadTime} days`}</td>
                                <td>{supplier.email || '—'}</td>
                                <td>{supplier.phone || '—'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                </>
              )}

              {page === 'Procurement' && (
                <>
                  <div className="page-row">
                    <div>
                      <div className="eyebrow">Procurement</div>
                      <h1 className="page-head">Purchase orders</h1>
                      <div className="page-sub">Create, track, and receive purchase commitments against your product catalog.</div>
                    </div>
                    <Button variant="success" onClick={() => { setPurchaseForm({ supplierId: suppliers[0]?.id || '', productId: products[0]?.id || '', qty: '0', unitCost: '0', expectedDate: '', location: warehouseList[0] || '', status: 'Draft' }); setModal('purchase'); }}>＋ New purchase order</Button>
                  </div>

                  <Row className="g-3 mb-4">
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Open orders</div><div className="kpi-value">{purchaseOrders.filter((order) => order.status !== 'Received').length}</div><div className="kpi-foot">Orders awaiting receipt</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Received orders</div><div className="kpi-value">{purchaseOrders.filter((order) => order.status === 'Received').length}</div><div className="kpi-foot">Purchase orders marked received</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Pending value</div><div className="kpi-value">{moneyFormatter.format(purchaseOrders.filter((order) => order.status !== 'Received').reduce((sum, order) => sum + Number(order.total || 0), 0))}</div><div className="kpi-foot">Committed purchasing spend</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Avg. order cost</div><div className="kpi-value">{purchaseOrders.length ? moneyFormatter.format(purchaseOrders.reduce((sum, order) => sum + Number(order.total || 0), 0) / purchaseOrders.length) : moneyFormatter.format(0)}</div><div className="kpi-foot">Across all purchase orders</div></Card.Body></Card></Col>
                  </Row>

                  <div className="section-card" style={{ marginBottom: 16 }}>
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Recommended replenishment</h2>
                        <div className="section-sub">Gap from current stock to the configured reorder point; no forecast uplift is applied.</div>
                      </div>
                    </div>
                    <div className="table-responsive">
                      <Table hover>
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>On hand</th>
                            <th>Reorder</th>
                            <th>Fulfilled demand (30d)</th>
                            <th>Qty to reorder point</th>
                            <th>Supplier</th>
                            <th>Priority</th>
                          </tr>
                        </thead>
                        <tbody>
                          {procurementRecommendations.length === 0 ? (
                            <tr><td colSpan="7"><div className="empty-state">No replenishment recommendations are needed right now.</div></td></tr>
                          ) : (
                            procurementRecommendations.map((item) => (
                              <tr key={item.id}>
                                <td className="product-name">{item.name}</td>
                                <td>{formatNumber(item.stock)}</td>
                                <td>{formatNumber(item.reorder)}</td>
                                <td>{item.demand === null ? 'Unavailable · undated orders' : formatNumber(item.demand)}</td>
                                <td>{formatNumber(item.recommendedQty)}</td>
                                <td>{item.supplierName}</td>
                                <td><StatusBadge status={item.priority === 'Critical' ? 'Critical' : item.priority === 'High' ? 'Waiting' : item.priority === 'Medium' ? 'Scheduled' : 'Done'} /></td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </Table>
                    </div>
                  </div>

                  <div className="section-card">
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Purchase order list</h2>
                        <div className="section-sub">Current backlog, expected delivery dates, and procurement status</div>
                      </div>
                    </div>
                    <div className="table-responsive">
                      <Table hover>
                        <thead>
                          <tr>
                            <th>PO ID</th>
                            <th>Supplier</th>
                            <th>Product</th>
                            <th>Qty</th>
                            <th>Total</th>
                            <th>Location</th>
                            <th>Status</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {purchaseOrders.length === 0 ? (
                            <tr><td colSpan="8"><div className="empty-state">No purchase orders have been created yet.</div></td></tr>
                          ) : (
                            purchaseOrders.map((order) => (
                              <tr key={order.id}>
                                <td><span className="ref-code">{order.id}</span></td>
                                <td className="product-name">{order.supplierName}</td>
                                <td>{order.productName}</td>
                                <td>{formatNumber(order.qty)}</td>
                                <td>{moneyFormatter.format(Number(order.total || 0))}</td>
                                <td>{order.location || '—'}</td>
                                <td><StatusBadge status={order.status === 'Received' ? 'Done' : order.status === 'Draft' ? 'Draft' : 'Waiting'} /></td>
                                <td>
                                  {order.status !== 'Received' ? (
                                    <Button size="sm" variant="outline-secondary" onClick={() => receivePurchaseOrder(order)}>Mark received</Button>
                                  ) : (
                                    <span style={{ color: '#7f96af', fontSize: 12 }}>Received</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                </>
              )}

              {page === 'Customers' && (
                <>
                  <div className="page-row">
                    <div>
                      <div className="eyebrow">Partners</div>
                      <h1 className="page-head">Customers</h1>
                      <div className="page-sub">Track customers, order volume, and regional activity.</div>
                    </div>
                    <Button variant="success" onClick={() => { setCustomerForm({ name: '', email: '', phone: '', tier: 'Standard', region: 'North' }); setModal('customer'); }}>＋ Add customer</Button>
                  </div>

                  <Row className="g-3 mb-4">
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Customers</div><div className="kpi-value">{customers.length}</div><div className="kpi-foot">Active customer records</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Orders</div><div className="kpi-value">{salesOrders.length}</div><div className="kpi-foot">Sales orders created</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Top region</div><div className="kpi-value">{customers.length ? mostCommonValue(customers.map((customer) => customer.region)) : '—'}</div><div className="kpi-foot">Highest customer concentration</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Sales order value</div><div className="kpi-value">{moneyFormatter.format(salesOrders.reduce((sum, order) => sum + Number(order.total || 0), 0))}</div><div className="kpi-foot">Value of recorded orders, including drafts</div></Card.Body></Card></Col>
                  </Row>

                  <div className="section-card">
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Customer list</h2>
                        <div className="section-sub">Customer profile and account details</div>
                      </div>
                    </div>
                    <div className="table-responsive">
                      <Table hover>
                        <thead>
                          <tr>
                            <th>Customer</th>
                            <th>Email</th>
                            <th>Phone</th>
                            <th>Region</th>
                            <th>Tier</th>
                            <th>Orders</th>
                          </tr>
                        </thead>
                        <tbody>
                          {customers.length === 0 ? (
                            <tr><td colSpan="6"><div className="empty-state">No customers have been added yet.</div></td></tr>
                          ) : (
                            customers.map((customer) => (
                              <tr key={customer.id}>
                                <td className="product-name">{customer.name}</td>
                                <td>{customer.email || '—'}</td>
                                <td>{customer.phone || '—'}</td>
                                <td>{customer.region}</td>
                                <td>{customer.tier}</td>
                                <td>{Number(customer.orders) || 0}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </Table>
                    </div>
                  </div>

                  <div className="section-card" style={{ marginTop: 16 }}>
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Account scorecard</h2>
                        <div className="section-sub">Recorded order values and returns by customer; order value includes drafts.</div>
                      </div>
                    </div>
                    <div className="table-responsive">
                      <Table hover>
                        <thead>
                          <tr>
                            <th>Customer</th>
                            <th>Sales order value</th>
                            <th>Margin (not tracked)</th>
                            <th>Avg. order value</th>
                            <th>Units shipped</th>
                            <th>Returns in workflow</th>
                            <th>Health</th>
                          </tr>
                        </thead>
                        <tbody>
                          {customerPerformance.length === 0 ? (
                            <tr><td colSpan="7"><div className="empty-state">No customer performance signals are available yet.</div></td></tr>
                          ) : (
                            customerPerformance.map((customer) => (
                              <tr key={customer.id}>
                                <td className="product-name">{customer.name}</td>
                                <td>{moneyFormatter.format(customer.revenue)}</td>
                                <td>Not tracked</td>
                                <td>{moneyFormatter.format(customer.avgOrderValue)}</td>
                                <td>{formatNumber(customer.units)}</td>
                                <td>{formatNumber(customer.returnedUnits)}</td>
                                <td><StatusBadge status={customer.accountHealth} /></td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                </>
              )}

              {page === 'Sales' && (
                <>
                  <div className="page-row">
                    <div>
                      <div className="eyebrow">Sales</div>
                      <h1 className="page-head">Sales orders</h1>
                      <div className="page-sub">Track outbound orders, fulfillment status, and customer demand.</div>
                    </div>
                    <Button variant="success" onClick={() => { setSalesForm({ customerId: customers[0]?.id || '', productId: products[0]?.id || '', qty: '1', unitPrice: '0', status: 'Draft', location: warehouseList[0] || '', expectedDate: '' }); setModal('sales'); }}>＋ New sales order</Button>
                  </div>

                  <Row className="g-3 mb-4">
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Draft</div><div className="kpi-value">{salesOrders.filter((order) => order.status === 'Draft').length}</div><div className="kpi-foot">Awaiting confirmation</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Confirmed</div><div className="kpi-value">{salesOrders.filter((order) => order.status === 'Confirmed').length}</div><div className="kpi-foot">Orders ready to ship</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Shipped</div><div className="kpi-value">{salesOrders.filter((order) => order.status === 'Shipped').length}</div><div className="kpi-foot">Fulfilled orders</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Order value</div><div className="kpi-value">{moneyFormatter.format(salesOrders.reduce((sum, order) => sum + Number(order.total || 0), 0))}</div><div className="kpi-foot">Total sales value</div></Card.Body></Card></Col>
                  </Row>

                  <div className="section-card">
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Sales order ledger</h2>
                        <div className="section-sub">Current demand, customer, and fulfillment status</div>
                      </div>
                    </div>
                    <div className="table-responsive">
                      <Table hover>
                        <thead>
                          <tr>
                            <th>Order</th>
                            <th>Customer</th>
                            <th>Product</th>
                            <th>Qty</th>
                            <th>Total</th>
                            <th>Status</th>
                            <th>Location</th>
                          </tr>
                        </thead>
                        <tbody>
                          {salesOrders.length === 0 ? (
                            <tr><td colSpan="7"><div className="empty-state">No sales orders have been created yet.</div></td></tr>
                          ) : (
                            salesOrders.map((order) => (
                              <tr key={order.id}>
                                <td><span className="ref-code">{order.id}</span></td>
                                <td className="product-name">{order.customerName}</td>
                                <td>{order.productName}</td>
                                <td>{formatNumber(order.qty)}</td>
                                <td>{moneyFormatter.format(Number(order.total || 0))}</td>
                                <td><StatusBadge status={order.status} /></td>
                                <td>{order.location}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                </>
              )}

              {page === 'Fulfillment' && (
                <>
                  <div className="page-row">
                    <div>
                      <div className="eyebrow">Fulfillment</div>
                      <h1 className="page-head">Shipping & dispatch</h1>
                      <div className="page-sub">Coordinate outbound deliveries, carriers, and shipping readiness.</div>
                    </div>
                    <Button variant="success" onClick={() => { setShipmentForm({ orderId: salesOrders[0]?.id || '', carrier: 'UPS', tracking: '', status: 'Ready', location: warehouseList[0] || '' }); setModal('shipment'); }}>＋ Create shipment</Button>
                  </div>

                  <Row className="g-3 mb-4">
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Ready</div><div className="kpi-value">{shipments.filter((shipment) => shipment.status === 'Ready').length}</div><div className="kpi-foot">Awaiting dispatch</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">In transit</div><div className="kpi-value">{shipments.filter((shipment) => shipment.status === 'In Transit').length}</div><div className="kpi-foot">Active deliveries</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Delivered</div><div className="kpi-value">{shipments.filter((shipment) => shipment.status === 'Delivered').length}</div><div className="kpi-foot">Completed shipments</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Units shipped</div><div className="kpi-value">{formatNumber(shipments.reduce((sum, shipment) => sum + Number(shipment.qty || 0), 0))}</div><div className="kpi-foot">Total outbound units</div></Card.Body></Card></Col>
                  </Row>

                  <div className="section-card">
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Shipment ledger</h2>
                        <div className="section-sub">Order, carrier, tracking, and dispatch status</div>
                      </div>
                    </div>
                    <div className="table-responsive">
                      <Table hover>
                        <thead>
                          <tr>
                            <th>Shipment</th>
                            <th>Order</th>
                            <th>Customer</th>
                            <th>Product</th>
                            <th>Qty</th>
                            <th>Carrier</th>
                            <th>Tracking</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shipments.length === 0 ? (
                            <tr><td colSpan="8"><div className="empty-state">No shipments have been created yet.</div></td></tr>
                          ) : (
                            shipments.map((shipment) => (
                              <tr key={shipment.id}>
                                <td><span className="ref-code">{shipment.id}</span></td>
                                <td>{shipment.orderId}</td>
                                <td className="product-name">{shipment.customerName}</td>
                                <td>{shipment.productName}</td>
                                <td>{formatNumber(shipment.qty)}</td>
                                <td>{shipment.carrier}</td>
                                <td>{shipment.tracking}</td>
                                <td><StatusBadge status={shipment.status} /></td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                </>
              )}

              {page === 'Returns' && (
                <>
                  <div className="page-row">
                    <div>
                      <div className="eyebrow">Returns</div>
                      <h1 className="page-head">Return processing</h1>
                      <div className="page-sub">Track customer returns, restock adjustments, and exception handling.</div>
                    </div>
                    <Button variant="success" onClick={() => { setReturnForm({ orderId: returnableSalesOrders[0]?.id || '', customerId: returnableSalesOrders[0]?.customerId || '', productId: returnableSalesOrders[0]?.productId || '', qty: '1', reason: 'Damaged', location: returnableSalesOrders[0]?.location || warehouseList[0] || '' }); setModal('return'); }}>＋ Process return</Button>
                  </div>

                  <Row className="g-3 mb-4">
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Open returns</div><div className="kpi-value">{returns.filter((item) => item.status === 'Pending').length}</div><div className="kpi-foot">Awaiting review</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Approved</div><div className="kpi-value">{returns.filter((item) => item.status === 'Approved').length}</div><div className="kpi-foot">Returned to inventory</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Units in return flow</div><div className="kpi-value">{formatNumber(returns.filter((item) => item.status !== 'Rejected').reduce((sum, item) => sum + Number(item.qty || 0), 0))}</div><div className="kpi-foot">Pending and approved return quantities</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Most frequent reason</div><div className="kpi-value">{returns.length ? mostCommonValue(returns.filter((item) => item.status !== 'Rejected').map((item) => item.reason)) || '—' : '—'}</div><div className="kpi-foot">Returned product issue</div></Card.Body></Card></Col>
                  </Row>

                  <div className="section-card">
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Return ledger</h2>
                        <div className="section-sub">Customer returns, cause, and stock restoration status</div>
                      </div>
                    </div>
                    <div className="table-responsive">
                      <Table hover>
                        <thead>
                          <tr>
                            <th>Return</th>
                            <th>Customer</th>
                            <th>Product</th>
                            <th>Qty</th>
                            <th>Reason</th>
                            <th>Location</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {returns.length === 0 ? (
                            <tr><td colSpan="7"><div className="empty-state">No return records yet.</div></td></tr>
                          ) : (
                            returns.map((item) => (
                              <tr key={item.id}>
                                <td><span className="ref-code">{item.id}</span></td>
                                <td className="product-name">{item.customerName}</td>
                                <td>{item.productName}</td>
                                <td>{formatNumber(item.qty)}</td>
                                <td>{item.reason}</td>
                                <td>{item.location}</td>
                                <td><StatusBadge status={item.status} /></td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                </>
              )}

              {page === 'Warehouses' && (
                <>
                  <div className="page-row">
                    <div>
                      <div className="eyebrow">Locations</div>
                      <h1 className="page-head">Warehouses & locations</h1>
                      <div className="page-sub">Keep inventory organized across every warehouse, zone, and staging area.</div>
                    </div>
                    <Button variant="success" onClick={() => { setWarehouseForm({ name: '', capacity: '', bins: '' }); setModal('warehouse'); }}>＋ Add location</Button>
                  </div>

                  <div className="warehouse-grid">
                    {warehouseList.map((location) => {
                      const totalUnits = products.reduce((sum, product) => sum + Number(product.stock?.[location] || 0), 0);
                      const activeProducts = products.filter((product) => Number(product.stock?.[location] || 0) > 0).length;
                      const profile = normalizeWarehouseProfile(warehouseProfiles[location], location);
                      const capacityStatus = getWarehouseCapacityStatus(totalUnits, profile.capacity);
                      return (
                        <div key={location} className="warehouse-tile warehouse-card">
                          <div className="feature-head">
                            <h4>{location}</h4>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <Button size="sm" variant="outline-secondary" onClick={() => { setRenameTarget(location); setRenameValue(location); setModal('rename'); }}>Rename</Button>
                              <Button size="sm" variant="outline-danger" onClick={() => deleteWarehouse(location)}>Remove</Button>
                            </div>
                          </div>
                          <div className="value">{formatNumber(totalUnits)}</div>
                          <div className="small">Total units in storage</div>
                          <div className="small" style={{ marginTop: 8 }}>{activeProducts} active product lines</div>
                          <div className="small" style={{ marginTop: 8 }}>
                            {capacityStatus.capacity === null ? 'Capacity not configured' : `${formatNumber(capacityStatus.used)} / ${formatNumber(capacityStatus.capacity)} units · ${Math.round(capacityStatus.percent)}%`}
                          </div>
                          <div className="small" style={{ marginTop: 4 }}>{profile.bins.length ? `${profile.bins.length} bins configured` : 'No bins configured'} · {capacityStatus.status}</div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="section-card" style={{ marginTop: 16 }}>
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Warehouse optimization board</h2>
                        <div className="section-sub">Track allocation pressure, inbound/outbound flow, and stock health by location.</div>
                      </div>
                    </div>
                    <div className="table-responsive">
                      <Table hover>
                        <thead>
                          <tr>
                            <th>Location</th>
                            <th>Units</th>
                            <th>Active products</th>
                            <th>Low stock items</th>
                            <th>Inbound</th>
                            <th>Outbound</th>
                            <th>Net flow</th>
                            <th>Capacity</th>
                            <th>Health</th>
                          </tr>
                        </thead>
                        <tbody>
                          {warehousePerformance.length === 0 ? (
                            <tr><td colSpan="9"><div className="empty-state">No warehouse performance data is available yet.</div></td></tr>
                          ) : (
                            warehousePerformance.map((location) => (
                              <tr key={location.location}>
                                <td className="product-name">{location.location}</td>
                                <td>{formatNumber(location.totalUnits)}</td>
                                <td>{location.activeProducts}</td>
                                <td>{location.lowStockProductsAtLocation}</td>
                                <td>{formatNumber(location.inbound)}</td>
                                <td>{formatNumber(location.outbound)}</td>
                                <td>{formatNumber(location.netFlow)}</td>
                                <td>{(() => { const profile = normalizeWarehouseProfile(warehouseProfiles[location.location], location.location); const status = getWarehouseCapacityStatus(location.totalUnits, profile.capacity); return status.capacity === null ? 'Unmetered' : `${Math.round(status.percent)}%`; })()}</td>
                                <td><StatusBadge status={location.health} /></td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                </>
              )}

              {page === 'Approvals' && (
                <>
                  <div className="page-row">
                    <div>
                      <div className="eyebrow">Control layer</div>
                      <h1 className="page-head">Approvals</h1>
                      <div className="page-sub">Review pending actions before they move stock, cash, or supply commitments forward.</div>
                    </div>
                  </div>

                  <Row className="g-3 mb-4">
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Pending</div><div className="kpi-value">{approvalQueue.length}</div><div className="kpi-foot">Items awaiting review</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Sales drafts</div><div className="kpi-value">{salesOrders.filter((order) => order.status === 'Draft').length}</div><div className="kpi-foot">Orders pending approval</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Return checks</div><div className="kpi-value">{returns.filter((item) => item.status === 'Pending').length}</div><div className="kpi-foot">Customer returns under review</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Draft POs</div><div className="kpi-value">{purchaseOrders.filter((order) => order.status === 'Draft').length}</div><div className="kpi-foot">Procurement waiting approval</div></Card.Body></Card></Col>
                  </Row>

                  <div className="section-card">
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Approval queue</h2>
                        <div className="section-sub">Approve or reject operational actions before they affect the warehouse or ledger.</div>
                      </div>
                    </div>
                    <div className="table-responsive">
                      <Table hover>
                        <thead>
                          <tr>
                            <th>Request</th>
                            <th>Type</th>
                            <th>Subject</th>
                            <th>Reference</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {approvalQueue.length === 0 ? (
                            <tr><td colSpan="7"><div className="empty-state">No items require approval.</div></td></tr>
                          ) : (
                            approvalQueue.map((item) => (
                              <tr key={item.id}>
                                <td><span className="ref-code">{item.id}</span></td>
                                <td>{item.type}</td>
                                <td className="product-name">{item.subject}</td>
                                <td>{item.reference}</td>
                                <td>{typeof item.amount === 'number' ? moneyFormatter.format(item.amount) : item.amount}</td>
                                <td><StatusBadge status={item.status} /></td>
                                <td>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <Button size="sm" variant="success" onClick={() => approveQueueItem(item)}>Approve</Button>
                                    <Button size="sm" variant="outline-danger" onClick={() => rejectQueueItem(item)}>Reject</Button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                </>
              )}

              {page === 'Access' && (
                <>
                  <div className="page-row">
                    <div>
                      <div className="eyebrow">Security</div>
                      <h1 className="page-head">Access & roles</h1>
                      <div className="page-sub">Assign responsibility by role and keep operational permissions aligned to the right team.</div>
                    </div>
                  </div>

                  <Row className="g-3 mb-4">
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Workspace users</div><div className="kpi-value">{users.length}</div><div className="kpi-foot">Accounts active in this workspace</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Roles</div><div className="kpi-value">{roleOptions.length}</div><div className="kpi-foot">Operational permission tiers</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Admins</div><div className="kpi-value">{users.filter((user) => (user.role || 'Admin') === 'Admin').length}</div><div className="kpi-foot">Full control and policy access</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Restricted views</div><div className="kpi-value">{users.filter((user) => (user.role || 'Admin') !== 'Admin').length}</div><div className="kpi-foot">Limited to scoped operations</div></Card.Body></Card></Col>
                  </Row>

                  <div className="section-card">
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Role matrix</h2>
                        <div className="section-sub">Use role-based access to split operations, finance, warehouse, and viewer controls.</div>
                      </div>
                    </div>
                    <div className="table-responsive">
                      <Table hover>
                        <thead>
                          <tr>
                            <th>User</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Access level</th>
                            <th>Permissions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.map((user) => (
                            <tr key={`${user.email}-${user.role}`}>
                              <td className="product-name">{user.name}</td>
                              <td>{user.email}</td>
                              <td><StatusBadge status={user.role || 'Admin'} /></td>
                              <td>{roleDefinitions[user.role || 'Admin']?.badge || 'Administrator'}</td>
                              <td>{(roleDefinitions[user.role || 'Admin']?.pages || []).slice(0, 3).join(', ')}{(roleDefinitions[user.role || 'Admin']?.pages || []).length > 3 ? ' + more' : ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                </>
              )}

              {page === 'Audit' && (
                <>
                  <div className="page-row">
                    <div>
                      <div className="eyebrow">Governance</div>
                      <h1 className="page-head">Audit trail</h1>
                      <div className="page-sub">Review operational activity, approvals, and movement events across the entire stock control system.</div>
                    </div>
                  </div>

                  <Row className="g-3 mb-4">
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Events</div><div className="kpi-value">{auditTrail.length}</div><div className="kpi-foot">Recent tracked changes</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Warehouse</div><div className="kpi-value">{docs.filter((item) => item.type === 'Receipt' || item.type === 'Internal').length}</div><div className="kpi-foot">Stock movement activities</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Approvals</div><div className="kpi-value">{approvalQueue.length}</div><div className="kpi-foot">Items waiting on review</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Cash</div><div className="kpi-value">{moneyFormatter.format(payments.reduce((sum, item) => sum + Number(item.amount || 0), 0))}</div><div className="kpi-foot">Recorded collections</div></Card.Body></Card></Col>
                  </Row>

                  <div className="section-card">
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Latest operational events</h2>
                        <div className="section-sub">Continuous traceability for disputes, operational reviews, and accountability.</div>
                      </div>
                    </div>
                    <div className="table-responsive">
                      <Table hover>
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>Type</th>
                            <th>Event</th>
                            <th>Actor</th>
                            <th>Reference</th>
                            <th>Status</th>
                            <th>Impact</th>
                          </tr>
                        </thead>
                        <tbody>
                          {auditTrail.length === 0 ? (
                            <tr><td colSpan="7"><div className="empty-state">No activity has been logged yet.</div></td></tr>
                          ) : (
                            auditTrail.map((entry) => (
                              <tr key={entry.id}>
                                <td>{new Date(entry.timestamp).toLocaleString()}</td>
                                <td>{entry.type}</td>
                                <td className="product-name">{entry.event}</td>
                                <td>{entry.actor}</td>
                                <td><span className="ref-code">{entry.reference}</span></td>
                                <td><StatusBadge status={entry.status} /></td>
                                <td>{entry.amount === null || entry.amount === undefined ? '—' : entry.amountType === 'currency' ? moneyFormatter.format(entry.amount) : formatNumber(entry.amount)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                </>
              )}

              {page === 'Forecasting' && (
                <>
                  <div className="page-row">
                    <div>
                      <div className="eyebrow">Planning</div>
                      <h1 className="page-head">Inventory risk & demand signals</h1>
                      <div className="page-sub">Compare on-hand stock with configured reorder points and dated fulfilled orders. Validated demand forecasting is not available yet.</div>
                    </div>
                  </div>

                  <Row className="g-3 mb-4">
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">At risk</div><div className="kpi-value">{forecastSignals.filter((item) => item.risk === 'Critical' || item.risk === 'Watch').length}</div><div className="kpi-foot">Items needing action this cycle</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Excess stock</div><div className="kpi-value">{forecastSignals.filter((item) => item.risk === 'Excess').length}</div><div className="kpi-foot">Products above normal coverage</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Avg. coverage</div><div className="kpi-value">{averageCoverageDays === null ? '—' : `${Math.round(averageCoverageDays)}d`}</div><div className="kpi-foot">Based on dated fulfilled sales in the last 30 days</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Net flow</div><div className="kpi-value">{formatNumber(forecastSignals.reduce((sum, item) => sum + Number(item.netMovement || 0), 0))}</div><div className="kpi-foot">Net inbound minus outbound units</div></Card.Body></Card></Col>
                  </Row>

                  <div className="section-card">
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Risk overview</h2>
                        <div className="section-sub">Stock risk is based on recorded on-hand quantity versus each product’s configured reorder point. No demand forecast is inferred from undated history.</div>
                      </div>
                    </div>
                    <div className="table-responsive">
                      <Table hover>
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>On hand</th>
                            <th>Reorder</th>
                            <th>Demand / 30d</th>
                            <th>Coverage</th>
                            <th>Risk</th>
                            <th>Evidence</th>
                            <th>Recommendation</th>
                          </tr>
                        </thead>
                        <tbody>
                          {forecastSignals.length === 0 ? (
                            <tr><td colSpan="8"><div className="empty-state">No product forecast is available yet.</div></td></tr>
                          ) : (
                            forecastSignals.map((item) => (
                              <tr key={item.id}>
                                <td className="product-name">{item.name}</td>
                                <td>{formatNumber(item.stock)}</td>
                                <td>{formatNumber(item.reorder)}</td>
                                <td>{item.demand === null ? 'Unavailable · undated orders' : formatNumber(item.demand)}</td>
                                <td>{Number.isFinite(item.coverageDays) ? `${Math.round(item.coverageDays)}d` : '—'}</td>
                                <td><StatusBadge status={item.risk} /></td>
                                <td title={item.evidence}>{item.evidence} · {item.confidence}</td>
                                <td>{item.recommendation}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </Table>
                    </div>
                  </div>

                  <div className="section-card" style={{ marginTop: 16 }}>
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Safety stock policy</h2>
                        <div className="section-sub">Safety-stock estimates are withheld until dated fulfilled sales and a product-linked supplier lead time are available.</div>
                      </div>
                    </div>
                    <div className="table-responsive">
                      <Table hover>
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>On hand</th>
                            <th>Avg / day</th>
                            <th>Lead time</th>
                            <th>Safety stock</th>
                            <th>Target cover</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {safetyStockRecommendations.length === 0 ? (
                            <tr><td colSpan="7"><div className="empty-state">No validated safety-stock recommendations are available. Add dated fulfilled orders and link products to suppliers before using demand-based estimates.</div></td></tr>
                          ) : (
                            safetyStockRecommendations.map((item) => (
                              <tr key={item.id}>
                                <td className="product-name">{item.name}</td>
                                <td>{formatNumber(item.stock)}</td>
                                <td>{item.avgDailyDemand > 0 ? item.avgDailyDemand.toFixed(1) : '0.0'}</td>
                                <td>{item.leadTimeDays}d</td>
                                <td>{formatNumber(item.recommendedSafety)}</td>
                                <td>{formatNumber(item.targetCover)}</td>
                                <td><StatusBadge status={item.policyStatus} /></td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </Table>
                    </div>
                  </div>

                  <div className="section-card" style={{ marginTop: 16 }}>
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">ABC shipped-order-value segmentation</h2>
                        <div className="section-sub">Contribution is calculated from shipped sales orders only; draft and confirmed orders are excluded.</div>
                      </div>
                    </div>
                    <div className="table-responsive">
                      <Table hover>
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>Shipped order value</th>
                            <th>Units shipped</th>
                            <th>Contribution</th>
                            <th>Cumulative</th>
                            <th>Class</th>
                          </tr>
                        </thead>
                        <tbody>
                          {abcSegmentation.length === 0 ? (
                            <tr><td colSpan="6"><div className="empty-state">No ABC segmentation is available yet.</div></td></tr>
                          ) : (
                            abcSegmentation.map((item) => (
                              <tr key={item.id}>
                                <td className="product-name">{item.name}</td>
                                <td>{moneyFormatter.format(item.shippedOrderValue)}</td>
                                <td>{formatNumber(item.units)}</td>
                                <td>{`${Math.round(item.contributionPct)}%`}</td>
                                <td>{`${Math.round(item.cumulativePct)}%`}</td>
                                <td><StatusBadge status={item.className === 'A' ? 'Critical' : item.className === 'B' ? 'Waiting' : 'Done'} /></td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                </>
              )}

              {page === 'Exceptions' && (
                <>
                  <div className="page-row">
                    <div>
                      <div className="eyebrow">Action center</div>
                      <h1 className="page-head">Exceptions</h1>
                      <div className="page-sub">Prioritize live operational issues requiring attention across stock, fulfillment, approval, and cash.</div>
                    </div>
                  </div>

                  <Row className="g-3 mb-4">
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Critical</div><div className="kpi-value">{exceptionQueue.filter((item) => item.severity === 'Critical').length}</div><div className="kpi-foot">Immediate intervention required</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Watch</div><div className="kpi-value">{exceptionQueue.filter((item) => item.severity === 'Watch').length}</div><div className="kpi-foot">Needs follow-up soon</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Approval blocks</div><div className="kpi-value">{approvalQueue.length}</div><div className="kpi-foot">Pending operational decisions</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Inventory risk</div><div className="kpi-value">{lowStockProducts.length}</div><div className="kpi-foot">Products below alert threshold</div></Card.Body></Card></Col>
                  </Row>

                  <div className="section-card">
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Exception queue</h2>
                        <div className="section-sub">Action items sourced from the live workload and control system.</div>
                      </div>
                    </div>
                    <div className="table-responsive">
                      <Table hover>
                        <thead>
                          <tr>
                            <th>Type</th>
                            <th>Subject</th>
                            <th>Detail</th>
                            <th>Owner</th>
                            <th>Severity</th>
                            <th>Open page</th>
                          </tr>
                        </thead>
                        <tbody>
                          {exceptionQueue.length === 0 ? (
                            <tr><td colSpan="6"><div className="empty-state">No exceptions are active.</div></td></tr>
                          ) : (
                            exceptionQueue.map((item) => (
                              <tr key={item.id}>
                                <td>{item.type}</td>
                                <td className="product-name">{item.subject}</td>
                                <td>{item.detail}</td>
                                <td>{item.owner}</td>
                                <td><StatusBadge status={item.severity} /></td>
                                <td><Button size="sm" variant="outline-secondary" onClick={() => setPage(item.relatedPage)}>{item.relatedPage}</Button></td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                </>
              )}

              {page === 'Reports' && (
                <>
                  <div className="page-row">
                    <div>
                      <div className="eyebrow">Insights</div>
                      <h1 className="page-head">Reports</h1>
                      <div className="page-sub">Review stock performance, product distribution, and current inventory health.</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Button variant="outline-secondary" onClick={() => downloadCsv('stockwise-products.csv', [['Name', 'SKU', 'Category', 'Preferred supplier', 'Price', 'Unit', 'Reorder', ...warehouseList], ...products.map((product) => [product.name, product.sku, product.category, product.supplierName || suppliers.find((supplier) => String(supplier.id) === String(product.supplierId))?.name || '', product.price, product.unit, product.reorder, ...warehouseList.map((location) => product.stock?.[location] || 0)])])}>Export products</Button>
                      <Button variant="success" onClick={() => downloadCsv('stockwise-operations.csv', [['Reference', 'Type', 'Product', 'Qty', 'Location', 'Partner', 'Status', 'Actor', 'Date'], ...docs.map((doc) => [doc.id, doc.type, doc.product, doc.qty, doc.location, doc.partner || '', doc.status, doc.actor || '', doc.date])])}>Export activity</Button>
                    </div>
                  </div>

                  <Row className="g-3 mb-4">
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Catalog items</div><div className="kpi-value">{products.length}</div><div className="kpi-foot">Tracked in the current catalog</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Low stock</div><div className="kpi-value">{lowStockProducts.length}</div><div className="kpi-foot">Below your configured alert rule</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Out of stock</div><div className="kpi-value">{outOfStockCount}</div><div className="kpi-foot">Products with no stock available</div></Card.Body></Card></Col>
                    <Col sm={6} xl={3}><Card className="kpi-card"><Card.Body><div className="kpi-label">Movement records</div><div className="kpi-value">{docs.length}</div><div className="kpi-foot">Current operational activity log</div></Card.Body></Card></Col>
                  </Row>

                  <div className="section-card" style={{ marginBottom: 16 }}>
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Category distribution</h2>
                        <div className="section-sub">Current stock and catalog count by category</div>
                      </div>
                    </div>
                    <div className="table-responsive">
                      <Table hover>
                        <thead>
                          <tr>
                            <th>Category</th>
                            <th>Products</th>
                            <th>Units on hand</th>
                            <th>Low stock</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...new Set(products.map((product) => product.category))].map((category) => {
                            const items = products.filter((product) => product.category === category);
                            return (
                              <tr key={category}>
                                <td className="product-name">{category}</td>
                                <td>{items.length}</td>
                                <td>{formatNumber(items.reduce((sum, product) => sum + totalStock(product), 0))}</td>
                                <td>{items.filter((product) => isLowStock(product, settings.alertRule)).length}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                    </div>
                  </div>

                  <div className="section-card" style={{ marginBottom: 16 }}>
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Executive KPI board</h2>
                        <div className="section-sub">Management-level summary across finance, stock, service, and returns.</div>
                      </div>
                    </div>
                    <Row className="g-3 mb-3">
                      {executiveSignals.map((signal) => (
                        <Col sm={6} xl={4} key={signal.label}>
                          <Card className="kpi-card">
                            <Card.Body>
                              <div className="kpi-label">{signal.label}</div>
                              <div className="kpi-value">{signal.value}</div>
                              <div className="kpi-foot"><StatusBadge status={signal.status} /></div>
                            </Card.Body>
                          </Card>
                        </Col>
                      ))}
                    </Row>
                  </div>

                  <div className="section-card" style={{ marginBottom: 16 }}>
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Planning variance board</h2>
                        <div className="section-sub">Plan comparisons are hidden until organization targets are configured.</div>
                      </div>
                    </div>
                    <div className="empty-state">No planning targets are configured, so no variance is calculated.</div>
                  </div>

                  <div className="section-card" style={{ marginBottom: 16 }}>
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Cash conversion & service health</h2>
                        <div className="section-sub">How quickly cash moves through the operating cycle and whether supplier service levels are holding.</div>
                      </div>
                    </div>
                    <Row className="g-3 mb-3">
                      <Col sm={6} xl={3}>
                        <Card className="kpi-card"><Card.Body>
                          <div className="kpi-label">Collections</div>
                          <div className="kpi-value">{moneyFormatter.format(cashCycle.paidAmount)}</div>
                          <div className="kpi-foot">Actual cash received</div>
                        </Card.Body></Card>
                      </Col>
                      <Col sm={6} xl={3}>
                        <Card className="kpi-card"><Card.Body>
                          <div className="kpi-label">Receivables</div>
                          <div className="kpi-value">{moneyFormatter.format(cashCycle.outstandingReceivables)}</div>
                          <div className="kpi-foot">Open customer balances</div>
                        </Card.Body></Card>
                      </Col>
                      <Col sm={6} xl={3}>
                        <Card className="kpi-card"><Card.Body>
                          <div className="kpi-label">Collection rate</div>
                          <div className="kpi-value">Not available</div>
                          <div className="kpi-foot">Payments are not linked to sales orders</div>
                        </Card.Body></Card>
                      </Col>
                      <Col sm={6} xl={3}>
                        <Card className="kpi-card"><Card.Body>
                          <div className="kpi-label">Avg. supplier lead time</div>
                          <div className="kpi-value">{cashCycle.supplierLeadAverage === null ? '—' : `${Math.round(cashCycle.supplierLeadAverage)}d`}</div>
                          <div className="kpi-foot"><StatusBadge status={cashCycle.serviceHealth} /></div>
                        </Card.Body></Card>
                      </Col>
                    </Row>
                  </div>

                  <div className="section-card" style={{ marginBottom: 16 }}>
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Inventory aging board</h2>
                        <div className="section-sub">Flag slow-moving and stale stock before it becomes excess inventory or dead stock.</div>
                      </div>
                    </div>
                    <div className="table-responsive">
                      <Table hover>
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>On hand</th>
                            <th>Units shipped</th>
                            <th>Last movement</th>
                            <th>Health</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inventoryAging.length === 0 ? (
                            <tr><td colSpan="5"><div className="empty-state">No inventory aging data is available yet.</div></td></tr>
                          ) : (
                            inventoryAging.map((item) => (
                              <tr key={item.id}>
                                <td className="product-name">{item.name}</td>
                                <td>{formatNumber(item.stock)}</td>
                                <td>{formatNumber(item.demand)}</td>
                                <td>{item.ageDays === null ? 'Not recorded' : `${item.ageDays}d`}</td>
                                <td><StatusBadge status={item.agingStatus} /></td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </Table>
                    </div>
                  </div>

                  <div className="section-card" style={{ marginBottom: 16 }}>
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Replenishment coverage board</h2>
                        <div className="section-sub">Days of cover uses fulfilled unit demand recorded in the last 30 days; supplier lead time is shown only when linked to the product.</div>
                      </div>
                    </div>
                    <div className="table-responsive">
                      <Table hover>
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>On hand</th>
                            <th>Avg / day</th>
                            <th>Days cover</th>
                            <th>Lead time</th>
                            <th>Signal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {replenishmentCoverage.length === 0 ? (
                            <tr><td colSpan="6"><div className="empty-state">No replenishment signals are available yet.</div></td></tr>
                          ) : (
                            replenishmentCoverage.map((item) => (
                              <tr key={item.id}>
                                <td className="product-name">{item.name}</td>
                                <td>{formatNumber(item.stock)}</td>
                                <td>{item.avgDailyDemand === null ? '—' : item.avgDailyDemand.toFixed(1)}</td>
                                <td>{Number.isFinite(item.daysCover) ? `${Math.round(item.daysCover)}d` : item.hasUndatedDemand ? 'Unavailable · undated orders' : 'No recent demand'}</td>
                                <td>{item.supplierLead === null ? 'Not linked' : `${item.supplierLead}d`}</td>
                                <td><StatusBadge status={item.coverStatus} /></td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </Table>
                    </div>
                  </div>

                  <div className="section-card" style={{ marginBottom: 16 }}>
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Supplier risk board</h2>
                        <div className="section-sub">Identify vendor risk by comparing supplier on-time performance, open commitments, and lead times.</div>
                      </div>
                    </div>
                    <div className="table-responsive">
                      <Table hover>
                        <thead>
                          <tr>
                            <th>Supplier</th>
                            <th>On-time</th>
                            <th>Lead time</th>
                            <th>Open POs</th>
                            <th>Committed value</th>
                            <th>Risk</th>
                          </tr>
                        </thead>
                        <tbody>
                          {supplierRiskBoard.length === 0 ? (
                            <tr><td colSpan="6"><div className="empty-state">No supplier risk signals are available yet.</div></td></tr>
                          ) : (
                            supplierRiskBoard.map((supplier) => (
                              <tr key={supplier.id}>
                                <td className="product-name">{supplier.name}</td>
                                <td>{supplier.onTimeRate === null ? 'Not measured' : `${Math.round(supplier.onTimeRate)}%`}</td>
                                <td>{supplier.leadTime === null ? 'Not recorded' : `${supplier.leadTime}d`}</td>
                                <td>{supplier.openOrders}</td>
                                <td>{moneyFormatter.format(supplier.openValue)}</td>
                                <td><StatusBadge status={supplier.riskLevel} /></td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </Table>
                    </div>
                  </div>

                  <div className="section-card">
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Margin guardrails</h2>
                        <div className="section-sub">Products with the tightest gross margin or stock risk.</div>
                      </div>
                    </div>
                    <div className="table-responsive">
                      <Table hover>
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>Sell price</th>
                            <th>Gross margin</th>
                            <th>Units on hand</th>
                            <th>Units sold</th>
                            <th>Health</th>
                          </tr>
                        </thead>
                        <tbody>
                          {marginSignals.length === 0 ? (
                            <tr><td colSpan="6"><div className="empty-state">Margin data is unavailable because product unit costs are not recorded. Add verified unit costs before using margin analysis.</div></td></tr>
                          ) : (
                            marginSignals.map((item) => (
                              <tr key={item.id}>
                                <td className="product-name">{item.name}</td>
                                <td>{moneyFormatter.format(item.sellPrice)}</td>
                                <td>{Math.round(item.marginPercent)}%</td>
                                <td>{formatNumber(item.unitsOnHand)}</td>
                                <td>{formatNumber(item.unitsSold)}</td>
                                <td><StatusBadge status={item.health} /></td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                </>
              )}

              {page === 'Billing' && (
                <>
                  <div className="page-row">
                    <div>
                      <div className="eyebrow">Finance</div>
                      <h1 className="page-head">Billing</h1>
                      <div className="page-sub">Track customer invoices and supplier bills connected to your operations.</div>
                    </div>
                    <Button variant="success" onClick={() => { setInvoiceForm({ kind: 'Invoice', party: '', amount: '', dueDate: '' }); setModal('invoice'); }}>＋ Add billing record</Button>
                  </div>

                  <Row className="g-3 mb-4">
                    <Col sm={6} xl={4}><Card className="kpi-card"><Card.Body><div className="kpi-label">Receivables</div><div className="kpi-value">{new Intl.NumberFormat(undefined, { style: 'currency', currency: settings.currency }).format(outstandingInvoiceTotal)}</div><div className="kpi-foot">Outstanding customer invoices</div></Card.Body></Card></Col>
                    <Col sm={6} xl={4}><Card className="kpi-card"><Card.Body><div className="kpi-label">Payables</div><div className="kpi-value">{new Intl.NumberFormat(undefined, { style: 'currency', currency: settings.currency }).format(invoices.filter((item) => item.kind === 'Bill' && item.status === 'Unpaid').reduce((sum, item) => sum + item.amount, 0))}</div><div className="kpi-foot">Outstanding supplier bills</div></Card.Body></Card></Col>
                    <Col sm={6} xl={4}><Card className="kpi-card"><Card.Body><div className="kpi-label">Collections</div><div className="kpi-value">{new Intl.NumberFormat(undefined, { style: 'currency', currency: settings.currency }).format(payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0))}</div><div className="kpi-foot">Cash received in the current ledger</div></Card.Body></Card></Col>
                  </Row>

                  <div className="section-card" style={{ marginBottom: 16 }}>
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Collections overview</h2>
                        <div className="section-sub">Record incoming payments and trace cash against invoice records</div>
                      </div>
                      <Button variant="success" onClick={() => { const invoice = invoices.find((item) => item.kind === 'Invoice' && item.status === 'Unpaid'); setPaymentForm({ invoiceId: invoice?.id || '', customer: invoice?.party || '', amount: String(invoice?.amount || '0'), method: 'Bank transfer', date: new Date().toISOString().slice(0, 10) }); setModal('payment'); }}>＋ Record payment</Button>
                    </div>
                    <div className="table-responsive">
                      <Table hover>
                        <thead>
                          <tr>
                            <th>Payment</th>
                            <th>Invoice</th>
                            <th>Customer</th>
                            <th>Amount</th>
                            <th>Method</th>
                            <th>Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payments.length === 0 ? (
                            <tr><td colSpan="6"><div className="empty-state">No payment records have been captured yet.</div></td></tr>
                          ) : (
                            payments.map((payment) => (
                              <tr key={payment.id}>
                                <td><span className="ref-code">{payment.id}</span></td>
                                <td>{payment.invoiceId}</td>
                                <td className="product-name">{payment.customer}</td>
                                <td>{new Intl.NumberFormat(undefined, { style: 'currency', currency: settings.currency }).format(payment.amount)}</td>
                                <td>{payment.method}</td>
                                <td>{payment.date || payment.createdAt}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </Table>
                    </div>
                  </div>

                  <div className="section-card">
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Invoices & bills</h2>
                        <div className="section-sub">Mark records paid when cash moves or payables are settled</div>
                      </div>
                    </div>
                    <div className="table-responsive">
                      <Table hover>
                        <thead>
                          <tr>
                            <th>Reference</th>
                            <th>Type</th>
                            <th>Party</th>
                            <th>Due date</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoices.map((invoice) => (
                            <tr key={invoice.id}>
                              <td><span className="ref-code">{invoice.id}</span></td>
                              <td>{invoice.kind}</td>
                              <td className="product-name">{invoice.party}</td>
                              <td>{invoice.dueDate || '—'}</td>
                              <td>{new Intl.NumberFormat(undefined, { style: 'currency', currency: settings.currency }).format(invoice.amount)}</td>
                              <td><StatusBadge status={invoice.status} /></td>
                              <td>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <Button size="sm" variant="outline-secondary" onClick={() => toggleInvoiceStatus(invoice.id)}>{invoice.status === 'Paid' ? 'Mark unpaid' : 'Mark paid'}</Button>
                                  <Button size="sm" variant="outline-danger" onClick={() => deleteInvoice(invoice)}>Delete</Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                </>
              )}

              {page === 'Settings' && (
                <>
                  <div className="page-row">
                    <div>
                      <div className="eyebrow">Preferences</div>
                      <h1 className="page-head">Workspace settings</h1>
                      <div className="page-sub">Adjust inventory alert rules, defaults, and financial display settings.</div>
                    </div>
                  </div>

                  <div className="section-card" style={{ maxWidth: 760 }}>
                    <div className="section-head">
                      <div>
                        <h2 className="section-heading">Operating preferences</h2>
                        <div className="section-sub">Stored locally in this browser for this demo workspace</div>
                      </div>
                    </div>
                    <div style={{ padding: '0 20px 20px' }}>
                      <Form>
                        <Form.Group className="mb-3">
                          <Form.Label>Low-stock alert rule</Form.Label>
                          <Form.Select value={settings.alertRule} onChange={(event) => setSettings((current) => ({ ...current, alertRule: event.target.value }))}>
                            <option>At reorder point</option>
                            <option>Below reorder point</option>
                            <option>At 10% below reorder point</option>
                          </Form.Select>
                        </Form.Group>
                        <Form.Group className="mb-3">
                          <Form.Label>Default unit of measure</Form.Label>
                          <Form.Select value={settings.defaultUnit} onChange={(event) => setSettings((current) => ({ ...current, defaultUnit: event.target.value }))}>
                            {unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                          </Form.Select>
                        </Form.Group>
                        <Form.Group>
                          <Form.Label>Workspace currency</Form.Label>
                          <Form.Select value={settings.currency} onChange={(event) => setSettings((current) => ({ ...current, currency: event.target.value }))}>
                            {currencyOptions.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
                          </Form.Select>
                        </Form.Group>
                      </Form>
                    </div>
                  </div>
                </>
              )}
            </div>
          </main>

          <Modal show={modal === 'operation'} onHide={() => setModal('')} centered>
            <Form onSubmit={saveOperation}>
              <Modal.Header closeButton>
                <Modal.Title>New {operationForm.type.toLowerCase()} operation</Modal.Title>
              </Modal.Header>
              <Modal.Body>
                <Form.Group className="mb-3">
                  <Form.Label>Product</Form.Label>
                  <Form.Select value={operationForm.productId} onChange={(event) => setOperationForm({ ...operationForm, productId: event.target.value })}>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}
                  </Form.Select>
                </Form.Group>
                {operationForm.type !== 'Adjustment' ? (
                  <Form.Group className="mb-3">
                    <Form.Label>Quantity</Form.Label>
                    <InputGroup>
                      <Form.Control type="number" min="0" step="1" value={operationForm.qty} onChange={(event) => setOperationForm({ ...operationForm, qty: event.target.value })} />
                      <InputGroup.Text>{products.find((product) => product.id === Number(operationForm.productId))?.unit || 'units'}</InputGroup.Text>
                    </InputGroup>
                  </Form.Group>
                ) : (
                  <Form.Group className="mb-3">
                    <Form.Label>Counted quantity</Form.Label>
                    <InputGroup>
                      <Form.Control type="number" min="0" step="1" value={operationForm.counted} onChange={(event) => setOperationForm({ ...operationForm, counted: event.target.value })} />
                      <InputGroup.Text>{products.find((product) => product.id === Number(operationForm.productId))?.unit || 'units'}</InputGroup.Text>
                    </InputGroup>
                  </Form.Group>
                )}
                <Form.Group className="mb-3">
                  <Form.Label>{operationForm.type === 'Internal' ? 'Source location' : 'Location'}</Form.Label>
                  <Form.Select value={operationForm.location} onChange={(event) => setOperationForm({ ...operationForm, location: event.target.value })}>
                    {warehouseList.map((location) => <option key={location} value={location}>{location}</option>)}
                  </Form.Select>
                </Form.Group>
                {operationForm.type === 'Internal' && (
                  <Form.Group className="mb-3">
                    <Form.Label>Destination location</Form.Label>
                    <Form.Select value={operationForm.destination} onChange={(event) => setOperationForm({ ...operationForm, destination: event.target.value })}>
                      {warehouseList.map((location) => <option key={location} value={location}>{location}</option>)}
                    </Form.Select>
                  </Form.Group>
                )}
                {(operationForm.type === 'Receipt' || operationForm.type === 'Delivery') && (
                  <Form.Group>
                    <Form.Label>{operationForm.type === 'Receipt' ? 'Supplier or vendor' : 'Customer / order reference'}</Form.Label>
                    <Form.Control value={operationForm.partner} onChange={(event) => setOperationForm({ ...operationForm, partner: event.target.value })} placeholder={operationForm.type === 'Receipt' ? 'Apex Metals Co.' : 'SO-1056'} />
                  </Form.Group>
                )}
              </Modal.Body>
              <Modal.Footer>
                <Button variant="light" onClick={() => setModal('')}>Cancel</Button>
                <Button variant="success" type="submit">Save operation</Button>
              </Modal.Footer>
            </Form>
          </Modal>

          <Modal show={modal === 'product-details'} onHide={() => { setModal(''); setProductDetails(null); }} centered>
            <Modal.Header closeButton>
              <Modal.Title>{productDetails?.name || 'Product details'}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {productDetails && (
                <>
                  <Row className="g-3 mb-3">
                    <Col xs={6}><div className="kpi-label">SKU</div><strong>{productDetails.sku}</strong></Col>
                    <Col xs={6}><div className="kpi-label">Barcode</div><strong>{productDetails.barcode || 'Not specified'}</strong></Col>
                    <Col xs={6}><div className="kpi-label">Category</div><strong>{productDetails.category}</strong></Col>
                    <Col xs={6}><div className="kpi-label">Preferred supplier</div><strong>{productDetails.supplierName || suppliers.find((supplier) => String(supplier.id) === String(productDetails.supplierId))?.name || 'Not assigned'}</strong></Col>
                    <Col xs={6}><div className="kpi-label">Material</div><strong>{productDetails.material || 'Not specified'}</strong></Col>
                    <Col xs={6}><div className="kpi-label">Listed price</div><strong>{moneyFormatter.format(Number(productDetails.price || 0))} / {productDetails.unit}</strong></Col>
                    <Col xs={6}><div className="kpi-label">Total on hand</div><strong>{formatNumber(totalStock(productDetails))} {productDetails.unit}</strong></Col>
                    <Col xs={6}><div className="kpi-label">Reorder point</div><strong>{formatNumber(productDetails.reorder)} {productDetails.unit}</strong></Col>
                  </Row>
                  {productDetails.description && (
                    <div style={{ marginBottom: 16 }}>
                      <div className="kpi-label">Description</div>
                      <p style={{ margin: '4px 0 0', color: '#425a74' }}>{productDetails.description}</p>
                    </div>
                  )}
                  <div className="section-card" style={{ boxShadow: 'none' }}>
                    <div className="section-head">
                      <h3 className="section-heading">Stock by location</h3>
                      <StatusBadge status={totalStock(productDetails) === 0 ? 'Out of stock' : isLowStock(productDetails, settings.alertRule) ? 'Low stock' : 'Healthy'} />
                    </div>
                    <div className="table-responsive">
                      <Table size="sm">
                        <thead><tr><th>Location</th><th>On hand</th></tr></thead>
                        <tbody>
                          {warehouseList.map((location) => (
                            <tr key={location}>
                              <td>{location}</td>
                              <td>{formatNumber(productDetails.stock?.[location] || 0)} {productDetails.unit}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                </>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="light" onClick={() => { setModal(''); setProductDetails(null); }}>Close</Button>
              {productDetails && <Button variant="success" onClick={() => editProduct(productDetails)}>Edit product</Button>}
            </Modal.Footer>
          </Modal>

          <Modal show={modal === 'product'} onHide={() => setModal('')} centered>
            <Form onSubmit={saveProduct}>
              <Modal.Header closeButton>
                <Modal.Title>{productForm.id ? 'Edit product' : 'Add product'}</Modal.Title>
              </Modal.Header>
              <Modal.Body>
                <Row className="g-3">
                  <Col xs={12}>
                    <Form.Label>Product name</Form.Label>
                    <Form.Control value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} placeholder="e.g. Stainless Steel Bolt" />
                  </Col>
                  <Col sm={6}>
                    <Form.Label>SKU</Form.Label>
                    <Form.Control value={productForm.sku} onChange={(event) => setProductForm({ ...productForm, sku: event.target.value })} placeholder="STL-2041" />
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Barcode</Form.Label>
                    <Form.Control value={productForm.barcode} onChange={(event) => setProductForm({ ...productForm, barcode: event.target.value })} placeholder="EAN or UPC" />
                  </Col>
                  <Col xs={12}>
                    <Form.Label>Description</Form.Label>
                    <Form.Control as="textarea" rows={2} value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} placeholder="Product specifications or handling notes" />
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Category</Form.Label>
                    <Form.Select value={productForm.category} onChange={(event) => setProductForm({ ...productForm, category: event.target.value })}>
                      {['Raw Materials', 'Furniture', 'Safety', 'Packaging', 'Electrical', 'Finished Goods', 'Other'].map((category) => <option key={category}>{category}</option>)}
                    </Form.Select>
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Preferred supplier</Form.Label>
                    <Form.Select value={productForm.supplierId} onChange={(event) => setProductForm({ ...productForm, supplierId: event.target.value })}>
                      <option value="">No supplier assigned</option>
                      {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                    </Form.Select>
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Material</Form.Label>
                    <Form.Control value={productForm.material} onChange={(event) => setProductForm({ ...productForm, material: event.target.value })} placeholder="Steel, aluminum, etc." />
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Unit price ({settings.currency})</Form.Label>
                    <Form.Control type="number" min="0" step="0.01" value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: event.target.value })} />
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Unit</Form.Label>
                    <Form.Control list="unit-options" value={productForm.unit} onChange={(event) => setProductForm({ ...productForm, unit: event.target.value })} />
                    <datalist id="unit-options">{unitOptions.map((unit) => <option key={unit} value={unit} />)}</datalist>
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Reorder point</Form.Label>
                    <Form.Control type="number" min="0" step="1" value={productForm.reorder} onChange={(event) => setProductForm({ ...productForm, reorder: event.target.value })} />
                  </Col>
                  {warehouseList.map((location) => (
                    <Col key={location} sm={6}>
                      <Form.Label>{location}</Form.Label>
                      <Form.Control type="number" min="0" step="1" value={productForm.stock?.[location] ?? 0} onChange={(event) => setProductForm({
                        ...productForm,
                        stock: { ...productForm.stock, [location]: event.target.value },
                      })} />
                    </Col>
                  ))}
                </Row>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="light" onClick={() => setModal('')}>Cancel</Button>
                <Button variant="success" type="submit">{productForm.id ? 'Update product' : 'Save product'}</Button>
              </Modal.Footer>
            </Form>
          </Modal>

          <Modal show={modal === 'invoice'} onHide={() => setModal('')} centered>
            <Form onSubmit={saveInvoice}>
              <Modal.Header closeButton>
                <Modal.Title>Add billing record</Modal.Title>
              </Modal.Header>
              <Modal.Body>
                <Row className="g-3">
                  <Col sm={6}>
                    <Form.Label>Type</Form.Label>
                    <Form.Select value={invoiceForm.kind} onChange={(event) => setInvoiceForm({ ...invoiceForm, kind: event.target.value })}>
                      <option>Invoice</option>
                      <option>Bill</option>
                    </Form.Select>
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Amount ({settings.currency})</Form.Label>
                    <Form.Control type="number" min="0.01" step="0.01" value={invoiceForm.amount} onChange={(event) => setInvoiceForm({ ...invoiceForm, amount: event.target.value })} />
                  </Col>
                  <Col xs={12}>
                    <Form.Label>Customer / supplier</Form.Label>
                    <Form.Control value={invoiceForm.party} onChange={(event) => setInvoiceForm({ ...invoiceForm, party: event.target.value })} placeholder="Northstar Retail" />
                  </Col>
                  <Col xs={12}>
                    <Form.Label>Due date</Form.Label>
                    <Form.Control type="date" value={invoiceForm.dueDate} onChange={(event) => setInvoiceForm({ ...invoiceForm, dueDate: event.target.value })} />
                  </Col>
                </Row>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="light" onClick={() => setModal('')}>Cancel</Button>
                <Button variant="success" type="submit">Save record</Button>
              </Modal.Footer>
            </Form>
          </Modal>

          <Modal show={modal === 'payment'} onHide={() => setModal('')} centered>
            <Form onSubmit={recordPayment}>
              <Modal.Header closeButton>
                <Modal.Title>Record payment</Modal.Title>
              </Modal.Header>
              <Modal.Body>
                <Row className="g-3">
                  <Col xs={12}>
                    <Form.Label>Invoice</Form.Label>
                    <Form.Select value={paymentForm.invoiceId} onChange={(event) => {
                      const selectedInvoice = invoices.find((entry) => String(entry.id) === String(event.target.value));
                      const totalReceived = payments
                        .filter((entry) => String(entry.invoiceId) === String(selectedInvoice?.id || ''))
                        .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
                      const outstanding = selectedInvoice ? Math.max(Number(selectedInvoice.amount || 0) - totalReceived, 0) : 0;
                      setPaymentForm({
                        ...paymentForm,
                        invoiceId: event.target.value,
                        customer: selectedInvoice?.party || paymentForm.customer,
                        amount: selectedInvoice ? String(outstanding) : '0',
                      });
                    }}>
                      <option value="">Select invoice</option>
                      {invoices.filter((entry) => entry.kind === 'Invoice' && entry.status !== 'Paid').map((entry) => (
                        <option key={entry.id} value={entry.id}>{entry.id} · {entry.party}</option>
                      ))}
                    </Form.Select>
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Customer</Form.Label>
                    <Form.Control value={paymentForm.customer} onChange={(event) => setPaymentForm({ ...paymentForm, customer: event.target.value })} placeholder="Northstar Retail" />
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Amount ({settings.currency})</Form.Label>
                    <Form.Control type="number" min="0.01" step="0.01" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} />
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Method</Form.Label>
                    <Form.Select value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value })}>
                      <option>Bank transfer</option>
                      <option>Cash</option>
                      <option>Card</option>
                      <option>Cheque</option>
                      <option>Wire</option>
                    </Form.Select>
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Date</Form.Label>
                    <Form.Control type="date" value={paymentForm.date} onChange={(event) => setPaymentForm({ ...paymentForm, date: event.target.value })} />
                  </Col>
                </Row>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="light" onClick={() => setModal('')}>Cancel</Button>
                <Button variant="success" type="submit">Record payment</Button>
              </Modal.Footer>
            </Form>
          </Modal>

          <Modal show={modal === 'supplier'} onHide={() => setModal('')} centered>
            <Form onSubmit={saveSupplier}>
              <Modal.Header closeButton>
                <Modal.Title>Add supplier</Modal.Title>
              </Modal.Header>
              <Modal.Body>
                <Row className="g-3">
                  <Col xs={12}><Form.Label>Supplier name</Form.Label><Form.Control value={supplierForm.name} onChange={(event) => setSupplierForm({ ...supplierForm, name: event.target.value })} placeholder="Apex Materials Ltd." /></Col>
                  <Col sm={6}><Form.Label>Contact</Form.Label><Form.Control value={supplierForm.contact} onChange={(event) => setSupplierForm({ ...supplierForm, contact: event.target.value })} placeholder="Nina Gomez" /></Col>
                  <Col sm={6}><Form.Label>Category</Form.Label><Form.Select value={supplierForm.category} onChange={(event) => setSupplierForm({ ...supplierForm, category: event.target.value })}><option>General</option><option>Packaging</option><option>Raw Materials</option><option>Safety</option><option>Logistics</option></Form.Select></Col>
                  <Col sm={6}><Form.Label>Email</Form.Label><Form.Control type="email" value={supplierForm.email} onChange={(event) => setSupplierForm({ ...supplierForm, email: event.target.value })} placeholder="nina@apex.com" /></Col>
                  <Col sm={6}><Form.Label>Phone</Form.Label><Form.Control value={supplierForm.phone} onChange={(event) => setSupplierForm({ ...supplierForm, phone: event.target.value })} placeholder="+1 555 210 9000" /></Col>
                  <Col sm={6}><Form.Label>Average lead time (days)</Form.Label><Form.Control type="number" min="1" step="1" value={supplierForm.leadTime} onChange={(event) => setSupplierForm({ ...supplierForm, leadTime: event.target.value })} /></Col>
                  <Col sm={6}><Form.Label>SLA target (%)</Form.Label><Form.Control type="number" min="70" max="100" step="1" value={supplierForm.slaTarget} onChange={(event) => setSupplierForm({ ...supplierForm, slaTarget: event.target.value })} /></Col>
                </Row>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="light" onClick={() => setModal('')}>Cancel</Button>
                <Button variant="success" type="submit">Save supplier</Button>
              </Modal.Footer>
            </Form>
          </Modal>

          <Modal show={modal === 'purchase'} onHide={() => setModal('')} centered>
            <Form onSubmit={savePurchaseOrder}>
              <Modal.Header closeButton>
                <Modal.Title>Create purchase order</Modal.Title>
              </Modal.Header>
              <Modal.Body>
                <Row className="g-3">
                  <Col sm={6}>
                    <Form.Label>Supplier</Form.Label>
                    <Form.Select value={purchaseForm.supplierId} onChange={(event) => setPurchaseForm({ ...purchaseForm, supplierId: event.target.value })}>
                      <option value="">Select supplier</option>
                      {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                    </Form.Select>
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Product</Form.Label>
                    <Form.Select value={purchaseForm.productId} onChange={(event) => setPurchaseForm({ ...purchaseForm, productId: event.target.value })}>
                      <option value="">Select product</option>
                      {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </Form.Select>
                  </Col>
                  <Col sm={4}>
                    <Form.Label>Qty</Form.Label>
                    <Form.Control type="number" min="1" value={purchaseForm.qty} onChange={(event) => setPurchaseForm({ ...purchaseForm, qty: event.target.value })} />
                  </Col>
                  <Col sm={4}>
                    <Form.Label>Unit cost</Form.Label>
                    <Form.Control type="number" min="0" step="0.01" value={purchaseForm.unitCost} onChange={(event) => setPurchaseForm({ ...purchaseForm, unitCost: event.target.value })} />
                  </Col>
                  <Col sm={4}>
                    <Form.Label>Status</Form.Label>
                    <Form.Select value={purchaseForm.status} onChange={(event) => setPurchaseForm({ ...purchaseForm, status: event.target.value })}>
                      <option>Draft</option>
                      <option>Approved</option>
                      <option>Ordered</option>
                    </Form.Select>
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Expected date</Form.Label>
                    <Form.Control type="date" value={purchaseForm.expectedDate} onChange={(event) => setPurchaseForm({ ...purchaseForm, expectedDate: event.target.value })} />
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Delivery location</Form.Label>
                    <Form.Select value={purchaseForm.location} onChange={(event) => setPurchaseForm({ ...purchaseForm, location: event.target.value })}>
                      {warehouseList.map((location) => <option key={location} value={location}>{location}</option>)}
                    </Form.Select>
                  </Col>
                </Row>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="light" onClick={() => setModal('')}>Cancel</Button>
                <Button variant="success" type="submit">Save order</Button>
              </Modal.Footer>
            </Form>
          </Modal>

          <Modal show={modal === 'customer'} onHide={() => setModal('')} centered>
            <Form onSubmit={saveCustomer}>
              <Modal.Header closeButton>
                <Modal.Title>Add customer</Modal.Title>
              </Modal.Header>
              <Modal.Body>
                <Row className="g-3">
                  <Col xs={12}><Form.Label>Customer name</Form.Label><Form.Control value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} placeholder="Northstar Retail" /></Col>
                  <Col sm={6}><Form.Label>Email</Form.Label><Form.Control type="email" value={customerForm.email} onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })} placeholder="hello@northstar.co" /></Col>
                  <Col sm={6}><Form.Label>Phone</Form.Label><Form.Control value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} placeholder="+1 555 017 4590" /></Col>
                  <Col sm={6}><Form.Label>Tier</Form.Label><Form.Select value={customerForm.tier} onChange={(event) => setCustomerForm({ ...customerForm, tier: event.target.value })}><option>Standard</option><option>Priority</option><option>VIP</option></Form.Select></Col>
                  <Col sm={6}><Form.Label>Region</Form.Label><Form.Select value={customerForm.region} onChange={(event) => setCustomerForm({ ...customerForm, region: event.target.value })}><option>North</option><option>South</option><option>East</option><option>West</option></Form.Select></Col>
                </Row>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="light" onClick={() => setModal('')}>Cancel</Button>
                <Button variant="success" type="submit">Save customer</Button>
              </Modal.Footer>
            </Form>
          </Modal>

          <Modal show={modal === 'sales'} onHide={() => setModal('')} centered>
            <Form onSubmit={saveSalesOrder}>
              <Modal.Header closeButton>
                <Modal.Title>Create sales order</Modal.Title>
              </Modal.Header>
              <Modal.Body>
                <Row className="g-3">
                  <Col sm={6}>
                    <Form.Label>Customer</Form.Label>
                    <Form.Select value={salesForm.customerId} onChange={(event) => setSalesForm({ ...salesForm, customerId: event.target.value })}>
                      <option value="">Select customer</option>
                      {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                    </Form.Select>
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Product</Form.Label>
                    <Form.Select value={salesForm.productId} onChange={(event) => setSalesForm({ ...salesForm, productId: event.target.value })}>
                      <option value="">Select product</option>
                      {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </Form.Select>
                  </Col>
                  <Col sm={4}>
                    <Form.Label>Qty</Form.Label>
                    <Form.Control type="number" min="1" value={salesForm.qty} onChange={(event) => setSalesForm({ ...salesForm, qty: event.target.value })} />
                  </Col>
                  <Col sm={4}>
                    <Form.Label>Unit price</Form.Label>
                    <Form.Control type="number" min="0" step="0.01" value={salesForm.unitPrice} onChange={(event) => setSalesForm({ ...salesForm, unitPrice: event.target.value })} />
                  </Col>
                  <Col sm={4}>
                    <Form.Label>Status</Form.Label>
                    <Form.Select value={salesForm.status} onChange={(event) => setSalesForm({ ...salesForm, status: event.target.value })}>
                      <option>Draft</option>
                      <option>Confirmed</option>
                      <option>Shipped</option>
                    </Form.Select>
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Location</Form.Label>
                    <Form.Select value={salesForm.location} onChange={(event) => setSalesForm({ ...salesForm, location: event.target.value })}>
                      {warehouseList.map((location) => <option key={location} value={location}>{location}</option>)}
                    </Form.Select>
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Expected date</Form.Label>
                    <Form.Control type="date" value={salesForm.expectedDate} onChange={(event) => setSalesForm({ ...salesForm, expectedDate: event.target.value })} />
                  </Col>
                </Row>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="light" onClick={() => setModal('')}>Cancel</Button>
                <Button variant="success" type="submit">Save order</Button>
              </Modal.Footer>
            </Form>
          </Modal>

          <Modal show={modal === 'shipment'} onHide={() => setModal('')} centered>
            <Form onSubmit={saveShipment}>
              <Modal.Header closeButton>
                <Modal.Title>Create shipment</Modal.Title>
              </Modal.Header>
              <Modal.Body>
                <Row className="g-3">
                  <Col sm={6}>
                    <Form.Label>Sales order</Form.Label>
                    <Form.Select value={shipmentForm.orderId} onChange={(event) => setShipmentForm({ ...shipmentForm, orderId: event.target.value })}>
                      <option value="">Select order</option>
                      {salesOrders.map((order) => <option key={order.id} value={order.id}>{order.id}</option>)}
                    </Form.Select>
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Carrier</Form.Label>
                    <Form.Select value={shipmentForm.carrier} onChange={(event) => setShipmentForm({ ...shipmentForm, carrier: event.target.value })}>
                      <option>UPS</option>
                      <option>FedEx</option>
                      <option>DHL</option>
                      <option>Local courier</option>
                    </Form.Select>
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Tracking</Form.Label>
                    <Form.Control value={shipmentForm.tracking} onChange={(event) => setShipmentForm({ ...shipmentForm, tracking: event.target.value })} placeholder="TRACK-12345" />
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Status</Form.Label>
                    <Form.Select value={shipmentForm.status} onChange={(event) => setShipmentForm({ ...shipmentForm, status: event.target.value })}>
                      <option>Ready</option>
                      <option>In Transit</option>
                      <option>Delivered</option>
                    </Form.Select>
                  </Col>
                  <Col sm={12}>
                    <Form.Label>Warehouse</Form.Label>
                    <Form.Select value={shipmentForm.location} onChange={(event) => setShipmentForm({ ...shipmentForm, location: event.target.value })}>
                      {warehouseList.map((location) => <option key={location} value={location}>{location}</option>)}
                    </Form.Select>
                  </Col>
                </Row>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="light" onClick={() => setModal('')}>Cancel</Button>
                <Button variant="success" type="submit">Create shipment</Button>
              </Modal.Footer>
            </Form>
          </Modal>

          <Modal show={modal === 'return'} onHide={() => setModal('')} centered>
            <Form onSubmit={saveReturn}>
              <Modal.Header closeButton>
                <Modal.Title>Process return</Modal.Title>
              </Modal.Header>
              <Modal.Body>
                <Row className="g-3">
                  <Col sm={6}>
                    <Form.Label>Order</Form.Label>
                    <Form.Select value={returnForm.orderId} onChange={(event) => {
                      const selectedOrder = returnableSalesOrders.find((order) => String(order.id) === String(event.target.value));
                      const alreadyReturned = returns
                        .filter((item) => item.orderId === selectedOrder?.id && item.status !== 'Rejected')
                        .reduce((sum, item) => sum + Number(item.qty || 0), 0);
                      const remainingQty = Math.max(Number(selectedOrder?.qty || 0) - alreadyReturned, 0);
                      setReturnForm({
                        ...returnForm,
                        orderId: event.target.value,
                        customerId: selectedOrder?.customerId || returnForm.customerId,
                        productId: selectedOrder?.productId || returnForm.productId,
                        qty: selectedOrder ? String(remainingQty) : '1',
                        location: selectedOrder?.location || returnForm.location,
                      });
                    }}>
                      <option value="">Select order</option>
                      {returnableSalesOrders.map((order) => <option key={order.id} value={order.id}>{order.id} · {order.customerName}</option>)}
                    </Form.Select>
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Customer</Form.Label>
                    <Form.Select value={returnForm.customerId} onChange={(event) => setReturnForm({ ...returnForm, customerId: event.target.value })}>
                      <option value="">Select customer</option>
                      {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                    </Form.Select>
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Product</Form.Label>
                    <Form.Select value={returnForm.productId} onChange={(event) => setReturnForm({ ...returnForm, productId: event.target.value })}>
                      <option value="">Select product</option>
                      {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </Form.Select>
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Return reason</Form.Label>
                    <Form.Select value={returnForm.reason} onChange={(event) => setReturnForm({ ...returnForm, reason: event.target.value })}>
                      <option>Damaged</option>
                      <option>Late delivery</option>
                      <option>Wrong item</option>
                      <option>Customer cancellation</option>
                      <option>Quality issue</option>
                    </Form.Select>
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Qty</Form.Label>
                    <Form.Control type="number" min="1" value={returnForm.qty} onChange={(event) => setReturnForm({ ...returnForm, qty: event.target.value })} />
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Location</Form.Label>
                    <Form.Select value={returnForm.location} onChange={(event) => setReturnForm({ ...returnForm, location: event.target.value })}>
                      {warehouseList.map((location) => <option key={location} value={location}>{location}</option>)}
                    </Form.Select>
                  </Col>
                </Row>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="light" onClick={() => setModal('')}>Cancel</Button>
                <Button variant="success" type="submit">Save return</Button>
              </Modal.Footer>
            </Form>
          </Modal>

          <Modal show={modal === 'warehouse'} onHide={() => setModal('')} centered>
            <Form onSubmit={saveWarehouse}>
              <Modal.Header closeButton>
                <Modal.Title>Add location</Modal.Title>
              </Modal.Header>
              <Modal.Body>
                <Row className="g-3">
                  <Col xs={12}>
                  <Form.Label>Warehouse or location name</Form.Label>
                  <Form.Control value={warehouseForm.name} onChange={(event) => setWarehouseForm({ ...warehouseForm, name: event.target.value })} placeholder="e.g. East Distribution Hub" />
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Capacity (units)</Form.Label>
                    <Form.Control type="number" min="1" step="1" value={warehouseForm.capacity} onChange={(event) => setWarehouseForm({ ...warehouseForm, capacity: event.target.value })} placeholder="Optional" />
                  </Col>
                  <Col sm={6}>
                    <Form.Label>Bins</Form.Label>
                    <Form.Control value={warehouseForm.bins} onChange={(event) => setWarehouseForm({ ...warehouseForm, bins: event.target.value })} placeholder="A-01, A-02" />
                  </Col>
                </Row>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="light" onClick={() => setModal('')}>Cancel</Button>
                <Button variant="success" type="submit">Add location</Button>
              </Modal.Footer>
            </Form>
          </Modal>

          <Modal show={modal === 'rename'} onHide={() => setModal('')} centered>
            <Modal.Header closeButton>
              <Modal.Title>Rename location</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form.Group>
                <Form.Label>New name for {renameTarget}</Form.Label>
                <Form.Control value={renameValue} onChange={(event) => setRenameValue(event.target.value)} placeholder="Enter new location name" />
              </Form.Group>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="light" onClick={() => setModal('')}>Cancel</Button>
              <Button variant="success" onClick={renameWarehouse}>Save rename</Button>
            </Modal.Footer>
          </Modal>

          <Modal show={modal === 'import'} onHide={() => setModal('')} centered>
            <Modal.Header closeButton>
              <Modal.Title>Import product data</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <p style={{ marginTop: 0, color: '#60768d', fontSize: 12 }}>
                Import CSV, TSV, TXT tables, or JSON lists. Use a price or unitprice field for the product’s listed price; purchase costs are not mapped to it. A supplier, vendor, or preferred supplier field is matched to existing suppliers by name. Data is stored locally in this browser and duplicate SKUs are skipped.
              </p>
              <Form.Control type="file" accept=".csv,.tsv,.txt,.json" multiple onChange={(event) => { previewImport(event.target.files); event.target.value = ''; }} />
              {importHeaders.length > 0 && (
                <div className="section-card" style={{ marginTop: 14, padding: 12, boxShadow: 'none' }}>
                  <strong style={{ fontSize: 12 }}>Map source columns</strong>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 10 }}>
                    {[
                      ['name', 'Product name'],
                      ['sku', 'SKU'],
                      ['barcode', 'Barcode'],
                      ['description', 'Description'],
                      ['quantity', 'Quantity on hand'],
                      ['price', 'Listed price'],
                      ['reorder', 'Reorder point'],
                      ['unit', 'Unit'],
                      ['category', 'Category'],
                      ['material', 'Material'],
                      ['supplierName', 'Supplier'],
                    ].map(([field, label]) => (
                      <Form.Group key={field}>
                        <Form.Label htmlFor={`import-map-${field}`}>{label}</Form.Label>
                        <Form.Select id={`import-map-${field}`} size="sm" value={importColumnMapping[field] || ''} onChange={(event) => updateImportMapping(field, event.target.value)}>
                          <option value="">Auto-detect</option>
                          {importHeaders.map((header, index) => <option key={`${header}-${index}`} value={header}>{header}</option>)}
                        </Form.Select>
                      </Form.Group>
                    ))}
                  </div>
                </div>
              )}
              {importMessage && <div className="inventory-alert" style={{ marginTop: 14 }} role="status">{importMessage}</div>}
              {importErrors.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <strong style={{ fontSize: 12 }}>Import issues ({importErrors.length})</strong>
                  <div className="table-responsive" style={{ maxHeight: 180, marginTop: 8 }}>
                    <Table size="sm">
                      <thead><tr><th>File</th><th>Row</th><th>Issue</th></tr></thead>
                      <tbody>
                        {importErrors.map((error, index) => (
                          <tr key={`${error.file}-${error.row}-${index}`}>
                            <td>{error.file}</td>
                            <td>{error.row}</td>
                            <td>{error.issue}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                </div>
              )}
              {importPreview.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <strong style={{ fontSize: 12 }}>Preview</strong>
                  <div className="table-responsive" style={{ maxHeight: 220, marginTop: 8 }}>
                    <Table size="sm">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>SKU</th>
                          <th>Supplier</th>
                          <th>Qty</th>
                          <th>Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.slice(0, 8).map((item, index) => (
                          <tr key={`${item.sku}-${index}`}>
                            <td>{item.name}</td>
                            <td>{item.sku}</td>
                            <td>{item.supplierName || '—'}</td>
                            <td>{item.quantity}</td>
                            <td>{new Intl.NumberFormat(undefined, { style: 'currency', currency: settings.currency }).format(item.price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                </div>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="light" onClick={() => setModal('')}>Cancel</Button>
              <Button variant="success" onClick={commitImport} disabled={!importPreview.length}>Import rows</Button>
            </Modal.Footer>
          </Modal>

          {confirmState && (
            <Modal show onHide={() => setConfirmState(null)} centered>
              <Modal.Header closeButton>
                <Modal.Title>{confirmState.title}</Modal.Title>
              </Modal.Header>
              <Modal.Body>
                <p style={{ margin: 0, color: '#425a74', fontSize: 13 }}>{confirmState.body}</p>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="light" onClick={() => setConfirmState(null)}>Cancel</Button>
                <Button variant={confirmState.variant === 'danger' ? 'danger' : 'success'} onClick={confirmState.onConfirm}>{confirmState.confirmLabel}</Button>
              </Modal.Footer>
            </Modal>
          )}

          {toast && <div className="toast-message" role="status" aria-live="polite">✓ {toast}</div>}
        </div>
      )}
    </>
  );
}
