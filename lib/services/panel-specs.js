/**
 * @file lib/services/panel-specs.js
 * @description Panneau virtuel — helpers SERVEUR pour la table panel_specs et le
 *              bucket privé « panel-photos » (supabaseAdmin).
 *              - cleanCode(): code produit exact (trim seulement — certains codes
 *                de l'inventaire ne sont pas en majuscules)
 *              - fetchAllSpecs(): lecture paginée de toutes les fiches
 *              - withPhotoUrls(): ajoute les URL signées des 2 photos (1 h)
 *              - renameSpecCode() / mergeSpecCode() / deleteSpecForCode():
 *                cascades appelées par /api/products/rename, merge et delete
 * @version 1.0.0
 * @date 2026-11-25
 * @changelog
 *   1.0.0 - Version initiale (Panneau virtuel PR 1)
 */

import { supabaseAdmin } from '../supabaseAdmin';

export const PANEL_PHOTO_BUCKET = 'panel-photos';
const SIGNED_URL_SECONDS = 3600;

export function cleanCode(code) {
  return code == null ? '' : String(code).trim();
}

/** Toutes les fiches (paginé par 1000, ordre stable). */
export async function fetchAllSpecs(columns = '*') {
  const rows = [];
  const pageSize = 1000;
  for (let page = 0; ; page++) {
    const { data, error } = await supabaseAdmin
      .from('panel_specs')
      .select(columns)
      .order('product_code', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function signedUrl(path) {
  if (!path) return null;
  const { data, error } = await supabaseAdmin.storage
    .from(PANEL_PHOTO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) {
    console.error('Panneau virtuel — URL signée impossible:', path, error.message);
    return null;
  }
  return data?.signedUrl || null;
}

export async function withPhotoUrls(spec) {
  if (!spec) return spec;
  const [front, iso] = await Promise.all([
    signedUrl(spec.photo_front_path),
    signedUrl(spec.photo_iso_path),
  ]);
  return { ...spec, photo_front_url: front, photo_iso_url: iso };
}

async function removePhotos(spec) {
  const paths = [spec?.photo_front_path, spec?.photo_iso_path].filter(Boolean);
  if (paths.length === 0) return;
  const { error } = await supabaseAdmin.storage.from(PANEL_PHOTO_BUCKET).remove(paths);
  if (error) console.error('Panneau virtuel — photos non retirées:', error.message);
}

/** Renommage d'un code produit: la fiche suit. Best-effort (journalise, ne lance pas). */
export async function renameSpecCode(oldCode, newCode) {
  try {
    const { error } = await supabaseAdmin
      .from('panel_specs')
      .update({ product_code: cleanCode(newCode) })
      .eq('product_code', cleanCode(oldCode));
    if (error) console.error('Cascade panel_specs.product_code:', error.message);
  } catch (e) {
    console.error('Cascade panel_specs.product_code (exception):', e);
  }
}

/**
 * Fusion de deux fiches produit: la fiche « panneau » du code gardé prime.
 * Si seul l'ancien code en a une, elle est transférée au code gardé.
 * Renvoie le nombre de fiches touchées (0 ou 1). Best-effort.
 */
export async function mergeSpecCode(oldCode, newCode) {
  const from = cleanCode(oldCode);
  const to = cleanCode(newCode);
  if (!from || !to || from === to) return 0;
  try {
    const { data, error } = await supabaseAdmin
      .from('panel_specs')
      .select('*')
      .in('product_code', [from, to]);
    if (error) throw error;
    const oldSpec = (data || []).find((s) => s.product_code === from);
    const keptSpec = (data || []).find((s) => s.product_code === to);
    if (!oldSpec) return 0;
    if (keptSpec) {
      const { error: delErr } = await supabaseAdmin.from('panel_specs').delete().eq('id', oldSpec.id);
      if (delErr) throw delErr;
      await removePhotos(oldSpec);
    } else {
      const { error: updErr } = await supabaseAdmin
        .from('panel_specs').update({ product_code: to }).eq('id', oldSpec.id);
      if (updErr) throw updErr;
    }
    return 1;
  } catch (e) {
    console.error('Fusion — panel_specs ignoré:', e?.message || e);
    return 0;
  }
}

/** Plus aucune fiche produit ne porte ce code: on retire la fiche « panneau » et ses photos. */
export async function deleteSpecForCode(code) {
  try {
    const { data, error } = await supabaseAdmin
      .from('panel_specs')
      .delete()
      .eq('product_code', cleanCode(code))
      .select('photo_front_path, photo_iso_path');
    if (error) throw error;
    for (const spec of data || []) await removePhotos(spec);
    return (data || []).length;
  } catch (e) {
    console.error('Nettoyage panel_specs:', e?.message || e);
    return 0;
  }
}
