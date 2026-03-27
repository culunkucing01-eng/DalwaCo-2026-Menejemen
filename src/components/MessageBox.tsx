import { useAppState } from '@/lib/store';
import { X, CheckCircle2 } from 'lucide-react';

export default function MessageBox() {
  const { systemMessage, setSystemMessage } = useAppState();
  if (!systemMessage) return null;

  const isSuccess = systemMessage.startsWith('Berhasil');

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 z-50 animate-fade-in">
      <div className={`flex items-center gap-3 px-5 py-4 rounded-2xl shadow-lg border ${isSuccess ? 'bg-success/10 border-success/30 text-success' : 'bg-warning/10 border-warning/30 text-warning'}`}>
        <CheckCircle2 size={18} />
        <p className="text-sm font-semibold max-w-sm">{systemMessage}</p>
        <button onClick={() => setSystemMessage(null)} className="ml-2 hover:opacity-70">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
