/**
 * Real-time Bidirectional Nurse <-> Patient Messaging Component
 * - Reads & inserts from Supabase `patient_messages`
 * - Subscribes to live Realtime updates
 * - Sends persistent DB notification to counterpart on new message
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabase } from '../../lib/supabaseClient';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { PatientMessage, UserRole } from '../../types/database';
import { createNotification } from '../../lib/notifications';
import { Send, MessageSquare, RefreshCw, AlertCircle } from 'lucide-react';

interface PatientNurseChatProps {
  patientId: string;
  nurseId: string;
  currentUserId: string;
  currentUserRole: UserRole;
  currentUserName: string;
  counterpartName: string;
  isDemoMode?: boolean;
}

export const PatientNurseChat: React.FC<PatientNurseChatProps> = ({
  patientId,
  nurseId,
  currentUserId,
  currentUserRole,
  currentUserName,
  counterpartName,
  isDemoMode = false,
}) => {
  const [messages, setMessages] = useState<PatientMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    if (!patientId || !nurseId) return;
    if (isDemoMode) {
      setMessages([
        {
          id: 'demo-msg-1',
          patient_id: patientId,
          nurse_id: nurseId,
          sender_id: nurseId,
          sender_role: 'nurse',
          message: 'Halo, bagaimana kondisi luka operasi dan rasa nyeri hari ini? Jangan lupa isi pemantauan rutin ya.',
          is_read: true,
          created_at: new Date(Date.now() - 3600000).toISOString(),
        },
      ]);
      setLoading(false);
      return;
    }

    const supabase = getSupabase();
    try {
      const { data, error } = await supabase
        .from('patient_messages')
        .select('*')
        .eq('patient_id', patientId)
        .eq('nurse_id', nurseId)
        .order('created_at', { ascending: true });

      if (error) {
        setErrorMsg(
          error.message.includes('does not exist')
            ? 'Tabel `patient_messages` belum tersedia. Jalankan skrip migrasi SQL di folder `supabase/migrations`.'
            : `Gagal memuat pesan: ${error.message}`
        );
      } else {
        setErrorMsg(null);
        const rows = (data as PatientMessage[]) || [];
        setMessages(rows);

        const hasUnreadIncoming = rows.some(
          (m) => m.sender_id !== currentUserId && !m.is_read
        );
        if (hasUnreadIncoming) {
          await supabase
            .from('patient_messages')
            .update({ is_read: true })
            .eq('patient_id', patientId)
            .eq('nurse_id', nurseId)
            .neq('sender_id', currentUserId)
            .eq('is_read', false);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memuat percakapan.');
    } finally {
      setLoading(false);
    }
  }, [patientId, nurseId, currentUserId, isDemoMode]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useRealtimeSubscription(
    `chat-${patientId}-${nurseId}`,
    [{ table: 'patient_messages', filter: `patient_id=eq.${patientId}` }],
    fetchMessages,
    Boolean(patientId && nurseId && !isDemoMode)
  );

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    const clean = text.trim();
    if (!clean) return;

    if (isDemoMode) {
      setMessages((prev) => [
        ...prev,
        {
          id: `demo-${Date.now()}`,
          patient_id: patientId,
          nurse_id: nurseId,
          sender_id: currentUserId,
          sender_role: currentUserRole,
          message: clean,
          is_read: false,
          created_at: new Date().toISOString(),
        },
      ]);
      setText('');
      return;
    }

    setSending(true);
    setErrorMsg(null);
    const supabase = getSupabase();
    try {
      const { error } = await supabase.from('patient_messages').insert({
        patient_id: patientId,
        nurse_id: nurseId,
        sender_id: currentUserId,
        sender_role: currentUserRole,
        message: clean,
      });

      if (error) {
        setErrorMsg(`Gagal mengirim pesan: ${error.message}`);
        return;
      }

      setText('');
      await fetchMessages();

      const recipientId = currentUserRole === 'nurse' ? patientId : nurseId;
      const recipientRole: UserRole = currentUserRole === 'nurse' ? 'patient' : 'nurse';
      await createNotification({
        userId: recipientId,
        role: recipientRole,
        title: `Pesan Baru dari ${currentUserName}`,
        message: clean.length > 80 ? `${clean.slice(0, 80)}...` : clean,
        type: 'system',
        linkTarget:
          recipientRole === 'nurse' ? `patient:${patientId}:messages` : 'tab:perawatan:messages',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 flex flex-col h-[460px] overflow-hidden">
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-teal-600" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Komunikasi dengan {counterpartName}
            </h3>
            <p className="text-[11px] text-slate-500">
              Pesan tersinkron real-time antara perawat dan pasien
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchMessages}
          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 rounded-lg"
          title="Muat ulang percakapan"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {errorMsg && (
        <div className="m-3 p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40">
        {loading ? (
          <div className="text-center text-xs text-slate-400 py-10">Memuat riwayat pesan...</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-xs text-slate-400 py-12 space-y-1">
            <MessageSquare className="w-7 h-7 mx-auto text-slate-300" />
            <p className="font-medium text-slate-600">Belum ada percakapan.</p>
            <p>Mulai kirim pesan konsultasi atau tindak lanjut pemulihan di bawah.</p>
          </div>
        ) : (
          messages.map((m) => {
            const isMine = m.sender_id === currentUserId;
            return (
              <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-xs space-y-1 shadow-2xs ${
                    isMine
                      ? 'bg-teal-600 text-white rounded-br-xs'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-bl-xs'
                  }`}
                >
                  <p className="leading-relaxed whitespace-pre-wrap">{m.message}</p>
                  <span
                    className={`block text-[10px] text-right ${
                      isMine ? 'text-teal-100' : 'text-slate-400'
                    }`}
                  >
                    {new Date(m.created_at).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="p-3 border-t border-slate-200 bg-white flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tulis pesan konsultasi atau instruksi perawatan..."
          className="flex-1 min-w-0 px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{sending ? '...' : 'Kirim'}</span>
        </button>
      </form>
    </div>
  );
};
