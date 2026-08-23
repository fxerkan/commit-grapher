// Tiny i18n: English strings are the keys (so English needs no dictionary and is the
// fallback), Turkish is an override map. t() reads the current language from the settings
// store; useT() subscribes so components re-render when the language changes. {vars} interpolate.
import { getSettings, useSettings, Lang } from "./settings";

export const LANGS: [Lang, string][] = [["en", "English"], ["tr", "Türkçe"]];

const TR: Record<string, string> = {
  // ---- nav / shell ----
  "Network Graph": "Ağ Grafiği",
  "Contribution Heatmap": "Katkı Isı Haritası",
  "Stats": "İstatistikler",
  "Contributors": "Katkıda Bulunanlar",
  "Settings": "Ayarlar",
  "Add account": "Hesap ekle",
  "Dark": "Koyu",
  "Light": "Açık",
  "Loading…": "Yükleniyor…",
  "Toggle theme": "Temayı değiştir",
  "Language": "Dil",

  // ---- filter dimensions (shared across pages) ----
  "Provider": "Sağlayıcı",
  "Account": "Hesap",
  "Organization": "Organizasyon",
  "Workspace": "Çalışma Alanı",
  "Repository": "Depo",
  "Branch": "Dal",
  "Pull request": "Pull Request",
  "Author": "Yazar",
  "Library / Framework": "Kütüphane / Çerçeve",
  "AI agent": "YZ Ajanı",
  "All providers": "Tüm sağlayıcılar",
  "All accounts": "Tüm hesaplar",
  "All organizations": "Tüm organizasyonlar",
  "All orgs": "Tüm org’lar",
  "All workspaces": "Tüm çalışma alanları",
  "All repositories": "Tüm depolar",
  "All repos": "Tüm depolar",
  "All branches": "Tüm dallar",
  "All PRs": "Tüm PR’lar",
  "All authors": "Tüm yazarlar",
  "All languages": "Tüm diller",
  "All libraries": "Tüm kütüphaneler",
  "All agents": "Tüm ajanlar",

  // ---- filter panel chrome ----
  "Filters": "Filtreler",
  "Date range": "Tarih aralığı",
  "clear all": "tümünü temizle",
  "ACTIVE": "ETKİN",
  "remove filter": "filtreyi kaldır",
  "collapse": "daralt",
  "Only my activity": "Yalnızca benim etkinliğim",
  "my names, comma-separated": "adlarım, virgülle ayrılmış",

  // ---- graph controls ----
  "Node types": "Düğüm türleri",
  "Show relationship arrows": "İlişki oklarını göster",
  "Reset filters": "Filtreleri sıfırla",
  "repo / PR / commit…": "depo / PR / commit…",
  "Search any node": "Herhangi bir düğümü ara",
  "SEARCH ANY NODE": "HERHANGİ BİR DÜĞÜMÜ ARA",
  "CONTRIBUTORS": "KATKIDA BULUNANLAR",
  "All": "Tümü",
  "Human": "İnsan",
  "AI": "YZ",
  "Accounts": "Hesaplar",
  "Repos": "Depolar",
  "Branches": "Dallar",
  "PRs": "PR’lar",
  "Commits": "Commit’ler",
  "Work items": "İş öğeleri",
  "Work item": "İş öğesi",
  "Repo": "Depo",
  "Commit": "Commit",
  "AI Agent": "YZ Ajanı",
  "account": "hesap",
  "repo": "depo",
  "branch": "dal",
  "commit": "commit",
  "Drag nodes · scroll to zoom · click a repo to focus": "Düğümleri sürükle · yakınlaştırmak için kaydır · odaklanmak için bir depoya tıkla",

  // ---- Settings page ----
  "Reset to defaults": "Varsayılanlara sıfırla",
  "Reset all preferences to defaults? (accounts are kept)": "Tüm tercihler varsayılana sıfırlansın mı? (hesaplar korunur)",
  "General": "Genel",
  "Appearance and what you see first.": "Görünüm ve ilk gördüğünüz şey.",
  "Theme": "Tema",
  "Accent color": "Vurgu rengi",
  "Used across buttons, links and highlights.": "Düğmeler, bağlantılar ve vurgularda kullanılır.",
  "reset": "sıfırla",
  "Open on launch": "Açılışta göster",
  "Which view loads when you start the app.": "Uygulamayı başlattığınızda hangi görünüm yüklenir.",
  "Interface language": "Arayüz dili",
  "Network graph — layout & animation": "Ağ grafiği — yerleşim & animasyon",
  "Physics of the force-directed layout. Changes apply on the next graph load or filter change.":
    "Kuvvet tabanlı yerleşimin fiziği. Değişiklikler bir sonraki grafik yüklemesinde veya filtre değişiminde uygulanır.",
  "Animation level": "Animasyon seviyesi",
  "How hard ForceAtlas2 works. Off keeps a fast static spread; High is prettiest but heavier.":
    "ForceAtlas2’nin ne kadar çalıştığı. Kapalı hızlı statik dağılım verir; Yüksek en güzelidir ama daha ağırdır.",
  "Off": "Kapalı",
  "Low": "Düşük",
  "Balanced": "Dengeli",
  "High": "Yüksek",
  "Gravity": "Yerçekimi",
  "Higher pulls nodes toward the center (tighter clusters).": "Yüksek değer düğümleri merkeze çeker (daha sıkı kümeler).",
  "Node spread": "Düğüm dağılımı",
  "ForceAtlas2 scaling ratio — higher spreads nodes farther apart.": "ForceAtlas2 ölçek oranı — yüksek değer düğümleri daha uzağa yayar.",
  "Label density": "Etiket yoğunluğu",
  "Lower shows more labels at once; higher declutters.": "Düşük değer daha çok etiket gösterir; yüksek değer sadeleştirir.",
  "Relationship arrows": "İlişki okları",
  "Draw directed arrows on edges by default.": "Kenarlarda varsayılan olarak yönlü oklar çiz.",
  "Node types shown by default": "Varsayılan gösterilen düğüm türleri",
  "Which node kinds are visible when the graph opens.": "Grafik açıldığında hangi düğüm türleri görünür.",
  "Default filters": "Varsayılan filtreler",
  "How the network graph is pre-filtered each time it opens.": "Ağ grafiğinin her açılışta nasıl ön filtrelendiği.",
  "Default provider": "Varsayılan sağlayıcı",
  "Authorship": "Yazarlık",
  "Show everyone, only humans, or only AI-agent commits.": "Herkesi, yalnızca insanları ya da yalnızca YZ ajanı commit’lerini göster.",
  "Humans": "İnsanlar",
  "Highlight only commits by your names below.": "Yalnızca aşağıdaki adlarınıza ait commit’leri vurgula.",
  "My names / emails": "Adlarım / e-postalarım",
  "Comma-separated — used by ‘only my activity’ and to gild your nodes.":
    "Virgülle ayrılmış — ‘yalnızca benim etkinliğim’ tarafından kullanılır ve düğümlerinizi yaldızlar.",
  "Fun facts": "Eğlenceli bilgiler",
  "Playful stats derived from your history.": "Geçmişinizden türetilen eğlenceli istatistikler.",
  "Show fun facts on the Stats page": "İstatistikler sayfasında eğlenceli bilgileri göster",
  "Night-owl commits, longest streak, busiest day, and friends.": "Gece kuşu commit’leri, en uzun seri, en yoğun gün ve dostları.",
  "Connect version-control and issue platforms. Tokens live in your OS keychain — never on disk, only git metadata is read.":
    "Sürüm kontrol ve iş takip platformlarını bağlayın. Token’lar işletim sistemi anahtarlığında saklanır — asla diske yazılmaz, yalnızca git meta verisi okunur.",
  "username / org / email": "kullanıcı adı / org / e-posta",
  "access token": "erişim token’ı",
  "owner_url (Azure/Jira/Bitbucket/self-hosted)": "owner_url (Azure/Jira/Bitbucket/kendi sunucunuz)",
  "Add": "Ekle",
  "Adding…": "Ekleniyor…",
  "…or log in with GitHub (OAuth device flow, no PAT)": "…veya GitHub ile giriş yapın (OAuth cihaz akışı, PAT gerekmez)",
  "Login with GitHub": "GitHub ile giriş yap",
  "No accounts yet.": "Henüz hesap yok.",
  "rename": "yeniden adlandır",
  "save": "kaydet",
  "Sync": "Eşitle",
  "Syncing…": "Eşitleniyor…",
  "Delete": "Sil",
  "Remove this account and its cached data?": "Bu hesap ve önbelleğe alınmış verileri kaldırılsın mı?",
  "Data — import, export & share": "Veri — içe/dışa aktar & paylaş",
  "Everything is local. Move it between machines or publish a public snapshot.":
    "Her şey yereldir. Makineler arasında taşıyın veya herkese açık bir anlık görüntü yayınlayın.",
  "Export all data": "Tüm veriyi dışa aktar",
  "Full backup (accounts, repos, branches, PRs, commits) as JSON.": "JSON olarak tam yedek (hesaplar, depolar, dallar, PR’lar, commit’ler).",
  "Import data": "Veri içe aktar",
  "Merge a previously exported JSON backup.": "Önceden dışa aktarılmış bir JSON yedeğini birleştir.",
  "Share / publish snapshot": "Anlık görüntüyü paylaş / yayınla",
  "Download a public-graph.json of your current network — the format the GitHub Pages hero renders.":
    "Mevcut ağınızın public-graph.json dosyasını indirin — GitHub Pages ana bölümünün işlediği biçim.",
  "Building…": "Oluşturuluyor…",
  "Public snapshot": "Herkese açık anlık görüntü",
  "Export JSON": "JSON dışa aktar",
  "Import JSON": "JSON içe aktar",

  // ---- page headers ----
  "people · click an avatar to drill in": "kişi · detaya inmek için bir avatara tıkla",

  // ---- Stats page (section + fun-fact titles) ----
  "KPI Cards": "Temel Göstergeler",
  "Languages, AI & Pulse": "Diller, YZ & Nabız",
  "Fun Facts": "Eğlenceli Bilgiler",
  "Repository Stats": "Depo İstatistikleri",
  "Dashboard Charts": "Pano Grafikleri",
  "The Essay — longest commit message": "Deneme — en uzun commit mesajı",
  "A long time ago, in a repo far, far away…": "Uzun zaman önce, çok çok uzak bir depoda…",
  "Far, far away — oldest open trail (PR)": "Çok uzakta — en eski açık iz (PR)",
  "Code Besties — most co-committed peers": "Kod Dostları — en çok birlikte commit atılan kişiler",
  "The Graveyard — R.I.P dormant repos": "Mezarlık — huzur içinde uyuyan atıl depolar",
  "Night Owl & Busy Day": "Gece Kuşu & Yoğun Gün",
  "No commits for these filters.": "Bu filtreler için commit yok.",
  "close": "kapat",
  "Tag": "Etiket",

  // ---- onboarding ----
  "Welcome to": "Hoş geldiniz:",
  "Connect one or more version-control accounts to see your commits as an interactive graph, heatmap and charts.":
    "Commit’lerinizi etkileşimli bir grafik, ısı haritası ve grafikler olarak görmek için bir veya daha fazla sürüm kontrol hesabı bağlayın.",
  "Connected {name}": "{name} bağlandı",
  "You can add several accounts (even multiple GitHub users / orgs).":
    "Birden çok hesap ekleyebilirsiniz (birden fazla GitHub kullanıcısı / org dahil).",
  "Add another account": "Başka bir hesap ekle",
  "Go to the app →": "Uygulamaya git →",
  "Choose a provider": "Bir sağlayıcı seçin",
  "Connect {name}": "{name} bağla",
  "personal access token": "kişisel erişim token’ı",
  "Connecting…": "Bağlanıyor…",
  "Connect & sync {name}": "{name} bağla & eşitle",
  "Note: {name} adapter is a preview — sync may not work yet.": "Not: {name} adaptörü önizlemedir — eşitleme henüz çalışmayabilir.",
  "Skip for now": "Şimdilik atla",
  "Only metadata is read — your code is never cloned. Tokens stay in your OS keychain.":
    "Yalnızca meta veri okunur — kodunuz asla kopyalanmaz. Token’lar işletim sistemi anahtarlığında kalır.",
  "ready": "hazır",
  "preview": "önizleme",
  "back": "geri",
  "→ Open {name} token page (scopes: {scopes})": "→ {name} token sayfasını aç (kapsamlar: {scopes})",
};

export function t(s: string, vars?: Record<string, string | number>): string {
  const lang = getSettings().language;
  let out = lang === "tr" ? (TR[s] ?? s) : s;
  if (vars) for (const k in vars) out = out.split(`{${k}}`).join(String(vars[k]));
  return out;
}

/** Live translator — the component re-renders when the language (or any setting) changes. */
export function useT(): typeof t {
  useSettings();
  return t;
}
