import { emoji3dUrl, type Emoji3DName } from '../../lib/emoji3d';
import { cn } from './primitives';

/** 3D obrázek (Fluent Emoji 3D). Dekorativní – bez `alt` je pro čtečky skrytý. */
export function Emoji3D({ name, size = 40, alt, className, eager = false }: { name: Emoji3DName; size?: number; alt?: string; className?: string; eager?: boolean }) {
  return (
    <img
      src={emoji3dUrl(name)}
      width={size}
      height={size}
      alt={alt ?? ''}
      aria-hidden={alt ? undefined : true}
      draggable={false}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={cn('pointer-events-none shrink-0 select-none object-contain', className)}
      style={{ width: size, height: size }}
    />
  );
}
