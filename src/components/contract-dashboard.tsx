"use client";

import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  LogOut,
  RefreshCw,
  Save,
  Send,
  UploadCloud,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  apiFetch,
  type ContractListItem,
  type DocumentListItem,
  type DraftDetail,
  validatePdf,
} from "@/lib/api";
import { CONTRACT_PDF_BUCKET, UNIT_OPTIONS } from "@/lib/constants";
import { formatCurrencyIDR, formatDate } from "@/lib/utils";
import {
  createBrowserSupabaseClient,
  getBrowserSupabaseConfig,
} from "@/lib/supabase/client";

type Tab = "upload" | "review" | "approved";

const statusLabel: Record<string, string> = {
  uploaded: "Uploaded",
  processing: "Processing",
  needs_review: "Needs review",
  approved: "Approved",
  failed: "Failed",
};

function Badge({ status }: { status: string }) {
  const tone =
    status === "approved"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "failed"
        ? "border-red-200 bg-red-50 text-red-700"
        : status === "needs_review"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}>
      {statusLabel[status] ?? status}
    </span>
  );
}

function TextInput(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label: string },
) {
  const { label, className = "", ...inputProps } = props;
  return (
    <label className="grid gap-1.5 text-sm font-medium text-slate-700">
      <span>{label}</span>
      <input
        {...inputProps}
        className={`h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 ${className}`}
      />
    </label>
  );
}

function SelectInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-slate-700">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      >
        <option value="">Perlu review</option>
        {UNIT_OPTIONS.map((unit) => (
          <option key={unit} value={unit}>
            {unit}
          </option>
        ))}
      </select>
    </label>
  );
}

