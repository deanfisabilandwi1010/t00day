"use client";

/**
 * Nudge Supabase Realtime (opsional). Database mengirim broadcast berisi angka versi saja ke topic
 * "tooday-feed:<outlet>" (lihat migration). Klien hanya memakainya sebagai tanda untuk mengambil
 * snapshot baru lewat API; tidak ada data pesanan yang lewat kanal ini.
 *
 * Aktif hanya bila NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (atau anon key lama) diisi. Tanpa itu,
 * polling di useFeed tetap menjaga sinkronisasi.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Publishable key (sb_publishable_…) menggantikan anon key lama; keduanya aman berada di browser.
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const realtimeConfigured = Boolean(url && anonKey);

export function subscribeFeedNudge(outlet: string, onNudge: () => void): () => void {
  if (!url || !anonKey) return () => {};
  let disposed = false;
  let cleanup = () => {};
  void import("@supabase/supabase-js").then(({ createClient }) => {
    if (disposed) return;
    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const channel = client
      .channel(`tooday-feed:${outlet}`, { config: { private: false } })
      .on("broadcast", { event: "feed" }, () => onNudge())
      .subscribe((status) => {
        // Saat (re)subscribe berhasil, ambil snapshot agar tidak ada perubahan yang terlewat di celahnya.
        if (status === "SUBSCRIBED") onNudge();
      });
    cleanup = () => {
      void client.removeChannel(channel);
    };
  });
  return () => {
    disposed = true;
    cleanup();
  };
}
