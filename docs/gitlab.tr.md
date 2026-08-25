# GitLab Bağlantısı

commit-grapher, GitLab meta verilerini (projeler, branch'ler, merge request'ler, commit'ler)
REST v4 API üzerinden okur. Kod asla klonlanmaz. gitlab.com ve kendi sunucunuzda barındırılan (self-hosted) GitLab ile çalışır.

## Erişim token'ı oluşturma

1. **GitLab → Preferences → Access Tokens** (`/-/user_settings/personal_access_tokens`).
2. **`read_api`** kapsamına sahip bir token ekleyin; kopyalayın.
3. commit-grapher içinde → sağlayıcı **GitLab**:
   - **username** = **kullanıcı veya grup** namespace'iniz (ör. `alice` veya `acme-team`).
   - **owner_url** varsayılan olarak `https://gitlab.com/<namespace>` şeklindedir; self-hosted için kendi host'unuza ayarlayın
     (ör. `https://gitlab.acme.com/team`).
   - Token'ı yapıştırın.

Token, `PRIVATE-TOKEN` header'ı olarak gönderilir ve diske değil, işletim sisteminizin anahtarlığında (keychain) saklanır.

## Neler senkronize edilir

- Namespace'teki tüm projeler (bir grup, kendi **alt gruplarını (subgroups)** da içerir), branch'leri,
  merge request'leri (tüm durumlar), commit'leri ve tag'leri.
- Merge request'ler PR'lara eşlenir; `opened`→open, `merged`→merged.

## Sorun Giderme

| Belirti | Sebep | Çözüm |
|---|---|---|
| 0 proje | Namespace ne eşleşen bir kullanıcı ne de grup, veya token bunları göremiyor | Namespace'i kontrol edin; `read_api` kapsamı; özel gruplar için token sahibi üye olmalıdır |
| `401` | Token geçersiz/süresi dolmuş veya host yanlış | `read_api` ile yeniden oluşturun; `owner_url`'i doğru self-hosted host'a ayarlayın |

## Namespace'inizi bulma

Proje URL'lerinizde host'tan sonra gelen segmenttir: `gitlab.com/<namespace>/<project>`.