function MissingConfig() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="w-full max-w-lg rounded-lg border border-amber-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-amber-700">Konfigurasi belum lengkap</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">
          Supabase public env belum diisi
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Isi `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
          dari `.env.example`, lalu jalankan ulang aplikasi.
        </p>
      </section>
    </main>
  );
}

function DashboardApp() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [tab, setTab] = useState<Tab>("upload");
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DraftDetail | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const token = session?.access_token;

  const loadDocuments = useCallback(async () => {
    if (!token) return;
    const data = await apiFetch<{ documents: DocumentListItem[] }>(
      "/api/documents",
      token,
    );
    setDocuments(data.documents);
  }, [token]);

  const loadContracts = useCallback(async () => {
    if (!token) return;
    const data = await apiFetch<{ contracts: ContractListItem[] }>(
      "/api/contracts",
      token,
    );
    setContracts(data.contracts);
  }, [token]);

  const loadDetail = useCallback(
    async (documentId: string) => {
      if (!token) return;
      const data = await apiFetch<DraftDetail>(
        `/api/documents/${documentId}`,
        token,
      );
      setSelectedDocumentId(documentId);
      setDetail(data);
    },
    [token],
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function refreshInitialData() {
      try {
        const [documentData, contractData] = await Promise.all([
          apiFetch<{ documents: DocumentListItem[] }>("/api/documents", token as string),
          apiFetch<{ contracts: ContractListItem[] }>("/api/contracts", token as string),
        ]);

        if (!cancelled) {
          setDocuments(documentData.documents);
          setContracts(contractData.contracts);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Gagal memuat data.");
        }
      }
    }

    void refreshInitialData();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    setMessage(error ? error.message : "Magic link dikirim ke email.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setDetail(null);
    setSelectedDocumentId(null);
  }

  async function uploadContract(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !session?.user || !file) return;

    const validationError = validatePdf(file);
    if (validationError) {
      setMessage(validationError);
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const storagePath = `${session.user.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
      const { error: uploadError } = await supabase.storage
        .from(CONTRACT_PDF_BUCKET)
        .upload(storagePath, file, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      const created = await apiFetch<{ document: { id: string } }>(
        "/api/documents",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            storagePath,
            filename: file.name,
            fileSize: file.size,
            mimeType: file.type || "application/pdf",
          }),
        },
      );

      setFile(null);
      setTab("review");
      await loadDocuments();
      await loadDetail(created.document.id);
      setMessage("PDF masuk antrean ekstraksi.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!token || !selectedDocumentId || !detail?.draft) return;
    setBusy(true);
    setMessage(null);

    try {
      const payload = {
        contract: detail.draft,
        items: detail.items,
      };
      await apiFetch(`/api/documents/${selectedDocumentId}`, token, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      await loadDetail(selectedDocumentId);
      await loadDocuments();
      setMessage("Draft tersimpan.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal menyimpan draft.");
    } finally {
      setBusy(false);
    }
  }

  async function approveDraft() {
    if (!token || !selectedDocumentId) return;
    setBusy(true);
    setMessage(null);

    try {
      await apiFetch(`/api/documents/${selectedDocumentId}/approve`, token, {
        method: "POST",
      });
      await loadDocuments();
      await loadContracts();
      await loadDetail(selectedDocumentId);
      setTab("approved");
      setMessage("Kontrak disetujui dan masuk tabel final.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Approval gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function reprocessDocument(documentId: string) {
    if (!token) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(`/api/documents/${documentId}/process`, token, {
        method: "POST",
      });
      await loadDocuments();
      setMessage("Ekstraksi dijalankan ulang.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal reprocess.");
    } finally {
      setBusy(false);
    }
  }

  function updateDraftField<K extends keyof NonNullable<DraftDetail["draft"]>>(
    key: K,
    value: NonNullable<DraftDetail["draft"]>[K],
  ) {
    setDetail((current) =>
      current?.draft
        ? { ...current, draft: { ...current.draft, [key]: value } }
        : current,
  );
}

  function updateItem(
    rowId: string,
    key: keyof DraftDetail["items"][number],
    value: string | number | null | string[],
  ) {
    setDetail((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === rowId ? { ...item, [key]: value } : item,
            ),
          }
        : current,
  );
}

  function addItem() {
    setDetail((current) =>
      current
        ? {
            ...current,
            items: [
              ...current.items,
              {
                id: crypto.randomUUID(),
                item_id: "",
                description: "",
                unit: "",
                material_unit_price: null,
                service_unit_price: null,
                source_page: null,
                source_text: null,
                confidence: null,
                warnings: [],
              },
            ],
          }
        : current,
    );
  }

  function removeItem(rowId: string) {
    setDetail((current) =>
      current
        ? {
            ...current,
            items: current.items.filter((item) => item.id !== rowId),
          }
        : current,
    );
  }

  if (authLoading) {
    return (
      <main className="grid min-h-screen place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-700" />
      </main>
    );
  }

  if (!session) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <form
          onSubmit={signIn}
          className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="mb-6">
            <p className="text-sm font-medium text-emerald-700">Contract BoQ Extractor</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-950">
              Masuk dashboard
            </h1>
          </div>
          <TextInput
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            placeholder="nama@perusahaan.co.id"
          />
          <button
            type="submit"
            disabled={busy}
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Kirim magic link
          </button>
          {message ? <p className="mt-4 text-sm text-slate-600">{message}</p> : null}
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f8f5] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Contract BoQ Extractor
            </p>
            <h1 className="mt-1 text-xl font-semibold">Dashboard Ekstraksi Kontrak</h1>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" />
            Keluar
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-5 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-3">
          <nav className="grid gap-2">
            {([
              ["upload", "Upload PDF", UploadCloud],
              ["review", "Review Draft", FileText],
              ["approved", "Data Final", CheckCircle2],
            ] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={`flex h-11 items-center gap-3 rounded-md border px-3 text-left text-sm font-medium transition ${
                  tab === value
                    ? "border-emerald-700 bg-emerald-700 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Queue</h2>
              <button
                type="button"
                onClick={() => loadDocuments().catch((error) => setMessage(error.message))}
                className="rounded-md p-1.5 hover:bg-slate-100"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              {documents.slice(0, 8).map((document) => (
                <button
                  key={document.id}
                  type="button"
                  onClick={() => {
                    setTab("review");
                    loadDetail(document.id).catch((error) => setMessage(error.message));
                  }}
                  className={`w-full rounded-md border p-3 text-left transition hover:bg-slate-50 ${
                    selectedDocumentId === document.id
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-medium text-slate-900">
                      {document.original_filename}
                    </p>
                    <Badge status={document.status} />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {formatDate(document.created_at)}
                  </p>
                </button>
              ))}
              {documents.length === 0 ? (
                <p className="text-sm text-slate-500">Belum ada dokumen.</p>
              ) : null}
            </div>
          </section>
        </aside>

        <section className="min-w-0">
          {message ? (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700">
              <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />
              <span>{message}</span>
            </div>
          ) : null}

          {tab === "upload" ? (
            <form
              onSubmit={uploadContract}
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Upload PDF kontrak</h2>
                  <p className="mt-1 text-sm text-slate-500">Maksimal 50MB.</p>
                </div>
                <UploadCloud className="h-6 w-6 text-emerald-700" />
              </div>
              <label className="grid min-h-40 cursor-pointer place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center transition hover:border-emerald-500 hover:bg-emerald-50">
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">
                    {file ? file.name : "Pilih PDF scan kontrak"}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "PDF"}
                  </span>
                </span>
              </label>
              <button
                type="submit"
                disabled={!file || busy}
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                Upload dan ekstrak
              </button>
            </form>
          ) : null}

          {tab === "review" ? (
            <div className="space-y-4">
              {detail ? (
                <>
                  <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold">
                          {detail.document.original_filename}
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                          {formatDate(detail.document.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge status={detail.document.status} />
                        <button
                          type="button"
                          onClick={() => reprocessDocument(detail.document.id)}
                          disabled={busy}
                          className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
                        >
                          <RefreshCw className="h-4 w-4" />
                          Reprocess
                        </button>
                      </div>
                    </div>

                    {detail.document.error_message ? (
                      <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {detail.document.error_message}
                      </div>
                    ) : null}

                    {detail.draft ? (
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <TextInput
                          label="Nomor Kontrak"
                          value={detail.draft.contract_number ?? ""}
                          onChange={(event) =>
                            updateDraftField("contract_number", event.target.value)
                          }
                        />
                        <TextInput
                          label="Tahun Kontrak"
                          type="number"
                          value={detail.draft.contract_year ?? ""}
                          onChange={(event) =>
                            updateDraftField(
                              "contract_year",
                              event.target.value ? Number(event.target.value) : null,
                            )
                          }
                        />
                        <TextInput
                          label="Tanggal Kontrak"
                          type="date"
                          value={detail.draft.contract_date ?? ""}
                          onChange={(event) =>
                            updateDraftField("contract_date", event.target.value || null)
                          }
                        />
                        <TextInput
                          label="Nama Vendor"
                          value={detail.draft.vendor_name ?? ""}
                          onChange={(event) =>
                            updateDraftField("vendor_name", event.target.value)
                          }
                        />
                        <SelectInput
                          label="Nama Unit"
                          value={detail.draft.unit_name ?? ""}
                          onChange={(value) =>
                            updateDraftField("unit_name", value || null)
                          }
                        />
                        <TextInput
                          label="Unit Raw"
                          value={detail.draft.unit_raw ?? ""}
                          onChange={(event) =>
                            updateDraftField("unit_raw", event.target.value || null)
                          }
                        />
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">
                        Draft belum tersedia untuk dokumen ini.
                      </p>
                    )}
                  </section>

                  <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
                      <h2 className="text-lg font-semibold">Draft BoQ</h2>
                      <button
                        type="button"
                        onClick={addItem}
                        className="h-9 rounded-md border border-slate-200 px-3 text-sm font-medium hover:bg-slate-50"
                      >
                        Tambah baris
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-[1100px] w-full border-collapse text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-3">ID</th>
                            <th className="px-3 py-3">Uraian Pekerjaan</th>
                            <th className="px-3 py-3">Satuan</th>
                            <th className="px-3 py-3">Harga Material</th>
                            <th className="px-3 py-3">Harga Jasa</th>
                            <th className="px-3 py-3">Hal.</th>
                            <th className="px-3 py-3">Conf.</th>
                            <th className="px-3 py-3"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.items.map((item) => (
                            <tr key={item.id} className="border-t border-slate-100">
                              <td className="px-3 py-2 align-top">
                                <input
                                  value={item.item_id}
                                  onChange={(event) =>
                                    updateItem(item.id, "item_id", event.target.value)
                                  }
                                  className="h-9 w-24 rounded-md border border-slate-200 px-2"
                                />
                              </td>
                              <td className="px-3 py-2 align-top">
                                <input
                                  value={item.description}
                                  onChange={(event) =>
                                    updateItem(item.id, "description", event.target.value)
                                  }
                                  className="h-9 w-full min-w-80 rounded-md border border-slate-200 px-2"
                                />
                                {item.warnings?.length ? (
                                  <p className="mt-1 text-xs text-amber-700">
                                    {item.warnings.join(", ")}
                                  </p>
                                ) : null}
                              </td>
                              <td className="px-3 py-2 align-top">
                                <input
                                  value={item.unit}
                                  onChange={(event) =>
                                    updateItem(item.id, "unit", event.target.value)
                                  }
                                  className="h-9 w-24 rounded-md border border-slate-200 px-2"
                                />
                              </td>
                              <td className="px-3 py-2 align-top">
                                <input
                                  type="number"
                                  value={item.material_unit_price ?? ""}
                                  onChange={(event) =>
                                    updateItem(
                                      item.id,
                                      "material_unit_price",
                                      event.target.value ? Number(event.target.value) : null,
                                    )
                                  }
                                  className="h-9 w-36 rounded-md border border-slate-200 px-2"
                                />
                              </td>
                              <td className="px-3 py-2 align-top">
                                <input
                                  type="number"
                                  value={item.service_unit_price ?? ""}
                                  onChange={(event) =>
                                    updateItem(
                                      item.id,
                                      "service_unit_price",
                                      event.target.value ? Number(event.target.value) : null,
                                    )
                                  }
                                  className="h-9 w-36 rounded-md border border-slate-200 px-2"
                                />
                              </td>
                              <td className="px-3 py-2 align-top">
                                <input
                                  type="number"
                                  value={item.source_page ?? ""}
                                  onChange={(event) =>
                                    updateItem(
                                      item.id,
                                      "source_page",
                                      event.target.value ? Number(event.target.value) : null,
                                    )
                                  }
                                  className="h-9 w-20 rounded-md border border-slate-200 px-2"
                                />
                              </td>
                              <td className="px-3 py-2 align-top text-slate-600">
                                {item.confidence == null
                                  ? "-"
                                  : `${Math.round(item.confidence * 100)}%`}
                              </td>
                              <td className="px-3 py-2 align-top">
                                <button
                                  type="button"
                                  onClick={() => removeItem(item.id)}
                                  className="h-9 rounded-md border border-slate-200 px-3 text-sm hover:bg-slate-50"
                                >
                                  Hapus
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 p-4">
                      <button
                        type="button"
                        onClick={saveDraft}
                        disabled={busy || !detail.draft}
                        className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-4 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                      >
                        <Save className="h-4 w-4" />
                        Simpan draft
                      </button>
                      <button
                        type="button"
                        onClick={approveDraft}
                        disabled={busy || !detail.draft || detail.items.length === 0}
                        className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Approve final
                      </button>
                    </div>
                  </section>
                </>
              ) : (
                <section className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                  Pilih dokumen dari queue.
                </section>
              )}
            </div>
          ) : null}

          {tab === "approved" ? (
            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
                <h2 className="text-lg font-semibold">Data kontrak final</h2>
                <button
                  type="button"
                  onClick={() => loadContracts().catch((error) => setMessage(error.message))}
                  className="rounded-md p-1.5 hover:bg-slate-100"
                  title="Refresh"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
              <div className="divide-y divide-slate-100">
                {contracts.map((contract) => (
                  <article key={contract.id} className="p-4">
                    <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                      <div>
                        <h3 className="font-semibold text-slate-950">
                          {contract.contract_number}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {contract.vendor_name} - {contract.unit_name} -{" "}
                          {formatDate(contract.contract_date)}
                        </p>
                      </div>
                      <p className="text-sm font-medium text-emerald-700">
                        {contract.boq_items.length} item
                      </p>
                    </div>
                    <div className="mt-3 overflow-x-auto">
                      <table className="min-w-[760px] w-full text-sm">
                        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="py-2 pr-3">ID</th>
                            <th className="py-2 pr-3">Uraian</th>
                            <th className="py-2 pr-3">Satuan</th>
                            <th className="py-2 pr-3">Material</th>
                            <th className="py-2 pr-3">Jasa</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contract.boq_items.map((item) => (
                            <tr key={item.id} className="border-t border-slate-100">
                              <td className="py-2 pr-3">{item.item_id}</td>
                              <td className="py-2 pr-3">{item.description}</td>
                              <td className="py-2 pr-3">{item.unit}</td>
                              <td className="py-2 pr-3">
                                {formatCurrencyIDR(item.material_unit_price)}
                              </td>
                              <td className="py-2 pr-3">
                                {formatCurrencyIDR(item.service_unit_price)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                ))}
                {contracts.length === 0 ? (
                  <p className="p-6 text-sm text-slate-500">Belum ada data final.</p>
                ) : null}
              </div>
            </section>
          ) : null}
        </section>
      </div>
    </main>
  );
}

export function ContractDashboard() {
  const config = getBrowserSupabaseConfig();

  if (!config.isConfigured) {
    return <MissingConfig />;
  }

  return <DashboardApp />;
}
