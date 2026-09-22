import React, { useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { getAuditLogs } from "@/services/systemLogApi";
import { formatVietnamDateTime } from "@/utils/timezone";

export interface AuditLogDto {
  id: number;
  userId: number;
  user?: { username: string; role: string; name: string };
  action: string;
  tableName: string;
  recordId: string;
  oldValues: string;
  newValues: string;
  timestamp: string;
  createdAt?: string;
  username?: string;
  userName?: string;
  entityName?: string;
  entityId?: string;
  details?: string;
  description?: string;
}

export default function SystemLogScreen() {
  const [logs, setLogs] = useState<AuditLogDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [selectedAction, setSelectedAction] = useState<string>("");

  const actionFilterOptions = [
    { label: "Tất cả", value: "" },
    { label: "Tài khoản", value: "USER" },
    { label: "Bán hàng", value: "SALE" },
    { label: "Nhập kho", value: "RECEIPT" },
    { label: "Đăng nhập", value: "LOGIN" },
  ];

  const currentRequestId = React.useRef(0);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  const loadLogs = async (pageNum = 1, append = false, actionFilter = selectedAction) => {
    // Increment request ID
    currentRequestId.current += 1;
    const seqId = currentRequestId.current;

    // Abort previous request if exists
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    const newController = new AbortController();
    abortControllerRef.current = newController;

    setIsLoading(true);
    try {
      const res = await getAuditLogs(pageNum, 20, actionFilter, newController.signal);

      // Check sequence ID
      if (seqId !== currentRequestId.current) {
          console.log(`[SystemLog] Ignored stale response for reqId ${seqId}`);
          return;
      }

      if (res.isSuccess) {
        const rawData = res.data;
        const fetchedLogs = Array.isArray(rawData) ? rawData : (rawData?.data || rawData?.items || []);

        if (append) {
          setLogs(prev => [...prev, ...fetchedLogs]);
        } else {
          setLogs(fetchedLogs);
        }
        setHasMore(fetchedLogs.length === 20);
        setPage(pageNum);
      }
    } catch (error: any) {
      if (error?.name === 'CanceledError' || error?.message === 'canceled') {
          console.log(`[SystemLog] Request cancelled (reqId ${seqId})`);
      } else {
          console.error("[Admin] Lỗi lấy nhật ký:", error);
      }
    } finally {
      if (seqId === currentRequestId.current) {
          setIsLoading(false);
      }
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadLogs(1, false, selectedAction);
    }, [selectedAction])
  );

  const handleFilterChange = (actionVal: string) => {
    setSelectedAction(actionVal);
    setPage(1);
    loadLogs(1, false, actionVal);
  };

  const handleLoadMore = () => {
    if (!isLoading && hasMore) {
      loadLogs(page + 1, true, selectedAction);
    }
  };


  const getActionColor = (action: string) => {
    const act = action?.toUpperCase() || "";
    if (act.includes('LOGIN')) return 'text-blue-700';
    if (act.includes('CREATE') || act.includes('ADD')) return 'text-green-700';
    if (act.includes('UPDATE') || act.includes('TOGGLE')) return 'text-orange-700';
    if (act.includes('DELETE') || act.includes('REMOVE')) return 'text-red-700';
    if (act.includes('SALE') || act.includes('ORDER')) return 'text-purple-700';
    if (act.includes('RECEIPT')) return 'text-teal-700';
    return 'text-black';
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 bg-white border-b-4 border-black">
        <View className="flex-row justify-between items-center mb-1">
          <View>
            <Text className="font-serif text-2xl sm:text-3xl font-black text-black tracking-tight uppercase">
              Nhật ký hệ thống
            </Text>
            <Text className="mt-0.5 text-[10px] sm:text-[11px] tracking-widest text-neutral-600 uppercase">
              Audit Logs (Lịch sử hoạt động)
            </Text>
          </View>
        </View>

        {/* Action Filter Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2 flex-row">
          {actionFilterOptions.map(opt => {
            const isSelected = selectedAction === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => handleFilterChange(opt.value)}
                className={`border-2 border-black px-4 py-1.5 mr-2 ${isSelected ? 'bg-black' : 'bg-white'}`}
              >
                <Text className={`font-bold text-xs uppercase tracking-wider ${isSelected ? 'text-white' : 'text-black'}`}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={logs}
        keyExtractor={(item, index) => item.id?.toString() || index.toString()}
        refreshControl={<RefreshControl refreshing={isLoading && page === 1} onRefresh={() => loadLogs(1, false)} tintColor="#000" />}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        renderItem={({ item }) => (
          <View className="bg-white p-4 mb-4 border-2 border-black">
            <View className="flex-row justify-between items-center mb-2 pb-2 border-b-2 border-black">
              <Text className={`font-black uppercase tracking-widest text-xs ${getActionColor(item.action)}`}>
                {item.action}
              </Text>
              <Text className="text-gray-500 font-mono text-xs">{formatVietnamDateTime(item.timestamp || item.createdAt || "")}</Text>
            </View>

            <View className="flex-row items-center mb-2 flex-wrap">
              <Ionicons name="person" size={14} color="#000" />
              <Text className="text-black font-bold ml-1 text-xs">User: {item.username || item.userName || "Hệ thống"}</Text>
              {item.entityName && (
                <>
                  <Text className="mx-2 text-gray-400">|</Text>
                  <Text className="text-black font-bold text-xs">Đối tượng: {item.entityName} (ID: {item.entityId})</Text>
                </>
              )}
            </View>

            <View className="bg-gray-100 p-2.5 border-l-2 border-black">
              <Text className="text-black italic text-xs leading-5">
                {item.details || item.description || "Không có mô tả chi tiết"}
              </Text>
            </View>
          </View>
        )}
        ListFooterComponent={
          isLoading && page > 1 ? <ActivityIndicator size="small" color="#000" className="my-4" /> : null
        }
        ListEmptyComponent={
          !isLoading ? (
            <View className="items-center justify-center mt-20">
              <Ionicons name="list-outline" size={48} color="#525252" />
              <View style={{ width: 40, height: 2, backgroundColor: '#000', marginVertical: 12 }} />
              <Text className="font-bold text-lg text-black">Chưa có nhật ký hoạt động nào</Text>
            </View>
          ) : <ActivityIndicator size="large" color="#000" className="mt-20" />
        }
      />
    </SafeAreaView>
  );
}
