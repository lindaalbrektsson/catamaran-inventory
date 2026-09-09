import { Sailboat } from 'lucide-react';
import { dictionary,type Locale } from '@/lib/i18n';
export function Brand({locale,inverse=false}:{locale:Locale;inverse?:boolean}) {
  const t=dictionary(locale);
  return <div className="flex items-center gap-3"><span className={`grid size-11 place-items-center rounded-xl ${inverse?'bg-white/15 text-white':'bg-primary text-white'}`}><Sailboat className="size-6" aria-hidden="true"/></span><div><div className="text-lg font-semibold tracking-tight">{t.brand}</div><div className={`mt-0.5 text-[9px] tracking-[0.16em] ${inverse?'text-white/70':'text-muted-foreground'}`}>{t.brandSub}</div></div></div>;
}
