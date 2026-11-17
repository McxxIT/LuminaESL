"use client";

import { useState } from "react";
import Icon from "../Icon";
import type { ServiceCall } from "../../lib/school/services";
import StudentModal from "./StudentModal";
import { creditPackages } from "../../lib/data";
import { downloadTextFile } from "../../lib/student";
import type { CreditTransaction } from "../../lib/types";

type BillingProps = {
  creditHours: number;
  transactions: CreditTransaction[];
  onPurchase: (hours: number, amount: number) => ServiceCall<unknown>;
  onNavigate: (page: string) => void;
  onNotice: (message: string) => void;
};

export default function StudentBilling({ creditHours, transactions, onPurchase, onNavigate, onNotice }: BillingProps) {
  const [buyOpen, setBuyOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(1);
  const [autoRenew, setAutoRenew] = useState(true);
  const selected = creditPackages[selectedPackage];
  const totalSpent = transactions.filter((transaction) => transaction.status === "paid").reduce((total, transaction) => total + transaction.amount, 0);

  async function buyCredits() {
    const result = await onPurchase(selected.hours, selected.price);
    if (!result.ok) {
      onNotice(result.error);
      return;
    }
    setBuyOpen(false);
    onNotice(`${selected.hours} lesson hours added to your wallet.`);
  }

  function downloadInvoice(transaction: CreditTransaction) {
    const lines = [
      "LUMINA ESL — INVOICE RECEIPT",
      "=============================",
      `Invoice: ${transaction.id.toUpperCase()}`,
      `Date: ${transaction.date}`,
      `Description: ${transaction.description}`,
      `Hours: ${transaction.hours}`,
      `Amount: $${transaction.amount.toFixed(2)}`,
      `Status: ${transaction.status}`,
      "",
      "Paid by Visa ending 4242",
      "Lumina ESL · Global Academy",
    ];
    downloadTextFile(`lumina-invoice-${transaction.id}.txt`, lines.join("\n"));
    onNotice("Invoice downloaded.");
  }

  return <div className="role-workspace student-page">
    <section className="page-heading student-page-heading">
      <div><p className="eyebrow">BILLING & CREDITS</p><h1>Lesson credits</h1><p className="subheading">Track your balance, renew lesson hours, and download billing history.</p></div>
      <div className="page-heading-actions"><button type="button" className="secondary-button" onClick={() => onNavigate("Lessons")}><Icon name="calendar" size={15} /> View lessons</button><button type="button" className="primary-button" onClick={() => setBuyOpen(true)}><Icon name="plus" size={15} /> Buy credits</button></div>
    </section>

    <section className="student-billing-metrics">
      <article className="student-summary-card"><span className="metric-icon violet"><Icon name="wallet" /></span><div><span>AVAILABLE</span><strong>{creditHours.toFixed(1)} <em>hrs</em></strong></div></article>
      <article className="student-summary-card"><span className="metric-icon blue"><Icon name="clock" /></span><div><span>USED THIS CYCLE</span><strong>3.5 <em>hrs</em></strong></div></article>
      <article className="student-summary-card"><span className="metric-icon green"><Icon name="shield" /></span><div><span>PLAN</span><strong className="billing-plan-text">Tier 1</strong></div></article>
      <article className="student-summary-card"><span className="metric-icon orange"><Icon name="chart" /></span><div><span>TOTAL PAID</span><strong>${totalSpent.toFixed(0)}</strong></div></article>
    </section>

    <div className="student-billing-grid">
      <section className="panel student-panel student-wallet-card">
        <div className="panel-header"><div><h2>Credit wallet</h2><p>Institutional plan · renewed monthly</p></div><span className="student-wallet-badge"><Icon name="shield" size={12} /> Secured</span></div>
        <div className="wallet-balance"><span>Hours remaining</span><strong>{creditHours.toFixed(1)}</strong><small>About {Math.floor(creditHours / (25 / 60))} 25-minute lessons</small></div>
        <div className="wallet-progress"><div className="bar"><i style={{ width: `${Math.min(100, (creditHours / 40) * 100)}%` }} /></div><div><span>0 hrs</span><span>40 hr plan cap</span></div></div>
        <div className="wallet-renew"><div><span className="metric-icon green"><Icon name="repeat" /></span><div><strong>Auto-renew is {autoRenew ? "active" : "paused"}</strong><small>Recharges 10 hours on the 1st of each month.</small></div></div><button type="button" className={`student-toggle-button ${autoRenew ? "active" : ""}`} onClick={() => { setAutoRenew((value) => !value); onNotice(`Auto-renew ${autoRenew ? "paused" : "activated"}.`); }}>{autoRenew ? "On" : "Off"}</button></div>
        <div className="wallet-actions"><button type="button" className="primary-button" onClick={() => setBuyOpen(true)}>Buy credits</button><button type="button" className="secondary-button" onClick={() => onNotice("Billing statements are emailed monthly to your registered address.")}><Icon name="mail" size={14} /> Billing settings</button></div>
      </section>

      <section className="panel student-panel">
        <div className="panel-header"><div><h2>Payment method</h2><p>Used for automatic renewals</p></div></div>
        <div className="payment-card">
          <div className="payment-card-top"><span className="payment-brand">VISA</span><Icon name="lock" size={14} /></div>
          <strong>•••• •••• •••• 4242</strong>
          <div><span>Expires 08/29</span><span>Mia Chen</span></div>
        </div>
        <div className="payment-actions"><button type="button" className="secondary-button full-width" onClick={() => onNotice("Payment method update form opened.")}><Icon name="edit" size={14} /> Update payment method</button><p>Payments are encrypted and processed securely by the school&apos;s billing provider.</p></div>
      </section>

      <section className="panel student-panel student-billing-history">
        <div className="panel-header"><div><h2>Billing history</h2><p>Invoices and credit changes for your account</p></div><span className="setting-count">{transactions.length} records</span></div>
        <div className="billing-table-wrap">
          <table className="billing-table">
            <thead><tr><th>Date</th><th>Description</th><th>Hours</th><th>Amount</th><th>Status</th><th /></tr></thead>
            <tbody>{transactions.map((transaction) => <tr key={transaction.id}>
              <td data-label="Date">{transaction.date}</td>
              <td data-label="Description"><strong>{transaction.description}</strong></td>
              <td data-label="Hours" className="tabular">{transaction.hours > 0 ? "+" : ""}{transaction.hours} hrs</td>
              <td data-label="Amount" className="tabular">${transaction.amount.toFixed(2)}</td>
              <td data-label="Status"><span className={`billing-status ${transaction.status}`}>{transaction.status}</span></td>
              <td className="billing-invoice-cell"><button type="button" className="icon-text-button" onClick={() => downloadInvoice(transaction)}><Icon name="download" size={13} /> Invoice</button></td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="panel student-panel billing-help">
        <div className="metric-icon blue"><Icon name="help" /></div>
        <div><h2>Questions about billing?</h2><p>Your school administrator manages institutional plans and invoices. Contact support if a credit is missing.</p></div>
        <button type="button" className="secondary-button" onClick={() => onNotice("Billing support request opened.")}><Icon name="message" size={14} /> Contact support</button>
      </section>
    </div>

    {buyOpen && <StudentModal eyebrow="BUY CREDITS" title="Add lesson hours" description="Choose a credit pack. Hours are added instantly and can be used to book any tutor." onClose={() => setBuyOpen(false)}
      footer={<><button type="button" className="cancel-button" onClick={() => setBuyOpen(false)}>Cancel</button><button type="button" className="primary-button" onClick={buyCredits}><Icon name="wallet" size={15} /> Pay ${selected.price}</button></>}>
      <div className="purchase-options">
        {creditPackages.map((pack, index) => <button type="button" className={`purchase-option ${selectedPackage === index ? "active" : ""}`} key={pack.hours} onClick={() => setSelectedPackage(index)}>
          <span className="purchase-radio">{selectedPackage === index && <i />}</span>
          <span className="purchase-copy"><strong>{pack.label}</strong><small>{pack.detail}</small></span>
          <span className="purchase-price">${pack.price}</span>
        </button>)}
      </div>
      <div className="purchase-summary"><span>New balance</span><strong>{(creditHours + selected.hours).toFixed(1)} hours</strong></div>
      <div className="lesson-callout"><Icon name="shield" size={16} /><div><strong>Secure checkout</strong><p>This demo does not process a real payment. Your wallet balance and billing history update locally.</p></div></div>
    </StudentModal>}
  </div>;
}
