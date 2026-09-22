import React, { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../services/api";
import { useAuth } from "../context/AuthContext";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Landmark,
  Loader2,
  Plus,
  ReceiptText,
  Search,
  Tag,
  TrendingDown,
  X,
} from "lucide-react";

interface Account {
  _id: string;
  name: string;
  channel: string;
  accountType: string;
  derivedBalance: number;
}
interface Expense {
  _id: string;
  expenseNumber: string;
  amount: number;
  category: string;
  date: string;
  description: string;
  receiptUrl?: string;
  notes?: string;
  custodyAccountId: { _id: string; name: string; channel: string };
  createdBy: { name: string; email: string; accountantType?: string };
  custodyMovementId?: {
    movementType: string;
    amount: number;
    sourceType: string;
    date: string;
    description?: string;
  };
}
interface Stats {
  totalExpense: number;
  count: number;
  averageExpense: number;
  currentMonthTotal: number;
  largestCategory: { category: string; total: number } | null;
  byCategory: Array<{ category: string; total: number; count: number }>;
  byAccount: Array<{
    _id: string;
    name?: string;
    channel?: string;
    total: number;
    count: number;
  }>;
  monthlyTrend: Array<{ month: string; total: number; count: number }>;
}
const categories = [
  "Administration",
  "Banking & Fees",
  "Office & Supplies",
  "Transport",
  "Meeting & Events",
  "Legal & Compliance",
  "Utilities",
  "Technology",
  "Other",
];
const money = (amount: number) =>
  `BDT ${Number(amount || 0).toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);

export const ExpensesPage: React.FC = () => {
  const { user } = useAuth();
  const canCreate = user?.role === "ADMIN" || user?.role === "ACCOUNTANT";
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [accountId, setAccountId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<Expense | null>(null);
  const [form, setForm] = useState({
    custodyAccountId: "",
    amount: "",
    category: "Administration",
    customCategory: "",
    date: today(),
    description: "",
    notes: "",
    receiptUrl: "",
  });
  const query = useCallback(
    () =>
      new URLSearchParams(
        Object.entries({
          page: String(page),
          limit: "15",
          search,
          category,
          custodyAccountId: accountId,
          startDate,
          endDate,
        }).filter(([, value]) => value),
      ).toString(),
    [page, search, category, accountId, startDate, endDate],
  );
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = query();
      const [list, summary, custody] = await Promise.all([
        apiRequest<Expense[]>(`/expenses?${params}`),
        apiRequest<Stats>(`/expenses/stats?${params}`),
        apiRequest<Account[]>("/custody/accounts?isActive=true"),
      ]);
      setExpenses(list.data);
      setTotalPages(list.pagination?.totalPages || 1);
      setTotal(list.pagination?.total || 0);
      setStats(summary.data);
      const eligible = custody.data.filter(
        (item) => item.accountType === "ACCOUNTANT_CUSTODY",
      );
      setAccounts(eligible);
      if (!form.custodyAccountId && eligible[0])
        setForm((prev) => ({ ...prev, custodyAccountId: eligible[0]._id }));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load expense data.",
      );
    } finally {
      setLoading(false);
    }
  }, [form.custodyAccountId, query]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!error && !notice) return;
    const timer = window.setTimeout(() => {
      setError(null);
      setNotice(null);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [error, notice]);
  const resetFilters = () => {
    setSearch("");
    setCategory("");
    setAccountId("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const selectedCategory =
      form.category === "Other" ? form.customCategory.trim() : form.category;
    if (
      !form.custodyAccountId ||
      !form.amount ||
      !selectedCategory ||
      !form.description.trim()
    ) {
      setError(
        "Source account, amount, category, and description are required.",
      );
      return;
    }
    try {
      setSaving(true);
      const result = await apiRequest("/expenses", {
        method: "POST",
        body: JSON.stringify({
          custodyAccountId: form.custodyAccountId,
          amount: Number(form.amount),
          category: selectedCategory,
          date: form.date,
          description: form.description,
          notes: form.notes,
          receiptUrl: form.receiptUrl,
        }),
      });
      setNotice(result.message || "Expense recorded successfully.");
      setFormOpen(false);
      setForm({
        custodyAccountId: accounts[0]?._id || "",
        amount: "",
        category: "Administration",
        customCategory: "",
        date: today(),
        description: "",
        notes: "",
        receiptUrl: "",
      });
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to record expense.",
      );
    } finally {
      setSaving(false);
    }
  };
  const selectExpense = async (expense: Expense) => {
    try {
      const result = await apiRequest<Expense>(`/expenses/${expense._id}`);
      setSelected(result.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load expense details.",
      );
    }
  };
  const statCards = [
    {
      label: "Selected-period expenses",
      value: money(stats?.totalExpense || 0),
      icon: TrendingDown,
      color: "text-rose-300",
    },
    {
      label: "Current-month expenses",
      value: money(stats?.currentMonthTotal || 0),
      icon: ReceiptText,
      color: "text-amber-300",
    },
    {
      label: "Expense transactions",
      value: String(stats?.count || 0),
      icon: FileText,
      color: "text-blue-300",
    },
    {
      label: "Largest category",
      value: stats?.largestCategory?.category || "—",
      icon: Tag,
      color: "text-violet-300",
      caption: stats?.largestCategory
        ? money(stats.largestCategory.total)
        : undefined,
    },
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-rose-400">
            <ReceiptText size={20} />
            <span className="text-xs font-bold uppercase tracking-wider">
              Operational Finance
            </span>
          </div>
          <h2 className="mt-1 text-2xl font-bold text-white">
            Expense Management
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            Record and review operational cash-out events without mixing them
            with investments, transfers, or member contributions.
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setFormOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/15 px-4 py-2.5 text-sm font-semibold text-rose-100 shadow-sm transition-colors hover:bg-rose-500/25"
          >
            <Plus size={17} />
            Record expense
          </button>
        )}
      </div>
      {error && <Alert color="red" text={error} />}
      {notice && <Alert color="emerald" text={notice} />}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(({ label, value, icon: Icon, color, caption }) => (
          <div
            key={label}
            className="rounded-2xl border border-white/10 bg-[#111827] p-5 shadow-lg"
          >
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-gray-400">{label}</p>
              <Icon size={20} className={color} />
            </div>
            <p
              className="mt-3 truncate text-2xl font-bold text-white"
              title={value}
            >
              {value}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {caption ||
                (label === "Expense transactions"
                  ? "Immutable ledger events"
                  : label === "Largest category"
                    ? "No expense in selected period"
                    : "Filtered live total")}
            </p>
          </div>
        ))}
      </div>
      <section className="rounded-2xl border border-white/10 bg-[#111827]">
        <div className="flex flex-col gap-3 border-b border-white/10 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              className="input-field w-full pl-9"
              placeholder="Search expense number, category, or description…"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <select
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setPage(1);
              }}
              className="input-field"
            >
              <option value="">All categories</option>
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <select
              value={accountId}
              onChange={(event) => {
                setAccountId(event.target.value);
                setPage(1);
              }}
              className="input-field"
            >
              <option value="">All accounts</option>
              {accounts.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <input
              aria-label="Start date"
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                setPage(1);
              }}
              className="input-field"
            />
            <input
              aria-label="End date"
              type="date"
              value={endDate}
              onChange={(event) => {
                setEndDate(event.target.value);
                setPage(1);
              }}
              className="input-field"
            />
          </div>
          <button
            onClick={resetFilters}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-gray-400 hover:bg-white/5 hover:text-white"
          >
            Reset
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-xs">
            <thead className="bg-white/[0.025] text-gray-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Expense</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Source account</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                <th className="px-5 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-gray-400">
                    <Loader2 className="mx-auto mb-2 animate-spin" size={20} />
                    Loading expenses…
                  </td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-gray-400">
                    No expenses match the current filters.
                  </td>
                </tr>
              ) : (
                expenses.map((expense) => (
                  <tr
                    key={expense._id}
                    className="transition-colors hover:bg-white/[0.025]"
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold text-white">
                        {expense.expenseNumber}
                      </p>
                      <p className="mt-1 max-w-[230px] truncate text-gray-500">
                        {expense.description}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-gray-300">
                      {new Date(expense.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-1 text-violet-200">
                        {expense.category}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-gray-200">
                        {expense.custodyAccountId?.name || "—"}
                      </p>
                      <p className="mt-1 text-gray-500">
                        {expense.custodyAccountId?.channel || ""}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-right font-bold text-rose-300">
                      {money(expense.amount)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => selectExpense(expense)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600/70 bg-slate-800 px-3 py-2 font-semibold text-slate-100 transition-colors hover:bg-slate-700"
                      >
                        <FileText size={14} />
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-white/10 px-5 py-3 text-xs text-gray-400 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {total} total expense{total === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page === 1}
              className="rounded p-1.5 hover:bg-white/10 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() =>
                setPage((value) => Math.min(totalPages, value + 1))
              }
              disabled={page === totalPages}
              className="rounded p-1.5 hover:bg-white/10 disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
      {stats && (
        <section className="grid gap-4 lg:grid-cols-2">
          <Breakdown
            title="Expense by category"
            empty="No category totals for these filters."
            items={stats.byCategory.map((item) => ({
              label: item.category,
              amount: item.total,
              count: item.count,
            }))}
            icon={Tag}
            tone="violet"
          />
          <Breakdown
            title="Expense by paying account"
            empty="No account totals for these filters."
            items={stats.byAccount.map((item) => ({
              label: item.name || "Unknown account",
              amount: item.total,
              count: item.count,
              caption: item.channel,
            }))}
            icon={Landmark}
            tone="blue"
          />
        </section>
      )}
      {formOpen && (
        <Modal
          title="Record operational expense"
          onClose={() => setFormOpen(false)}
        >
          <form onSubmit={submit} className="space-y-4">
            <p className="rounded-lg border border-rose-400/20 bg-rose-500/10 p-3 text-xs text-rose-100">
              This posts one immutable Expense record and one linked{" "}
              <b>OUT / EXPENSE</b> custody movement. It does not affect
              investment returns or transfers.
            </p>
            <Select
              label="Paying accountant custody"
              value={form.custodyAccountId}
              onChange={(value) =>
                setForm({ ...form, custodyAccountId: value })
              }
              options={accounts.map((item) => [
                item._id,
                `${item.name} (${money(item.derivedBalance)} available)`,
              ])}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Amount"
                type="number"
                min="0.01"
                value={form.amount}
                onChange={(value) => setForm({ ...form, amount: value })}
              />
              <Input
                label="Expense date"
                type="date"
                value={form.date}
                onChange={(value) => setForm({ ...form, date: value })}
              />
            </div>
            <Select
              label="Category"
              value={form.category}
              onChange={(value) => setForm({ ...form, category: value })}
              options={categories.map((item) => [item, item])}
            />
            {form.category === "Other" && (
              <Input
                label="Custom category"
                type="text"
                value={form.customCategory}
                onChange={(value) =>
                  setForm({ ...form, customCategory: value })
                }
              />
            )}
            <TextArea
              label="Description"
              required
              value={form.description}
              onChange={(value) => setForm({ ...form, description: value })}
            />
            <Input
              label="Receipt URL (optional)"
              type="url"
              value={form.receiptUrl}
              onChange={(value) => setForm({ ...form, receiptUrl: value })}
            />
            <TextArea
              label="Notes (optional)"
              value={form.notes}
              onChange={(value) => setForm({ ...form, notes: value })}
            />
            <button
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-100 transition-colors hover:bg-rose-500/25 disabled:opacity-50"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              {saving ? "Recording…" : "Record expense"}
            </button>
          </form>
        </Modal>
      )}
      {selected && (
        <Modal
          title={`Expense ${selected.expenseNumber}`}
          onClose={() => setSelected(null)}
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between rounded-xl border border-white/10 bg-black/15 p-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Amount
                </p>
                <p className="mt-1 text-2xl font-bold text-rose-300">
                  {money(selected.amount)}
                </p>
              </div>
              <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-1 text-xs text-violet-200">
                {selected.category}
              </span>
            </div>
            <Detail label="Description" value={selected.description} />
            <Detail
              label="Paying account"
              value={`${selected.custodyAccountId?.name || "—"}${selected.custodyAccountId?.channel ? ` · ${selected.custodyAccountId.channel}` : ""}`}
            />
            <Detail
              label="Recorded by"
              value={selected.createdBy?.name || "—"}
            />
            <Detail
              label="Date"
              value={new Date(selected.date).toLocaleDateString()}
            />
            {selected.notes && <Detail label="Notes" value={selected.notes} />}
            {selected.receiptUrl && (
              <a
                href={selected.receiptUrl}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-sm font-semibold text-blue-200 hover:bg-blue-500/20"
              >
                Open receipt reference
              </a>
            )}
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                Linked custody ledger event
              </p>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-emerald-100">
                  {selected.custodyMovementId?.movementType || "OUT"} /{" "}
                  {selected.custodyMovementId?.sourceType || "EXPENSE"}
                </span>
                <span className="font-bold text-white">
                  {money(selected.custodyMovementId?.amount || selected.amount)}
                </span>
              </div>
              <p className="mt-2 text-xs text-emerald-100/70">
                {selected.custodyMovementId?.description ||
                  "Immutable expense movement"}
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
const Alert: React.FC<{ color: "red" | "emerald"; text: string }> = ({
  color,
  text,
}) => (
  <div
    className={`rounded-xl border px-4 py-3 text-sm ${color === "red" ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"}`}
  >
    {text}
  </div>
);
const Modal: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
    <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-[#111827] shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <h3 className="font-semibold text-white">{title}</h3>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-gray-400 hover:bg-white/10 hover:text-white"
          aria-label="Close"
        >
          <X size={19} />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);
