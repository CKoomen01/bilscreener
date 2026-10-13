import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { ChevronDown, CircleAlert, CircleCheck, CircleX, Info, Star, X } from "lucide-react";
import { VERDICT } from "../lib/analysis.js";

const V_ICON = { topp: Star, godt: CircleCheck, ok: CircleAlert, svak: CircleX };

export function VerdictBadge({ verdict, score, small, className = "" }) {
  const v = VERDICT[verdict];
  if (!v) return null;
  const Icon = V_ICON[verdict];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border font-semibold ${v.cls} ${small ? "px-1.5 py-0 text-[11px]" : "px-2 py-0.5 text-xs"} ${className}`}
      title={score != null ? `Score ${score} av 100` : undefined}>
      <Icon className={small ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden />
      {v.label}
      {score != null && <span className="num font-normal opacity-75">{score}</span>}
    </span>
  );
}

/** Horisontal score-stolpe 0–100 */
export function ScoreBar({ value, label }) {
  const v = Math.round(value ?? 0);
  const color = v >= 60 ? "bg-good" : v >= 45 ? "bg-warn" : "bg-bad";
  return (
    <div className="flex items-center gap-2 text-xs">
      {label && <span className="w-24 shrink-0 text-ink2">{label}</span>}
      <span className="relative h-1.5 flex-1 rounded-full bg-line">
        <span className={`absolute inset-y-0 left-0 rounded-full ${color}`} style={{ width: `${v}%` }} />
      </span>
      <span className="num w-7 text-right font-medium text-ink">{v}</span>
    </div>
  );
}

marked.setOptions({ gfm: true, breaks: false });
export function Markdown({ text }) {
  const html = useMemo(() => {
    const raw = DOMPurify.sanitize(marked.parse(text || ""));
    return raw.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
  }, [text]);
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Sources({ sources }) {
  if (!sources?.length) return null;
  return (
    <div className="mt-3 border-t border-line pt-2">
      <div className="h-sub mb-1">Kilder</div>
      <div className="flex flex-wrap gap-1.5">
        {sources.slice(0, 8).map((s, i) => (
          <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="chip max-w-[220px] truncate hover:text-accent">
            {i + 1}. {s.title}
          </a>
        ))}
      </div>
    </div>
  );
}

export function Seg({ value, onChange, options, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(o => {
        const [id, text] = Array.isArray(o) ? o : [o, o];
        return <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>{text}</button>;
      })}
    </div>
  );
}

export function Stat({ label, value, sub, className = "", hint }) {
  return (
    <div className={`rounded-lg border border-line bg-raised px-3 py-2 ${className}`} title={hint}>
      <div className="text-[11px] text-muted">{label}</div>
      <div className="num mt-0.5 text-[15px] font-semibold text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-ink2">{sub}</div>}
    </div>
  );
}

export function KV({ k, v, hint, strong }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm" title={hint}>
      <span className="flex items-center gap-1 text-ink2">{k}{hint && <Info className="h-3 w-3 text-muted" aria-hidden />}</span>
      <span className={`num text-right ${strong ? "font-semibold text-ink" : "font-medium text-ink"}`}>{v}</span>
    </div>
  );
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      {Icon && <Icon className="h-8 w-8 text-muted" aria-hidden />}
      <div className="text-sm font-medium text-ink">{title}</div>
      {children && <div className="max-w-md text-sm text-ink2">{children}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const k = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[1200] flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[6vh] animate-fade-in"
      onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`card w-full ${wide ? "max-w-2xl" : "max-w-lg"} bg-surface shadow-2xl`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button className="btn-ghost p-1" onClick={onClose} aria-label="Lukk"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Panel som glir inn fra høyre */
export function Drawer({ onClose, children, label, width = "max-w-2xl" }) {
  useEffect(() => {
    const k = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[1100] flex justify-end bg-black/40 animate-fade-in" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <aside className={`h-full w-full ${width} overflow-y-auto border-l border-line bg-surface shadow-2xl animate-slide-in scroll-thin`} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </aside>
    </div>,
    document.body,
  );
}

export function Spinner({ className = "h-4 w-4" }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} aria-hidden />;
}

export function Legend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink2">
      {items.map(it => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-3.5 rounded-sm" style={{ background: it.color }} aria-hidden />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** Tall-felt som tåler tomt innhold og mellomrom i tusen */
export function NumInput({ value, onChange, placeholder, suffix, className = "", step }) {
  const [txt, setTxt] = useState(value ? String(value) : "");
  useEffect(() => { setTxt(value ? String(value) : ""); }, [value]);
  return (
    <div className={`relative ${className}`}>
      <input className={`input num ${suffix ? "pr-10" : ""}`} inputMode="decimal" placeholder={placeholder} value={txt} step={step}
        onChange={e => setTxt(e.target.value)}
        onBlur={() => {
          const n = parseFloat(txt.replace(/\s/g, "").replace(",", "."));
          onChange(isFinite(n) ? n : 0);
        }}
        onKeyDown={e => e.key === "Enter" && e.currentTarget.blur()} />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{suffix}</span>}
    </div>
  );
}

export function Chip({ on, onClick, children, title }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} title={title}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${on ? "border-accent bg-accent text-white" : "border-line bg-raised text-ink2 hover:border-ink/30 hover:text-ink"}`}>
      {children}
    </button>
  );
}

