import React from 'react';
import { Printer, ShieldCheck, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { formatCurrency, Receipt } from '../types/zacma';
import { formatDualDate } from '../lib/ethiopianCalendar';
import { usePortal } from '../context/PortalContext';
import { DEFAULT_ZACMA_TENANT_ID } from '../lib/saasService';
import { ZacmaLogo } from './ZacmaLogo';

export function ReceiptModal({
  receipt,
  onClose,
}: {
  receipt: Receipt | null;
  onClose: () => void;
}) {
  const { activeTenant, activeTenantId } = usePortal();
  if (!receipt) return null;

  const isCustomTenant = activeTenantId !== DEFAULT_ZACMA_TENANT_ID;
  const orgName = activeTenant?.name || 'ZACMA Technology & Training Institute';
  const orgAddress = activeTenant
    ? `${activeTenant.address}${activeTenant.city ? ` · ${activeTenant.city}` : ''}${activeTenant.country ? `, ${activeTenant.country}` : ''}`
    : 'Office of the Registrar & Student Accounts · Addis Ababa, Ethiopia';
  const orgContact = activeTenant
    ? [activeTenant.phone, activeTenant.email].filter(Boolean).join(' · ')
    : '';
  const currency = activeTenant?.currency || 'ETB';
  const footerNote =
    activeTenant?.invoiceFooterNote ||
    `Scan QR code to verify official receipt authenticity against ${orgName} accounting ledger.`;

  const issuedDual = formatDualDate(receipt.issuedAt, false);
  const paymentDual = formatDualDate(receipt.paymentDate, false);

  const qrPayload = JSON.stringify({
    org: orgName,
    tid: activeTenantId,
    rcp: receipt.receiptNumber,
    ref: receipt.transactionRef,
    sid: receipt.studentCode,
    amt: receipt.amountPaidEtb,
    cur: currency,
    hash: receipt.verificationHash,
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[1px] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full shadow-2xl overflow-hidden my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 no-print">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Official Payment Receipt</h3>
            <p className="text-xs text-slate-500 font-mono">
              {receipt.receiptNumber} · Verified Approved Transaction
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              Print Official Receipt
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-900 rounded-lg transition-colors"
              aria-label="Close receipt"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div id="zacma-printable-receipt" className="p-8 bg-white text-slate-900">
          {/* Institutional Header */}
          <div className="flex items-start justify-between gap-6 pb-5">
            <div>
              <div className="flex items-center gap-3 mb-2">
                {!isCustomTenant && !activeTenant?.logoUrl ? (
                  <ZacmaLogo variant="mark" size="lg" framed />
                ) : activeTenant?.logoUrl ? (
                  <img
                    src={activeTenant.logoUrl}
                    alt={orgName}
                    className="w-12 h-12 rounded-lg object-contain border border-slate-200 p-1 bg-white shrink-0"
                  />
                ) : (
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center font-display font-extrabold text-sm text-white shrink-0"
                    style={{ backgroundColor: activeTenant?.primaryColor || '#0B2545' }}
                  >
                    {orgName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <h1 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight leading-tight uppercase">
                    {!isCustomTenant ? (
                      <>
                        ZACMA <span className="text-blue-700">TECHNOLOGY</span> &amp; TRAINING INSTITUTE
                      </>
                    ) : (
                      orgName
                    )}
                  </h1>
                  <p className="text-xs text-slate-500">{orgAddress}</p>
                  {orgContact && (
                    <p className="text-[11px] text-slate-500 mt-0.5">{orgContact}</p>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Official Tuition &amp; Training Fee Receipt · Currency: {currency}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-bold text-red-600 tracking-wide">
                OFFICIAL RECEIPT
              </p>
              <p className="text-base font-mono font-bold text-slate-900 tabular-nums mt-0.5">
                {receipt.receiptNumber}
              </p>
              <p className="text-xs text-slate-600 mt-1">
                Issued: {issuedDual.gregorian}
              </p>
              <p className="text-[11px] text-[#172DEB] font-medium">
                {issuedDual.ethiopian} E.C.
              </p>
            </div>
          </div>
          {isCustomTenant ? (
            <div
              className="h-1 w-full rounded-full mb-1"
              style={{
                background: `linear-gradient(90deg, ${activeTenant?.primaryColor || '#0B2545'}, ${activeTenant?.secondaryColor || '#D97706'})`,
              }}
            />
          ) : (
            <div className="h-1 w-full zacma-brand-stripe rounded-full mb-1" />
          )}

          {/* Student & Payment Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6 border-b border-slate-200 text-sm">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500">Student Information</p>
              <p className="font-bold text-slate-900 text-base">{receipt.studentName}</p>
              <p className="text-xs text-slate-600 font-mono">
                Student ID: <span className="font-semibold text-slate-900">{receipt.studentCode}</span>
              </p>
              {receipt.studentPhone && (
                <p className="text-xs text-slate-600">Phone: {receipt.studentPhone}</p>
              )}
              <p className="text-xs text-slate-600">
                Program: <span className="font-semibold text-slate-900">{receipt.courseName}</span>
              </p>
            </div>
            <div className="space-y-2 sm:text-right">
              <p className="text-xs font-semibold text-slate-500">Transaction Verification</p>
              <p className="text-xs text-slate-600">
                Transaction Ref:{' '}
                <span className="font-mono font-semibold text-slate-900">
                  {receipt.transactionRef}
                </span>
              </p>
              <p className="text-xs text-slate-600">
                Payment Date:{' '}
                <span className="font-semibold text-slate-900">
                  {paymentDual.gregorian}
                </span>{' '}
                <span className="text-[#172DEB] font-medium">
                  ({paymentDual.ethiopian} E.C.)
                </span>
              </p>
              <p className="text-xs text-slate-600">
                Payment Method:{' '}
                <span className="font-semibold text-slate-900">{receipt.paymentMethod}</span>
              </p>
              <p className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <ShieldCheck className="w-3.5 h-3.5" />
                Admin Approved &amp; Posted
              </p>
            </div>
          </div>

          {/* Financial Ledger Breakdown */}
          <div className="py-6 border-b border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="text-left font-semibold pb-2.5">Description</th>
                  <th className="text-right font-semibold pb-2.5">Amount ({currency})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-3 text-slate-600">Previous Outstanding Balance</td>
                  <td className="py-3 text-right font-mono tabular-nums text-slate-700">
                    {formatCurrency(receipt.previousBalanceEtb, currency)}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 font-semibold text-slate-900">
                    Tuition Fee Payment Received ({receipt.courseName})
                  </td>
                  <td className="py-3 text-right font-mono tabular-nums font-bold text-blue-700">
                    {formatCurrency(receipt.amountPaidEtb, currency)}
                  </td>
                </tr>
                <tr className="bg-slate-50">
                  <td className="py-3 px-3 font-bold text-slate-900">
                    Remaining Balance After Payment
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                    {formatCurrency(receipt.remainingBalanceEtb, currency)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* QR Code + Authorized Signature */}
          <div className="pt-6 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-white border border-slate-200 rounded-lg">
                <QRCodeSVG value={qrPayload} size={76} level="M" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-900">Digital Verification Code</p>
                <p className="text-xs font-mono text-slate-600">{receipt.verificationHash}</p>
                <p className="text-[11px] text-slate-500 max-w-[240px] leading-snug">
                  {footerNote}
                </p>
              </div>
            </div>

            <div className="w-full sm:w-56 text-left sm:text-right">
              <div className="border-b border-slate-400 pb-2 mb-1.5">
                <p className="text-sm font-display font-bold text-slate-900 italic">
                  {receipt.authorizedBy}
                </p>
              </div>
              <p className="text-xs font-semibold text-slate-700">Authorized Signature</p>
              <p className="text-[11px] text-slate-500">
                Finance Controller · {orgName}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
