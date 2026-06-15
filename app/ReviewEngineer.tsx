import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  View, TouchableOpacity, StyleSheet, FlatList, TextInput, Dimensions, ActivityIndicator, RefreshControl } from "react-native";
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import ModalSelector from "@/components/AppModalSelect";
import { useSmartSearch } from '../hooks/useSmartSearch';

import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
// ✅ Telemetry
import {
  trackScreen,
  trackUI,
  trackNetwork,
  updateDynamicContext,
  clearDynamicContext,
} from '../utils/telemetry';
import { authenticatedFetch } from "../utils/auth";
import { useFontScale } from "@/context/FontScaleContext";
import TText from '@/components/TText';
import { ThemeProvider, useTheme } from "@/src/theme/ThemeProvider";

interface ApiTicket {
  property_id: any;
  issue_id: string;
  issue_type: string;
  description: string;
  status: string;
  assigned_to_email: string | null;
  assigned_to: string;
}

interface Ticket {
  ticketid: string;
  title: string;
  description: string;
  status: string;
  assignedto: string;          // comma-separated names
  assigned_to_codes: string[]; // employee codes
  reportedby: string;
  reported_by_code: string;
  propertyid: string;
  approximate_date: string;
}

interface FilterOption {
  key: string | number;
  label: string;
  section?: boolean;
}

type StatusUnion = 'All' | 'Open' | 'Request to close' | 'Closed' | 'Reopen';

const ICON_GREY = '#3A3A3C';
const TICKET_API_URL = `${APP_API_BASE_URL}/tickets/all`;

