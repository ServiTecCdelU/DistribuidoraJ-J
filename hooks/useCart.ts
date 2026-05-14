// hooks/useCart.ts
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { clientsApi, sellersApi, ordersApi } from "@/lib/api";
import { getMayoristaProductos } from "@/services/mayorista-service";
import { processSaleMayorista } from "@/services/sales-service";
import { crearPedidoMayorista } from "@/services/pedidos-mayorista-service";
import type { Product, Client, CartItem, Seller, City } from "@/lib/types";
import { toast } from "sonner";
import { formatCurrency, normalizeCuit } from "@/lib/utils/format";

export type UserRole = "admin" | "seller" | null;

export type PaymentType = "cash" | "credit" | "mixed";
export type PaymentMethod = "efectivo" | "transferencia";
export type LookupType = "dni" | "cuit" | "search";
export type DeliveryMethod = "pickup" | "delivery";
export type DeliveryAddressType = "saved" | "new";
export type DiscountType = "percent" | "fixed";
export type TaxCategory =
  | "responsable_inscripto"
  | "monotributo"
  | "consumidor_final"
  | "exento"
  | "no_responsable";

export interface CartState {
  // Data
  products: Product[];
  clients: Client[];
  sellers: Seller[];
  loading: boolean;

  // Cart
  cart: CartItem[];
  cartTotal: number;
  cartSubtotal: number;
  cartCount: number;
  finalTotal: number;
  discountAmount: number;

  // Client
  lookupType: LookupType;
  selectedClient: string;
  selectedClientData: Client | undefined;
  dniLookup: string;
  dniLoading: boolean;
  dniFound: boolean;
  dniNotFound: boolean;
  dniClientId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientAddress: string;
  clientDni: string;
  clientCuit: string;
  clientTaxCategory: TaxCategory;
  clientCreditLimit: number;

  // Seller
  selectedSeller: string;
  selectedSellerData: Seller | undefined;
  sellerMatchName: string | null;

  // Payment
  paymentType: PaymentType;
  paymentMethod: PaymentMethod;
  cashAmount: number;
  creditAmountInput: number;

  // Delivery
  selectedCity: City | "";
  deliveryMethod: DeliveryMethod;
  deliveryAddress: DeliveryAddressType;
  newAddress: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  selectedSavedAddress: { address: string; lat?: number; lng?: number } | null;

  // Discount
  discountType: DiscountType;
  discountValue: number;
  discountOpen: boolean;

  // Processing
  processing: boolean;
  saleComplete: boolean;
  lastSaleId: string;
}

export interface CartActions {
  // Cart
  addToCart: (product: Product) => void;
  updateQuantity: (productId: string, delta: number) => void;
  setQuantityDirect: (productId: string, value: number) => void;
  removeFromCart: (productId: string) => void;
  setItemDiscount: (productId: string, discount: number) => void;

  // Client
  setLookupType: (type: LookupType) => void;
  setSelectedClient: (id: string) => void;
  setDniLookup: (dni: string) => void;
  selectClientFromSearch: (clientId: string) => void;
  setClientName: (v: string) => void;
  setClientEmail: (v: string) => void;
  setClientPhone: (v: string) => void;
  setClientAddress: (v: string) => void;
  setClientDni: (v: string) => void;
  setClientCuit: (v: string) => void;
  setClientTaxCategory: (v: TaxCategory) => void;

  // Seller
  setSelectedSeller: (id: string) => void;

  // Payment
  setPaymentType: (type: PaymentType) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  handleCashAmountChange: (value: number) => void;
  handleCreditAmountChange: (value: number) => void;

  // Delivery
  setSelectedCity: (city: City | "") => void;
  setDeliveryMethod: (method: DeliveryMethod) => void;
  setDeliveryAddress: (type: DeliveryAddressType) => void;
  setNewAddress: (address: string) => void;
  selectSavedAddress: (addr: { address: string; lat?: number; lng?: number } | null) => void;
  updateClientAddress: (index: number, updated: { city: string; address: string; lat?: number; lng?: number }) => Promise<void>;
  deleteClientAddress: (index: number) => Promise<void>;
  setDeliveryCoords: (lat: number | null, lng: number | null) => void;

  // Discount
  setDiscountType: (type: DiscountType) => void;
  setDiscountValue: (value: number) => void;
  setDiscountOpen: (open: boolean) => void;

