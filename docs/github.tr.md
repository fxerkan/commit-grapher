# GitHub Bağlantısı

commit-grapher yalnızca meta verileri (commit'ler, branch'ler, PR'lar) GitHub REST API üzerinden okur. Kodunuz asla klonlanmaz.

## Seçenek A — Classic Personal Access Token (organizasyonlar için önerilir)

**Classic** token, **organizasyon** ve **özel (private)** repoları dahil etmenin en güvenilir yoludur.

1. **https://github.com/settings/tokens** adresine gidin → *Generate new token (classic)*.
2. Kapsamlar (scopes): **`repo`** ve **`read:org`** (ya da `user`) seçeneklerini işaretleyin.
3. Token'ı oluşturun ve kopyalayın (`ghp_` ile başlar).
4. commit-grapher içinde → **Accounts** (veya onboarding sihirbazı) → sağlayıcı **GitHub** → kullanıcı adınız → token'ı yapıştırın → **Add** → **Sync**.

Bu, hem kişisel repolarınızı **hem de** üyesi olduğunuz tüm organizasyonları çeker (uygulama `/user/orgs` ve her organizasyonun repolarını numaralandırır).

## Seçenek B — Fine-grained token

Fine-grained token'lar (`github_pat_…`) kişisel repolar için çalışır, ancak **ilgili organizasyon token'ı onaylayana kadar o organizasyonun repolarını göremez**:

- Organizasyon sahibi *Settings → Third-party Access → Personal access tokens* seçeneğini etkinleştirmeli ve siz token'ı oluştururken organizasyona erişim talep etmelisiniz.
- Onay olmadan yalnızca kişisel repolarınız görünür (bu bir hata değil, bir GitHub kısıtlamasıdır).

Gerekli fine-grained izinleri: **Contents: Read**, **Metadata: Read**, **Pull requests: Read**.

## Seçenek C — OAuth device flow (token gerektirmez)

**Accounts** sekmesinde **Login with GitHub** seçeneğini kullanın. Bir kez bir GitHub OAuth App kaydedin (*Enable Device Flow* işaretli olacak şekilde), Client ID'sini yapıştırın ve kodla yetkilendirin. `repo` kapsamını verir, dolayısıyla özel repolar da dahil edilir.

## Sorun Giderme

| Belirti | Sebep | Çözüm |
|---|---|---|
| Yalnızca genel (public) repolar senkronize edildi | Organizasyon onayı olmayan fine-grained token | `repo` + `read:org` kapsamlı classic token kullanın veya organizasyon onayı alın |
| `Bad credentials (401)` | Token geçersiz/süresi dolmuş veya bir GitHub token'ı değil | Yeniden oluşturun; classic token'lar `ghp_`, fine-grained token'lar `github_pat_` ile başlar |
| Bir repo atlandı | Boş repo (GitHub commit'lerde 409 döndürür) | Beklenen durum — boş repolarda commit yoktur |
| Bir organizasyon eksik | Üye değilsiniz veya token'da `read:org` yok | Organizasyona katılın / `read:org` kapsamını ekleyin |
