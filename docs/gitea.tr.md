# Gitea Bağlantısı

commit-grapher, Gitea meta verilerini (repolar, branch'ler, PR'lar, commit'ler) Gitea API v1 üzerinden okur.
Kod asla klonlanmaz. Herhangi bir self-hosted Gitea örneğiyle (ve Codeberg ile — kendi rehberine bakın) çalışır.

## Token oluşturma

1. **Gitea → Settings → Applications → Generate New Token**.
2. Kapsamlar: **`read:repository`** (organizasyon repolarını dahil etmek için **`read:organization`** ekleyin). Kopyalayın.
3. commit-grapher içinde → sağlayıcı **Gitea**:
   - **username** = **kullanıcı veya organizasyon** adınız.
   - **owner_url** = örneğiniz + owner (self-hosted için **zorunlu**), ör.
     `https://git.acme.com/team`.
   - Token'ı yapıştırın.

Token, `Authorization: token …` header'ı olarak gönderilir ve işletim sisteminizin anahtarlığında (keychain) saklanır.

## Neler senkronize edilir

- Kullanıcının/organizasyonun sahibi olduğu repolar, branch'leri, pull request'leri (tüm durumlar), commit'leri ve tag'leri.
- Örnek (instance) sunduğunda yıldızlar ve dil bilgisi yakalanır.

## Sorun Giderme

| Belirti | Sebep | Çözüm |
|---|---|---|
| 0 repo | Yanlış owner, veya token'da kapsam eksik | `owner_url`'i kontrol edin; `read:repository` ekleyin (organizasyonlar için + `read:organization`) |
| `401` | Token geçersiz/süresi dolmuş | Settings → Applications altında yeniden oluşturun |

## Not

Codeberg, barındırılan bir Gitea'dır — aynı adaptörü kullanır. Bkz. **[codeberg.tr.md](codeberg.tr.md)**.
