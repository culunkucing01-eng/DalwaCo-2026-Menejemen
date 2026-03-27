import { useState, useEffect, useRef, useCallback } from 'react';
import { subscribeStockChats, firestoreAddStockChat, type StockChat } from '@/lib/firestore';
import { useAppState } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import { Send, MessageCircle, X, Loader2 } from 'lucide-react';
import { playChatSound } from '@/lib/notification-sounds';

interface ChatPanelProps {
  requestId: string;
  onClose: () => void;
  title?: string;
}

export default function ChatPanel({ requestId, onClose, title }: ChatPanelProps) {
  const { currentRole } = useAppState();
  const { profile } = useAuth();
  const [messages, setMessages] = useState<StockChat[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevMsgCount = useRef(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    prevMsgCount.current = 0;
    const unsub = subscribeStockChats(
      requestId,
      (data) => {
        // Play sound for new incoming messages (not from self, not initial load)
        if (prevMsgCount.current > 0 && data.length > prevMsgCount.current) {
          const latest = data[data.length - 1];
          if (latest && latest.sender_role !== currentRole) {
            playChatSound();
          }
        }
        prevMsgCount.current = data.length;
        setMessages(data);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Chat error:', err);
        setError('Gagal memuat chat. Coba tutup & buka kembali.');
        setLoading(false);
      }
    );
    return unsub;
  }, [requestId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = newMsg.trim();
    if (!text || sending) return;
    
    setSending(true);
    setNewMsg('');
    
    try {
      await firestoreAddStockChat({
        request_id: requestId,
        sender_name: profile?.displayName || currentRole || 'Unknown',
        sender_role: currentRole || 'Unknown',
        message: text,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Send chat error:', e);
      setNewMsg(text); // restore message on failure
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [newMsg, sending, requestId, profile, currentRole]);

  const isMe = (msg: StockChat) => msg.sender_role === currentRole;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <MessageCircle size={16} className="text-primary" />
          <span className="text-sm font-bold text-foreground">{title || 'Chat'}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted transition-colors">
          <X size={16} className="text-muted-foreground" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] max-h-[400px]">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        )}
        {error && (
          <div className="text-center py-4">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}
        {!loading && !error && messages.length === 0 && (
          <div className="text-center py-8">
            <MessageCircle size={28} className="mx-auto text-muted-foreground/20 mb-2" />
            <p className="text-xs text-muted-foreground">Belum ada pesan. Mulai diskusi!</p>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${isMe(msg) ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
              isMe(msg)
                ? 'bg-primary text-primary-foreground rounded-br-md'
                : 'bg-muted text-foreground rounded-bl-md'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold ${isMe(msg) ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                  {msg.sender_name}
                </span>
                <span className={`text-[9px] ${isMe(msg) ? 'text-primary-foreground/50' : 'text-muted-foreground/60'}`}>
                  {msg.sender_role}
                </span>
              </div>
              <p className="text-xs leading-relaxed">{msg.message}</p>
              <p className={`text-[9px] mt-1 ${isMe(msg) ? 'text-primary-foreground/40' : 'text-muted-foreground/50'}`}>
                {new Date(msg.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border bg-muted/20">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            className="input-field text-xs flex-1"
            placeholder="Ketik pesan..."
            value={newMsg}
            onChange={e => setNewMsg(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            disabled={!!error}
          />
          <button
            onClick={handleSend}
            disabled={sending || !newMsg.trim() || !!error}
            className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1"
          >
            {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          </button>
        </div>
      </div>
    </div>
  );
}
