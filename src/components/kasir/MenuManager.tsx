"use client";

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import Image from "next/image";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, ImagePlus, ImageOff, Pencil, Plus, Sparkles } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { api, RequestError } from "@/lib/order/client";
import { MENU_IMAGES } from "@/lib/order/menu-images";
import { Mascot } from "@/components/ui/Mascot";
import { MenuPhoto } from "@/components/ui/MenuPhoto";
import { Modal } from "@/components/ui/Modal";

interface AdminItem {
  sku: string;
  name: string;
  description: string | null;
  price: number | null;
  image: string | null;
  active: boolean;
  available: boolean;
}

interface AdminSection {
  id: string;
  name: string;
  active: boolean;
  items: AdminItem[];
}

// Warna ubin bergiliran per section, diambil dari palet latar foto menu di homepage.
const TILES = ["#f6e39c", "#c9d6a6", "#f4c9c5", "#e3cfb4", "#ebe5c4", "#d5d79c"];

type Editor =
  | { kind: "section"; section: AdminSection | null }
  | { kind: "item"; sectionId: string; item: AdminItem | null };

export function MenuManager({ outlet, onChanged }: { outlet: string; onChanged: () => void }) {
  const [sections, setSections] = useState<AdminSection[] | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api<{ sections: AdminSection[]; uploads: Upload[] }>(`/api/kasir/menu-admin?outlet=${outlet}`);
      setSections(result.sections);
      setUploads(result.uploads);
    } catch (failure) {
      setError(failure instanceof RequestError ? failure.message : "Gagal memuat menu.");
    }
  }, [outlet]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 2600);
    return () => window.clearTimeout(timer);
  }, [flash]);

  /** Satu perubahan ke server; daftar dimuat ulang dari server sesudahnya (bukan ditebak di browser). */
  async function change(body: Record<string, unknown>, message: string) {
    setBusy(true);
    setError(null);
    try {
      await api("/api/kasir/menu-admin", { method: "POST", body: { outlet, ...body } });
      await load();
      onChanged();
      setFlash(message);
      return true;
    } catch (failure) {
      setError(failure instanceof RequestError ? failure.message : "Gagal menyimpan. Coba lagi.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const activeSections = sections?.filter((section) => section.active) ?? [];
  const archivedSections = sections?.filter((section) => !section.active) ?? [];

  return (
    <div className="mm">
      <header className="mm-hero">
        <div>
          <p className="eyebrow">
            <Sparkles aria-hidden="true" size={14} /> Khusus pengelola
          </p>
          <h2 className="mm-title">Kelola menu</h2>
          <p className="mm-sub">Atur section dan menu yang tampil di halaman pesan. Perubahan langsung terlihat pengunjung; pesanan lama tetap memakai harga saat dipesan.</p>
        </div>
        <Mascot name="boy-with-cup" reveal="now" className="mm-mascot" sizes="120px" />
        <button type="button" className="qo-btn qo-btn--red mm-new" onClick={() => setEditor({ kind: "section", section: null })} disabled={busy}>
          <Plus aria-hidden="true" size={18} strokeWidth={2.75} /> Section baru
        </button>
      </header>

      <p className="mm-flash" role="status" aria-live="polite">
        {flash}
      </p>
      {error && (
        <p className="kasir-notice kasir-notice--warn" role="alert">
          {error}
        </p>
      )}
      {!sections && !error && <p className="kasir-muted kasir-pad">Memuat menu…</p>}

      {activeSections.map((section, index) => (
        <SectionCard
          key={section.id}
          section={section}
          tile={TILES[index % TILES.length]}
          first={index === 0}
          last={index === activeSections.length - 1}
          busy={busy}
          onMove={(move) => change({ op: "update-section", id: section.id, move }, `${section.name} dipindah`)}
          onRename={() => setEditor({ kind: "section", section })}
          onArchive={() => change({ op: "update-section", id: section.id, active: false }, `${section.name} diarsipkan`)}
          onAdd={() => setEditor({ kind: "item", sectionId: section.id, item: null })}
          onEdit={(item) => setEditor({ kind: "item", sectionId: section.id, item })}
          onItemChange={(item, patch, message) => change({ op: "update-item", sku: item.sku, ...patch }, message)}
        />
      ))}

      {sections && activeSections.length === 0 && (
        <div className="kasir-empty">
          <p>Belum ada section aktif. Mulai dengan &ldquo;Section baru&rdquo;, mis. Minuman atau Cemilan.</p>
        </div>
      )}

      {archivedSections.length > 0 && (
        <details className="mm-archive">
          <summary>Section diarsipkan ({archivedSections.length})</summary>
          <ul>
            {archivedSections.map((section) => (
              <li key={section.id}>
                <span>
                  <strong>{section.name}</strong> · {section.items.length} menu
                </span>
                <button
                  type="button"
                  className="kasir-chip"
                  disabled={busy}
                  onClick={() => change({ op: "update-section", id: section.id, active: true }, `${section.name} ditampilkan lagi`)}
                >
                  <ArchiveRestore aria-hidden="true" size={16} /> Tampilkan lagi
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Modal open={editor !== null} onClose={() => setEditor(null)} labelledBy="mm-editor-title" wide={editor?.kind === "item"}>
        {editor?.kind === "section" && (
          <SectionForm
            section={editor.section}
            busy={busy}
            onCancel={() => setEditor(null)}
            onSave={async (name) => {
              const ok = editor.section
                ? await change({ op: "update-section", id: editor.section.id, name }, `Section diganti menjadi ${name}`)
                : await change({ op: "create-section", name }, `Section ${name} dibuat`);
              if (ok) setEditor(null);
            }}
          />
        )}
        {editor?.kind === "item" && sections && (
          <ItemForm
            outlet={outlet}
            uploads={uploads}
            onUploaded={(upload) => setUploads((current) => [upload, ...current])}
            sections={activeSections}
            sectionId={editor.sectionId}
            item={editor.item}
            busy={busy}
            onCancel={() => setEditor(null)}
            onSave={async (values) => {
              const ok = editor.item
                ? await change({ op: "update-item", sku: editor.item.sku, ...values }, `${values.name} disimpan`)
                : await change({ op: "create-item", ...values }, `${values.name} ditambahkan`);
              if (ok) setEditor(null);
            }}
            onArchive={
              editor.item
                ? async () => {
                    const target = editor.item!;
                    const ok = await change({ op: "update-item", sku: target.sku, active: !target.active }, target.active ? `${target.name} diarsipkan` : `${target.name} ditampilkan lagi`);
                    if (ok) setEditor(null);
                  }
                : undefined
            }
          />
        )}
      </Modal>
    </div>
  );
}

interface SectionCardProps {
  section: AdminSection;
  tile: string;
  first: boolean;
  last: boolean;
  busy: boolean;
  onMove: (move: "up" | "down") => void;
  onRename: () => void;
  onArchive: () => void;
  onAdd: () => void;
  onEdit: (item: AdminItem) => void;
  onItemChange: (item: AdminItem, patch: Record<string, unknown>, message: string) => void;
}

function SectionCard({ section, tile, first, last, busy, onMove, onRename, onArchive, onAdd, onEdit, onItemChange }: SectionCardProps) {
  const visible = section.items.filter((item) => item.active);
  const archived = section.items.filter((item) => !item.active);
  return (
    <section className="mm-section" style={{ "--tile": tile } as CSSProperties} aria-labelledby={`mm-sec-${section.id}`}>
      <div className="mm-section-head">
        <h3 id={`mm-sec-${section.id}`} className="mm-section-name">
          {section.name}
        </h3>
        <span className="mm-count">{visible.length} menu</span>
        <div className="mm-tools">
          <button type="button" className="mm-icon" onClick={() => onMove("up")} disabled={busy || first} aria-label={`Naikkan section ${section.name}`}>
            <ArrowUp aria-hidden="true" size={18} />
          </button>
          <button type="button" className="mm-icon" onClick={() => onMove("down")} disabled={busy || last} aria-label={`Turunkan section ${section.name}`}>
            <ArrowDown aria-hidden="true" size={18} />
          </button>
          <button type="button" className="mm-icon" onClick={onRename} disabled={busy} aria-label={`Ganti nama section ${section.name}`}>
            <Pencil aria-hidden="true" size={17} />
          </button>
          <button type="button" className="mm-icon" onClick={onArchive} disabled={busy} aria-label={`Arsipkan section ${section.name}`}>
            <Archive aria-hidden="true" size={17} />
          </button>
        </div>
      </div>

      <ul className="mm-items">
        {visible.map((item, index) => (
          <li key={item.sku} className="mm-item">
            <div className="mm-thumb">
              {item.image ? <MenuPhoto src={item.image} alt="" sizes="64px" /> : <span aria-hidden="true">{item.name.charAt(0)}</span>}
            </div>
            <div className="mm-item-text">
              <p className="mm-item-name">{item.name}</p>
              <p className="mm-price tabular">{item.price === null ? "Harga belum diisi" : formatPrice(item.price)}</p>
            </div>
            <div className="mm-item-tools">
              <button
                type="button"
                role="switch"
                aria-checked={item.available}
                aria-label={`${item.name} tersedia`}
                className={`mm-avail ${item.available ? "is-on" : "is-off"}`}
                disabled={busy}
                onClick={() => onItemChange(item, { available: !item.available }, `${item.name} ${item.available ? "ditandai habis" : "tersedia lagi"}`)}
              >
                {item.available ? "Tersedia" : "Habis"}
              </button>
              <button type="button" className="mm-icon" onClick={() => onItemChange(item, { move: "up" }, `${item.name} dipindah`)} disabled={busy || index === 0} aria-label={`Naikkan ${item.name}`}>
                <ArrowUp aria-hidden="true" size={16} />
              </button>
              <button
                type="button"
                className="mm-icon"
                onClick={() => onItemChange(item, { move: "down" }, `${item.name} dipindah`)}
                disabled={busy || index === visible.length - 1}
                aria-label={`Turunkan ${item.name}`}
              >
                <ArrowDown aria-hidden="true" size={16} />
              </button>
              <button type="button" className="mm-icon mm-icon--edit" onClick={() => onEdit(item)} disabled={busy} aria-label={`Ubah ${item.name}`}>
                <Pencil aria-hidden="true" size={16} />
              </button>
            </div>
          </li>
        ))}
        <li>
          <button type="button" className="mm-add" onClick={onAdd} disabled={busy}>
            <span className="mm-add-plus" aria-hidden="true">
              <Plus size={20} strokeWidth={3} />
            </span>
            Tambah menu di {section.name}
          </button>
        </li>
      </ul>

      {archived.length > 0 && (
        <details className="mm-archived-items">
          <summary>{archived.length} menu diarsipkan</summary>
          <ul>
            {archived.map((item) => (
              <li key={item.sku}>
                <span>{item.name}</span>
                <button type="button" className="kasir-chip" disabled={busy} onClick={() => onEdit(item)}>
                  <Pencil aria-hidden="true" size={15} /> Buka
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function SectionForm({ section, busy, onSave, onCancel }: { section: AdminSection | null; busy: boolean; onSave: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(section?.name ?? "");
  return (
    <form
      className="kasir-dialog"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) onSave(name.trim());
      }}
    >
      <p className="eyebrow">{section ? "Ganti nama section" : "Section baru"}</p>
      <h2 id="mm-editor-title" className="kasir-dialog-title">
        {section ? `Ubah "${section.name}"` : "Kelompok menu apa yang mau ditambah?"}
      </h2>
      <div className="qo-field">
        <label htmlFor="mm-section-name">Nama section</label>
        <input id="mm-section-name" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} placeholder="mis. Minuman Dingin, Cemilan" required autoFocus />
      </div>
      <p className="kasir-muted kasir-small">Section tampil sebagai tombol kategori di halaman pesan, sesuai urutan di sini.</p>
      <div className="kasir-row">
        <button type="submit" className="qo-btn qo-btn--red" disabled={busy || !name.trim()}>
          {busy ? "Menyimpan…" : section ? "Simpan nama" : "Buat section"}
        </button>
        <button type="button" className="qo-btn qo-btn--outline" onClick={onCancel}>
          Batal
        </button>
      </div>
    </form>
  );
}

interface ItemValues {
  sectionId: string;
  name: string;
  description: string | null;
  price: number | null;
  image: string | null;
  available?: boolean;
}

interface Upload {
  url: string;
  label: string | null;
}

const MAX_SIDE = 900;

/** Kecilkan foto di browser (sisi terpanjang 900 px, WebP; JPEG bila browser tidak bisa WebP). */
async function shrinkPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Format foto tidak bisa dibaca. Coba foto JPG atau PNG.");
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  const webp = await encode("image/webp");
  // Safari lama mengembalikan PNG saat diminta WebP; pakai JPEG agar tetap kecil.
  const blob = webp && webp.type === "image/webp" ? webp : await encode("image/jpeg");
  if (!blob) throw new Error("Foto gagal diproses.");
  return blob;
}

interface ItemFormProps {
  outlet: string;
  uploads: Upload[];
  onUploaded: (upload: Upload) => void;
  sections: AdminSection[];
  sectionId: string;
  item: AdminItem | null;
  busy: boolean;
  onSave: (values: ItemValues) => void;
  onCancel: () => void;
  onArchive?: () => void;
}

function ItemForm({ outlet, uploads, onUploaded, sections, sectionId, item, busy, onSave, onCancel, onArchive }: ItemFormProps) {
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [priceText, setPriceText] = useState(item?.price ? String(item.price) : "");
  const [image, setImage] = useState<string | null>(item?.image ?? null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    if (!file.type.startsWith("image/")) {
      setUploadError("Pilih file foto (JPG, PNG, atau WebP).");
      return;
    }
    setUploading(true);
    try {
      const blob = await shrinkPhoto(file);
      const label = encodeURIComponent((name || file.name).slice(0, 80));
      const response = await fetch(`/api/kasir/menu-images?outlet=${outlet}&label=${label}`, {
        method: "POST",
        headers: { "content-type": blob.type },
        body: blob,
        credentials: "same-origin",
      });
      const body = (await response.json().catch(() => null)) as { url?: string; error?: { message?: string } } | null;
      if (!response.ok || !body?.url) throw new Error(body?.error?.message ?? "Foto gagal diunggah. Coba lagi.");
      onUploaded({ url: body.url, label: name || file.name });
      setImage(body.url);
    } catch (failure) {
      setUploadError(failure instanceof Error ? failure.message : "Foto gagal diunggah. Coba lagi.");
    } finally {
      setUploading(false);
    }
  }
  const [section, setSection] = useState(sectionId);
  const [available, setAvailable] = useState(item?.available ?? true);

  const digits = priceText.replace(/\D/g, "");
  const price = digits ? Number(digits) : null;
  const priceInvalid = price !== null && (price < 1 || price > 10_000_000);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || priceInvalid) return;
    onSave({
      sectionId: section,
      name: name.trim(),
      description: description.trim() || null,
      price,
      image,
      ...(item ? { available } : {}),
    });
  }

  return (
    <form className="kasir-dialog mm-form" onSubmit={submit}>
      <p className="eyebrow">{item ? "Ubah menu" : "Menu baru"}</p>
      <h2 id="mm-editor-title" className="kasir-dialog-title">
        {item ? item.name : "Tambah menu baru"}
      </h2>

      <div className="mm-form-grid">
        <div>
          <div className="qo-field">
            <label htmlFor="mm-name">Nama menu</label>
            <input id="mm-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} required placeholder="mis. Es Kopi Gula Aren" />
          </div>
          <div className="qo-field">
            <label htmlFor="mm-price">Harga</label>
            <div className="mm-price-input">
              <span aria-hidden="true">Rp</span>
              <input
                id="mm-price"
                inputMode="numeric"
                value={digits ? Number(digits).toLocaleString("id-ID") : ""}
                onChange={(event) => setPriceText(event.target.value)}
                placeholder="25.000"
                aria-describedby="mm-price-hint"
                aria-invalid={priceInvalid}
              />
            </div>
            <p id="mm-price-hint" className="qo-hint">
              {priceInvalid ? "Harga harus antara Rp1 dan Rp10.000.000." : "Kosongkan bila harga belum ditetapkan: menu tampil, tetapi belum bisa dipesan lewat QR."}
            </p>
          </div>
          <div className="qo-field">
            <label htmlFor="mm-desc">
              Deskripsi singkat <span className="qo-optional">(opsional)</span>
            </label>
            <textarea id="mm-desc" rows={2} maxLength={200} value={description} onChange={(event) => setDescription(event.target.value)} />
            <p className="qo-hint">{description.length}/200 · Tulis yang memang benar tentang menunya.</p>
          </div>
          <div className="qo-field">
            <label htmlFor="mm-section">Section</label>
            <select id="mm-section" value={section} onChange={(event) => setSection(event.target.value)}>
              {sections.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </div>
          {item && (
            <label className="mm-check">
              <input type="checkbox" checked={available} onChange={(event) => setAvailable(event.target.checked)} /> Tersedia hari ini
            </label>
          )}
        </div>

        <div>
          <fieldset className="qo-field mm-photos">
            <legend>Foto</legend>
            <div className="mm-photo-grid">
              <label className={`mm-photo ${image === null ? "is-on" : ""}`}>
                <input type="radio" name="mm-photo" checked={image === null} onChange={() => setImage(null)} />
                <span className="mm-photo-none">
                  <ImageOff aria-hidden="true" size={20} />
                </span>
                <span className="sr-only">Tanpa foto</span>
              </label>
              <label className={`mm-photo mm-photo-upload ${uploading ? "is-busy" : ""}`}>
                <input type="file" accept="image/jpeg,image/png,image/webp,image/*" disabled={uploading || busy} onChange={(event) => void upload(event.target.files?.[0])} />
                <ImagePlus aria-hidden="true" size={22} />
                <span className="mm-photo-upload-text">{uploading ? "Mengunggah…" : "Unggah"}</span>
              </label>
              {uploads.map((photo) => (
                <label key={photo.url} className={`mm-photo ${image === photo.url ? "is-on" : ""}`}>
                  <input type="radio" name="mm-photo" checked={image === photo.url} onChange={() => setImage(photo.url)} />
                  <MenuPhoto src={photo.url} alt="" sizes="56px" />
                  <span className="sr-only">Foto unggahan {photo.label ?? ""}</span>
                </label>
              ))}
              {MENU_IMAGES.map((photo) => (
                <label key={photo.url} className={`mm-photo ${image === photo.url ? "is-on" : ""}`}>
                  <input type="radio" name="mm-photo" checked={image === photo.url} onChange={() => setImage(photo.url)} />
                  <Image src={photo.url} alt="" width={1086} height={1448} sizes="56px" />
                  <span className="sr-only">{photo.label}</span>
                </label>
              ))}
            </div>
            <p className="qo-hint" role="status" aria-live="polite">
              {uploadError ?? "Unggah foto asli menu (dikecilkan otomatis). Foto dengan latar polos terlihat paling rapi."}
            </p>
          </fieldset>

          <p className="mm-preview-label">Pratinjau di halaman pesan</p>
          <div className="qo-card mm-preview" aria-hidden="true">
            <div className="qo-card-media">
              {image ? <MenuPhoto src={image} alt="" sizes="96px" /> : <span>{(name || "?").charAt(0)}</span>}
            </div>
            <div className="qo-card-text">
              <p className="qo-card-name">{name || "Nama menu"}</p>
              {description && <p className="qo-card-desc">{description}</p>}
              <p className="qo-card-price tabular">{price === null ? "Harga tanya kasir" : formatPrice(price)}</p>
            </div>
            <span className="qo-add">{price === null ? "Di kasir" : "+ Tambah"}</span>
          </div>
        </div>
      </div>

      <div className="kasir-row">
        <button type="submit" className="qo-btn qo-btn--red" disabled={busy || !name.trim() || priceInvalid}>
          {busy ? "Menyimpan…" : item ? "Simpan perubahan" : "Tambahkan menu"}
        </button>
        <button type="button" className="qo-btn qo-btn--outline" onClick={onCancel}>
          Batal
        </button>
        {onArchive && item && (
          <button type="button" className="qo-btn qo-btn--ghost mm-archive-btn" onClick={onArchive} disabled={busy}>
            {item.active ? (
              <>
                <Archive aria-hidden="true" size={16} /> Arsipkan menu
              </>
            ) : (
              <>
                <ArchiveRestore aria-hidden="true" size={16} /> Tampilkan lagi
              </>
            )}
          </button>
        )}
      </div>
    </form>
  );
}
