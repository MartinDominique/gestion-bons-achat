/**
 * @file app/(protected)/facturation/page.js
 * @description Page principale du module Facturation (Phase B)
 * @version 1.0.0
 * @date 2026-02-27
 * @changelog
 *   1.0.0 - Version initiale (Phase B Facturation MVP)
 */

'use client';
import React from 'react';
import InvoiceManager from '../../../components/invoices/InvoiceManager';

export default function FacturationPage() {
  return <InvoiceManager />;
}
