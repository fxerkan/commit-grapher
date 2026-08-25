# Azure DevOps Bağlantısı

commit-grapher, Azure DevOps Git meta verilerini (commit'ler, branch'ler, PR'lar) REST API üzerinden okur. Kod asla klonlanmaz.

## Personal Access Token Oluşturma

1. Organizasyonunuza giriş yapın: `https://dev.azure.com/{org}` (veya eski `https://{org}.visualstudio.com`).
2. **User settings** (sağ üst) → **Personal access tokens** → **New Token**.
3. **Organization**: istediğiniz organizasyonu seçin (bir PAT tek bir organizasyona kapsamlıdır).
4. **Scopes**: **Code → Read**.
5. Oluşturun ve token'ı kopyalayın.
6. commit-grapher içinde → sağlayıcı **Azure DevOps** → **username = organizasyon adı** → token'ı yapıştırın.
   - Yeni URL biçimi: `owner_url` alanını boş bırakın (varsayılan `https://dev.azure.com/{org}`).
   - Eski VSTS biçimi: `owner_url` alanını `https://{org}.visualstudio.com` olarak ayarlayın.

## ⚠️ Lisanslama — 1 numaralı tuzak

Repoları okumak **Basic** (veya üzeri) erişim seviyesi gerektirir. **Stakeholder** lisansı **Code okuyamaz**, bu nedenle **organizasyon sahibi** olsanız bile API oturum açmaya yönlendirir / 401 döndürür.

Çözüm (organizasyon sahibi): **Organization Settings → Users** → erişim seviyenizi **Basic** olarak ayarlayın (Basic, ilk 5 kullanıcı için ücretsizdir).

## Sorun Giderme

| Belirti | Sebep | Çözüm |
|---|---|---|
| `302 → _signin` / Entra'ya yönlendirme | PAT reddedildi — boş/geçersiz, ya Stakeholder lisansı, ya da organizasyon PAT/temel kimlik doğrulamayı engelliyor | Geçerli bir **Code: Read** PAT kullanın; **Basic** seviyesine yükseltin; organizasyon PAT politikasını kontrol edin |
| `401 Unauthorized` | PAT başka bir organizasyona ait veya organizasyon adı yanlış | username, PAT'a sahip olan organizasyon olmalıdır |
| Organizasyonda 0 Git reposu var | Projeler Git değil Boards/TFVC kullanıyor | Yalnızca Git repoları senkronize edilir (repoları olan projeler için Boards **work item**'ları da çekilir) |

## Organizasyon adınızı bulma

**Organization Settings → Overview → Name**, ya da `dev.azure.com/{org}` içindeki ilk yol segmenti.
