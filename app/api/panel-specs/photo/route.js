/**
 * @file app/api/panel-specs/photo/route.js
 * @description Panneau virtuel — photos d'une fiche (bucket PRIVÉ « panel-photos »).
 *              Deux emplacements par produit:
 *                - front: photo de face (le visuel posé sur le fond de panneau)
 *                - iso:   photo 3 faces (sélection visuelle dans la bibliothèque)
 *              - POST (multipart: code, slot, file) → téléverse, remplace l'ancienne photo,
 *                                                     écrit le chemin dans panel_specs
 *              - DELETE ?code=CODE&slot=front|iso   → retire la photo
 *              Le navigateur réduit l'image avant l'envoi (≤ 1600 px, JPEG); le serveur
 *              refuse tout fichier > 4 Mo ou qui n'est pas une image.
 *              La fiche doit déjà exister (case « Panneau virtuel » cochée).
 * @version 1.0.0
 * @date 2026-11-25
 * @changelog
 *   1.0.0 - Version initiale (Panneau virtuel PR 1)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { cleanCode, withPhotoUrls, PANEL_PHOTO_BUCKET } from '../../../../lib/services/panel-specs';
import { PHOTO_SLOTS } from '../../../../lib/panel/specs';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 4 * 1024 * 1024;
const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const fail = (message, status = 400, details) =>
  NextResponse.json({ success: false, error: message, ...(details ? { details } : {}) }, { status });

const columnOf = (slot) => (slot === 'iso' ? 'photo_iso_path' : 'photo_front_path');

async function loadSpec(code) {
  const { data, error } = await supabaseAdmin
    .from('panel_specs').select('*').eq('product_code', code).maybeSingle();
  if (error) throw error;
  return data;
}

export async function POST(request) {
  try {
    const form = await request.formData();
    const code = cleanCode(form.get('code'));
    const slot = String(form.get('slot') || '');
    const file = form.get('file');

    if (!code) return fail('Code produit requis');
    if (!PHOTO_SLOTS.includes(slot)) return fail('Emplacement de photo invalide');
    if (!file || typeof file === 'string') return fail('Aucun fichier reçu');
    const ext = EXTENSIONS[file.type];
    if (!ext) return fail('Format non accepté (JPEG, PNG ou WebP seulement)');
    if (file.size > MAX_BYTES) return fail('Photo trop lourde (maximum 4 Mo)');

    const spec = await loadSpec(code);
    if (!spec) return fail('Cochez d\'abord « Panneau virtuel » pour ce produit', 404);

    const column = columnOf(slot);
    const folder = code.replace(/[^A-Za-z0-9._-]/g, '_');
    const path = `${folder}/${slot}-${Date.now()}.${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from(PANEL_PHOTO_BUCKET)
      .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (upErr) throw upErr;

    const { data: saved, error: saveErr } = await supabaseAdmin
      .from('panel_specs').update({ [column]: path }).eq('id', spec.id).select('*').single();
    if (saveErr) {
      await supabaseAdmin.storage.from(PANEL_PHOTO_BUCKET).remove([path]);
      throw saveErr;
    }

    if (spec[column]) {
      const { error: rmErr } = await supabaseAdmin.storage.from(PANEL_PHOTO_BUCKET).remove([spec[column]]);
      if (rmErr) console.error('Ancienne photo non retirée:', rmErr.message);
    }

    return NextResponse.json({ success: true, spec: await withPhotoUrls(saved) });
  } catch (error) {
    console.error('Erreur POST panel-specs/photo:', error);
    return fail('Erreur lors du téléversement de la photo', 500, error?.message);
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = cleanCode(searchParams.get('code'));
    const slot = String(searchParams.get('slot') || '');
    if (!code) return fail('Code produit requis');
    if (!PHOTO_SLOTS.includes(slot)) return fail('Emplacement de photo invalide');

    const spec = await loadSpec(code);
    if (!spec) return fail('Fiche introuvable', 404);

    const column = columnOf(slot);
    const oldPath = spec[column];
    const { data: saved, error: saveErr } = await supabaseAdmin
      .from('panel_specs').update({ [column]: null }).eq('id', spec.id).select('*').single();
    if (saveErr) throw saveErr;

    if (oldPath) {
      const { error: rmErr } = await supabaseAdmin.storage.from(PANEL_PHOTO_BUCKET).remove([oldPath]);
      if (rmErr) console.error('Photo non retirée du stockage:', rmErr.message);
    }

    return NextResponse.json({ success: true, spec: await withPhotoUrls(saved) });
  } catch (error) {
    console.error('Erreur DELETE panel-specs/photo:', error);
    return fail('Erreur lors du retrait de la photo', 500, error?.message);
  }
}