const Select: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}> = ({ label, value, onChange, options }) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-medium text-gray-300">
      {label}
    </span>
    <select
      required
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="input-field w-full"
    >
      <option value="">Select…</option>
      {options.map(([id, text]) => (
        <option key={id} value={id}>
          {text}
        </option>
      ))}
    </select>
  </label>
);
const Input: React.FC<{
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
}> = ({ label, type, value, onChange, min }) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-medium text-gray-300">
      {label}
    </span>
    <input
      required={label !== "Receipt URL (optional)"}
      type={type}
      value={value}
      min={min}
      onChange={(event) => onChange(event.target.value)}
      className="input-field w-full"
    />
  </label>
);
const TextArea: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}> = ({ label, value, onChange, required }) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-medium text-gray-300">
      {label}
    </span>
    <textarea
      required={required}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={3}
      className="input-field w-full resize-y"
    />
  </label>
);
const Detail: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
      {label}
    </p>
    <p className="mt-1 text-sm text-gray-200">{value}</p>
  </div>
);
const Breakdown: React.FC<{
  title: string;
  empty: string;
  items: Array<{
    label: string;
    amount: number;
    count: number;
    caption?: string;
  }>;
  icon: React.ElementType;
  tone: "violet" | "blue";
}> = ({ title, empty, items, icon: Icon, tone }) => (
  <div className="rounded-2xl border border-white/10 bg-[#111827] p-5">
    <div className="flex items-center gap-2">
      <Icon
        size={18}
        className={tone === "violet" ? "text-violet-300" : "text-blue-300"}
      />
      <h3 className="font-semibold text-white">{title}</h3>
    </div>
    {items.length === 0 ? (
      <p className="py-8 text-center text-sm text-gray-500">{empty}</p>
    ) : (
      <div className="mt-4 space-y-3">
        {items.slice(0, 6).map((item) => (
          <div key={item.label}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-gray-300">
                {item.label}
                {item.caption ? ` · ${item.caption}` : ""}
              </span>
              <span className="shrink-0 font-semibold text-white">
                {money(item.amount)}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div
                className={`h-full rounded-full ${tone === "violet" ? "bg-violet-400" : "bg-blue-400"}`}
                style={{
                  width: `${Math.min(100, (item.amount / (items[0]?.amount || 1)) * 100)}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);
