"use client";

import {
  AlertCircle,
  CheckCircle2,
  FileSearch,
  FileText,
  Inbox,
  LogOut,
  RefreshCw,
  Save,
  Send,
  UploadCloud,
} from "lucide-react";
import {
  type ComponentType,
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
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
type IconComponent = ComponentType<{ className?: string }>;

const shell =
  "rounded-xl border border-slate-200/70 bg-white shadow-[0_18px_55px_-35px_rgba(15,23,42,0.42)]";
const interactive =
  "transition-[transform,background-color,border-color,color,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]";
const primaryButton =
  `${interactive} inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-55`;
const secondaryButton =
  `${interactive} inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-55`;
const iconButton =
  `${interactive} inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50`;

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
          : status === "processing"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}
    >
      {status === "processing" ? (
        <span className="status-dot h-1.5 w-1.5 rounded-full bg-emerald-600" />
      ) : null}
      {statusLabel[status] ?? status}
    </span>
  );
}

function TextInput(
  props: React.InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    helper?: string;
  },
) {
  const { label, helper, className = "", ...inputProps } = props;

  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700">
      <span>{label}</span>
      <input
        {...inputProps}
        className={`h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition-[border-color,box-shadow,background-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 ${className}`}
      />
      {helper ? <span className="text-xs font-normal text-slate-500">{helper}</span> : null}
    </label>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  helper,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition-[border-color,box-shadow,background-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
      >
        <option value="">Perlu review</option>
        {UNIT_OPTIONS.map((unit) => (
          <option key={unit} value={unit}>
            {unit}
          </option>
        ))}
      </select>
      {helper ? <span className="text-xs font-normal text-slate-500">{helper}</span> : null}
    </label>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-lg ${className}`} />;
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: IconComponent;
  title: string;
  description: string;
}) {
  return (
    <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center">
      <div>
        <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-emerald-700">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="mt-4 text-sm font-semibold text-slate-950">{title}</h3>
        <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function LoadingFrame() {
  return (
    <main className="min-h-[100dvh] bg-[#f8faf8] px-4 py-5 text-slate-950">
      <div className="mx-auto max-w-7xl">
        <Skeleton className="h-16 w-full" />
        <div className="mt-5 grid gap-5 lg:grid-cols-[280px_1fr]">
          <div className="space-y-3">
            <Skeleton className="h-11" />
            <Skeleton className="h-11" />
            <Skeleton className="h-48" />
          </div>
          <Skeleton className="h-[520px]" />
        </div>
      </div>
    </main>
  );
}

function MissingConfig() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#f8faf8] px-4">
      <section className={`${shell} w-full max-w-lg p-7`}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
          Config check
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
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
  const [initialLoading, setInitialLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
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
      setDetailLoading(true);
      setSelectedDocumentId(documentId);
      try {
        const data = await apiFetch<DraftDetail>(
          `/api/documents/${documentId}`,
          token,
        );
        setDetail(data);
      } finally {
        setDetailLoading(false);
      }
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
      await Promise.resolve();
      if (cancelled) return;
      setInitialLoading(true);

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
      } finally {
        if (!cancelled) {
          setInitialLoading(false);
        }
      }
    }

    void refreshInitialData();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
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

  async function uploadContract(event: FormEvent<HTMLFormElement>) {
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
    return <LoadingFrame />;
  }

  if (!session) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#f8faf8] px-4">
        <form onSubmit={signIn} className={`${shell} w-full max-w-sm p-7`}>
          <div className="mb-7">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Contract BoQ Extractor
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
              Masuk dashboard
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Akses review kontrak dan data BoQ final.
            </p>
          </div>
          <TextInput
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            placeholder="nama@perusahaan.co.id"
            helper="Magic link akan dikirim ke alamat ini."
          />
          <button type="submit" disabled={busy} className={`${primaryButton} mt-5 w-full`}>
            <Send className="h-4 w-4" />
            {busy ? "Mengirim..." : "Kirim magic link"}
          </button>
          {message ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {message}
            </div>
          ) : null}
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#f8faf8] text-slate-950">
      <header className="border-b border-slate-200/80 bg-white/95">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
              Contract BoQ Extractor
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
              Dashboard Ekstraksi Kontrak
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
              {documents.length} dokumen - {contracts.length} final
            </div>
            <button type="button" onClick={signOut} className={secondaryButton}>
              <LogOut className="h-4 w-4" />
              Keluar
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-5 lg:grid-cols-[292px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <nav className={`${shell} overflow-hidden p-2`}>
            {([
              ["upload", "Upload PDF", UploadCloud],
              ["review", "Review Draft", FileText],
              ["approved", "Data Final", CheckCircle2],
            ] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={`${interactive} flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold ${
                  tab === value
                    ? "bg-slate-950 text-white"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>

          <section className={`${shell} overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">Queue</h2>
                <p className="mt-0.5 text-xs text-slate-500">Dokumen terbaru</p>
              </div>
              <button
                type="button"
                onClick={() => loadDocuments().catch((error) => setMessage(error.message))}
                className={iconButton}
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>

            {initialLoading ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
              </div>
            ) : documents.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {documents.slice(0, 8).map((document, index) => (
                  <button
                    key={document.id}
                    type="button"
                    style={{ "--stagger-index": index } as CSSProperties}
                    onClick={() => {
                      setTab("review");
                      loadDetail(document.id).catch((error) => setMessage(error.message));
                    }}
                    className={`stagger-item ${interactive} w-full p-4 text-left hover:bg-slate-50 ${
                      selectedDocumentId === document.id ? "bg-emerald-50/70" : "bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="line-clamp-2 text-sm font-semibold text-slate-900">
                        {document.original_filename}
                      </p>
                      <Badge status={document.status} />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                      <span>{formatDate(document.created_at)}</span>
                      <span className="font-mono">
                        {(document.file_size_bytes / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-4">
                <EmptyState
                  icon={Inbox}
                  title="Queue kosong"
                  description="Belum ada kontrak yang masuk antrean ekstraksi."
                />
              </div>
            )}
          </section>
        </aside>

        <section className="min-w-0">
          {message ? (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-[0_18px_45px_-35px_rgba(15,23,42,0.4)]">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-none text-amber-600" />
              <span>{message}</span>
            </div>
          ) : null}

          {tab === "upload" ? (
            <form onSubmit={uploadContract} className={`${shell} overflow-hidden`}>
              <div className="grid gap-5 border-b border-slate-100 p-5 md:grid-cols-[1fr_auto] md:items-start">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    Intake
                  </p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                    Upload PDF kontrak
                  </h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
                    File scan kontrak masuk ke bucket private, lalu diproses ke draft review.
                  </p>
                </div>
                <div className="grid h-12 w-12 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-emerald-700">
                  <UploadCloud className="h-5 w-5" />
                </div>
              </div>

              <div className="p-5">
                <label className={`${interactive} group grid min-h-48 cursor-pointer place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-9 text-center hover:border-emerald-500 hover:bg-emerald-50/60`}>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="sr-only"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                  <span>
                    <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-emerald-700 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-0.5">
                      <FileText className="h-5 w-5" />
                    </span>
                    <span className="mt-4 block text-sm font-semibold text-slate-950">
                      {file ? file.name : "Pilih PDF scan kontrak"}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "PDF, maksimal 50MB"}
                    </span>
                  </span>
                </label>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs leading-5 text-slate-500">
                    Hasil ekstraksi tetap masuk draft dan perlu approval sebelum final.
                  </p>
                  <button type="submit" disabled={!file || busy} className={primaryButton}>
                    <UploadCloud className="h-4 w-4" />
                    {busy ? "Mengunggah..." : "Upload dan ekstrak"}
                  </button>
                </div>
              </div>
            </form>
          ) : null}

          {tab === "review" ? (
            <div className="space-y-5">
              {detailLoading ? (
                <>
                  <Skeleton className="h-64" />
                  <Skeleton className="h-96" />
                </>
              ) : detail ? (
                <>
                  <section className={`${shell} overflow-hidden`}>
                    <div className="grid gap-4 border-b border-slate-100 p-5 md:grid-cols-[1fr_auto] md:items-start">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                          Review draft
                        </p>
                        <h2 className="mt-2 truncate text-xl font-semibold tracking-tight text-slate-950">
                          {detail.document.original_filename}
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                          {formatDate(detail.document.created_at)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge status={detail.document.status} />
                        <button
                          type="button"
                          onClick={() => reprocessDocument(detail.document.id)}
                          disabled={busy}
                          className={secondaryButton}
                        >
                          <RefreshCw className="h-4 w-4" />
                          Reprocess
                        </button>
                      </div>
                    </div>

                    {detail.document.error_message ? (
                      <div className="mx-5 mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">
                        {detail.document.error_message}
                      </div>
                    ) : null}

                    {detail.draft ? (
                      <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
                        <TextInput
                          label="Nomor Kontrak"
                          value={detail.draft.contract_number ?? ""}
                          onChange={(event) =>
                            updateDraftField("contract_number", event.target.value)
                          }
                          helper="Harus unik saat masuk tabel final."
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
                          onChange={(value) => updateDraftField("unit_name", value || null)}
                          helper="Pilih dari daftar unit resmi."
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
                      <div className="p-5">
                        <EmptyState
                          icon={FileSearch}
                          title="Draft belum tersedia"
                          description="Dokumen ini belum memiliki hasil ekstraksi untuk direview."
                        />
                      </div>
                    )}
                  </section>

                  <section className={`${shell} overflow-hidden`}>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
                      <div>
                        <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                          Draft BoQ
                        </h2>
                        <p className="mt-1 text-xs text-slate-500">
                          {detail.items.length} baris draft
                        </p>
                      </div>
                      <button type="button" onClick={addItem} className={secondaryButton}>
                        Tambah baris
                      </button>
                    </div>
                    {detail.items.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[1120px] border-collapse text-sm">
                          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="px-3 py-3 font-semibold">ID</th>
                              <th className="px-3 py-3 font-semibold">Uraian Pekerjaan</th>
                              <th className="px-3 py-3 font-semibold">Satuan</th>
                              <th className="px-3 py-3 font-semibold">Harga Material</th>
                              <th className="px-3 py-3 font-semibold">Harga Jasa</th>
                              <th className="px-3 py-3 font-semibold">Hal.</th>
                              <th className="px-3 py-3 font-semibold">Conf.</th>
                              <th className="px-3 py-3"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {detail.items.map((item, index) => (
                              <tr
                                key={item.id}
                                style={{ "--stagger-index": index } as CSSProperties}
                                className="stagger-item bg-white"
                              >
                                <td className="px-3 py-2 align-top">
                                  <input
                                    value={item.item_id}
                                    onChange={(event) =>
                                      updateItem(item.id, "item_id", event.target.value)
                                    }
                                    className="h-9 w-24 rounded-lg border border-slate-200 px-2 font-mono text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                                  />
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <input
                                    value={item.description}
                                    onChange={(event) =>
                                      updateItem(item.id, "description", event.target.value)
                                    }
                                    className="h-9 w-full min-w-80 rounded-lg border border-slate-200 px-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
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
                                    className="h-9 w-24 rounded-lg border border-slate-200 px-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
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
                                    className="h-9 w-36 rounded-lg border border-slate-200 px-2 font-mono text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
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
                                    className="h-9 w-36 rounded-lg border border-slate-200 px-2 font-mono text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
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
                                    className="h-9 w-20 rounded-lg border border-slate-200 px-2 font-mono text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                                  />
                                </td>
                                <td className="px-3 py-2 align-top font-mono text-slate-600">
                                  {item.confidence == null
                                    ? "-"
                                    : `${Math.round(item.confidence * 100)}%`}
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <button
                                    type="button"
                                    onClick={() => removeItem(item.id)}
                                    className={`${interactive} h-9 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50`}
                                  >
                                    Hapus
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-5">
                        <EmptyState
                          icon={Inbox}
                          title="Belum ada item BoQ"
                          description="Tambahkan baris draft sebelum approval."
                        />
                      </div>
                    )}
                    <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 p-4">
                      <button
                        type="button"
                        onClick={saveDraft}
                        disabled={busy || !detail.draft}
                        className={secondaryButton}
                      >
                        <Save className="h-4 w-4" />
                        {busy ? "Menyimpan..." : "Simpan draft"}
                      </button>
                      <button
                        type="button"
                        onClick={approveDraft}
                        disabled={busy || !detail.draft || detail.items.length === 0}
                        className={primaryButton}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Approve final
                      </button>
                    </div>
                  </section>
                </>
              ) : (
                <EmptyState
                  icon={FileSearch}
                  title="Pilih dokumen"
                  description="Pilih kontrak dari queue untuk membuka hasil ekstraksi dan tabel BoQ."
                />
              )}
            </div>
          ) : null}

          {tab === "approved" ? (
            <section className={`${shell} overflow-hidden`}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                    Data kontrak final
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {contracts.length} kontrak approved
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => loadContracts().catch((error) => setMessage(error.message))}
                  className={iconButton}
                  title="Refresh"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
              {initialLoading ? (
                <div className="space-y-3 p-5">
                  <Skeleton className="h-28" />
                  <Skeleton className="h-28" />
                </div>
              ) : contracts.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {contracts.map((contract, index) => (
                    <article
                      key={contract.id}
                      style={{ "--stagger-index": index } as CSSProperties}
                      className="stagger-item p-5"
                    >
                      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold text-slate-950">
                            {contract.contract_number}
                          </h3>
                          <p className="mt-1 text-sm text-slate-500">
                            {contract.vendor_name} - {contract.unit_name} -{" "}
                            {formatDate(contract.contract_date)}
                          </p>
                        </div>
                        <p className="font-mono text-sm font-medium text-emerald-700">
                          {contract.boq_items.length} item
                        </p>
                      </div>
                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full min-w-[760px] text-sm">
                          <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="py-2 pr-3 font-semibold">ID</th>
                              <th className="py-2 pr-3 font-semibold">Uraian</th>
                              <th className="py-2 pr-3 font-semibold">Satuan</th>
                              <th className="py-2 pr-3 font-semibold">Material</th>
                              <th className="py-2 pr-3 font-semibold">Jasa</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {contract.boq_items.map((item) => (
                              <tr key={item.id}>
                                <td className="py-2 pr-3 font-mono">{item.item_id}</td>
                                <td className="py-2 pr-3">{item.description}</td>
                                <td className="py-2 pr-3">{item.unit}</td>
                                <td className="py-2 pr-3 font-mono">
                                  {formatCurrencyIDR(item.material_unit_price)}
                                </td>
                                <td className="py-2 pr-3 font-mono">
                                  {formatCurrencyIDR(item.service_unit_price)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="p-5">
                  <EmptyState
                    icon={Inbox}
                    title="Belum ada data final"
                    description="Kontrak yang sudah di-approve akan tampil di sini."
                  />
                </div>
              )}
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
