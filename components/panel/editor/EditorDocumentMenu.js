/**
 * @file components/panel/editor/EditorDocumentMenu.js
 * @description Panneau virtuel — menu « Document » de la barre de l'éditeur.
 *              - PDF de la disposition, plans au format lettre ou 11 × 17 (paysage)
 *              - Approuver / remettre en brouillon (l'approbation garde une copie dans l'historique)
 *              - Versions: liste, « Enregistrer une version », « Restaurer » (avec confirmation;
 *                la restauration reste annulable par Ctrl+Z)
 *              - Envoyer le boîtier retenu à la soumission liée (aperçu, puis confirmation)
 *              Les actions qui lisent la base attendent que la disposition soit enregistrée.
 * @version 1.0.0
 * @date 2026-11-26
 * @changelog
 *   1.0.0 - Version initiale (Panneau virtuel PR 4)
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FileText, ChevronDown, Loader2, X, History, Send, CheckCircle2, AlertTriangle, RotateCcw } from 'lucide-react';

const BTN =
  'min-h-[44px] px-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 ' +
  'text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40';
const PRIMARY = 'min-h-[44px] px-4 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50 inline-flex items-center justify-center gap-2';
const ITEM = 'w-full text-left px-3 min-h-[44px] text-sm hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 flex items-center gap-2';
const money = (v) => Number(v || 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' });
const fmtDateTime = (iso) => new Date(iso).toLocaleString('fr-CA', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Toronto',
});

function Modal({ title, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Fermer"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex gap-3 px-5 py-3 border-t border-gray-200 dark:border-gray-700">{footer}</div>}
      </div>
    </div>
  );
}

function VersionsModal({ layoutId, userId, onClose, onRestore, ensureSaved }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [label, setLabel] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/panel-layouts/${layoutId}/versions`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error([json.error, json.details].filter(Boolean).join(' — ') || 'Erreur');
      setRows(json.data);
    } catch (e) {
      setError(e.message);
      setRows([]);
    }
  }, [layoutId]);
  useEffect(() => { load(); }, [load]);

  const saveVersion = async () => {
    if (busy) return;
    setBusy('save'); setError('');
    try {
      if (!(await ensureSaved())) throw new Error('La disposition n\'a pas pu être enregistrée: version non créée.');
      const res = await fetch(`/api/panel-layouts/${layoutId}/versions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label, user_id: userId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error([json.error, json.details].filter(Boolean).join(' — ') || 'Erreur');
      setLabel('');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const restore = async (row) => {
    if (busy) return;
    if (!window.confirm(`Restaurer la version du ${fmtDateTime(row.created_at)} ?\n\nLe fond, les pièces, le boîtier et les réglages actuels seront remplacés. Vous pourrez annuler avec Ctrl+Z.`)) return;
    setBusy(row.id); setError('');
    try {
      const res = await fetch(`/api/panel-layouts/${layoutId}/versions?version_id=${row.id}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error([json.error, json.details].filter(Boolean).join(' — ') || 'Erreur');
      onRestore(json.data.snapshot);
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy('');
    }
  };

  return (
    <Modal title="Versions de la disposition" onClose={onClose}>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Une copie est gardée automatiquement chaque fois que la disposition est approuvée. Vous pouvez aussi en enregistrer une à la main avant un gros changement. Les 20 plus récentes sont conservées.
      </p>
      <div className="flex gap-2 mt-3">
        <input
          type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Note (optionnel), ex. avant changement de boîtier"
          className="flex-1 min-w-0 px-3 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800"
          autoCorrect="on" autoCapitalize="sentences" spellCheck
        />
        <button type="button" className={PRIMARY} onClick={saveVersion} disabled={!!busy}>
          {busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />} Enregistrer une version
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
      <div className="mt-4">
        {rows === null ? (
          <div className="py-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">Aucune version enregistrée pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {rows.map((r) => (
              <li key={r.id} className="py-2 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{fmtDateTime(r.created_at)}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-300">
                    {r.reason === 'approved'
                      ? <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400"><CheckCircle2 className="w-3 h-3" /> Version approuvée</span>
                      : 'Version manuelle'}
                    {r.label ? ` — ${r.label}` : ''} · v{r.layout_version}
                  </div>
                </div>
                <button type="button" className={BTN} onClick={() => restore(r)} disabled={!!busy}>
                  {busy === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} Restaurer
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function SendEnclosureModal({ layoutId, onClose, ensureSaved }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!(await ensureSaved())) throw new Error('La disposition n\'a pas pu être enregistrée. Réessayez.');
        const res = await fetch(`/api/panel-layouts/${layoutId}/send-enclosure`);
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error([json.error, json.details].filter(Boolean).join(' — ') || 'Erreur');
        if (!cancelled) setInfo(json.data);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [layoutId, ensureSaved]);

  const send = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/panel-layouts/${layoutId}/send-enclosure`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error([json.error, json.details].filter(Boolean).join(' — ') || 'Erreur');
      setDone(json.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const canSend = info && !info.already_present && !done;
  return (
    <Modal
      title="Envoyer le boîtier à la soumission" onClose={onClose}
      footer={(
        <>
          <button type="button" className={`${BTN} flex-1`} onClick={onClose}>{done || !canSend ? 'Fermer' : 'Annuler'}</button>
          {canSend && (
            <button type="button" className={`${PRIMARY} flex-1`} onClick={send} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Ajouter à la soumission
            </button>
          )}
        </>
      )}
    >
      {!info && !error && <div className="py-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>}
      {error && <p className="text-sm text-red-700 dark:text-red-300 flex gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}</p>}
      {info && (
        <div className="text-sm space-y-3">
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Soumission</div>
            <div className="font-semibold">{info.submission.number || `#${info.submission.id}`} — {info.submission.client_name || ''}</div>
            <div className="text-xs text-gray-600 dark:text-gray-300">{info.submission.description} · {info.submission.lines} ligne{info.submission.lines > 1 ? 's' : ''}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Boîtier retenu</div>
            <div className="font-mono font-semibold">{info.enclosure.code}</div>
            <div className="text-xs text-gray-600 dark:text-gray-300">{info.enclosure.description}</div>
            <div className="text-xs text-gray-600 dark:text-gray-300">Vendant {money(info.enclosure.selling_price)} · coûtant {money(info.enclosure.cost_price)} · en main {info.enclosure.stock_qty}</div>
          </div>
          {done ? (
            <p className="text-green-700 dark:text-green-400 flex gap-2"><CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" /> Boîtier ajouté à la soumission {done.submission_number}. Nouveau total: {money(done.amount)}.</p>
          ) : info.already_present ? (
            <p className="text-amber-700 dark:text-amber-400">Ce boîtier est déjà dans la soumission: rien à ajouter.</p>
          ) : (
            <p>
              Une ligne (quantité 1) sera ajoutée à la soumission. Total: {money(info.amount_before)} → <span className="font-semibold">{money(info.amount_after)}</span>.
              {info.submission.status && info.submission.status !== 'draft' ? ' Attention: cette soumission n\'est plus un brouillon.' : ''}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function EditorDocumentMenu({ layout, layoutId, userId, canSendEnclosure, pdfBusy, onPdf, onToggleStatus, onRestore, ensureSaved }) {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(null); // 'versions' | 'send'
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const run = (fn) => { setOpen(false); fn(); };
  const approved = layout.status === 'approved';

  return (
    <div className="relative" ref={ref}>
      <button type="button" className={BTN} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        {pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
        <span className="hidden lg:inline">Document</span>
        {approved && <CheckCircle2 className="w-4 h-4 text-green-600" aria-label="Approuvé" />}
        <ChevronDown className="w-4 h-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1 w-72 z-30 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1">
          <button type="button" role="menuitem" className={ITEM} disabled={pdfBusy} onClick={() => run(() => onPdf('letter'))}><FileText className="w-4 h-4" /> PDF — plans au format lettre</button>
          <button type="button" role="menuitem" className={ITEM} disabled={pdfBusy} onClick={() => run(() => onPdf('tabloid'))}><FileText className="w-4 h-4" /> PDF — plans au format 11 × 17</button>
          <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
          <button type="button" role="menuitem" className={ITEM} onClick={() => run(onToggleStatus)}>
            <CheckCircle2 className={`w-4 h-4 ${approved ? 'text-green-600' : ''}`} /> {approved ? 'Remettre en brouillon' : 'Approuver la disposition'}
          </button>
          <button type="button" role="menuitem" className={ITEM} onClick={() => run(() => setModal('versions'))}><History className="w-4 h-4" /> Versions…</button>
          <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
          <button
            type="button" role="menuitem" className={ITEM} disabled={!canSendEnclosure} onClick={() => run(() => setModal('send'))}
            title={canSendEnclosure ? '' : 'Il faut un boîtier retenu et une disposition créée depuis une soumission'}
          >
            <Send className="w-4 h-4" /> Envoyer le boîtier à la soumission…
          </button>
          {!canSendEnclosure && (
            <p className="px-3 pb-2 text-[11px] text-gray-500 dark:text-gray-400">
              {!layout.submission_id ? 'Disposition sans soumission liée.' : 'Retenez d\'abord un boîtier (onglet Boîtier).'}
            </p>
          )}
        </div>
      )}
      {modal === 'versions' && <VersionsModal layoutId={layoutId} userId={userId} onClose={() => setModal(null)} onRestore={onRestore} ensureSaved={ensureSaved} />}
      {modal === 'send' && <SendEnclosureModal layoutId={layoutId} onClose={() => setModal(null)} ensureSaved={ensureSaved} />}
    </div>
  );
}