const ReviewEngineer: React.FC = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { theme } = useTheme();
  const C = theme.colors;
  const employeeCode = (params?.employee_code as string) || '';

  const [numColumns, setNumColumns] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const [selectedStatus, setSelectedStatus] = useState<StatusUnion>('All');
  const [selectedFilterKey, setSelectedFilterKey] = useState<string>('all');

  const statusModalRef = useRef<any>(null);
  const peopleModalRef = useRef<any>(null);

  // ✅ Telemetry: screen view + dynamic context
  useEffect(() => {
    updateDynamicContext({ screen: 'ReviewEngineer' });
    trackScreen('ReviewEngineer', {
      has_employee_code: !!employeeCode,
    });

    return () => {
      clearDynamicContext();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const simpleFilterOptions: FilterOption[] = [
    { key: 'all', label: 'All' },
    { key: 'reported_by_me', label: 'Reported By Me' },
    { key: 'assigned_to_me', label: 'Assigned To Me' },
  ];

  const statusOptions: FilterOption[] = [
    { key: 'All', label: 'ALL' },
    { key: 'Open', label: 'OPEN' },
    { key: 'Request to close', label: 'REQUEST TO CLOSE' },
    { key: 'Closed', label: 'CLOSED' },
    { key: 'Reopen', label: 'REOPEN' },
  ];

  // ---------- Fetch ----------
  const fetchTicketData = useCallback(async () => {
    const t0 = Date.now();

    // ✅ Telemetry: fetch attempt
    trackUI({
      screen: 'ReviewEngineer',
      element: 'fetch_tickets',
      action: 'open',
      extra: { url: '/tickets/all' },
    });

    try {
      setIsLoading(true);

      const response = await authenticatedFetch(TICKET_API_URL);

      let jsonData: any = null;
      try {
        jsonData = await response.json();
      } catch {
        jsonData = null;
      }

      const rawTickets = Array.isArray(jsonData?.tickets) ? jsonData.tickets : [];
      const ticketsCount = rawTickets.length;

      // ✅ Telemetry: network result
      trackNetwork({
        url: '/tickets/all',
        method: 'GET',
        status: response.status,
        ok: response.ok,
        durationMs: Date.now() - t0,
        extra: {
          tickets_received: ticketsCount,
        },
      });

      if (!response.ok) {
        setAllTickets([]);
        return;
      }

      if (ticketsCount > 0) {
        const updated: Ticket[] = rawTickets.map((item: any) => ({
          ticketid: String(item.issue_id),
          title: item.issue_type,
          description: item.description,
          status: String(item.status || ''),
          assignedto: Array.isArray(item.assigned_to)
            ? item.assigned_to.map((a: any) => a.assigned_to_employee_name).join(', ')
            : 'Not Assigned',
          assigned_to_codes: Array.isArray(item.assigned_to)
            ? item.assigned_to.map((a: any) => a.employee_code)
            : [],
          reportedby: item.reported_by_employee_name || item.reported_by_email || 'Unknown',
          reported_by_code: item.reported_by_employee_code || '',
          propertyid: String(item.property_id ?? ''),
          approximate_date: item.approximate_date || '',
        }));
        setAllTickets(updated);
      } else {
        setAllTickets([]);
      }

      trackUI({
        screen: 'ReviewEngineer',
        element: 'fetch_tickets_result',
        action: 'submit',
        extra: {
          ok: true,
          tickets_count: ticketsCount,
        },
      });
    } catch (e) {
      setAllTickets([]);

      trackNetwork({
        url: '/tickets/all',
        method: 'GET',
        ok: false,
        durationMs: Date.now() - t0,
        extra: { failed: true },
      });

      trackUI({
        screen: 'ReviewEngineer',
        element: 'fetch_tickets_result',
        action: 'submit',
        extra: { ok: false },
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    trackUI({
      screen: 'ReviewEngineer',
      element: 'pull_to_refresh',
      action: 'submit',
      extra: {},
    });

    try {
      setIsRefreshing(true);
      await fetchTicketData();
    } finally {
      setIsRefreshing(false);

      trackUI({
        screen: 'ReviewEngineer',
        element: 'pull_to_refresh_done',
        action: 'submit',
        extra: {},
      });
    }
  }, [fetchTicketData]);

  useFocusEffect(
    useCallback(() => {
      fetchTicketData();
    }, [fetchTicketData])
  );

  useEffect(() => {
    const handleResize = () => {
      const w = Dimensions.get('window').width;
      setNumColumns(w < 620 ? 1 : w < 980 ? 2 : 3);
    };
    handleResize();
    const sub = Dimensions.addEventListener('change', handleResize);
    return () => sub?.remove();
  }, []);

  // ---------- Colors ----------
  const getStatusBg = (status: string) => {
    switch ((status || '').toLowerCase()) {
      case 'open':
        return '#EAF6EE';
      case 'closed':
        return '#FCEBEC';
      case 'request to close':
        return '#FFF2E6';
      case 'reopen':
        return '#FFF9DB';
      default:
        return '#F1F2F4';
    }
  };
  const getStatusText = (status: string) => {
    switch ((status || '').toLowerCase()) {
      case 'open':
        return '#136A3A';
      case 'closed':
        return '#8E1B1B';
      case 'request to close':
        return '#B05A18';
      case 'reopen':
        return '#7A6907';
      default:
        return '#2E2E2E';
    }
  };

  // ---------- Filtering ----------
  const relevantToUser = useMemo(
    () =>
      allTickets.filter(
        (t) => t.reported_by_code === employeeCode || t.assigned_to_codes.includes(employeeCode)
      ),
    [allTickets, employeeCode]
  );

  const filteredByMine = useMemo(() => {
    if (selectedFilterKey === 'reported_by_me') {
      return relevantToUser.filter((t) => t.reported_by_code === employeeCode);
    }
    if (selectedFilterKey === 'assigned_to_me') {
      return relevantToUser.filter((t) => t.assigned_to_codes.includes(employeeCode));
    }
    return relevantToUser;
  }, [relevantToUser, selectedFilterKey, employeeCode]);

  const smartFiltered = useSmartSearch<Ticket>({
    data: filteredByMine,
    query: searchQuery,
    keys: ['title', 'description', 'assignedto', 'propertyid', 'ticketid'],
  });

  const finalFilteredData = useMemo(() => {
    if (selectedStatus === 'All') return smartFiltered;
    const wanted = selectedStatus.toLowerCase();
    return smartFiltered.filter((t) => (t.status || '').toLowerCase() === wanted);
  }, [smartFiltered, selectedStatus]);

  // ---------- UI Handlers ----------
  const handleTicketClick = (issueId: string, propertyId?: string) => {
    // ✅ Telemetry: ticket open (ids only)
    trackUI({
      screen: 'ReviewEngineer',
      element: 'ticket_open',
      action: 'open',
      extra: {
        issue_id: issueId,
        property_id: propertyId ?? '',
      },
    });

    router.push({
      pathname: '/TicketDetails',
      params: {
        issue_id: issueId,
        ...params,
      },
    });
  };

  // ---------- Render ----------
  const renderItem = useCallback(
    ({ item }: { item: Ticket }) => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const approx = item.approximate_date ? new Date(item.approximate_date) : null;
      if (approx) approx.setHours(0, 0, 0, 0);

      const isDelayed = !!approx && approx < today;
      const scheduleStatus = isDelayed ? 'Delayed' : 'On Track';
      const scheduleColor = isDelayed ? '#8E1B1B' : '#136A3A';
      const showScheduleChip = (item.status || '').toLowerCase() === 'open' && !!approx;

      return (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.9}
          onPress={() => handleTicketClick(item.ticketid, item.propertyid)}
        >
          <View style={styles.cardHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.titleRow}>
                <Ionicons name="ticket-outline" size={18} color={ICON_GREY} style={{ marginRight: 6 }} />
                <TText style={styles.cardTitle} numberOfLines={1}>{item.ticketid}</TText>
              </View>

              <View style={styles.metaRow}>
                <Ionicons name="list-circle-outline" size={16} color={ICON_GREY} />
                <TText style={styles.metaText} numberOfLines={1}>{item.title}</TText>
              </View>

              {!!item.propertyid && (
                <View style={styles.metaRow}>
                  <Ionicons name="home-outline" size={16} color={ICON_GREY} />
                  <TText style={styles.metaText}>Property: {item.propertyid}</TText>
                </View>
              )}

              {!!item.assignedto && (
                <View style={styles.metaRow}>
                  <Ionicons name="people-outline" size={16} color={ICON_GREY} />
                  <TText style={styles.metaText} numberOfLines={1}>
                    Assigned: {item.assignedto}
                  </TText>
                </View>
              )}

              {showScheduleChip && (
                <View style={[styles.schedulePill, { borderColor: scheduleColor }]}>
                  <TText style={[styles.schedulePillText, { color: scheduleColor }]}>
                    {scheduleStatus}
                  </TText>
                </View>
              )}
            </View>

            <View
              style={[
                styles.statusPill,
                { backgroundColor: getStatusBg(item.status), borderColor: getStatusText(item.status) },
              ]}
            >
              <TText style={[styles.statusPillText, { color: getStatusText(item.status) }]}>
                {(item.status || '').toUpperCase()}
              </TText>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [handleTicketClick]
  );

  const keyExtractor = useCallback((t: Ticket) => t.ticketid, []);

  const renderEmpty = useCallback(() => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="search-outline" size={28} color={ICON_GREY} />
        <TText style={styles.emptyTitle}>No tickets found</TText>
        <TText style={styles.emptyText}>Try different keywords or adjust filters.</TText>
      </View>
    );
  }, [isLoading]);

  // ---------- Loading ----------
  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={ICON_GREY} />
        <TText style={{ marginTop: 8, color: '#555' }}>Loading tickets…</TText>
      </View>
    );
  }

  // ---------- Screen ----------
  return (
    <View style={styles.container} testID="review-engineer-root">
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            trackUI({ screen: 'ReviewEngineer', element: 'header_back', action: 'click', extra: {} });
            router.back();
          }}
          style={styles.headerBtn}
        >
          <Ionicons name="arrow-back" size={22} color={ICON_GREY} />
        </TouchableOpacity>

        <TText style={styles.headerTitle}>Ticket List</TText>

        <TouchableOpacity
          onPress={() => {
            trackUI({ screen: 'ReviewEngineer', element: 'header_home', action: 'click', extra: {} });
            router.push('/HomeScreen');
          }}
          style={styles.headerBtn}
        >
          <Ionicons name="home-outline" size={22} color={ICON_GREY} />
        </TouchableOpacity>
      </View>

      {/* Controls */}
      <View style={styles.controlsBar}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={ICON_GREY} style={{ marginRight: 6 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by ID / title / description / property"
            placeholderTextColor="#7A7A7A"
            value={searchQuery}
            onChangeText={(t) => {
              setSearchQuery(t);
              trackUI({
                screen: 'ReviewEngineer',
                element: 'search_input',
                action: 'change',
                extra: { len: t.length },
              });
            }}
            autoCapitalize="none"
          />
          {!!searchQuery && (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                trackUI({
                  screen: 'ReviewEngineer',
                  element: 'search_clear',
                  action: 'click',
                  extra: {},
                });
              }}
            >
              <Ionicons name="close-circle" size={22} color="#5a5a5c" />
            </TouchableOpacity>
          )}
        </View>

        {/* People filter chip */}
        <TouchableOpacity
          style={styles.chipButton}
          onPress={() => {
            trackUI({
              screen: 'ReviewEngineer',
              element: 'people_filter_open',
              action: 'open',
              extra: { options: simpleFilterOptions.length },
            });
            peopleModalRef.current?.open();
          }}
        >
          <Ionicons name="person-circle-outline" size={22} color="#5a5a5c" />
        </TouchableOpacity>

        {/* Status filter chip */}
        <TouchableOpacity
          style={styles.chipButton}
          onPress={() => {
            trackUI({
              screen: 'ReviewEngineer',
              element: 'status_filter_open',
              action: 'open',
              extra: { options: statusOptions.length },
            });
            statusModalRef.current?.open();
          }}
        >
          <Ionicons name="options" size={22} color="#5a5a5c" />
        </TouchableOpacity>

        {/* Raise ticket chip */}
        <TouchableOpacity
          style={[styles.chipButton, styles.addBtn]}
          onPress={() => {
            trackUI({
              screen: 'ReviewEngineer',
              element: 'raise_ticket',
              action: 'open',
              extra: {},
            });

            router.push({
              pathname: '/RaiseIssue',
              params: {
                ...params,
                user_email: params.user_email,
                first_name: params.first_name,
              },
            });
          }}
        >
          <Ionicons name="add-outline" size={22} color="#5a5a5c" />
        </TouchableOpacity>

        {/* Hidden modals (triggered by chips) */}
        <ModalSelector
          ref={peopleModalRef}
          data={simpleFilterOptions}
          onChange={(option: any) => {
            if (!option.section) {
              const v = String(option.key);
              setSelectedFilterKey(v);

              trackUI({
                screen: 'ReviewEngineer',
                element: 'people_filter_select',
                action: 'toggle',
                extra: { value: v },
              });
            }
          }}
          style={{ position: 'absolute', top: -9999, left: -9999 }}
          selectStyle={{ borderWidth: 0 }}
          optionTextStyle={{ fontSize: 14, color: C.text }}
          optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
          cancelStyle={{ backgroundColor: C.surface }}
          cancelTextStyle={{ color: C.text }}
          overlayStyle={{ backgroundColor: C.overlay }}
          cancelText="Cancel"
        />

        <ModalSelector
          ref={statusModalRef}
          data={statusOptions}
          onChange={(option: any) => {
            const v = String(option.key) as StatusUnion;
            setSelectedStatus(v);

            trackUI({
              screen: 'ReviewEngineer',
              element: 'status_filter_select',
              action: 'toggle',
              extra: { value: v },
            });
          }}
          style={{ position: 'absolute', top: -9999, left: -9999 }}
          selectStyle={{ borderWidth: 0 }}
          optionTextStyle={{ fontSize: 14, color: C.text }}
          optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
          cancelStyle={{ backgroundColor: C.surface }}
          cancelTextStyle={{ color: C.text }}
          overlayStyle={{ backgroundColor: C.overlay }}
          cancelText="Cancel"
        />
      </View>

      {/* List */}
      <FlatList
        data={finalFilteredData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContainer}
        numColumns={numColumns}
        key={numColumns}
        ListEmptyComponent={renderEmpty}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F8' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#ECECEC',
    justifyContent: 'space-between',
  },
  headerBtn: { padding: 6, borderRadius: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1F1F1F' },

  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F1F3',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E3E3E6',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#191919',
    paddingVertical: 0,
  },

  chipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D8D8DB',
    borderRadius: 10,
  },
  addBtn: {
    backgroundColor: '#FAFAFB',
  },
  chipText: {
    fontSize: 12,
    color: '#2A2A2E',
    fontWeight: '600',
    flexShrink: 1,
  },

  listContainer: { paddingHorizontal: 8, paddingBottom: 16 },

  card: {
    flex: 1,
    margin: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E6E6E8',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, minWidth: 0 },
  cardTitle: { fontWeight: '700', fontSize: 14, color: '#1D1D1F', flexShrink: 1 },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  metaText: { fontSize: 13, color: '#2C2C2E', flexShrink: 1 },

  statusPill: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  statusPillText: { fontSize: 11, fontWeight: '700' },

  schedulePill: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  schedulePillText: {
    fontSize: 11,
    fontWeight: '700',
  },

  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  emptyWrap: { alignItems: 'center', paddingVertical: 40, gap: 6 },
  emptyTitle: { fontWeight: '700', color: '#2C2C2E', marginTop: 6 },
  emptyText: { color: '#6B6B6E', fontSize: 12 },
});

export default ReviewEngineer;