export function Toggle({ on, onChange, children }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink2">
      <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={!!on} onChange={e => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

/** Søkbar flervalgsliste. options: [{ value, label, count }] */
export function MultiSelect({ label, options, value, onChange, placeholder = "Alle", className = "" }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const sel = new Set(value);
  const shown = options.filter(o => !q || o.label.toLowerCase().includes(q.toLowerCase())).slice(0, 300);
  const text = value.length === 0 ? placeholder : value.length === 1 ? (options.find(o => o.value === value[0])?.label ?? value[0]) : `${value.length} valgt`;
  return (
    <div className={`relative ${className}`} ref={ref}>
      <button type="button" className="input flex items-center justify-between gap-2 text-left" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={label}>
        <span className={`truncate ${value.length ? "text-ink" : "text-muted"}`}>{text}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" />
      </button>
      {open && (
        <div className="absolute left-0 z-[950] mt-1 w-72 max-w-[85vw] rounded-lg border border-line bg-surface p-2 shadow-xl">
          <input autoFocus className="input mb-1.5" placeholder="Søk …" value={q} onChange={e => setQ(e.target.value)} />
          <div className="max-h-64 overflow-y-auto scroll-thin">
            {shown.map(o => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-ink/5">
                <input type="checkbox" className="h-3.5 w-3.5 accent-[rgb(var(--accent))]" checked={sel.has(o.value)}
                  onChange={() => onChange(sel.has(o.value) ? value.filter(v => v !== o.value) : [...value, o.value])} />
                <span className="flex-1 truncate">{o.label}</span>
                {o.count != null && <span className="num text-[11px] text-muted">{o.count}</span>}
              </label>
            ))}
            {!shown.length && <div className="p-2 text-xs text-muted">Ingen treff</div>}
          </div>
          {value.length > 0 && <button type="button" className="btn-ghost mt-1 w-full justify-center text-xs" onClick={() => onChange([])}>Fjern valg</button>}
        </div>
      )}
    </div>
  );
}

export function Slider({ label, value, min, max, step = 1, onChange, format = v => v, hint }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  return (
    <label className="block" title={hint}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="h-sub">{label}</span>
        <span className="num text-xs font-semibold text-ink">{format(v)}</span>
      </div>
      <input type="range" className="w-full accent-[rgb(var(--accent))]" min={min} max={max} step={step} value={v}
        onChange={e => setV(Number(e.target.value))}
        onMouseUp={() => onChange(v)} onTouchEnd={() => onChange(v)} onKeyUp={() => onChange(v)} onBlur={() => v !== value && onChange(v)} />
    </label>
  );
}
