# Codeberg Bağlantısı

Codeberg **Gitea** çalıştırır, bu nedenle commit-grapher onu Gitea API v1 üzerinden okur (repolar, branch'ler,
PR'lar, commit'ler). Kod asla klonlanmaz.

## Token oluşturma

1. **Codeberg → Settings → Applications → Generate New Token**
   (`https://codeberg.org/user/settings/applications`).
2. Kapsamlar: **`read:repository`** (organizasyon repoları için + **`read:organization`**). Kopyalayın.
3. commit-grapher içinde → sağlayıcı **Codeberg**:
   - **username** = **kullanıcı veya organizasyon** adınız.
   - **owner_url** varsayılan olarak `https://codeberg.org/<username>` şeklindedir.
   - Token'ı yapıştırın.

Token, diske değil, işletim sisteminizin anahtarlığında (keychain) saklanır.

## Neler senkronize edilir

Owner'a ait repolar, branch'ler, pull request'ler (tüm durumlar), commit'ler ve tag'ler. Genel (public) repolar
token olmadan okunabilir; özel veya organizasyon repolarını dahil etmek için bir token ekleyin.

## Sorun Giderme

| Belirti | Sebep | Çözüm |
|---|---|---|
| 0 repo | Yanlış owner veya eksik kapsam | Kullanıcı adını kontrol edin; `read:repository` ekleyin (+ `read:organization`) |
| `401` | Token geçersiz/süresi dolmuş | Settings → Applications altında yeniden oluşturun |

Self-hosted Gitea örnekleri için **[Gitea rehberini](gitea.tr.md)** kullanın ve `owner_url`'i kendi host'unuza ayarlayın.