  // Actions
  canProcessSale: () => boolean;
  processSale: (modo?: "esperar" | "disponible") => Promise<"order" | "sale" | null>;
  resetCart: () => void;
  formatCurrency: (amount: number) => string;

  // Client creation
  createNewClient: (form: NewClientForm) => Promise<void>;
  registerClientFromDni: () => Promise<void>;
  registerClientFromModal: (form: { name: string; dni: string; cuit: string; email: string; phone: string; address: string; taxCategory: string; creditLimit: number; notes: string }) => Promise<void>;
  setClientCreditLimit: (v: number) => void;
}

export interface NewClientForm {
  name: string;
  cuit: string;
  dni: string;
  phone: string;
  email: string;
  creditLimit: number;
  taxCategory: TaxCategory;
  address: string;
}

export function useCart(role: UserRole, userEmail?: string) {
  // Data
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);

  // Cart - restore from localStorage
  const [cart, setCart] = useState<CartItem[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('cart-items');
        return saved ? JSON.parse(saved) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  // Client - lookup
  const [lookupType, setLookupType] = useState<LookupType>("search");
  const [dniLookup, setDniLookup] = useState("");
  const [dniLoading, setDniLoading] = useState(false);
  const [dniFound, setDniFound] = useState(false);
  const [dniNotFound, setDniNotFound] = useState(false);
  const [dniClientId, setDniClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientDni, setClientDni] = useState("");
  const [clientCuit, setClientCuit] = useState("");
  const [clientTaxCategory, setClientTaxCategory] = useState<TaxCategory>("consumidor_final");
  const [clientCreditLimit, setClientCreditLimit] = useState(50000);

  // Client - selector (admin)
  const [selectedClient, setSelectedClient] = useState("");

  // Seller
  const [selectedSeller, setSelectedSeller] = useState("");
  const [sellerMatchName, setSellerMatchName] = useState<string | null>(null);

  // Payment
  const [paymentType, setPaymentType] = useState<PaymentType>("cash");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("efectivo");
  const [cashAmount, setCashAmount] = useState(0);
  const [creditAmountInput, setCreditAmountInput] = useState(0);

  // Delivery
  const [selectedCity, setSelectedCity] = useState<City | "">("");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState<DeliveryAddressType>("saved");
  const [newAddress, setNewAddress] = useState("");
  const [deliveryLat, setDeliveryLat] = useState<number | null>(null);
  const [deliveryLng, setDeliveryLng] = useState<number | null>(null);
  const [selectedSavedAddress, setSelectedSavedAddress] = useState<{ address: string; lat?: number; lng?: number } | null>(null);

  // Discount
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discountValue, setDiscountValue] = useState(0);
  const [discountOpen, setDiscountOpen] = useState(false);

  // Processing
  const [processing, setProcessing] = useState(false);
  const [saleComplete, setSaleComplete] = useState(false);
  const [lastSaleId, setLastSaleId] = useState("");

  // --- Computed ---
  const cartSubtotal = useMemo(
    () => cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0),
    [cart],
  );
  const cartTotal = useMemo(
    () => cart.reduce((acc, item) => {
      const base = item.product.price * item.quantity;
      const disc = item.itemDiscount ? (base * item.itemDiscount) / 100 : 0;
      return acc + base - disc;
    }, 0),
    [cart],
  );
  const cartCount = useMemo(
    () => cart.reduce((acc, item) => acc + item.quantity, 0),
    [cart],
  );
  const discountAmount = useMemo(() => {
    if (discountValue <= 0) return 0;
    return discountType === "percent"
      ? (cartTotal * discountValue) / 100
      : discountValue;
  }, [discountValue, discountType, cartTotal]);
  const finalTotal = useMemo(
    () => Math.max(0, cartTotal - discountAmount),
    [cartTotal, discountAmount],
  );

  const selectedClientData = useMemo(
    () => clients.find((c) => c.id === (selectedClient || dniClientId)),
    [clients, selectedClient, dniClientId],
  );
  const selectedSellerData = useMemo(
    () => sellers.find((s) => s.id === selectedSeller),
    [sellers, selectedSeller],
  );

  // --- Load data ---
  const loadData = useCallback(async () => {
    try {
      if (role === null) {
        // Public/customer: use public API
        const response = await fetch("/api/public/productos");
        if (!response.ok) throw new Error("Error cargando productos");
        const data = await response.json();
        setProducts(data.products || []);
        setClients([]);
        setSellers([]);
      } else {
        // Admin/seller: cargar desde mayorista_productos
        const [mayoristaData, clientsData, sellersData] = await Promise.all([
          getMayoristaProductos(),
          clientsApi.getAll(),
          sellersApi.getAll(),
        ]);
        // Convertir MayoristaProducto a Product (solo habilitados, stock=9999 para no restringir pedidos)
        const productsData = mayoristaData.filter((p) => p.habilitado).map((p) => {
          // Precio de lote: precioVenta (precio del bulto entero) × seDivideEn / unidadesPorBulto
          // Ej: bulto $36.000, 30 unidades, se divide en 10 → $36.000 × 10 / 30 = $12.000/lote
          const precioLote =
            p.unidadesPorBulto && p.seDivideEn && p.unidadesPorBulto > 0
              ? Math.round(p.precioVenta * p.seDivideEn / p.unidadesPorBulto * 100) / 100
              : p.precioVenta;
          return {
            id: p.id,
            name: p.nombre,
            description: p.codigo,
            price: precioLote,
            stock: 9999,
            stockLocal: p.stockLocal,
            unidadesPorBulto: p.unidadesPorBulto,
            seDivideEn: p.seDivideEn,
            codigo: p.codigo,
            imageUrl: "",
            category: p.categoria,
            createdAt: p.updatedAt,
          };
        });
        setProducts(productsData);
        setClients(clientsData);
        setSellers(sellersData.filter((s) => s.isActive));
      }
    } catch (error) {

      toast.error("Error al cargar los datos");
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Seller match for seller role
  useEffect(() => {
    if (role !== "seller" || !userEmail) return;
    (async () => {
      try {
        const res = await fetch(`/api/public/vendedores?email=${encodeURIComponent(userEmail)}`);
        const data = await res.json();
        setSellerMatchName(data.found ? data.sellerName : null);
      } catch {}
    })();
  }, [role, userEmail]);

  // --- Persist cart to localStorage ---
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (cart.length > 0) {
        localStorage.setItem('cart-items', JSON.stringify(cart));
      } else {
        localStorage.removeItem('cart-items');
      }
    }
  }, [cart]);

  // --- Client lookup (DNI or CUIT) ---
  useEffect(() => {
    if (lookupType === "search") return;
    const minLength = lookupType === "dni" ? 7 : 5;
    if (!dniLookup || dniLookup.trim().length < minLength) {
      setDniFound(false);
      setDniNotFound(false);
      setDniClientId("");
      if (role === "admin") setSelectedClient("");
      return;
    }

    const handler = setTimeout(async () => {
      try {
        setDniLoading(true);
        setDniNotFound(false);

        if (role === "admin") {
          // Search in local clients array
          const rawValue = dniLookup.trim().toLowerCase();
          const digitsValue = normalizeCuit(dniLookup);
          const found = clients.find((c) => {
            if (lookupType === "dni") {
              return (
                c.dni?.toLowerCase() === rawValue ||
                (digitsValue.length > 0 && normalizeCuit(c.dni) === digitsValue)
              );
            }
            return (
              c.cuit?.toLowerCase() === rawValue ||
              (digitsValue.length > 0 && normalizeCuit(c.cuit) === digitsValue)
            );
          });
          if (found) {
            setSelectedClient(found.id);
            setClientName(found.name || "");
            setClientEmail(found.email || "");
            setClientPhone(found.phone || "");
            setClientAddress(found.address || "");
            setClientCuit(found.cuit || "");
            setClientTaxCategory(found.taxCategory || "consumidor_final");
            setDniClientId(found.id);
            setDniFound(true);
            setDniNotFound(false);
          } else {
            setSelectedClient("");
            setDniFound(false);
            setDniNotFound(true);
            setDniClientId("");
          }
        } else {
          // Use API for non-admin
          const param = lookupType === "cuit"
            ? `cuit=${encodeURIComponent(dniLookup.trim())}`
            : `dni=${encodeURIComponent(dniLookup.trim())}`;
          const response = await fetch(`/api/public/clientes?${param}`);
          const data = await response.json();
          if (data.found) {
            setClientName(data.client.name || "");
            setClientEmail(data.client.email || "");
            setClientPhone(data.client.phone || "");
            setClientAddress(data.client.address || "");
            setClientDni(data.client.dni || "");
            setClientCuit(data.client.cuit || "");
            setClientTaxCategory(data.client.taxCategory || "consumidor_final");
            setDniClientId(data.client.id || "");
            setDniFound(true);
            setDniNotFound(false);
          } else {
            setDniFound(false);
            setDniNotFound(true);
            setDniClientId("");
          }
        }
      } catch {
        // silently fail
      } finally {
        setDniLoading(false);
      }
    }, 400);

    return () => clearTimeout(handler);
  }, [dniLookup, role, lookupType, clients]);

  // --- Payment sync ---
  useEffect(() => {
    if (paymentType === "cash") {
      setCashAmount(finalTotal);
      setCreditAmountInput(0);
    } else if (paymentType === "credit") {
      setCashAmount(0);
      setCreditAmountInput(finalTotal);
    } else if (paymentType === "mixed") {
      if (cashAmount === 0 || cashAmount >= finalTotal) {
        const half = Math.floor(finalTotal / 2);
        setCashAmount(half);
        setCreditAmountInput(finalTotal - half);
      } else {
        setCreditAmountInput(finalTotal - cashAmount);
      }
    }
  }, [paymentType, finalTotal]);

  // --- Cart actions ---
  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          toast.error("Stock insuficiente");
          return prev;
        }
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }, []);

  const updateQuantity = useCallback((productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id !== productId) return item;
          const newQty = item.quantity + delta;
          if (newQty <= 0) return { ...item, quantity: 0 };
          if (newQty > item.product.stock) {
            toast.error("Stock insuficiente");
            return item;
          }
          return { ...item, quantity: newQty };
        })
        .filter((item) => item.quantity > 0),
    );
  }, []);

  const setQuantityDirect = useCallback((productId: string, value: number) => {
    setCart((prev) => {
      const item = prev.find((i) => i.product.id === productId);
      if (!item) return prev;
      const newQty = Math.max(1, Math.min(value, item.product.stock));
      return prev.map((i) =>
        i.product.id === productId ? { ...i, quantity: newQty } : i,
      );
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  }, []);

  const setItemDiscount = useCallback((productId: string, discount: number) => {
    const clamped = Math.max(0, Math.min(30, discount));
    setCart((prev) => prev.map((item) =>
      item.product.id === productId ? { ...item, itemDiscount: clamped || undefined } : item
    ));
  }, []);

  // --- Payment actions ---
  const handleCashAmountChange = useCallback(
    (value: number) => {
      const safeValue = Math.max(0, value);
      // En pago 'cash' permitimos exceder el total (saldo a favor del cliente)
      if (paymentType === "cash") {
        setCashAmount(safeValue);
        setCreditAmountInput(0);
      } else {
        const v = Math.min(safeValue, finalTotal);
        setCashAmount(v);
        setCreditAmountInput(finalTotal - v);
      }
    },
    [finalTotal, paymentType],
  );

  const handleCreditAmountChange = useCallback(
    (value: number) => {
      const v = Math.max(0, Math.min(value, finalTotal));
      setCreditAmountInput(v);
      setCashAmount(finalTotal - v);
    },
    [finalTotal],
  );

  // --- Saved address selection ---
  const selectSavedAddress = useCallback(
    (addr: { address: string; lat?: number; lng?: number } | null) => {
      setSelectedSavedAddress(addr);
      if (addr) {
        setDeliveryAddress("saved");
        if (addr.lat != null && addr.lng != null) {
          setDeliveryLat(addr.lat);
          setDeliveryLng(addr.lng);
        }
      }
    },
    [],
  );

  const updateClientAddress = useCallback(
    async (index: number, updated: { city: string; address: string; lat?: number; lng?: number }) => {
      const clientId = role === "admin" ? selectedClient : dniClientId;
      if (!clientId) return;
      const client = clients.find((c) => c.id === clientId);
      const existing = client?.addresses ? [...client.addresses] : [];
      if (index < 0 || index >= existing.length) return;
      existing[index] = updated;
      await clientsApi.update(clientId, { addresses: existing } as any);
      setClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, addresses: existing } : c)));
      if (selectedSavedAddress && selectedSavedAddress.address === client?.addresses?.[index]?.address) {
        setSelectedSavedAddress({ address: updated.address, lat: updated.lat, lng: updated.lng });
      }
      toast.success("Direccion actualizada");
    },
    [role, selectedClient, dniClientId, clients, selectedSavedAddress],
  );

  const deleteClientAddress = useCallback(
    async (index: number) => {
      const clientId = role === "admin" ? selectedClient : dniClientId;
      if (!clientId) return;
      const client = clients.find((c) => c.id === clientId);
      const existing = client?.addresses ? [...client.addresses] : [];
      if (index < 0 || index >= existing.length) return;
      const removed = existing.splice(index, 1)[0];
      await clientsApi.update(clientId, { addresses: existing } as any);
      setClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, addresses: existing } : c)));
      if (selectedSavedAddress && removed && selectedSavedAddress.address === removed.address) {
        setSelectedSavedAddress(null);
      }
      toast.success("Direccion eliminada");
    },
    [role, selectedClient, dniClientId, clients, selectedSavedAddress],
  );

  // --- Register client from DNI form (seller/public) ---
  const registerClientFromDni = useCallback(async () => {
    if (!clientName.trim() || !dniLookup.trim()) return;
    try {
      const newClient = await clientsApi.create({
        name: clientName.trim(),
        dni: dniLookup.trim(),
        cuit: clientCuit.trim() || undefined,
        email: clientEmail.trim() || undefined,
        phone: clientPhone.trim() || undefined,
        address: clientAddress.trim() || undefined,
        creditLimit: clientCreditLimit,
        taxCategory: clientTaxCategory,
        notes: "",
      });
      setDniClientId(newClient.id);
      setDniFound(true);
      setDniNotFound(false);
      toast.success("Cliente registrado correctamente");
    } catch (error) {

      toast.error("Error al registrar el cliente");
      throw error;
    }
  }, [clientName, dniLookup, clientCuit, clientEmail, clientPhone, clientAddress, clientCreditLimit, clientTaxCategory]);

  // --- Register client from modal (seller/public using ClientModal) ---
  const registerClientFromModal = useCallback(async (form: { name: string; dni: string; cuit: string; email: string; phone: string; address: string; taxCategory: string; creditLimit: number; notes: string }) => {
    const newClient = await clientsApi.create({
      name: form.name,
      dni: form.dni || dniLookup.trim(),
      cuit: form.cuit || undefined,
      email: form.email || undefined,
      phone: form.phone || undefined,
      address: form.address || undefined,
      creditLimit: form.creditLimit ?? 50000,
      taxCategory: (form.taxCategory as TaxCategory) || "consumidor_final",
      notes: form.notes || "",
    });
    setClients((prev) => [newClient, ...prev]);
    setSelectedClient(newClient.id);
    setDniClientId(newClient.id);
    setDniFound(true);
    setDniNotFound(false);
    setClientName(form.name);
    setClientEmail(form.email || "");
    setClientPhone(form.phone || "");
    setClientAddress(form.address || "");
    setClientCuit(form.cuit || "");
    setClientTaxCategory((form.taxCategory as TaxCategory) || "consumidor_final");
    toast.success("Cliente registrado correctamente");
  }, [dniLookup]);

  // --- Validation ---
  const canProcessSale = useCallback(() => {
    if (cart.length === 0) return false;

    // Email y teléfono obligatorios solo para clientes públicos
    if (role === null && (!clientEmail || !clientPhone)) return false;

    if (role === "admin") {
      if (deliveryMethod === "delivery") {
        if (deliveryAddress === "saved" && !selectedSavedAddress?.address && (!selectedClientData || !selectedClientData.address)) return false;
        if (deliveryAddress === "new" && !newAddress.trim()) return false;
      }
      if ((paymentType === "credit" || paymentType === "mixed") && !selectedClientData) return false;
      if (selectedClientData && (paymentType === "credit" || paymentType === "mixed")) {
        const amountToCredit = paymentType === "credit" ? finalTotal : creditAmountInput;
        if (selectedClientData.currentBalance + amountToCredit > selectedClientData.creditLimit) {
          return false;
        }
      }
      if (paymentType === "mixed" && (cashAmount <= 0 || cashAmount >= finalTotal)) return false;
    } else if (role === "seller") {
      if (deliveryMethod === "delivery" && deliveryAddress === "new" && !newAddress.trim()) return false;
    } else {
      // public (role === null): only require name, phone, email
      if (!clientName.trim()) return false;
      if (deliveryMethod === "delivery" && deliveryAddress === "new" && !newAddress.trim()) return false;
    }

    if (deliveryMethod === "delivery" && !selectedCity) return false;

    return true;
  }, [
    cart, role, selectedClient, selectedClientData, deliveryMethod,
    deliveryAddress, newAddress, paymentType, finalTotal, cashAmount,
    creditAmountInput, dniLookup, clientName, dniFound, selectedCity,
    clientEmail, clientPhone, selectedSavedAddress,
  ]);

  // --- Process sale ---
  const handleProcessSale = useCallback(async (modo: "esperar" | "disponible" = "disponible") => {
    setProcessing(true);
    try {
      const resolvedAddress =
        deliveryMethod === "delivery"
          ? deliveryAddress === "saved"
            ? (selectedSavedAddress?.address || (role === "admin" ? selectedClientData?.address : clientAddress))
            : newAddress
          : "Retiro en local";
      // Si hay una direccion guardada seleccionada, usar sus coordenadas
      const resolvedLat =
        deliveryMethod === "delivery" && deliveryAddress === "saved" && selectedSavedAddress?.lat != null
          ? selectedSavedAddress.lat
          : deliveryLat;
      const resolvedLng =
        deliveryMethod === "delivery" && deliveryAddress === "saved" && selectedSavedAddress?.lng != null
          ? selectedSavedAddress.lng
          : deliveryLng;

      // Resolve client info based on role
      let resolvedClientId: string | undefined;
      let resolvedClientName: string | undefined;
      let resolvedClientPhone: string | undefined;
      let resolvedSellerId: string | undefined;
      let resolvedSellerName: string | undefined;

      if (role === "admin") {
        resolvedClientId = selectedClient;
        resolvedClientName = selectedClientData?.name;
        resolvedClientPhone = clientPhone || selectedClientData?.phone;
        resolvedSellerId = selectedSeller !== "none" && selectedSeller ? selectedSeller : undefined;
        resolvedSellerName = selectedSellerData?.name;
      } else {
        // For non-admin: use stored client ID from DNI lookup/registration
        resolvedClientId = dniClientId || undefined;
        resolvedClientName = clientName;
        resolvedClientPhone = clientPhone;
        // seller: match by email
        if (role === "seller" && sellerMatchName) {
          const matchedSeller = sellers.find((s) => s.name === sellerMatchName);
          resolvedSellerId = matchedSeller?.id;
          resolvedSellerName = sellerMatchName;
        }
      }

      // Public users (role === null): usar API server-side (evita bloqueo de Firestore auth)
      if (role === null) {
        const res = await fetch("/api/public/pedidos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: resolvedClientId || null,
            client: {
              name: resolvedClientName || "Cliente",
              phone: clientPhone,
              email: clientEmail,
              dni: clientDni || (lookupType === "dni" ? dniLookup : ""),
              cuit: clientCuit || (lookupType === "cuit" ? dniLookup : ""),
              address: "",
              taxCategory: clientTaxCategory || "consumidor_final",
            },
            items: cart.map((item) => ({
              productId: item.product.id,
              name: item.product.name,
              quantity: item.quantity,
              price: item.product.price,
              itemDiscount: item.itemDiscount ?? null,
            })),
            deliveryMethod,
            city: deliveryMethod === "pickup" ? null : selectedCity || null,
            address: resolvedAddress || (deliveryMethod === "pickup" ? "Retiro en local" : null),
            lat: resolvedLat ?? null,
            lng: resolvedLng ?? null,
            discount: discountValue > 0 ? discountValue : null,
            discountType: discountValue > 0 ? discountType : null,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || "Error al crear el pedido");
        }
        toast.success("¡Pedido creado correctamente!");
        resetCart();
        return "order";
      }

      // Admin/seller delivery: Firestore directo
      if (deliveryMethod === "delivery") {
        await ordersApi.createOrder({
          clientId: resolvedClientId,
          clientName: resolvedClientName || "Cliente",
          clientPhone: resolvedClientPhone,
          sellerId: resolvedSellerId,
          sellerName: resolvedSellerName,
          items: cart,
          city: selectedCity || undefined,
          address: resolvedAddress || "Direccion no especificada",
          lat: resolvedLat ?? undefined,
          lng: resolvedLng ?? undefined,
          status: "pending",
          source: "direct_sale",
          discount: discountValue > 0 ? discountValue : undefined,
          discountType: discountValue > 0 ? discountType : undefined,
        });
        toast.success("Pedido creado correctamente");
        resetCart();
        return "order";
      } else {
        // Si hay déficit de stock y modo=esperar: crear pedido en lugar de venta pendiente
        const hayInsuficiencia = cart.some(item => item.quantity > (item.product.stockLocal ?? 0));
        if (modo === "esperar" && hayInsuficiencia) {
          await ordersApi.createOrder({
            clientId: resolvedClientId,
            clientName: resolvedClientName || "Mostrador",
            clientPhone: resolvedClientPhone,
            sellerId: resolvedSellerId,
            sellerName: resolvedSellerName,
            items: cart,
            address: "Retiro en local",
            status: "pending",
            source: "direct_sale",
            discount: discountValue > 0 ? discountValue : undefined,
            discountType: discountValue > 0 ? discountType : undefined,
          });

          // Crear pedido al mayorista automáticamente con los items en déficit
          const itemsDeficit = cart
            .filter(item => item.quantity > (item.product.stockLocal ?? 0))
            .map(item => {
              const stockLocal = item.product.stockLocal ?? 0;
              const faltante = item.quantity - stockLocal;
              const unidadesPorBulto = (item.product as any).unidadesPorBulto ?? 1;
              return {
                productoId: item.product.id,
                nombre: item.product.name,
                unidadesPedidas: faltante,
                unidadesRecibidas: 0,
                bultosPedidos: Math.ceil(faltante / unidadesPorBulto),
              };
            });
          if (itemsDeficit.length > 0) {
            await crearPedidoMayorista(itemsDeficit);
          }

          toast.success("Pedido creado — pedido al mayorista generado automáticamente");
          resetCart();
          return "order";
        }

        const overpayment =
          paymentType === "cash" && cashAmount > finalTotal
            ? cashAmount - finalTotal
            : 0;
        const sale = await processSaleMayorista({
          clientId: resolvedClientId,
          clientName: resolvedClientName,
          clientPhone: resolvedClientPhone,
          sellerId: resolvedSellerId,
          sellerName: resolvedSellerName,
          items: cart,
          paymentType,
          paymentMethod,
          cashAmount:
            paymentType === "mixed" ? cashAmount : paymentType === "cash" ? cashAmount : undefined,
          creditAmount:
            paymentType === "mixed"
              ? creditAmountInput
              : paymentType === "credit"
                ? finalTotal
                : undefined,
          overpayment: overpayment > 0 ? overpayment : undefined,
          discount: discountValue > 0 ? discountValue : undefined,
          discountType: discountValue > 0 ? discountType : undefined,
          deliveryMethod: "pickup",
          deliveryAddress: "Retiro en local",
          modo,
        });

        setLastSaleId(sale.id);
        setSaleComplete(true);
        const msg = modo === "esperar"
          ? "Venta creada — pendiente de stock mayorista"
          : "Venta confirmada con stock disponible";
        toast.success(msg);

        // Alerta de stock bajo
        cart.forEach((item) => {
          const localStock = item.product.stockLocal ?? 0;
          const restante = localStock - item.quantity;
          if (restante <= 3 && restante >= 0) {
            toast.warning(`Stock bajo: ${item.product.name} — quedan ${restante} unidades locales`);
          }
        });

        return "sale";
      }
    } catch (error) {

      toast.error(
        error instanceof Error ? error.message : "Error al procesar la venta",
      );
      return null;
    } finally {
      setProcessing(false);
    }
  }, [
    deliveryMethod, deliveryAddress, role, selectedClient, selectedClientData,
    clientPhone, clientName, clientAddress, selectedSeller, selectedSellerData,
    sellerMatchName, sellers, cart, paymentType, paymentMethod, cashAmount, creditAmountInput,
    finalTotal, discountValue, discountType, newAddress, dniClientId, selectedCity,
    deliveryLat, deliveryLng, selectedSavedAddress,
  ]);

  // --- Reset ---
  const resetCart = useCallback(() => {
    setCart([]);
    if (typeof window !== 'undefined') localStorage.removeItem('cart-items');
    setSelectedClient("");
    setSelectedSeller("");
    setPaymentType("cash");
    setPaymentMethod("efectivo");
    setCashAmount(0);
    setCreditAmountInput(0);
    setClientPhone("");
    setClientName("");
    setClientEmail("");
    setClientAddress("");
    setClientDni("");
    setClientCuit("");
    setClientTaxCategory("consumidor_final");
    setLookupType("dni");
    setDniLookup("");
    setDniFound(false);
    setDniNotFound(false);
    setDniClientId("");
    setClientCreditLimit(50000);
    setSelectedCity("");
    setDeliveryMethod("pickup");
    setDeliveryAddress("saved");
    setNewAddress("");
    setSelectedSavedAddress(null);
    setDeliveryLat(null);
    setDeliveryLng(null);
    setDiscountValue(0);
    setDiscountType("percent");
    setDiscountOpen(false);
    setSaleComplete(false);
    setLastSaleId("");
    loadData();
  }, [loadData]);

  // --- Create client (admin) ---
  const createNewClient = useCallback(
    async (form: NewClientForm) => {
      const newClient = await clientsApi.create({
        name: form.name,
        cuit: form.cuit,
        dni: form.dni || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        creditLimit: form.creditLimit,
        address: form.address || undefined,
        taxCategory: form.taxCategory,
        notes: "",
      });
      setClients((prev) => [newClient, ...prev]);
      setSelectedClient(newClient.id);
      setDniClientId(newClient.id);
      setDniFound(true);
      setDniNotFound(false);
      setClientName(form.name);
      setClientEmail(form.email || "");
      setClientPhone(form.phone || "");
      setClientAddress(form.address || "");
      setClientCuit(form.cuit || "");
      toast.success("Cliente creado correctamente");
    },
    [],
  );

  const selectClientFromSearch = useCallback(
    (clientId: string) => {
      const found = clients.find((c) => c.id === clientId);
      if (!found) return;
      setSelectedClient(found.id);
      setClientName(found.name || "");
      setClientEmail(found.email || "");
      setClientPhone(found.phone || "");
      setClientAddress(found.address || "");
      setClientCuit(found.cuit || "");
      setClientTaxCategory(found.taxCategory || "consumidor_final");
      setDniClientId(found.id);
      setDniFound(true);
      setDniNotFound(false);
    },
    [clients],
  );

  const state: CartState = {
    products, clients, sellers, loading,
    cart, cartTotal, cartSubtotal, cartCount, finalTotal, discountAmount,
    lookupType, selectedClient, selectedClientData,
    dniLookup, dniLoading, dniFound, dniNotFound, dniClientId,
    clientName, clientEmail, clientPhone, clientAddress, clientDni, clientCuit, clientTaxCategory, clientCreditLimit,
    selectedSeller, selectedSellerData, sellerMatchName,
    paymentType, paymentMethod, cashAmount, creditAmountInput,
    selectedCity, deliveryMethod, deliveryAddress, newAddress,
    deliveryLat, deliveryLng, selectedSavedAddress,
    discountType, discountValue, discountOpen,
    processing, saleComplete, lastSaleId,
  };

  const actions: CartActions = {
    addToCart, updateQuantity, setQuantityDirect, removeFromCart, setItemDiscount,
    setLookupType, setSelectedClient, setDniLookup, selectClientFromSearch,
    setClientName, setClientEmail, setClientPhone, setClientAddress,
    setClientDni, setClientCuit, setClientTaxCategory,
    setSelectedSeller,
    setPaymentType, setPaymentMethod, handleCashAmountChange, handleCreditAmountChange,
    setSelectedCity: (city: City | "") => {
      setSelectedCity(city);
      setSelectedSavedAddress(null);
    },
    setDeliveryMethod, setDeliveryAddress, setNewAddress,
    selectSavedAddress, updateClientAddress, deleteClientAddress,
    setDeliveryCoords: (lat: number | null, lng: number | null) => { setDeliveryLat(lat); setDeliveryLng(lng); },
    setDiscountType, setDiscountValue, setDiscountOpen,
    canProcessSale, processSale: (modo?: "esperar" | "disponible") => handleProcessSale(modo ?? "disponible"), resetCart, formatCurrency,
    createNewClient, registerClientFromDni, registerClientFromModal, setClientCreditLimit,
  };

  return { state, actions };
}
