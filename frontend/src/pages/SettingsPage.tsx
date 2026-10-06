import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Landmark,
  Plus,
  Save,
  Settings2,
  ShieldCheck,
  X,
  Shield,
  Lock,
  Check,
  Eye,
  Pencil,
  Trash2,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../services/api";
import { usePreferences } from "../context/PreferencesContext";

interface ShareSetting {
  value: number;
  description: string;
  updatedAt: string | null;
  isDefault: boolean;
}

interface PenaltyRule {
  _id: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  ratePerShare: number;
  graceDayOfMonth: number;
  description?: string;
}

interface PenaltyWaiver {
  _id: string;
  month: string;
  isGlobal: boolean;
  reason: string;
  memberId?: { memberId: string; name: string } | null;
}

interface GatewayRate {
  _id: string;
  channel: "BKASH" | "NAGAD" | "BANK" | "CASH" | string;
  cashoutRatePercentage: number;
  fixedFee: number;
  roundingIncrement: number;
  description?: string;
  isDefault?: boolean;
}

interface StaffMember {
  _id: string;
  name: string;
  email: string;
  accountantType: "PRIMARY" | "ASSISTANT";
  linkedGatewayChannels?: string[];
  gatewayAccessKeyPrefix?: string;
  status: string;
}
interface StaffCandidate {
  _id: string;
  name: string;
  email: string;
  role: string;
  accountantType?: "PRIMARY" | "ASSISTANT" | null;
  memberId?: { _id: string; memberId: string; name: string } | null;
}
interface CustodyAccountOption {
  _id: string;
  name: string;
  channel: "BKASH" | "NAGAD" | "BANK" | "CASH" | string;
  isActive: boolean;
  holderId?: { _id: string; name: string } | null;
}
interface MemberTransparency {
  showCollections: boolean;
  showExpenses: boolean;
  showInvestmentProjects: boolean;
  showRealizedProfit: boolean;
  showExpectedProfit: boolean;
  allowAnnualProfitLossDownload: boolean;
}

export interface RoleModulePermissions {
  roleOrDesignation: string;
  modules: Record<string, { canView: boolean; canEdit: boolean }>;
  isCustomized: boolean;
  updatedAt: string | null;
}

export const MODULE_DEFINITIONS = [
  {
    key: "DASHBOARD",
    label: "Dashboard & Reports",
    desc: "Organization dashboard, financial overview, and report summaries",
  },
  {
    key: "DOCUMENTS",
    label: "Statements & Reports",
    desc: "Member statements, reports, and downloadable audit documents",
  },
  {
    key: "MEMBERS",
    label: "Member Management",
    desc: "Member registry, share allocations, profiles",
  },
  {
    key: "SHARES",
    label: "Shares & Annual Account",
    desc: "Share positions, transfers, and annual account reconciliation",
  },
  {
    key: "PAYMENTS",
    label: "Contributions & Payments",
    desc: "Payment recording, preview, penalty waivers, OCR receipts",
  },
  {
    key: "CUSTODY",
    label: "Accountant Custody Ledger",
    desc: "Bank/cash accounts, inter-custodian transfers, reconciliation",
  },
  {
    key: "INVESTMENTS",
    label: "Investment Management",
    desc: "Capital investments, project tracking, return distributions",
  },
  {
    key: "PROJECT_WALLETS",
    label: "Project Wallets & Reinvestment",
    desc: "Project wallet balances, reinvestment chains, and capital lineage",
  },
  {
    key: "EXPENSES",
    label: "Expense Management",
    desc: "Operational expenses and payment-account reporting",
  },
  {
    key: "REPORTS",
    label: "Financial Reports & Distribution",
    desc: "Annual closing, dividend calculations, audit statements",
  },
  {
    key: "GOVERNANCE",
    label: "Annual Governance",
    desc: "Resolutions, annual general meetings, official minutes",
  },
  {
    key: "SETTINGS",
    label: "System Settings",
    desc: "Share rates, gateway rules, operational end year, RBAC matrix",
  },
  {
    key: "AUDIT",
    label: "Audit & Security",
    desc: "Audit trails, access history, and security monitoring",
  },
  {
    key: "MIGRATIONS",
    label: "Historical Migration",
    desc: "Staged historical data import and reconciliation review",
  },
  {
    key: "DISTRIBUTION",
    label: "Final Distribution",
    desc: "Final member distribution and annual settlement workflow",
  },
];

const money = new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
  maximumFractionDigits: 0,
});

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface MonthYearPickerProps {
  value: string; // "YYYY-MM" or ""
  onChange: (value: string) => void;
  required?: boolean;
  label: string;
  allowClear?: boolean;
  clearLabel?: string;
  minYear?: number;
  maxYear?: number;
}

