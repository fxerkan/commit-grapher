# Bitbucket Bağlantısı

commit-grapher, Bitbucket Cloud Git meta verilerini (repolar, branch'ler, PR'lar, commit'ler)
REST v2 API üzerinden okur. Kod asla klonlanmaz.

## Kimlik bilgisi edinme (işin zor kısmı bu)

Bitbucket Cloud'da birkaç token türü vardır ve bunlar birbirinin yerine **kullanılamaz**. Planınızın
izin verdiğine göre seçin:

**⚠️ Bunu değil:** `admin.atlassian.com → API keys` (*organizasyon* yönetici anahtarları). Bunlar yalnızca
`*:admin` organizasyon yönetimi kapsamlarını (hesaplar, gruplar, alan adları) taşır — **hiçbir Bitbucket kapsamı yoktur** — ve
Bitbucket API'sine karşı 401 döndürür. Düz bir Jira API token'ı da 401 döndürür (Bitbucket kapsamları yoktur).

**Seçenek A — Bitbucket kapsamlarına sahip Personal API token** (ücretsiz, workspace genelinde):
1. **[id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)** adresine gidin
   (*kişisel* token'larınız — yukarıdaki organizasyon yönetici sayfası **değil**).
2. **Create API token with scopes** → **Bitbucket**'i seçin ve `read:repository:bitbucket`,
   `read:pullrequest:bitbucket`, `read:workspace:bitbucket` seçeneklerini işaretleyin.
3. commit-grapher içinde: **username = Atlassian e-postanız**, **owner_url = `https://bitbucket.org/<workspace>`**.

Kapsam seçici hesabınız için bir Bitbucket uygulaması sunmuyorsa, Seçenek B'yi kullanın.

**Seçenek B — Repository access token** (ücretsiz, ancak tek seferde bir repo):
Repo → **Repository settings → Access tokens → Create** (kapsamlar: *Repositories: Read*,
*Pull requests: Read*). commit-grapher içinde: **username alanını boş bırakın** (token Bearer token olarak kimlik doğrular),
**owner_url = reponun workspace'i**. Bunun yalnızca o tek repoyu gördüğünü unutmayın.

**Seçenek C — Workspace access token** (**yalnızca Premium**): Workspace settings → Access tokens.
B ile aynı, ancak tüm workspace'i kapsar. username alanını boş bırakın.

App password'ler kullanımdan kaldırıldı, bu yüzden artık bir seçenek değiller.

Kimlik doğrulama: username verildiğinde Basic (e-posta + API token), boş bırakıldığında Bearer (access token).
Token, diske değil, işletim sisteminizin anahtarlığında (keychain) saklanır.

## Neler senkronize edilir

- Workspace'teki tüm repolar, branch'leri, pull request'leri (tüm durumlar) ve commit'leri
  (varsayılan branch tam olarak + diğer branch'ler yüzeysel/shallow, diğer sağlayıcılarla aynı şekilde).
- Tag'ler, tag filtresini ve kelime bulutunu (word cloud) besler.
- Yıldız/fork yok (Bitbucket'ta bunlar yoktur); repo bir dil beyan ettiğinde dil bilgisi yakalanır.

## Sorun Giderme

| Belirti | Sebep | Çözüm |
|---|---|---|
| `401 Unauthorized` | Organizasyon **admin** API anahtarı, yalnızca Jira'ya ait bir token veya app password (kullanımdan kaldırıldı) | **Bitbucket kapsamlarına sahip** bir token (Seçenek A) veya bir access token (Seçenek B/C) kullanın; `admin.atlassian.com` anahtarını değil |
| Bazı repolarda `403 Forbidden` | Token'ın özel bir repoya erişimi yok | Erişim verin, ya da o repo basitçe atlanır (tarama repo bazında dayanıklıdır) |
| Workspace'te 0 repo var | `owner_url` içinde yanlış workspace | Tam workspace'i kullanın: `https://bitbucket.org/<workspace>` |

## Workspace'inizi bulma

Repo URL'lerinizde `bitbucket.org/` sonrasında gelen segmenttir, ya da **Workspace settings → Overview**.
