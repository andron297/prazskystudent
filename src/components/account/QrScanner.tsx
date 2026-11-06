/**
 * Čtečka QR kódu fotoaparátem přímo v aplikaci (hodí se hlavně v nainstalované
 * aplikaci na iPhonu, kde odkaz z Fotoaparátu otevře Safari, ne aplikaci).
 * Používá vestavěný BarcodeDetector, jinak knihovnu jsQR (načte se až tady).
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { CameraOff, X } from 'lucide-react';

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: { new (options: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };
  }
}

export function QrScanner({ onResult, onClose, title = 'Namiřte na QR kód', hint }: { onResult: (text: string) => boolean; onClose: () => void; title?: string; hint?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [wrong, setWrong] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Tento prohlížeč neumí použít fotoaparát. Naskenujte kód aplikací Fotoaparát v telefonu.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      } catch (e) {
        const name = (e as DOMException)?.name;
        setError(name === 'NotAllowedError' ? 'Fotoaparát není povolený. Povolte ho v nastavení prohlížeče, nebo naskenujte kód aplikací Fotoaparát.' : 'Fotoaparát se nepodařilo spustit.');
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);

      let detector: Detector | null = null;
      if (window.BarcodeDetector) {
        try {
          const formats = (await window.BarcodeDetector.getSupportedFormats?.()) ?? ['qr_code'];
          if (formats.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        } catch {
          detector = null;
        }
      }
      const jsQR = detector ? null : (await import('jsqr')).default;

      const tick = async () => {
        if (stopped) return;
        const v = videoRef.current;
        if (v && v.readyState >= 2 && v.videoWidth > 0) {
          let text: string | null = null;
          try {
            if (detector) {
              const codes = await detector.detect(v);
              text = codes[0]?.rawValue ?? null;
            } else if (jsQR && ctx) {
              const scale = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
              canvas.width = Math.round(v.videoWidth * scale);
              canvas.height = Math.round(v.videoHeight * scale);
              ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              text = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
            }
          } catch {
            text = null;
          }
          if (text) {
            if (onResult(text)) {
              stopped = true;
              return;
            }
            setWrong(true);
            setTimeout(() => setWrong(false), 1800);
          }
        }
        timer = setTimeout(() => void tick(), 220);
      };
      void tick();
    };
    void start();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[120] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={title}>
      <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_0,transparent_34%,rgb(0_0_0/0.6)_35%)]" />
      <div className="relative flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="text-[16px] font-bold drop-shadow">{title}</p>
        <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full bg-white/15 backdrop-blur hover:bg-white/25" aria-label="Zavřít čtečku">
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <div className="relative grid flex-1 place-items-center">
        {error ? (
          <div className="mx-6 max-w-sm rounded-[22px] bg-white/10 p-5 text-center backdrop-blur">
            <CameraOff className="mx-auto size-8" aria-hidden />
            <p className="mt-3 text-[14.5px] leading-relaxed">{error}</p>
            <button type="button" onClick={onClose} className="mt-4 rounded-full bg-white px-5 py-2.5 text-[14px] font-bold text-black">
              Zavřít
            </button>
          </div>
        ) : (
          <div className="relative size-[68vmin] max-h-[340px] max-w-[340px]">
            {(['left-0 top-0 border-l-4 border-t-4 rounded-tl-[22px]', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-[22px]', 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-[22px]', 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-[22px]'] as const).map((c) => (
              <span key={c} className={`absolute size-12 border-white ${c}`} />
            ))}
            <motion.span className="absolute inset-x-4 h-[2px] rounded-full bg-[#a8c79f] shadow-[0_0_12px_#a8c79f]" initial={{ top: '12%' }} animate={{ top: ['12%', '88%', '12%'] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }} />
          </div>
        )}
      </div>
      <p className="relative px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-[14px] leading-relaxed text-white/85">{wrong ? 'Tohle není kód pro propojení se Stihnu.' : (hint ?? 'Kód najdete na počítači v Účtu → Propojit telefon.')}</p>
    </motion.div>,
    document.body,
  );
}