const MonthYearPicker: React.FC<MonthYearPickerProps> = ({
  value,
  onChange,
  required = false,
  label,
  allowClear = false,
  clearLabel = "Ongoing (No end date)",
  minYear = 2020,
  maxYear = 2035,
}) => {
  const { t } = usePreferences();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const parsedYear = value ? parseInt(value.split("-")[0], 10) : new Date().getFullYear();
  const [viewYear, setViewYear] = useState<number>(parsedYear || new Date().getFullYear());

  useEffect(() => {
    if (value) {
      const y = parseInt(value.split("-")[0], 10);
      if (!isNaN(y)) setViewYear(y);
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const selectMonth = (monthIndex: number) => {
    const mStr = String(monthIndex + 1).padStart(2, "0");
    onChange(`${viewYear}-${mStr}`);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setIsOpen(false);
  };

  const formattedDisplay = value ? (() => {
    const [y, m] = value.split("-");
    const mIdx = parseInt(m, 10) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      return `${t(MONTH_NAMES[mIdx])} ${y}`;
    }
    return value;
  })() : allowClear ? t(clearLabel) : t("Select Month & Year");

  return (
    <div className="form-group mb-0 relative" ref={containerRef}>
      <label className="form-label flex items-center justify-between">
        <span>{label} {required && <span className="text-rose-400">*</span>}</span>
        {value && (
          <span className="text-[11px] font-mono text-indigo-300 font-semibold">{value}</span>
        )}
      </label>
      
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`form-input flex items-center justify-between text-left cursor-pointer w-full transition-all ${
          isOpen ? "ring-2 ring-indigo-500 border-indigo-500" : ""
        } ${!value && !allowClear ? "text-gray-400" : "text-white"}`}
      >
        <span className="flex items-center gap-2 truncate">
          <Calendar size={15} className="text-indigo-400 shrink-0" />
          <span className="font-medium text-sm">{formattedDisplay}</span>
        </span>
        <span className="text-xs text-gray-400 shrink-0 ml-2">
          {isOpen ? "▲" : "▼"}
        </span>
      </button>

      <input
        type="text"
        required={required}
        value={value}
        onChange={() => {}}
        tabIndex={-1}
        className="sr-only"
        aria-hidden="true"
      />

      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-slate-900/95 border border-white/15 rounded-xl shadow-2xl shadow-black/80 p-3.5 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between pb-2.5 border-b border-white/10 mb-2.5">
            <button
              type="button"
              onClick={() => setViewYear((y) => Math.max(minYear, y - 1))}
              disabled={viewYear <= minYear}
              className="p-1 rounded hover:bg-white/10 text-gray-300 hover:text-white disabled:opacity-30"
              title="Previous Year"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center gap-2">
              <select
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                className="bg-slate-800 text-white font-bold text-sm px-2.5 py-1 rounded border border-white/15 focus:outline-none focus:border-indigo-500"
              >
                {Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i).map((y) => (
                  <option key={y} value={y} className="bg-slate-900 text-white">
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setViewYear((y) => Math.min(maxYear, y + 1))}
              disabled={viewYear >= maxYear}
              className="p-1 rounded hover:bg-white/10 text-gray-300 hover:text-white disabled:opacity-30"
              title="Next Year"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {MONTH_NAMES.map((name, idx) => {
              const isSelected = value === `${viewYear}-${String(idx + 1).padStart(2, "0")}`;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => selectMonth(idx)}
                  className={`py-2 px-1 text-xs rounded-lg font-medium transition-all text-center ${
                    isSelected
                      ? "bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-600/30 border border-indigo-400/50"
                      : "bg-slate-800/80 hover:bg-white/10 text-gray-300 hover:text-white border border-transparent"
                  }`}
                >
                  {t(name)}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-white/10 text-xs">
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                setViewYear(now.getFullYear());
                selectMonth(now.getMonth());
              }}
              className="text-indigo-400 hover:text-indigo-300 hover:underline"
            >
              {t("This Month")}
            </button>
            {allowClear && (
              <button
                type="button"
                onClick={handleClear}
                className="text-amber-400 hover:text-amber-300 hover:underline"
              >
                {t(clearLabel)}
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-gray-200"
            >
              {t("Close")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const SettingsPage: React.FC = () => {
  const { t } = usePreferences();
  const { user, canAccess } = useAuth();
  const isAdmin = canAccess("SETTINGS", "view");
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const canManageMemberTransparency =
    user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const [setting, setSetting] = useState<ShareSetting>({
    value: 500,
    description: "",
    updatedAt: null,
    isDefault: true,
  });
  const [shareAmount, setShareAmount] = useState("500");
  const [rules, setRules] = useState<PenaltyRule[]>([]);
  const [waivers, setWaivers] = useState<PenaltyWaiver[]>([]);
  const [gatewayRates, setGatewayRates] = useState<GatewayRate[]>([]);
  const [operationalEndYear, setOperationalEndYear] = useState("2028");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [permissionsList, setPermissionsList] = useState<
    RoleModulePermissions[]
  >([]);
  const [memberTransparency, setMemberTransparency] =
    useState<MemberTransparency>({
      showCollections: true,
      showExpenses: true,
      showInvestmentProjects: true,
      showRealizedProfit: true,
      showExpectedProfit: true,
      allowAnnualProfitLossDownload: true,
    });
  const [selectedRoleKey, setSelectedRoleKey] = useState<string>("DIRECTOR");
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showRule, setShowRule] = useState(false);
  const [showWaiver, setShowWaiver] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingWaiverId, setEditingWaiverId] = useState<string | null>(null);
  const [viewingPolicy, setViewingPolicy] = useState<{ title: string; rows: Array<[string, string]> } | null>(null);
  const [deletePolicy, setDeletePolicy] = useState<{ type: "rule" | "waiver"; id: string; label: string } | null>(null);
  const [editingGateway, setEditingGateway] = useState<GatewayRate | null>(
    null,
  );
  const [showStaff, setShowStaff] = useState(false);
  const [showAppointment, setShowAppointment] = useState(false);
  const [handoverFrom, setHandoverFrom] = useState<StaffMember | null>(null);
  const [confirmStaffAction, setConfirmStaffAction] = useState<{
    type: "HANDOVER" | "REVOKE";
    member: StaffMember;
  } | null>(null);
  const [staffCandidates, setStaffCandidates] = useState<StaffCandidate[]>([]);
  const [custodyAccounts, setCustodyAccounts] = useState<
    CustodyAccountOption[]
  >([]);
  const [newRoutingKey, setNewRoutingKey] = useState<string | null>(null);
  const [staffForm, setStaffForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    accountantType: "ASSISTANT",
    linkedGatewayChannels: [] as string[],
  });
  const [appointmentForm, setAppointmentForm] = useState({
    userId: "",
    accountantType: "ASSISTANT",
    linkedGatewayChannels: [] as string[],
    reason: "",
  });
  const [handoverForm, setHandoverForm] = useState({
    successorUserId: "",
    successorCustodyAccountIds: [] as string[],
    linkedGatewayChannels: [] as string[],
    reason: "",
  });
  const [ruleForm, setRuleForm] = useState({
    effectiveFrom: "",
    effectiveTo: "",
    ratePerShare: "40",
    graceDayOfMonth: "15",
    description: "",
  });
  const [waiverForm, setWaiverForm] = useState({ month: "", reason: "" });

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [
        shareRes,
        ruleRes,
        waiverRes,
        gatewayRes,
        endYearRes,
        staffRes,
        candidatesRes,
        custodyRes,
        permRes,
        transparencyRes,
      ] = await Promise.all([
        apiRequest<ShareSetting>("/settings/share-amount"),
        apiRequest<PenaltyRule[]>("/settings/penalty-rules"),
        apiRequest<PenaltyWaiver[]>("/settings/penalty-waivers"),
        apiRequest<GatewayRate[]>("/settings/gateway-rates"),
        apiRequest<{ value: number }>("/settings/operational-end-year"),
        apiRequest<StaffMember[]>("/auth/staff"),
        apiRequest<StaffCandidate[]>("/auth/staff/candidates"),
        apiRequest<CustodyAccountOption[]>("/custody/accounts").catch(() => ({
          data: [],
        })),
        apiRequest<RoleModulePermissions[]>("/settings/permissions").catch(
          () => ({ data: [] }),
        ),
        apiRequest<MemberTransparency>("/settings/member-transparency"),
      ]);
      const loadedSetting = shareRes.data;
      setSetting(loadedSetting);
      setShareAmount(String(loadedSetting.value));
      setRules(ruleRes.data || []);
      setWaivers(waiverRes.data || []);
      setGatewayRates(gatewayRes.data || []);
      setOperationalEndYear(String(endYearRes.data?.value || 2028));
      setStaff(staffRes.data || []);
      setStaffCandidates(candidatesRes.data || []);
      setCustodyAccounts(custodyRes.data || []);
      setPermissionsList(permRes.data || []);
      setMemberTransparency(transparencyRes.data);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const saveShareAmount = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      await apiRequest("/settings/share-amount", {
        method: "POST",
        body: JSON.stringify({ value: Number(shareAmount) }),
      });
      setNotice(
        "The organization share amount has been updated. New member and payment previews now use this rule.",
      );
      await loadSettings();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveEndYear = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiRequest("/settings/operational-end-year", {
        method: "POST",
        body: JSON.stringify({ value: Number(operationalEndYear) }),
      });
      setNotice("Operational end year saved.");
      await loadSettings();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveMemberTransparency = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiRequest("/settings/member-transparency", {
        method: "PUT",
        body: JSON.stringify(memberTransparency),
      });
      setNotice("Member organization-information permissions updated.");
      await loadSettings();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const provisionStaff = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await apiRequest<{ gatewayAccessKey: string }>(
        "/auth/staff",
        { method: "POST", body: JSON.stringify(staffForm) },
      );
      setShowStaff(false);
      setNewRoutingKey(response.data.gatewayAccessKey);
      setNotice("Staff access provisioned. Save the routing key shown below.");
      await loadSettings();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const offboardStaff = (staffMember: StaffMember) =>
    setConfirmStaffAction({ type: "REVOKE", member: staffMember });
  const confirmOffboardStaff = async (staffMember: StaffMember) => {
    setSaving(true);
    setError(null);
    try {
      await apiRequest(`/auth/staff/${staffMember._id}/offboard`, {
        method: "POST",
      });
      setNotice(
        `${staffMember.name}'s sessions and gateway access were revoked.`,
      );
      await loadSettings();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const appointMemberStaff = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await apiRequest<{ gatewayAccessKey: string }>(
        "/auth/staff/appoint-member",
        { method: "POST", body: JSON.stringify(appointmentForm) },
      );
      setShowAppointment(false);
      setNewRoutingKey(response.data.gatewayAccessKey);
      setNotice(
        "Member appointed to the operational responsibility. Create custody accounts before collecting payments.",
      );
      await loadSettings();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handoverStaff = async () => {
    if (!handoverFrom) return;
    setSaving(true);
    setError(null);
    try {
      const response = await apiRequest<{ gatewayAccessKey: string }>(
        "/auth/staff/handover",
        {
          method: "POST",
          body: JSON.stringify({
            ...handoverForm,
            outgoingStaffId: handoverFrom._id,
          }),
        },
      );
      setHandoverFrom(null);
      setNewRoutingKey(response.data.gatewayAccessKey);
      setNotice(
        `Responsibility handed over from ${handoverFrom.name}. Historical records remain unchanged.`,
      );
      await loadSettings();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveRule = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiRequest(editingRuleId ? `/settings/penalty-rules/${editingRuleId}` : "/settings/penalty-rules", {
        method: editingRuleId ? "PUT" : "POST",
        body: JSON.stringify({
          ...ruleForm,
          ratePerShare: Number(ruleForm.ratePerShare),
          graceDayOfMonth: Number(ruleForm.graceDayOfMonth),
        }),
      });
      setShowRule(false);
      setEditingRuleId(null);
      setNotice(editingRuleId ? "Penalty rule updated." : "Penalty rule saved.");
      await loadSettings();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveWaiver = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const currentWaiver = waivers.find((w) => w._id === editingWaiverId);
      await apiRequest(editingWaiverId ? `/settings/penalty-waivers/${editingWaiverId}` : "/settings/penalty-waivers", {
        method: editingWaiverId ? "PUT" : "POST",
        body: JSON.stringify({
          ...waiverForm,
          isGlobal: currentWaiver ? currentWaiver.isGlobal : true,
        }),
      });
      setShowWaiver(false);
      setEditingWaiverId(null);
      setNotice(editingWaiverId ? "Penalty waiver updated." : "Monthly penalty waiver granted.");
      await loadSettings();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const removePolicy = async () => {
    if (!deletePolicy) return;
    setSaving(true); setError(null);
    try {
      await apiRequest(`/settings/${deletePolicy.type === "rule" ? "penalty-rules" : "penalty-waivers"}/${deletePolicy.id}`, { method: "DELETE" });
      setNotice(deletePolicy.type === "rule" ? "Penalty rule deleted." : "Penalty waiver deleted.");
      setDeletePolicy(null);
      await loadSettings();
    } catch (requestError) { setError((requestError as Error).message); }
    finally { setSaving(false); }
  };

  const saveGatewayRate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingGateway) return;
    setError(null);
    setSaving(true);
    try {
      await apiRequest("/settings/gateway-rates", {
        method: "PUT",
        body: JSON.stringify({
          channel: editingGateway.channel,
          cashoutRatePercentage: Number(editingGateway.cashoutRatePercentage),
          fixedFee: Number(editingGateway.fixedFee),
          roundingIncrement: Number(editingGateway.roundingIncrement ?? 0),
          description: editingGateway.description || "",
        }),
      });
      setEditingGateway(null);
      setNotice(`${editingGateway.channel} cash-out rule saved.`);
      await loadSettings();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePerm = (
    moduleKey: string,
    field: "canView" | "canEdit",
  ) => {
    if (!isSuperAdmin) return;
    setPermissionsList((prev) =>
      prev.map((item) => {
        if (item.roleOrDesignation !== selectedRoleKey) return item;
        const currentMod = item.modules[moduleKey] || {
          canView: false,
          canEdit: false,
        };
        const updatedMod = { ...currentMod, [field]: !currentMod[field] };
        if (field === "canView" && !updatedMod.canView)
          updatedMod.canEdit = false;
        if (field === "canEdit" && updatedMod.canEdit)
          updatedMod.canView = true;
        return {
          ...item,
          modules: { ...item.modules, [moduleKey]: updatedMod },
        };
      }),
    );
  };

  const handleSaveRolePermissions = async () => {
    if (!isSuperAdmin) return;
    if (selectedRoleKey === "SUPER_ADMIN") {
      setNotice(
        "Super Admin access is permanently unrestricted and does not require saving.",
      );
      return;
    }
    const current = permissionsList.find(
      (p) => p.roleOrDesignation === selectedRoleKey,
    );
    if (!current) return;
    setSavingPermissions(true);
    setError(null);
    setNotice(null);
    try {
      await apiRequest("/settings/permissions", {
        method: "POST",
        body: JSON.stringify({
          roleOrDesignation: selectedRoleKey,
          modules: current.modules,
        }),
      });
      setNotice(`Dynamic module permissions updated for '${selectedRoleKey}'.`);
      await loadSettings();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSavingPermissions(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="glass-card max-w-2xl mx-auto p-6 sm:p-8 text-center">
        <ShieldCheck className="mx-auto text-blue-400 mb-3" size={34} />
        <h1 className="text-xl font-bold text-white">{t("Settings")}</h1>
        <p className="text-sm text-gray-400 mt-2">
          Only organization administrators can view and change society rules.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 max-w-6xl mx-auto pb-10">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-blue-400">
            <Settings2 size={18} />
            <span className="text-xs font-bold uppercase tracking-wider">
              {t("Administration · Rulebook")}
            </span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-white">
            {t("Settings")}
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            {t("Set the live financial rules used across NS Foundation.")}
          </p>
        </div>
        <span className="badge badge-active self-start sm:self-auto">
          <ShieldCheck size={13} /> Admin only
        </span>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 flex gap-2">
          <AlertTriangle size={17} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 flex gap-2">
          <CheckCircle2 size={17} className="shrink-0 mt-0.5" />
          {notice}
        </div>
      )}

      <section className="glass-card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-2.5 text-blue-300">
            <Landmark size={20} />
          </div>
          <div>
            <h2 className="font-bold text-white">
              {t("Monthly share amount")}
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {t("The amount payable each month for one organization share.")}
            </p>
          </div>
        </div>
        <form
          onSubmit={saveShareAmount}
          className="mt-5 grid grid-cols-1 sm:grid-cols-[minmax(0,260px)_1fr_auto] gap-3 sm:items-end"
        >
          <div className="form-group mb-0">
            <label className="form-label">Amount per share (BDT)</label>
            <input
              className="form-input"
              type="number"
              min="1"
              max="1000000"
              step="1"
              required
              value={shareAmount}
              onChange={(e) => setShareAmount(e.target.value)}
            />
          </div>
          <div className="rounded-xl bg-slate-900/65 border border-white/10 px-4 py-3 text-sm">
            <span className="text-gray-400">Preview:</span>
            <strong className="text-emerald-300 ml-2">
              1 share = {money.format(Number(shareAmount) || 0)} / month
            </strong>
          </div>
          <button
            className="btn btn-primary min-h-11"
            disabled={saving || loading}
            type="submit"
          >
            <Save size={16} />
            {saving ? "Saving..." : "Save amount"}
          </button>
        </form>
        <p className="text-xs text-gray-500 mt-3">
          {t(
            "Recorded ledger entries remain unchanged; this live rule is used by new member and payment calculations.",
          )}{" "}
          {setting.updatedAt
            ? `${t("Last updated")} ${new Date(setting.updatedAt).toLocaleString()}.`
            : t("Using the default BDT 500 until saved.")}
        </p>
      </section>

      {/* Dynamic Module RBAC Permissions Section (Issue #29) */}
      <section className="glass-card p-5 sm:p-6 border-l-4 border-l-indigo-500">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 p-2.5 text-indigo-300">
              <Shield size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-white text-base">
                  {t("Module Access & RBAC Permissions Matrix")}
                </h2>
                {isSuperAdmin ? (
                  <span className="badge badge-active text-[10px] py-0.5">
                    Super Admin Control
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    View Only
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400 mt-1">
                {t(
                  "Dynamically view and configure module visibility and editorial accessibility per Board designation or system role.",
                )}
              </p>
            </div>
          </div>

          {isSuperAdmin && (
            <button
              onClick={handleSaveRolePermissions}
              disabled={
                savingPermissions ||
                loading ||
                selectedRoleKey === "SUPER_ADMIN"
              }
              className="btn btn-primary self-start sm:self-auto shrink-0 flex items-center gap-1.5"
            >
              <Save size={16} />
              {savingPermissions
                ? "Saving..."
                : `Save ${selectedRoleKey.replace(/_/g, " ")} Permissions`}
            </button>
          )}
        </div>

        {/* Role / Designation Selector Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pt-4 pb-2 border-b border-white/5 mt-3">
          {[
            "SUPER_ADMIN",
            "DIRECTOR",
            "PRESIDENT",
            "ACCOUNTANT",
            "ASSISTANT_ACCOUNTANT",
            "GENERAL_SECRETARY",
            "CONVENER",
            "GENERAL_MEMBER",
            "ADMIN",
            "MEMBER",
          ].map((key) => {
            const isSelected = selectedRoleKey === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedRoleKey(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                  isSelected
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 border border-indigo-400/30"
                    : "bg-slate-900/60 text-gray-400 hover:text-white border border-white/5"
                }`}
              >
                {key.replace(/_/g, " ")}
              </button>
            );
          })}
        </div>

        {/* Permissions Table for Selected Role */}
        <div className="table-container mt-4">
          <table className="data-table min-w-[700px]">
            <thead>
              <tr>
                <th className="w-1/4">Module Name</th>
                <th className="w-1/2">Module Description</th>
                <th className="w-1/8 text-center">Can View</th>
                <th className="w-1/8 text-center">Can Edit</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const currentRecord = permissionsList.find(
                  (p) => p.roleOrDesignation === selectedRoleKey,
                );
                const modules = currentRecord?.modules || {};

                return MODULE_DEFINITIONS.map((def) => {
                  const mod = modules[def.key] || {
                    canView: false,
                    canEdit: false,
                  };
                  const isSuperAdminRow = selectedRoleKey === "SUPER_ADMIN";

                  return (
                    <tr
                      key={def.key}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      <td>
                        <span className="font-semibold text-white text-sm">
                          {def.label}
                        </span>
                        <code className="block text-[10px] text-gray-500 mt-0.5">
                          {def.key}
                        </code>
                      </td>
                      <td>
                        <span className="text-xs text-gray-400">
                          {def.desc}
                        </span>
                        {isSuperAdminRow && (
                          <span className="block text-[11px] text-amber-400/90 font-medium mt-0.5">
                            * Super Admin access is permanently unrestricted.
                          </span>
                        )}
                      </td>
                      <td className="text-center">
                        <button
                          type="button"
                          disabled={!isSuperAdmin || isSuperAdminRow}
                          onClick={() => handleTogglePerm(def.key, "canView")}
                          className={`p-1.5 rounded-lg transition-all ${
                            mod.canView
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20"
                          } ${!isSuperAdmin || isSuperAdminRow ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                          title={
                            mod.canView
                              ? "Allowed to view module"
                              : "Denied view access"
                          }
                        >
                          {mod.canView ? <Check size={16} /> : <X size={16} />}
                        </button>
                      </td>
                      <td className="text-center">
                        <button
                          type="button"
                          disabled={!isSuperAdmin || isSuperAdminRow}
                          onClick={() => handleTogglePerm(def.key, "canEdit")}
                          className={`p-1.5 rounded-lg transition-all ${
                            mod.canEdit
                              ? "bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30"
                              : "bg-gray-800 text-gray-500 border border-gray-700 hover:bg-gray-700"
                          } ${!isSuperAdmin || isSuperAdminRow ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                          title={
                            mod.canEdit
                              ? "Allowed to perform editorial actions"
                              : "Read-only / No edit access"
                          }
                        >
                          {mod.canEdit ? (
                            <Check size={16} />
                          ) : (
                            <Lock size={16} />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          {isSuperAdmin
            ? t(
                "Super Admin (Moin) has universal editorial access to all modules and can toggle permissions above and click Save.",
              )
            : t(
                "You are viewing active role permissions in read-only mode. Only Super Admin can change access configurations.",
              )}
        </p>
      </section>

      <section className="glass-card p-5 sm:p-6 border-l-4 border-l-emerald-500">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-white">
              {t("Member organization-information access")}
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {t(
                "Choose the organization-level financial information Members can see in their own portal. Individual members, custody accounts, funding sources, and audit records are never disclosed here.",
              )}
            </p>
          </div>
          {canManageMemberTransparency && (
            <button
              className="btn btn-primary shrink-0"
              onClick={saveMemberTransparency}
              disabled={saving || loading}
            >
              <Save size={16} />
              {t("Save visibility")}
            </button>
          )}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {(
            [
              [
                "showCollections",
                "Organization collections",
                "Total member collections received by the foundation.",
              ],
              [
                "showExpenses",
                "Organization expenses",
                "Total recorded operational expenses.",
              ],
              [
                "showInvestmentProjects",
                "Investment projects",
                "Current and matured project names, status, dates, funding total and expected ROI.",
              ],
              [
                "showRealizedProfit",
                "Profit realized to date",
                "Recorded investment profit, loss, and net realized result.",
              ],
              [
                "showExpectedProfit",
                "Expected profit from active projects",
                "Projection calculated from active funding × expected ROI; it is not guaranteed profit.",
              ],
              [
                "allowAnnualProfitLossDownload",
                "Annual profit & loss PDF",
                "Allows download only for locked annual reports; audit packs remain restricted.",
              ],
            ] as Array<[keyof MemberTransparency, string, string]>
          ).map(([key, title, description]) => (
            <label
              key={key}
              className={`rounded-xl border p-4 flex gap-3 ${memberTransparency[key] ? "border-emerald-500/35 bg-emerald-500/5" : "border-white/10 bg-slate-900/45"} ${canManageMemberTransparency ? "cursor-pointer" : "opacity-75"}`}
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={memberTransparency[key]}
                disabled={!canManageMemberTransparency}
                onChange={(event) =>
                  setMemberTransparency({
                    ...memberTransparency,
                    [key]: event.target.checked,
                  })
                }
              />
              <span>
                <span className="block font-semibold text-white text-sm">
                  {t(title)}
                </span>
                <span className="block text-xs text-gray-400 mt-1 leading-relaxed">
                  {t(description)}
                </span>
              </span>
            </label>
          ))}
        </div>
        {!canManageMemberTransparency && (
          <p className="text-xs text-gray-500 mt-4">
            Only an administrator can change these organization disclosure
            permissions.
          </p>
        )}
      </section>

      <section className="glass-card p-5 sm:p-6">
        <h2 className="font-bold text-white">Final Disbursement Window</h2>
        <p className="text-sm text-gray-400 mt-1">
          Final payouts always start from 2024 and use the January 2025 final
          share position. Extend this end year only after member consensus.
        </p>
        <form
          onSubmit={saveEndYear}
          className="flex flex-col sm:flex-row gap-3 sm:items-end mt-4"
        >
          <div className="form-group mb-0 max-w-xs">
            <label className="form-label">Approved operational end year</label>
            <input
              className="form-input"
              type="number"
              min="2028"
              max="2100"
              value={operationalEndYear}
              onChange={(e) => setOperationalEndYear(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" disabled={saving}>
            Save end year
          </button>
        </form>
      </section>

      <section className="glass-card p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-white">
              {t("Accountant responsibilities")}
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {t(
                "Assign an eligible member to an accountant role, complete a custody handover after reconciliation, or close an empty role. Past financial records always remain with their original accountant.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-secondary"
              onClick={() => {
                setAppointmentForm({
                  userId: "",
                  accountantType: "ASSISTANT",
                  linkedGatewayChannels: [],
                  reason: "",
                });
                setShowAppointment(true);
              }}
            >
              <Plus size={16} />
              {t("Appoint member")}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setStaffForm({
                  name: "",
                  email: "",
                  password: "",
                  phone: "",
                  accountantType: "ASSISTANT",
                  linkedGatewayChannels: [],
                });
                setShowStaff(true);
              }}
            >
              {" "}
              <Plus size={16} />
              {t("Provision new staff")}
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-amber-400/25 bg-amber-500/5 p-3 mt-4 text-xs text-amber-100">
          {t(
            "Before handing over a responsibility, transfer or reconcile every outgoing custody account to ৳0 in the Custody Ledger. The system then deactivates those accounts, revokes the former access key, and creates a new key for the successor.",
          )}
        </div>
        <div className="table-container mt-5">
          <table className="data-table min-w-[860px]">
            <thead>
              <tr>
                <th>{t("Staff member")}</th>
                <th>{t("Responsibility")}</th>
                <th>{t("Linked gateways")}</th>
                <th>{t("Routing key")}</th>
                <th>{t("Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {staff.length ? (
                staff.map((member) => (
                  <tr key={member._id}>
                    <td>
                      <strong>{member.name}</strong>
                      <span className="block text-xs text-gray-400">
                        {member.email}
                      </span>
                    </td>
                    <td>
                      {t(
                        member.accountantType === "PRIMARY"
                          ? "Accountant"
                          : "Assistant Accountant",
                      )}
                    </td>
                    <td>
                      {member.linkedGatewayChannels?.join(", ") || t("None")}
                    </td>
                    <td className="font-mono text-xs">
                      {member.gatewayAccessKeyPrefix || "—"}•••
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={saving}
                          onClick={() => {
                            setHandoverForm({
                              successorUserId: "",
                              successorCustodyAccountIds: [],
                              linkedGatewayChannels:
                                member.linkedGatewayChannels || [],
                              reason: "",
                            });
                            setHandoverFrom(member);
                          }}
                        >
                          {t("Handover")}
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          disabled={saving}
                          onClick={() => offboardStaff(member)}
                        >
                          {t("Revoke")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="text-center text-gray-500 py-7">
                    {t("No provisioned accountant staff.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {newRoutingKey && (
          <div className="mt-4 rounded-xl border border-amber-400/35 bg-amber-500/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-amber-100">
                  Save this routing key now
                </p>
                <code className="block mt-2 break-all text-amber-200">
                  {newRoutingKey}
                </code>
                <p className="text-xs text-amber-100/70 mt-2">
                  For security, it cannot be viewed again after this page is
                  closed.
                </p>
              </div>
              <button
                className="text-amber-100"
                onClick={() => setNewRoutingKey(null)}
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="glass-card p-5 sm:p-6">
        <div>
          <h2 className="font-bold text-white">Gateway Cash-out Rules</h2>
          <p className="text-sm text-gray-400 mt-1">
            Configure the charge applied when a member pays into each receiving
            channel. The payment screen rounds the calculated charge upward
            using this rule.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          {gatewayRates.map((rate) => (
            <article
              key={rate.channel}
              className="rounded-2xl border border-white/10 bg-slate-900/55 p-4 sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider font-bold text-blue-300">
                    {rate.channel === "BKASH"
                      ? "bKash"
                      : rate.channel === "NAGAD"
                        ? "Nagad"
                        : rate.channel === "BANK"
                          ? "Bank / CellFin"
                          : "Physical Cash"}
                  </p>
                  <p className="text-xl font-extrabold text-white mt-1">
                    {rate.cashoutRatePercentage}%
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    + {money.format(rate.fixedFee)}{" "}
                    {t(
                      rate.roundingIncrement > 0
                        ? `round up to BDT ${rate.roundingIncrement}`
                        : "fixed · no rounding",
                    )}
                  </p>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setEditingGateway({ ...rate })}
                >
                  {t("Edit")}
                </button>
              </div>
              <p className="text-xs leading-relaxed text-gray-400 mt-4 border-t border-white/5 pt-3">
                {t(rate.description || "No description provided.")}
              </p>
            </article>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-4">
          {t(
            "Default rules: bKash 1.85%, Nagad app 1.49%, and free incoming Islami Bank / CellFin or cash. A rounding value of 0 keeps the exact calculated fee. Choose 1.70% in the Nagad rule when the member uses USSD.",
          )}
        </p>
      </section>

      <section className="glass-card p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-white">{t("Penalty Rules")}</h2>
            <p className="text-sm text-gray-400 mt-1">
              {t("Set the late-payment rate and grace deadline by effective month.")}
            </p>
          </div>
          <button
            onClick={() => {
              setRuleForm({
                effectiveFrom: "",
                effectiveTo: "",
                ratePerShare: "40",
                graceDayOfMonth: "15",
                description: "",
              });
              setEditingRuleId(null);
              setShowRule(true);
            }}
            className="btn btn-secondary self-start sm:self-auto"
          >
            <Plus size={16} />
            {t("Add penalty rule")}
          </button>
        </div>
        <div className="table-container mt-5">
          <table className="data-table min-w-[720px]">
            <thead>
              <tr>
                <th>{t("Effective from")}</th>
                <th>{t("Effective to")}</th>
                <th>{t("Rate")}</th>
                <th>{t("Grace deadline")}</th>
                <th>{t("Description")}</th>
                <th className="text-right">{t("Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rules.length ? (
                rules.map((rule) => (
                  <tr key={rule._id}>
                    <td className="font-mono text-blue-300">
                      {rule.effectiveFrom}
                    </td>
                    <td>{rule.effectiveTo || t("Ongoing")}</td>
                    <td className="font-semibold text-rose-300">
                      {money.format(rule.ratePerShare)} / {t("share")}
                    </td>
                    <td>{rule.graceDayOfMonth}th of month</td>
                    <td>{rule.description || "—"}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm p-1.5"
                          title={t("View")}
                          aria-label={t("View")}
                          onClick={() =>
                            setViewingPolicy({
                              title: "Penalty rule",
                              rows: [
                                ["Effective from", rule.effectiveFrom],
                                ["Effective to", rule.effectiveTo || "Ongoing"],
                                [
                                  "Rate per share",
                                  `${money.format(rule.ratePerShare)} / share`,
                                ],
                                [
                                  "Grace deadline",
                                  `${rule.graceDayOfMonth}th of month`,
                                ],
                                ["Description", rule.description || "—"],
                              ],
                            })
                          }
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm p-1.5"
                          title={t("Edit")}
                          aria-label={t("Edit")}
                          onClick={() => {
                            setRuleForm({
                              effectiveFrom: rule.effectiveFrom,
                              effectiveTo: rule.effectiveTo || "",
                              ratePerShare: String(rule.ratePerShare),
                              graceDayOfMonth: String(rule.graceDayOfMonth),
                              description: rule.description || "",
                            });
                            setEditingRuleId(rule._id);
                            setShowRule(true);
                          }}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm p-1.5"
                          title={t("Delete")}
                          aria-label={t("Delete")}
                          onClick={() =>
                            setDeletePolicy({
                              type: "rule",
                              id: rule._id,
                              label: `${rule.effectiveFrom} (${money.format(rule.ratePerShare)}/share)`,
                            })
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="text-center text-gray-500 py-8">
                    {t("No custom penalty rules saved yet.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass-card p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-white">{t("Penalty Waivers")}</h2>
            <p className="text-sm text-gray-400 mt-1">
              {t("Document organization-wide months in which penalties are waived.")}
            </p>
          </div>
          <button
            onClick={() => {
              setWaiverForm({ month: "", reason: "" });
              setEditingWaiverId(null);
              setShowWaiver(true);
            }}
            className="btn btn-secondary self-start sm:self-auto"
          >
            <Plus size={16} />
            {t("Grant waiver")}
          </button>
        </div>
        <div className="table-container mt-5">
          <table className="data-table min-w-[620px]">
            <thead>
              <tr>
                <th>{t("Waived month")}</th>
                <th>{t("Scope")}</th>
                <th>{t("Reason")}</th>
                <th className="text-right">{t("Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {waivers.length ? (
                waivers.map((waiver) => (
                  <tr key={waiver._id}>
                    <td className="font-mono text-emerald-300">
                      {waiver.month}
                    </td>
                    <td>
                      <span className="badge badge-active">
                        {waiver.isGlobal
                          ? t("All members")
                          : waiver.memberId?.memberId || t("Specific member")}
                      </span>
                    </td>
                    <td>{waiver.reason}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm p-1.5"
                          title={t("View")}
                          aria-label={t("View")}
                          onClick={() =>
                            setViewingPolicy({
                              title: "Penalty waiver",
                              rows: [
                                ["Waived month", waiver.month],
                                [
                                  "Scope",
                                  waiver.isGlobal
                                    ? "All members"
                                    : waiver.memberId?.name || "Specific member",
                                ],
                                ["Reason", waiver.reason],
                              ],
                            })
                          }
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm p-1.5"
                          title={t("Edit")}
                          aria-label={t("Edit")}
                          onClick={() => {
                            setWaiverForm({
                              month: waiver.month,
                              reason: waiver.reason,
                            });
                            setEditingWaiverId(waiver._id);
                            setShowRule(false);
                            setShowWaiver(true);
                          }}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm p-1.5"
                          title={t("Delete")}
                          aria-label={t("Delete")}
                          onClick={() =>
                            setDeletePolicy({
                              type: "waiver",
                              id: waiver._id,
                              label: waiver.month,
                            })
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="text-center text-gray-500 py-8">
                    {t("No waivers recorded.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showRule && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white">
                  {editingRuleId ? t("Edit penalty rule") : t("Add penalty rule")}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {editingRuleId
                    ? t("Update the rate per share and grace day.")
                    : t("Configure late fee rate per share and grace day.")}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowRule(false);
                  setEditingRuleId(null);
                }}
                className="text-gray-400 hover:text-white p-1"
              >
                <X size={19} />
              </button>
            </div>
            <form onSubmit={saveRule} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <MonthYearPicker
                  label={t("Effective from")}
                  required
                  value={ruleForm.effectiveFrom}
                  onChange={(val) =>
                    setRuleForm({
                      ...ruleForm,
                      effectiveFrom: val,
                    })
                  }
                />
                <MonthYearPicker
                  label={t("Effective to")}
                  allowClear
                  clearLabel={t("Ongoing (No end date)")}
                  value={ruleForm.effectiveTo}
                  onChange={(val) =>
                    setRuleForm({
                      ...ruleForm,
                      effectiveTo: val,
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="form-group mb-0">
                  <label className="form-label">{t("Rate per share")}</label>
                  <input
                    type="number"
                    min="0"
                    className="form-input"
                    required
                    value={ruleForm.ratePerShare}
                    onChange={(e) =>
                      setRuleForm({ ...ruleForm, ratePerShare: e.target.value })
                    }
                  />
                </div>
                <div className="form-group mb-0">
                  <label className="form-label">{t("Grace day")}</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    className="form-input"
                    required
                    value={ruleForm.graceDayOfMonth}
                    onChange={(e) =>
                      setRuleForm({
                        ...ruleForm,
                        graceDayOfMonth: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="form-group mb-0">
                <label className="form-label">{t("Description")}</label>
                <input
                  className="form-input"
                  value={ruleForm.description}
                  onChange={(e) =>
                    setRuleForm({ ...ruleForm, description: e.target.value })
                  }
                  placeholder={t("Optional rule note")}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowRule(false);
                    setEditingRuleId(null);
                  }}
                >
                  {t("Cancel")}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {editingRuleId
                    ? saving
                      ? t("Saving...")
                      : t("Update rule")
                    : saving
                      ? t("Saving...")
                      : t("Save rule")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showWaiver && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white">
                  {editingWaiverId
                    ? t("Edit penalty waiver")
                    : t("Grant penalty waiver")}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {editingWaiverId
                    ? t("Update the waived month or organizational justification.")
                    : t("Document organization-wide month in which penalties are waived.")}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowWaiver(false);
                  setEditingWaiverId(null);
                }}
                className="text-gray-400 hover:text-white p-1"
              >
                <X size={19} />
              </button>
            </div>
            <form onSubmit={saveWaiver} className="p-5 space-y-4">
              <MonthYearPicker
                label={t("Month to waive")}
                required
                value={waiverForm.month}
                onChange={(val) =>
                  setWaiverForm({ ...waiverForm, month: val })
                }
              />
              <div className="form-group mb-0">
                <label className="form-label">{t("Reason")}</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  required
                  value={waiverForm.reason}
                  onChange={(e) =>
                    setWaiverForm({ ...waiverForm, reason: e.target.value })
                  }
                  placeholder={t("Approved organization decision or rationale")}
                />
              </div>
              <p className="text-xs text-gray-500">
                {t("This waiver applies to every member for the selected month.")}
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowWaiver(false);
                    setEditingWaiverId(null);
                  }}
                >
                  {t("Cancel")}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {editingWaiverId
                    ? saving
                      ? t("Saving...")
                      : t("Update waiver")
                    : saving
                      ? t("Granting...")
                      : t("Grant waiver")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewingPolicy && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white">{t(viewingPolicy.title)}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {t("Policy details and active rules")}
                </p>
              </div>
              <button
                onClick={() => setViewingPolicy(null)}
                className="text-gray-400 hover:text-white p-1"
              >
                <X size={19} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="divide-y divide-white/5 rounded-xl bg-white/[0.02] border border-white/10 p-4">
                {viewingPolicy.rows.map(([label, val], idx) => (
                  <div
                    key={idx}
                    className="flex justify-between items-center py-2.5 text-sm first:pt-0 last:pb-0"
                  >
                    <span className="text-gray-400">{t(label)}</span>
                    <span className="font-medium text-white">{val}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setViewingPolicy(null)}
                >
                  {t("Close")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deletePolicy && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white">
                  {deletePolicy.type === "rule"
                    ? t("Delete penalty rule")
                    : t("Delete penalty waiver")}
                </h3>
                <p className="text-xs text-rose-300 font-mono mt-0.5">
                  {deletePolicy.label}
                </p>
              </div>
              <button
                onClick={() => setDeletePolicy(null)}
                className="text-gray-400 hover:text-white p-1"
              >
                <X size={19} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-300 leading-relaxed">
                {deletePolicy.type === "rule"
                  ? t(
                      "Are you sure you want to delete this penalty rule? This may affect late penalty calculations for affected months.",
                    )
                  : t(
                      "Are you sure you want to delete this penalty waiver? Penalties may be re-applied for this period.",
                    )}
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setDeletePolicy(null)}
                  disabled={saving}
                >
                  {t("Cancel")}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={saving}
                  onClick={removePolicy}
                >
                  {saving ? t("Deleting...") : t("Delete")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {editingGateway && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white">
                  Edit {editingGateway.channel} fee rule
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Used automatically by payment previews and receipts.
                </p>
              </div>
              <button
                onClick={() => setEditingGateway(null)}
                className="text-gray-400 hover:text-white p-1"
              >
                <X size={19} />
              </button>
            </div>
            <form onSubmit={saveGatewayRate} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="form-group mb-0">
                  <label className="form-label">Rate percentage</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    required
                    className="form-input"
                    value={editingGateway.cashoutRatePercentage}
                    onChange={(e) =>
                      setEditingGateway({
                        ...editingGateway,
                        cashoutRatePercentage: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="form-group mb-0">
                  <label className="form-label">Fixed fee (BDT)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    className="form-input"
                    value={editingGateway.fixedFee}
                    onChange={(e) =>
                      setEditingGateway({
                        ...editingGateway,
                        fixedFee: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <div className="form-group mb-0">
                <label className="form-label">Round charge up to (BDT)</label>
                <input
                  type="number"
                  min="0"
                  max="1000"
                  step="1"
                  required
                  className="form-input"
                  value={editingGateway.roundingIncrement}
                  onChange={(e) =>
                    setEditingGateway({
                      ...editingGateway,
                      roundingIncrement: Number(e.target.value),
                    })
                  }
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Set 0 for no rounding. For example, BDT 10 turns a bKash fee
                  of BDT 9.25 into BDT 10.
                </p>
              </div>
              <div className="form-group mb-0">
                <label className="form-label">Rule description</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  value={editingGateway.description || ""}
                  onChange={(e) =>
                    setEditingGateway({
                      ...editingGateway,
                      description: e.target.value,
                    })
                  }
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingGateway(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  Save rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showAppointment && (
        <div className="modal-overlay">
          <div className="modal-content max-w-lg">
            <div className="p-5 border-b border-white/10 flex justify-between">
              <div>
                <h3 className="font-bold text-white">
                  {t("Appoint member to responsibility")}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {t(
                    "The member’s existing identity and financial history will remain unchanged.",
                  )}
                </p>
              </div>
              <button
                onClick={() => setShowAppointment(false)}
                className="text-gray-400"
              >
                <X size={19} />
              </button>
            </div>
            <form onSubmit={appointMemberStaff} className="p-5 space-y-4">
              <div className="form-group mb-0">
                <label className="form-label">{t("Eligible member")}</label>
                <select
                  required
                  className="form-select"
                  value={appointmentForm.userId}
                  onChange={(e) =>
                    setAppointmentForm({
                      ...appointmentForm,
                      userId: e.target.value,
                    })
                  }
                >
                  <option value="">{t("Select member")}</option>
                  {staffCandidates
                    .filter((candidate) => !candidate.accountantType)
                    .map((candidate) => (
                      <option value={candidate._id} key={candidate._id}>
                        {candidate.memberId?.memberId || t("Member")} —{" "}
                        {candidate.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="form-group mb-0">
                <label className="form-label">{t("Responsibility")}</label>
                <select
                  className="form-select"
                  value={appointmentForm.accountantType}
                  onChange={(e) =>
                    setAppointmentForm({
                      ...appointmentForm,
                      accountantType: e.target.value,
                    })
                  }
                >
                  <option value="PRIMARY">{t("Accountant")}</option>
                  <option value="ASSISTANT">{t("Assistant Accountant")}</option>
                </select>
              </div>
              <div>
                <p className="form-label mb-2">{t("Receiving gateways")}</p>
                <div className="flex flex-wrap gap-3">
                  {["BKASH", "NAGAD", "BANK", "CASH"].map((channel) => (
                    <label
                      key={channel}
                      className="text-sm text-gray-300 inline-flex gap-2 items-center"
                    >
                      <input
                        type="checkbox"
                        checked={appointmentForm.linkedGatewayChannels.includes(
                          channel,
                        )}
                        onChange={(e) =>
                          setAppointmentForm({
                            ...appointmentForm,
                            linkedGatewayChannels: e.target.checked
                              ? [
                                  ...appointmentForm.linkedGatewayChannels,
                                  channel,
                                ]
                              : appointmentForm.linkedGatewayChannels.filter(
                                  (item) => item !== channel,
                                ),
                          })
                        }
                      />
                      {channel}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group mb-0">
                <label className="form-label">{t("Appointment reason")}</label>
                <textarea
                  required
                  rows={3}
                  className="form-textarea"
                  value={appointmentForm.reason}
                  onChange={(e) =>
                    setAppointmentForm({
                      ...appointmentForm,
                      reason: e.target.value,
                    })
                  }
                  placeholder={t("Board resolution or appointment note")}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAppointment(false)}
                >
                  {t("Cancel")}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {t("Appoint member")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {handoverFrom && (
        <div className="modal-overlay">
          <div className="modal-content max-w-lg">
            <div className="p-5 border-b border-white/10 flex justify-between">
              <div>
                <h3 className="font-bold text-white">
                  {t("Handover")} {" "}
                  {handoverFrom.accountantType === "PRIMARY"
                    ? t("Accountant")
                    : t("Assistant Accountant")}{" "}
                  {t("responsibility")}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {t("From")} {handoverFrom.name}. {t("Historical transactions will remain attributed to the former custodian.")}
                </p>
              </div>
              <button
                onClick={() => setHandoverFrom(null)}
                className="text-gray-400"
              >
                <X size={19} />
              </button>
            </div>
            <form onSubmit={(event) => { event.preventDefault(); setConfirmStaffAction({ type: "HANDOVER", member: handoverFrom }); }} className="p-5 space-y-4">
              <div className="form-group mb-0">
                <label className="form-label">{t("Successor member")}</label>
                <select
                  required
                  className="form-select"
                  value={handoverForm.successorUserId}
                  onChange={(e) =>
                    setHandoverForm({
                      ...handoverForm,
                      successorUserId: e.target.value,
                      successorCustodyAccountIds: [],
                    })
                  }
                >
                  <option value="">{t("Select successor")}</option>
                  {staffCandidates
                    .filter(
                      (candidate) =>
                        !candidate.accountantType &&
                        candidate._id !== handoverFrom._id,
                    )
                    .map((candidate) => (
                      <option value={candidate._id} key={candidate._id}>
                        {candidate.memberId?.memberId || t("Member")} —{" "}
                        {candidate.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <p className="form-label mb-2">
                  {t("Active successor custody accounts")}
                </p>
                <div className="space-y-2 rounded-xl border border-white/10 p-3 max-h-36 overflow-y-auto">
                  {custodyAccounts.filter(
                    (account) =>
                      account.isActive &&
                      account.holderId?._id === handoverForm.successorUserId,
                  ).length ? (
                    custodyAccounts
                      .filter(
                        (account) =>
                          account.isActive &&
                          account.holderId?._id ===
                            handoverForm.successorUserId,
                      )
                      .map((account) => (
                        <label
                          key={account._id}
                          className="flex gap-2 text-sm text-gray-300"
                        >
                          <input
                            type="checkbox"
                            checked={handoverForm.successorCustodyAccountIds.includes(
                              account._id,
                            )}
                            onChange={(e) =>
                              setHandoverForm({
                                ...handoverForm,
                                successorCustodyAccountIds: e.target.checked
                                  ? [
                                      ...handoverForm.successorCustodyAccountIds,
                                      account._id,
                                    ]
                                  : handoverForm.successorCustodyAccountIds.filter(
                                      (id) => id !== account._id,
                                    ),
                              })
                            }
                          />
                          {account.name} ({account.channel})
                        </label>
                      ))
                  ) : (
                    <p className="text-xs text-amber-200">
                      {t("Select a successor with active custody accounts first. Create the required accounts in Custody Ledger if none exist.")}
                    </p>
                  )}
                </div>
              </div>
              <div>
                <p className="form-label mb-2">
                  {t("Receiving gateways (must have matching selected custody accounts)")}
                </p>
                <div className="flex flex-wrap gap-3">
                  {["BKASH", "NAGAD", "BANK", "CASH"].map((channel) => (
                    <label
                      key={channel}
                      className="text-sm text-gray-300 inline-flex gap-2 items-center"
                    >
                      <input
                        type="checkbox"
                        checked={handoverForm.linkedGatewayChannels.includes(
                          channel,
                        )}
                        onChange={(e) =>
                          setHandoverForm({
                            ...handoverForm,
                            linkedGatewayChannels: e.target.checked
                              ? [...handoverForm.linkedGatewayChannels, channel]
                              : handoverForm.linkedGatewayChannels.filter(
                                  (item) => item !== channel,
                                ),
                          })
                        }
                      />
                      {channel}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group mb-0">
                <label className="form-label">
                  {t("Board-approved handover reason")}
                </label>
                <textarea
                  required
                  rows={3}
                  className="form-textarea"
                  value={handoverForm.reason}
                  onChange={(e) =>
                    setHandoverForm({ ...handoverForm, reason: e.target.value })
                  }
                  placeholder={t("Resignation, new appointment, and approval reference")}
                />
              </div>
              <p className="text-xs text-amber-200">
                {t("All outgoing custody accounts must already be at ৳0. The handover is refused if any balance remains.")}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setHandoverFrom(null)}
                >
                  {t("Cancel")}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {t("Complete handover")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showStaff && (
        <div className="modal-overlay">
          <div className="modal-content max-w-lg">
            <div className="p-5 border-b border-white/10 flex justify-between">
              <div>
                <h3 className="font-bold text-white">
                  {t("Provision accountant access")}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {t("Creates a secure staff profile and one-time routing key.")}
                </p>
              </div>
              <button
                onClick={() => setShowStaff(false)}
                className="text-gray-400"
              >
                <X size={19} />
              </button>
            </div>
            <form onSubmit={provisionStaff} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="form-group mb-0">
                  <label className="form-label">{t("Full name")}</label>
                  <input
                    className="form-input"
                    required
                    value={staffForm.name}
                    onChange={(e) =>
                      setStaffForm({ ...staffForm, name: e.target.value })
                    }
                  />
                </div>
                <div className="form-group mb-0">
                  <label className="form-label">{t("Staff type")}</label>
                  <select
                    className="form-select"
                    value={staffForm.accountantType}
                    onChange={(e) =>
                      setStaffForm({
                        ...staffForm,
                        accountantType: e.target.value,
                      })
                    }
                  >
                    <option value="PRIMARY">{t("Accountant")}</option>
                    <option value="ASSISTANT">{t("Assistant Accountant")}</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="form-group mb-0">
                  <label className="form-label">{t("Email")}</label>
                  <input
                    type="email"
                    className="form-input"
                    required
                    value={staffForm.email}
                    onChange={(e) =>
                      setStaffForm({ ...staffForm, email: e.target.value })
                    }
                  />
                </div>
                <div className="form-group mb-0">
                  <label className="form-label">{t("International phone")}</label>
                  <input
                    className="form-input"
                    placeholder="+8801712345678"
                    value={staffForm.phone}
                    onChange={(e) =>
                      setStaffForm({ ...staffForm, phone: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="form-group mb-0">
                <label className="form-label">
                  {t("Temporary password (10+ characters)")}
                </label>
                <input
                  type="password"
                  minLength={10}
                  className="form-input"
                  required
                  value={staffForm.password}
                  onChange={(e) =>
                    setStaffForm({ ...staffForm, password: e.target.value })
                  }
                />
              </div>
              <div>
                <p className="form-label mb-2">{t("Linked receiving gateways")}</p>
                <div className="flex flex-wrap gap-3">
                  {["BKASH", "NAGAD", "BANK", "CASH"].map((channel) => (
                    <label
                      key={channel}
                      className="text-sm text-gray-300 inline-flex gap-2 items-center"
                    >
                      <input
                        type="checkbox"
                        checked={staffForm.linkedGatewayChannels.includes(
                          channel,
                        )}
                        onChange={(e) =>
                          setStaffForm({
                            ...staffForm,
                            linkedGatewayChannels: e.target.checked
                              ? [...staffForm.linkedGatewayChannels, channel]
                              : staffForm.linkedGatewayChannels.filter(
                                  (item) => item !== channel,
                                ),
                          })
                        }
                      />
                      {channel}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowStaff(false)}
                >
                  {t("Cancel")}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {t("Provision staff")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {confirmStaffAction && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md">
            <div className="p-5 border-b border-white/10 flex justify-between">
              <div>
                <h3 className="font-bold text-white">
                  {t(confirmStaffAction.type === "HANDOVER" ? "Confirm responsibility handover" : "Confirm access revocation")}
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  {confirmStaffAction.member.name}
                </p>
              </div>
              <button
                className="text-gray-400"
                onClick={() => setConfirmStaffAction(null)}
              >
                <X size={19} />
              </button>
            </div>
            <div className="p-5 space-y-5">
              <p className="text-sm text-gray-300">
                {t(
                  confirmStaffAction.type === "HANDOVER"
                    ? "Confirm the responsibility handover. Historical financial records will remain with the former custodian."
                    : "This will immediately end the staff member’s active sessions and payment-gateway access. Historical financial records will not change.",
                )}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  className="btn btn-secondary"
                  onClick={() => setConfirmStaffAction(null)}
                >
                  {t(confirmStaffAction.type === "HANDOVER" ? "Go back" : "Keep access")}
                </button>
                <button
                  className={confirmStaffAction.type === "HANDOVER" ? "btn btn-primary" : "btn btn-danger"}
                  disabled={saving}
                  onClick={() => {
                    const action = confirmStaffAction;
                    setConfirmStaffAction(null);
                    void (action.type === "HANDOVER" ? handoverStaff() : confirmOffboardStaff(action.member));
                  }}
                >
                  {t(confirmStaffAction.type === "HANDOVER" ? "Confirm handover" : "Confirm revocation")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
