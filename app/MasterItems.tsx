import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, TouchableOpacity, StyleSheet, FlatList, TextInput, ActivityIndicator, Dimensions, Modal, Platform, RefreshControl } from "react-native";
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import ModalSelector from "@/components/AppModalSelect";
import axios from 'axios';
import DateTimePicker from '@react-native-community/datetimepicker';

import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
import { authenticatedFetch } from "../utils/auth";
import { resolveEmployeeIdentity } from "../utils/employeeIdentity";
// ✅ Telemetry
import {
  trackScreen,
  startScreenTimer,
  trackUI,
  trackNetwork,
  updateDynamicContext,
  clearDynamicContext,
  flushTelemetry,
} from '../utils/telemetry';
import { useFontScale } from "@/context/FontScaleContext";
import TText from '@/components/TText';

type RequestType = 'general' | 'avenue_add_on' | 'customer_add_on';
type Option = { key: string; label: string };

interface Item {
  item_id?: string;
  item_name: string;
  item_type: string;
  id: number;
  minimum_quantity: number;
  quantity: number;
}

interface ProjectOption {
  key: string;
  label: string;
}

interface SelectedItem {
  item_name: string;
  invoice_id?: string;
  warehouse?: string;
}

type FetchMode = 'initial' | 'refresh' | 'loadMore' | 'search';
const INVENTORY_REQUEST_SOURCE = "MasterItems";

