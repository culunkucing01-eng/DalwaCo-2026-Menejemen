import { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, MapPin, CheckCircle2, RefreshCw, Loader2 } from 'lucide-react';
import { uploadAttendancePhoto } from '@/lib/attendance';

interface AbsensiViewProps {
  onComplete: () => void;
  store: string;
}

export default function AbsensiView({ onComplete, store }: AbsensiViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [selfieData, setSelfieData] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch {
      setCameraError('Tidak dapat mengakses kamera. Pastikan izin kamera diaktifkan.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }, [stream]);

  const captureSelfie = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      setSelfieData(dataUrl);
      stopCamera();
    }
  };

  const getLocation = () => {
    setLocationLoading(true);
    setLocationError(null);
    if (!navigator.geolocation) {
      setLocationError('Geolocation tidak didukung browser ini.');
      setLocationLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationLoading(false);
      },
      (err) => {
        setLocationError(`Gagal mendapatkan lokasi: ${err.message}`);
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  useEffect(() => {
    startCamera();
    return () => {};
  }, [startCamera]);

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  const canSubmit = selfieData && location && !uploading;

  const handleSubmit = async () => {
    if (!selfieData || !location) return;
    setUploading(true);
    try {
      await uploadAttendancePhoto(selfieData, 'Kasir Toko', store, location);
      stopCamera();
      onComplete();
    } catch (err) {
      console.error('Upload error:', err);
      setUploading(false);
    }
  };

  const retakeSelfie = () => {
    setSelfieData(null);
    startCamera();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold text-foreground">Absensi Masuk</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {store} · {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
          </p>
        </div>

        {/* Step 1: Selfie */}
        <div className="rounded-2xl border border-border bg-card p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${selfieData ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
              {selfieData ? <CheckCircle2 size={16} /> : '1'}
            </div>
            <div>
              <p className="font-bold text-sm text-foreground">Foto Selfie</p>
              <p className="text-xs text-muted-foreground">Foto akan disimpan ke Firebase Storage</p>
            </div>
          </div>

          {cameraError ? (
            <div className="text-center py-8">
              <Camera size={32} className="mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-destructive">{cameraError}</p>
              <button onClick={startCamera} className="mt-3 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
                Coba Lagi
              </button>
            </div>
          ) : !selfieData ? (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden bg-foreground/5 aspect-[4/3]">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-40 h-48 rounded-full border-2 border-dashed border-secondary/60" />
                </div>
              </div>
              <button onClick={captureSelfie} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
                <Camera size={16} /> Ambil Foto
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden aspect-[4/3]">
                <img src={selfieData} alt="Selfie" className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                <div className="absolute top-2 right-2">
                  <span className="px-2 py-1 rounded-lg bg-success/90 text-success-foreground text-[10px] font-bold">✓ Captured</span>
                </div>
              </div>
              <button onClick={retakeSelfie} className="w-full py-2.5 rounded-xl bg-card border border-border text-foreground font-bold text-sm flex items-center justify-center gap-2 hover:bg-muted transition-colors">
                <RefreshCw size={14} /> Ambil Ulang
              </button>
            </div>
          )}
        </div>

        {/* Step 2: GPS */}
        <div className="rounded-2xl border border-border bg-card p-5 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${location ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
              {location ? <CheckCircle2 size={16} /> : '2'}
            </div>
            <div>
              <p className="font-bold text-sm text-foreground">Lokasi GPS</p>
              <p className="text-xs text-muted-foreground">Verifikasi lokasi kehadiran di toko</p>
            </div>
          </div>

          {location ? (
            <div className="p-4 rounded-xl bg-success/5 border border-success/20">
              <div className="flex items-center gap-2 text-success font-semibold text-sm mb-1">
                <MapPin size={14} /> Lokasi Terdeteksi
              </div>
              <p className="text-xs text-muted-foreground">
                Lat: {location.lat.toFixed(6)} | Lng: {location.lng.toFixed(6)}
              </p>
              <button onClick={getLocation} className="mt-2 text-xs text-primary font-semibold flex items-center gap-1 hover:underline">
                <RefreshCw size={10} /> Refresh Lokasi
              </button>
            </div>
          ) : (
            <div className="text-center">
              {locationError && <p className="text-xs text-destructive mb-3">{locationError}</p>}
              <button onClick={getLocation} disabled={locationLoading} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50">
                {locationLoading ? (
                  <><RefreshCw size={14} className="animate-spin" /> Mendeteksi...</>
                ) : (
                  <><MapPin size={16} /> Deteksi Lokasi Saya</>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Submit */}
        <button onClick={handleSubmit} disabled={!canSubmit} className="w-full py-4 rounded-2xl bg-success text-success-foreground font-bold text-base flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed">
          {uploading ? (
            <><Loader2 size={18} className="animate-spin" /> Mengunggah Foto...</>
          ) : (
            <><CheckCircle2 size={18} /> Mulai Shift Sekarang</>
          )}
        </button>

        {!canSubmit && !uploading && (
          <p className="text-center text-[11px] text-muted-foreground mt-3">
            Selesaikan foto selfie dan deteksi lokasi untuk memulai shift.
          </p>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
