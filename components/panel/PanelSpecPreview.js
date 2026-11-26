/**
 * @file components/panel/PanelSpecPreview.js
 * @description Panneau virtuel — aperçu À L'ÉCHELLE d'une fiche (SVG), mis à jour
 *              pendant la saisie.
 *              - Composant: corps de la pièce + dégagements en pointillé, cotes L × H
 *              - Boîtier: extérieur, fond de panneau (backplate) centré, marge non
 *                utilisable en pointillé
 *              Reçoit la fiche en mm; l'unité ne sert qu'aux étiquettes.
 * @version 1.1.0
 * @date 2026-11-26
 * @changelog
 *   1.1.0 - Aperçu rond pour les pièces de forme « Ronde »
 *   1.0.0 - Version initiale (Panneau virtuel PR 1)
 */
import React from 'react';
import { bodyWidth, formatLength } from '../../lib/panel/specs';

const VIEW_W = 320;
const VIEW_H = 220;
const PAD = 26;
const CONFLICT = '#c8371e';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

function Empty({ text }) {
  return (
    <div className="h-[220px] flex items-center justify-center text-sm text-gray-500 dark:text-gray-400 text-center px-4">
      {text}
    </div>
  );
}

export default function PanelSpecPreview({ spec, unit = 'mm' }) {
  if (!spec) return null;

  let outerW; let outerH; let shapes;

  if (spec.kind === 'enclosure') {
    const extW = num(spec.width_mm);
    const extH = num(spec.height_mm);
    const bpW = num(spec.backplate_width_mm);
    const bpH = num(spec.backplate_height_mm);
    outerW = Math.max(extW, bpW);
    outerH = Math.max(extH, bpH);
    if (!outerW || !outerH) return <Empty text="Entrez les dimensions du boîtier ou du fond de panneau pour voir l'aperçu." />;
    const margin = num(spec.unusable_margin_mm);
    const tooBig = (extW && bpW > extW) || (extH && bpH > extH);
    shapes = (scale, ox, oy) => {
      const X = (mm) => ox + mm * scale;
      const Y = (mm) => oy + mm * scale;
      const bx = (outerW - bpW) / 2;
      const by = (outerH - bpH) / 2;
      return (
        <>
          {extW > 0 && extH > 0 && (
            <rect
              x={X((outerW - extW) / 2)} y={Y((outerH - extH) / 2)}
              width={extW * scale} height={extH * scale}
              className="fill-gray-300 dark:fill-gray-600 stroke-gray-700 dark:stroke-gray-300" strokeWidth="1.5" rx="2"
            />
          )}
          {bpW > 0 && bpH > 0 && (
            <>
              <rect
                x={X(bx)} y={Y(by)} width={bpW * scale} height={bpH * scale}
                className="fill-gray-50 dark:fill-gray-200" stroke={tooBig ? CONFLICT : '#4b5563'} strokeWidth="1.5"
              />
              {margin > 0 && bpW > 2 * margin && bpH > 2 * margin && (
                <rect
                  x={X(bx + margin)} y={Y(by + margin)}
                  width={(bpW - 2 * margin) * scale} height={(bpH - 2 * margin) * scale}
                  fill="none" stroke="#6b7280" strokeWidth="1" strokeDasharray="4 3"
                />
              )}
              <text x={X(outerW / 2)} y={Y(outerH / 2)} textAnchor="middle" fontSize="10" fill="#374151">
                <tspan x={X(outerW / 2)} dy="-1.1em">Fond</tspan>
                <tspan x={X(outerW / 2)} dy="1.2em">L {formatLength(bpW, unit)}</tspan>
                <tspan x={X(outerW / 2)} dy="1.2em">H {formatLength(bpH, unit)}</tspan>
              </text>
            </>
          )}
        </>
      );
    };
  } else {
    const w = num(bodyWidth(spec));
    const h = num(spec.height_mm);
    if (!w || !h) return <Empty text="Entrez la largeur et la hauteur pour voir l'aperçu à l'échelle." />;
    const cT = num(spec.clearance_top_mm);
    const cB = num(spec.clearance_bottom_mm);
    const cL = num(spec.clearance_left_mm);
    const cR = num(spec.clearance_right_mm);
    outerW = w + cL + cR;
    outerH = h + cT + cB;
    const power = spec.visual_category === 'power';
    const qty = spec.is_repeated ? Math.max(1, spec.default_quantity || 1) : 1;
    shapes = (scale, ox, oy) => {
      const X = (mm) => ox + mm * scale;
      const Y = (mm) => oy + mm * scale;
      const dividers = [];
      if (spec.is_repeated && qty > 1 && (w / qty) * scale >= 3) {
        for (let i = 1; i < qty; i++) dividers.push(i * (w / qty));
      }
      return (
        <>
          {(cT || cB || cL || cR) > 0 && (
            <rect
              x={X(0)} y={Y(0)} width={outerW * scale} height={outerH * scale}
              fill="none" className="stroke-gray-500 dark:stroke-gray-400" strokeWidth="1" strokeDasharray="5 4"
            />
          )}
          <rect
            x={X(cL)} y={Y(cT)} width={w * scale} height={h * scale} rx={spec.shape === 'round' && !spec.is_repeated ? (Math.min(w, h) * scale) / 2 : 1.5}
            className={power
              ? 'fill-gray-700 dark:fill-gray-300 stroke-gray-900 dark:stroke-gray-100'
              : 'fill-white dark:fill-gray-100 stroke-gray-700 dark:stroke-gray-300'}
            strokeWidth="1.5"
          />
          {dividers.map((d) => (
            <line
              key={d} x1={X(cL + d)} x2={X(cL + d)} y1={Y(cT)} y2={Y(cT + h)}
              className={power ? 'stroke-gray-400 dark:stroke-gray-600' : 'stroke-gray-400'} strokeWidth="0.5"
            />
          ))}
          {spec.must_stay_vertical && h * scale > 30 && (
            <text
              x={X(cL + w / 2)} y={Y(cT + h / 2)} textAnchor="middle" dominantBaseline="middle" fontSize="16"
              className={power ? 'fill-white dark:fill-gray-900' : 'fill-gray-700'}
            >
              ↑
            </text>
          )}
        </>
      );
    };
  }

  const scale = Math.min((VIEW_W - 2 * PAD) / outerW, (VIEW_H - 2 * PAD) / outerH);
  const ox = (VIEW_W - outerW * scale) / 2;
  const oy = (VIEW_H - outerH * scale) / 2;
  const isEnclosure = spec.kind === 'enclosure';
  const labelW = isEnclosure ? num(spec.width_mm) || outerW : num(bodyWidth(spec));
  const labelH = isEnclosure ? num(spec.height_mm) || outerH : num(spec.height_mm);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="w-full h-[220px]"
      role="img"
      aria-label="Aperçu à l'échelle"
    >
      {shapes(scale, ox, oy)}
      <text x={VIEW_W / 2} y={VIEW_H - 6} textAnchor="middle" fontSize="11" className="fill-gray-700 dark:fill-gray-300">
        {isEnclosure ? 'Ext. ' : ''}L {formatLength(labelW, unit)}
      </text>
      <text
        x={10} y={VIEW_H / 2} textAnchor="middle" fontSize="11" className="fill-gray-700 dark:fill-gray-300"
        transform={`rotate(-90 10 ${VIEW_H / 2})`}
      >
        {isEnclosure ? 'Ext. ' : ''}H {formatLength(labelH, unit)}
      </text>
    </svg>
  );
}
