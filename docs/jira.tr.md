# Jira Bağlantısı

Jira, sürüm kontrolünüzden **ayrı bir platformdur** — kod değil, issue/görev tutar.
commit-grapher **yalnızca Jira issue meta verilerini** (key, summary, type, status, labels, assignee) okur
ve ardından **her issue'yu commit'lerinize, PR'larınıza ve branch'lerinize ilişkilendirir** ki grafikte birbirlerine bağlansınlar.

## API token oluşturma

1. **[id.atlassian.com → Security → API tokens](https://id.atlassian.com/manage-profile/security/api-tokens)** adresine gidin.
2. **Create API token**, ona bir etiket verin, değeri kopyalayın.
3. commit-grapher içinde → sağlayıcı **Jira**:
   - **username = Atlassian hesap e-postanız** (giriş e-postası).
   - **owner_url = siteniz**, ör. `https://your-site.atlassian.net` (**zorunlu** — varsayılan yoktur).
   - API token'ı yapıştırın.

Kimlik doğrulama HTTP Basic'tir (e-posta + token). Token, diske değil, işletim sisteminizin anahtarlığında (keychain) saklanır.

## Issue'lar git ile nasıl eşleştirilir

En iyisi önce olmak üzere iki sinyal:

1. **Issue key (tam eşleşme).** Bir **commit mesajında**, **PR başlığında** veya
   **branch adında** görünen `ABC-123` gibi bir key, o issue'yu ilgili artefakta bağlar — Jira Smart Commits ile aynı kural.
   Yalnızca öneki gerçek bir Jira projesi olan *ve* tam key'i bilinen bir issue olan key'ler sayılır, böylece
   `UTF-8` / `COVID-19` asla yanlış eşleşmez.
2. **Başlık (bulanık/fuzzy).** Hiçbir key yoksa, issue özeti PR başlıklarıyla ve branch
   adlarıyla normalize edilmiş kelime örtüşmesine göre karşılaştırılır (Jaccard ≥ 0.6, stopword'ler ayıklanır) — key hiç yazılmadan
   bir insanın kurduğu bağlantıları yakalar.

Bağlantılar her senkronizasyondan sonra otomatik olarak yeniden oluşturulur; `POST /api/match` isteğini manuel olarak da tetikleyebilirsiniz.
Grafikte **Jira hesabını** seçtiğinizde, eşleşen her issue ile bağlandığı PR / branch / repo görünür.

## Neler senkronize edilir

- **Son 365 günde** güncellenen issue'lar (gelişmiş Jira araması sınırlı bir sorgu gerektirir),
  en yeniden başlayarak, ~2000 ile sınırlı. Daha eski issue'lara ihtiyacınız varsa `adapter.py` (`JIRA_JQL`) içindeki pencereyi genişletin.
- Yorum, açıklama, ek dosya veya worklog yok — yalnızca başlıklar ve etiketler.

## Sorun Giderme

| Belirti | Sebep | Çözüm |
|---|---|---|
| `Site temporarily unavailable` (404) | `owner_url` site adı yanlış | Tam sitenizi kullanın, ör. `https://acme.atlassian.net` — giriş yaptığınız URL'yi kontrol edin |
| `401 Unauthorized` | Yanlış e-posta, veya iptal edilmiş/süresi dolmuş bir token | username **Atlassian e-postası** olmalıdır; API token'ını yeniden oluşturun |
| `/search` üzerinde `410 Gone` | Eski Jira arama API'si Atlassian tarafından kullanımdan kaldırıldı | Zaten ele alındı — commit-grapher gelişmiş `/search/jql` endpoint'ini kullanır |
| `Unbounded JQL not allowed` (400) | Gelişmiş arama açık uçlu sorguları reddeder | Zaten ele alındı — sorgu yakın bir zaman penceresiyle sınırlıdır |
| Issue'lar senkronize oluyor ama hiçbir şey bağlanmıyor | Commit'leriniz/PR'larınız issue key'lerine referans vermiyor | Commit mesajlarına / branch adlarına `ABC-123` koyun, veya bulanık başlık eşleşmesine güvenin |

## Site URL'nizi bulma

Giriş yaptığınız host'tur: **`https://<site>.atlassian.net`**. Organizasyon yöneticileri bunu
**admin.atlassian.com → organizasyonunuz → Products** altında doğrulayabilir.
