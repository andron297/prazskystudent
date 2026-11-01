import { File, FileArchive, FileImage, FilePlay, FileSpreadsheet, FileText, FolderOpen, Link2, NotebookPen, Presentation, type LucideIcon } from 'lucide-react';
import type { Material } from '../../types';

export interface MaterialVisual {
  icon: LucideIcon;
  text: string;
  bg: string;
  label: string;
}

function extension(m: Material): string {
  return (m.fileName ?? m.title).split('.').pop()?.toLowerCase() ?? '';
}

/** Ikona a barva podle typu materiálu (prezentace, PDF, tabulka, odkaz…). */
export function materialVisual(m: Material): MaterialVisual {
  if (m.kind === 'note') return { icon: NotebookPen, text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/12', label: 'Poznámka' };
  if (m.kind === 'link' || m.kind === 'moodle-link') {
    const url = m.url ?? '';
    if (url.includes('docs.google.com')) return { icon: FileText, text: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/12', label: 'Google Docs' };
    if (url.includes('drive.google.com')) return { icon: FolderOpen, text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/12', label: 'Google Drive' };
    if (/youtube\.com|youtu\.be/.test(url)) return { icon: FilePlay, text: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/12', label: 'Video' };
    return { icon: Link2, text: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-500/12', label: 'Odkaz' };
  }
  const mime = m.mimeType ?? '';
  const ext = extension(m);
  if (ext === 'pptx' || ext === 'ppt' || mime.includes('presentation')) return { icon: Presentation, text: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/12', label: 'Prezentace' };
  if (ext === 'pdf' || mime === 'application/pdf') return { icon: FileText, text: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/12', label: 'PDF' };
  if (['xlsx', 'xls', 'csv', 'ods'].includes(ext) || mime.includes('spreadsheet') || mime === 'text/csv') return { icon: FileSpreadsheet, text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/12', label: 'Tabulka' };
  if (['docx', 'doc', 'odt', 'rtf', 'txt', 'md'].includes(ext) || mime.includes('word')) return { icon: FileText, text: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/12', label: 'Dokument' };
  if (['zip', 'rar', '7z'].includes(ext)) return { icon: FileArchive, text: 'text-zinc-600 dark:text-zinc-300', bg: 'bg-zinc-500/12', label: 'Archiv' };
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return { icon: FileImage, text: 'text-fuchsia-600 dark:text-fuchsia-400', bg: 'bg-fuchsia-500/12', label: 'Obrázek' };
  if (mime.startsWith('video/') || ['mp4', 'mov', 'webm'].includes(ext)) return { icon: FilePlay, text: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/12', label: 'Video' };
  return { icon: File, text: 'text-zinc-600 dark:text-zinc-300', bg: 'bg-zinc-500/12', label: 'Soubor' };
}