const MasterItems: React.FC = () => {
  const router = useRouter();
  const params = useLocalSearchParams();

  // ----------------- State -----------------
  const [items, setItems] = useState<Item[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // pagination state
  const [offset, setOffset] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [limit] = useState<number>(50); // backend limit
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  const [numColumns, setNumColumns] = useState<number>(1);

  const modalSelectorRef = useRef<any>(null);
  const [filterOptions, setFilterOptions] = useState<Option[]>([{ key: 'All', label: 'All' }]);
  const [selectedItemType, setSelectedItemType] = useState<string>('All'); // used by Filter modal

  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'request' | 'block'>('request');
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [quantity, setQuantity] = useState('');
  const [type, setType] = useState<RequestType>('general');
  const [startDate, setStartDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [project, setProject] = useState('');
  const [property, setProperty] = useState('');
  const [remark, setRemark] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [propertyOptions, setPropertyOptions] = useState<ProjectOption[]>([]);
  const [isDialogVisible, setIsDialogVisible] = useState(false);
  const [dialogMessage, setDialogMessage] = useState('');

  // checkbox state
  const [selectedItemsMap, setSelectedItemsMap] = useState<Record<string, boolean>>({});

  // ----------------- Constants -----------------
  const API_URL = `${APP_API_BASE_URL}/get-all-masteritems-new`;

  // ✅ Telemetry helpers / refs (prevent spam)
  const employeeCode = params?.employee_code?.toString?.() ?? null;
  const didScreenStart = useRef(false);
  const lastSearchLogRef = useRef<{ q: string; at: number }>({ q: '', at: 0 });

  // ----------------- Helpers -----------------
  const toggleItemSelection = (itemId: string) => {
    setSelectedItemsMap((prev) => {
      const next = { ...prev, [itemId]: !prev[itemId] };

      // ✅ Telemetry: selection toggle
      const selectedCount = Object.values(next).filter(Boolean).length;
      trackUI({
        screen: 'MasterItems',
        element: 'item_checkbox',
        action: 'toggle',
        extra: {
          item_id: itemId,
          checked: !!next[itemId],
          selected_count: selectedCount,
        },
      });

      return next;
    });
  };

  // debounce search so we don't spam API on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const hasMore = useMemo(() => items.length < total, [items.length, total]);
  const selectedCount = useMemo(
    () => Object.values(selectedItemsMap).filter(Boolean).length,
    [selectedItemsMap]
  );
  const anySelected = selectedCount > 0;

  const buildUrl = (nextOffset: number, q?: string) => {
    const params: Record<string, string> = {
      offset: String(nextOffset),
      limit: String(limit),
    };

    if (q && q.trim().length > 0) {
      params.search = q.trim();
    }

    // 🔥 Push filter to backend so total / pagination only consider this type
    if (selectedItemType !== 'All') {
      params.item_type = selectedItemType;
    }

    const qs = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    return `${API_URL}?${qs}`;
  };

  // ✅ Telemetry: screen view + timer + dynamic context
  useEffect(() => {
    if (didScreenStart.current) return;
    didScreenStart.current = true;

    updateDynamicContext({
      screen: 'MasterItems',
      employeeCode,
    });

    trackScreen('MasterItems', {
      employeeCode,
    });

    const stop = startScreenTimer('MasterItems', {
      employeeCode,
    });

    return () => {
      stop?.();
      clearDynamicContext();
      flushTelemetry({ reason: 'screen_unmount' }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----------------- Data Fetch -----------------
  const fetchItems = async (mode: FetchMode, queryOverride?: string) => {
    const q = queryOverride ?? debouncedQuery;

    // ✅ Telemetry: capture attempt
    const nextOffset = mode === 'loadMore' ? offset : 0;
    const url = buildUrl(nextOffset, q);
    const startedAt = Date.now();

    trackUI({
      screen: 'MasterItems',
      element: 'items_fetch',
      action: 'start',
      extra: {
        mode,
        offset: nextOffset,
        limit,
        q: q?.trim?.() ?? '',
        item_type: selectedItemType,
      },
    });

    try {
      if (mode === 'initial' || mode === 'search') setIsLoading(true);
      if (mode === 'refresh') setIsRefreshing(true);
      if (mode === 'loadMore') setIsLoadingMore(true);

      const response = await authenticatedFetch(url);
      const durationMs = Date.now() - startedAt;

      // ✅ Telemetry: network event
      trackNetwork({
        url,
        method: 'GET',
        status: response.status,
        durationMs,
        ok: response.ok,
        extra: {
          screen: 'MasterItems',
          mode,
          q: q?.trim?.() ?? '',
          item_type: selectedItemType,
          offset: nextOffset,
          limit,
        },
      });

      const jsonData = await response.json();
      const apiItems = Array.isArray(jsonData.items) ? jsonData.items : [];

      const validItems: Item[] = apiItems.map((item: any, index: number) => ({
        ...item,
        item_id: item.item_id ? String(item.item_id) : `fallback_${nextOffset + index}`,
      }));

      if (mode === 'loadMore') setItems((prev) => [...prev, ...validItems]);
      else setItems(validItems);

      if (typeof jsonData.total === 'number') setTotal(jsonData.total);
      else setTotal(mode === 'loadMore' ? nextOffset + validItems.length : validItems.length);

      const newOffset = nextOffset + validItems.length;
      setOffset(newOffset);

      // ✅ Telemetry: fetch success
      trackUI({
        screen: 'MasterItems',
        element: 'items_fetch',
        action: 'success',
        extra: {
          mode,
          fetched_count: validItems.length,
          total: typeof jsonData.total === 'number' ? jsonData.total : null,
          new_offset: newOffset,
          duration_ms: durationMs,
          item_type: selectedItemType,
          q: q?.trim?.() ?? '',
        },
      });
    } catch (e: any) {
      const durationMs = Date.now() - startedAt;

      trackUI({
        screen: 'MasterItems',
        element: 'items_fetch',
        action: 'error',
        extra: {
          mode,
          duration_ms: durationMs,
          message: e?.message ?? 'unknown_error',
          item_type: selectedItemType,
          q: q?.trim?.() ?? '',
        },
      });

      if (mode !== 'loadMore') {
        setItems([]);
        setTotal(0);
        setOffset(0);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      setIsLoadingMore(false);
    }
  };

  const fetchItemTypes = async () => {
    const url = `${APP_API_BASE_URL}/get-all-item-types`;
    const startedAt = Date.now();

    trackUI({ screen: 'MasterItems', element: 'item_types_fetch', action: 'start', extra: {} });

    try {
      const res = await authenticatedFetch(url);
      const durationMs = Date.now() - startedAt;

      trackNetwork({
        url,
        method: 'GET',
        status: res.status,
        durationMs,
        ok: res.ok,
        extra: { screen: 'MasterItems' },
      });

      const json = await res.json();
      const raw: unknown = json?.item_types;
      const arr: unknown[] = Array.isArray(raw) ? raw : [];

      const normalized: string[] = arr
        .map((x) => String(x))
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const uniqueTypes: string[] = Array.from(new Set(normalized)).sort((a, b) => a.localeCompare(b));

      const options: Option[] = [
        { key: 'All', label: 'All' },
        ...uniqueTypes.map((t): Option => ({ key: t, label: t })),
      ];

      setFilterOptions(options);

      trackUI({
        screen: 'MasterItems',
        element: 'item_types_fetch',
        action: 'success',
        extra: { count: uniqueTypes.length, duration_ms: durationMs },
      });
    } catch (e: any) {
      trackUI({
        screen: 'MasterItems',
        element: 'item_types_fetch',
        action: 'error',
        extra: { message: e?.message ?? 'unknown_error' },
      });
      // keep existing on failure
    }
  };

  const fetchProjects = async () => {
    const url = `${APP_API_BASE_URL}/projects_m`;
    const startedAt = Date.now();

    trackUI({ screen: 'MasterItems', element: 'projects_fetch', action: 'start', extra: {} });

    try {
      const response = await axios.get(url);
      const durationMs = Date.now() - startedAt;

      trackNetwork({
        url,
        method: 'GET',
        status: response?.status,
        durationMs,
        ok: true,
        extra: { screen: 'MasterItems' },
      });

      if (Array.isArray(response.data.projects)) {
        const options = response.data.projects.map(
          (proj: { project_id: number; project_name: string }) => ({
            key: String(proj.project_id),
            label: proj.project_name,
          })
        );
        setProjectOptions(options);

        trackUI({
          screen: 'MasterItems',
          element: 'projects_fetch',
          action: 'success',
          extra: { count: options.length, duration_ms: durationMs },
        });
      } else {
        setProjectOptions([]);
        trackUI({
          screen: 'MasterItems',
          element: 'projects_fetch',
          action: 'success',
          extra: { count: 0, duration_ms: durationMs },
        });
      }
    } catch (e: any) {
      setProjectOptions([]);
      trackUI({
        screen: 'MasterItems',
        element: 'projects_fetch',
        action: 'error',
        extra: { message: e?.message ?? 'unknown_error' },
      });
    }
  };

  const fetchProperties = async (selectedProjectId: string) => {
    const url = `${APP_API_BASE_URL}/projects_m/${selectedProjectId}/properties`;
    const startedAt = Date.now();

    trackUI({
      screen: 'MasterItems',
      element: 'properties_fetch',
      action: 'start',
      extra: { project_id: selectedProjectId },
    });

    try {
      const response = await axios.get(url);
      const durationMs = Date.now() - startedAt;

      trackNetwork({
        url,
        method: 'GET',
        status: response?.status,
        durationMs,
        ok: true,
        extra: { screen: 'MasterItems', project_id: selectedProjectId },
      });

      if (Array.isArray(response.data.properties)) {
        const options = response.data.properties.map((prop: any, index: number) => ({
          key: `${index + 1}`,
          label: prop.name,
        }));
        setPropertyOptions(options);

        trackUI({
          screen: 'MasterItems',
          element: 'properties_fetch',
          action: 'success',
          extra: { project_id: selectedProjectId, count: options.length, duration_ms: durationMs },
        });
      } else {
        setPropertyOptions([]);
        trackUI({
          screen: 'MasterItems',
          element: 'properties_fetch',
          action: 'success',
          extra: { project_id: selectedProjectId, count: 0, duration_ms: durationMs },
        });
      }
    } catch (e: any) {
      setPropertyOptions([]);
      trackUI({
        screen: 'MasterItems',
        element: 'properties_fetch',
        action: 'error',
        extra: { project_id: selectedProjectId, message: e?.message ?? 'unknown_error' },
      });
    }
  };

  const onRefresh = useCallback(async () => {
    trackUI({ screen: 'MasterItems', element: 'pull_to_refresh', action: 'start', extra: {} });
    await fetchItems('refresh', debouncedQuery);
    trackUI({ screen: 'MasterItems', element: 'pull_to_refresh', action: 'end', extra: {} });
  }, [debouncedQuery, selectedItemType]);

  const handleCreateNewItem = (itemName: string) => {
    trackUI({
      screen: 'MasterItems',
      element: 'create_new_item',
      action: 'open',
      extra: { item_name: itemName },
    });

    setSelectedItem({ item_name: itemName });
    setQuantity('');
    setType('general');
    setProject('');
    setProperty('');
    setRemark('');
    setStartDate(new Date());
    setModalType('request');
    setModalVisible(true);
    fetchProjects();
  };

  useFocusEffect(
    useCallback(() => {
      // ✅ Telemetry: focus
      trackUI({ screen: 'MasterItems', element: 'screen_focus', action: 'open', extra: {} });

      // initial list load & types on screen focus
      fetchItems('initial', '');
      fetchItemTypes();

      // reset selections
      setSelectedItemsMap({});
      setSearchQuery('');
      setDebouncedQuery('');
      setSelectedItemType('All');

      return () => {
        trackUI({ screen: 'MasterItems', element: 'screen_focus', action: 'close', extra: {} });
      };
    }, [])
  );

  // when search OR filter changes -> fresh API call from offset 0
  useEffect(() => {
    // ✅ Telemetry: actual search executed (after debounce) + filter
    trackUI({
      screen: 'MasterItems',
      element: 'search_execute',
      action: 'submit',
      extra: {
        q: debouncedQuery?.trim?.() ?? '',
        item_type: selectedItemType,
      },
    });

    fetchItems('search', debouncedQuery);
  }, [debouncedQuery, selectedItemType]);

  // responsive columns
  useEffect(() => {
    const handleResize = () => {
      const screenWidth = Dimensions.get('window').width;
      setNumColumns(screenWidth < 620 ? 1 : screenWidth < 980 ? 2 : 3);
    };
    handleResize();
    const subscription = Dimensions.addEventListener('change', handleResize);
    return () => (subscription as any)?.remove?.();
  }, []);

  // ----------------- UI Handlers -----------------
  const handleFilterSelect = (itemType: string) => {
    trackUI({
      screen: 'MasterItems',
      element: 'filter_select',
      action: 'change',
      extra: {
        from: selectedItemType,
        to: itemType,
      },
    });
    setSelectedItemType(itemType);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);

    // ✅ Telemetry: throttle typing logs (avoid 1 event per keystroke)
    const now = Date.now();
    const q = query ?? '';
    if (now - lastSearchLogRef.current.at > 1200 && lastSearchLogRef.current.q !== q) {
      lastSearchLogRef.current = { q, at: now };
      trackUI({
        screen: 'MasterItems',
        element: 'search_input',
        action: 'change',
        extra: { q_len: q.length },
      });
    }
  };

  const handleProjectSelect = (option: { key: string; label: string }) => {
    trackUI({
      screen: 'MasterItems',
      element: 'project_select',
      action: 'change',
      extra: { project_id: option.key, project_name: option.label },
    });

    setProject(option.label);
    setProjectId(option.key);
    fetchProperties(option.key);
  };

  const closeDialog = () => {
    trackUI({
      screen: 'MasterItems',
      element: 'status_dialog',
      action: 'close',
      extra: {},
    });

    setIsDialogVisible(false);
    if (router.canGoBack()) router.back();
    else router.push('/HomeScreen');
  };

  const openFilterModal = () => {
    trackUI({
      screen: 'MasterItems',
      element: 'filter_modal',
      action: 'open',
      extra: {},
    });
    modalSelectorRef.current?.open();
  };

  const handleLoadMore = () => {
    trackUI({
      screen: 'MasterItems',
      element: 'pagination',
      action: 'attempt',
      extra: {
        isLoadingMore,
        isLoading,
        hasMore,
        offset,
        total,
      },
    });

    if (isLoadingMore || isLoading || !hasMore) return;
    fetchItems('loadMore', debouncedQuery);
  };

  // ----------------- Actions -----------------
  const handleRequestInventory = async () => {
    const quantityNumber = Number(quantity);

    // ✅ Telemetry: validation failures (these are gold)
    if (!quantity || isNaN(quantityNumber) || quantityNumber <= 0) {
      trackUI({
        screen: 'MasterItems',
        element: 'request_inventory',
        action: 'validate_fail',
        extra: { reason: 'invalid_quantity', quantity },
      });
      setDialogMessage('Invalid Quantity. Please enter a valid number.');
      setIsDialogVisible(true);
      return;
    }
    if (!projectId || property === 'Select Property' || !property) {
      trackUI({
        screen: 'MasterItems',
        element: 'request_inventory',
        action: 'validate_fail',
        extra: { reason: 'missing_project_or_property', projectId, property },
      });
      setDialogMessage('Missing Fields. Please select a project and property.');
      setIsDialogVisible(true);
      return;
    }
    if (!selectedItem) {
      trackUI({
        screen: 'MasterItems',
        element: 'request_inventory',
        action: 'validate_fail',
        extra: { reason: 'no_item_selected' },
      });
      setDialogMessage('No item selected.');
      setIsDialogVisible(true);
      return;
    }
    if (!startDate) {
      trackUI({
        screen: 'MasterItems',
        element: 'request_inventory',
        action: 'validate_fail',
        extra: { reason: 'missing_date' },
      });
      setDialogMessage('Missing Date. Please select a start date.');
      setIsDialogVisible(true);
      return;
    }

    const identity = await resolveEmployeeIdentity(params as Record<string, unknown>);
    const effectiveEmployeeCode = identity.employee_code || String(params.employee_code?.toString?.() || "").trim();
    if (!effectiveEmployeeCode) {
      trackUI({
        screen: 'MasterItems',
        element: 'request_inventory',
        action: 'validate_fail',
        extra: { reason: 'missing_employee_code' },
      });
      setDialogMessage('Unable to identify employee code for this request. Please log in again and retry.');
      setIsDialogVisible(true);
      return;
    }

    const requestData = {
      item_name: selectedItem.item_name,
      requested_quantity: parseInt(quantity, 10),
      invoice_id: selectedItem.invoice_id || null,
      warehouse: selectedItem.warehouse || '1',
      project_name: project || null,
      property_name: property || null,
      employee_code: effectiveEmployeeCode,
      deli_date: startDate.toISOString().split('T')[0],
      initial_remark: remark || '',
      item_type: type,
    };

    const url = `${APP_API_BASE_URL}/request-inventory`;
    const startedAt = Date.now();

    // ✅ Telemetry: submit
    trackUI({
      screen: 'MasterItems',
      element: 'request_inventory',
      action: 'submit',
      extra: {
        item_name: requestData.item_name,
        qty: requestData.requested_quantity,
        project_name: project,
        property_name: property,
        deli_date: requestData.deli_date,
        item_type: type,
      },
    });

    try {
      const response = await axios.post(url, requestData, {
        headers: {
          'Content-Type': 'application/json',
          'x-client-sync-mode': 'online_live',
          'x-client-request-source': INVENTORY_REQUEST_SOURCE,
        },
      });

      const durationMs = Date.now() - startedAt;

      trackNetwork({
        url,
        method: 'POST',
        status: response?.status,
        durationMs,
        ok: true,
        extra: {
          screen: 'MasterItems',
          item_name: requestData.item_name,
          qty: requestData.requested_quantity,
          item_type: type,
        },
      });

      if (response.data.success) {
        trackUI({
          screen: 'MasterItems',
          element: 'request_inventory',
          action: 'success',
          extra: {
            note: response.data.note ?? null,
            duration_ms: durationMs,
          },
        });

        let baseMessage = `✅ Requested ${quantity} units of "${selectedItem.item_name}" for ${project} • ${property} on ${startDate
          .toISOString()
          .split('T')[0]}.`;
        if (response.data.note) baseMessage += `\n\n⚠️ ${response.data.note}`;
        setDialogMessage(baseMessage);
      } else {
        trackUI({
          screen: 'MasterItems',
          element: 'request_inventory',
          action: 'fail',
          extra: { reason: 'success_false', duration_ms: durationMs },
        });
        setDialogMessage('❌ Failed to request inventory. Please try again.');
      }
    } catch (error: any) {
      const durationMs = Date.now() - startedAt;

      let backendError = '❌ An error occurred while processing the request.';
      const detail = error?.response?.data?.detail;
      if (typeof detail === 'string') backendError = detail;
      else if (Array.isArray(detail)) backendError = detail.map((d) => `• ${d.msg}`).join('\n');
      else if (typeof detail === 'object' && detail?.msg) backendError = detail.msg;

      trackNetwork({
        url,
        method: 'POST',
        status: error?.response?.status,
        durationMs,
        ok: false,
        extra: {
          screen: 'MasterItems',
          error_message: error?.message ?? 'unknown_error',
          backend_detail: typeof detail === 'string' ? detail : null,
        },
      });

      trackUI({
        screen: 'MasterItems',
        element: 'request_inventory',
        action: 'error',
        extra: {
          duration_ms: durationMs,
          message: error?.message ?? 'unknown_error',
          status: error?.response?.status ?? null,
        },
      });

      setDialogMessage(backendError);
    }

    setModalVisible(false);
    setIsDialogVisible(true);
  };

  // ----------------- Renderers -----------------
  const renderTypePill = (t?: string) => (
    <View style={styles.typePill}>
      <TText style={styles.typePillText}>{(t || '').toUpperCase()}</TText>
    </View>
  );

  const renderLowStock = (minimum: number, qty: number) => {
    if (typeof minimum !== 'number' || typeof qty !== 'number') return null;
    if (qty <= minimum) {
      return (
        <View style={styles.lowStockBadge}>
          <Ionicons name="alert-circle" size={12} color="#b30000" />
          <TText style={styles.lowStockText}>Low</TText>
        </View>
      );
    }
    return null;
  };

  const renderItem = ({ item }: { item: Item }) => {
    const checked = !!selectedItemsMap[item.item_id || ''];
    return (
      <TouchableOpacity
        onPress={() => toggleItemSelection(item.item_id || '')}
        activeOpacity={0.8}
      >
        <View style={[styles.card, checked && styles.cardSelected]}>
          <View style={styles.cardHeader}>
            <View style={styles.checkboxRow}>
              <Ionicons
                name={checked ? 'checkbox' : 'square-outline'}
                size={22}
                color={checked ? '#2563EB' : '#94A3B8'}
              />
              <Ionicons name="cube-outline" size={16} color="#64748B" style={styles.nameIcon} />
              <View style={{ flex: 1 }}>
                <TText style={styles.itemTitle} numberOfLines={2}>
                  {item.item_name}
                </TText>
                <TText style={styles.itemTypeText} numberOfLines={1}>
                  {item.item_type}
                  <TText style={styles.metaLabel}>  Qty - </TText>
                  <TText style={styles.metaValue}>{item.quantity ?? 0}</TText>
                  <TText style={styles.metaLabel}>  Min - </TText>
                  <TText style={styles.metaValue}>{item.minimum_quantity ?? 0}</TText>
                </TText>
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const keyExtractor = (item: Item, index: number) => item.item_id || `${item.id}_${index}`;

  // backend already does type filter; just use items
  const finalFilteredItems = items;

  // ----------------- UI -----------------
  if (isLoading && !isRefreshing && items.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <TText style={styles.loadingText}>Loading items…</TText>
      </View>
    );
  }

  return (
    <View style={styles.root} testID="master-items-root">
      {/* Sticky Top Bar */}
      <View style={styles.topBar}>
        <View style={styles.topLeft}>
          <TouchableOpacity
            onPress={() => {
              trackUI({ screen: 'MasterItems', element: 'header_back', action: 'click', extra: {} });
              if (router.canGoBack()) router.back();
              else router.push('/HomeScreen');
            }}
            style={styles.navBtn}
          >
            <Ionicons name="arrow-back" size={22} color="#0F172A" />
          </TouchableOpacity>
          <TText style={styles.screenTitle}>Master Items</TText>
        </View>

        <TouchableOpacity
          onPress={() => {
            trackUI({ screen: 'MasterItems', element: 'header_home', action: 'click', extra: {} });
            router.push('/HomeScreen');
          }}
          style={styles.navBtn}
        >
          <Ionicons name="home" size={22} color="#0F172A" />
        </TouchableOpacity>
      </View>

      {/* Search (80%) + Filter (10%) + Add (10%) */}
      <View style={styles.searchRow}>
        <View style={[styles.searchBox, styles.flex80]}>
          <Ionicons name="search" size={18} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search items by name or type"
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={handleSearch}
          />
          {searchQuery ? (
            <TouchableOpacity
              onPress={() => {
                trackUI({ screen: 'MasterItems', element: 'search_clear', action: 'click', extra: {} });
                setSearchQuery('');
              }}
            >
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Filter 10% */}
        <TouchableOpacity
          style={[styles.iconBtn, styles.flex10]}
          onPress={openFilterModal}
        >
          <Ionicons name="options" size={22} color="#0F172A" />
        </TouchableOpacity>

        {/* Add (Send selected) 10% */}
        <TouchableOpacity
          style={[styles.iconBtn, styles.flex10, !anySelected && styles.iconBtnDisabled]}
          disabled={!anySelected}
          onPress={() => {
            const selected = items.filter((i) => selectedItemsMap[i.item_id || '']);
            if (!selected.length) return;

            trackUI({
              screen: 'MasterItems',
              element: 'nav_multiple_request',
              action: 'open',
              extra: {
                selected_count: selected.length,
                item_type_filter: selectedItemType,
                q: debouncedQuery?.trim?.() ?? '',
              },
            });

            router.push({
              pathname: '/MultipleRequestMasterItem',
              params: {
                items: encodeURIComponent(JSON.stringify(selected)),
                employee_details: encodeURIComponent(JSON.stringify(params)),
              },
            });
          }}
        >
          <Ionicons name="add-outline" size={22} color={anySelected ? '#0F172A' : '#A3A3A3'} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {finalFilteredItems.length === 0 && debouncedQuery.trim() ? (
        <View style={styles.emptyCreateWrap}>
          <TText>No Items Found</TText>
        </View>
      ) : (
        <FlatList
          data={finalFilteredItems}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          numColumns={numColumns}
          contentContainerStyle={styles.listPad}
          columnWrapperStyle={numColumns > 1 ? styles.columnWrap : undefined}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="file-tray-outline" size={28} color="#94A3B8" />
              <TText style={styles.emptyText}>No items found</TText>
            </View>
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isLoadingMore ? (
              <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                <ActivityIndicator size="small" />
                <TText style={{ marginTop: 4, fontSize: 12, color: '#64748B' }}>
                  Loading more…
                </TText>
              </View>
            ) : null
          }
          onScrollBeginDrag={() =>
            trackUI({ screen: 'MasterItems', element: 'list_scroll', action: 'start', extra: {} })
          }
        />
      )}

      {/* Request / Block Modal */}
      {/* ... keep your modal code exactly as-is, but when user taps submit call handleRequestInventory()
          and log open/close if you want:
            - on open modal: trackUI({element:'request_modal', action:'open'})
            - on close modal: trackUI({element:'request_modal', action:'close'})
      */}
      <Modal transparent animationType="slide" visible={modalVisible}>
        {/* same as your code */}
      </Modal>

      <Modal visible={isDialogVisible} transparent animationType="fade">
        {/* same as your code */}
      </Modal>

      <ModalSelector
        style={styles.selectorWrap}
        selectStyle={styles.selectorSelect}
        initValueTextStyle={styles.selectorText}
        optionTextStyle={styles.selectorText}
        ref={modalSelectorRef}
        data={filterOptions}
        initValue={selectedItemType}
        onChange={(option: any) => handleFilterSelect(String(option.key))}
        cancelText="Cancel"
        visible={false}
        touchableActiveOpacity={0}
        childrenContainerStyle={{ display: 'none' }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  // ... your existing styles unchanged ...
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  topBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E2E8F0',
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navBtn: {
    height: 36,
    width: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  flex80: { flex: 8, minWidth: 0 },
  flex10: { flex: 1 },
  searchBox: {
    height: 42,
    borderRadius: 12,
    backgroundColor: '#EEF2F7',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    paddingVertical: 0,
  },
  iconBtn: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D8D8DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDisabled: { opacity: 0.5 },
  listPad: { paddingHorizontal: 8, paddingBottom: 24 },
  columnWrap: { gap: 8 },
  itemTypeText: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  card: {
    flex: 1,
    margin: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#F1F6FF',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, flex: 1 },
  itemTitle: { fontWeight: '800', fontSize: 14, color: '#0F172A', flex: 1, textTransform: 'capitalize' },
  nameIcon: { marginTop: 3, marginLeft: 6, marginRight: 6 },
  typePill: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  typePillText: { fontSize: 11, color: '#1E3A8A', fontWeight: '700' },
  lowStockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFE4E6',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  lowStockText: { fontSize: 11, color: '#b30000', fontWeight: '800' },
  metaLabel: { fontSize: 11, color: '#64748B', marginLeft: 10 },
  metaValue: { fontSize: 14, color: '#0F172A', fontWeight: '800' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 15, color: '#334155' },
  emptyState: { padding: 32, alignItems: 'center' },
  emptyText: { color: '#64748B', marginTop: 8, fontSize: 14 },
  emptyCreateWrap: { padding: 20, alignItems: 'center' },
  selectorWrap: { borderRadius: 10 },
  selectorSelect: { borderWidth: 0 },
  selectorText: { fontSize: 13, color: '#0F172A' },
});

export default MasterItems;
