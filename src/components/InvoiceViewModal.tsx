import React from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { Invoice, Organization } from '../types';
import { formatCurrency } from '../lib/utils';
import { Eye, FileText, CreditCard, Download, MessageSquare, X, Trash2, Edit2 } from 'lucide-react';

interface InvoiceViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
  org: Organization | null;
  onEdit?: () => void;
  onRecordPayment?: () => void;
  onDownload?: () => void;
  onWhatsApp?: () => void;
  onDelete?: () => void;
}

export function InvoiceViewModal({ 
  isOpen, 
  onClose, 
  invoice, 
  org, 
  onEdit, 
  onRecordPayment, 
  onDownload, 
  onWhatsApp, 
  onDelete 
}: InvoiceViewModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface w-full max-w-4xl rounded-3xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-border flex items-center justify-between bg-accent/5">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
              <Eye className="h-5 w-5" />
            </div>
            <h3 className="text-xl font-black text-primary tracking-tight">Invoice Preview</h3>
          </div>
          <div className="flex items-center space-x-2">
            {onEdit && <button onClick={onEdit} className="p-2 text-warning hover:bg-warning/10 rounded-lg transition-all" title="Edit"><FileText className="h-4 w-4" /></button>}
            {onRecordPayment && <button onClick={onRecordPayment} disabled={invoice.status === 'PAID'} className="p-2 text-success hover:bg-success/10 rounded-lg transition-all" title="Record Payment"><CreditCard className="h-4 w-4" /></button>}
            {onDownload && <button onClick={onDownload} className="p-2 text-secondary hover:bg-border/50 rounded-lg transition-all" title="Download"><Download className="h-4 w-4" /></button>}
            {onWhatsApp && <button onClick={onWhatsApp} className="p-2 text-accent hover:bg-accent/10 rounded-lg transition-all" title="WhatsApp"><MessageSquare className="h-4 w-4" /></button>}
            {onDelete && <button onClick={onDelete} className="p-2 text-danger hover:bg-danger/10 rounded-lg transition-all" title="Delete"><X className="h-4 w-4" /></button>}
            <button onClick={onClose} className="p-2 hover:bg-border/50 rounded-xl transition-colors ml-2"><X className="h-5 w-5 text-secondary" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-white">
          {/* Invoice Header */}
          <div className="flex justify-between items-start">
            <div className="space-y-4">
              {org?.logo_url && <img src={org.logo_url} alt="Logo" className="h-16 w-auto object-contain" referrerPolicy="no-referrer" />}
              <div>
                <h4 className="text-2xl font-black text-primary">{org?.name || 'Jagriti Tours & Travels'}</h4>
                <p className="text-sm text-secondary">{org?.address_line1}, {org?.address_line2} - {org?.zip_code}</p>
                <p className="text-sm text-secondary">Phone: {org?.phone} | Email: {org?.email}</p>
              </div>
            </div>
            <div className="text-right space-y-2">
              <h2 className="text-5xl font-black text-accent/20">INVOICE</h2>
              <div className="space-y-1">
                <p className="text-sm font-bold text-primary">Invoice #: {invoice.invoiceNumber}</p>
                <p className="text-sm text-secondary">Date: {format(invoice.invoiceDate.toDate ? invoice.invoiceDate.toDate() : new Date(invoice.invoiceDate), 'dd MMM yyyy')}</p>
                <p className="text-sm text-secondary">Due Date: {format(invoice.dueDate.toDate ? invoice.dueDate.toDate() : new Date(invoice.dueDate), 'dd MMM yyyy')}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-12">
            <div>
              <h5 className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-2">Bill To:</h5>
              <p className="font-black text-primary text-lg">{invoice.studentName}</p>
              <p className="text-sm text-secondary">{invoice.address}</p>
              <p className="text-sm text-secondary">Phone: {invoice.phoneNumber}</p>
            </div>
          </div>

          {/* Table */}
          <div className="border border-border rounded-2xl overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-accent text-white">
                <tr>
                  <th className="px-6 py-4 text-sm font-black">#</th>
                  <th className="px-6 py-4 text-sm font-black">Item & Description</th>
                  <th className="px-6 py-4 text-sm font-black text-right">Rate</th>
                  <th className="px-6 py-4 text-sm font-black text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-6 py-4 text-sm">1</td>
                  <td className="px-6 py-4">
                    <p className="font-bold text-primary">{invoice.itemDescription || `${invoice.schoolName} [${invoice.standName}] Transport Fees`}</p>
                    <p className="text-xs text-secondary">Month: {invoice.month}</p>
                  </td>
                  <td className="px-6 py-4 text-sm text-right font-mono">{formatCurrency(invoice.feeAmount)}</td>
                  <td className="px-6 py-4 text-sm text-right font-mono">{formatCurrency(invoice.feeAmount)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-64 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-secondary font-bold">Sub Total:</span>
                <span className="text-primary font-black font-mono">{formatCurrency(invoice.feeAmount)}</span>
              </div>
              {invoice.concession > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-secondary font-bold">Concession:</span>
                  <span className="text-danger font-black font-mono">-{formatCurrency(invoice.concession)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg border-t border-border pt-3">
                <span className="text-primary font-black">Total:</span>
                <span className="text-accent font-black font-mono">{formatCurrency(invoice.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-secondary font-bold">Paid Amount:</span>
                <span className="text-success font-black font-mono">{formatCurrency(invoice.paidAmount)}</span>
              </div>
              <div className="flex justify-between text-sm bg-accent/5 p-2 rounded-lg">
                <span className="text-primary font-bold">Balance Due:</span>
                <span className="text-danger font-black font-mono">{formatCurrency(invoice.balanceDue)}</span>
              </div>
            </div>
          </div>

          {/* Edit History */}
          {invoice.editHistory && invoice.editHistory.length > 0 && (
            <div className="pt-8 border-t border-border">
              <h5 className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-4">Edit History:</h5>
              <div className="space-y-3">
                {invoice.editHistory.map((entry, idx) => (
                  <div key={idx} className="flex items-center space-x-3 text-xs">
                    <div className="h-2 w-2 rounded-full bg-accent" />
                    <span className="text-secondary">Edited by <span className="font-bold text-primary">{entry.userName}</span> on {format(entry.editedAt.toDate ? entry.editedAt.toDate() : new Date(entry.editedAt), 'dd MMM yyyy, hh:mm a')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-border bg-accent/5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            {onDelete && (
              <button 
                onClick={onDelete}
                className="btn-secondary text-danger border-danger/20 hover:bg-danger/5 flex items-center space-x-2"
                disabled={invoice.paidAmount > 0}
                title={invoice.paidAmount > 0 ? "Cannot delete an invoice with payments" : "Delete Invoice"}
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            )}
            {onEdit && (
              <button 
                onClick={onEdit}
                className="btn-secondary flex items-center space-x-2"
              >
                <Edit2 className="h-4 w-4" />
                <span>Edit</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {onWhatsApp && (
              <button 
                onClick={onWhatsApp}
                className="btn-secondary text-accent border-accent/20 hover:bg-accent/5 flex items-center space-x-2"
              >
                <MessageSquare className="h-4 w-4" />
                <span>WhatsApp</span>
              </button>
            )}
            {onDownload && (
              <button 
                onClick={onDownload}
                className="btn-secondary flex items-center space-x-2"
              >
                <Download className="h-4 w-4" />
                <span>Download</span>
              </button>
            )}
            {onRecordPayment && (
              <button 
                onClick={onRecordPayment}
                disabled={invoice.status === 'PAID'}
                className="btn-primary flex items-center space-x-2"
              >
                <CreditCard className="h-4 w-4" />
                <span>Record Payment</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
