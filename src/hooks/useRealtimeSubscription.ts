/**
 * Leak-free Supabase Realtime subscription hook for NurseGo
 */

import { useEffect, useRef } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from '../lib/supabaseClient';

export interface RealtimeTableSpec {
  table: string;
  event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
  filter?: string;
}

export function useRealtimeSubscription(
  channelName: string,
  tables: RealtimeTableSpec[],
  onDataChange: () => void,
  enabled: boolean = true
) {
  const callbackRef = useRef(onDataChange);
  callbackRef.current = onDataChange;

  const tablesKey = JSON.stringify(tables);

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured() || tables.length === 0) {
      return;
    }

    const supabase = getSupabase();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel: RealtimeChannel = supabase.channel(`${channelName}-${Math.random().toString(36).slice(2, 8)}`);

    const triggerRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        callbackRef.current();
      }, 250);
    };

    const parsedTables: RealtimeTableSpec[] = JSON.parse(tablesKey);
    parsedTables.forEach((spec) => {
      const config: any = {
        event: spec.event || '*',
        schema: 'public',
        table: spec.table,
      };
      if (spec.filter) {
        config.filter = spec.filter;
      }
      channel.on('postgres_changes', config, triggerRefresh);
    });

    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        console.warn(`Realtime channel error on ${channelName}`);
      }
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [channelName, tablesKey, enabled]);
}
